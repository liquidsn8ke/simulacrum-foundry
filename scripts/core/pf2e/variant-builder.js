// SPDX-License-Identifier: MIT
/* eslint-disable complexity -- data mapping: each optional override is a guard, which the complexity rule counts as a branch. */

/**
 * Variant builder: "Variant weak zealot of Asmodeus" in one step. Starts from an
 * official creature's data, bakes in the GM Core Weak / Elite adjustment, drops the
 * items the variant does not have, applies printed overrides, and adds the variant's
 * own gear, strikes, spells and abilities through the regular spec builders.
 *
 * Everything the variant does not touch keeps the official data and automation.
 * No Foundry globals: the base actor data and the compendium lookup are passed in
 * (unit-tested in tests/unit/pf2e-variant.test.mjs).
 */

import { clone, slugify, toHTML } from './text.js';
import { nameKey } from './compendium.js';
import { buildSpecItems, checkStrikeEffects } from './npc-builder.js';

/** Spec keys a variant accepts besides the regular item lists. */
export const VARIANT_SPEC_KEYS = Object.freeze([
  'base',
  'adjustment',
  'remove',
  'name',
  'level',
  'hp',
  'ac',
  'acDetails',
  'saves',
  'perception',
  'skills',
  'abilities',
  'traits',
  'speed',
  'languages',
  'img',
  'token',
  'blurb',
  'publicNotes',
  'privateNotes',
  'gear',
  'strikes',
  'spellcasting',
  'glossary',
  'actions',
  'lore',
  'set',
]);

/**
 * "1d6+4" shifted by -2 -> "1d6+2"; a formula without a flat part gets one appended.
 * @param {string} formula
 * @param {number} delta
 * @returns {string}
 */
export function shiftFormula(formula, delta) {
  const text = String(formula);
  const m = text.match(/^(.*?)([+-])\s*(\d+)\s*$/);
  if (!m) return delta ? `${text}${delta > 0 ? '+' : '-'}${Math.abs(delta)}` : text;
  const n = (m[2] === '-' ? -1 : 1) * Number(m[3]) + delta;
  return n === 0 ? m[1] : `${m[1]}${n > 0 ? '+' : '-'}${Math.abs(n)}`;
}

/**
 * Bake the GM Core Weak / Elite adjustment into actor data (mutates it): level, HP by
 * starting level, AC, saves, Perception, skills and lore, strike attack and damage, spell
 * DC and attack, and dc:N in ability text. Inline @Damage in abilities is reported, not changed.
 * @param {object} actor - actor source data with items
 * @param {"weak"|"elite"} kind
 * @param {string[]} warnings
 */
export function applyAdjustment(actor, kind, warnings) {
  const d = kind === 'elite' ? 1 : kind === 'weak' ? -1 : 0;
  if (!d) throw new Error('adjustment must be "weak" or "elite".');
  const s = actor.system;
  const level = Number(s.details.level.value);
  const hpStep = level <= 1 ? 10 : level <= 4 ? 15 : level <= 19 ? 20 : 30;
  s.details.level.value = level + (d < 0 ? (level === 1 ? -2 : -1) : level <= 0 ? 2 : 1);
  s.attributes.hp.max = Number(s.attributes.hp.max) + d * hpStep;
  s.attributes.hp.value = s.attributes.hp.max;
  const two = 2 * d;
  const bump = text => String(text ?? '').replace(/\d+/g, n => String(Number(n) + two));
  s.attributes.ac.value = Number(s.attributes.ac.value) + two;
  s.attributes.ac.details = bump(s.attributes.ac.details);
  for (const save of Object.values(s.saves ?? {})) save.value = Number(save.value) + two;
  s.perception.mod = Number(s.perception.mod) + two;
  for (const skill of Object.values(s.skills ?? {})) skill.base = Number(skill.base) + two;
  for (const item of actor.items ?? []) {
    const sys = item.system ?? {};
    if (item.type === 'lore' && sys.mod) sys.mod.value = Number(sys.mod.value) + two;
    if (item.type === 'melee') {
      sys.bonus.value = Number(sys.bonus.value) + two;
      const first = Object.values(sys.damageRolls ?? {}).find(r => !r.category);
      if (first) first.damage = shiftFormula(first.damage, two);
    }
    if (item.type === 'spellcastingEntry' && sys.spelldc) {
      sys.spelldc.dc = Number(sys.spelldc.dc) + two;
      sys.spelldc.value = Number(sys.spelldc.value) + two;
    }
    if (item.type === 'action' && sys.description?.value) {
      sys.description.value = sys.description.value.replace(
        /\bdc:(\d+)/g,
        (_, n) => `dc:${Number(n) + two}`
      );
      if (/@Damage\[/.test(sys.description.value)) {
        warnings.push(
          `"${item.name}" has inline damage that the ${kind} adjustment does not change: adjust it by ${two > 0 ? '+' : ''}${two} (${two * 2} if limited use) if the variant needs it.`
        );
      }
    }
  }
}

function setPath(obj, dotted, value) {
  const keys = dotted.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
}

/**
 * Check a variant spec.
 * @param {object} spec
 * @returns {string[]} errors
 */
export function checkVariantSpec(spec) {
  const errors = [];
  if (!spec?.base) errors.push('spec.base (uuid or name of the official creature) is required.');
  if (spec?.adjustment && !['weak', 'elite'].includes(spec.adjustment))
    errors.push('spec.adjustment must be "weak" or "elite".');
  const unknown = Object.keys(spec ?? {}).filter(k => !VARIANT_SPEC_KEYS.includes(k));
  if (unknown.length)
    errors.push(
      `Unknown variant keys: ${unknown.join(', ')}. Valid keys: ${VARIANT_SPEC_KEYS.join(', ')}.`
    );
  return errors;
}

/**
 * Drop the items the variant does not have (mutates actor.items). A spellcasting entry
 * the variant re-lists is dropped together with its spells, to be replaced.
 * @returns {object[]} the removed items
 */
function removeItems(actor, spec, warnings) {
  const drop = new Set((spec.remove ?? []).map(nameKey));
  for (const sc of spec.spellcasting ?? []) if (sc.name) drop.add(nameKey(sc.name));
  const droppedEntries = new Set(
    actor.items
      .filter(i => i.type === 'spellcastingEntry' && drop.has(nameKey(i.name)))
      .map(i => i._id)
  );
  const missing = (spec.remove ?? []).filter(
    n => !actor.items.some(i => nameKey(i.name) === nameKey(n))
  );
  if (missing.length)
    warnings.push(`remove: not on the base creature, nothing removed: ${missing.join(', ')}.`);
  const removed = actor.items.filter(
    i =>
      drop.has(nameKey(i.name)) ||
      (i.type === 'spell' && droppedEntries.has(i.system?.location?.value))
  );
  actor.items = actor.items.filter(i => !removed.includes(i));
  return removed;
}

/** Printed overrides, taken as printed: no adjustment is applied to them (mutates actor). */
function applyOverrides(actor, spec) {
  const s = actor.system;
  if (spec.name) actor.name = spec.name;
  if (spec.level !== undefined) s.details.level.value = Number(spec.level);
  if (spec.hp !== undefined) s.attributes.hp.max = s.attributes.hp.value = Number(spec.hp);
  if (spec.ac !== undefined) s.attributes.ac.value = Number(spec.ac);
  if (spec.acDetails !== undefined) s.attributes.ac.details = spec.acDetails;
  for (const [save, v] of Object.entries(spec.saves ?? {}))
    s.saves[save] = { ...(s.saves[save] ?? {}), value: Number(v) };
  if (spec.perception?.mod !== undefined) s.perception.mod = Number(spec.perception.mod);
  if (spec.perception?.senses) s.perception.senses = clone(spec.perception.senses);
  for (const [k, v] of Object.entries(spec.skills ?? {}))
    s.skills[slugify(k)] = { ...(s.skills[slugify(k)] ?? {}), base: Number(v) };
  for (const [k, v] of Object.entries(spec.abilities ?? {})) s.abilities[k] = { mod: Number(v) };
  if (spec.traits) s.traits.value = clone(spec.traits);
  if (spec.speed !== undefined) s.attributes.speed.value = Number(spec.speed);
  if (spec.languages) s.details.languages.value = clone(spec.languages);
  if (spec.img) actor.img = spec.img;
  if (spec.blurb !== undefined) s.details.blurb = spec.blurb;
  if (spec.publicNotes !== undefined) s.details.publicNotes = toHTML(spec.publicNotes);
  if (spec.privateNotes !== undefined) s.details.privateNotes = toHTML(spec.privateNotes);
}

/** Add the variant's own items after the base items, and tidy the focus pool. */
async function addVariantItems(actor, spec, lookup, warnings) {
  let sort = Math.max(0, ...actor.items.map(i => Number(i.sort) || 0));
  const nextSort = () => (sort += 100000);
  const resources = {};
  const added = await buildSpecItems(spec, {
    lookup,
    nextSort,
    warnings,
    resources,
    existing: actor.items,
  });
  actor.items.push(...added);
  const pool = (actor.system.resources ??= {});
  Object.assign(pool, resources);
  const hasFocusEntry = actor.items.some(
    i => i.type === 'spellcastingEntry' && i.system?.prepared?.value === 'focus'
  );
  if (!hasFocusEntry) delete pool.focus;
  checkStrikeEffects(actor.items, warnings);
}

/**
 * Build variant actor data.
 * @param {object} spec - see VARIANT_SPEC_KEYS
 * @param {object} baseData - the official actor's source data (toObject()), with items
 * @param {Function} lookup - see npc-builder buildCreatureData
 * @param {object} [options]
 * @param {string} [options.moduleId]
 * @param {string} [options.baseUuid]
 * @returns {Promise<{actor: object, warnings: string[], removed: string[]}>}
 */
export async function buildVariantData(spec, baseData, lookup, options = {}) {
  const { moduleId = 'simulacrum-pf2e', baseUuid = null } = options;
  const warnings = [];
  const actor = clone(baseData);
  for (const key of ['_id', 'folder', 'ownership', 'sort']) delete actor[key];
  actor.items = actor.items ?? [];
  if (spec.adjustment) applyAdjustment(actor, spec.adjustment, warnings);
  const removed = removeItems(actor, spec, warnings);
  applyOverrides(actor, spec);
  await addVariantItems(actor, spec, lookup, warnings);

  actor.prototypeToken = { ...(actor.prototypeToken ?? {}), name: actor.name };
  if (spec.token)
    actor.prototypeToken.texture = { ...(actor.prototypeToken.texture ?? {}), src: spec.token };
  for (const [path, value] of Object.entries(spec.set ?? {})) setPath(actor, path, value);
  actor.flags = {
    ...(actor.flags ?? {}),
    [moduleId]: { creatureSpec: clone(spec), variantOf: baseUuid },
  };
  return { actor, warnings, removed: removed.map(i => `${i.name} (${i.type})`) };
}

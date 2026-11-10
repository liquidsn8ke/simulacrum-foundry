// SPDX-License-Identifier: MIT
/* eslint-disable complexity, max-lines-per-function -- data mapping: each optional stat-block field is a `??` default or a guard, which the complexity rule counts as a branch. Splitting would scatter one mapping across many functions. */

/**
 * Item builder: a compact spec in, pf2e item data out. Covers abilities (action),
 * strikes (melee), effects, feats, spells, lore and every physical item type.
 *
 * Two routes:
 * - `base`: copy an official item (by name or UUID) and change what differs. The
 *   shortest correct path for anything close to an official item.
 * - from nothing: give `type` and the fields; the pf2e system fills the defaults for
 *   whatever is left out when the item is created.
 *
 * Compendium access is injected (`lookup`), so this file is unit-testable.
 */

import { toHTML, slugify, deepMerge, clone, randomID } from './text.js';
import { buildAction, buildStrike } from './npc-builder.js';

/** Item types the builder accepts. */
export const ITEM_TYPES = Object.freeze([
  'action',
  'melee',
  'effect',
  'feat',
  'spell',
  'lore',
  'weapon',
  'armor',
  'shield',
  'equipment',
  'consumable',
  'treasure',
  'ammo',
  'backpack',
]);

/** Spec keys that are handled explicitly; anything else must go under `system`. */
export const ITEM_SPEC_KEYS = Object.freeze([
  'type',
  'name',
  'base',
  'basePack',
  'img',
  'slug',
  'level',
  'rarity',
  'traits',
  'description',
  'rules',
  'addRules',
  'system',
  'price',
  // action
  'actions',
  'category',
  'frequency',
  'aura',
  'auraTraits',
  // melee
  'bonus',
  'damage',
  'effects',
  'range',
  'maxRange',
  // effect
  'duration',
]);

/**
 * Check a spec before building.
 * @param {object} spec
 * @returns {string[]} errors
 */
export function checkItemSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') return ['spec must be an object.'];
  if (!spec.name && !spec.base) errors.push('spec.name is required (or a base to copy).');
  if (!spec.base && !ITEM_TYPES.includes(spec.type)) {
    errors.push(`spec.type must be one of ${ITEM_TYPES.join(', ')} (or give a base item to copy).`);
  }
  if (spec.rules && !Array.isArray(spec.rules))
    errors.push('spec.rules must be an array of rule elements.');
  if (spec.addRules && !Array.isArray(spec.addRules))
    errors.push('spec.addRules must be an array.');
  for (const [i, r] of [...(spec.rules ?? []), ...(spec.addRules ?? [])].entries()) {
    if (!r || typeof r !== 'object' || typeof r.key !== 'string')
      errors.push(`rule ${i} needs a string "key".`);
  }
  const unknown = Object.keys(spec).filter(k => !ITEM_SPEC_KEYS.includes(k));
  if (unknown.length) {
    errors.push(
      `Unknown spec keys: ${unknown.join(', ')}. Put other fields under "system" (it is deep-merged).`
    );
  }
  return errors;
}

/**
 * Build item data from a spec.
 * @param {object} spec
 * @param {Function} lookup - async (packKeys, name, type?) => data | null, with lookup.byUuid(uuid) and lookup.anyPack(name, type)
 * @returns {Promise<{item: object, warnings: string[]}>}
 */
export async function buildItemData(spec, lookup) {
  const warnings = [];

  if (!spec.base && spec.type === 'action') {
    return { item: applyCommon(buildAction(spec), spec, { skipDescription: true }), warnings };
  }
  if (!spec.base && spec.type === 'melee') {
    return { item: applyCommon(buildStrike(spec), spec, { skipDescription: true }), warnings };
  }

  let item;
  if (spec.base) {
    const isUuid = /^(Compendium|Item|Actor)\./.test(spec.base);
    item = isUuid
      ? await lookup.byUuid(spec.base)
      : spec.basePack
        ? await lookup([spec.basePack], spec.base, spec.type)
        : await lookup.anyPack(spec.base, spec.type);
    if (!item) {
      return {
        item: null,
        warnings: [
          `Base "${spec.base}" was not found. Use pf2e_lookup to find the exact name or UUID.`,
        ],
      };
    }
    if (spec.type && item.type !== spec.type) {
      warnings.push(
        `Base "${item.name}" is a ${item.type}, not a ${spec.type}; kept ${item.type}.`
      );
    }
  } else {
    item = {
      _id: randomID(),
      name: spec.name,
      type: spec.type,
      img: spec.img ?? defaultImg(spec.type),
      system: {
        description: { value: '' },
        rules: [],
        traits: { rarity: 'common', value: [] },
        publication: { license: 'ORC', remaster: true, title: 'Homebrew' },
      },
      effects: [],
    };
    if (spec.type === 'effect') {
      item.system.duration = { value: -1, unit: 'unlimited', expiry: null, sustained: false };
      item.system.tokenIcon = { show: true };
      item.system.start = { value: 0, initiative: null };
    }
  }

  return { item: applyCommon(item, spec), warnings };
}

/** Apply the spec's common fields onto item data. */
function applyCommon(item, spec, { skipDescription = false } = {}) {
  const out = clone(item);
  out.system ??= {};
  if (spec.name) out.name = spec.name;
  if (spec.img) out.img = spec.img;
  if (spec.level !== undefined)
    out.system.level = { ...(out.system.level ?? {}), value: Number(spec.level) };
  if (spec.traits) out.system.traits = { ...(out.system.traits ?? {}), value: spec.traits };
  if (spec.rarity)
    out.system.traits = { ...(out.system.traits ?? { value: [] }), rarity: spec.rarity };
  if (!skipDescription && spec.description !== undefined) {
    out.system.description = { ...(out.system.description ?? {}), value: toHTML(spec.description) };
  }
  if (!skipDescription && spec.rules) out.system.rules = clone(spec.rules);
  if (spec.addRules) out.system.rules = [...(out.system.rules ?? []), ...clone(spec.addRules)];
  if (spec.price) out.system.price = { ...(out.system.price ?? {}), value: clone(spec.price) };
  if (spec.duration && out.type === 'effect')
    out.system.duration = { ...out.system.duration, ...clone(spec.duration) };
  if (spec.system) out.system = deepMerge(out.system, spec.system);
  out.system.slug = spec.slug ?? out.system.slug ?? slugify(out.name);
  if (spec.base && spec.name) {
    // A renamed copy is a new item: give it a slug that matches its new name.
    if (!spec.slug) out.system.slug = slugify(spec.name);
  }
  return out;
}

/** Default icons per type, as the system uses. */
function defaultImg(type) {
  const icons = {
    effect: 'systems/pf2e/icons/default-icons/effect.svg',
    feat: 'systems/pf2e/icons/default-icons/feat.svg',
    spell: 'systems/pf2e/icons/default-icons/spell.svg',
    lore: 'systems/pf2e/icons/default-icons/lore.svg',
    weapon: 'systems/pf2e/icons/default-icons/weapon.svg',
    armor: 'systems/pf2e/icons/default-icons/armor.svg',
    shield: 'systems/pf2e/icons/default-icons/shield.svg',
    consumable: 'systems/pf2e/icons/default-icons/consumable.svg',
    treasure: 'systems/pf2e/icons/default-icons/treasure.svg',
    equipment: 'systems/pf2e/icons/default-icons/equipment.svg',
    backpack: 'systems/pf2e/icons/default-icons/backpack.svg',
    ammo: 'systems/pf2e/icons/default-icons/ammo.svg',
  };
  return icons[type] ?? 'systems/pf2e/icons/default-icons/equipment.svg';
}

// SPDX-License-Identifier: MIT
/* eslint-disable complexity, max-lines-per-function -- data mapping: each optional stat-block field is a `??` default or a guard, which the complexity rule counts as a branch. Splitting would scatter one mapping across many functions. */

/**
 * NPC builder: a compact creature spec in, a complete pf2e NPC (actor data plus
 * embedded items) out.
 *
 * Spells, gear and standard abilities (Grab, Reactive Strike, Frightful Presence,
 * troop abilities …) are copied from the pf2e compendia by name, so they behave
 * exactly as on official creatures. Everything else is written in the same shapes
 * official Monster Core creatures use (reference/pf2e-npc-fields.md).
 *
 * Compendium access is injected (`lookup`) so this file has no Foundry globals and
 * is unit-tested in tests/unit/pf2e-npc-builder.test.mjs.
 */

import { randomID, slugify, toHTML, clone } from './text.js';
import { PF2E_PACKS } from './compendium.js';

const SIZES = {
  tiny: 'tiny',
  small: 'sm',
  sm: 'sm',
  medium: 'med',
  med: 'med',
  large: 'lg',
  lg: 'lg',
  huge: 'huge',
  gargantuan: 'grg',
  grg: 'grg',
};

const TOKEN_SIZE = { tiny: 0.5, sm: 1, med: 1, lg: 2, huge: 3, grg: 4 };

const ACTION_ICONS = {
  1: 'systems/pf2e/icons/actions/OneAction.webp',
  2: 'systems/pf2e/icons/actions/TwoActions.webp',
  3: 'systems/pf2e/icons/actions/ThreeActions.webp',
  free: 'systems/pf2e/icons/actions/FreeAction.webp',
  reaction: 'systems/pf2e/icons/actions/Reaction.webp',
  passive: 'systems/pf2e/icons/actions/Passive.webp',
};

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** The spec fields, for the tool description and errors. */
export const CREATURE_SPEC_KEYS = Object.freeze([
  'name',
  'level',
  'rarity',
  'size',
  'traits',
  'source',
  'img',
  'token',
  'folder',
  'perception',
  'languages',
  'languageDetails',
  'skills',
  'lore',
  'abilities',
  'ac',
  'acDetails',
  'saves',
  'allSaves',
  'hp',
  'hpDetails',
  'hardness',
  'immunities',
  'weaknesses',
  'resistances',
  'speed',
  'otherSpeeds',
  'speedDetails',
  'initiative',
  'gear',
  'strikes',
  'spellcasting',
  'glossary',
  'actions',
  'omitTroopAbilities',
  'publicNotes',
  'privateNotes',
  'blurb',
]);

/** Item system fields every built item carries. */
function baseSystem(extra = {}) {
  return {
    description: { value: '' },
    publication: { license: 'ORC', remaster: true, title: '' },
    rules: [],
    slug: null,
    traits: { rarity: 'common', value: [] },
    ...extra,
  };
}

/**
 * A strike (`melee` item).
 * @param {object} s - {name, bonus, damage:[{formula, type, category?}], traits?, effects?, range?, maxRange?, rules?, slug?, description?, img?}
 * @param {Function} nextSort
 * @returns {object}
 */
export function buildStrike(s, nextSort = () => 0) {
  const damageRolls = {};
  for (const d of s.damage ?? []) {
    const roll = { damage: String(d.formula ?? d.damage), damageType: d.type ?? d.damageType };
    if (d.category) roll.category = d.category;
    damageRolls[randomID(20).toLowerCase()] = roll;
  }
  return {
    _id: randomID(),
    img: s.img ?? 'systems/pf2e/icons/default-icons/melee.svg',
    name: s.name,
    sort: nextSort(),
    type: 'melee',
    system: baseSystem({
      attack: { value: '' },
      attackEffects: { custom: '', value: s.effects ?? [] },
      bonus: { value: Number(s.bonus) },
      damageRolls,
      range: s.range ? { increment: Number(s.range), max: s.maxRange ?? null } : null,
      rules: clone(s.rules ?? []),
      slug: s.slug ?? null,
      traits: { rarity: 'common', value: s.traits ?? [] },
      description: { value: toHTML(s.description) },
    }),
    effects: [],
  };
}

/**
 * An ability (`action` item). Auras get an Aura rule automatically: radius from
 * `aura`, or from "N feet." at the start of the text; rule traits from `auraTraits`
 * (only effect traits are valid there) or the action's traits minus "aura".
 * @param {object} a - {name, actions: 1|2|3|"free"|"reaction"|"passive", category?, traits?, frequency?, description?, rules?, aura?, auraTraits?, slug?, img?}
 * @param {Function} nextSort
 * @returns {object}
 */
export function buildAction(a, nextSort = () => 0) {
  const cost = a.actions ?? 'passive';
  const actionType = typeof cost === 'number' ? 'action' : cost;
  const traits = a.traits ?? [];
  const rules = clone(a.rules ?? []);
  if (traits.includes('aura') && !rules.some(r => r.key === 'Aura')) {
    const plain = String(a.description ?? '').replace(/<[^>]+>/g, '');
    const radius = a.aura ?? Number(plain.match(/^\s*(\d+)\s*feet/)?.[1]);
    if (radius) {
      rules.push({
        key: 'Aura',
        radius: Number(radius),
        slug: a.slug ?? slugify(a.name),
        traits: a.auraTraits ?? traits.filter(t => t !== 'aura'),
      });
    }
  }
  const system = baseSystem({
    actionType: { value: actionType },
    actions: { value: typeof cost === 'number' ? cost : null },
    category:
      a.category ??
      (actionType === 'reaction' || actionType === 'passive' ? 'defensive' : 'offensive'),
    description: { value: toHTML(a.description) },
    rules,
    slug: a.slug ?? slugify(a.name),
    traits: { rarity: 'common', value: traits },
  });
  if (a.frequency) {
    system.frequency = { max: a.frequency.max ?? 1, per: a.frequency.per ?? 'day' };
  }
  return {
    _id: randomID(),
    img: a.img ?? ACTION_ICONS[cost] ?? ACTION_ICONS.passive,
    name: a.name,
    sort: nextSort(),
    type: 'action',
    system,
    effects: [],
  };
}

/** A lore skill item. */
function buildLore(name, mod, nextSort) {
  return {
    _id: randomID(),
    img: 'systems/pf2e/icons/default-icons/lore.svg',
    name,
    sort: nextSort(),
    type: 'lore',
    system: baseSystem({
      mod: { value: Number(mod) },
      proficient: { value: 0 },
      traits: { value: [] },
    }),
    effects: [],
  };
}

/**
 * Copy a glossary ability and fill it in. Glossary templates such as Frightful
 * Presence start "<p>0 feet. @Check[will|dc:|...]"; `aura` and `dc` fill those
 * placeholders, and `aura` also sets the Aura rule's radius.
 */
async function buildGlossary(entry, lookup, nextSort, warnings) {
  const spec = typeof entry === 'string' ? { name: entry } : entry;
  const doc = await lookup([PF2E_PACKS.glossary, PF2E_PACKS.familyGlossary], spec.name);
  if (!doc) {
    warnings.push(
      `Glossary ability "${spec.name}" was not found in the pf2e glossaries; it was skipped. Write it as an action instead.`
    );
    return null;
  }
  const desc = doc.system.description ?? { value: '' };
  if (spec.aura) desc.value = desc.value.replace(/^<p>0 feet\./, `<p>${spec.aura} feet.`);
  if (spec.dc) desc.value = desc.value.replace(/\bdc:(?=[|\]])/g, `dc:${spec.dc}`);
  if (spec.description) desc.value = `${toHTML(spec.description)}\n${desc.value}`;
  doc.system.description = desc;
  if (spec.rename) doc.name = spec.rename;
  if (spec.traits) doc.system.traits = { ...(doc.system.traits ?? {}), value: spec.traits };
  if (spec.rules) doc.system.rules = clone(spec.rules);
  if (spec.aura) {
    const aura = (doc.system.rules ?? []).find(r => r.key === 'Aura');
    if (aura) aura.radius = Number(spec.aura);
  }
  if (/dc:(?=[|\]])/.test(desc.value)) {
    warnings.push(`"${doc.name}" still has an empty DC in its text; pass "dc" for it.`);
  }
  doc.sort = nextSort();
  return doc;
}

/** Copy a piece of gear from the equipment compendium and equip it. */
async function buildGear(entry, lookup, nextSort, warnings) {
  const spec = typeof entry === 'string' ? { name: entry } : entry;
  const doc = spec.uuid
    ? await lookup.byUuid(spec.uuid)
    : await lookup([PF2E_PACKS.equipment], spec.name);
  if (!doc) {
    warnings.push(`Equipment "${spec.name ?? spec.uuid}" was not found; it was skipped.`);
    return null;
  }
  if (spec.quantity) doc.system.quantity = spec.quantity;
  if (spec.rename) doc.name = spec.rename;
  if (spec.runes && doc.system.runes) Object.assign(doc.system.runes, spec.runes);
  const held = ['weapon', 'shield'].includes(doc.type) && spec.held !== false;
  if (doc.system.equipped) {
    doc.system.equipped.carryType = held ? 'held' : 'worn';
    doc.system.equipped.handsHeld = held
      ? /held-in-two/.test(doc.system.usage?.value ?? '')
        ? 2
        : 1
      : 0;
    if (doc.type === 'armor') doc.system.equipped.inSlot = true;
    if ((doc.system.traits?.value ?? []).includes('invested')) doc.system.equipped.invested = true;
  }
  doc.sort = nextSort();
  return doc;
}

/** A spellcasting entry and its spells. */
async function buildSpellcasting(sc, { lookup, nextSort, resources, warnings }) {
  const type = sc.type;
  if (!['innate', 'prepared', 'spontaneous', 'focus'].includes(type)) {
    warnings.push(
      `Spellcasting type "${type}" is not one of innate, prepared, spontaneous, focus; entry skipped.`
    );
    return [];
  }
  const tradition = sc.tradition ?? 'arcane';
  const entryId = randomID();
  const cap = s => s[0].toUpperCase() + s.slice(1);
  const entry = {
    _id: entryId,
    img: 'systems/pf2e/icons/default-icons/spellcastingEntry.svg',
    name: sc.name ?? `${cap(tradition)} ${cap(type)} Spells`,
    sort: nextSort(),
    type: 'spellcastingEntry',
    system: baseSystem({
      autoHeightenLevel: { value: sc.autoHeighten ?? null },
      prepared: { flexible: false, value: type },
      proficiency: { value: 0 },
      showSlotlessLevels: { value: false },
      slots: {},
      spelldc: { dc: Number(sc.dc), mod: 0, value: Number(sc.attack ?? Number(sc.dc) - 10) },
      tradition: { value: tradition },
      traits: {},
    }),
    effects: [],
  };
  for (const [rank, max] of Object.entries(sc.slots ?? {})) {
    entry.system.slots[`slot${rank}`] =
      type === 'prepared'
        ? { max: Number(max), prepared: [] }
        : { max: Number(max), value: Number(max) };
  }
  if (type === 'focus') resources.focus = { max: sc.focusPoints ?? 1, value: sc.focusPoints ?? 1 };

  const spells = [];
  for (const sp of sc.spells ?? []) {
    const doc = sp.uuid
      ? await lookup.byUuid(sp.uuid)
      : await lookup([PF2E_PACKS.spells], sp.name, 'spell');
    if (!doc) {
      warnings.push(
        `Spell "${sp.name ?? sp.uuid}" was not found in the spell compendium; it was skipped.`
      );
      continue;
    }
    const isCantrip = (doc.system.traits?.value ?? []).includes('cantrip');
    const baseRank = doc.system.level?.value ?? 1;
    const rank = sp.rank ?? (isCantrip ? 0 : baseRank);
    doc.system.location = { value: entryId };
    if (!isCantrip && (rank > baseRank || type !== 'prepared'))
      doc.system.location.heightenedLevel = rank;
    if (sp.uses) doc.system.location.uses = { max: sp.uses, value: sp.uses };
    if (sp.atWill) doc.name += ' (At Will)';
    if (sp.constant) doc.name += ' (Constant)';
    if (sp.rename) doc.name = sp.rename;
    doc.sort = nextSort();
    spells.push(doc);
    if (type === 'prepared') {
      const key = `slot${rank}`;
      entry.system.slots[key] ??= { max: 0, prepared: [] };
      for (let i = 0; i < (sp.copies ?? 1); i++)
        entry.system.slots[key].prepared.push({ id: doc._id });
      entry.system.slots[key].max = Math.max(
        entry.system.slots[key].max,
        entry.system.slots[key].prepared.length
      );
    }
  }
  return [entry, ...spells];
}

/**
 * Check a spec for the problems that would otherwise surface as a broken actor.
 * @param {object} spec
 * @returns {string[]} errors
 */
export function checkCreatureSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') return ['spec must be an object.'];
  if (!spec.name) errors.push('spec.name is required.');
  if (!Number.isFinite(Number(spec.level))) errors.push('spec.level must be a number (-1 to 25+).');
  if (!Number.isFinite(Number(spec.hp))) errors.push('spec.hp must be a number.');
  if (!Number.isFinite(Number(spec.ac))) errors.push('spec.ac must be a number.');
  for (const save of ['fortitude', 'reflex', 'will']) {
    if (!Number.isFinite(Number(spec.saves?.[save])))
      errors.push(`spec.saves.${save} must be a number.`);
  }
  if (spec.size && !SIZES[String(spec.size).toLowerCase()]) {
    errors.push(
      `spec.size "${spec.size}" must be one of tiny, small, medium, large, huge, gargantuan.`
    );
  }
  for (const [i, s] of (spec.strikes ?? []).entries()) {
    if (
      !s.name ||
      !Number.isFinite(Number(s.bonus)) ||
      !Array.isArray(s.damage) ||
      !s.damage.length
    ) {
      errors.push(`spec.strikes[${i}] needs name, bonus and a non-empty damage list.`);
    }
  }
  const unknown = Object.keys(spec).filter(k => !CREATURE_SPEC_KEYS.includes(k));
  if (unknown.length)
    errors.push(
      `Unknown spec keys: ${unknown.join(', ')}. Valid keys: ${CREATURE_SPEC_KEYS.join(', ')}.`
    );
  return errors;
}

/**
 * Build NPC actor data from a spec.
 * @param {object} spec - see reference/pf2e-builder-specs.md
 * @param {Function} lookup - async (packKeys, name, type?) => item data | null; with lookup.byUuid(uuid)
 * @param {object} [options]
 * @param {string} [options.moduleId] - Flag scope for storing the spec
 * @returns {Promise<{actor: object, warnings: string[]}>}
 */
export async function buildCreatureData(spec, lookup, { moduleId = 'simulacrum-pf2e' } = {}) {
  let sort = 0;
  const nextSort = () => (sort += 100000);
  const warnings = [];
  const items = [];
  const resources = {};

  for (const g of spec.gear ?? []) {
    const doc = await buildGear(g, lookup, nextSort, warnings);
    if (doc) items.push(doc);
  }
  for (const s of spec.strikes ?? []) items.push(buildStrike(s, nextSort));
  for (const sc of spec.spellcasting ?? []) {
    items.push(...(await buildSpellcasting(sc, { lookup, nextSort, resources, warnings })));
  }

  const traits = spec.traits ?? [];
  const isTroop = traits.includes('troop');
  const hp = Number(spec.hp);
  let troopThresholds = '';
  if (isTroop) {
    troopThresholds = `Thresholds ${Math.floor((hp * 2) / 3)} (3 segments), ${Math.floor(hp / 3)} (2 segments)`;
    const omit = new Set((spec.omitTroopAbilities ?? []).map(s => s.toLowerCase()));
    const listed = new Set(
      (spec.glossary ?? []).map(g => (typeof g === 'string' ? g : g.name).toLowerCase())
    );
    const auto = [
      {
        name: 'Troop Defenses',
        description: `<p><strong>Thresholds</strong> ${troopThresholds.slice('Thresholds '.length)}</p><hr />`,
      },
      { name: 'Troop Movement' },
      { name: 'Form Up' },
    ].filter(g => !omit.has(g.name.toLowerCase()) && !listed.has(g.name.toLowerCase()));
    for (const g of auto) {
      const doc = await buildGlossary(g, lookup, nextSort, warnings);
      if (doc) items.push(doc);
    }
  }
  for (const g of spec.glossary ?? []) {
    const doc = await buildGlossary(g, lookup, nextSort, warnings);
    if (doc) items.push(doc);
  }
  for (const a of spec.actions ?? []) items.push(buildAction(a, nextSort));
  for (const [name, mod] of Object.entries(spec.lore ?? {}))
    items.push(buildLore(name, mod, nextSort));

  // Strike on-hit effects must name abilities the creature actually has.
  const slugs = new Set(items.map(i => i.system?.slug).filter(Boolean));
  for (const strike of items.filter(i => i.type === 'melee')) {
    for (const effect of strike.system.attackEffects.value) {
      if (!slugs.has(effect)) {
        warnings.push(
          `Strike "${strike.name}" lists on-hit effect "${effect}", but no ability with that slug is on the creature. Add it (e.g. glossary "Grab") or fix the slug.`
        );
      }
    }
  }

  const abilities = {};
  for (const k of ABILITY_KEYS) abilities[k] = { mod: Number(spec.abilities?.[k] ?? 0) };
  const skills = {};
  for (const [k, v] of Object.entries(spec.skills ?? {})) skills[slugify(k)] = { base: Number(v) };

  const attributes = {
    ac: { details: spec.acDetails ?? '', value: Number(spec.ac) },
    allSaves: { value: spec.allSaves ?? '' },
    hp: {
      details: [spec.hpDetails, troopThresholds].filter(Boolean).join('; '),
      max: hp,
      temp: 0,
      value: hp,
    },
    speed: { otherSpeeds: spec.otherSpeeds ?? [], value: Number(spec.speed ?? 25) },
  };
  const speedDetails = spec.speedDetails ?? (isTroop ? 'troop movement' : '');
  if (speedDetails) attributes.speed.details = speedDetails;
  if (spec.immunities?.length) {
    attributes.immunities = spec.immunities.map(i =>
      typeof i === 'string' ? { type: i, exceptions: [] } : { exceptions: [], ...i }
    );
  }
  if (spec.weaknesses?.length) attributes.weaknesses = clone(spec.weaknesses);
  if (spec.resistances?.length)
    attributes.resistances = spec.resistances.map(r => ({ exceptions: [], ...r }));
  if (spec.hardness) attributes.hardness = { value: Number(spec.hardness) };

  const size = SIZES[String(spec.size ?? 'medium').toLowerCase()] ?? 'med';
  const tokenSize = isTroop ? 2 : TOKEN_SIZE[size];
  const img = spec.img ?? 'systems/pf2e/icons/default-icons/npc.svg';

  const actor = {
    name: spec.name,
    type: 'npc',
    img,
    system: {
      abilities,
      attributes,
      details: {
        blurb: spec.blurb ?? '',
        languages: { details: spec.languageDetails ?? '', value: spec.languages ?? [] },
        level: { value: Number(spec.level) },
        privateNotes: toHTML(spec.privateNotes),
        publicNotes: toHTML(spec.publicNotes),
        publication: { license: 'ORC', remaster: true, title: spec.source ?? 'Homebrew' },
      },
      initiative: { statistic: spec.initiative ?? 'perception' },
      perception: {
        details: spec.perception?.details ?? '',
        mod: Number(spec.perception?.mod ?? 0),
        senses: spec.perception?.senses ?? [],
      },
      resources,
      saves: {
        fortitude: { saveDetail: '', value: Number(spec.saves.fortitude) },
        reflex: { saveDetail: '', value: Number(spec.saves.reflex) },
        will: { saveDetail: '', value: Number(spec.saves.will) },
      },
      skills,
      traits: { rarity: spec.rarity ?? 'common', size: { value: size }, value: traits },
    },
    prototypeToken: {
      name: spec.name,
      width: tokenSize,
      height: tokenSize,
      texture: { src: spec.token ?? img },
    },
    items,
    flags: { [moduleId]: { creatureSpec: clone(spec) } },
  };

  return { actor, warnings };
}

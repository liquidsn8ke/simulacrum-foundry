// SPDX-License-Identifier: MIT
/* eslint-disable complexity, max-lines-per-function -- data mapping: each optional stat-block field is a `??` default or a guard, which the complexity rule counts as a branch. Splitting would scatter one mapping across many functions. */

/**
 * Compendium access for the PF2e builders: find official documents by name and copy
 * them as data, the way a GM drags one from a compendium.
 *
 * Builders never write into the pf2e system's packs; they only read from them.
 */

import { clone } from './text.js';

/** The pf2e packs the builders draw from, by role. */
export const PF2E_PACKS = Object.freeze({
  spells: 'pf2e.spells-srd',
  equipment: 'pf2e.equipment-srd',
  glossary: 'pf2e.bestiary-ability-glossary-srd',
  familyGlossary: 'pf2e.bestiary-family-ability-glossary',
  conditions: 'pf2e.conditionitems',
  actions: 'pf2e.actionspf2e',
  feats: 'pf2e.feats-srd',
});

/** Index fields read for search results and benchmarks. */
const ITEM_INDEX_FIELDS = [
  'type',
  'system.slug',
  'system.level.value',
  'system.traits.value',
  'system.traits.rarity',
  'system.publication.remaster',
];

/**
 * Normalise for name matching: case, punctuation and spacing do not matter.
 * @param {string} name
 * @returns {string}
 */
export function nameKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Rank candidate index entries for a query: exact name, then starts-with, then
 * contains; remastered entries before legacy duplicates.
 * @param {Array<object>} entries - index entries with name and system.publication.remaster
 * @param {string} query
 * @returns {Array<object>}
 */
export function rankMatches(entries, query) {
  const key = nameKey(query);
  if (!key) return [];
  const scored = [];
  for (const entry of entries) {
    const name = nameKey(entry.name);
    let score = 0;
    if (name === key) score = 3;
    else if (name.startsWith(key)) score = 2;
    else if (name.includes(key)) score = 1;
    if (!score) continue;
    const remaster = entry.system?.publication?.remaster ? 0.5 : 0;
    scored.push({ entry, score: score + remaster });
  }
  return scored
    .sort((a, b) => b.score - a.score || String(a.entry.name).localeCompare(String(b.entry.name)))
    .map(s => s.entry);
}

/**
 * The packs to search: explicit keys, else every Item (or Actor) pack in the world,
 * the pf2e system's first.
 * @param {object} options
 * @returns {Array<object>}
 */
function packsToSearch({ packs, documentName = 'Item' } = {}) {
  const all = [...(globalThis.game?.packs ?? [])];
  if (Array.isArray(packs) && packs.length) {
    return packs.map(key => globalThis.game.packs.get(key)).filter(Boolean);
  }
  return all
    .filter(p => p.documentName === documentName)
    .sort(
      (a, b) =>
        Number(b.metadata?.packageName === 'pf2e') - Number(a.metadata?.packageName === 'pf2e')
    );
}

/**
 * Search compendium indexes.
 * @param {object} options
 * @param {string} options.query - Name to find
 * @param {string} [options.type] - Item type filter (spell, weapon, action, effect, condition …) or "npc"/"hazard" for actors
 * @param {string[]} [options.packs] - Pack keys to restrict to
 * @param {number} [options.level] - Exact level filter
 * @param {string[]} [options.traits] - Traits the result must have
 * @param {number} [options.limit=10]
 * @returns {Promise<Array<{uuid: string, name: string, type: string, pack: string, level: number|null, traits: string[], rarity: string|null}>>}
 */
export async function searchCompendia({ query, type, packs, level, traits, limit = 10 }) {
  const actorTypes = ['npc', 'hazard', 'character', 'vehicle'];
  const documentName = actorTypes.includes(type) ? 'Actor' : 'Item';
  const wantType = type === 'condition' ? 'condition' : type;
  const results = [];

  for (const pack of packsToSearch({ packs, documentName })) {
    let index;
    try {
      index = await pack.getIndex({
        fields: ITEM_INDEX_FIELDS.concat(['system.details.level.value']),
      });
    } catch {
      continue;
    }
    let entries = [...index];
    if (wantType) entries = entries.filter(e => e.type === wantType);
    if (Number.isFinite(level)) {
      entries = entries.filter(
        e => (e.system?.level?.value ?? e.system?.details?.level?.value) === level
      );
    }
    if (Array.isArray(traits) && traits.length) {
      entries = entries.filter(e => traits.every(t => (e.system?.traits?.value ?? []).includes(t)));
    }
    for (const entry of rankMatches(entries, query)) {
      results.push({
        uuid: entry.uuid ?? `Compendium.${pack.collection}.${documentName}.${entry._id}`,
        name: entry.name,
        type: entry.type,
        pack: pack.collection,
        level: entry.system?.level?.value ?? entry.system?.details?.level?.value ?? null,
        traits: entry.system?.traits?.value ?? [],
        rarity: entry.system?.traits?.rarity ?? null,
        _rank: nameKey(entry.name) === nameKey(query) ? 0 : 1,
      });
    }
  }

  return results
    .sort((a, b) => a._rank - b._rank)
    .slice(0, limit)
    .map(({ _rank, ...rest }) => rest);
}

/**
 * A compendium document as plain data ready to embed: a fresh `_id`, ownership and
 * folder removed, and `_stats.compendiumSource` pointing at the original so the
 * system can tell where it came from.
 * @param {string} uuid
 * @returns {Promise<object|null>}
 */
export async function copyFromUuid(uuid) {
  const doc = await globalThis.fromUuid?.(uuid);
  if (!doc) return null;
  const data = clone(doc.toObject());
  delete data.folder;
  delete data.ownership;
  delete data.sort;
  data._id = globalThis.foundry?.utils?.randomID?.() ?? data._id;
  data._stats = { ...(data._stats ?? {}), compendiumSource: uuid };
  if (Array.isArray(data.effects)) data.effects = [];
  return data;
}

/**
 * The lookup function the builders take: (packs, name, type?) => data, plus
 * byUuid(uuid) and anyPack(name, type?) for a search across every pack.
 * @returns {Function}
 */
export function createLookup() {
  const lookup = (packs, name, type) => copyByName(packs, name, type);
  lookup.byUuid = uuid => copyFromUuid(uuid);
  lookup.anyPack = async (name, type) => {
    const [hit] = await searchCompendia({ query: name, type, limit: 1 });
    return hit && nameKey(hit.name) === nameKey(name) ? copyFromUuid(hit.uuid) : null;
  };
  return lookup;
}

/**
 * Find one document by name in a pack (or the given packs) and copy it.
 * @param {string|string[]} packs - Pack key(s), in order of preference
 * @param {string} name
 * @param {string} [type]
 * @returns {Promise<object|null>} Plain data, or null if not found
 */
export async function copyByName(packs, name, type) {
  const keys = Array.isArray(packs) ? packs : [packs];
  for (const key of keys) {
    const [hit] = await searchCompendia({ query: name, type, packs: [key], limit: 1 });
    if (hit && nameKey(hit.name) === nameKey(name)) return copyFromUuid(hit.uuid);
  }
  return null;
}

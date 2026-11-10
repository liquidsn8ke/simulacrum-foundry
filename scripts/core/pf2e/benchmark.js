// SPDX-License-Identifier: MIT
/* eslint-disable complexity, max-lines-per-function -- data mapping: each optional stat-block field is a `??` default or a guard, which the complexity rule counts as a branch. Splitting would scatter one mapping across many functions. */

/**
 * Benchmarks: how a creature's numbers compare with official creatures of the same
 * level, computed live from the pf2e bestiary compendia installed in the world.
 *
 * This deliberately uses the published creatures themselves rather than a copied
 * table: the comparison is "where would this sit among Monster Core creatures of
 * its level", which is the question a GM checking homebrew actually asks, and it
 * needs no data shipped with this module.
 */

/** Stats read from compendium indexes (cheap: no documents loaded). */
export const INDEX_STATS = Object.freeze({
  ac: 'system.attributes.ac.value',
  hp: 'system.attributes.hp.max',
  perception: 'system.perception.mod',
  fortitude: 'system.saves.fortitude.value',
  reflex: 'system.saves.reflex.value',
  will: 'system.saves.will.value',
});

/** Stats read from a sample of loaded creatures (strikes and spellcasting). */
export const SAMPLED_STATS = Object.freeze(['attack', 'strikeDamage', 'spellDC']);

/** Read a dotted path. */
function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * Percentile summary of numbers.
 * @param {number[]} values
 * @returns {{n: number, min: number, p10: number, p25: number, median: number, p75: number, p90: number, max: number}|null}
 */
export function summarize(values) {
  const v = values.filter(x => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const at = p => {
    const idx = (v.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return Math.round((v[lo] + (v[hi] - v[lo]) * (idx - lo)) * 10) / 10;
  };
  return {
    n: v.length,
    min: v[0],
    p10: at(0.1),
    p25: at(0.25),
    median: at(0.5),
    p75: at(0.75),
    p90: at(0.9),
    max: v[v.length - 1],
  };
}

/**
 * Where a value sits in a distribution.
 * @param {number} value
 * @param {object|null} dist - from summarize
 * @returns {string}
 */
export function rate(value, dist) {
  if (!dist || !Number.isFinite(value)) return 'no data';
  if (value > dist.max) return 'above every official creature of this level';
  if (value < dist.min) return 'below every official creature of this level';
  if (value >= dist.p90) return 'extreme (top 10%)';
  if (value > dist.p75) return 'high';
  if (value >= dist.p25) return 'moderate (typical)';
  if (value > dist.p10) return 'low';
  return 'very low (bottom 10%)';
}

/** Average of a dice formula, via Foundry's Roll (min + max) / 2. */
export function averageOf(formula) {
  const Roll = globalThis.Roll;
  if (!Roll) return NaN;
  try {
    const min = new Roll(formula).evaluateSync({ minimize: true }).total;
    const max = new Roll(formula).evaluateSync({ maximize: true }).total;
    return (min + max) / 2;
  } catch {
    return NaN;
  }
}

/** The pf2e bestiary packs: Actor packs from the system that hold NPCs. */
function bestiaryPacks() {
  return [...(globalThis.game?.packs ?? [])].filter(
    p =>
      p.documentName === 'Actor' &&
      p.metadata?.packageName === 'pf2e' &&
      !/iconic|pregen|vehicle|hazard/i.test(p.collection)
  );
}

const cache = new Map();

/**
 * Official distributions for a level. Index stats come from every bestiary;
 * strike and spell numbers from up to `sample` loaded creatures.
 * @param {number} level
 * @param {object} [options]
 * @param {number} [options.sample=30]
 * @returns {Promise<{level: number, creatures: number, stats: Record<string, object|null>}>}
 */
export async function officialDistributions(level, { sample = 30 } = {}) {
  if (cache.has(level)) return cache.get(level);
  const values = Object.fromEntries(
    [...Object.keys(INDEX_STATS), ...SAMPLED_STATS].map(k => [k, []])
  );
  const candidates = [];

  for (const pack of bestiaryPacks()) {
    let index;
    try {
      index = await pack.getIndex({
        fields: ['type', 'system.details.level.value', ...Object.values(INDEX_STATS)],
      });
    } catch {
      continue;
    }
    for (const entry of index) {
      if (entry.type !== 'npc' || get(entry, 'system.details.level.value') !== level) continue;
      for (const [stat, path] of Object.entries(INDEX_STATS)) values[stat].push(get(entry, path));
      candidates.push({ pack, id: entry._id, monsterCore: /monster-core/.test(pack.collection) });
    }
  }

  // Prefer Monster Core creatures for the loaded sample.
  candidates.sort((a, b) => Number(b.monsterCore) - Number(a.monsterCore));
  for (const { pack, id } of candidates.slice(0, sample)) {
    const actor = await pack.getDocument(id).catch(() => null);
    if (!actor) continue;
    const strikes = actor.items.filter(i => i.type === 'melee');
    if (strikes.length) {
      const best = strikes.reduce((a, b) =>
        (b.system.bonus?.value ?? 0) > (a.system.bonus?.value ?? 0) ? b : a
      );
      values.attack.push(best.system.bonus?.value);
      const avg = Object.values(best.system.damageRolls ?? {}).reduce(
        (sum, r) => sum + (averageOf(String(r.damage)) || 0),
        0
      );
      if (avg) values.strikeDamage.push(avg);
    }
    const dcs = actor.items
      .filter(i => i.type === 'spellcastingEntry')
      .map(i => i.system.spelldc?.dc)
      .filter(Number.isFinite);
    if (dcs.length) values.spellDC.push(Math.max(...dcs));
  }

  const result = {
    level,
    creatures: values.ac.length,
    stats: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, summarize(v)])),
  };
  cache.set(level, result);
  return result;
}

/**
 * Compare a creature's numbers with the official distributions.
 * @param {Record<string, number>} stats - any of ac, hp, perception, fortitude, reflex, will, attack, strikeDamage, spellDC
 * @param {{stats: Record<string, object|null>}} official
 * @returns {Array<{stat: string, value: number, rating: string, official: object|null}>}
 */
export function compareToOfficial(stats, official) {
  return Object.entries(stats)
    .filter(([, value]) => Number.isFinite(value))
    .map(([stat, value]) => ({
      stat,
      value,
      rating: rate(value, official.stats[stat]),
      official: official.stats[stat] ?? null,
    }));
}

/**
 * The comparable numbers of a built NPC actor.
 * @param {object} actor
 * @returns {Record<string, number>}
 */
export function statsOfActor(actor) {
  const s = actor.system ?? {};
  const out = {
    ac: s.attributes?.ac?.value,
    hp: s.attributes?.hp?.max,
    perception: s.perception?.mod,
    fortitude: s.saves?.fortitude?.value,
    reflex: s.saves?.reflex?.value,
    will: s.saves?.will?.value,
  };
  const items = [...(actor.items ?? [])];
  const strikes = items.filter(i => i.type === 'melee');
  if (strikes.length) {
    const best = strikes.reduce((a, b) =>
      (b.system.bonus?.value ?? 0) > (a.system.bonus?.value ?? 0) ? b : a
    );
    out.attack = best.system.bonus?.value;
    const avg = Object.values(best.system.damageRolls ?? {}).reduce(
      (sum, r) => sum + (averageOf(String(r.damage)) || 0),
      0
    );
    if (avg) out.strikeDamage = avg;
  }
  const dcs = items
    .filter(i => i.type === 'spellcastingEntry')
    .map(i => i.system.spelldc?.dc)
    .filter(Number.isFinite);
  if (dcs.length) out.spellDC = Math.max(...dcs);
  return out;
}

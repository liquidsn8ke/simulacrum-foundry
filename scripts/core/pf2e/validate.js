// SPDX-License-Identifier: MIT
/* eslint-disable complexity, max-lines-per-function -- data mapping: each optional stat-block field is a `??` default or a guard, which the complexity rule counts as a branch. Splitting would scatter one mapping across many functions. */

/**
 * Validation for built PF2e documents: the checks that catch a document which looks
 * built and silently does nothing.
 *
 * - Rule elements: built the way the system builds them, through
 *   item.prepareRuleElements(). One that fails validation is dropped or marked
 *   `ignored` with a reason; both are reported. A world item (no actor) is checked on
 *   a throwaway in-memory NPC, since pf2e only prepares rules on owned items.
 * - @UUID links in descriptions that do not resolve.
 * - Roll formulas in strike damage and @Damage enrichers that do not parse.
 * - Strike on-hit effects (attackEffects) naming abilities the actor lacks.
 * - Spells pointing at a spellcasting entry that is not there.
 * - @Check enrichers left with an empty DC (an unfilled glossary placeholder).
 *
 * The pure helpers at the top are unit-tested; validateDocument needs Foundry.
 */

/** @UUID[...] targets in a block of HTML. */
export function findUuidLinks(html) {
  return [...String(html ?? '').matchAll(/@UUID\[([^\]]+)\]/g)].map(m => m[1]);
}

/**
 * Formulas inside @Damage[...] enrichers, with flavor brackets removed.
 * "@Damage[(3d8)[piercing],(2d4)[persistent,poison]|options:area-damage]" → ["(3d8)", "(2d4)"]
 */
export function findDamageFormulas(html) {
  const out = [];
  for (const match of String(html ?? '').matchAll(/@Damage\[((?:[^[\]]|\[[^\]]*\])*)\]/g)) {
    const body = match[1].split('|')[0];
    // Split on top-level commas (not inside brackets or parentheses).
    let depth = 0;
    let current = '';
    for (const ch of body) {
      if (ch === '(' || ch === '[') depth++;
      if (ch === ')' || ch === ']') depth--;
      if (ch === ',' && depth === 0) {
        out.push(current);
        current = '';
      } else current += ch;
    }
    if (current) out.push(current);
  }
  return out.map(part => part.replace(/\[[^\]]*\]/g, '').trim()).filter(Boolean);
}

/** @Check enrichers whose DC is empty: "dc:|" or "dc:]". */
export function findEmptyDcChecks(html) {
  return [...String(html ?? '').matchAll(/@Check\[[^\]]*\bdc:(?=[|\]])[^\]]*\]/g)].map(m => m[0]);
}

/**
 * Validate a roll formula with Foundry's Roll, falling back to a permissive pattern.
 * @param {string} formula
 * @returns {boolean}
 */
export function isValidFormula(formula) {
  const Roll = globalThis.Roll;
  if (Roll?.validate) {
    try {
      return Roll.validate(formula);
    } catch {
      return false;
    }
  }
  return /^[\d\s+\-*/().d@a-z]+$/i.test(formula);
}

/** Rule-element problems on one owned item. */
function checkRules(item) {
  const problems = [];
  const source = item._source?.system?.rules ?? item.system?.rules ?? [];
  if (!source.length) return problems;
  let prepared = [];
  try {
    prepared = item.prepareRuleElements({ suppressWarnings: true }) ?? [];
  } catch (error) {
    return [`${item.name}: rule elements could not be prepared (${error.message}).`];
  }
  const known = globalThis.game?.pf2e?.RuleElements?.all ?? {};
  // pf2e passes each rule its sourceIndex; fall back to order if a version does not keep it.
  const haveIndexes = prepared.every(r => Number.isInteger(r.sourceIndex));
  const preparedByIndex = haveIndexes
    ? new Map(prepared.map(r => [r.sourceIndex, r]))
    : new Map(prepared.length === source.length ? prepared.map((r, i) => [i, r]) : []);
  source.forEach((rule, index) => {
    if (!rule || typeof rule.key !== 'string') {
      problems.push(`${item.name}: rule ${index} has no "key".`);
      return;
    }
    if (Object.keys(known).length && !known[rule.key]) {
      problems.push(`${item.name}: rule ${index} key "${rule.key}" is not a pf2e rule element.`);
      return;
    }
    const instance = preparedByIndex.get(index);
    if (!instance) {
      problems.push(
        `${item.name}: rule ${index} (${rule.key}) failed to construct and is not active.`
      );
      return;
    }
    if (instance.ignored) {
      const why =
        instance.validationFailures?.joint?.message ??
        Object.values(instance.validationFailures ?? {})
          .map(f => f?.message ?? String(f))
          .join('; ');
      problems.push(
        `${item.name}: rule ${index} (${rule.key}) is ignored${why ? `: ${why}` : ' (failed validation)'}.`
      );
    }
  });
  return problems;
}

/** Text checks on one item's description. */
async function checkText(item) {
  const problems = [];
  const html = item.system?.description?.value ?? '';
  for (const uuid of findUuidLinks(html)) {
    let doc = null;
    try {
      doc = await globalThis.fromUuid(uuid);
    } catch {
      doc = null;
    }
    if (!doc) problems.push(`${item.name}: link @UUID[${uuid}] does not resolve.`);
  }
  for (const formula of findDamageFormulas(html)) {
    if (!isValidFormula(formula))
      problems.push(`${item.name}: @Damage formula "${formula}" does not parse.`);
  }
  for (const check of findEmptyDcChecks(html)) {
    problems.push(`${item.name}: ${check} has an empty DC.`);
  }
  return problems;
}

/** Structural checks that need the whole actor. */
function checkActorStructure(actor) {
  const problems = [];
  const items = [...(actor.items ?? [])];
  const slugs = new Set(items.map(i => i.system?.slug ?? i.slug).filter(Boolean));
  const ids = new Set(items.map(i => i.id));
  for (const item of items) {
    if (item.type === 'melee') {
      for (const effect of item.system?.attackEffects?.value ?? []) {
        if (!slugs.has(effect))
          problems.push(`${item.name}: on-hit effect "${effect}" names no ability on this actor.`);
      }
      for (const roll of Object.values(item.system?.damageRolls ?? {})) {
        if (!isValidFormula(String(roll.damage)))
          problems.push(`${item.name}: damage "${roll.damage}" does not parse.`);
      }
    }
    if (item.type === 'spell') {
      const entry = item.system?.location?.value;
      if (entry && !ids.has(entry))
        problems.push(`${item.name}: its spellcasting entry ${entry} is not on this actor.`);
    }
  }
  return problems;
}

/**
 * Validate an Actor or Item (world, compendium or embedded).
 * @param {object} doc - A Foundry document
 * @returns {Promise<{ok: boolean, checked: number, problems: string[]}>}
 */
export async function validateDocument(doc) {
  const problems = [];
  let items = [];

  if (doc.documentName === 'Actor') {
    items = [...doc.items];
    problems.push(...checkActorStructure(doc));
    for (const item of items) problems.push(...checkRules(item));
  } else if (doc.documentName === 'Item') {
    items = [doc];
    if (doc.actor) {
      problems.push(...checkRules(doc));
    } else {
      // pf2e only prepares rule elements on owned items; check on a throwaway actor.
      try {
        const ActorClass = CONFIG.Actor.documentClass;
        const scratch = new ActorClass({
          name: 'Simulacrum validation',
          type: 'npc',
          items: [doc.toObject()],
        });
        const owned = scratch.items.contents[0];
        if (owned) problems.push(...checkRules(owned));
      } catch (error) {
        problems.push(
          `Rule elements could not be checked off an actor (${error.message}). Add the item to an actor and validate again.`
        );
      }
    }
  } else {
    return {
      ok: false,
      checked: 0,
      problems: [`Only Actors and Items can be validated (got ${doc.documentName}).`],
    };
  }

  for (const item of items) problems.push(...(await checkText(item)));
  return { ok: problems.length === 0, checked: items.length, problems };
}

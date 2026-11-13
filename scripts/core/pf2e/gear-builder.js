// SPDX-License-Identifier: MIT
/* eslint-disable complexity -- data mapping: each optional gear field is a guard, which the complexity rule counts as a branch. */

/**
 * Gear for the NPC builders: equipment copied from the compendium and equipped like an
 * official creature's, spell scrolls shaped like the pf2e sheet's own, and plain loot.
 * Compendium access is injected (`lookup`); no Foundry globals.
 */

import { slugify, toHTML } from './text.js';
import { PF2E_PACKS } from './compendium.js';

const ORDINAL = n => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

/**
 * A spell scroll shaped like the pf2e sheet's own (createConsumableFromSpell): the generic
 * "Scroll of Nth-rank Spell" with the spell embedded in system.spell, the spell's traits
 * merged in, and a link to the spell at the top of the description.
 */
async function buildScroll(spec, lookup, warnings) {
  const spell = await lookup([PF2E_PACKS.spells], spec.scroll, 'spell');
  if (!spell) {
    warnings.push(`Scroll spell "${spec.scroll}" was not found; the scroll was skipped.`);
    return null;
  }
  const rank = Number(spec.rank ?? spell.system.level?.value ?? 1);
  const doc = await lookup([PF2E_PACKS.equipment], `Scroll of ${ORDINAL(rank)}-rank Spell`);
  if (!doc) {
    warnings.push(`No rank ${rank} scroll template was found; the scroll was skipped.`);
    return null;
  }
  const traits = doc.system.traits ?? { value: [] };
  traits.value = [
    ...new Set([...(traits.value ?? []), ...(spell.system.traits?.value ?? [])]),
  ].sort();
  traits.rarity = spell.system.traits?.rarity ?? 'common';
  doc.system.traits = traits;
  doc.name = `Scroll of ${spell.name} (Rank ${rank})`;
  const source = spell._stats?.compendiumSource;
  doc.system.description = {
    value: `<p>${source ? `@UUID[${source}]{${spell.name}}` : spell.name}</p><hr />${doc.system.description?.value ?? ''}`,
  };
  spell.system.location = { value: null, heightenedLevel: rank };
  delete spell.sort;
  doc.system.spell = spell;
  return doc;
}

/** Plain loot (a key, letters, an art object) built on the "Gold Pieces" treasure template. */
async function buildCustomGear(spec, lookup, warnings) {
  const doc = await lookup([PF2E_PACKS.equipment], 'Gold Pieces');
  if (!doc) {
    warnings.push(`Custom item "${spec.custom}" skipped: the treasure template was not found.`);
    return null;
  }
  doc._stats = { ...(doc._stats ?? {}), compendiumSource: null };
  doc.name = spec.custom;
  doc.img = spec.img ?? 'icons/sundries/misc/key-brass.webp';
  doc.system.description = { value: toHTML(spec.description ?? '') };
  doc.system.price = { value: spec.price ?? {} };
  doc.system.quantity = Number(spec.quantity ?? 1);
  doc.system.bulk = { value: Number(spec.bulk ?? 0) };
  doc.system.slug = slugify(spec.custom);
  // The template is a coin; clear that or the sheet counts the item as currency.
  doc.system.category = spec.category ?? null;
  doc.system.publication = { license: 'ORC', remaster: true, title: '' };
  return doc;
}

/**
 * Copy a piece of gear from the equipment compendium and equip it. Also builds spell
 * scrolls ({scroll, rank}) and plain loot ({custom, price, description, img, category}).
 */
export async function buildGear(entry, lookup, nextSort, warnings) {
  const spec = typeof entry === 'string' ? { name: entry } : entry;
  if (spec.scroll || spec.custom) {
    const made = spec.scroll
      ? await buildScroll(spec, lookup, warnings)
      : await buildCustomGear(spec, lookup, warnings);
    if (!made) return null;
    if (spec.quantity) made.system.quantity = Number(spec.quantity);
    made.sort = nextSort();
    return made;
  }
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
  if (spec.price) doc.system.price = { value: spec.price };
  if (spec.description) doc.system.description = { value: toHTML(spec.description) };
  if (spec.img) doc.img = spec.img;
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

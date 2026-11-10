import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toHTML, slugify, deepMerge } from '../../scripts/core/pf2e/text.js';
import {
  buildCreatureData,
  checkCreatureSpec,
  buildAction,
} from '../../scripts/core/pf2e/npc-builder.js';
import { buildItemData, checkItemSpec } from '../../scripts/core/pf2e/item-builder.js';
import { rankMatches } from '../../scripts/core/pf2e/compendium.js';
import {
  findDamageFormulas,
  findEmptyDcChecks,
  findUuidLinks,
} from '../../scripts/core/pf2e/validate.js';
import { summarize, rate, compareToOfficial } from '../../scripts/core/pf2e/benchmark.js';

/** A fake compendium: name -> item data. */
function fakeLookup(entries) {
  const byName = new Map(Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]));
  const lookup = async (_packs, name) => {
    const hit = byName.get(String(name).toLowerCase());
    return hit ? structuredClone(hit) : null;
  };
  lookup.byUuid = async uuid =>
    byName.get(uuid.toLowerCase()) ? structuredClone(byName.get(uuid.toLowerCase())) : null;
  lookup.anyPack = (name, type) => lookup(null, name, type);
  return lookup;
}

const glossary = (name, extra = {}) => ({
  _id: 'g' + name.length,
  name,
  type: 'action',
  system: {
    description: {
      value: `<p>@Localize[PF2E.NPC.Abilities.Glossary.${name.replace(/\W/g, '')}]</p>`,
    },
    rules: [],
    slug: slugify(name),
    traits: { value: [] },
    ...extra,
  },
});

const COMPENDIUM = {
  'Frightful Presence': glossary('Frightful Presence', {
    description: {
      value: '<p>0 feet. @Check[will|dc:|options:area-effect,inflicts:frightened]</p>',
    },
    rules: [
      { key: 'Aura', radius: 0, slug: 'frightful-presence', traits: ['emotion', 'fear', 'mental'] },
    ],
  }),
  Grab: glossary('Grab'),
  'Troop Defenses': glossary('Troop Defenses'),
  'Troop Movement': glossary('Troop Movement'),
  'Form Up': glossary('Form Up'),
  Fireball: {
    _id: 'f',
    name: 'Fireball',
    type: 'spell',
    system: { level: { value: 3 }, traits: { value: ['fire'] } },
  },
  'Electric Arc': {
    _id: 'e',
    name: 'Electric Arc',
    type: 'spell',
    system: { level: { value: 1 }, traits: { value: ['cantrip'] } },
  },
  Longsword: {
    _id: 'l',
    name: 'Longsword',
    type: 'weapon',
    system: {
      equipped: { carryType: 'worn' },
      usage: { value: 'held-in-one-hand' },
      traits: { value: [] },
    },
  },
};

const baseSpec = {
  name: 'Test Brute',
  level: 5,
  size: 'large',
  traits: ['giant'],
  ac: 22,
  hp: 75,
  saves: { fortitude: 14, reflex: 9, will: 11 },
  perception: { mod: 11, senses: [{ type: 'darkvision' }] },
  abilities: { str: 5, dex: 1, con: 4, int: -1, wis: 1, cha: 0 },
};

test('toHTML formats labelled lines like official text, and passes HTML through', () => {
  assert.equal(
    toHTML('Trigger A foe moves.\nEffect It Strikes.'),
    '<p><strong>Trigger</strong> A foe moves.</p>\n<hr />\n<p><strong>Effect</strong> It Strikes.</p>'
  );
  assert.equal(toHTML('<p>keep</p>'), '<p>keep</p>');
  assert.equal(slugify("Will-o'-Wisp Bolt"), 'will-o-wisp-bolt');
});

test('deepMerge merges objects and replaces arrays', () => {
  assert.deepEqual(deepMerge({ a: { b: 1, c: [1] } }, { a: { c: [2], d: 3 } }), {
    a: { b: 1, c: [2], d: 3 },
  });
});

test('a spec with missing numbers or unknown keys is rejected with every reason', () => {
  const errors = checkCreatureSpec({ name: 'X', level: 1, saves: {}, colour: 'red' });
  assert.ok(errors.some(e => /hp/.test(e)));
  assert.ok(errors.some(e => /saves\.fortitude/.test(e)));
  assert.ok(errors.some(e => /Unknown spec keys: colour/.test(e)));
  assert.deepEqual(checkCreatureSpec(baseSpec), []);
});

test('a creature is built in official shapes, with glossary placeholders filled', async () => {
  const { actor, warnings } = await buildCreatureData(
    {
      ...baseSpec,
      gear: ['Longsword'],
      strikes: [
        {
          name: 'Fist',
          bonus: 15,
          damage: [{ formula: '2d8+7', type: 'bludgeoning' }],
          effects: ['grab'],
        },
      ],
      glossary: ['Grab', { name: 'Frightful Presence', aura: 30, dc: 22 }],
      spellcasting: [
        {
          type: 'innate',
          tradition: 'arcane',
          dc: 22,
          spells: [{ name: 'Fireball', rank: 4, uses: 1 }, { name: 'Electric Arc' }],
        },
      ],
      lore: { 'Mountain Lore': 12 },
    },
    fakeLookup(COMPENDIUM)
  );
  assert.deepEqual(warnings, []);
  assert.equal(actor.type, 'npc');
  assert.equal(actor.system.traits.size.value, 'lg');
  assert.equal(actor.prototypeToken.width, 2);

  const fp = actor.items.find(i => i.name === 'Frightful Presence');
  assert.match(fp.system.description.value, /^<p>30 feet\. @Check\[will\|dc:22\|/);
  assert.equal(fp.system.rules[0].radius, 30);

  const entry = actor.items.find(i => i.type === 'spellcastingEntry');
  const fireball = actor.items.find(i => i.name === 'Fireball');
  assert.equal(fireball.system.location.value, entry._id);
  assert.equal(fireball.system.location.heightenedLevel, 4);
  assert.deepEqual(fireball.system.location.uses, { max: 1, value: 1 });
  const cantrip = actor.items.find(i => i.name === 'Electric Arc');
  assert.equal(cantrip.system.location.heightenedLevel, undefined, 'cantrips auto-heighten');

  const sword = actor.items.find(i => i.name === 'Longsword');
  assert.equal(sword.system.equipped.carryType, 'held');
  assert.equal(actor.items.find(i => i.type === 'lore').system.mod.value, 12);
});

test('a troop gets thresholds and the three troop abilities', async () => {
  const { actor } = await buildCreatureData(
    { ...baseSpec, hp: 300, traits: ['troop'] },
    fakeLookup(COMPENDIUM)
  );
  assert.equal(actor.system.attributes.hp.details, 'Thresholds 200 (3 segments), 100 (2 segments)');
  assert.equal(actor.system.attributes.speed.details, 'troop movement');
  assert.equal(actor.prototypeToken.width, 2);
  const names = actor.items.map(i => i.name);
  for (const n of ['Troop Defenses', 'Troop Movement', 'Form Up']) assert.ok(names.includes(n), n);
  assert.match(
    actor.items.find(i => i.name === 'Troop Defenses').system.description.value,
    /Thresholds<\/strong> 200/
  );
});

test('missing compendium entries and dangling on-hit effects become warnings', async () => {
  const { warnings } = await buildCreatureData(
    {
      ...baseSpec,
      glossary: ['Nonexistent Ability'],
      strikes: [
        {
          name: 'Claw',
          bonus: 10,
          damage: [{ formula: '1d6', type: 'slashing' }],
          effects: ['knockdown'],
        },
      ],
    },
    fakeLookup(COMPENDIUM)
  );
  assert.ok(warnings.some(w => /Nonexistent Ability/.test(w)));
  assert.ok(warnings.some(w => /knockdown/.test(w)));
});

test('an aura action gets an Aura rule with only the traits given for it', () => {
  const action = buildAction({
    name: 'Wasps of Wrath',
    actions: 'passive',
    traits: ['aura', 'fungus', 'poison'],
    auraTraits: ['poison'],
    description: '<p>5 feet.</p><p>Non-demons …</p>',
  });
  assert.deepEqual(action.system.rules, [
    { key: 'Aura', radius: 5, slug: 'wasps-of-wrath', traits: ['poison'] },
  ]);
  assert.equal(action.system.category, 'defensive');
});

test('an item copied from a base keeps its data and applies the changes', async () => {
  const { item } = await buildItemData(
    {
      base: 'Longsword',
      name: 'Bonebiter',
      traits: ['magical'],
      addRules: [{ key: 'Note', selector: 'strike-damage', text: 'x' }],
      system: { runes: { potency: 1 } },
    },
    fakeLookup(COMPENDIUM)
  );
  assert.equal(item.type, 'weapon');
  assert.equal(item.name, 'Bonebiter');
  assert.equal(item.system.slug, 'bonebiter');
  assert.deepEqual(item.system.traits.value, ['magical']);
  assert.equal(item.system.runes.potency, 1);
  assert.equal(item.system.rules.length, 1);
});

test('an effect from scratch gets a duration; bad specs are rejected', async () => {
  const { item } = await buildItemData(
    {
      type: 'effect',
      name: 'Effect: Stung',
      rules: [{ key: 'FlatModifier', selector: 'ac', value: -1 }],
    },
    fakeLookup({})
  );
  assert.equal(item.system.duration.unit, 'unlimited');
  assert.equal(item.system.rules[0].key, 'FlatModifier');
  assert.ok(checkItemSpec({ type: 'gizmo', name: 'x' }).length > 0);
  assert.ok(
    checkItemSpec({ type: 'effect', name: 'x', rules: [{ value: 1 }] }).some(e => /key/.test(e))
  );
});

test('compendium matches rank exact names first and prefer remastered entries', () => {
  const ranked = rankMatches(
    [
      { name: 'Fireball Rune' },
      { name: 'Fireball', system: { publication: { remaster: false } } },
      { name: 'Fireball', system: { publication: { remaster: true } }, tag: 'remaster' },
    ],
    'fireball'
  );
  assert.equal(ranked[0].tag, 'remaster');
  assert.equal(ranked[2].name, 'Fireball Rune');
});

test('validation helpers find damage formulas, empty DCs and links in text', () => {
  const html =
    '<p>@Damage[(3d8)[piercing],(2d4)[persistent,poison]|options:area-damage] and @Check[will|dc:|basic] see @UUID[Compendium.pf2e.conditionitems.Item.x]{X}</p>';
  assert.deepEqual(findDamageFormulas(html), ['(3d8)', '(2d4)']);
  assert.equal(findEmptyDcChecks(html).length, 1);
  assert.deepEqual(findUuidLinks(html), ['Compendium.pf2e.conditionitems.Item.x']);
});

test('benchmarks summarize official values and rate a value against them', () => {
  const dist = summarize([10, 12, 14, 16, 18, 20, 22, 24, 26, 28]);
  assert.equal(dist.median, 19);
  assert.equal(rate(19, dist), 'moderate (typical)');
  assert.equal(rate(30, dist), 'above every official creature of this level');
  assert.equal(rate(27, dist), 'extreme (top 10%)');
  const cmp = compareToOfficial({ ac: 19, hp: NaN }, { stats: { ac: dist, hp: null } });
  assert.equal(cmp.length, 1);
});

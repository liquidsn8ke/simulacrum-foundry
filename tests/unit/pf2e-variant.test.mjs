import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyAdjustment,
  buildVariantData,
  checkVariantSpec,
  shiftFormula,
} from '../../scripts/core/pf2e/variant-builder.js';

function fakeLookup(entries) {
  const byName = new Map(Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]));
  const lookup = async (_packs, name) => {
    const hit = byName.get(String(name).toLowerCase());
    return hit ? structuredClone(hit) : null;
  };
  lookup.byUuid = async () => null;
  lookup.anyPack = (name, type) => lookup(null, name, type);
  return lookup;
}

const spell = (name, level, traits = []) => ({
  _id: `s${name.length}`,
  name,
  type: 'spell',
  system: { level: { value: level }, traits: { value: traits, rarity: 'common' } },
  _stats: { compendiumSource: `Compendium.pf2e.spells-srd.Item.${name.replace(/\W/g, '')}` },
});

const COMPENDIUM = {
  Glaive: {
    _id: 'glaive0000000000',
    name: 'Glaive',
    type: 'weapon',
    system: {
      runes: { potency: 0, striking: 0, property: [] },
      usage: { value: 'held-in-two-hands' },
      equipped: { carryType: 'worn' },
      traits: { value: ['deadly-d8', 'forceful', 'reach'] },
    },
  },
  'Gold Pieces': {
    _id: 'gold000000000000',
    name: 'Gold Pieces',
    type: 'treasure',
    system: { category: 'coin', price: { value: { gp: 1 } }, quantity: 1, traits: { value: [] } },
  },
  'Scroll of 2nd-rank Spell': {
    _id: 'scroll0000000000',
    name: 'Scroll of 2nd-rank Spell',
    type: 'consumable',
    system: {
      description: { value: '<p>A scroll.</p>' },
      traits: { value: ['consumable', 'magical', 'scroll'] },
    },
  },
  'Spiritual Armament': spell('Spiritual Armament', 2, ['attack', 'spirit']),
  Harm: spell('Harm', 1, ['manipulate', 'void']),
  Shield: spell('Shield', 1, ['cantrip', 'force']),
};

/** A cut-down Zealot of Asmodeus (level 4). */
function zealot() {
  return {
    _id: 'zealot0000000000',
    name: 'Zealot of Asmodeus',
    type: 'npc',
    img: 'z.webp',
    system: {
      details: { level: { value: 4 }, blurb: '', publicNotes: '', privateNotes: '' },
      attributes: {
        hp: { value: 60, max: 60 },
        ac: { value: 22, details: '(24 with shield raised)' },
        speed: { value: 20 },
      },
      saves: { fortitude: { value: 9 }, reflex: { value: 7 }, will: { value: 11 } },
      perception: { mod: 9, senses: [] },
      skills: { religion: { base: 12 } },
      abilities: { str: { mod: 4 } },
      traits: { value: ['human', 'humanoid'] },
      resources: { focus: { max: 1, value: 1 } },
    },
    prototypeToken: { name: 'Zealot of Asmodeus' },
    items: [
      {
        _id: 'mace000000000000',
        name: 'Mace',
        type: 'melee',
        sort: 100,
        system: {
          bonus: { value: 12 },
          damageRolls: { a: { damage: '1d6+4', damageType: 'bludgeoning' } },
        },
      },
      {
        _id: 'fist000000000000',
        name: 'Fist',
        type: 'melee',
        sort: 200,
        system: {
          bonus: { value: 12 },
          damageRolls: { a: { damage: '1d4+4', damageType: 'bludgeoning' } },
        },
      },
      {
        _id: 'smite00000000000',
        name: 'Channel Smite',
        type: 'action',
        sort: 300,
        system: { description: { value: '<p>@Check[fortitude|dc:21]</p>' } },
      },
      {
        _id: 'entry00000000000',
        name: 'Divine Prepared Spells',
        type: 'spellcastingEntry',
        sort: 400,
        system: { spelldc: { dc: 19, value: 11 }, prepared: { value: 'prepared' } },
      },
      {
        _id: 'oldharm000000000',
        name: 'Harm',
        type: 'spell',
        sort: 500,
        system: { location: { value: 'entry00000000000' } },
      },
    ],
  };
}

test('shiftFormula moves the flat part and appends one when missing', () => {
  assert.equal(shiftFormula('1d6+4', -2), '1d6+2');
  assert.equal(shiftFormula('1d8+2', -2), '1d8');
  assert.equal(shiftFormula('2d6', 2), '2d6+2');
  assert.equal(shiftFormula('1d4-1', -2), '1d4-3');
});

test('weak adjustment follows GM Core', () => {
  const a = zealot();
  const warnings = [];
  applyAdjustment(a, 'weak', warnings);
  assert.equal(a.system.details.level.value, 3);
  assert.equal(a.system.attributes.hp.max, 45);
  assert.equal(a.system.attributes.ac.value, 20);
  assert.equal(a.system.attributes.ac.details, '(22 with shield raised)');
  assert.deepEqual(
    [a.system.saves.fortitude.value, a.system.saves.reflex.value, a.system.saves.will.value],
    [7, 5, 9]
  );
  assert.equal(a.system.perception.mod, 7);
  assert.equal(a.system.skills.religion.base, 10);
  assert.equal(a.items[1].system.bonus.value, 10);
  assert.equal(a.items[1].system.damageRolls.a.damage, '1d4+2');
  assert.equal(a.items[2].system.description.value, '<p>@Check[fortitude|dc:19]</p>');
  assert.deepEqual(a.items[3].system.spelldc, { dc: 17, value: 9 });
});

test('elite level 0 gains two levels; weak level 1 drops two', () => {
  const a = zealot();
  a.system.details.level.value = 0;
  applyAdjustment(a, 'elite', []);
  assert.equal(a.system.details.level.value, 2);
  const b = zealot();
  b.system.details.level.value = 1;
  applyAdjustment(b, 'weak', []);
  assert.equal(b.system.details.level.value, -1);
});

test('a Hosilla-style variant keeps the base, swaps items, and links the strike', async () => {
  const spec = {
    base: 'Zealot of Asmodeus',
    adjustment: 'weak',
    name: 'Hosilla',
    remove: ['Mace'],
    acDetails: '',
    gear: [
      { name: 'Glaive', runes: { potency: 1 } },
      { scroll: 'Spiritual Armament', rank: 2 },
      { custom: 'Lockbox Key', description: 'A key.' },
    ],
    strikes: [
      {
        name: 'Glaive',
        weapon: 'Glaive',
        bonus: 10,
        traits: ['reach'],
        damage: [{ formula: '1d8+2', type: 'slashing' }],
      },
    ],
    spellcasting: [
      {
        name: 'Divine Prepared Spells',
        type: 'prepared',
        tradition: 'divine',
        dc: 17,
        attack: 7,
        spells: [{ name: 'Harm', rank: 2, copies: 4 }, { name: 'Shield' }],
      },
    ],
  };
  assert.deepEqual(checkVariantSpec(spec), []);
  const { actor, warnings, removed } = await buildVariantData(
    spec,
    zealot(),
    fakeLookup(COMPENDIUM),
    {
      baseUuid: 'Compendium.pf2e.pathfinder-npc-core.Actor.zealot',
    }
  );
  assert.deepEqual(warnings, []);
  assert.equal(actor.name, 'Hosilla');
  assert.equal(actor.prototypeToken.name, 'Hosilla');
  assert.equal(actor._id, undefined);
  assert.equal(actor.system.attributes.ac.details, '');
  assert.deepEqual(removed.sort(), [
    'Divine Prepared Spells (spellcastingEntry)',
    'Harm (spell)',
    'Mace (melee)',
  ]);
  assert.equal(actor.system.resources.focus, undefined, 'unused focus pool dropped');

  const names = actor.items.map(i => `${i.type}:${i.name}`);
  assert.ok(names.includes('melee:Fist') && names.includes('action:Channel Smite'));
  assert.ok(!names.includes('melee:Mace'));

  const weapon = actor.items.find(i => i.type === 'weapon');
  const strike = actor.items.find(i => i.type === 'melee' && i.name === 'Glaive');
  assert.equal(weapon.system.runes.potency, 1);
  assert.equal(weapon.system.equipped.handsHeld, 2);
  assert.equal(strike.flags.pf2e.linkedWeapon, weapon._id);
  assert.equal(strike.system.bonus.value, 10, 'listed strikes are taken as printed');

  const scroll = actor.items.find(i => i.type === 'consumable');
  assert.equal(scroll.name, 'Scroll of Spiritual Armament (Rank 2)');
  assert.equal(scroll.system.spell.system.location.heightenedLevel, 2);
  assert.match(scroll.system.description.value, /@UUID\[Compendium\.pf2e\.spells-srd/);

  const key = actor.items.find(i => i.name === 'Lockbox Key');
  assert.equal(key.system.category, null);

  const entry = actor.items.find(i => i.type === 'spellcastingEntry');
  assert.deepEqual(entry.system.spelldc, { dc: 17, mod: 0, value: 7 });
  assert.equal(entry.system.slots.slot2.prepared.length, 4);
  assert.ok(
    Math.min(...actor.items.filter(i => !i.sort || i.sort > 500).map(i => i.sort)) > 500,
    'added items sort after the base'
  );
  assert.equal(
    actor.flags['simulacrum-pf2e'].variantOf,
    'Compendium.pf2e.pathfinder-npc-core.Actor.zealot'
  );
});

test('variant spec errors name the problem', () => {
  assert.match(checkVariantSpec({ name: 'x' })[0], /base/);
  assert.match(checkVariantSpec({ base: 'x', adjustment: 'tough' })[0], /weak/);
  assert.match(checkVariantSpec({ base: 'x', hitpoints: 3 })[0], /Unknown variant keys: hitpoints/);
});

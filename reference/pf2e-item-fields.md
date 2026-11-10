# PF2e items and hazards: field shapes

Verified against the pf2e system compendia (pf2e 8.4-8.7, Foundry 14). Every item has
`name`, `type`, `img`, and `system` with at least `description.value` (HTML), `rules` (array of
rule elements, see pf2e-rule-elements.md), `slug`, `traits.value` and `traits.rarity`.

The quickest correct way to make one is to start from an official item that is close and change
what differs: `pf2e_lookup` finds it, `pf2e_build_item` with `base` copies it and applies your
changes. Building from nothing works too; the system fills defaults for omitted fields.

## Physical items (weapon, armor, shield, equipment, consumable, treasure, ammo, backpack)

Common to all: `level.value`, `price.value: {gp, sp, cp}` (`price.per` for bundles), `bulk.value`
(0.1 = light), `quantity`, `size`, `hardness`, `hp {max, value}`, `material {type, grade}`,
`equipped.carryType` (held/worn/stowed/dropped), `usage.value`, `containerId`,
`traits.value` (e.g. `magical`, `invested`, `consumable`, `uncommon` via `rarity`).

**weapon**
```json
{"baseItem":"longsword","category":"martial","group":"sword",
 "damage":{"dice":1,"die":"d8","damageType":"slashing"},
 "range":null,"reload":{"value":"-"},
 "runes":{"potency":0,"striking":0,"property":[]},
 "bonus":{"value":0},"bonusDamage":{"value":0},"splashDamage":{"value":0},
 "usage":{"value":"held-in-one-hand"},
 "traits":{"value":["versatile-p"]}}
```
category: simple, martial, advanced, unarmed. Ranged: `range: 60`, `reload.value: "0"`.
`runes.property` takes rune slugs (`flaming`, `ghost-touch`, …).

**armor**: `category` (unarmored, light, medium, heavy), `group`, `acBonus`, `dexCap`,
`checkPenalty`, `speedPenalty`, `strength`, `runes {potency, resilient, property}`.

**shield**: `acBonus`, `hardness`, `hp {max, value}`, `speedPenalty`, `runes {reinforcing}`.

**consumable**: `category` (potion, elixir, scroll, wand, talisman, ammo, oil, poison, snare,
drug, gadget, mutagen, food, other …), `uses {value, max, autoDestroy}`,
`damage {formula, type, kind}` for healing/damaging consumables, and for scrolls and wands a
`spell` object (the embedded spell). Poisons and afflictions put stages in the description.

**equipment** (worn items, held items, tools): `usage.value` names the slot (`worn`,
`wornarmbands`, `wornamulet`, `worncloak`, `wornbelt`, `wornboots`, `wornbracers`, `worngloves`,
`wornheadwear`, `wornnecklace`, `wornring`, `held-in-one-hand`, …). Its powers are rule elements
and activations described in the text. Example (Bands of Force, level 8, invested):
```json
{"rules":[{"key":"FlatModifier","selector":["ac","saving-throw"],"slug":"bands-of-force","type":"item","value":1}],
 "traits":{"value":["force","invested","magical"]},"usage":{"value":"wornarmbands"}}
```

**treasure**: `price`, `quantity`, `category` (gem, art-object, coin …).

## spell
```json
{"level":{"value":3},
 "traits":{"value":["concentrate","fire","manipulate"],"traditions":["arcane","primal"],"rarity":"common"},
 "time":{"value":"2"},"range":{"value":"500 feet"},
 "area":{"type":"burst","value":20},"target":{"value":""},
 "duration":{"value":"","sustained":false},
 "defense":{"save":{"statistic":"reflex","basic":true}},
 "damage":{"0":{"formula":"6d6","type":"fire","kinds":["damage"],"category":null,"applyMod":false,"materials":[]}},
 "heightening":{"type":"interval","interval":1,"damage":{"0":"2d6"}},
 "requirements":"","cost":{"value":""},"counteraction":false}
```
- Cantrips carry the `cantrip` trait; focus spells the `focus` trait.
- `time.value`: "1", "2", "3", "reaction", "free", "1 to 3", "1 minute" …
- `defense`: `{save: {statistic, basic}}`, or `{passive: {statistic: "ac"}}` for spell attacks, or null.
- `damage` entries are keyed "0", "1", …; `kinds` is `["damage"]`, `["healing"]` or both.
- `heightening`: `{type:"interval", interval, damage:{"0":"2d6"}}` or
  `{type:"fixed", levels:{"3":{…overrides…}}}`.
- Variants (Heal's 1/2/3-action forms) are `overlays` keyed by id.

## effect
```json
{"level":{"value":2},
 "duration":{"value":1,"unit":"minutes","expiry":"turn-start","sustained":false},
 "start":{"value":0,"initiative":null},
 "tokenIcon":{"show":true},
 "badge":{"type":"counter","value":3},
 "rules":[ … ]}
```
- `duration.unit`: rounds, minutes, hours, days, unlimited, encounter; `expiry`: turn-start,
  turn-end, round-end, or null.
- `badge` is optional: `{type:"counter", value}` or `{type:"value", value}` or a formula.
- An effect does its work through `rules`. Effects are applied by dragging, by `@UUID` links in
  chat, by Aura rules (`effects: [{uuid, affects, events}]`) or by `GrantItem`.
- Give a homebrew effect a stable home (a world Item, or a compendium) so its UUID never changes;
  auras and links point at that UUID.

## feat
```json
{"category":"skill","level":{"value":1},
 "actionType":{"value":"passive"},"actions":{"value":null},
 "prerequisites":{"value":[{"value":"trained in Athletics"}]},
 "traits":{"value":["general","skill"]}}
```
category: ancestry, class, classfeature, general, skill, bonus, pfsboon, deityboon, curse.

## action (abilities on NPCs and hazards, and stand-alone actions)
See pf2e-npc-fields.md: `actionType`, `actions`, `category`, `frequency`, `traits`, `rules`.

## Hazards: Actor `type: "hazard"`
```json
{"attributes":{
   "ac":{"value":21},"hardness":12,"hasHealth":true,
   "hp":{"value":48,"max":48,"details":"Panel Hardness: 5, Panel HP: 20 (BT 10)"},
   "immunities":[{"type":"critical-hits"},{"type":"precision"}],
   "weaknesses":[{"type":"fire","value":10}],
   "stealth":{"value":11,"details":"<p>(trained)</p>"},
   "emitsSound":"encounter"},
 "details":{
   "level":{"value":4},"isComplex":true,
   "description":"<p>…</p>",
   "disable":"<p>@Check[thievery|dc:21|traits:action:disable-a-device] (trained) …</p>",
   "routine":"<p>(3 actions) …</p>",
   "reset":"<p>…</p>"},
 "saves":{"fortitude":{"value":10},"reflex":{"value":12},"will":{"value":0}},
 "traits":{"rarity":"common","size":{"value":"med"},"value":["mechanical","trap"]}}
```
- Hazard traits: trap, mechanical, magical, environmental, haunt, fungus …
- Its reactions and passives are embedded `action` items; its attacks are `melee` items; an aura
  is an `action` with an Aura rule, exactly as on NPCs.
- `stealth.value` is the modifier (DC = 10 + value); "(trained)" etc. goes in `details`.
- Create hazards with `create_document` (`documentType: "Actor"`, `type: "hazard"`), then add
  their abilities with `pf2e_build_item`.

## Journal entries
Journals are core Foundry documents: `JournalEntry` with `pages: [{name, type:"text",
text:{content:"<p>…</p>"}}]`. Use `create_document`. Enrichers (@Check, @UUID …) work in pages.

# PF2e rule elements

Rule elements are the JSON objects in an item's `system.rules` array. They are how the pf2e
system automates nearly everything: bonuses, extra damage dice, toggles, auras, resistances,
granted items, notes on rolls. This file is the reference for writing them. The second half is
generated from the system's own compendia: every rule-element key official content uses, the
fields it uses with them, and real examples to copy.

## How they work
- A rule element is active while its item is on an actor (and, for equipment, equipped/invested
  as its `requiresEquipped` / `requiresInvestment` say).
- A rule element that fails validation is **ignored, with only a console warning** — the item
  looks built and does nothing. `pf2e_validate` reports ignored rule elements; run it after
  every build.
- Values can be numbers, formulas (`"5 + 5*floor((@item.level -4)/2)"`) or injected references
  (`"{item|system.level.value}"`, `"{actor|system.abilities.str.mod}"`, `"{item|_id}"`).

## Selectors (what a modifier, dice or note applies to)
Most used in official data: `saving-throw`, `fortitude`, `reflex`, `will`, `ac`, `perception`,
`skill-check`, any skill slug (`athletics`, `stealth` …), `attack`, `attack-roll`,
`strike-attack-roll`, `strike-damage`, `damage`, `melee-strike-damage`, `spell-attack-roll`,
`spell-damage`, `spell-dc`, `initiative`, `land-speed`, `fly-speed`, `all-speeds`, `hp`,
`damage-received`, `inline-damage`, `{item|_id}-damage`, `{item|_id}-attack`,
`<strike slug>-damage` (e.g. `jaws-damage`, `tail-damage`), `<save>-dc`, `perception-dc`.

## Predicates (when a rule applies)
A predicate is a list of roll options that must all be present. Operators: `{"not": "x"}`,
`{"or": [...]}`, `{"and": [...]}`, `{"nor": [...]}`, numeric `{"gte": ["hp-percent", 50]}`,
`{"lt": [...]}`, `{"lte": [...]}`, `{"gt": [...]}`, `{"eq": [...]}`.

Common terms in official data:
- `item:trait:<trait>`, `item:slug:<slug>`, `item:magical`, `item:type:spell`, `item:tag:<tag>`
- `target:condition:<condition>`, `target:trait:<trait>`, `target:effect:<slug>`
- `self:condition:<condition>`, `self:effect:<slug>`, `self:trait:<trait>`, `self:type:npc`
- `origin:trait:<trait>` (the thing affecting you)
- `action:<slug>` (e.g. `action:grapple`), `inflicts:<condition>` (checks that would impose it)
- `hp-percent` and `hp-remaining` (numeric; e.g. `{"lt": ["hp-percent", 50]}`)
- your own toggle's option name (from a RollOption) — the usual way to switch something on
- trait words directly on rolls: `mental`, `fear`, `emotion`, `poison`, `disease`, `visual`

## Patterns used constantly
- **Status bonus to saves vs. magic:** `{"key":"FlatModifier","predicate":["item:magical"],"selector":"saving-throw","type":"status","value":1}`
- **Extra damage while a condition holds:** RollOption (toggleable) + DamageDice with that predicate (see Scarecrow's Clawing Fear below).
- **Toggle on the sheet:** `{"key":"RollOption","option":"retaliatory-strike","toggleable":true,"domain":"damage"}`
- **Aura:** `{"key":"Aura","radius":30,"slug":"frightful-presence","traits":["emotion","fear","mental"]}` plus the `aura` trait on the action and "30 feet." as the first line of its text.
  `traits` must be **effect traits** (fear, mental, poison, olfactory, visual, emotion …); a
  creature trait such as `fungus` makes the whole rule invalid.
  An Aura can also apply an effect item: `"effects":[{"uuid":"<effect uuid>","affects":"enemies","events":["enter","turn-start"],"save":{"type":"fortitude","dc":21}}]`.
  It cannot deal damage by itself; put `@Damage`/`@Check` buttons in the text.
- **Resistance / weakness / immunity granted by an item or effect:** `{"key":"Resistance","type":"fire","value":5}`
- **Note on a roll result:** `{"key":"Note","selector":"saving-throw","outcome":["failure","criticalFailure"],"predicate":[…],"title":"{item|name}","text":"…","visibility":"gm"}` — `visibility` is `gm` or `owner`.
- **Granting a condition or effect while the item is held:** `{"key":"GrantItem","uuid":"Compendium.pf2e.conditionitems.Item.…"}`
- **Light:** `{"key":"TokenLight","value":{"bright":20,"dim":40,"color":"#9b7337","animation":{"type":"torch","speed":1,"intensity":4}},"predicate":["baleful-glow"]}`

## Generated catalog

### FlatModifier

Used 3867 times in official data. Fields (bold = used by most): **selector**, **value**, **type**, **predicate**, slug, label, damageType, hideIfDisabled, damageCategory, removeAfterRoll, critical, requiresEquipped, ability, fromEquipment, requireInvestment, phase, tags, force, roll-option

```json
{"key":"FlatModifier","predicate":["item:magical"],"selector":"saving-throw","type":"status","value":1}
```
<sub>from +1 Status to All Saves vs. Magic (pathfinder-monster-core)</sub>

```json
{"key":"FlatModifier","predicate":["mental"],"selector":"will","type":"status","value":4}
```
<sub>from +4 Status to Will Saves vs. Mental (pathfinder-monster-core)</sub>

```json
{"key":"FlatModifier","predicate":["item:trait:occult"],"selector":"saving-throw","type":"status","value":2}
```
<sub>from +2 Status to All Saves vs. Occult (pathfinder-monster-core)</sub>

### RollOption

Used 1796 times in official data. Fields (bold = used by most): **option**, **toggleable**, label, suboptions, domain, mergeable, placement, alwaysActive, value, predicate, selection, priority, disabledIf, disabledValue, requiresEquipped, phase, count, selector, prompt, removeAfterRoll

```json
{"alwaysActive":true,"key":"RollOption","option":"akhana-fist","suboptions":[{"label":"PF2E.TraitVitality","value":"vitality"},{"label":"PF2E.TraitVoid","value":"void"}],"toggleable":true}
```
<sub>from Fist (pathfinder-monster-core)</sub>

```json
{"domain":"damage","key":"RollOption","option":"pack-attack","toggleable":true}
```
<sub>from Pack Attack (pathfinder-monster-core)</sub>

```json
{"domain":"damage","key":"RollOption","label":"PF2E.SpecificRule.TwoHanded.BastardSword","option":"two-handed","toggleable":true}
```
<sub>from Bastard Sword (pathfinder-monster-core)</sub>

### ItemAlteration

Used 1776 times in official data. Fields (bold = used by most): **mode**, **property**, **value**, **predicate**, **itemType**, itemId, priority, label, fromEquipment, definition, requiresEquipped, placement, phase, selector

```json
{"itemType":"melee","key":"ItemAlteration","mode":"add","predicate":["lunging-bite","item:slug:jaws"],"property":"traits","value":"reach-20"}
```
<sub>from Lunging Bite (pathfinder-monster-core)</sub>

```json
{"itemType":"melee","key":"ItemAlteration","mode":"remove","predicate":["item:slug:jaws","change-shape:lizard"],"property":"traits","value":"disease"}
```
<sub>from Change Shape (pathfinder-monster-core)</sub>

```json
{"itemType":"melee","key":"ItemAlteration","mode":"remove","predicate":["item:slug:jaws","change-shape:lizard"],"property":"traits","value":"magical"}
```
<sub>from Change Shape (pathfinder-monster-core)</sub>

### ActiveEffectLike

Used 1019 times in official data. Fields (bold = used by most): **mode**, **path**, **value**, predicate, priority, phase

```json
{"key":"ActiveEffectLike","mode":"override","path":"system.attributes.hp.negativeHealing","value":true}
```
<sub>from Void Healing (pathfinder-monster-core)</sub>

```json
{"key":"ActiveEffectLike","mode":"override","path":"system.attributes.flanking.flankable","predicate":["implant-core"],"value":false}
```
<sub>from Manifold Vision (pathfinder-monster-core)</sub>

```json
{"key":"ActiveEffectLike","mode":"override","path":"system.attributes.flanking.flankable","value":false}
```
<sub>from All-Around Vision (pathfinder-monster-core)</sub>

### GrantItem

Used 870 times in official data. Fields (bold = used by most): **uuid**, predicate, inMemoryOnly, allowDuplicate, onDeleteActions, alterations, flag, reevaluateOnUpdate, preselectChoices, requiresEquipped, preselectCoices, priority, adjustName, track

```json
{"allowDuplicate":false,"key":"GrantItem","predicate":[{"or":["change-shape:octopus","change-shape:scorpion"]}],"reevaluateOnUpdate":true,"uuid":"Compendium.pf2e.bestiary-ability-glossary-srd.Item.Tkd8sH4pwFIPzqTr"}
```
<sub>from Change Shape (pathfinder-monster-core)</sub>

```json
{"key":"GrantItem","predicate":["change-shape:dog"],"reevaluateOnUpdate":true,"uuid":"Compendium.pf2e.bestiary-ability-glossary-srd.Item.BCLvAx4Pz4MLa2pu"}
```
<sub>from Change Shape (pathfinder-monster-core)</sub>

```json
{"inMemoryOnly":true,"key":"GrantItem","uuid":"Compendium.pf2e.conditionitems.Item.nlCjDvLMf2EkV2dl"}
```
<sub>from Spell Effect: Haste (pathfinder-monster-core)</sub>

### DamageDice

Used 852 times in official data. Fields (bold = used by most): **selector**, **diceNumber**, **dieSize**, **predicate**, **damageType**, category, override, critical, hideIfDisabled, label, slug, tags, toggleable, diceSize, dieFaces

```json
{"damageType":"void","diceNumber":3,"dieSize":"d6","key":"DamageDice","predicate":["target:mode:living"],"selector":"strike-damage"}
```
<sub>from Shepherd's Touch (pathfinder-monster-core)</sub>

```json
{"damageType":"vitality","diceNumber":3,"dieSize":"d6","key":"DamageDice","predicate":["target:mode:undead"],"selector":"strike-damage"}
```
<sub>from Shepherd's Touch (pathfinder-monster-core)</sub>

```json
{"damageType":"vitality","diceNumber":1,"key":"DamageDice","predicate":["akhana-fist:vitality"],"selector":"fist-damage"}
```
<sub>from Fist (pathfinder-monster-core)</sub>

### ChoiceSet

Used 816 times in official data. Fields (bold = used by most): **choices**, **prompt**, **flag**, rollOption, adjustName, predicate, priority, actorFlag, label, allowedDrops, allowNoSelection, requiresEquipped, slug

```json
{"choices":{"config":"skills"},"flag":"skill","key":"ChoiceSet","prompt":"PF2E.SpecificRule.Prompt.Skill"}
```
<sub>from Essence Charm (equipment)</sub>

```json
{"adjustName":false,"choices":[{"label":"PF2E.TraitArcane","value":"force"},{"label":"PF2E.TraitDivine","value":"spirit"},{"label":"PF2E.TraitOccult","value":"mental"},{"label":"PF2E.TraitPrimal","value":"fire"}],"flag":"resistance","key":"ChoiceSet"}
```
<sub>from Wyrm's Wingspan (equipment)</sub>

```json
{"adjustName":false,"choices":[{"label":"PF2E.Skill.Nature","value":"nature"},{"label":"PF2E.Skill.Religion","value":"religion"},{"label":"PF2E.Skill.Survival","value":"survival"}],"flag":"skill","key":"ChoiceSet","prompt":"PF2E.SpecificRule.Prompt.Skill"}
```
<sub>from Soulcutter (Heroic) (equipment)</sub>

### Note

Used 728 times in official data. Fields (bold = used by most): **selector**, **text**, **title**, **outcome**, **predicate**, visibility

```json
{"key":"Note","outcome":["criticalSuccess"],"selector":"attack-roll","text":"{item|description}","title":"{item|name}","visibility":"owner"}
```
<sub>from Impending Fate (pathfinder-monster-core)</sub>

```json
{"key":"Note","selector":"jaws-damage","text":"{item|description}","title":"{item|name}","visibility":"owner"}
```
<sub>from Curse of the Wererat (pathfinder-monster-core)</sub>

```json
{"key":"Note","predicate":["twisting-tail"],"selector":"tail-attack","text":"PF2E.AttackEffects.InterruptAction","title":"{item|name}","visibility":"gm"}
```
<sub>from Twisting Tail (pathfinder-monster-core)</sub>

### Resistance

Used 617 times in official data. Fields (bold = used by most): **type**, **value**, predicate, exceptions, label, definition, doubleVs, mode, slug

```json
{"key":"Resistance","predicate":["ghost-dodge"],"type":["spirit","void"],"value":5}
```
<sub>from Ghost Dodge (pathfinder-monster-core)</sub>

```json
{"key":"Resistance","predicate":["divine-deflection"],"type":"all-damage","value":10}
```
<sub>from Divine Deflection (pathfinder-monster-core)</sub>

```json
{"key":"Resistance","predicate":["gnomish-shift"],"type":"all-damage","value":2}
```
<sub>from Gnomish Shift (pathfinder-monster-core)</sub>

### Aura

Used 400 times in official data. Fields (bold = used by most): **radius**, **traits**, **slug**, predicate, effects, level, value

```json
{"key":"Aura","radius":60,"slug":"frightful-presence","traits":["emotion","fear","mental"]}
```
<sub>from Frightful Presence (pathfinder-monster-core)</sub>

```json
{"key":"Aura","radius":30,"slug":"vortex","traits":["water"]}
```
<sub>from Vortex (pathfinder-monster-core)</sub>

```json
{"key":"Aura","radius":120,"traits":["incapacitation","mental"]}
```
<sub>from Mirage Spores (pathfinder-monster-core)</sub>

### AdjustModifier

Used 333 times in official data. Fields (bold = used by most): **selector**, **slug**, **predicate**, **mode**, **value**, suppress, selectors, requiresEquipped, relabel, priority, type, requiresInvested, damageType, maxApplications

```json
{"key":"AdjustModifier","predicate":["penalty:type:circumstance"],"selector":"land-speed","suppress":true}
```
<sub>from Spell Effect: Unfettered Movement (pathfinder-monster-core-2)</sub>

```json
{"key":"AdjustModifier","mode":"upgrade","predicate":["rubble","in-rubble"],"selectors":["deception-dc","deception"],"slug":"rubble-bonus","value":22}
```
<sub>from Mimic Object (pathfinder-monster-core-2)</sub>

```json
{"key":"AdjustModifier","mode":"upgrade","predicate":["feign-copse","in-forest"],"selectors":["deception-dc","deception"],"slug":"feign-copse-bonus","value":35}
```
<sub>from Feign Copse (pathfinder-monster-core-2)</sub>

### BaseSpeed

Used 281 times in official data. Fields (bold = used by most): **selector**, **value**, predicate, slug

```json
{"key":"BaseSpeed","predicate":["change-shape:animal"],"selector":"climb-speed","value":10}
```
<sub>from Change Shape (pathfinder-monster-core)</sub>

```json
{"key":"BaseSpeed","predicate":["change-shape:dog"],"selector":"land","value":35}
```
<sub>from Change Shape (pathfinder-monster-core)</sub>

```json
{"key":"BaseSpeed","predicate":[{"or":["change-shape:lizard","change-shape:octopus"]}],"selector":"land","value":20}
```
<sub>from Change Shape (pathfinder-monster-core)</sub>

### AdjustDegreeOfSuccess

Used 269 times in official data. Fields (bold = used by most): **selector**, **adjustment**, **predicate**, type, adjusment, label

```json
{"adjustment":{"success":"to-critical-success"},"key":"AdjustDegreeOfSuccess","predicate":["check:total:natural:19",{"gte":["check:total:delta",0]}],"selector":"strike-attack-roll"}
```
<sub>from Powerful Blows (pathfinder-monster-core)</sub>

```json
{"adjustment":{"success":"one-degree-better"},"key":"AdjustDegreeOfSuccess","predicate":["check:total:natural:19",{"or":["item:damage:type:slashing","item:damage:type:piercing"]}],"selector":"{item|_id}-attack"}
```
<sub>from Keen Returning Hatchet (pathfinder-monster-core)</sub>

```json
{"adjustment":{"success":"one-degree-better"},"key":"AdjustDegreeOfSuccess","selector":"reflex"}
```
<sub>from Evasive Maneuvers (pathfinder-monster-core)</sub>

### Strike

Used 249 times in official data. Fields (bold = used by most): **damage**, **label**, **traits**, **category**, **predicate**, **slug**, **img**, **group**, range, baseType, attackModifier, fist, otherTags, replaceAll, acuity, options

```json
{"attackModifier":18,"damage":{"base":{"damageType":"piercing","dice":2,"die":"d8","modifier":6}},"key":"Strike","label":"PF2E.BattleForm.Attack.Quill","predicate":["change-shape:porcupine-giant"],"replaceAll":true,"slug":"quill","traits":[]}
```
<sub>from Change Shape (pathfinder-monster-core)</sub>

```json
{"attackModifier":10,"damage":{"base":{"damageType":"bludgeoning","dice":1,"die":"d4","modifier":2}},"key":"Strike","label":"PF2E.Strike.Fist.Label","predicate":["change-shape:humanoid"],"slug":"fist","traits":["unarmed"]}
```
<sub>from Change Shape (pathfinder-monster-core)</sub>

```json
{"attackModifier":10,"damage":{"base":{"damageType":"piercing","dice":1,"die":"d8","modifier":2}},"key":"Strike","label":"PF2E.BattleForm.Attack.Jaws","predicate":[{"not":"change-shape:humanoid"}],"slug":"jaws","traits":["finesse"]}
```
<sub>from Change Shape (pathfinder-monster-core)</sub>

### AdjustStrike

Used 203 times in official data. Fields (bold = used by most): **mode**, **property**, **value**, **definition**, predicate, selector, priority, itemType

```json
{"key":"AdjustStrike","mode":"add","property":"property-runes","value":"ghost-touch"}
```
<sub>from Shepherd's Touch (pathfinder-monster-core)</sub>

```json
{"definition":[{"not":"item:category:unarmed"}],"key":"AdjustStrike","mode":"add","property":"property-runes","value":"ghost-touch"}
```
<sub>from Ghost Hunter (pathfinder-monster-core)</sub>

```json
{"definition":["item:slug:scythe"],"key":"AdjustStrike","mode":"add","property":"materials","value":"adamantine"}
```
<sub>from Infuse Weapon (pathfinder-monster-core)</sub>

### DamageAlteration

Used 200 times in official data. Fields (bold = used by most): **property**, **selectors**, **value**, **mode**, **predicate**, slug, requiresEquipped, priority

```json
{"key":"DamageAlteration","mode":"upgrade","predicate":["two-handed"],"property":"dice-faces","selectors":["{item|_id}-damage"],"slug":"base","value":12}
```
<sub>from Bastard Sword (pathfinder-monster-core)</sub>

```json
{"key":"DamageAlteration","mode":"override","predicate":["phantom-touch"],"property":"damage-type","selectors":["strike-damage"],"value":"spirit"}
```
<sub>from Phantom Touch (pathfinder-monster-core)</sub>

```json
{"key":"DamageAlteration","mode":"upgrade","predicate":["two-handed"],"property":"dice-faces","selectors":["{item|_id}-damage"],"slug":"base","value":8}
```
<sub>from Staff (pathfinder-monster-core)</sub>

### TempHP

Used 161 times in official data. Fields (bold = used by most): **value**, predicate, events

```json
{"key":"TempHP","value":15}
```
<sub>from Belt of Long Life (equipment)</sub>

```json
{"key":"TempHP","predicate":["vessels-form"],"value":40}
```
<sub>from Vessel's Form (feats)</sub>

```json
{"key":"TempHP","value":"2*@item.level"}
```
<sub>from Spell Effect: Euphoric Renewal (spell-effects)</sub>

### TokenLight

Used 153 times in official data. Fields (bold = used by most): **value**, **predicate**, type

```json
{"key":"TokenLight","predicate":["baleful-glow"],"value":{"animation":{"intensity":4,"speed":1,"type":"torch"},"bright":20,"color":"#9b7337","dim":40,"shadows":0.2}}
```
<sub>from Baleful Glow (pathfinder-monster-core)</sub>

```json
{"key":"TokenLight","predicate":["luminescent-aura"],"value":{"animation":{"intensity":2,"speed":8,"type":"pulse"},"bright":10,"color":"#fff9a3"}}
```
<sub>from Luminescent Aura (pathfinder-monster-core)</sub>

```json
{"key":"TokenLight","predicate":[{"not":"go-dark"}],"value":{"alpha":0.2,"animation":{"intensity":1,"speed":3,"type":"pulse"},"bright":20,"color":"#fff9a3"}}
```
<sub>from Glow (pathfinder-monster-core)</sub>

### Weakness

Used 153 times in official data. Fields (bold = used by most): **type**, **value**, predicate, definition, mode, label

```json
{"definition":["bean-panic"],"key":"Weakness","type":"custom","value":1}
```
<sub>from Bean Panic (pathfinder-monster-core)</sub>

```json
{"key":"Weakness","predicate":["bean-panic"],"type":"spirit","value":20}
```
<sub>from Bean Panic (pathfinder-monster-core)</sub>

```json
{"key":"Weakness","predicate":["bean-panic"],"type":"spirit","value":25}
```
<sub>from Bean Panic (pathfinder-monster-core)</sub>

### FastHealing

Used 137 times in official data. Fields (bold = used by most): **value**, type, predicate, deactivatedBy, details

```json
{"key":"FastHealing","value":20}
```
<sub>from Fast Healing 20 (pathfinder-monster-core)</sub>

```json
{"deactivatedBy":["cold-iron"],"key":"FastHealing","type":"regeneration","value":20}
```
<sub>from Regeneration 20 (Deactivated by Cold Iron) (pathfinder-monster-core)</sub>

```json
{"key":"FastHealing","predicate":["filth-wallow"],"value":2}
```
<sub>from Filth Wallow (pathfinder-monster-core)</sub>

### Sense

Used 127 times in official data. Fields (bold = used by most): **selector**, predicate, range, acuity

```json
{"acuity":"imprecise","key":"Sense","predicate":["change-shape:dog"],"range":30,"selector":"scent"}
```
<sub>from Change Shape (pathfinder-monster-core)</sub>

```json
{"key":"Sense","selector":"see-invisibility"}
```
<sub>from Spell Effect: See the Unseen (pathfinder-monster-core)</sub>

```json
{"key":"Sense","predicate":["adjusted-eyes"],"selector":"low-light-vision"}
```
<sub>from Adjusted Eyes (pathfinder-npc-core)</sub>

### BattleForm

Used 97 times in official data. Fields (bold = used by most): **overrides**, **brackets**, **predicate**, hasHands

### CreatureSize

Used 93 times in official data. Fields (bold = used by most): **value**, **predicate**, reach, resizeEquipment, maximumSize

```json
{"key":"CreatureSize","predicate":["change-shape:porcupine-giant"],"value":"medium"}
```
<sub>from Change Shape (pathfinder-monster-core)</sub>

```json
{"key":"CreatureSize","predicate":["change-shape:animal"],"value":"small"}
```
<sub>from Change Shape (pathfinder-monster-core)</sub>

```json
{"key":"CreatureSize","predicate":["change-shape:humanoid-small"],"value":"small"}
```
<sub>from Conjure Disguise (pathfinder-monster-core)</sub>

### MartialProficiency

Used 92 times in official data. Fields (bold = used by most): **definition**, **label**, **sameAs**, **slug**, predicate, value, priority, kind, maxRank

```json
{"definition":[{"or":[{"and":["item:trait:orc","item:category:martial"]},"item:base:falchion","item:base:greataxe"]}],"key":"MartialProficiency","label":"PF2E.SpecificRule.MartialProficiency.MartialOrcWeapons","sameAs":"simple","slug":"martial-orc-weapons"}
```
<sub>from Orc Weapon Familiarity (feats)</sub>

```json
{"definition":["item:trait:orc","item:category:advanced"],"key":"MartialProficiency","label":"PF2E.SpecificRule.MartialProficiency.AdvancedOrcWeapons","sameAs":"martial","slug":"advanced-orc-weapons"}
```
<sub>from Orc Weapon Familiarity (feats)</sub>

```json
{"definition":["item:trait:conrasu","item:category:advanced"],"key":"MartialProficiency","label":"PF2E.SpecificRule.MartialProficiency.AdvancedConrasuWeapons","sameAs":"martial","slug":"advanced-conrasu-weapons"}
```
<sub>from Conrasu Weapon Familiarity (feats)</sub>

### Immunity

Used 80 times in official data. Fields (bold = used by most): **type**, predicate, mode, definition, label, exceptions

```json
{"key":"Immunity","mode":"remove","type":"spirit"}
```
<sub>from Personality Fragments (pathfinder-monster-core)</sub>

```json
{"definition":["ward contract"],"key":"Immunity","type":"custom"}
```
<sub>from Ward Contract (pathfinder-monster-core)</sub>

```json
{"definition":["create-undead"],"key":"Immunity","label":"PF2E.NPCAbility.PlanarScion.Duskwalker.Immunity","type":"custom"}
```
<sub>from +1 Status to All Saves vs. Death Effects (pathfinder-monster-core)</sub>

### EphemeralEffect

Used 77 times in official data. Fields (bold = used by most): **selectors**, **uuid**, **predicate**, affects, alterations

```json
{"key":"EphemeralEffect","predicate":["aquatic-ambush"],"selectors":["strike-attack-roll","strike-damage"],"uuid":"Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg"}
```
<sub>from Aquatic Ambush (pathfinder-monster-core)</sub>

```json
{"key":"EphemeralEffect","predicate":["tumble-behind"],"selectors":["strike-attack-roll","strike-damage"],"uuid":"Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg"}
```
<sub>from Tumble Behind (pathfinder-monster-core)</sub>

```json
{"key":"EphemeralEffect","predicate":["cinder-dispersal"],"selectors":["strike-attack-roll","strike-damage"],"uuid":"Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg"}
```
<sub>from Cinder Dispersal (pathfinder-monster-core)</sub>

### CriticalSpecialization

Used 75 times in official data. Fields (bold = used by most): **predicate**, alternate, text, damageDice

```json
{"key":"CriticalSpecialization"}
```
<sub>from Weapon Master (pathfinder-monster-core)</sub>

```json
{"key":"CriticalSpecialization","predicate":["item:group:polearm"]}
```
<sub>from Polearm Critical Specialization (pathfinder-monster-core)</sub>

```json
{"alternate":true,"key":"CriticalSpecialization","predicate":["item:id:{item|_id}"],"text":"PF2E.Item.Weapon.CriticalSpecialization.bow"}
```
<sub>from Spike Launcher (equipment)</sub>

### ActorTraits

Used 69 times in official data. Fields (bold = used by most): **add**, predicate, remove

```json
{"add":["holy"],"key":"ActorTraits","predicate":["sacred-art:holy"]}
```
<sub>from Sacred Art (pathfinder-monster-core)</sub>

```json
{"add":["unholy"],"key":"ActorTraits","predicate":["sacred-art:unholy"]}
```
<sub>from Sacred Art (pathfinder-monster-core)</sub>

```json
{"add":["{item|flags.system.rulesSelections.gloriousVisage}"],"key":"ActorTraits","remove":[]}
```
<sub>from Glorious Visage (pathfinder-monster-core-2)</sub>

### RollTwice

Used 66 times in official data. Fields (bold = used by most): **keep**, **selector**, **predicate**, removeAfterRoll

```json
{"keep":"higher","key":"RollTwice","selector":"initiative"}
```
<sub>from Laurel of the Empath (equipment)</sub>

```json
{"keep":"higher","key":"RollTwice","predicate":["finisher:perfect"],"removeAfterRoll":false,"selector":"strike-attack-roll"}
```
<sub>from Perfect Finisher (feats)</sub>

```json
{"keep":"higher","key":"RollTwice","predicate":["opportune-riposte"],"selector":"strike-attack-roll"}
```
<sub>from Felicitous Riposte (feats)</sub>

### TokenEffectIcon

Used 58 times in official data. Fields (bold = used by most): **value**, **predicate**

```json
{"key":"TokenEffectIcon","predicate":["lit-torch"],"value":"icons/sundries/lights/torch-brown-lit.webp"}
```
<sub>from Torch (pathfinder-monster-core)</sub>

```json
{"key":"TokenEffectIcon","predicate":["active-lantern"],"value":"icons/sundries/lights/lantern-iron-yellow.webp"}
```
<sub>from Lantern (Hooded) (pathfinder-monster-core-2)</sub>

```json
{"key":"TokenEffectIcon","value":"icons/sundries/lights/lantern-bullseye-signal-copper.webp"}
```
<sub>from Lantern (Bull's Eye) (pathfinder-npc-core)</sub>

### TokenMark

Used 40 times in official data. Fields (bold = used by most): **slug**, predicate, uuid

```json
{"key":"TokenMark","slug":"vision-of-weakness"}
```
<sub>from Spell Effect: Vision of Weakness (spell-effects)</sub>

```json
{"key":"TokenMark","slug":"warding-aggression"}
```
<sub>from Spell Effect: Warding Aggression (spell-effects)</sub>

```json
{"key":"TokenMark","slug":"celestial-brand"}
```
<sub>from Spell Effect: Celestial Brand (spell-effects)</sub>

### DexterityModifierCap

Used 20 times in official data. Fields (bold = used by most): **value**, predicate

```json
{"key":"DexterityModifierCap","value":5}
```
<sub>from Bands of Force (pathfinder-npc-core)</sub>

```json
{"key":"DexterityModifierCap","predicate":[{"not":"self:armored"}],"value":3}
```
<sub>from Scales of Steel (feats)</sub>

```json
{"key":"DexterityModifierCap","predicate":["self:effect:rage"],"value":3}
```
<sub>from Animal Skin (feats)</sub>

### CraftingAbility

Used 20 times in official data. Fields (bold = used by most): **slug**, **craftableItems**, **maxSlots**, **isDailyPrep**, label, priority, isPrepared, maxItemLevel, resource, predicate, batchSizes

```json
{"craftableItems":["item:trait:snare"],"isPrepared":true,"key":"CraftingAbility","maxSlots":"max(4,2*@actor.system.skills.crafting.rank)","priority":60,"slug":"snare-specialist"}
```
<sub>from Snare Specialist (feats)</sub>

```json
{"craftableItems":["item:trait:talisman"],"isDailyPrep":true,"key":"CraftingAbility","label":"PF2E.SpecificRule.DedicationCraftingEntry.TalismanDabbler","maxItemLevel":"floor(@actor.level / 2)","maxSlots":2,"slug":"talisman-dabbler"}
```
<sub>from Talisman Dabbler Dedication (feats)</sub>

```json
{"craftableItems":["item:trait:snare"],"isPrepared":true,"key":"CraftingAbility","label":"PF2E.SpecificRule.DedicationCraftingEntry.Snarecrafter","maxSlots":"max(4,2*@actor.system.skills.crafting.rank)","priority":60,"slug":"snarecrafter"}
```
<sub>from Snarecrafter Dedication (feats)</sub>

### SubstituteRoll

Used 15 times in official data. Fields (bold = used by most): **value**, **selector**, **required**, **predicate**, **slug**, label, effectType, removeAfterRoll, selectors

```json
{"key":"SubstituteRoll","required":true,"selector":"initiative","value":20}
```
<sub>from Sense Fate (pathfinder-monster-core)</sub>

```json
{"key":"SubstituteRoll","predicate":["mimic-object"],"required":true,"selector":"deception-check","slug":"mimic-object-bonus","value":10}
```
<sub>from Mimic Object (pathfinder-monster-core-2)</sub>

```json
{"key":"SubstituteRoll","predicate":["feign-copse"],"required":true,"selector":"deception-check","slug":"feign-copse-bonus","value":10}
```
<sub>from Feign Copse (pathfinder-monster-core-2)</sub>

### SpecialStatistic

Used 11 times in official data. Fields (bold = used by most): **slug**, **type**, **label**, extends, itemCasting, priority

```json
{"key":"SpecialStatistic","slug":"hurl-net","type":"attack-roll"}
```
<sub>from Hurl Net (pathfinder-monster-core-2)</sub>

```json
{"key":"SpecialStatistic","label":"Hat Toss","slug":"millindemalion-hat-toss","type":"attack-roll"}
```
<sub>from Hat Toss (pathfinder-monster-core-2)</sub>

```json
{"key":"SpecialStatistic","label":"PF2E.BattleForm.Attack.Jaws","slug":"kuribu-jaws-attack","type":"attack-roll"}
```
<sub>from Blessed Aspect (pathfinder-monster-core-2)</sub>

### MultipleAttackPenalty

Used 5 times in official data. Fields (bold = used by most): **predicate**, **selector**, **value**, label

```json
{"key":"MultipleAttackPenalty","predicate":["agile","finisher"],"selector":"attack","value":-3}
```
<sub>from Combination Finisher (feats)</sub>

```json
{"key":"MultipleAttackPenalty","predicate":[{"not":"agile"},"finisher"],"selector":"attack","value":-4}
```
<sub>from Combination Finisher (feats)</sub>

```json
{"key":"MultipleAttackPenalty","label":"Recharging Flurry","predicate":["recharging-flurry-reduced-map","item:melee","item:trait:agile"],"selector":"attack","value":-3}
```
<sub>from Recharging Flurry (feats)</sub>

### SpecialResource

Used 4 times in official data. Fields (bold = used by most): **itemUUID**, **label**, **level**, **max**, **slug**

### LoseHitPoints

Used 4 times in official data. Fields (bold = used by most): **recoverable**, **value**

```json
{"key":"LoseHitPoints","recoverable":false,"value":"2*@actor.level"}
```
<sub>from Effect: Quicksilver Mutagen (Greater) (equipment-effects)</sub>

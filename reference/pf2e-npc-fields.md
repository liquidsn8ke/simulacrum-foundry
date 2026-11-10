# PF2e NPC actors: how official creatures are stored

Verified against the pf2e system's own compendia (Monster Core, Monster Core 2, NPC Core) for pf2e
8.4-8.7 on Foundry 14. The fastest correct route to a creature is `pf2e_build_creature`, which
writes all of this for you; read this file to understand what it wrote, to fix one field by hand,
or to build something the builder does not cover.

An NPC is an Actor of `type: "npc"`. Its numbers live in `system`; everything listed on the stat
block below the numbers (strikes, abilities, spells, gear, lore skills) is an **embedded Item**.

## Actor fields (`system.*`)

| Stat block | Field | Notes |
|---|---|---|
| Level | `details.level.value` | -1 to 25+ |
| Rarity | `traits.rarity` | common, uncommon, rare, unique |
| Size | `traits.size.value` | tiny, sm, med, lg, huge, grg |
| Traits | `traits.value` | slugs, lowercase: `["demon","fiend","unholy"]` |
| Perception | `perception.mod`, `perception.details` | details holds free text such as "snow vision" |
| Senses | `perception.senses` | `[{type:"darkvision"}, {type:"scent", acuity:"imprecise", range:30}]` |
| Languages | `details.languages.value`, `.details` | slugs; telepathy and truespeech go in `details`: `"Telepathy 100 feet"` |
| Skills | `skills.<slug>.base` | the total modifier, e.g. `skills.stealth.base = 15` |
| Lore skills | embedded item `type: "lore"`, `system.mod.value` | name is "Cult Lore" etc. |
| Str…Cha | `abilities.<str/dex/con/int/wis/cha>.mod` | |
| AC | `attributes.ac.value`, `.details` | |
| Saves | `saves.<fortitude/reflex/will>.value`, `.saveDetail` | |
| "+1 status to all saves vs. magic" | `attributes.allSaves.value` (text) **and** an action with a FlatModifier rule | the text alone automates nothing |
| HP | `attributes.hp.value`, `.max`, `.details` | details: "void healing", troop thresholds |
| Hardness | `attributes.hardness.value` | objects and constructs |
| Immunities | `attributes.immunities: [{type, exceptions:[]}]` | |
| Weaknesses | `attributes.weaknesses: [{type, value, exceptions?}]` | |
| Resistances | `attributes.resistances: [{type, value, exceptions?, doubleVs?}]` | |
| Speed | `attributes.speed.value` (land), `.otherSpeeds: [{type, value}]`, `.details` | types: burrow, climb, fly, swim |
| Initiative | `initiative.statistic` | usually "perception"; a skill slug for ambushers |
| Focus points | `resources.focus: {max, value}` | when it has focus spells |
| Notes | `details.publicNotes`, `details.privateNotes`, `details.blurb` | HTML |
| Source | `details.publication: {title, license, remaster}` | homebrew: title "Homebrew" |

**Import requirement:** an actor built as JSON must carry `system._migration.version`; without it
pf2e's Import Data silently does nothing. Building in-world with `pf2e_build_creature` or
`create_document` avoids JSON import altogether.

## Embedded items

### Strikes: `type: "melee"` (also used for ranged strikes)
```json
{"name":"Jaws","type":"melee","system":{
  "bonus":{"value":14},
  "damageRolls":{"<random id>":{"damage":"1d4+8","damageType":"piercing"},
                 "<random id>":{"damage":"1d4","damageType":"bleed","category":"persistent"}},
  "traits":{"value":["unarmed","reach-10"]},
  "attackEffects":{"custom":"","value":["grab"]},
  "range":null}}
```
- `damageRolls` is an object keyed by random ids; `category` is `persistent`, `precision` or `splash`.
- `attackEffects.value` lists slugs of the creature's OWN abilities that a hit triggers (`grab`,
  `knockdown`, `improved-grab`, or a homebrew ability's slug). The ability must exist on the actor.
- Ranged: `range: {increment: 60, max: null}`; reload/volley/etc. are traits (`reload-0`, `deadly-d10`).
- A strike tied to a carried weapon has `flags.pf2e.linkedWeapon = <weapon item id>`; optional.
- Weapon traits: agile, finesse, reach-10, deadly-d10, fatal-d12, versatile-p, forceful, sweep,
  trip, shove, grapple, backstabber, two-hand-d12, magical, unholy, holy …

### Abilities: `type: "action"`
```json
{"name":"Retaliatory Strike","type":"action","system":{
  "actionType":{"value":"reaction"},
  "actions":{"value":null},
  "category":"defensive",
  "frequency":{"max":3,"per":"day"},
  "traits":{"value":["aura","fear"]},
  "description":{"value":"<p><strong>Trigger</strong> …</p>\n<hr />\n<p><strong>Effect</strong> …</p>"},
  "rules":[ … ],
  "slug":"retaliatory-strike"}}
```
- `actionType.value`: `action` | `reaction` | `free` | `passive`. `actions.value`: 1, 2 or 3 for
  `action`, otherwise null.
- `category`: `offensive` | `defensive` | `interaction` — which section of the sheet it shows in.
- `frequency.per`: `turn`, `round`, `PT1M`, `PT10M`, `PT1H`, `day`, `P1M`, `P1Y`.
- `slug` is how strikes (`attackEffects`) and rules (`{item|slug}`) refer to it.
- Variable-cost (1 to 3 actions) abilities: `actions.value: 1`, and the description lists each
  cost with `<span class="action-glyph">1</span>` … lines (see pf2e-automation-patterns.md).

### Standard abilities: copy from the glossary
Grab, Knockdown, Reactive Strike, Frightful Presence, Stench, Void Healing, Telepathy, Troop
Defenses, Troop Movement, Form Up, Swarm Mind, Constrict, Push, Throw Rock, Swallow Whole,
Engulf, Ferocity, Regeneration, … live in the compendium `bestiary-ability-glossary-srd`
(and `bestiary-family-ability-glossary`). Their description is `@Localize[...]` so it renders the
official text. Some carry placeholders to fill: Frightful Presence and Stench start
`<p>0 feet. @Check[will|dc:|...]` — set the radius and DC, and the Aura rule's `radius`.
`pf2e_build_creature` copies and fills these by name.

### Spellcasting
An entry item `type: "spellcastingEntry"` plus one `spell` item per spell (copied from
`spells-srd`):
```json
{"type":"spellcastingEntry","name":"Occult Spontaneous Spells","system":{
  "tradition":{"value":"occult"},
  "prepared":{"value":"spontaneous","flexible":false},
  "spelldc":{"dc":28,"value":20,"mod":0},
  "slots":{"slot1":{"max":4,"value":4},"slot2":{"max":4,"value":4}},
  "autoHeightenLevel":{"value":3},
  "showSlotlessLevels":{"value":false}}}
```
- `prepared.value`: `innate` | `prepared` | `spontaneous` | `focus`. `spelldc.value` is the spell
  attack modifier.
- A spell links to its entry with `system.location.value = <entry id>`; `location.heightenedLevel`
  is the rank it is cast at; innate X/day uses `location.uses = {max, value}`.
- Prepared entries list prepared spells per rank: `slots.slot1.prepared = [{id: <spell item id>}, …]`.
- Cantrips are rank 0 in prepared slots (`slot0`) and auto-heighten.
- Constant / at-will innate spells keep the official naming: "Speak with Animals (Constant)".

### Gear
Weapons, armor, shields, consumables and worn items are ordinary physical items, copied from
`equipment-srd`. `system.equipped.carryType` is `held` or `worn`; armor also sets
`equipped.inSlot: true`; invested items set `equipped.invested: true`.

## Troops
Put `troop` in the traits and the system does the rest: thresholds are derived (4 segments at max
HP, 3 at floor(2/3 max), 2 at floor(1/3 max)), four 10-ft segment tokens are placed when the actor
is dropped on a scene, and segments are removed as HP falls past each threshold. Official troops
also carry: the thresholds in `attributes.hp.details`, `attributes.speed.details: "troop movement"`,
and the glossary abilities Troop Defenses (with a `<p><strong>Thresholds</strong> …</p><hr />`
lead-in), Troop Movement and Form Up. The prototype token is 2×2 (one segment).

## Vocabulary seen in official data

- **Immunities:** acid bleed blinded bludgeoning clumsy cold confused controlled critical-hits curse dazzled deafened death-effects disease doomed drained electricity emotion enfeebled fascinated fear-effects fire fortune-effects grabbed illusion immobilized mental misfortune-effects nonlethal-attacks object-immunities off-guard olfactory paralyzed petrified piercing poison polymorph possession precision prone restrained scrying sickened slashing sleep sonic stupefied swarm-mind unconscious visual vitality void
- **Weaknesses:** acid alchemical area-damage axe-vulnerability bludgeoning cold cold-iron earth electricity fire force holy mental orichalcum peachwood piercing salt silver slashing sonic spirit splash-damage unholy vitality water
- **Resistances:** acid air all-damage bludgeoning cold critical-hits earth electricity fire force mental metal physical piercing poison precision protean-anatomy slashing sonic spells spirit unholy void water wood
- **Senses:** darkvision greater-darkvision low-light-vision see-invisibility truesight; with `acuity` (precise/imprecise/vague) and `range`: bloodsense echolocation lifesense magicsense motion-sense scent spiritsense thoughtsense tremorsense wavesense
- **Languages:** common draconic elven dwarven gnomish goblin halfling orcish jotun sakvroth fey aklo chthonian diabolic empyrean daemonic necril petran pyric thalassic sussuran utopian wildsong mwangi tien requian shadowtongue … (lowercase slugs)

## Condition links
`@UUID[Compendium.pf2e.conditionitems.Item.<id>]{Frightened 1}`

Blinded XgEqL1kFApUbl5Z2 · Clumsy i3OJZU2nk64Df3xm · Concealed DmAIPqOBomZ7H95W · Confused yblD8fOR1J8rDwEQ · Controlled 9qGBRpbX9NEwtAAr · Dazzled TkIyaNPgTZFBCCuh · Deafened 9PR9y0bi4JPKnHPR · Doomed 3uh1r86TzbQvosxv · Drained 4D2KBtexWXa6oUMR · Enfeebled MIRkyAjyBeXivMa7 · Fascinated AdPVz7rbaVSRxHFg · Fatigued HL2l2VRSaQHu9lUw · Fleeing sDPxOjQ9kx2RZE8D · Frightened TBSHQspnbcqxsmjL · Grabbed kWc1fhmv9LBiTuei · Immobilized eIcWbB5o3pP6OIMe · Invisible zJxUflt9np0q4yML · Off-Guard AJh5ex99aV6VTggg · Paralyzed 6uEgoh53GbXuHpTF · Persistent Damage lDVqvLKA6eF3Df60 · Petrified dTwPJuKgBQCMxixg · Prone j91X7x0XSomq8d60 · Quickened nlCjDvLMf2EkV2dl · Restrained VcDeM8A5oI6VqhbM · Sickened fesd1n5eVhpCSS18 · Slowed xYTAsEpcJE1Ccni3 · Stunned dfCMdR4wnpbYNTix · Stupefied e1XGnhKNSQIm5IXg · Unconscious fBnFDH2MTzgFijKf · Wounded Yl48xTdMh3aeQYL2

`pf2e_lookup` with `type: "condition"` resolves any of these by name.

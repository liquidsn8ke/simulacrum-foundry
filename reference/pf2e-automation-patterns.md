# PF2e automation patterns: how official content automates abilities

What official creatures, hazards and items actually do, verified against the pf2e compendia, and
how far automation can go before it needs a module or a script. Match this level: official
content is the bar, and anything beyond it should be a deliberate, explained choice.

## The order to reach for things
1. **Native data and rule elements.** Fields (IWR, speeds, senses), glossary abilities, rule
   elements and enrichers. They survive system updates, need nothing installed, and the GM can
   read and edit them on the sheet. Most abilities stop here.
2. **Installed modules**, when a rule element cannot express it — only modules the startup
   module report lists as ACTIVE. Name the module and the feature, and say what happens if it is
   ever disabled.
3. **A script** (world script, macro, or run_javascript for a one-off) as the last resort. Say
   why the first two could not do it.

Official content is lightly automated. Do not over-build: an ability whose effect is a judgement
call (difficult terrain from a crowd, "if it affected at least four creatures") stays text,
with buttons for the rolls.

## Patterns

### Passive bonus with a condition
`+1 status to all saves vs. magic` → action (passive) with
`{"key":"FlatModifier","predicate":["item:magical"],"selector":"saving-throw","type":"status","value":1}`,
and the text also goes in `attributes.allSaves.value`.

### Aura (Frightful Presence, Stench, homebrew auras)
- Action, passive, trait `aura` plus the aura's effect traits; first line of text "30 feet.";
  an Aura rule with the radius and slug. Official glossary versions exist for Frightful Presence
  and Stench: copy them and fill radius and DC.
- The aura ring is drawn on the token, and an Aura `effects` entry can apply an effect item to
  creatures that enter or start their turn in it (with a save, filtered by `affects` and a
  `predicate`).
- **Aura damage is not automatic.** Write `@Check[...]` and `@Damage[...]` buttons in the text.
  The GM (or PF2e Toolbelt's target helper) applies them.
- On a troop, every segment token carries the aura, which matches the troop rules (emanations
  measure from any segment).

### Extra damage while something is true
A RollOption toggle plus DamageDice with that predicate:
```json
[{"key":"RollOption","label":"PF2E.SpecificRule.TOTMToggle.Frightened","option":"target:condition:frightened","toggleable":"totm"},
 {"key":"DamageDice","damageType":"mental","diceNumber":1,"dieSize":"d6","predicate":["target:condition:frightened"],"selector":"strike-damage"}]
```

### On-hit effects on a strike
List the ability slug in the strike's `attackEffects.value` (`grab`, `knockdown`, or the homebrew
ability's slug). The ability must exist on the same actor. Persistent damage is a second damage
roll with `category: "persistent"`.

### Reactions with conditional extra damage
Retaliatory Strike style: a toggle RollOption with `domain: "damage"` plus a DamageDice whose
selector is the strike's damage (`tail-damage`).

### Variable-cost abilities (1 to 3 actions)
Official troops: `actions.value: 1`, frequency, and text:
```html
<p><span class="action-glyph">1</span> to <span class="action-glyph">3</span></p>
<p><strong>Frequency</strong> once per round</p><hr />
<p><strong>Effect</strong> … a @Template[type:emanation|distance:5] (@Check[reflex|dc:23|basic]) …</p>
<p><span class="action-glyph">1</span> @Damage[(1d6+3)[void]|options:area-damage] damage</p>
<p><span class="action-glyph">2</span> @Damage[(3d6+6)[void]|options:area-damage] damage</p>
<p><span class="action-glyph">3</span> @Damage[(4d6+9)[void]|options:area-damage] damage</p>
```

### Area abilities and breath weapons
Text with `@Template`, a basic `@Check`, and `@Damage[…|options:area-damage]`. "Can't use again
for 1d4 rounds" is text with `[[/r 1d4 #Recharge]]`.

### Reacting to a failed save (Serenity Vulnerability style)
A Note on the creature's own saving throws, filtered by outcome and by what the check inflicts:
```json
{"key":"Note","selector":"saving-throw","outcome":["failure","criticalFailure"],
 "predicate":[{"or":["inflicts:slowed","inflicts:paralyzed","inflicts:restrained"]}],
 "title":"{item|name}","text":"… @Damage[(3d6+10)[mental]] …","visibility":"gm"}
```
`inflicts:` options come from `@Check[...|options:inflicts:x]` and from system actions; spells may
not carry them, so mention the limitation to the GM.

### Below a hit-point threshold
`{"lt": ["hp-percent", 50]}` predicates (official Abandon Armor). Troop segment thresholds are
handled by the system from the `troop` trait.

### Change shape / forms
A RollOption with `suboptions` and `toggleable: true`, other rules predicated on
`change-shape:<form>`.

### Void healing, regeneration, fast healing
Void Healing is a glossary ability with
`{"key":"ActiveEffectLike","mode":"override","path":"system.attributes.hp.negativeHealing","value":true}`.
Fast healing: `{"key":"FastHealing","value":5}`; regeneration adds `deactivatedBy`.

### Troops
`troop` trait; Troop Defenses (with thresholds), Troop Movement and Form Up from the glossary;
`hp.details` with the thresholds; `speed.details: "troop movement"`. A "tide"-style ability
(moving through spaces, difficult terrain) stays text.

## What cannot be automated natively (say so, offer the fallback)
- Damage from an aura or on entering a space → buttons in text; PF2e Toolbelt targets and applies.
- Difficult terrain from a creature's space → text (or a Region drawn by the GM).
- "Non-demons only" style filters on aura damage → text; Aura `effects` can filter with a predicate.
- Counting how many creatures an effect hit → GM judgement; a Note reminds them.

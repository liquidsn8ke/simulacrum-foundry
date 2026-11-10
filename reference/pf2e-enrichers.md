# PF2e text enrichers and inline rolls

Write these into any description (items, actions, journal pages). They render as clickable
buttons that roll through the system, apply modifiers, and post chat cards that the target and
damage helpers understand. Verified from official creature and hazard text.

## @Check — a save or skill check against a DC
```
@Check[reflex|dc:25|basic]
@Check[will|dc:28]
@Check[fortitude|dc:21|options:area-effect,inflicts:sickened]
@Check[thievery|dc:21|name:Disable Pillar|traits:action:disable-a-device]
@Check[perception|dc:26|traits:action:seek]
```
- First part: `fortitude`, `reflex`, `will`, `perception`, a skill slug, or `flat`.
- `basic` marks a basic save (damage halves/doubles by degree).
- `options:` adds roll options to the check. Use `area-effect` for areas, and
  `inflicts:<condition>` for checks that would impose a condition — rules on the roller can
  predicate on them (e.g. a Note that triggers on failed saves vs. `inflicts:slowed`).
- `name:` relabels the button; `traits:` adds traits (`action:seek`, `action:disable-a-device`).
- `showDC:all` reveals the DC to players.

## @Damage — a damage or healing roll
```
@Damage[2d6[fire]]
@Damage[(3d8+5)[bludgeoning]]
@Damage[(1d4)[persistent,bleed]]
@Damage[(3d8)[piercing],(2d4)[persistent,poison]|options:area-damage]
@Damage[8d6[cold]|options:area-damage]
@Damage[2d6[healing]]
```
- Several instances are comma-separated inside one @Damage.
- Wrap formulas with modifiers in parentheses: `(2d12+14)[slashing]`.
- `options:area-damage` marks it as area damage, so area-damage weaknesses and resistances apply.
- Categories: `persistent`, `precision`, `splash` go before the type: `[persistent,fire]`.

## @Template — place an area
```
@Template[type:emanation|distance:20]
@Template[type:cone|distance:30]
@Template[type:burst|distance:20]
@Template[type:line|distance:60|width:5]
```
Older short form `@Template[cone|distance:30]` also works.

## @UUID — link a document
```
@UUID[Compendium.pf2e.conditionitems.Item.TBSHQspnbcqxsmjL]{Frightened 1}
@UUID[Compendium.pf2e.actionspf2e.Item.UHpkTuCtyaPqiCAB]{Steps}
@UUID[Actor.<id>.Item.<id>]{Lashes, Claws, and Stingers}
```
Links to effects can be dragged onto tokens to apply them. Resolve names to UUIDs with
`pf2e_lookup` rather than guessing ids.

## @Localize — official glossary text
`@Localize[PF2E.NPC.Abilities.Glossary.Grab]` renders the system's own text. Glossary abilities
copied from the compendium use this; keep it when you copy one.

## Inline rolls
- `[[/r 1d20+8]]{+8}` — a roll button with a custom label.
- `[[/gmr 2d4 #days]]{2d4 days}` — a GM-only (blind) roll.
- `[[/r 1d4 #Direction]]` — a roll with a flavor label.

## Action glyphs in text
`<span class="action-glyph">1</span>` (also 2, 3, `R` reaction, `F` free). Used in variable-cost
abilities to label each cost's line.

## Ability text layout (official convention)
```html
<p><strong>Frequency</strong> once per round</p>
<p><strong>Trigger</strong> A creature within reach …</p>
<p><strong>Requirements</strong> …</p>
<hr />
<p><strong>Effect</strong> …</p>
<p><strong>Critical Success</strong> …</p>
<p><strong>Success</strong> …</p>
<p><strong>Failure</strong> …</p>
<p><strong>Critical Failure</strong> …</p>
```
`pf2e_build_creature` and `pf2e_build_item` produce this layout from plain text lines that begin
with those words, so you can pass plain text.

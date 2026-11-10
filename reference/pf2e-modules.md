# Modules this world runs, and what they mean for automation

The live list of ACTIVE modules is in your system prompt (MODULES block); it is read from the
world at startup and is authoritative. This file explains the ones that matter for building. An
automation may rely on a module only if that module is active; if it is installed but inactive,
say so and ask the GM before relying on it. Read a module's own README with
`read_reference { source: "<module id>" }`.

## Automation-relevant

**PF2e Toolbelt** (`pf2e-toolbelt`)
- *Target helper / "Add Targets to Messages"*: a damage or save chat card carries the targets,
  each with its own save button and apply-damage buttons. This is how area abilities written with
  `@Check` + `@Damage` buttons get resolved per target — it is the practical answer to "aura and
  area damage are not automatic".
- *Template helper*: targets tokens inside a placed template.
- *Actionable / item macros*: attaches a macro to an action or item use. A fallback for behaviour
  rule elements cannot express; prefer rule elements first.
- Many other quality-of-life features; do not rely on one without checking it is enabled in the
  module's settings.

**PF2e Workbench** (`xdy-pf2e-workbench`)
- A large set of optional automation (auto-rolling, condition handling on damage, persistent
  damage handling, NPC mystification, heroic options …), each behind its own setting. Read its
  README before relying on a feature, and assume a feature is off unless the GM says otherwise.

**Aztec's Inline Builder** (`pf2e-aztecs-inline-builder`)
- A UI for writing @Check / @Damage / @Template enrichers by hand. Its output uses the same
  syntax documented in pf2e-enrichers.md, so text you write is editable with it.

**PF2e Flatcheck Helper** (`pf2e-flatcheck-helper`)
- Clickable flat checks for conditions (concealed, hidden, dazzled …). Nothing to build for it.

**World Scripter** (`world-scripter`)
- Runs script macros stored in a compendium as world scripts on every load. The persistent home
  for a script fallback (a hook that must always be running). Use only when rule elements and
  item macros cannot do it, and say so.

**Global Progress Clocks** (`global-progress-clocks`)
- Progress clocks for hazards, rituals and chases. Usable for complex hazards' "routine" counters.

**Swarm (Reanimated)** (`swarm-reanimated`)
- Animates many small figures on a swarm or troop token. Cosmetic; useful for troops.

**Sundry** (`sundry`)
- Assorted pf2e utilities (see its README).

## Token art
`pf2e-tokens-bestiaries`, `pf2e-tokens-monster-core`, `pf2e-tokens-monster-core-2`,
`pf2e-tokens-npc-core`, `pf2e-tokens-characters`, `pf2e-tokens-myth-and-magic` provide token and
portrait art. `asset_search` finds images by name; a homebrew variant of an official creature can
reuse the official creature's art.

## Not active on this server
PF2e Troops Helper is not active, so a troop's segment tokens are not deleted automatically when
it crosses a threshold; the GM removes them (the system already shrinks the HP pool).

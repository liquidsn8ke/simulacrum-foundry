# Simulacrum PF2e: AI Document Builder

A fork of [Simulacrum](https://github.com/Daxiongmao87/simulacrum-foundry) (by way of
[Ebonhawk's automation-builder fork](https://github.com/Ebonhawk3829/simulacrum-foundry/tree/personal)),
specialised for **Pathfinder Second Edition**. Paste a homebrew stat block, ability, item, spell,
hazard or effect into the sidebar; the agent works out how official PF2e content would represent
and automate it, checks its plan with you, builds it directly in your world, validates it, and
then helps you verify it in play.

GM only. Installed by manifest URL, not from the Foundry package directory.

## Requirements

- Foundry VTT 14.369 or later, **pf2e** system 8.4.1 or later (verified on 8.7.0).
- An **Anthropic API key** (platform.claude.com), or an OpenRouter key if you prefer OpenRouter.
- Recommended: PF2e Toolbelt (per-target save and damage buttons for area abilities) and PF2e
  Workbench. Nothing else is required; the agent reads which modules are active at startup and
  only relies on those.

## Install

In Foundry's setup screen: **Add-on Modules → Install Module**, paste the manifest URL, Install:

```
https://github.com/liquidsn8ke/simulacrum-foundry/releases/latest/download/module.json
```

Enable **Simulacrum PF2e** in your world, then in **Configure Settings → Simulacrum PF2e**:

| Setting | What it does |
|---|---|
| AI Provider | Anthropic (default, talks to Claude directly) or OpenRouter |
| Anthropic API Key | Your key. Stored in world settings and sent from the GM's browser straight to Anthropic; any GM of the world can read it |
| Claude Effort | How hard Claude thinks. High suits building; Medium is cheaper for small edits |
| Claude Refusal Fallback | If a request is declined by Claude's safety checks, let Anthropic retry it on a fallback model in the same call |
| OpenRouter API Key | For the OpenRouter provider, and for the icon generator (needs an image model) |

Pick the model in the sidebar's dropdown. With Anthropic the default is Claude Opus 5.5.

## How it works

1. Paste the text into the **Simulacrum** sidebar tab and say what you want ("build this creature").
2. The agent benchmarks the numbers against official creatures of the same level and lays out a
   plan: each part of the stat block and how it will be represented — native field, glossary
   ability, rule element, enricher button, an active module, or text only. **Nothing is written
   until you confirm.**
3. It builds the creature (or item) in one step: spells, gear and standard abilities are copied
   from the pf2e compendia, everything else is written in official Monster Core shapes. The result
   is validated for silent failures (rule elements the system rejected, broken links, bad
   formulas, unfilled DCs).
4. Use it in play. Every roll it makes or receives is recorded with pf2e's own roll context.
5. Tell the agent what you saw; it compares that with the record and its intent, fixes and
   rebuilds, or marks it confirmed.

The agent keeps lessons (which you confirm) and a history log in `Data/simulacrum-pf2e/`, outside
the world, so they survive a world reset.

## The PF2e tools

| Tool | Purpose |
|---|---|
| `pf2e_build_creature` | Whole NPC from a spec; create, or rebuild in place. Troops handled. |
| `pf2e_build_item` | One item: ability/strike on an actor, effect, feat, spell, equipment… from scratch or copied from an official item |
| `pf2e_lookup` | Find official documents and UUIDs; read one as a template |
| `pf2e_validate` | Report rule elements the system ignored (with its reason), broken @UUID links, bad formulas, empty DCs |
| `pf2e_benchmark` | Percentiles of AC, HP, saves, strikes and spell DC among official creatures of the level |
| `read_reference` | The shipped PF2e reference (below), and any active module's README |
| `read_ability_runs` / `confirm_ability` | The in-play record, and closing it out |

Hazards and journal entries are built with the generic document tools, guided by the reference.

## Reference shipped with the module (`reference/`)

`pf2e-npc-fields.md`, `pf2e-item-fields.md` (incl. hazards), `pf2e-rule-elements.md` (every rule
element key with real examples, generated from the pf2e compendia), `pf2e-enrichers.md`,
`pf2e-automation-patterns.md` (how official content automates things and where automation
stops), `pf2e-modules.md`, `world-conventions.md`.

## How the Anthropic connection behaves

- Requests stream, use adaptive thinking at the configured effort, and cache the tools and system
  prompt so repeated turns are cheap.
- Claude's reasoning blocks are stored with each reply and sent back unchanged. Where the harness
  edits history (corrections, compaction, rewind), requests ask the API to drop stale reasoning
  instead of failing (`prefix_mismatch_behavior: "drop_block"`).
- A turn that is cut off or refused never runs its tool calls.

## Development

```bash
npm ci
npm run test:local      # policy, lint baseline, unit, regression, integration, component, security, package
npm run build:vendor    # re-bundle the Anthropic SDK after changing its pinned version
npm run build:release   # dist/module.json + dist/simulacrum-pf2e.zip
```

Releases are published by GitHub Actions when a version tag matching `module.json` is pushed
(`git tag 0.9.0 && git push origin 0.9.0`). CI runs the tests on every push to `personal`.

## License

MIT, as upstream. The bundled Anthropic SDK (`scripts/vendor/anthropic-sdk.js`) is MIT licensed;
its license is included in the file header.

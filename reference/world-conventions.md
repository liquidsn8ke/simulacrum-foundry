# This world's conventions

Facts about this GM's game that no generic reference can tell you. When they and a generic
reference disagree, these win; when a lesson in memory disagrees with this file, raise it.

## The game
- **System:** Pathfinder Second Edition (remaster), pf2e system 8.x on Foundry VTT 14, hosted on
  Molten Hosting. The GM writes **homebrew** creatures, abilities and items, often as variants of
  official ones ("variant Wrath Riot"). A homebrew number that differs from the official one is
  deliberate: build what the GM's text says.
- **Remaster terms:** holy/unholy (not good/evil damage), void/vitality (not negative/positive),
  spell ranks, Reactive Strike (not Attack of Opportunity), off-guard (not flat-footed).

## Where things go
- Ask where a new creature or item should live (a world folder, or a compendium) the first time
  it comes up in a session, then keep doing that. Never write into the pf2e system's own
  compendia; they are replaced on every system update.
- Homebrew effects that auras or links point at need a stable home (a world Item or a homebrew
  compendium), so their UUIDs do not change.

## How the GM wants automation
- Match official automation first (rule elements, glossary abilities, enrichers). Use an active
  module or a script only as a fallback, and say which and why.
- A stat block given in full is the specification. Keep the GM's wording in the description
  (fixing obvious typos is fine; say which).
- The GM tests every build in play. A build is unverified until then.

## Practicalities
- Damage from buttons is applied by the GM from the chat card (or with PF2e Toolbelt's helpers).
  A damage-triggered automation has not "failed" until the damage was actually applied.
- Tokens: the world has the pf2e token packs (Monster Core, Monster Core 2, NPC Core, Bestiaries,
  Myth & Magic). `asset_search` can find matching art for a homebrew creature.

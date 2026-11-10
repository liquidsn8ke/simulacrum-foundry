// SPDX-License-Identifier: MIT
/* eslint-disable complexity, max-lines-per-function -- data mapping: each optional stat-block field is a `??` default or a guard, which the complexity rule counts as a branch. Splitting would scatter one mapping across many functions. */

/**
 * pf2e_build_creature: build (or rebuild) a PF2e NPC from a compact spec, directly in
 * the world or a compendium. Spells, gear and glossary abilities are copied from the
 * pf2e compendia; everything else uses official Monster Core shapes. The result is
 * validated, benchmarked against official creatures of its level, and marked as
 * needing testing so its use in play is recorded.
 */

import { BaseTool } from './base-tool.js';
import { MODULE_ID } from '../module-id.js';
import { buildCreatureData, checkCreatureSpec } from '../core/pf2e/npc-builder.js';
import { createLookup } from '../core/pf2e/compendium.js';
import { ensureFolder, resolvePack, describePlacement } from '../core/pf2e/placement.js';
import { validateDocument } from '../core/pf2e/validate.js';
import { officialDistributions, compareToOfficial, statsOfActor } from '../core/pf2e/benchmark.js';
import { markNeedsTesting } from '../core/verification-state.js';

const IWR_KEYS = ['immunities', 'weaknesses', 'resistances', 'hardness'];

export class Pf2eBuildCreatureTool extends BaseTool {
  constructor() {
    super(
      'pf2e_build_creature',
      [
        'Build a PF2e NPC from a stat block, or rebuild one in place (actorUuid). Writes the actor and all its items in one step, validates it, benchmarks it, and marks it for testing in play.',
        'spec keys: name, level, rarity, size (tiny..gargantuan), traits[], source, img, token,',
        'perception {mod, senses:[{type, acuity?, range?}], details}, languages[], languageDetails ("Telepathy 100 feet"), skills {slug: mod}, lore {"Cult Lore": mod}, abilities {str..cha},',
        'ac, acDetails, saves {fortitude, reflex, will}, allSaves (text; also add the matching FlatModifier action), hp, hpDetails, hardness, immunities[] (strings or {type, exceptions}), weaknesses[{type, value}], resistances[{type, value, exceptions?}],',
        'speed, otherSpeeds[{type, value}], speedDetails, initiative,',
        'gear[] (equipment names or {name|uuid, quantity, runes, rename, held:false}),',
        'strikes[] {name, bonus, damage:[{formula, type, category?: persistent|precision|splash}], traits[], effects[] (on-hit ability slugs), range, rules[], description},',
        'spellcasting[] {type: innate|prepared|spontaneous|focus, tradition, dc, attack, slots {"1":3}, autoHeighten, focusPoints, name, spells:[{name|uuid, rank, uses, atWill, constant, copies, rename}]},',
        'glossary[] (official ability names, e.g. "Grab", "Reactive Strike", or {name, aura, dc, description, rename, traits, rules}),',
        'actions[] {name, actions: 1|2|3|"free"|"reaction"|"passive", category, traits[], frequency {max, per}, description (plain lines starting Trigger/Requirements/Frequency/Effect are formatted, or HTML), rules[], aura, auraTraits[], slug},',
        'omitTroopAbilities[], publicNotes, privateNotes, blurb.',
        'A "troop" trait adds thresholds, Troop Defenses, Troop Movement and Form Up automatically. See read_reference pf2e-npc-fields.md and pf2e-automation-patterns.md.',
      ].join(' ')
    );
    this.requiresConfirmation = true;
    this.schema = {
      type: 'object',
      properties: {
        spec: { type: 'object', description: 'The creature spec (keys in the tool description).' },
        actorUuid: {
          type: 'string',
          description:
            'Rebuild this existing NPC in place instead of creating a new one. Its items are replaced.',
        },
        folder: {
          type: 'string',
          description: 'World folder name to create the actor in (created if missing).',
        },
        pack: {
          type: 'string',
          description:
            'Compendium key to create the actor in instead of the world (not a pf2e system pack).',
        },
        intent: {
          type: 'string',
          description:
            'One or two lines on what this creature should do in play, kept with the test record.',
        },
        benchmark: {
          type: 'boolean',
          description: 'Compare with official creatures of its level (default true).',
        },
      },
      required: ['spec'],
    };
  }

  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  async getConfirmationDetails(params) {
    const s = params.spec ?? {};
    const count = a => (Array.isArray(a) ? a.length : 0);
    const spells = (s.spellcasting ?? []).reduce((n, e) => n + count(e.spells), 0);
    const where = params.actorUuid
      ? `rebuild ${params.actorUuid}`
      : params.pack
        ? `compendium ${params.pack}`
        : params.folder
          ? `world folder "${params.folder}"`
          : 'the world';
    return {
      type: 'build',
      title: `Build creature: ${s.name ?? '(unnamed)'}`,
      details: `Level ${s.level ?? '?'} ${(s.traits ?? []).join(', ')} — ${count(s.strikes)} strikes, ${count(s.actions) + count(s.glossary)} abilities, ${spells} spells, ${count(s.gear)} gear → ${where}.`,
    };
  }

  async execute(params) {
    if (!game.user?.isGM)
      return this._reject(
        { ok: false, error: 'Only a GM can build creatures.' },
        'GM required',
        'PERMISSION_DENIED'
      );
    const spec = params.spec;
    const errors = checkCreatureSpec(spec);
    if (errors.length)
      return this._reject(
        { ok: false, errors, next: 'Fix these and call again.' },
        'Spec invalid',
        'VALIDATION_ERROR'
      );

    const { actor: data, warnings } = await buildCreatureData(spec, createLookup(), {
      moduleId: MODULE_ID,
    });

    let actor;
    try {
      actor = params.actorUuid
        ? await this._rebuild(params.actorUuid, data)
        : await this._create(data, params);
    } catch (error) {
      return this._reject(
        {
          ok: false,
          error: `Write failed: ${error.message}`,
          next: 'Read the error; if it names a field, fix that field in the spec.',
        },
        'Write failed',
        'WRITE_FAILED'
      );
    }
    if (actor?.error)
      return this._reject({ ok: false, error: actor.error }, 'Cannot place actor', 'PLACEMENT');

    await markNeedsTesting(actor, { intent: params.intent ?? null });
    const validation = await validateDocument(actor);

    let benchmark;
    if (params.benchmark !== false) {
      try {
        const official = await officialDistributions(Number(spec.level));
        benchmark = compareToOfficial(statsOfActor(actor), official).filter(
          c => c.rating !== 'moderate (typical)'
        );
      } catch (error) {
        benchmark = `Benchmark unavailable: ${error.message}`;
      }
    }

    const counts = {};
    for (const item of actor.items) counts[item.type] = (counts[item.type] ?? 0) + 1;
    const body = {
      ok: validation.ok,
      actorUuid: actor.uuid,
      name: actor.name,
      placed: describePlacement(actor),
      items: counts,
      warnings,
      validation: validation.problems,
      benchmarkOutliers: benchmark,
      next: validation.ok
        ? 'Tell the GM where it is, mention any warnings and benchmark outliers (outliers may be deliberate homebrew). It is marked for testing: ask the GM to use it in play, then read_ability_runs with this actorUuid.'
        : 'Fix the validation problems (rebuild with actorUuid to replace it in place), then report.',
    };
    return {
      content: JSON.stringify(body, null, 2),
      display: `**Built:** @UUID[${actor.uuid}]{${actor.name}} — ${actor.items.size} items${validation.ok ? '' : `, ${validation.problems.length} problem(s)`}`,
    };
  }

  async _create(data, params) {
    const { pack, error } = resolvePack(params.pack, 'Actor');
    if (error) return { error };
    if (!pack && params.folder) data.folder = await ensureFolder('Actor', params.folder);
    const ActorClass = CONFIG.Actor.documentClass;
    return ActorClass.create(data, pack ? { pack: pack.collection } : {});
  }

  async _rebuild(uuid, data) {
    const actor = await globalThis.fromUuid(uuid);
    if (!actor || actor.type !== 'npc') return { error: `No NPC at ${uuid}.` };
    const { items, ...rest } = data;
    const update = {
      name: rest.name,
      img: rest.img,
      system: rest.system,
      prototypeToken: rest.prototypeToken,
      flags: rest.flags,
    };
    // A merge would keep IWR entries the new spec dropped; remove those explicitly.
    for (const key of IWR_KEYS) {
      if (!(key in rest.system.attributes) && key in (actor._source.system.attributes ?? {})) {
        update.system.attributes[`-=${key}`] = null;
      }
    }
    await actor.update(update);
    await actor.deleteEmbeddedDocuments(
      'Item',
      actor.items.map(i => i.id)
    );
    await actor.createEmbeddedDocuments('Item', items, { keepId: true });
    return actor;
  }

  _reject(body, display, type) {
    return {
      content: JSON.stringify(body, null, 2),
      display,
      error: { message: String(body.error ?? (body.errors ?? []).join('; ') ?? display), type },
    };
  }
}

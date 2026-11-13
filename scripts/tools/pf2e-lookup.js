// SPDX-License-Identifier: MIT

/**
 * pf2e_lookup: find official PF2e documents (spells, items, glossary abilities,
 * conditions, effects, feats, creatures, hazards) in the installed compendia, or read
 * one in full to use as a template. Read-only.
 */

import { BaseTool } from './base-tool.js';
import { searchCompendia } from '../core/pf2e/compendium.js';

const MAX_READ_CHARS = 40000;

export class Pf2eLookupTool extends BaseTool {
  constructor() {
    super(
      'pf2e_lookup',
      'Find official PF2e documents in the installed compendia by name, or read one in full. Use it to get exact UUIDs for @UUID links, to confirm a spell, item, condition or glossary ability exists before building with it, and to read an official document as a template before writing a similar one ("read" with its uuid). Searches every compendium in the world (pf2e system first); filter with type, level, traits or packs. Read-only.'
    );
    this.requiresConfirmation = false;
    this.schema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Name or part of a name, e.g. "Fireball", "Frightful Presence", "Frightened".',
        },
        type: {
          type: 'string',
          description:
            'Document type filter: spell, weapon, armor, shield, equipment, consumable, treasure, action, feat, effect, condition, melee, npc, hazard. Glossary abilities are type "action".',
        },
        packs: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Restrict to these compendium keys, e.g. ["pf2e.spells-srd"], ["pf2e.bestiary-ability-glossary-srd"], ["pf2e.conditionitems"], ["pf2e.pathfinder-monster-core"].',
        },
        level: { type: 'number', description: 'Exact level (or spell rank).' },
        traits: {
          type: 'array',
          items: { type: 'string' },
          description: 'Traits every result must have.',
        },
        limit: { type: 'number', description: 'Maximum results (default 10).' },
        queries: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Several names in ONE call (e.g. every spell in a stat block). Returns the top matches for each; the type/packs filters apply to all.',
        },
        read: {
          type: 'string',
          description:
            'A UUID to read instead of searching. Items come back in full (system, rules). Creatures come back as a short summary (stats and every item by name, type and key numbers) unless full is true.',
        },
        full: {
          type: 'boolean',
          description: 'With read on a creature: return the complete data instead of the summary.',
        },
      },
    };
  }

  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  async execute(params) {
    if (params.read) return this._read(params.read, params.full === true);
    if (Array.isArray(params.queries) && params.queries.length) return this._batch(params);
    if (!params.query) {
      return this._result(
        { ok: false, error: 'Give a query to search, or read: <uuid> to read one document.' },
        'Nothing to look up',
        true
      );
    }
    const results = await searchCompendia({
      query: params.query,
      type: params.type,
      packs: params.packs,
      level: Number.isFinite(params.level) ? params.level : undefined,
      traits: params.traits,
      limit: Number.isFinite(params.limit) && params.limit > 0 ? params.limit : 10,
    });
    const body = {
      ok: true,
      query: params.query,
      count: results.length,
      results,
      ...(results.length
        ? {
            next: 'Use a result\'s uuid in @UUID[...] links, pass it as "base"/"uuid" to the builders, or read it with read: <uuid>.',
          }
        : {
            next: 'Nothing matched. Try fewer words, a different type, or no type filter. A miss here is not proof the thing does not exist anywhere.',
          }),
    };
    return this._result(body, `**Lookup:** "${params.query}" — ${results.length} found`);
  }

  async _batch(params) {
    const limit = Number.isFinite(params.limit) && params.limit > 0 ? params.limit : 3;
    const found = {};
    const missing = [];
    for (const query of params.queries.slice(0, 60)) {
      const results = await searchCompendia({
        query,
        type: params.type,
        packs: params.packs,
        level: Number.isFinite(params.level) ? params.level : undefined,
        traits: params.traits,
        limit,
      });
      if (results.length) {
        found[query] = results.map(r => ({
          uuid: r.uuid,
          name: r.name,
          type: r.type,
          level: r.level,
          pack: r.pack,
        }));
      } else missing.push(query);
    }
    const body = {
      ok: true,
      found,
      missing,
      next: missing.length
        ? 'Missing names: try a shorter name or no type filter, or ask the GM if it is homebrew.'
        : 'Use these uuids in @UUID[...] links or pass names straight to the builders.',
    };
    return this._result(
      body,
      `**Lookup:** ${params.queries.length} names — ${params.queries.length - missing.length} found`
    );
  }

  /** A creature in a few hundred tokens: its numbers and every item by name and key values. */
  _summarizeActor(doc) {
    const s = doc.system ?? {};
    const items = [...doc.items].map(i => {
      const sys = i.system ?? {};
      const entry = { name: i.name, type: i.type };
      if (i.type === 'melee') {
        entry.bonus = sys.bonus?.value;
        entry.damage = Object.values(sys.damageRolls ?? {}).map(
          r => `${r.damage} ${r.damageType}${r.category ? ` (${r.category})` : ''}`
        );
        entry.traits = sys.traits?.value;
      } else if (i.type === 'action') {
        entry.actions =
          sys.actionType?.value === 'action' ? sys.actions?.value : sys.actionType?.value;
        if (sys.rules?.length) entry.rules = sys.rules.map(r => r.key);
      } else if (i.type === 'spellcastingEntry') {
        entry.dc = sys.spelldc?.dc;
        entry.attack = sys.spelldc?.value;
        entry.kind = `${sys.tradition?.value} ${sys.prepared?.value}`;
      } else if (i.type === 'spell') {
        entry.rank = sys.location?.heightenedLevel ?? sys.level?.value;
      }
      return entry;
    });
    return {
      level: s.details?.level?.value,
      traits: s.traits?.value,
      size: s.traits?.size?.value,
      hp: s.attributes?.hp?.max,
      ac: s.attributes?.ac?.value,
      acDetails: s.attributes?.ac?.details || undefined,
      saves: Object.fromEntries(Object.entries(s.saves ?? {}).map(([k, v]) => [k, v.value])),
      perception: s.perception?.mod,
      skills: Object.fromEntries(Object.entries(s.skills ?? {}).map(([k, v]) => [k, v.base])),
      speed: s.attributes?.speed?.value,
      items,
    };
  }

  async _read(uuid, full = false) {
    const doc = await globalThis.fromUuid(uuid).catch(() => null);
    if (!doc)
      return this._result({ ok: false, error: `Nothing found at ${uuid}.` }, 'Not found', true);
    if (doc.documentName === 'Actor' && !full) {
      const body = {
        ok: true,
        uuid,
        name: doc.name,
        type: doc.type,
        summary: this._summarizeActor(doc),
        next: 'For a variant, pass this uuid as spec.base to pf2e_build_creature and list only what differs. Read with full: true only if you need its raw data.',
      };
      return this._result(body, `**Read:** ${doc.name} (summary)`);
    }
    const data = doc.toObject();
    delete data._stats;
    delete data.ownership;
    delete data.folder;
    let text = JSON.stringify(data);
    let truncated = false;
    if (text.length > MAX_READ_CHARS) {
      truncated = true;
      text = text.slice(0, MAX_READ_CHARS);
    }
    const body = {
      ok: true,
      uuid,
      name: doc.name,
      type: doc.type,
      truncated,
      data: truncated ? text : data,
    };
    return this._result(body, `**Read:** ${doc.name}`);
  }

  _result(body, display, isError = false) {
    return {
      content: JSON.stringify(body, null, 2),
      display,
      ...(isError ? { error: { message: String(body.error), type: 'LOOKUP' } } : {}),
    };
  }
}

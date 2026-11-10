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
        read: {
          type: 'string',
          description:
            'A UUID to read in full instead of searching. Returns the document data (system, rules, embedded items).',
        },
      },
    };
  }

  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  async execute(params) {
    if (params.read) return this._read(params.read);
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

  async _read(uuid) {
    const doc = await globalThis.fromUuid(uuid).catch(() => null);
    if (!doc)
      return this._result({ ok: false, error: `Nothing found at ${uuid}.` }, 'Not found', true);
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

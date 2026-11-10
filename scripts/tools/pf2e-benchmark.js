// SPDX-License-Identifier: MIT

/**
 * pf2e_benchmark: compare a creature's numbers with official creatures of its level,
 * computed live from the pf2e bestiaries. Read-only.
 */

import { BaseTool } from './base-tool.js';
import { officialDistributions, compareToOfficial, statsOfActor } from '../core/pf2e/benchmark.js';

export class Pf2eBenchmarkTool extends BaseTool {
  constructor() {
    super(
      'pf2e_benchmark',
      "Compare a creature's AC, HP, Perception, saves, best strike bonus and damage, and spell DC with official creatures of the same level (percentiles computed live from the installed pf2e bestiaries). Use it on a stat block BEFORE building, to point out numbers far outside the official range, and on a built actor. A homebrew outlier may be deliberate: report it, do not change it. Read-only."
    );
    this.requiresConfirmation = false;
    this.schema = {
      type: 'object',
      properties: {
        actorUuid: {
          type: 'string',
          description: 'A built NPC to benchmark. Its level and numbers are read from it.',
        },
        level: {
          type: 'number',
          description: 'Creature level, when benchmarking numbers from a stat block.',
        },
        stats: {
          type: 'object',
          description:
            'Numbers from a stat block: any of ac, hp, perception, fortitude, reflex, will, attack (best strike bonus), strikeDamage (average damage of that strike), spellDC.',
          properties: {
            ac: { type: 'number' },
            hp: { type: 'number' },
            perception: { type: 'number' },
            fortitude: { type: 'number' },
            reflex: { type: 'number' },
            will: { type: 'number' },
            attack: { type: 'number' },
            strikeDamage: { type: 'number' },
            spellDC: { type: 'number' },
          },
        },
      },
    };
  }

  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  async execute(params) {
    let level = params.level;
    let stats = params.stats ?? {};
    let name = 'stat block';
    if (params.actorUuid) {
      const actor = await globalThis.fromUuid(params.actorUuid).catch(() => null);
      if (!actor || actor.documentName !== 'Actor') {
        return {
          content: JSON.stringify({ ok: false, error: `No actor at ${params.actorUuid}.` }),
          display: 'Not found',
          error: { message: 'Actor not found', type: 'NOT_FOUND' },
        };
      }
      level = actor.system?.details?.level?.value;
      stats = { ...statsOfActor(actor), ...stats };
      name = actor.name;
    }
    if (!Number.isFinite(level)) {
      return {
        content: JSON.stringify({ ok: false, error: 'Give a level (or an actorUuid).' }),
        display: 'No level',
        error: { message: 'No level', type: 'VALIDATION' },
      };
    }
    const official = await officialDistributions(level);
    const comparison = compareToOfficial(stats, official);
    const body = {
      ok: true,
      name,
      level,
      officialCreaturesAtLevel: official.creatures,
      comparison,
      note: 'Percentiles are over official pf2e bestiary creatures of this level (strike and spell numbers from a sample of up to 30, Monster Core first). Ratings describe, they do not judge: homebrew outliers can be intended.',
    };
    const flagged = comparison.filter(c => /extreme|above|below|very low/.test(c.rating));
    return {
      content: JSON.stringify(body, null, 2),
      display: `**Benchmark:** ${name} (level ${level}) — ${flagged.length ? `${flagged.length} outlier(s)` : 'within the official range'}`,
    };
  }
}

// SPDX-License-Identifier: MIT

/**
 * pf2e_validate: check a built Actor or Item for the failures that look fine and do
 * nothing (ignored rule elements, broken links, unparsable formulas, dangling on-hit
 * effects, orphaned spells, empty DCs). Read-only.
 */

import { BaseTool } from './base-tool.js';
import { validateDocument } from '../core/pf2e/validate.js';

export class Pf2eValidateTool extends BaseTool {
  constructor() {
    super(
      'pf2e_validate',
      'Check a PF2e Actor or Item for silent failures: rule elements the system rejected (with its reason), @UUID links that do not resolve, @Damage and strike formulas that do not parse, @Check enrichers with an empty DC, strike on-hit effects naming abilities the actor lacks, and spells whose spellcasting entry is missing. The builders run this automatically; call it yourself after editing a document by hand. Read-only.'
    );
    this.requiresConfirmation = false;
    this.schema = {
      type: 'object',
      properties: { uuid: { type: 'string', description: 'UUID of the Actor or Item to check.' } },
      required: ['uuid'],
    };
  }

  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  async execute({ uuid }) {
    const doc = await globalThis.fromUuid(uuid).catch(() => null);
    if (!doc) {
      return {
        content: JSON.stringify({ ok: false, error: `Nothing found at ${uuid}.` }),
        display: 'Not found',
        error: { message: `Nothing found at ${uuid}`, type: 'NOT_FOUND' },
      };
    }
    const result = await validateDocument(doc);
    const body = {
      ...result,
      uuid,
      name: doc.name,
      next: result.ok
        ? 'No silent failures found. The document is still unverified until it is used in play.'
        : 'Fix each problem (the rule element reference has the valid shapes), then validate again.',
    };
    return {
      content: JSON.stringify(body, null, 2),
      display: result.ok
        ? `**Valid:** ${doc.name}`
        : `**${result.problems.length} problem(s):** ${doc.name}`,
    };
  }
}

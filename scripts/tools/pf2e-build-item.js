// SPDX-License-Identifier: MIT
/* eslint-disable complexity, max-lines-per-function -- data mapping: each optional stat-block field is a `??` default or a guard, which the complexity rule counts as a branch. Splitting would scatter one mapping across many functions. */

/**
 * pf2e_build_item: build one PF2e item — an ability or strike on an actor, an effect,
 * feat, spell, or any piece of equipment — from scratch or by copying an official
 * item ("base") and changing what differs. On an actor, an item with the same slug
 * and type is replaced in place, so rebuilding is idempotent.
 */

import { BaseTool } from './base-tool.js';
import { buildItemData, checkItemSpec, ITEM_TYPES } from '../core/pf2e/item-builder.js';
import { createLookup } from '../core/pf2e/compendium.js';
import { ensureFolder, resolvePack, describePlacement } from '../core/pf2e/placement.js';
import { validateDocument } from '../core/pf2e/validate.js';
import { markNeedsTesting } from '../core/verification-state.js';

export class Pf2eBuildItemTool extends BaseTool {
  constructor() {
    super(
      'pf2e_build_item',
      [
        'Build one PF2e item: an ability or strike on an actor (homebrew creature abilities, hazard reactions), or an effect, feat, spell, weapon, armor, shield, equipment, consumable or treasure in the world or a compendium.',
        `spec.type: ${ITEM_TYPES.join(', ')}.`,
        'Start from an official item with spec.base (a name or UUID from pf2e_lookup) and change only what differs; or build from scratch.',
        'spec keys: type, name, base, basePack, img, slug, level, rarity, traits[], description (plain lines or HTML), rules[] (replace), addRules[] (append), system {…deep-merged into system…}, price {gp, sp, cp};',
        'for type action: actions (1|2|3|"free"|"reaction"|"passive"), category, frequency {max, per}, aura, auraTraits[];',
        'for type melee: bonus, damage[{formula, type, category?}], effects[], range; for type effect: duration {value, unit, expiry}.',
        'On an actor (actorUuid), an existing item with the same slug and type is replaced. The item is validated and marked for testing.',
        'Field shapes: read_reference pf2e-item-fields.md and pf2e-rule-elements.md.',
      ].join(' ')
    );
    this.requiresConfirmation = true;
    this.schema = {
      type: 'object',
      properties: {
        spec: { type: 'object', description: 'The item spec (keys in the tool description).' },
        actorUuid: {
          type: 'string',
          description: 'Put the item on this actor (NPC, hazard or character).',
        },
        itemUuid: {
          type: 'string',
          description: 'Rebuild this existing world or compendium item in place.',
        },
        folder: {
          type: 'string',
          description: 'World folder for a new world item (created if missing).',
        },
        pack: {
          type: 'string',
          description: 'Compendium key for a new item (not a pf2e system pack).',
        },
        intent: {
          type: 'string',
          description: 'What the item should do in play, kept with the test record.',
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
    const where = params.actorUuid
      ? `on ${params.actorUuid}`
      : params.itemUuid
        ? `rebuild ${params.itemUuid}`
        : params.pack
          ? `compendium ${params.pack}`
          : params.folder
            ? `world folder "${params.folder}"`
            : 'the world';
    const rules = (s.rules?.length ?? 0) + (s.addRules?.length ?? 0);
    return {
      type: 'build',
      title: `Build ${s.type ?? 'item'}: ${s.name ?? s.base ?? '(unnamed)'}`,
      details: `${s.base ? `Copy of "${s.base}". ` : ''}${rules} rule element(s) → ${where}.`,
    };
  }

  async execute(params) {
    if (!game.user?.isGM)
      return this._reject(
        { ok: false, error: 'Only a GM can build items.' },
        'GM required',
        'PERMISSION_DENIED'
      );
    const errors = checkItemSpec(params.spec);
    if (errors.length)
      return this._reject(
        { ok: false, errors, next: 'Fix these and call again.' },
        'Spec invalid',
        'VALIDATION_ERROR'
      );

    const { item: data, warnings } = await buildItemData(params.spec, createLookup());
    if (!data)
      return this._reject({ ok: false, error: warnings.join(' ') }, 'Base not found', 'NOT_FOUND');

    let item;
    try {
      if (params.actorUuid) item = await this._onActor(params.actorUuid, data);
      else if (params.itemUuid) item = await this._rebuild(params.itemUuid, data);
      else item = await this._create(data, params);
    } catch (error) {
      return this._reject(
        { ok: false, error: `Write failed: ${error.message}` },
        'Write failed',
        'WRITE_FAILED'
      );
    }
    if (item?.error)
      return this._reject({ ok: false, error: item.error }, 'Cannot place item', 'PLACEMENT');

    await markNeedsTesting(item, { intent: params.intent ?? null });
    const validation = await validateDocument(item);
    const body = {
      ok: validation.ok,
      itemUuid: item.uuid,
      name: item.name,
      type: item.type,
      slug: item.system?.slug,
      placed: describePlacement(item),
      replaced: item._simulacrumReplaced === true,
      warnings,
      validation: validation.problems,
      next: validation.ok
        ? 'Report where it is. It is marked for testing: ask the GM to use it in play, then read_ability_runs with this itemUuid.'
        : 'Fix the validation problems and rebuild (same slug on the same actor replaces it).',
    };
    return {
      content: JSON.stringify(body, null, 2),
      display: `**Built:** @UUID[${item.uuid}]{${item.name}}${validation.ok ? '' : ` — ${validation.problems.length} problem(s)`}`,
    };
  }

  async _onActor(uuid, data) {
    const actor = await globalThis.fromUuid(uuid);
    if (!actor || actor.documentName !== 'Actor') return { error: `No actor at ${uuid}.` };
    const existing = actor.items.find(
      i => i.type === data.type && i.system?.slug && i.system.slug === data.system?.slug
    );
    if (existing) {
      // Merge rather than replace: arrays (rules, traits) are replaced whole by a merge,
      // and system defaults the spec did not mention survive.
      await existing.update({ name: data.name, img: data.img, system: data.system });
      existing._simulacrumReplaced = true;
      return existing;
    }
    const [created] = await actor.createEmbeddedDocuments('Item', [data], { keepId: true });
    return created;
  }

  async _rebuild(uuid, data) {
    const item = await globalThis.fromUuid(uuid);
    if (!item || item.documentName !== 'Item') return { error: `No item at ${uuid}.` };
    await item.update({ name: data.name, img: data.img, system: data.system });
    item._simulacrumReplaced = true;
    return item;
  }

  async _create(data, params) {
    const { pack, error } = resolvePack(params.pack, 'Item');
    if (error) return { error };
    if (!pack && params.folder) data.folder = await ensureFolder('Item', params.folder);
    const ItemClass = CONFIG.Item.documentClass;
    return ItemClass.create(data, pack ? { pack: pack.collection } : {});
  }

  _reject(body, display, type) {
    return {
      content: JSON.stringify(body, null, 2),
      display,
      error: { message: String(body.error ?? (body.errors ?? []).join('; ') ?? display), type },
    };
  }
}

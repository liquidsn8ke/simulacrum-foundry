// SPDX-License-Identifier: MIT
/* eslint-disable complexity, max-lines-per-function -- data mapping: each optional stat-block field is a `??` default or a guard, which the complexity rule counts as a branch. Splitting would scatter one mapping across many functions. */

/**
 * Roll recorder for PF2e: when a built creature or item is used in play, keep a
 * record of what the system actually did, so the agent can compare it with what it
 * intended (read_ability_runs) instead of guessing.
 *
 * pf2e already puts the whole story on each chat message: the roll context
 * (`flags.pf2e.context`: type, outcome, DC, domains, roll options), the origin item,
 * the rolls with their dice, and applied-damage records. This records those for any
 * message whose item or actor is marked as needing testing (verification-state.js),
 * and nothing else.
 *
 * Only the active GM's client writes, so a record is not written once per client.
 */

import { shouldRecord, recordRun } from '../verification-state.js';
import { stripHtml } from './text.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('RollRecorder');

/** Roll options worth keeping: the ones that explain why a rule did or did not apply. */
const INTERESTING_PREFIXES = [
  'item:',
  'target:',
  'self:condition',
  'self:effect',
  'origin:',
  'inflicts:',
  'action:',
  'area-',
  'check:',
  'damage:',
  'degree-of-success',
  'hp-',
];
/** A kept option: one of the prefixes, or a bare word (a toggle such as "two-handed"). */
const isInteresting = option =>
  INTERESTING_PREFIXES.some(p => option.startsWith(p)) || /^[a-z-]+$/.test(option);

/**
 * Summarise one chat message into a run record.
 * @param {object} message - ChatMessage
 * @param {object} subject - the tracked document (item or actor)
 * @returns {object}
 */
export function describeMessage(message, subject) {
  const pf2e = message.flags?.pf2e ?? {};
  const context = pf2e.context ?? {};
  const options = Array.isArray(context.options) ? context.options : [];
  const rolls = (message.rolls ?? []).map(roll => ({
    formula: roll.formula,
    total: roll.total,
    ...(roll.options?.degreeOfSuccess !== undefined
      ? { degreeOfSuccess: roll.options.degreeOfSuccess }
      : {}),
    dice: (roll.dice ?? []).map(d => ({
      faces: d.faces,
      results: (d.results ?? []).map(r => r.result),
    })),
  }));

  return {
    at: new Date().toISOString(),
    subject: subject.name,
    item: message.item?.name ?? pf2e.origin?.uuid ?? null,
    actor: message.actor?.name ?? message.speaker?.alias ?? null,
    flavor: stripHtml(message.flavor).slice(0, 300) || undefined,
    content: stripHtml(message.content).slice(0, 500) || undefined,
    context: {
      type: context.type,
      outcome: context.outcome,
      unadjustedOutcome: context.unadjustedOutcome,
      dc: context.dc?.value ?? context.dc,
      domains: context.domains,
      target: context.target?.actor ?? context.target?.token ?? undefined,
      notes: (context.notes ?? []).map(n => n.title ?? n.text).filter(Boolean),
      options: options.filter(isInteresting).slice(0, 60),
    },
    rolls,
    ...(pf2e.appliedDamage ? { appliedDamage: pf2e.appliedDamage } : {}),
  };
}

/**
 * The tracked document a message belongs to, if any: its item when that item is
 * marked for testing, else its actor when the actor is.
 * @param {object} message
 * @returns {object|null}
 */
export function trackedSubject(message) {
  let item = message.item ?? null;
  const originUuid = message.flags?.pf2e?.origin?.uuid;
  if (!item && originUuid) {
    try {
      item = globalThis.fromUuidSync?.(originUuid) ?? null;
    } catch {
      item = null;
    }
  }
  if (item && shouldRecord(item)) return item;
  const actor = message.actor ?? item?.actor ?? null;
  if (actor && shouldRecord(actor)) return actor;
  return null;
}

/** Register the hook. Safe to call once at init. */
export function registerRollRecorder() {
  Hooks.on('createChatMessage', async message => {
    try {
      const activeGM = globalThis.game?.users?.activeGM;
      if (activeGM && activeGM.id !== globalThis.game.user.id) return;
      const subject = trackedSubject(message);
      if (!subject) return;
      await recordRun(subject, describeMessage(message, subject));
    } catch (error) {
      logger.warn('Could not record a roll for a tracked document', error);
    }
  });
}

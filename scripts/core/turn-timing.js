// SPDX-License-Identifier: MIT

/**
 * Turn timing: how long one GM message took to answer, split into waiting on the AI
 * model and running tools, so slow turns can be diagnosed from facts rather than
 * guesses. One turn runs at a time, so a single module-level record is enough.
 */

let current = null;

/** Start timing a turn. */
export function startTurn() {
  current = { startedAt: Date.now(), aiCalls: 0, aiMs: 0, toolCalls: 0, toolMs: 0 };
}

/**
 * Record one AI request.
 * @param {number} ms
 */
export function recordAI(ms) {
  if (!current) return;
  current.aiCalls += 1;
  current.aiMs += ms;
}

/**
 * Record one batch of tool executions.
 * @param {number} count - tools run in the batch
 * @param {number} ms
 */
export function recordTools(count, ms) {
  if (!current) return;
  current.toolCalls += count;
  current.toolMs += ms;
}

/** "1m 05s" / "12.3s" */
export function formatMs(ms) {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/**
 * Finish the turn and return its summary (null if none was started).
 * @returns {{totalMs:number, aiCalls:number, aiMs:number, toolCalls:number, toolMs:number, text:string}|null}
 */
export function finishTurn() {
  if (!current) return null;
  const t = current;
  current = null;
  const totalMs = Date.now() - t.startedAt;
  const otherMs = Math.max(0, totalMs - t.aiMs - t.toolMs);
  const text =
    `Turn took ${formatMs(totalMs)}: ${t.aiCalls} AI call${t.aiCalls === 1 ? '' : 's'} ` +
    `(${formatMs(t.aiMs)}${t.aiCalls ? `, avg ${formatMs(t.aiMs / t.aiCalls)}` : ''}), ` +
    `${t.toolCalls} tool run${t.toolCalls === 1 ? '' : 's'} (${formatMs(t.toolMs)})` +
    (otherMs > 1000 ? `, waiting/other ${formatMs(otherMs)}` : '') +
    '.';
  return { ...t, totalMs, text };
}

// SPDX-License-Identifier: MIT

/**
 * Small text helpers shared by the PF2e builders. No Foundry globals, so they are
 * unit-testable.
 */

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * A Foundry-style 16-character id. Uses Foundry's own generator when present.
 * @param {number} [length=16]
 * @returns {string}
 */
export function randomID(length = 16) {
  const fn = globalThis.foundry?.utils?.randomID;
  if (typeof fn === 'function') return fn(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALNUM[Math.floor(Math.random() * ALNUM.length)];
  return out;
}

/**
 * pf2e-style slug: lowercase, apostrophes dropped, other runs of non-alphanumerics to "-".
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Words that open a labelled paragraph in official ability text. */
const LABEL_WORDS = [
  'Trigger',
  'Requirements?',
  'Frequency',
  'Effect',
  'Critical Success',
  'Success',
  'Failure',
  'Critical Failure',
  'Special',
  'Maximum Duration',
  'Onset',
  'Stage \\d+',
  'Activate',
  'Cost',
  'Duration',
  'Range',
  'Targets?',
  'Area',
  'Saving Throw',
  'Heightened \\([^)]*\\)',
];
const LABELS = new RegExp(`^(${LABEL_WORDS.join('|')})\\b[:\\s]*(.*)$`);

/**
 * Plain text to official-style HTML. Each line becomes a paragraph; lines that start
 * with a label (Trigger, Requirements, Frequency, Effect, Critical Success …) get the
 * label bolded, and a rule is inserted before "Effect" as official text does. Input
 * that already starts with an HTML tag is returned unchanged.
 * @param {string} text
 * @returns {string}
 */
export function toHTML(text) {
  if (text == null) return '';
  const source = String(text);
  if (!source.trim()) return '';
  if (/^\s*</.test(source)) return source;
  const out = [];
  for (const raw of source.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(LABELS);
    if (match) {
      if (match[1] === 'Effect' && out.length) out.push('<hr />');
      out.push(`<p><strong>${match[1]}</strong> ${match[2]}</p>`);
    } else {
      out.push(`<p>${line}</p>`);
    }
  }
  return out.join('\n');
}

/**
 * Deep merge plain objects (arrays and scalars replace). Returns a new object.
 * @param {object} base
 * @param {object} patch
 * @returns {object}
 */
export function deepMerge(base, patch) {
  if (!isPlainObject(base)) return clone(patch);
  if (!isPlainObject(patch)) return patch === undefined ? clone(base) : clone(patch);
  const out = clone(base);
  for (const [key, value] of Object.entries(patch)) {
    out[key] =
      isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : clone(value);
  }
  return out;
}

/** @param {*} value @returns {boolean} */
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {*} value @returns {*} A deep copy of plain data. */
export function clone(value) {
  if (value === undefined) return undefined;
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

/** Strip HTML tags for short summaries. */
export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// SPDX-License-Identifier: MIT

/**
 * Where built documents go: a world folder, a compendium, or onto an actor.
 * Never into the pf2e system's own packs, which are replaced on every update.
 */

/**
 * Find a folder by name, creating it when missing.
 * @param {"Actor"|"Item"} type
 * @param {string} name
 * @returns {Promise<string|null>} folder id
 */
export async function ensureFolder(type, name) {
  if (!name) return null;
  const existing = globalThis.game.folders.find(f => f.type === type && f.name === name);
  if (existing) return existing.id;
  const created = await globalThis.Folder.create({ name, type });
  return created?.id ?? null;
}

/**
 * Check a compendium is a writable target.
 * @param {string} key
 * @param {"Actor"|"Item"} documentName
 * @returns {{pack: object|null, error: string|null}}
 */
export function resolvePack(key, documentName) {
  if (!key) return { pack: null, error: null };
  const pack = globalThis.game.packs.get(key);
  if (!pack)
    return {
      pack: null,
      error: `No compendium "${key}". List compendiums with list_documents (documentType "Compendium").`,
    };
  if (pack.metadata?.packageType === 'system' || pack.metadata?.packageName === 'pf2e') {
    return {
      pack: null,
      error: `"${key}" belongs to the pf2e system and is replaced on every update; choose a world or module compendium.`,
    };
  }
  if (pack.documentName !== documentName) {
    return {
      pack: null,
      error: `"${key}" holds ${pack.documentName} documents, not ${documentName}.`,
    };
  }
  if (pack.locked)
    return {
      pack: null,
      error: `"${key}" is locked. Unlock it first (update_document on the compendium) or choose another.`,
    };
  return { pack, error: null };
}

/**
 * Where a result landed, for messages.
 * @param {object} doc
 * @returns {string}
 */
export function describePlacement(doc) {
  if (doc.pack) return `compendium ${doc.pack}`;
  if (doc.parent) return `on ${doc.parent.name}`;
  return doc.folder ? `world folder "${doc.folder.name}"` : 'the world (no folder)';
}

// SPDX-License-Identifier: MIT

/**
 * build_journal: a whole journal entry — every page — in one call, from light markdown
 * or HTML. Or add pages to an existing journal. Saves the several document-tool calls
 * (entry, then each page) a journal otherwise takes.
 */

import { BaseTool } from './base-tool.js';
import { markdownToHTML } from '../core/pf2e/markdown.js';
import { ensureFolder, resolvePack } from '../core/pf2e/placement.js';

const MAX_PAGES = 50;

export class BuildJournalTool extends BaseTool {
  constructor() {
    super(
      'build_journal',
      'Create a journal entry with all its pages in one call, or add pages to an existing journal (journalUuid). Page text is light markdown (# headings, - lists, **bold**, *italic*, > quotes, --- rules, blank-line paragraphs) or HTML; enrichers such as @UUID[...]{name}, @Check[...] and @Damage[...] work as usual. Image pages take a file path instead of text.'
    );
    this.requiresConfirmation = true;
    this.schema = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Journal entry name (for a new journal).' },
        pages: {
          type: 'array',
          description: 'Pages in order.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              text: { type: 'string', description: 'Markdown or HTML.' },
              image: {
                type: 'string',
                description: 'Image path for an image page (instead of text).',
              },
              caption: { type: 'string' },
            },
            required: ['name'],
          },
        },
        journalUuid: {
          type: 'string',
          description: 'Add the pages to this existing journal instead of creating one.',
        },
        folder: { type: 'string', description: 'World folder name (created if missing).' },
        pack: {
          type: 'string',
          description: 'Journal compendium key to create it in instead of the world.',
        },
        playerVisible: {
          type: 'boolean',
          description:
            'Give players Observer permission on a new journal (default false: GM only).',
        },
      },
      required: ['pages'],
    };
  }

  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  async getConfirmationDetails(params) {
    const pages = (params.pages ?? []).map(p => p.name).join(', ');
    return {
      type: 'build',
      title: params.journalUuid
        ? 'Add journal pages'
        : `Create journal: ${params.name ?? '(unnamed)'}`,
      details: `${(params.pages ?? []).length} page(s): ${pages}`,
    };
  }

  static pageData(page, index) {
    const sort = (index + 1) * 100000;
    if (page.image) {
      return {
        name: page.name,
        type: 'image',
        src: page.image,
        image: { caption: page.caption ?? '' },
        sort,
      };
    }
    return {
      name: page.name,
      type: 'text',
      text: { content: markdownToHTML(page.text ?? ''), format: 1 },
      sort,
    };
  }

  /** The first problem with the request, or null. */
  static check(params, isGM) {
    if (!isGM) return 'Only a GM can build journals.';
    const pages = Array.isArray(params.pages) ? params.pages : [];
    if (!pages.length) return 'pages must list at least one page.';
    if (pages.length > MAX_PAGES) return `At most ${MAX_PAGES} pages per call.`;
    if (pages.some(p => !p?.name)) return 'Every page needs a name.';
    if (!params.journalUuid && !params.name) return 'name is required for a new journal.';
    return null;
  }

  async execute(params) {
    const problem = BuildJournalTool.check(params, !!game.user?.isGM);
    if (problem) return this._fail(problem);
    try {
      return params.journalUuid ? await this._append(params) : await this._create(params);
    } catch (e) {
      return this._fail(`Write failed: ${e.message}`, 'WRITE_FAILED');
    }
  }

  async _append(params) {
    const journal = await globalThis.fromUuid(params.journalUuid).catch(() => null);
    if (journal?.documentName !== 'JournalEntry')
      return this._fail(`No journal at ${params.journalUuid}.`);
    const offset = journal.pages.size;
    const created = await journal.createEmbeddedDocuments(
      'JournalEntryPage',
      params.pages.map((p, i) => BuildJournalTool.pageData(p, offset + i))
    );
    return this._ok(journal, created.length);
  }

  async _create(params) {
    const { pack, error } = resolvePack(params.pack, 'JournalEntry');
    if (error) return this._fail(error);
    const data = {
      name: params.name,
      pages: params.pages.map((p, i) => BuildJournalTool.pageData(p, i)),
      ownership: { default: params.playerVisible ? 2 : 0 },
    };
    if (!pack && params.folder) data.folder = await ensureFolder('JournalEntry', params.folder);
    const JournalClass = CONFIG.JournalEntry.documentClass;
    const journal = await JournalClass.create(data, pack ? { pack: pack.collection } : {});
    return this._ok(journal, params.pages.length);
  }

  _fail(error, type = 'VALIDATION_ERROR') {
    return {
      content: JSON.stringify({ ok: false, error }),
      display: error,
      error: { message: error, type },
    };
  }

  _ok(journal, count) {
    const body = {
      ok: true,
      journalUuid: journal.uuid,
      name: journal.name,
      pagesAdded: count,
      pages: journal.pages.map(p => ({ name: p.name, uuid: p.uuid })),
    };
    return {
      content: JSON.stringify(body, null, 2),
      display: `**Journal:** @UUID[${journal.uuid}]{${journal.name}} — ${count} page(s)`,
    };
  }
}

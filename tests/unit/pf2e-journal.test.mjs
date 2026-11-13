import assert from 'node:assert/strict';
import { test } from 'node:test';

import { markdownToHTML } from '../../scripts/core/pf2e/markdown.js';
import { BuildJournalTool } from '../../scripts/tools/build-journal.js';

test('markdown becomes journal HTML; enrichers and HTML pass through', () => {
  const html = markdownToHTML(
    [
      '# Hosilla',
      'A **zealot** of *Asmodeus*,',
      'secretly devoted to Baphomet.',
      '',
      '- glaive',
      '- @UUID[Compendium.pf2e.spells-srd.Item.wdA52JJnsuQWeyqz]{Harm}',
      '1. first',
      '2. second',
      '---',
      '> Orders from Staunton Vhane',
    ].join('\n')
  );
  assert.equal(
    html,
    [
      '<h1>Hosilla</h1>',
      '<p>A <strong>zealot</strong> of <em>Asmodeus</em>, secretly devoted to Baphomet.</p>',
      '<ul>',
      '<li>glaive</li>',
      '<li>@UUID[Compendium.pf2e.spells-srd.Item.wdA52JJnsuQWeyqz]{Harm}</li>',
      '</ul>',
      '<ol>',
      '<li>first</li>',
      '<li>second</li>',
      '</ol>',
      '<hr />',
      '<blockquote><p>Orders from Staunton Vhane</p></blockquote>',
    ].join('\n')
  );
  assert.equal(markdownToHTML('<p>kept</p>'), '<p>kept</p>');
  assert.equal(markdownToHTML(''), '');
});

test('journal requests are checked before anything is written', () => {
  const page = { name: 'Overview', text: 'Hi' };
  assert.match(BuildJournalTool.check({ name: 'J', pages: [page] }, false), /GM/);
  assert.match(BuildJournalTool.check({ name: 'J', pages: [] }, true), /at least one page/);
  assert.match(BuildJournalTool.check({ pages: [page] }, true), /name is required/);
  assert.match(BuildJournalTool.check({ name: 'J', pages: [{ text: 'x' }] }, true), /needs a name/);
  assert.equal(
    BuildJournalTool.check({ journalUuid: 'JournalEntry.x', pages: [page] }, true),
    null
  );
});

test('pages become text or image journal pages in order', () => {
  assert.deepEqual(BuildJournalTool.pageData({ name: 'A', text: '# T' }, 0), {
    name: 'A',
    type: 'text',
    text: { content: '<h1>T</h1>', format: 1 },
    sort: 100000,
  });
  assert.deepEqual(BuildJournalTool.pageData({ name: 'Map', image: 'maps/a.webp' }, 1), {
    name: 'Map',
    type: 'image',
    src: 'maps/a.webp',
    image: { caption: '' },
    sort: 200000,
  });
});

// SPDX-License-Identifier: MIT

/**
 * Light markdown to HTML for journal pages: # headings, - / * / 1. lists, > quotes,
 * --- rules, **bold**, *italic*, blank-line paragraphs. Enrichers (@UUID, @Check …)
 * pass through untouched. No Foundry globals (unit-tested).
 */

const inline = text =>
  text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');

/** What a line is: blank, heading, rule, bullet, numbered, quote or text. */
function classify(line) {
  if (!line) return { kind: 'blank' };
  const heading = line.match(/^(#{1,6})\s+(.*)$/);
  if (heading) return { kind: 'heading', level: heading[1].length, text: heading[2] };
  if (/^(-{3,}|\*{3,})$/.test(line)) return { kind: 'rule' };
  const bullet = line.match(/^[-*]\s+(.*)$/);
  if (bullet) return { kind: 'item', list: 'ul', text: bullet[1] };
  const numbered = line.match(/^\d+[.)]\s+(.*)$/);
  if (numbered) return { kind: 'item', list: 'ol', text: numbered[1] };
  if (line.startsWith('>')) return { kind: 'quote', text: line.replace(/^>\s?/, '') };
  return { kind: 'text', text: line };
}

/** Collects output, keeping track of the open paragraph and list. */
class Writer {
  out = [];
  para = [];
  list = null;

  flushPara() {
    if (this.para.length) this.out.push(`<p>${inline(this.para.join(' '))}</p>`);
    this.para = [];
  }

  closeList() {
    if (this.list) this.out.push(`</${this.list}>`);
    this.list = null;
  }

  /** End any open paragraph and list, then emit a block. */
  block(html) {
    this.flushPara();
    this.closeList();
    if (html) this.out.push(html);
  }

  item(list, text) {
    this.flushPara();
    if (this.list !== list) {
      this.closeList();
      this.out.push(`<${list}>`);
      this.list = list;
    }
    this.out.push(`<li>${inline(text)}</li>`);
  }

  text(text) {
    this.closeList();
    this.para.push(text);
  }
}

const RENDER = {
  blank: w => w.block(''),
  heading: (w, l) => w.block(`<h${l.level}>${inline(l.text)}</h${l.level}>`),
  rule: w => w.block('<hr />'),
  item: (w, l) => w.item(l.list, l.text),
  quote: (w, l) => w.block(`<blockquote><p>${inline(l.text)}</p></blockquote>`),
  text: (w, l) => w.text(l.text),
};

/**
 * Markdown to HTML. Input that already starts with an HTML tag is returned unchanged.
 * @param {string} text
 * @returns {string}
 */
export function markdownToHTML(text) {
  if (text == null) return '';
  const source = String(text);
  if (!source.trim()) return '';
  if (/^\s*</.test(source)) return source;
  const writer = new Writer();
  for (const raw of source.split('\n')) {
    const line = classify(raw.trim());
    RENDER[line.kind](writer, line);
  }
  writer.block('');
  return writer.out.join('\n');
}

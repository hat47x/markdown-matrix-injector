import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import XLSX from 'xlsx';

import { auditDeliveryReferences } from '../src/application/deliveryAudit.js';

/**
 * SHO Research Index ↔ MMI delivery-audit semantic-boundary probe.
 * The MMI production application reads the SAME Markdown bytes as the
 * external markdown-it grammar probe, but the two have different scopes.
 * This deliberately does not invoke SHO, its editor or Research Index.
 */
test('T15: Markdown research links are not whole-file Excel MMI embeds', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-sho-link-boundary-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = path.join(root, 'docs');
  const excel = path.join(root, 'excel');
  fs.mkdirSync(docs);
  fs.mkdirSync(excel);

  const workbook = path.join(excel, 'a.xlsx');
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['ID', '意味'], [1, '合成資料'],
  ]), 'Design');
  fs.writeFileSync(workbook, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));

  const document = path.join(docs, 'index.md');
  const original = [
    '# 研究資料と納品候補',
    '- [論文](https://example.org/paper) — 研究上の外部候補',
    '- ![[../excel/a.xlsx]] — MMI納品監査対象のファイル埋込',
    '',
  ].join('\n');
  fs.writeFileSync(document, original, 'utf8');

  const parseMarkdownLinks = (source: string) => {
    const md = new MarkdownIt('commonmark', { html: false, linkify: false });
    const links: string[] = [];
    for (const token of md.parse(source, {})) {
      for (const inline of token.children ?? []) {
        if (inline.type === 'link_open') {
          const href = inline.attrGet('href');
          if (href) links.push(href);
        }
      }
    }
    return links;
  };
  const audit = () => auditDeliveryReferences({
    markdownFilePath: document,
    inventoryDirectory: excel,
    workspaceRoot: root,
  });

  const firstBytes = fs.readFileSync(document);
  const before = audit();  // real MMI application, not an alternative parser
  assert.equal(before.scope, 'file-only-excel-mmi-embeds');
  assert.equal(before.delivery.counts.references, 1);
  assert.equal(before.comparison.counts.matched, 1);
  assert.equal(before.comparison.alignment, 'aligned');
  assert.deepEqual(parseMarkdownLinks(firstBytes.toString('utf8')),
    ['https://example.org/paper']);
  assert.deepEqual(fs.readFileSync(document), firstBytes);
  // "aligned" is MMI file/inventory alignment, not paper validity or delivery acceptance.

  // An author changes only the syntactic role of the local Excel reference:
  // it becomes an ordinary Markdown link, not an MMI whole-file embed.
  const revised = original.replace('![[../excel/a.xlsx]]',
    '[設計書](../excel/a.xlsx)');
  assert.notEqual(revised, original);
  fs.writeFileSync(document, revised, 'utf8');
  const after = audit();
  assert.equal(after.delivery.counts.references, 0);
  assert.equal(after.comparison.counts.matched, 0);
  assert.equal(after.comparison.counts['inventory-unreferenced'], 1);
  assert.equal(after.comparison.alignment, 'differences');
  assert.deepEqual(parseMarkdownLinks(fs.readFileSync(document, 'utf8')),
    ['https://example.org/paper', '../excel/a.xlsx']);
  // Counts from one syntax category cannot be used as the other category's
  // reference coverage or as accepted academic/delivery meaning.
});

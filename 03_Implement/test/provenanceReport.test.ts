import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildProvenanceReport,
  formatProvenanceReport,
} from '../src/application/provenanceReport.js';
import { extractTable } from '../src/cli/extract.js';
import { PROVENANCE_REPORT_SCHEMA, provenanceReportSchemaJson } from '../src/core/provenanceReportContract.js';

function workspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-provenance-'));
}

function writeCsv(file: string, rows: readonly string[]): void {
  fs.writeFileSync(file, `${['item,value', ...rows].join('\n')}\n`);
}

test('report resolves Linked references and reports source digests without cell values', () => {
  const root = workspace();
  try {
    writeCsv(path.join(root, 'data.csv'), ['A,1', 'B,2']);
    fs.writeFileSync(path.join(root, 'doc.md'), [
      '# 設計',
      '',
      '![[data.csv#Sheet1|A1:B3]]',
      '',
      '```md',
      '![[missing.csv#Sheet1|A1:B2]]',
      '```',
      '',
      '`![[inline-missing.csv#S|A1]]`',
      '',
    ].join('\n'));
    const report = buildProvenanceReport({
      markdownFilePath: path.join(root, 'doc.md'),
      workspaceRoot: root,
      ledgerPath: path.join(root, 'mmi-ledger.json'),
      diagnostics: [],
    });
    assert.equal(report.schema, PROVENANCE_REPORT_SCHEMA);
    assert.deepEqual(report.summary, {
      linked: 1,
      extracted: 0,
      diagnostics: 0,
      stale: 0,
      missingSources: 0,
    });
    assert.deepEqual(
      [report.linked[0].line, report.linked[0].source, report.linked[0].sheet, report.linked[0].range, report.linked[0].status],
      [3, 'data.csv', 'Sheet1', 'A1:B3', 'resolved'],
    );
    assert.match(report.linked[0].sourceDigest ?? '', /^sha256:[0-9a-f]{64}$/u);
    assert.equal(report.review.status, 'not-configured');
    const serialized = JSON.stringify(report);
    assert.ok(!serialized.includes('A,1'));
    assert.ok(!serialized.includes('"item,value"'));
    const markdown = formatProvenanceReport(report);
    assert.match(markdown, /^# 出典報告: doc\.md/mu);
    assert.match(markdown, /!\[\[data\.csv#Sheet1\|A1:B3\]\]/u);
    assert.ok(!markdown.includes('| A | 1 |'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('missing and outside-root sources are distinguished, and diagnostics are counted', () => {
  const root = workspace();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-provenance-outside-'));
  try {
    fs.writeFileSync(path.join(outside, 'outside.csv'), 'a\n1\n');
    fs.writeFileSync(path.join(root, 'doc.md'), [
      '![[missing.csv#Sheet1|A1]]',
      '',
      '![[../' + path.basename(outside) + '/outside.csv#Sheet1|A1]]',
      '',
    ].join('\n'));
    const report = buildProvenanceReport({
      markdownFilePath: path.join(root, 'doc.md'),
      workspaceRoot: root,
      ledgerPath: path.join(root, 'mmi-ledger.json'),
      diagnostics: [{
        file: 'doc.md',
        line: 1,
        column: 1,
        severity: 'error',
        code: 'MMI_TEST',
        message: 'synthetic diagnostic',
      }],
    });
    assert.deepEqual(report.linked.map((item) => item.status), ['missing', 'outside-root']);
    assert.equal(report.summary.missingSources, 2);
    assert.equal(report.summary.diagnostics, 1);
    assert.equal(report.diagnostics[0].code, 'MMI_TEST');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('adopted Extracted assets join the ledger and become stale only when their content changes', () => {
  const root = workspace();
  try {
    const source = path.join(root, 'data.csv');
    const document = path.join(root, 'doc.md');
    const ledger = path.join(root, 'mmi-ledger.json');
    writeCsv(source, ['A,1', 'B,2']);
    const extracted = extractTable({
      sourcePath: source,
      sheet: 'Sheet1',
      range: 'A1:B3',
      outDir: path.join(root, 'assets'),
      fromDocument: document,
      ledgerPath: ledger,
      sourceLabel: 'data.csv',
    });
    assert.deepEqual(extracted.problems, []);
    assert.ok(extracted.extracted);
    fs.writeFileSync(document, [
      '![[data.csv#Sheet1|A1:B3]]',
      '',
      extracted.extracted.markdown,
      '',
    ].join('\n'));
    const fresh = buildProvenanceReport({
      markdownFilePath: document,
      workspaceRoot: root,
      ledgerPath: ledger,
      diagnostics: [],
    });
    assert.equal(fresh.extracted.length, 1);
    assert.equal(fresh.extracted[0].freshness, 'fresh');
    assert.equal(fresh.extracted[0].ledger?.output, extracted.extracted.file
      .replace(`${root}${path.sep}`, '').split(path.sep).join('/'));
    assert.equal(fresh.summary.stale, 0);

    writeCsv(source, ['A,9', 'B,2']);
    const stale = buildProvenanceReport({
      markdownFilePath: document,
      workspaceRoot: root,
      ledgerPath: ledger,
      diagnostics: [],
    });
    assert.equal(stale.extracted[0].freshness, 'stale');
    assert.equal(stale.summary.stale, 1);
    assert.equal(stale.extracted[0].problems?.[0].code, 'MMI_DETACH_EXTRACTED_STALE');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the public schema names the report contract and its required sections', () => {
  const schema = provenanceReportSchemaJson();
  assert.equal(schema.$id, PROVENANCE_REPORT_SCHEMA);
  assert.deepEqual(
    schema.required,
    ['schema', 'document', 'summary', 'linked', 'extracted', 'review', 'diagnostics'],
  );
  assert.equal(
    (schema.properties as Record<string, unknown>).schema
      && ((schema.properties as Record<string, { const?: string }>).schema.const),
    PROVENANCE_REPORT_SCHEMA,
  );
});

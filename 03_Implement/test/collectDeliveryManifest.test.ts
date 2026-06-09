import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkbookCache } from '../src/cache/workbookCache.js';
import {
  buildDeliveryManifestCsv,
  collectDeliveryManifestRecords,
} from '../src/manifest/collectDeliveryManifest.js';

interface Fixture {
  markdownFilePath: string;
}

function createFixture(): Fixture {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-manifest-'));
  const docsDir = path.join(tempDir, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });

  // Small table -> renders inline (NOT an attachment).
  fs.writeFileSync(path.join(docsDir, 'small.csv'), 'Name,Role\nAlice,Admin\nBob,User');

  // Wide table (>10 columns) -> Smart Fallback card (attachment).
  const wideHeader = Array.from({ length: 11 }, (_, i) => `C${i + 1}`).join(',');
  const wideRow = Array.from({ length: 11 }, (_, i) => String(i + 1)).join(',');
  fs.writeFileSync(path.join(docsDir, 'wide.csv'), `${wideHeader}\n${wideRow}`);

  return { markdownFilePath: path.join(docsDir, 'spec.md') };
}

function collect(markdown: string, fixture: Fixture) {
  return collectDeliveryManifestRecords({
    markdownText: markdown,
    markdownFilePath: fixture.markdownFilePath,
    cache: new WorkbookCache(),
  });
}

test('collectDeliveryManifestRecords includes mode=card embeds with reason, caption and id', () => {
  const fixture = createFixture();
  const records = collect(
    '![[./small.csv#Sheet1|A1:B3?mode=card&caption=ロール一覧&id=card-roles]]',
    fixture,
  );

  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    sourcePath: './small.csv',
    sheet: 'Sheet1',
    range: 'A1:B3',
    reason: 'mode=card 指定',
    caption: 'ロール一覧',
    id: 'card-roles',
  });
});

test('collectDeliveryManifestRecords includes wide tables that exceed the column threshold', () => {
  const fixture = createFixture();
  const records = collect('![[./wide.csv#Sheet1|A1:K2]]', fixture);

  assert.equal(records.length, 1);
  assert.equal(records[0].sourcePath, './wide.csv');
  assert.match(records[0].reason, /列数が閾値\(10\)超過/);
});

test('collectDeliveryManifestRecords includes whole-file references (no sheet target)', () => {
  const fixture = createFixture();
  const records = collect('![[./small.csv]]', fixture);

  assert.equal(records.length, 1);
  assert.equal(records[0].reason, 'シート未指定（ファイル全体参照）');
});

test('collectDeliveryManifestRecords excludes embeds that render as inline tables', () => {
  const fixture = createFixture();
  const records = collect('![[./small.csv#Sheet1|A1:B3?header=first]]', fixture);

  assert.equal(records.length, 0);
});

test('collectDeliveryManifestRecords skips broken links (unreadable file)', () => {
  const fixture = createFixture();
  const records = collect('![[./does-not-exist.csv#Sheet1|A1:B2]]', fixture);

  assert.equal(records.length, 0);
});

test('collectDeliveryManifestRecords skips embeds whose sheet is missing', () => {
  const fixture = createFixture();
  const records = collect('![[./small.csv#NoSuchSheet|A1:B2]]', fixture);

  assert.equal(records.length, 0);
});

test('collectDeliveryManifestRecords collects only attachment embeds from a mixed document', () => {
  const fixture = createFixture();
  const markdown = [
    '# Doc',
    '![[./small.csv#Sheet1|A1:B3?header=first]]', // inline table -> excluded
    '![[./wide.csv#Sheet1|A1:K2]]', // wide -> card
    '![[./small.csv#Sheet1|A1:B3?mode=card&id=c1]]', // explicit card
  ].join('\n\n');

  const records = collect(markdown, fixture);

  assert.equal(records.length, 2);
  assert.deepEqual(
    records.map((record) => record.sourcePath),
    ['./wide.csv', './small.csv'],
  );
});

test('buildDeliveryManifestCsv returns a header-only CSV when there are no attachments', () => {
  const fixture = createFixture();
  const { records, csvText } = buildDeliveryManifestCsv({
    markdownText: '![[./small.csv#Sheet1|A1:B3?header=first]]',
    markdownFilePath: fixture.markdownFilePath,
    cache: new WorkbookCache(),
  });

  assert.equal(records.length, 0);
  assert.equal(csvText, 'sourcePath,sheet,range,reason,caption,id');
});

test('buildDeliveryManifestCsv emits a header and one row per attachment', () => {
  const fixture = createFixture();
  const { records, csvText } = buildDeliveryManifestCsv({
    markdownText: '![[./small.csv#Sheet1|A1:B3?mode=card&caption=Roles&id=c1]]',
    markdownFilePath: fixture.markdownFilePath,
    cache: new WorkbookCache(),
  });

  assert.equal(records.length, 1);
  assert.equal(
    csvText,
    ['sourcePath,sheet,range,reason,caption,id', './small.csv,Sheet1,A1:B3,mode=card 指定,Roles,c1'].join('\n'),
  );
});

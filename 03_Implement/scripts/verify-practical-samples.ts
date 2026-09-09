import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import MarkdownIt from 'markdown-it';
import { markdownMatrixPlugin } from '../src/plugin/markdownMatrixPlugin.js';
import { WorkbookCache } from '../src/cache/workbookCache.js';
import { buildDeliveryManifestCsv } from '../src/manifest/collectDeliveryManifest.js';
import { loadWorkbook } from '../src/core/workbookLoader.js';

const root = path.resolve(import.meta.dirname, '../../04_Documentation/samples/practical');
const snapshot = () => Object.fromEntries(fs.readdirSync(path.join(root, 'data')).sort().map(name =>
  [name, createHash('sha256').update(fs.readFileSync(path.join(root, 'data', name))).digest('hex')]));
const before = snapshot();
const expected: Record<string, { rows: number[]; cards?: number; errors?: number }> = {
  '01-first-table.md': { rows: [4] },
  '02-requirements.md': { rows: [4, 5, 24] },
  '03-workflow.md': { rows: [12, 5] },
  '04-permissions.md': { rows: [12, 12, 4] },
  '05-api.md': { rows: [4, 1] },
  '06-testing.md': { rows: [5, 4] },
  '07-operations.md': { rows: [2, 5, 8] },
  '08-release.md': { rows: [3, 10], cards: 2 },
  '09-large-table.md': { rows: [15, 4], cards: 1 },
  '10-print.md': { rows: [3, 12], cards: 1 },
  '11-diagnostics.md': { rows: [], errors: 3 },
  '12-tsv.md': { rows: [4] },
};
const results = [];
for (const [file, want] of Object.entries(expected)) {
  const markdownFilePath = path.join(root, file);
  const text = fs.readFileSync(markdownFilePath, 'utf8');
  const md = new MarkdownIt().use(markdownMatrixPlugin, { workspaceRoot: root, cache: new WorkbookCache() });
  const tokens = md.parse(text, {});
  const html = md.renderer.render(tokens, md.options, {currentDocument:{fsPath:markdownFilePath}});
  const rows = [...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].map(m => (m[1].match(/<tr /g) ?? []).length);
  const cards = (html.match(/class="mmi-card"/g) ?? []).length;
  const errors = (html.match(/class="mmi-error"/g) ?? []).length;
  assert.deepEqual({rows, cards, errors}, {rows:want.rows,cards:want.cards??0,errors:want.errors??0}, file);
  if (file === '02-requirements.md') for (const id of ['REQ-003','REQ-008','REQ-010','REQ-016','REQ-024']) assert.ok(html.includes(id));
  results.push({file, rows, cards, errors});
}
const manifest = buildDeliveryManifestCsv({markdownFilePath:path.join(root,'08-release.md'),markdownText:fs.readFileSync(path.join(root,'08-release.md'),'utf8'),workspaceRoot:root});
assert.deepEqual(manifest.records.map(r=>r.sourcePath),['./data/design.xlsx','./data/applications-wide.csv']);
assert.deepEqual(Object.keys(loadWorkbook({absolutePath:path.join(root,'data/design.xlsx')}).sheets),['状態遷移','権限','API']);
assert.deepEqual(snapshot(),before,'Source bytes changed during rendering');
const report = {date:new Date().toISOString(),results,manifestRecords:manifest.records.length,sourceHashes:before,sourceUnchanged:true};
const out = process.argv[2];
if (out) fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

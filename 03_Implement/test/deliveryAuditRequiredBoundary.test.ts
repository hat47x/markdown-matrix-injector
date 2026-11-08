import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import XLSX from 'xlsx';

// The synthetic contract is a test-only independent oracle, NOT a product
// Required schema, business decision, or claim of contractual acceptance.
interface RequiredItem { id: string; expectedArtifact: string; }
interface RequiredFixture { version: string; items: RequiredItem[]; }

function classifyExternalRequirements(
  required: RequiredFixture,
  observedMatchedPaths: readonly string[],
) {
  const matched = new Set(observedMatchedPaths);
  return {
    version: required.version,
    coveredCandidates: required.items.filter(item => matched.has(item.expectedArtifact)).map(item => item.id),
    notCovered: required.items.filter(item => !matched.has(item.expectedArtifact)).map(item => item.id),
  };
}

test('T14: aligned Declared/Observed stays aligned when an independent Required item is missing', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-delivery-required-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = path.join(root, 'docs');
  const excel = path.join(root, 'excel');
  const contracts = path.join(root, 'contract');
  for (const dir of [docs, excel, contracts]) fs.mkdirSync(dir);

  const createWorkbook = (name: string) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['ID', 'Type'], [name, 'synthetic'],
    ]), 'Design');
    fs.writeFileSync(path.join(excel, name), XLSX.write(workbook, {
      type: 'buffer', bookType: 'xlsx',
    }));
  };
  createWorkbook('screen.xlsx');
  createWorkbook('data.xlsx');

  const markdown = path.join(docs, 'delivery.md');
  fs.writeFileSync(markdown, [
    '# Synthetic delivery declaration',
    '![[../excel/screen.xlsx]]',
    '![[../excel/data.xlsx]]',
  ].join('\n'));
  const requiredPath = path.join(contracts, 'requirements.json');

  const contract0: RequiredFixture = {
    version: 'synthetic-R0',
    items: [
      { id: 'screen', expectedArtifact: 'excel/screen.xlsx' },
      { id: 'data', expectedArtifact: 'excel/data.xlsx' },
    ],
  };
  const contract1: RequiredFixture = {
    version: 'synthetic-R1',
    items: [
      ...contract0.items,
      { id: 'test', expectedArtifact: 'excel/test-cases.xlsx' },
    ],
  };

  const writeExternalRequirements = (required: RequiredFixture) =>
    fs.writeFileSync(requiredPath, JSON.stringify(required, null, 2));
  const runAudit = () => {
    const cli = spawnSync(process.execPath, [
      '--import', 'tsx', 'src/cli/bootstrap.ts',
      'delivery-audit', markdown, excel, '--root', root, '--json',
    ], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    return JSON.parse(cli.stdout);
  };

  const originalMarkdown = fs.readFileSync(markdown);
  const originalSources = ['screen.xlsx', 'data.xlsx'].map(name =>
    fs.readFileSync(path.join(excel, name)));

  writeExternalRequirements(contract0);
  const auditR0 = runAudit();
  assert.equal(auditR0.comparison.alignment, 'aligned');
  assert.equal(auditR0.comparison.counts.matched, 2);
  assert.equal(auditR0.delivery.counts.references, 2);
  assert.equal(auditR0.inventory.entries.length, 2);

  // R1 differs only in the external contract, outside the scanned inventory.
  writeExternalRequirements(contract1);
  const auditR1 = runAudit();
  assert.deepEqual(auditR1, auditR0);
  assert.equal(auditR1.comparison.alignment, 'aligned');

  const matchedPaths: string[] = auditR1.comparison.findings
    .filter((finding: { relation: string }) => finding.relation === 'matched')
    .map((finding: { path: string }) => finding.path);
  const externalOracle: RequiredFixture = JSON.parse(
    fs.readFileSync(requiredPath, 'utf8'),
  );
  assert.deepEqual(classifyExternalRequirements(contract0, matchedPaths), {
    version: 'synthetic-R0',
    coveredCandidates: ['screen', 'data'],
    notCovered: [],
  });
  assert.deepEqual(classifyExternalRequirements(externalOracle, matchedPaths), {
    version: 'synthetic-R1',
    coveredCandidates: ['screen', 'data'],
    notCovered: ['test'],
  });

  assert.deepEqual(fs.readFileSync(markdown), originalMarkdown);
  assert.deepEqual(['screen.xlsx', 'data.xlsx'].map(name =>
    fs.readFileSync(path.join(excel, name))), originalSources);
});

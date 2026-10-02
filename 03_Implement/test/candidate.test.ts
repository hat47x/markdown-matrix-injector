import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tableCandidates } from '../src/adapters/tableRegionAdapter.js';
import { candidateProblem, type Candidate } from '../src/core/candidate.js';
import { sheetSourceFromMatrix } from '../src/core/sheetSource.js';
import { checkPaths, inspectSource } from '../src/cli/mmi.js';
import { renderDocumentMarkdown } from '../src/cli/render.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIGEST = `sha256:${'a'.repeat(64)}`;

const input = (rows: string[][], over: Partial<Parameters<typeof tableCandidates>[0]> = {}) => ({
  source: './data/設計.xlsx',
  sourceDigest: DIGEST,
  sheetName: '状態遷移',
  sheet: sheetSourceFromMatrix(rows),
  ...over,
});

const TABLE = [
  ['状態遷移表', '', ''],
  ['ID', '現在状態', '操作'],
  ['1', '受付', '引当'],
  ['2', '引当済', '出荷'],
];

function good(): Candidate {
  const [candidate] = tableCandidates(input(TABLE));
  return structuredClone(candidate);
}

test('table adapter: coordinates are observed, boundary/title/header are inferred -- per claim, all deterministic', () => {
  const [candidate] = tableCandidates(input(TABLE));
  assert.equal(candidateProblem(candidate), undefined);
  assert.deepEqual(
    candidate.claims.map((c) => [c.aspect, c.status, c.method, c.execution]),
    [
      ['location', 'observed', 'M0', 'deterministic'],
      ['boundary', 'inferred', 'M1', 'deterministic'],
      ['title', 'inferred', 'M1', 'deterministic'],
      ['header', 'inferred', 'M1', 'deterministic'],
    ],
  );
  assert.deepEqual([candidate.kind, candidate.status, candidate.execution, candidate.method], ['table-range', 'inferred', 'deterministic', 'M1']);
  assert.equal(candidate.locator.range, 'A2:C4');
  assert.equal(candidate.reference, '![[./data/設計.xlsx#状態遷移|A2:C4?header=first]]');
  assert.deepEqual(candidate.scores, []);
});

test('table adapter: an uncertain header is an abstained claim with no value, not a guessed one', () => {
  // Duplicate first-row texts over an all-text body: the header rules cannot call it a header.
  const [candidate] = tableCandidates(input([['x', 'x'], ['c', 'd'], ['e', 'f']]));
  const header = candidate.claims.find((c) => c.aspect === 'header')!;
  assert.deepEqual([header.status, header.value, header.reasonCode], ['abstained', undefined, 'header-uncertain']);
  assert.equal(candidateProblem(candidate), undefined);
  assert.ok(!candidate.reference!.includes('header=first'));
  assert.equal(candidate.status, 'inferred'); // the candidate still stands; only the header claim is withdrawn
  // A single row has no body to be a header for: abstain with a different reason.
  const single = tableCandidates(input([['a', 'b']]))[0].claims.find((c) => c.aspect === 'header')!;
  assert.deepEqual([single.status, single.reasonCode], ['abstained', 'no-header']);
});

test('provenance is reproducible: same input + config + version => identical output; a changed cell changes the fingerprint', () => {
  assert.deepEqual(tableCandidates(input(TABLE)), tableCandidates(input(TABLE)));
  const [a] = tableCandidates(input(TABLE));
  const changed = TABLE.map((row) => [...row]);
  changed[3][2] = '取消';
  const [b] = tableCandidates(input(changed));
  assert.notEqual(a.fingerprint.digest, b.fingerprint.digest);
  assert.deepEqual(a.provenance.run, { execution: 'deterministic', inputDigest: DIGEST, config: { maxScanCells: 1_000_000 }, implementationVersion: '1' });
  // The fingerprint follows the content, not the place: the same table lower down keeps it.
  const moved = [[''], [''], [''], ...TABLE];
  assert.equal(tableCandidates(input(moved))[0].fingerprint.digest, a.fingerprint.digest);
  assert.notEqual(tableCandidates(input(moved))[0].locator.range, a.locator.range);
});

test('contract invariants reject malformed candidates', () => {
  const mutate = (change: (candidate: Candidate) => void): string | undefined => {
    const candidate = good();
    change(candidate);
    return candidateProblem(candidate);
  };
  assert.match(mutate((c) => ((c.claims as Candidate['claims'] & unknown[]).length = 0))!, /at least one claim/u);
  assert.match(mutate((c) => ((c as { status: string }).status = 'confirmed'))!, /invalid candidate epistemic status/u);
  assert.match(mutate((c) => ((c.claims[0] as { status: string }).status = 'confirmed'))!, /invalid claim .* epistemic status/u);
  assert.match(mutate((c) => ((c.claims[0] as { method: string }).method = 'M1'))!, /observed claim .* must be M0/u);
  assert.match(mutate((c) => ((c.claims[3] as { value?: unknown }).value = undefined))!, /needs a value/u);
  assert.match(mutate((c) => ((c.claims[3] as { status: string }).status = 'abstained'))!, /must not carry a value/u);
  assert.match(mutate((c) => ((c.provenance.run as { inputDigest: string }).inputDigest = `sha256:${'b'.repeat(64)}`))!, /inputDigest/u);
  assert.match(mutate((c) => ((c.scores as unknown[]).push({ provider: 'x', scale: 's', value: 1 })))!, /no provider scores/u);
  assert.match(mutate((c) => ((c.claims[1] as { execution: string }).execution = 'provider-dependent'))!, /provider-dependent inside a deterministic/u);
  assert.match(mutate((c) => ((c as { status: string }).status = 'abstained'))!, /abstained exactly when/u);
});

test('provider-dependent candidates carry provider/model/artifact/parameters, and scores stay per provider (never merged)', () => {
  const base = good();
  const model: Candidate = {
    ...base,
    status: 'inferred',
    execution: 'provider-dependent',
    method: 'M4',
    claims: base.claims.map((c) => ({ ...c, status: c.aspect === 'location' ? 'observed' : 'inferred', execution: 'provider-dependent' as const, method: c.aspect === 'location' ? ('M0' as const) : ('M4' as const) })),
    provenance: {
      algorithm: 'local-llm.table-judgment',
      run: { execution: 'provider-dependent', inputDigest: DIGEST, provider: 'lm-studio', model: 'model-x', artifactVersion: 'q4', parameters: { temperature: 0, seed: 1 } },
    },
    scores: [
      { provider: 'lm-studio', scale: 'logprob', value: -0.2 },
      { provider: 'fly-matcher', scale: 'cosine', value: 0.91 },
    ],
  };
  assert.equal(candidateProblem(model), undefined);
  // No merged confidence exists on the type or on real output.
  assert.ok(!('confidence' in model));
  assert.ok(!('confidence' in good()));
  const sameProviderTwice = { ...model, scores: [...model.scores, { provider: 'lm-studio', scale: 'logprob', value: -0.3 }] };
  assert.match(candidateProblem(sameProviderTwice)!, /duplicate score/u);
  const noModel = structuredClone(model);
  (noModel.provenance.run as { model: string }).model = '';
  assert.match(candidateProblem(noModel)!, /provider, model and artifactVersion/u);
});

// --- CLI -----------------------------------------------------------------------

const SAMPLES = path.resolve(here, '../../04_Documentation/samples/practical');

test('inspect --json: candidates equal the existing regions one-to-one, and existing fields are unchanged', () => {
  for (const name of ['design.xlsx', 'requirements.csv', 'migration.xml', 'settings.tsv', 'api.csv', 'permissions.csv']) {
    const file = path.join(SAMPLES, 'data', name);
    const result = inspectSource(file, 0, path.join(SAMPLES, 'doc.md'));
    const regions = result.sheets.flatMap((sheet) => sheet.regions.map((region) => ({ sheet: sheet.name, ...region })));
    assert.equal(result.candidates.length, regions.length, name);
    result.candidates.forEach((candidate, i) => {
      assert.equal(candidateProblem(candidate), undefined, `${name}: ${candidateProblem(candidate)}`);
      assert.equal(candidate.locator.range, regions[i].a1, name);
      assert.equal(candidate.locator.sheet, regions[i].sheet, name);
      assert.equal(candidate.reference, regions[i].reference, `${name}: the Candidate's reference must equal inspect's reference`);
    });
    assert.ok(regions.length > 0, `${name} has regions`);
  }
});

test('cognition does not change check diagnostics or the rendered logical table', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cand-'));
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'data', 'roles.csv'), 'ID,操作\nOP-01,申請\nOP-02,承認\n');
  const doc = path.join(root, 'spec.md');
  fs.writeFileSync(doc, '![[./data/roles.csv#Sheet1|A1:B3?header=first]]\n');
  const broken = path.join(root, 'broken.md'); // render refuses broken references, so check gets its own document
  fs.writeFileSync(broken, '![[./data/roles.csv#Sheet1|A1:B3?header=first]]\n\n![[./data/missing.csv]]\n');
  const run = async () => ({
    diagnostics: await checkPaths([broken], root),
    md: renderDocumentMarkdown({ markdownFilePath: doc, workspaceRoot: root }),
  });
  const before = await run();
  assert.equal(before.diagnostics.length, 1);
  inspectSource(path.join(root, 'data', 'roles.csv'), 2, doc); // candidate generation runs
  assert.deepEqual(await run(), before);
  // Structural guarantee: the authority path does not import candidate or cognition modules.
  for (const file of ['../src/cli/render.ts', '../src/dx/diagnostics.ts', '../src/dx/vscodeAdapters.ts', '../src/core/renderTable.ts']) {
    const source = fs.readFileSync(path.resolve(here, file), 'utf8');
    assert.doesNotMatch(source, /from '[^']*(adapters\/|core\/candidate|search\/|experimental\/)/u, `${file} must not depend on candidates/cognition`);
  }
});

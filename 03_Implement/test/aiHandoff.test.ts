import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { main } from '../src/cli/mmi.js';
import { fingerprintOf, type Candidate } from '../src/core/candidate.js';
import {
  AI_HANDOFF_SCHEMA,
  createAiHandoffPackage,
  renderAiHandoffPrompt,
} from '../src/dx/aiHandoff.js';
import { screenDesignWorkbook } from './helpers/buildXlsxWithImages.js';

function candidate(): Candidate {
  const sourceDigest = fingerprintOf('source-bytes-v1', 'source').digest;
  return {
    kind: 'table-range',
    locator: {
      source: './data/design.xlsx',
      sourceDigest,
      sheet: '画面一覧',
      range: 'A1:B3',
    },
    status: 'inferred',
    execution: 'deterministic',
    method: 'M1',
    claims: [
      {
        aspect: 'location',
        value: 'A1:B3',
        status: 'observed',
        execution: 'deterministic',
        method: 'M0',
        reasonCode: 'source-cell-coordinates',
      },
      {
        aspect: 'header',
        value: ['顧客番号', '秘密区分'],
        status: 'inferred',
        execution: 'deterministic',
        method: 'M1',
        reasonCode: 'header-likely',
        evidence: [{
          code: 'shape',
          detail: '秘密のセル値を含む説明',
        }],
      },
      {
        aspect: 'semantic-role',
        status: 'abstained',
        execution: 'deterministic',
        method: 'M1',
        reasonCode: 'ambiguous-role',
        evidence: [{
          code: 'insufficient-evidence',
          detail: '秘密の未解決内容',
        }],
      },
    ],
    provenance: {
      algorithm: 'mmi.table-region-adapter',
      run: {
        execution: 'deterministic',
        inputDigest: sourceDigest,
        config: { maxScanCells: 1000 },
        implementationVersion: '1',
      },
    },
    fingerprint: fingerprintOf('table-display-cells-v1', 'private-content'),
    scores: [],
    reference: '![[./data/design.xlsx#画面一覧|A1:B3?header=first]]',
  };
}

test('default handoff separates epistemic classes and omits Claim values/evidence details', () => {
  const pkg = createAiHandoffPackage({
    task: '画面一覧から参照案を提案する',
    candidates: [candidate()],
    diagnostics: [{
      file: 'docs/spec.md',
      line: 12,
      column: 3,
      severity: 'error',
      code: 'MMI_SHEET_NOT_FOUND',
      message: 'Sheet not found: 旧画面',
    }],
  });

  assert.equal(pkg.schema, AI_HANDOFF_SCHEMA);
  assert.equal(pkg.privacy.sourceValues, 'omitted');
  assert.equal(pkg.confirmedFacts.length, 1);
  assert.equal(pkg.confirmedFacts[0].status, 'observed');
  assert.equal(pkg.confirmedFacts[0].value, undefined);
  assert.equal(pkg.inferredCandidates.length, 1);
  assert.equal(pkg.inferredCandidates[0].claims.length, 1);
  assert.equal(pkg.inferredCandidates[0].claims[0].value, undefined);
  assert.deepEqual(pkg.inferredCandidates[0].claims[0].evidence, [{ code: 'shape' }]);
  assert.equal(
    pkg.unresolvedIssues.some((item) =>
      item.kind === 'abstained-claim' && item.reasonCode === 'ambiguous-role'),
    true,
  );
  assert.equal(
    pkg.unresolvedIssues.some((item) =>
      item.kind === 'diagnostic' && item.code === 'MMI_SHEET_NOT_FOUND'),
    true,
  );

  const serialized = JSON.stringify(pkg);
  assert.equal(serialized.includes('顧客番号'), false);
  assert.equal(serialized.includes('秘密区分'), false);
  assert.equal(serialized.includes('秘密のセル値'), false);
  assert.equal(serialized.includes('秘密の未解決内容'), false);
});

test('source Claim values are included only by explicit opt-in', () => {
  const pkg = createAiHandoffPackage({
    task: '候補を説明する',
    candidates: [candidate()],
    includeValues: true,
  });

  assert.equal(pkg.privacy.sourceValues, 'included-explicitly');
  assert.deepEqual(
    pkg.inferredCandidates[0].claims[0].value,
    ['顧客番号', '秘密区分'],
  );
  assert.equal(
    pkg.inferredCandidates[0].claims[0].evidence[0].detail,
    '秘密のセル値を含む説明',
  );
});

test('prompt is derived from the package and preserves proposal-only Authority boundary', () => {
  const pkg = createAiHandoffPackage({
    task: '適切なMMI参照を提案する',
    candidates: [candidate()],
  });
  const prompt = renderAiHandoffPrompt(pkg);

  assert.match(prompt, /依頼: 適切なMMI参照を提案する/u);
  assert.match(prompt, /source values: omitted/u);
  assert.match(prompt, /提案だけを返してください/u);
  assert.match(prompt, /Authority Planeで再検証/u);
  assert.match(prompt, /value omitted/u);
  assert.doesNotMatch(prompt, /顧客番号/u);
  assert.doesNotMatch(prompt, /秘密区分/u);
});

test('handoff refuses empty tasks and malformed Candidate input', () => {
  assert.throws(
    () => createAiHandoffPackage({ task: '  ', candidates: [candidate()] }),
    /task must not be empty/u,
  );

  const invalid: Candidate = {
    ...candidate(),
    claims: [],
  };
  assert.throws(
    () => createAiHandoffPackage({ task: '提案する', candidates: [invalid] }),
    /candidate 0 is invalid/u,
  );
});

test('source list is deduplicated by locator source and source digest', () => {
  const first = candidate();
  const second: Candidate = {
    ...candidate(),
    locator: { ...candidate().locator, range: 'D1:F4' },
    fingerprint: fingerprintOf('table-display-cells-v1', 'other'),
  };
  const pkg = createAiHandoffPackage({
    task: '候補を比較する',
    candidates: [first, second],
  });
  assert.equal(pkg.sources.length, 1);
  assert.equal(pkg.sources[0].source, './data/design.xlsx');
});


async function captureMain(argv: string[]): Promise<{ code: number; output: string }> {
  const written: string[] = [];
  const out = process.stdout.write.bind(process.stdout);
  const err = console.error;
  process.stdout.write = ((chunk: string) => (written.push(String(chunk)), true)) as typeof process.stdout.write;
  console.error = () => undefined;
  try {
    return { code: await main(argv), output: written.join('') };
  } finally {
    process.stdout.write = out;
    console.error = err;
  }
}

test('CLI handoff emits a local evidence package with diagnostics and keeps values opt-in', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ai-handoff-'));
  const data = path.join(root, 'data');
  const docs = path.join(root, 'docs');
  fs.mkdirSync(data);
  fs.mkdirSync(docs);
  const source = path.join(data, 'design.xlsx');
  const document = path.join(docs, 'spec.md');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);
  fs.writeFileSync(
    document,
    '# Spec\n\n![[../data/design.xlsx#存在しないシート|A1:B3]]\n',
  );

  const safe = await captureMain([
    'handoff',
    source,
    '--task',
    'この設計書で使うMMI参照案を提案する',
    '--document',
    document,
    '--root',
    root,
    '--json',
  ]);
  assert.equal(safe.code, 0);
  const pkg = JSON.parse(safe.output);
  assert.equal(pkg.schema, AI_HANDOFF_SCHEMA);
  assert.equal(pkg.privacy.sourceValues, 'omitted');
  assert.equal(
    pkg.unresolvedIssues.some((item: any) =>
      item.kind === 'diagnostic' && item.code === 'MMI_SHEET_NOT_FOUND'),
    true,
  );
  assert.equal(safe.output.includes('ログイン画面のダンプ'), false);
  assert.equal(safe.output.includes('"画面ID"'), false);
  assert.equal(safe.output.includes('"ログイン"'), false);

  const prompt = await captureMain([
    'handoff',
    source,
    '--task',
    'この設計書で使うMMI参照案を提案する',
    '--document',
    document,
    '--root',
    root,
  ]);
  assert.equal(prompt.code, 0);
  assert.match(prompt.output, /MMI自身は外部サービスへ送信していません/u);
  assert.match(prompt.output, /MMI_SHEET_NOT_FOUND/u);
  assert.doesNotMatch(prompt.output, /ログイン画面のダンプ/u);

  const withValues = await captureMain([
    'handoff',
    source,
    '--task',
    '候補の値も含めて説明する',
    '--root',
    root,
    '--json',
    '--include-values',
  ]);
  assert.equal(withValues.code, 0);
  assert.equal(JSON.parse(withValues.output).privacy.sourceValues, 'included-explicitly');
  assert.equal(
    withValues.output.includes('ログイン画面のダンプ')
      || withValues.output.includes('画面ID')
      || withValues.output.includes('ログイン'),
    true,
  );
});

test('CLI handoff requires an explicit task', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ai-handoff-'));
  const source = path.join(root, 'design.xlsx');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);
  assert.equal((await captureMain(['handoff', source])).code, 2);
});


test('CLI handoff refuses source and document paths outside the workspace root', async () => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ai-handoff-outer-'));
  const root = path.join(outer, 'workspace');
  fs.mkdirSync(root);
  const outsideSource = path.join(outer, 'outside.xlsx');
  fs.writeFileSync(outsideSource, screenDesignWorkbook().bytes);

  assert.equal((await captureMain([
    'handoff',
    outsideSource,
    '--task',
    '参照案を提案する',
    '--root',
    root,
  ])).code, 2);

  const insideSource = path.join(root, 'inside.xlsx');
  fs.writeFileSync(insideSource, screenDesignWorkbook().bytes);
  const outsideDocument = path.join(outer, 'outside.md');
  fs.writeFileSync(outsideDocument, '# outside\n');

  assert.equal((await captureMain([
    'handoff',
    insideSource,
    '--task',
    '参照案を提案する',
    '--document',
    outsideDocument,
    '--root',
    root,
  ])).code, 2);
});


test('legacy confirmed Claims stay out of source-observed facts', () => {
  const base = candidate();
  const legacyConfirmed: Candidate = {
    ...base,
    status: 'confirmed',
    claims: [{
      aspect: 'header',
      value: ['旧互換'],
      status: 'confirmed',
      execution: 'deterministic',
      method: 'M1',
      reasonCode: 'legacy-reviewed',
    }],
  };
  const pkg = createAiHandoffPackage({
    task: '旧互換Candidateを確認する',
    candidates: [legacyConfirmed],
  });

  assert.equal(pkg.confirmedFacts.length, 0);
  assert.equal(pkg.inferredCandidates.length, 1);
  assert.equal(pkg.inferredCandidates[0].claims[0].status, 'confirmed');
  assert.equal(JSON.stringify(pkg).includes('旧互換'), false);
});

test('human-readable handoff prompt exposes Candidate identity and supported proposal formats without values', () => {
  const pkg = createAiHandoffPackage({
    task: '候補を選び、必要なら変換案を返す',
    candidates: [candidate()],
  });
  const identity = pkg.inferredCandidates[0].candidateIdentity.digest;
  const prompt = renderAiHandoffPrompt(pkg);

  assert.equal(prompt.includes(identity), true);
  assert.match(prompt, /mmi\.ai-handoff-candidate-selection\/v1/u);
  assert.match(prompt, /mmi\.ai-handoff-transformation-proposal\/v1/u);
  assert.match(prompt, /targetStateは linked または extracted/u);
  assert.doesNotMatch(prompt, /顧客番号/u);
  assert.doesNotMatch(prompt, /秘密区分/u);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { BaselineConverter } from '../src/core/baselineImport.js';
import {
  evaluateMarkItDownBaseline,
  parseMarkItDownBaselineEvaluation,
  verifyMarkItDownBaselineEvaluationArtifact,
} from '../src/evaluation/markItDownBaselineEvaluation.js';
import { screenDesignWorkbook } from './helpers/buildXlsxWithImages.js';

const sha256 = (bytes: Buffer): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

test('evaluation compares converter Markdown with MMI source observations without auto-reconciliation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-markitdown-eval-'));
  const sourcePath = path.join(root, 'screen-design.xlsx');
  const outputRoot = path.join(root, 'out');
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);

  const converter: BaselineConverter = {
    descriptor: { id: 'microsoft.markitdown-cli', version: '0.1.8-fixture' },
    async convert() {
      fs.mkdirSync(outputRoot, { recursive: true });
      const artifactPath = path.join(outputRoot, 'baseline.md');
      const markdown = [
        '## 画面一覧',
        '',
        '| 画面ID | 画面名 |',
        '| --- | --- |',
        '| S01 | ログイン |',
        '',
        '## 遷移図',
        '',
        '## メモ',
        '',
        '画像なし',
        '',
      ].join('\n');
      fs.writeFileSync(artifactPath, markdown);
      return {
        artifacts: [{
          id: 'markitdown-markdown',
          kind: 'markdown',
          relativePath: 'baseline.md',
          contentDigest: sha256(fs.readFileSync(artifactPath)),
          mediaType: 'text/markdown',
        }],
      };
    },
  };

  const report = await evaluateMarkItDownBaseline({
    sourcePath,
    outputRoot,
    converter,
    sourceLabel: 'issue-0194-screen-design-v1',
  });

  assert.equal(report.schema, 'mmi.baseline-converter-evaluation/v1');
  assert.equal(report.source.label, 'issue-0194-screen-design-v1');
  assert.match(report.source.digest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(JSON.stringify(report).includes(root), false);
  assert.equal(report.source.sheetCount, 3);
  assert.equal(report.source.candidateCounts.image, 4);
  assert.equal(report.source.images.length, 4);
  assert.deepEqual(
    report.markdown.sheetEvidence,
    [
      { sheet: '画面一覧', markdownHeadingPresent: true },
      { sheet: '遷移図', markdownHeadingPresent: true },
      { sheet: 'メモ', markdownHeadingPresent: true },
    ],
  );
  assert.equal(report.markdown.tableSeparatorLineCount, 1);
  assert.equal(report.markdown.imageReferenceCount, 0);
  assert.deepEqual(report.reconciliation, {
    candidateAddressability: 'not-provided-by-baseline-artifact',
    automaticImportDecision: 'none',
  });
});

test('evaluation records missing sheet headings and explicit image references as evidence only', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-markitdown-eval-'));
  const sourcePath = path.join(root, 'screen-design.xlsx');
  const outputRoot = path.join(root, 'out');
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);

  const converter: BaselineConverter = {
    descriptor: { id: 'fixture.converter', version: '1' },
    async convert() {
      fs.mkdirSync(outputRoot, { recursive: true });
      const artifactPath = path.join(outputRoot, 'baseline.md');
      const markdown = '## 画面一覧\n\n![screen](image.png)\n<img src="other.png">\n';
      fs.writeFileSync(artifactPath, markdown);
      return {
        artifacts: [{
          id: 'document',
          kind: 'markdown',
          relativePath: 'baseline.md',
          contentDigest: sha256(fs.readFileSync(artifactPath)),
        }],
      };
    },
  };

  const report = await evaluateMarkItDownBaseline({
    sourcePath,
    outputRoot,
    converter,
  });

  assert.equal(report.source.label, 'screen-design.xlsx');
  assert.deepEqual(
    report.markdown.sheetEvidence.map((item) => [item.sheet, item.markdownHeadingPresent]),
    [['画面一覧', true], ['遷移図', false], ['メモ', false]],
  );
  assert.equal(report.markdown.imageReferenceCount, 2);
  assert.equal(report.reconciliation.automaticImportDecision, 'none');
});


test('evaluation rejects converter artifact digest mismatches', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-markitdown-eval-'));
  const sourcePath = path.join(root, 'screen-design.xlsx');
  const outputRoot = path.join(root, 'out');
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);

  const converter: BaselineConverter = {
    descriptor: { id: 'fixture.converter', version: '1' },
    async convert() {
      fs.mkdirSync(outputRoot, { recursive: true });
      fs.writeFileSync(path.join(outputRoot, 'baseline.md'), '# changed\n');
      return {
        artifacts: [{
          id: 'document',
          kind: 'markdown',
          relativePath: 'baseline.md',
          contentDigest: sha256(Buffer.from('different')),
        }],
      };
    },
  };

  await assert.rejects(
    evaluateMarkItDownBaseline({ sourcePath, outputRoot, converter }),
    /artifact digest mismatch/u,
  );
});

test('evaluation rejects converter artifact path escape', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-markitdown-eval-'));
  const sourcePath = path.join(root, 'screen-design.xlsx');
  const outputRoot = path.join(root, 'out');
  const outside = path.join(root, 'outside.md');
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);
  fs.writeFileSync(outside, '# outside\n');

  const converter: BaselineConverter = {
    descriptor: { id: 'fixture.converter', version: '1' },
    async convert() {
      return {
        artifacts: [{
          id: 'document',
          kind: 'markdown',
          relativePath: '../outside.md',
          contentDigest: sha256(fs.readFileSync(outside)),
        }],
      };
    },
  };

  await assert.rejects(
    evaluateMarkItDownBaseline({ sourcePath, outputRoot, converter }),
    /escapes outputRoot/u,
  );
});


test('evaluation rejects an empty portable source label', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-markitdown-eval-'));
  const sourcePath = path.join(root, 'screen-design.xlsx');
  const outputRoot = path.join(root, 'out');
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);

  const converter: BaselineConverter = {
    descriptor: { id: 'fixture.converter', version: '1' },
    async convert() {
      throw new Error('converter must not run');
    },
  };

  await assert.rejects(
    evaluateMarkItDownBaseline({
      sourcePath,
      outputRoot,
      converter,
      sourceLabel: '   ',
    }),
    /sourceLabel must not be empty/u,
  );
});


test('portable report can be parsed and re-verifies its paired Markdown artifact', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-markitdown-eval-'));
  const sourcePath = path.join(root, 'screen-design.xlsx');
  const outputRoot = path.join(root, 'out');
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);

  const converter: BaselineConverter = {
    descriptor: { id: 'fixture.converter', version: '1' },
    async convert() {
      fs.mkdirSync(outputRoot, { recursive: true });
      const artifactPath = path.join(outputRoot, 'baseline.md');
      fs.writeFileSync(artifactPath, '## 画面一覧\n\n## 遷移図\n\n## メモ\n');
      return {
        artifacts: [{
          id: 'document',
          kind: 'markdown',
          relativePath: 'baseline.md',
          contentDigest: sha256(fs.readFileSync(artifactPath)),
          mediaType: 'text/markdown',
        }],
      };
    },
  };

  const generated = await evaluateMarkItDownBaseline({
    sourcePath,
    outputRoot,
    converter,
    sourceLabel: 'issue-0194-screen-design-v1',
  });
  const parsed = parseMarkItDownBaselineEvaluation(JSON.stringify(generated));
  assert.deepEqual(parsed, generated);
  assert.doesNotThrow(() =>
    verifyMarkItDownBaselineEvaluationArtifact(parsed, outputRoot));

  fs.appendFileSync(path.join(outputRoot, 'baseline.md'), 'tampered\n');
  assert.throws(
    () => verifyMarkItDownBaselineEvaluationArtifact(parsed, outputRoot),
    /digest mismatch/u,
  );
});

test('external report parser rejects schema drift and automatic import authority', () => {
  const valid = {
    schema: 'mmi.baseline-converter-evaluation/v1',
    converter: { id: 'microsoft.markitdown-cli', version: '0.1.8' },
    source: {
      label: 'issue-0194-screen-design-v1',
      digest: 'sha256:' + 'a'.repeat(64),
      sheetCount: 1,
      candidateCounts: { image: 0 },
      images: [],
    },
    markdown: {
      artifact: 'baseline.md',
      digest: 'sha256:' + 'b'.repeat(64),
      bytes: 10,
      sheetEvidence: [{ sheet: 'Sheet1', markdownHeadingPresent: true }],
      tableSeparatorLineCount: 1,
      imageReferenceCount: 0,
    },
    reconciliation: {
      candidateAddressability: 'not-provided-by-baseline-artifact',
      automaticImportDecision: 'none',
    },
  };

  assert.doesNotThrow(() =>
    parseMarkItDownBaselineEvaluation(JSON.stringify(valid)));

  assert.throws(
    () => parseMarkItDownBaselineEvaluation(JSON.stringify({
      ...valid,
      unexpected: true,
    })),
    /unexpected field/u,
  );
  assert.throws(
    () => parseMarkItDownBaselineEvaluation(JSON.stringify({
      ...valid,
      reconciliation: {
        ...valid.reconciliation,
        automaticImportDecision: 'imported',
      },
    })),
    /must not carry an automatic import decision/u,
  );
  assert.throws(
    () => parseMarkItDownBaselineEvaluation(JSON.stringify({
      ...valid,
      markdown: {
        ...valid.markdown,
        artifact: '..\\outside.md',
      },
    })),
    /must stay within its artifact root/u,
  );
});

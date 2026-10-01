import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { BaselineConverter } from '../src/core/baselineImport.js';
import { evaluateMarkItDownBaseline } from '../src/evaluation/markItDownBaselineEvaluation.js';
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
  });

  assert.equal(report.schema, 'mmi.baseline-converter-evaluation/v1');
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

  assert.deepEqual(
    report.markdown.sheetEvidence.map((item) => [item.sheet, item.markdownHeadingPresent]),
    [['画面一覧', true], ['遷移図', false], ['メモ', false]],
  );
  assert.equal(report.markdown.imageReferenceCount, 2);
  assert.equal(report.reconciliation.automaticImportDecision, 'none');
});

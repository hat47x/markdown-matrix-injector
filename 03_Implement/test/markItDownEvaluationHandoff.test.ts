import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readMarkItDownEvaluationHandoff,
  verifyMarkItDownEvaluationHandoff,
} from '../src/evaluation/markItDownEvaluationHandoff.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const implementRoot = path.resolve(here, '..');
const handoffPath = path.join(
  here,
  'fixtures',
  'baseline-converter-markitdown-0.1.8-handoff-v1.json',
);

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function gitBlobSha(filePath: string): string {
  // Hash the bytes Git stores: a core.autocrlf=true checkout has CRLF on disk but LF in the blob.
  const raw = fs.readFileSync(filePath);
  const bytes = raw.includes(0) ? raw : Buffer.from(raw.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
  const header = Buffer.from(`blob ${bytes.byteLength}\0`, 'utf8');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function matchingReport(artifactRoot: string): string {
  const artifactPath = path.join(artifactRoot, 'baseline.md');
  fs.mkdirSync(artifactRoot, { recursive: true });
  fs.writeFileSync(
    artifactPath,
    [
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
    ].join('\n'),
  );
  const bytes = fs.readFileSync(artifactPath);
  return JSON.stringify({
    schema: 'mmi.baseline-converter-evaluation/v1',
    converter: {
      id: 'microsoft.markitdown-cli',
      version: '0.1.8',
    },
    source: {
      label: 'issue-0194-screen-design-v1',
      digest: 'sha256:' + 'a'.repeat(64),
      sheetCount: 3,
      candidateCounts: {
        'table-range': 3,
        image: 4,
      },
      images: [
        {
          sheet: '画面一覧',
          range: 'D1:F4',
          name: 'ログイン画面',
          digest: 'sha256:' + '1'.repeat(64),
        },
        {
          sheet: '画面一覧',
          range: 'A6',
          name: 'メニュー画面',
          digest: 'sha256:' + '2'.repeat(64),
        },
        {
          sheet: '画面一覧',
          range: 'I9:K11',
          name: 'ログイン画面(再掲)',
          digest: 'sha256:' + '1'.repeat(64),
        },
        {
          sheet: '遷移図',
          name: '遷移',
          digest: 'sha256:' + '2'.repeat(64),
        },
      ],
    },
    markdown: {
      artifact: 'baseline.md',
      digest: sha256(bytes),
      bytes: bytes.byteLength,
      sheetEvidence: [
        { sheet: '画面一覧', markdownHeadingPresent: true },
        { sheet: '遷移図', markdownHeadingPresent: true },
        { sheet: 'メモ', markdownHeadingPresent: true },
      ],
      tableSeparatorLineCount: 1,
      imageReferenceCount: 0,
    },
    reconciliation: {
      candidateAddressability: 'not-provided-by-baseline-artifact',
      automaticImportDecision: 'none',
    },
  });
}

test('frozen handoff references the exact current MMI input and runner blobs', () => {
  const raw = JSON.parse(fs.readFileSync(handoffPath, 'utf8')) as any;
  assert.equal(raw.schema, 'mmi.baseline-converter-evaluation-handoff/v1');
  assert.equal(raw.converter.requested_version, '0.1.8');
  assert.equal(
    raw.converter.upstream_tag_commit,
    'b8f79c57ebc0044be41323d89b2a45d3fda8460e',
  );

  const bindings = [
    raw.mmi.fixture_generator,
    raw.mmi.runner,
    raw.mmi.report_validator,
    raw.mmi.evaluation_core,
    raw.mmi.converter_adapter,
  ];
  for (const binding of bindings) {
    assert.equal(
      gitBlobSha(path.resolve(implementRoot, '..', binding.path)),
      binding.sha,
      `${binding.path} changed after the frozen handoff was created`,
    );
  }
});

test('matching external report and Markdown satisfy frozen handoff identity', () => {
  const handoff = readMarkItDownEvaluationHandoff(handoffPath);
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-markitdown-handoff-'));
  const reportText = matchingReport(artifactRoot);

  const report = verifyMarkItDownEvaluationHandoff({
    handoff,
    reportText,
    artifactRoot,
  });

  assert.equal(report.converter.version, '0.1.8');
  assert.equal(report.source.label, 'issue-0194-screen-design-v1');
  assert.deepEqual(
    report.markdown.sheetEvidence.map((item) => item.sheet),
    ['画面一覧', '遷移図', 'メモ'],
  );
  assert.equal(report.source.images.length, 4);
});

test('handoff rejects wrong converter version, sheet identity and image occurrence', () => {
  const handoff = readMarkItDownEvaluationHandoff(handoffPath);

  const modify = (
    mutate: (value: any) => void,
  ): { artifactRoot: string; reportText: string } => {
    const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-markitdown-handoff-'));
    const value = JSON.parse(matchingReport(artifactRoot));
    mutate(value);
    return { artifactRoot, reportText: JSON.stringify(value) };
  };

  {
    const { artifactRoot, reportText } = modify((value) => {
      value.converter.version = '0.1.9';
    });
    assert.throws(
      () => verifyMarkItDownEvaluationHandoff({ handoff, reportText, artifactRoot }),
      /converter version mismatch/u,
    );
  }
  {
    const { artifactRoot, reportText } = modify((value) => {
      value.markdown.sheetEvidence[1].sheet = '別シート';
    });
    assert.throws(
      () => verifyMarkItDownEvaluationHandoff({ handoff, reportText, artifactRoot }),
      /sheet identity mismatch/u,
    );
  }
  {
    const { artifactRoot, reportText } = modify((value) => {
      value.source.images[0].range = 'D2:F5';
    });
    assert.throws(
      () => verifyMarkItDownEvaluationHandoff({ handoff, reportText, artifactRoot }),
      /image occurrence identity mismatch/u,
    );
  }
});

test('handoff re-verifies paired Markdown bytes after identity checks', () => {
  const handoff = readMarkItDownEvaluationHandoff(handoffPath);
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-markitdown-handoff-'));
  const reportText = matchingReport(artifactRoot);

  fs.appendFileSync(path.join(artifactRoot, 'baseline.md'), 'tamper\n');
  assert.throws(
    () => verifyMarkItDownEvaluationHandoff({ handoff, reportText, artifactRoot }),
    /digest mismatch/u,
  );
});

test('handoff itself cannot authorize automatic import', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-markitdown-handoff-def-'));
  const invalidPath = path.join(temp, 'handoff.json');
  const raw = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
  raw.acceptance.automatic_import_decision_must_be = 'imported';
  fs.writeFileSync(invalidPath, JSON.stringify(raw));

  assert.throws(
    () => readMarkItDownEvaluationHandoff(invalidPath),
    /may not authorize an automatic import decision/u,
  );
});

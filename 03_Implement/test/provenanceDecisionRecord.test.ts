import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildProvenanceReport } from '../src/application/provenanceReport.js';

// 外部の判断記録（#498）の使い方を、MMIの既存の手段だけで確かめる。
// 判断記録は、参照文字列・Source Identity v1・記法の版を組にして持つ。
// 記法の版はprovenanceの報告に含まれないため、記録する側が添える。
interface DecisionBasis {
  reference: string;
  sourceDigest: string;
  notationVersion: string;
}

type BasisCheck = 'match' | 'mismatch' | 'unverifiable';

function observe(root: string, reference: string): { status: string; sourceDigest?: string } {
  const report = buildProvenanceReport({
    markdownFilePath: path.join(root, 'doc.md'),
    workspaceRoot: root,
    ledgerPath: path.join(root, 'mmi-ledger.json'),
    diagnostics: [],
  });
  const found = report.linked.find((item) => item.reference === reference);
  assert.ok(found, `参照が報告に出ていること: ${reference}`);
  return { status: found.status, sourceDigest: found.sourceDigest };
}

// 一致は同じ正本であることの確認。それ以外は「判断時と同じ内容と確かめられない」ことを示し、
// 範囲の内容が変わったことまでは断定しない。
function checkBasis(root: string, basis: DecisionBasis): BasisCheck {
  const now = observe(root, basis.reference);
  if (now.status !== 'resolved' || !now.sourceDigest) return 'unverifiable';
  return now.sourceDigest === basis.sourceDigest ? 'match' : 'mismatch';
}

test('判断記録の根拠は、正本が同じなら一致・内容が変われば不一致・所在が変われば確かめられない', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-decision-basis-'));
  try {
    const reference = '![[limits.csv#Sheet1|A1:B3]]';
    fs.writeFileSync(path.join(root, 'limits.csv'), 'item,value\nA,1\nB,2\n');
    fs.writeFileSync(path.join(root, 'doc.md'), `# 設計\n\n${reference}\n`);

    // 判断した時点の記録。セル値は写さない。
    const first = observe(root, reference);
    assert.equal(first.status, 'resolved');
    assert.match(first.sourceDigest ?? '', /^sha256:[0-9a-f]{64}$/u);
    const basis: DecisionBasis = {
      reference,
      sourceDigest: first.sourceDigest as string,
      notationVersion: 'mmi-notation-v1',
    };

    assert.equal(checkBasis(root, basis), 'match');

    // 正本を変えた。
    fs.writeFileSync(path.join(root, 'limits.csv'), 'item,value\nA,1\nB,3\n');
    assert.equal(checkBasis(root, basis), 'mismatch');

    // 元に戻すと再び一致する。
    fs.writeFileSync(path.join(root, 'limits.csv'), 'item,value\nA,1\nB,2\n');
    assert.equal(checkBasis(root, basis), 'match');

    // 正本を移した。同じバイト列でも、参照を解決できなければ確かめられない。
    fs.mkdirSync(path.join(root, 'moved'));
    fs.renameSync(path.join(root, 'limits.csv'), path.join(root, 'moved', 'limits.csv'));
    assert.equal(checkBasis(root, basis), 'unverifiable');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

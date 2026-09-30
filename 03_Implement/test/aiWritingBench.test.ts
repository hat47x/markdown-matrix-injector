import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTables, scoreDocument, type BenchTask } from '../scripts/ai-writing-bench/score.js';
import { mutate, prepare } from '../scripts/ai-writing-bench/run.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const task = (id: string) => JSON.parse(fs.readFileSync(path.join(repo, `04_Documentation/benchmarks/ai-writing/tasks/${id}.json`), 'utf8')) as BenchTask;

function workspace(arm: 'copy' | 'mmi'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-bench-'));
  prepare(arm, dir);
  return dir;
}

const T2_REF = '![[../masters/基本設計.xlsx#状態遷移|A1:F13?header=first&grep=承認者]]\n';
const T2_COPY = '| 遷移ID | 現在の状態 | 操作 | 実行者 | 次の状態 | 条件 |\n| --- | --- | --- | --- | --- | --- |\n'
  + '| ST-04 | 承認待ち | 承認 | 承認者 | 承認済 | 担当部門が一致 |\n| ST-05 | 承認待ち | 差戻し | 承認者 | 差戻し | 理由を入力済 |\n';

test('parseTables reads body rows and unescapes pipes', () => {
  assert.deepEqual(parseTables('x\n\n| a | b |\n| --- | --- |\n| 1 | p\\|q |\n'), [['1', 'p|q']]);
});

test('a reference-based answer passes and a correct copy passes', async () => {
  for (const [arm, body] of [['mmi', T2_REF], ['copy', T2_COPY]] as const) {
    const dir = workspace(arm);
    const doc = path.join(dir, 'docs', 'T2.md');
    fs.writeFileSync(doc, body);
    const score = await scoreDocument(task('T2'), doc, path.join(dir, 'masters'));
    assert.equal(score.pass, true, JSON.stringify(score));
  }
});

test('the scorer detects a wrong cell, an invented ID and a missing row', async () => {
  const dir = workspace('copy');
  const doc = path.join(dir, 'docs', 'T2.md');
  fs.writeFileSync(doc, T2_COPY.replace('承認済', '完了') + '\nなお ST-99 も参照する。\n');
  const score = await scoreDocument(task('T2'), doc, path.join(dir, 'masters'));
  assert.equal(score.tableRowsNotInSource, 1);
  assert.deepEqual(score.phantomIds, ['ST-99']);
  fs.writeFileSync(doc, T2_COPY.split('\n').slice(0, 3).join('\n') + '\n');
  assert.deepEqual((await scoreDocument(task('T2'), doc, path.join(dir, 'masters'))).missingIds, ['ST-05']);
});

test('own summary tables and prose mentions of other IDs do not fail a correct answer', async () => {
  const dir = workspace('copy');
  const doc = path.join(dir, 'docs', 'T2.md');
  fs.writeFileSync(doc, T2_COPY + '\n| 役割 | 責務 |\n| --- | --- |\n| 承認者 | 承認する |\n\n差戻し後は修正（ST-07）して再申請（ST-08）する。\n');
  const score = await scoreDocument(task('T2'), doc, path.join(dir, 'masters'));
  assert.equal(score.pass, true, JSON.stringify(score));
  assert.equal(score.unverifiedRows, 1);
});

test('an unwanted row inside a table is still caught', async () => {
  const dir = workspace('copy');
  const doc = path.join(dir, 'docs', 'T2.md');
  fs.writeFileSync(doc, T2_COPY + '| ST-07 | 差戻し | 修正 | 申請者 | 差戻し | 本人の申請 |\n');
  assert.deepEqual((await scoreDocument(task('T2'), doc, path.join(dir, 'masters'))).unexpectedIds, ['ST-07']);
});

test('after the source changes, a reference follows it and a copy goes stale', async () => {
  const t1 = task('T1');
  const refDir = workspace('mmi');
  const copyDir = workspace('copy');
  const refDoc = path.join(refDir, 'docs', 'T1.md');
  const copyDoc = path.join(copyDir, 'docs', 'T1.md');
  fs.writeFileSync(refDoc, '![[../masters/基本設計.xlsx#権限|A1:F13?header=first]]\n');
  const { renderDocumentMarkdown } = await import('../src/cli/render.js');
  fs.writeFileSync(copyDoc, renderDocumentMarkdown({ markdownFilePath: refDoc, workspaceRoot: refDir }));
  assert.equal((await scoreDocument(t1, copyDoc, path.join(copyDir, 'masters'))).pass, true);
  assert.equal(mutate(refDir) && mutate(copyDir), true);
  assert.equal((await scoreDocument(t1, refDoc, path.join(refDir, 'masters'))).pass, true);
  assert.equal((await scoreDocument(t1, copyDoc, path.join(copyDir, 'masters'))).tableRowsNotInSource, 1);
  assert.equal(mutate(refDir), false);
});

test('prepare gives both arms the same request and only the mmi arm the instructions', () => {
  const copyPrompt = fs.readFileSync(path.join(workspace('copy'), 'prompts', 'T1.md'), 'utf8');
  const mmiDir = workspace('mmi');
  const mmiPrompt = fs.readFileSync(path.join(mmiDir, 'prompts', 'T1.md'), 'utf8');
  assert.ok(mmiPrompt.includes(copyPrompt.split('\n')[0]));
  assert.ok(fs.existsSync(path.join(mmiDir, 'MMI.md')));
  assert.doesNotMatch(copyPrompt, /MMI/);
});

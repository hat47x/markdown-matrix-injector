import test from 'node:test';
import assert from 'node:assert/strict';

import { parameterIssues } from '../src/dx/parameterDiagnostics.js';

const fix = (raw: string): string => {
  const issues = parameterIssues(raw);
  let out = raw;
  for (const issue of [...issues].reverse()) {
    if (issue.suggestion !== undefined) out = out.slice(0, issue.start) + issue.suggestion + out.slice(issue.end);
  }
  return out;
};

test('invalid values of known keys are warnings with the closest valid value', () => {
  const [issue] = parameterIssues('![[a.xlsx#S|A1:B2?mode=tabel]]');
  assert.deepEqual([issue.code, issue.severity, issue.suggestion], ['MMI_INVALID_PARAM_VALUE', 'warning', 'table']);
  assert.match(issue.message, /table \/ card/u);
  assert.equal(fix('![[a.xlsx#S|A1:B2?mode=tabel&header=First]]'), '![[a.xlsx#S|A1:B2?mode=table&header=first]]');
  assert.equal(fix('![[a.xlsx#S|A1:C9?columns=A、C]]'), '![[a.xlsx#S|A1:C9?columns=A,C]]');
  assert.equal(fix('![[a.xlsx#S?orientation=landscap]]'), '![[a.xlsx#S?orientation=landscape]]');
});

test('far-off values are reported without guessing a fix', () => {
  const [issue] = parameterIssues('![[a.xlsx#S|A1:B2?mode=zzzzzz]]');
  assert.equal(issue.suggestion, undefined);
  assert.equal(parameterIssues('![[a.xlsx#S|A1:B2?header=0x1]]')[0].code, 'MMI_INVALID_PARAM_VALUE');
});

test('misspelt keys are information only; unknown and x- keys stay legal and silent', () => {
  const [issue] = parameterIssues('![[a.xlsx#S|A1:B2?heder=first]]');
  assert.deepEqual([issue.code, issue.severity, issue.suggestion], ['MMI_UNKNOWN_PARAM', 'information', 'header']);
  assert.equal(fix('![[a.xlsx#S|A1:B2?heder=first&Mode=card]]'), '![[a.xlsx#S|A1:B2?header=first&mode=card]]');
  assert.deepEqual(parameterIssues('![[a.xlsx#S|A1:B2?x-heder=1&review=done]]'), []);
});

test('valid embeds, repeated keys and encoded values produce nothing', () => {
  for (const raw of [
    '![[a.xlsx#S|A1:B2?mode=card&header=first&formatColumn=E:json&formatColumn=F:yaml&grep=A%26B]]',
    '![[a.csv?header=2&columns=A, C&transpose=true]]',
    '![[a.xlsx#S|A1:B2]]',
  ]) {
    assert.deepEqual(parameterIssues(raw), [], raw);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Python tools emit UTF-8 even when the inherited Windows-style encoding cannot represent Japanese', () => {
  const result = spawnSync(process.execPath, ['scripts/run-python.mjs', '-c',
    'import sys; print("01_Plansの配置: OK"); print("診断", file=sys.stderr)'], {
    env: { ...process.env, PYTHONIOENCODING: 'cp1252' }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '01_Plansの配置: OK');
  assert.equal(result.stderr.trim(), '診断');
});

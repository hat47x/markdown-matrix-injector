import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runner = await import(new URL('../scripts/run-python-tool-tests.mjs', import.meta.url).href) as {
  listToolTests: (pkg: { scripts?: Record<string, string> }, files: string[]) => string[];
};

test('listToolTests excludes tests the release-gate script already runs', () => {
  const pkg = { scripts: { 'test:release-gate-tools': 'node scripts/run-python.mjs tools/test_a.py && node scripts/run-python.mjs tools/test_b.py' } };
  assert.deepEqual(
    runner.listToolTests(pkg, ['test_c.py', 'test_a.py', 'helper.py', 'test_b.py', 'test_d.py', 'test_x.txt']),
    ['test_c.py', 'test_d.py'],
  );
});

test('every tools/test_*.py is run by test:release-gate-tools or by the discovery runner (#757)', () => {
  const pkgUrl = new URL('../package.json', import.meta.url);
  const pkg = JSON.parse(fs.readFileSync(pkgUrl, 'utf8')) as { scripts: Record<string, string> };
  const files = fs.readdirSync(new URL('../tools/', import.meta.url)).filter((name) => /^test_.+\.py$/u.test(name));
  const discovered = new Set(runner.listToolTests(pkg, files));
  for (const name of files) {
    const inGate = pkg.scripts['test:release-gate-tools'].includes(`tools/${name}`);
    assert.ok(inGate !== discovered.has(name), `${name} must be run exactly once`);
  }
  assert.match(pkg.scripts['test:python-tools'], /run-python-tool-tests\.mjs/u);
});

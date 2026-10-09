/**
 * Smoke test for the standalone CLI package (issue-0197).
 *
 *   node scripts/smoke-cli-bundle.mjs
 *
 * Builds the package, copies it and the basic-design kit into a fresh folder
 * that has no node_modules, and runs the commands an AI agent or CI job uses.
 * Exit code 1 on any failure.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kit = path.resolve(root, '../04_Documentation/kits/basic-design');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cli-smoke-'));
const pkg = path.join(work, 'package');
execFileSync(process.execPath, [path.join(root, 'scripts/build-cli.mjs')], { stdio: 'inherit' });
fs.cpSync(path.join(root, 'dist-cli/package'), pkg, { recursive: true });
fs.cpSync(kit, path.join(work, 'kit'), { recursive: true });

const cli = path.join(pkg, 'mmi.mjs');
const run = (args, cwd = path.join(work, 'kit')) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
let failed = 0;
const expect = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n${detail}`}`); if (!ok) failed += 1; };

expect('no node_modules beside the package', !fs.existsSync(path.join(work, 'node_modules')) && !fs.existsSync(path.join(pkg, 'node_modules')));
let result = run(['check', '.', '--root', '.']);
expect('check exits 0 on the kit', result.status === 0 && /0 error/.test(result.stdout), result.stdout + result.stderr);
result = run(['inspect', 'masters/基本設計.xlsx', '--from', '基本設計書.md']);
expect('inspect lists the sheets', result.status === 0 && result.stdout.includes('sheet: 権限'), result.stdout + result.stderr);
result = run(['render', '基本設計書.md', '--root', '.']);
expect('render expands tables', result.status === 0 && result.stdout.includes('| OP-01 |'), result.stdout.slice(0, 300) + result.stderr);
result = run(['render', '基本設計書.md', '--to', 'html', '--root', '.', '-o', 'out.html']);
const html = fs.existsSync(path.join(work, 'kit/out.html')) ? fs.readFileSync(path.join(work, 'kit/out.html'), 'utf8') : '';
expect('render --to html includes the stylesheet', result.status === 0 && /\.mmi-table\s*\{/.test(html) && !/unstyled/.test(result.stderr), result.stderr);
fs.writeFileSync(path.join(work, 'kit/handoff.md'), '# 権限\n\n![[./masters/基本設計.xlsx#権限|A1:F13?header=first]]\n');
result = run(['materialize', 'handoff.md', '-o', 'dist/handoff.md', '--root', '.']);
expect('materialize writes a detachable copy', result.status === 0, result.stdout + result.stderr);
result = run(['detach-check', 'dist/handoff.md', '--root', '.']);
expect('detach-check passes on the materialized copy', result.status === 0, result.stdout + result.stderr);
result = run(['materialize', '基本設計書.md', '-o', 'dist/基本設計書.md', '--root', '.']);
result = run(['detach-check', 'dist/基本設計書.md', '--root', '.']);
expect('detach-check flags the kit prose that links to the workbook', result.status !== 0 && /BROKEN_LINK/.test(result.stdout), result.stdout + result.stderr);
fs.writeFileSync(path.join(work, 'kit/tree.json'), '{"root":{"child":1}}');
result = run(['inspect', 'tree.json', '--json', '--root', '.']);
expect('inspect lists canonical Tree Candidates', result.status === 0 && JSON.parse(result.stdout).candidates.some((candidate) => candidate.kind === 'tree'), result.stdout + result.stderr);
result = run(['snapshot', 'masters/基本設計.xlsx', '--sheet', '権限', '-o', 'perm.svg', '--root', '.']);
const svg = fs.existsSync(path.join(work, 'kit/perm.svg')) ? fs.readFileSync(path.join(work, 'kit/perm.svg'), 'utf8') : '';
expect('snapshot writes an SVG', result.status === 0 && svg.startsWith('<svg') && svg.includes('OP-06'), result.stdout + result.stderr);
result = run(['check', '基本設計書.md', '--root', '/nonexistent-root-for-smoke']);
expect('a wrong --root is reported, not ignored', result.status !== 0, result.stdout + result.stderr);

fs.rmSync(work, { recursive: true, force: true });
console.log(failed === 0 ? 'cli bundle smoke: all passed' : `cli bundle smoke: ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

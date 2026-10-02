/**
 * Build the standalone `mmi` CLI package (issue-0197).
 *
 *   node scripts/build-cli.mjs [outDir]      default outDir: dist-cli/package
 *
 * Output is a folder that runs on a machine that only has Node.js 20+:
 *   package.json   name/version/bin only; no dependencies (everything is bundled)
 *   mmi.mjs        the CLI, one file
 *   media/         stylesheet used by `render --to html`
 *   LICENSE, THIRD_PARTY_NOTICES.md
 * `npm pack <outDir>` turns it into a tarball; `npx <tarball> check .` runs it.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(root, '..');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'dist-cli', 'package'));
const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');
const pkg = JSON.parse(read(root, 'package.json'));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'media'), { recursive: true });

await build({
  entryPoints: [path.join(root, 'src/cli/mmi.ts')],
  outfile: path.join(outDir, 'mmi.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  logLevel: 'warning',
  // Some bundled CommonJS code calls require(); give it one in an ES module.
  // The entry file's own #! line is kept first by esbuild; the banner follows it.
  banner: { js: 'import { createRequire as __mmiCreateRequire } from "node:module"; const require = __mmiCreateRequire(import.meta.url);' },
});
fs.chmodSync(path.join(outDir, 'mmi.mjs'), 0o755);
fs.copyFileSync(path.join(root, 'media/markdown-matrix.css'), path.join(outDir, 'media/markdown-matrix.css'));
fs.copyFileSync(path.join(repoRoot, 'LICENSE'), path.join(outDir, 'LICENSE'));

const notice = ['xlsx', 'markdown-it'].map((name) => {
  const dir = path.join(root, 'node_modules', name);
  const info = JSON.parse(read(dir, 'package.json'));
  const license = fs.readdirSync(dir).find((file) => /^licen[sc]e/i.test(file));
  return `## ${name} ${info.version} (${info.license})\n\n${license ? read(dir, license).trim() : '(license file not found)'}\n`;
});
fs.writeFileSync(path.join(outDir, 'THIRD_PARTY_NOTICES.md'),
  `# Third-party software bundled in mmi.mjs\n\nThe MMI CLI bundles the packages below. Their licenses apply to the bundled code.\n\n${notice.join('\n')}`);

fs.writeFileSync(path.join(outDir, 'package.json'), `${JSON.stringify({
  name: 'markdown-matrix-injector-cli',
  version: pkg.version,
  description: 'MMI command line: inspect, check, render, extract and detach-check for Excel/CSV references in Markdown. Read-only toward sources.',
  license: pkg.license,
  type: 'module',
  private: true,
  bin: { mmi: './mmi.mjs' },
  engines: { node: '>=20' },
  repository: pkg.repository,
}, null, 2)}\n`);

console.log(`built ${outDir} (${Math.round(fs.statSync(path.join(outDir, 'mmi.mjs')).size / 1024)} KiB)`);

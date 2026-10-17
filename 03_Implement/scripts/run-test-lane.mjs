// Runs one lane of the unit tests: `product` (default) or `research`.
// A test file belongs to the research lane when it imports src/experimental/ or its
// file name starts with one of the research prefixes below. Everything else is product.
//   node scripts/run-test-lane.mjs product|research [--list] [extra node --test args]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDir = path.join(root, 'test');

const RESEARCH_NAME = new RegExp(
  '^(structuredArtifact|sai2b|worksheetReviewRoute|worksheetFormat|xlsxFormatSnapshot|'
    + 'mmiWorksheet|cognitive|containedJev|cpuSearchTest\\d|flyInspired|jev|closedChoice|'
    + 'authority|executableProposal|unifiedHuman|deterministicReview|formatProfile)',
  'u',
);

export function laneOf(file) {
  if (RESEARCH_NAME.test(file)) return 'research';
  const text = fs.readFileSync(path.join(testDir, file), 'utf8');
  return /src\/experimental\//u.test(text) ? 'research' : 'product';
}

const [lane = 'product', ...rest] = process.argv.slice(2);
if (lane !== 'product' && lane !== 'research') {
  console.error('usage: run-test-lane.mjs product|research [--list] [node --test args]');
  process.exit(2);
}
const list = rest.includes('--list');
const extra = rest.filter((arg) => arg !== '--list');

const files = fs
  .readdirSync(testDir)
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
  .filter((name) => laneOf(name) === lane);

if (list) {
  console.log(files.join('\n'));
  process.exit(0);
}
console.error(`test lane "${lane}": ${files.length} files`);
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', ...extra, ...files.map((name) => path.join('test', name))],
  { cwd: root, stdio: 'inherit' },
);
process.exit(result.status ?? 1);

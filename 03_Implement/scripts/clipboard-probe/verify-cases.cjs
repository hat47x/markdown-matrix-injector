/*
 * Turns the clipboard observation into a durable, checkable fixture
 * (review R4: results that live only in %TEMP% are not an acceptance basis).
 *
 *   node verify-cases.cjs            compare the current dumps to expected-cases.json
 *   node verify-cases.cjs --update   rewrite expected-cases.json from the current dumps
 *
 * What is stored: case id, the decoded structural values, and the environment.
 * What is NOT stored: raw clipboard bytes, and absolute paths -- the probe
 * directory is replaced by <PROBE> so the fixture carries no personal path.
 *
 * Byte hashes are recorded per case but NOT compared across machines: the
 * captured bytes embed the absolute SourceURL, so they legitimately differ on
 * every host. They exist to detect a changed capture on the SAME machine.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const lib = require('./probe-lib.cjs');

const EXPECTED = path.join(__dirname, 'expected-cases.json');
const RAW = path.join(lib.probeRoot(), 'raw');
const update = process.argv.includes('--update');

if (!fs.existsSync(RAW)) {
  console.error(`no dumps at ${RAW}\nrun build-books.ps1 then probe-raw.ps1 first`);
  process.exit(1);
}

const probeDirFwd = lib.probeRoot().replace(/\\/g, '/');
// The same directory reaches us in three spellings: forward slashes (SourceURL),
// backslashes (Link), and percent-encoded (SourceURL with spaces). Replace all
// three literally and case-insensitively -- building a regex from a Windows
// path is easy to get wrong, and a missed variant leaks a personal path.
const PROBE_FORMS = [
  probeDirFwd,
  probeDirFwd.replace(/\//g, '\\'),
  encodeURI(probeDirFwd),
];
function replaceAllCaseInsensitive(text, needle, replacement) {
  if (!needle) return text;
  const hay = text.toLowerCase();
  const pin = needle.toLowerCase();
  let out = '';
  let from = 0;
  for (;;) {
    const at = hay.indexOf(pin, from);
    if (at < 0) return out + text.slice(from);
    out += text.slice(from, at) + replacement;
    from = at + pin.length;
  }
}
function redact(s) {
  if (typeof s !== 'string') return s;
  return PROBE_FORMS.reduce((acc, form) => replaceAllCaseInsensitive(acc, form, '<PROBE>'), s);
}

// Only the fields that describe behaviour. Volatile detail stays out.
function shape(r) {
  return {
    case: r.case,
    book: r.book ?? null,
    sheet: r.sheet ?? null,
    addrR1C1: r.addr ?? null,
    addrA1: r.a1 ?? null,
    addrRows: r.addrRows ?? null,
    addrCols: r.addrCols ?? null,
    htmlRows: r.rows ?? null,
    htmlCols: r.cols ?? null,
    shapeMatch: r.shapeMatch ?? null,
    hasSourceUrl: Boolean(r.sourceUrl),
    sourceUrl: redact(r.sourceUrl),
    linkTarget: redact(r.linkTarget),
    linkAgreesWithObjectDescriptor: r.addrAgree ?? null,
    objectType: r.objectType ?? null,
    objectDescriptorError: r.odError ?? null,
    hasColspan: Boolean(r.hasColspan),
    hasRowspan: Boolean(r.hasRowspan),
  };
}

const observed = lib.collectCases(RAW).map(shape);
const hashes = Object.fromEntries(lib.collectCases(RAW).map((r) => [r.case, r.hashes]));

if (update) {
  const doc = {
    note: 'Excelクリップボード観測の期待値。架空ブックのみ。絶対パスは<PROBE>へ置換済み。'
      + ' 生成: node verify-cases.cjs --update / 検証: node verify-cases.cjs',
    procedure: ['build-books.ps1', 'probe-raw.ps1', 'verify-cases.cjs'],
    environment: {
      capturedAt: new Date().toISOString().slice(0, 10),
      os: `${os.type()} ${os.release()}`,
      node: process.version,
      ansiCodePageAssumed: 'shift_jis (ja-JP host)',
      excel: 'Microsoft Excel 16.0 (Office ClickToRun 16.0.20326.20132, ja-jp)',
      comment: 'ハッシュは同一環境での再取得検知用。SourceURLに絶対パスを含むため機器間では一致しない。',
    },
    hashes,
    cases: observed,
  };
  fs.writeFileSync(EXPECTED, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  console.log(`wrote ${path.relative(process.cwd(), EXPECTED)} with ${observed.length} cases`);
  process.exit(0);
}

if (!fs.existsSync(EXPECTED)) {
  console.error(`no baseline at ${EXPECTED}\nrun: node verify-cases.cjs --update`);
  process.exit(1);
}

const expected = JSON.parse(fs.readFileSync(EXPECTED, 'utf8')).cases;
const byCase = new Map(expected.map((c) => [c.case, c]));
let failures = 0;

for (const got of observed) {
  const want = byCase.get(got.case);
  if (!want) {
    console.log(`NEW CASE (not in baseline): ${got.case}`);
    failures += 1;
    continue;
  }
  byCase.delete(got.case);
  for (const key of Object.keys(want)) {
    if (JSON.stringify(want[key]) !== JSON.stringify(got[key])) {
      console.log(`MISMATCH ${got.case}.${key}: expected ${JSON.stringify(want[key])}, got ${JSON.stringify(got[key])}`);
      failures += 1;
    }
  }
}
for (const missing of byCase.keys()) {
  console.log(`MISSING CASE (in baseline, not captured): ${missing}`);
  failures += 1;
}

console.log(`\n${observed.length} cases checked, ${failures} difference(s)`);
if (failures > 0) {
  console.log('A difference is not automatically a defect: a different Excel build, host code page');
  console.log('or workbook can legitimately change these. Investigate before running --update.');
  process.exitCode = 1;
}

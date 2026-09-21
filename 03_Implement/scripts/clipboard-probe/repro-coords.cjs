/*
 * Reproduces the origin/blank-row loss described in
 * 02_Architecture/input-assistance-source-model.md §1 against a REAL .xlsx
 * whose used range starts at C5 and contains a mid-table blank row, and
 * measures the candidate fixes.
 *
 * Read-only: never writes the workbook. Run build-books.ps1 first.
 * Where Node is not installed, VS Code's bundled runtime works:
 *   ELECTRON_RUN_AS_NODE=1 "<...>/Code.exe" repro-coords.cjs
 */
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const XLSX = require(path.join(__dirname, '..', '..', 'node_modules', 'xlsx', 'xlsx.js'));
const probeRoot = process.env.MMI_PROBE_DIR || path.join(os.tmpdir(), 'mmi-clipboard-probe');
const BOOK = path.join(probeRoot, 'books', '設計.xlsx');
const SHEET = '状態遷移';
const RANGE = 'C5:F12';

if (!fs.existsSync(BOOK)) {
  console.error(`no workbook at ${BOOK}\nrun build-books.ps1 first`);
  process.exit(1);
}

// --- the shipped logic, copied verbatim from core/tableGeometry.ts ---------
const columnToIndex = (c) => [...c].reduce((r, ch) => r * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
function parseCellRef(ref) {
  const m = /^(?<col>[A-Z]+)(?<row>\d+)$/i.exec(ref.trim());
  if (!m) throw new Error(`Invalid range reference: ${ref}`);
  return { col: columnToIndex(m.groups.col.toUpperCase()), row: Number(m.groups.row) - 1 };
}
function sliceRange(rows, range) {
  const [s, e = s] = range.split(':', 2);
  const a = parseCellRef(s);
  const b = parseCellRef(e);
  return rows.slice(a.row, b.row + 1).map((r) => r.slice(a.col, b.col + 1));
}

const ws = XLSX.read(fs.readFileSync(BOOK), {
  type: 'buffer', dense: true, cellDates: true, dateNF: 'yyyy-mm-dd',
}).Sheets[SHEET];

const toStrings = (rows) => rows.map((r) => Array.from(r, (c) => (c == null ? '' : String(c))));
const show = (label, rows) => {
  console.log(`\n--- ${label} ---`);
  console.log(`rows=${rows.length}`);
  rows.forEach((r, i) => console.log(`  [${i}] ${JSON.stringify(r)}`));
};

console.log('=== sheet metadata ===');
console.log(`!ref    : ${ws['!ref']}`);
console.log(`!merges : ${JSON.stringify((ws['!merges'] || []).map(XLSX.utils.encode_range))}`);

// A. what the extension does today
const current = toStrings(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, blankrows: false }));
show('A. current workbookLoader options', current);
show(`A. sliceRange(..., "${RANGE}")  <-- what MMI renders today`, sliceRange(current, RANGE));

// B. blankrows only -- insufficient, the column origin is still lost
const bOnly = toStrings(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, blankrows: true }));
show(`B. blankrows:true only -> sliceRange(..., "${RANGE}")`, sliceRange(bOnly, RANGE));

// C. expand the read range back to A1 -- correct slice, wrong cost
const end = XLSX.utils.decode_range(ws['!ref']).e;
const a1Range = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: end });
const cFix = toStrings(XLSX.utils.sheet_to_json(ws, {
  header: 1, raw: false, blankrows: true, range: a1Range, defval: '',
}));
show(`C. range="${a1Range}" + defval -> sliceRange(..., "${RANGE}")`, sliceRange(cFix, RANGE));

// D. origin-preserving: read the requested rectangle straight off the cells
function sliceByAddress(sheet, range) {
  const r = XLSX.utils.decode_range(range);
  const out = [];
  for (let row = r.s.r; row <= r.e.r; row += 1) {
    const line = [];
    for (let col = r.s.c; col <= r.e.c; col += 1) {
      const cell = sheet['!data']
        ? (sheet['!data'][row] || [])[col]
        : sheet[XLSX.utils.encode_cell({ r: row, c: col })];
      line.push(cell == null ? '' : (cell.w != null ? cell.w : (cell.v == null ? '' : String(cell.v))));
    }
    out.push(line);
  }
  return out;
}
show(`D. sliceByAddress(ws, "${RANGE}")  <-- proposed`, sliceByAddress(ws, RANGE));

console.log('\n=== per-cell detail available without recalculating ===');
for (const addr of ['C11', 'D11', 'E11', 'F11']) {
  const d = XLSX.utils.decode_cell(addr);
  const cell = ws['!data'] ? (ws['!data'][d.r] || [])[d.c] : ws[addr];
  console.log(`  ${addr}: ${JSON.stringify(cell && { t: cell.t, v: cell.v, w: cell.w, f: cell.f, z: cell.z })}`);
}

// --- cost comparison ------------------------------------------------------
console.log('\n=== cost of option C on a far-origin sheet ===');
const farWs = { '!ref': 'ZZ5000:AAB5010', ZZ5000: { t: 's', v: 'x' } };
const farA1 = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: XLSX.utils.decode_range(farWs['!ref']).e });
let t0 = Date.now();
const farRows = XLSX.utils.sheet_to_json(farWs, { header: 1, raw: false, blankrows: true, range: farA1, defval: '' });
console.log(`  used range ZZ5000:AAB5010 (1 real cell) expanded to ${farA1}`);
console.log(`  materialised ${farRows.reduce((n, r) => n + r.length, 0)} cells in ${Date.now() - t0}ms`);

console.log('\n=== cost of option D at scale ===');
const ROWS = 200000; const COLS = 40; const EVERY = 7;
const data = [];
let populated = 0;
for (let r = 0; r < ROWS; r += 1) {
  const line = [];
  if (r % EVERY === 0) {
    for (let c = 0; c < COLS; c += 1) { line[c] = { t: 's', v: `v${r}_${c}`, w: `v${r}_${c}` }; populated += 1; }
  }
  data[r] = line;
}
const big = { '!ref': XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ROWS - 1, c: COLS - 1 } }), '!data': data };
console.log(`  sparse sheet ${ROWS}x${COLS}, ${populated} populated cells`);
for (const rng of [RANGE, 'B100000:K100200']) {
  const t = process.hrtime.bigint();
  const out = sliceByAddress(big, rng);
  console.log(`  sliceByAddress("${rng}") -> ${out.length}x${out[0].length} in ${(Number(process.hrtime.bigint() - t) / 1e6).toFixed(3)}ms`);
}

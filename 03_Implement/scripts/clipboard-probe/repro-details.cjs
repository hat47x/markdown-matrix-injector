/*
 * Secondary checks behind 02_Architecture/input-assistance-source-model.md:
 *   1. declared merges are readable (no need to infer them from blank cells)
 *   2. whether `dateNF` actually forces ISO-8601, as workbookLoader's comment claims
 *   3. the whole-file trim in parseCsv shifts CSV coordinates
 *
 * Read-only. Run build-books.ps1 first.
 */
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const XLSX = require(path.join(__dirname, '..', '..', 'node_modules', 'xlsx', 'xlsx.js'));
const probeRoot = process.env.MMI_PROBE_DIR || path.join(os.tmpdir(), 'mmi-clipboard-probe');
const BOOK = path.join(probeRoot, 'books', '設計.xlsx');
if (!fs.existsSync(BOOK)) {
  console.error(`no workbook at ${BOOK}\nrun build-books.ps1 first`);
  process.exit(1);
}

const wb = XLSX.read(fs.readFileSync(BOOK), {
  type: 'buffer', dense: true, cellDates: true, dateNF: 'yyyy-mm-dd',
});

console.log('=== 1. used range and declared merges per sheet ===');
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const merges = (ws['!merges'] || []).map(XLSX.utils.encode_range);
  console.log(`  ${name}: !ref=${ws['!ref']} merges=${JSON.stringify(merges)}`);
}

console.log('\n=== 2. how far dateNF actually reaches ===');
// Each condition MUST get a brand-new cell object. sheet_to_json with
// raw:false writes a `w` cache onto the cell, so reusing one sheet across the
// with/without calls makes the second call replay the first call's result.
// The earlier version of this harness had that bug and under-reported the
// no-dateNF column.
const dateSheet = (z) => ({
  '!ref': 'A1:A1',
  A1: { t: 'd', v: new Date(Date.UTC(2026, 3, 3)), ...(z ? { z } : {}) },
});
for (const z of [undefined, 'm/d/yy', 'yyyy/mm/dd', 'yyyy"年"m"月"d"日"']) {
  const withNF = XLSX.utils.sheet_to_json(dateSheet(z), { header: 1, raw: false, dateNF: 'yyyy-mm-dd' })[0][0];
  const without = XLSX.utils.sheet_to_json(dateSheet(z), { header: 1, raw: false })[0][0];
  const label = z === undefined ? '(none)' : JSON.stringify(z);
  console.log(`  z=${label.padEnd(26)} dateNF -> ${JSON.stringify(withNF).padEnd(14)} none -> ${JSON.stringify(without)}`);
}
const d11 = wb.Sheets['状態遷移']['!data'][10][3];
console.log(`  real D11 (formatted yyyy/mm/dd): t=${d11.t} w=${JSON.stringify(d11.w)}`);
console.log('  -> dateNF DOES normalise a date cell that carries no number format.');
console.log('  -> dateNF has NO effect once the cell carries its own format (m/d/yy stays 4/3/26).');

console.log('\n=== 3. parseCsv trims the whole file, shifting A1 origin ===');
const csv = '\n\n,,x,y\na,b,c,d\n';
const leading = csv.length - csv.replace(/^\n+/, '').length;
console.log(`  first data row is file line ${leading + 1}; after trim() the text starts ${JSON.stringify(csv.trim().slice(0, 8))}`);
console.log(`  -> sliceRange's A1-origin assumption is off by ${leading} row(s)`);

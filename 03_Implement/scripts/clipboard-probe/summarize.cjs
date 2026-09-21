/*
 * Prints the observation table used by
 * 02_Architecture/input-assistance-paste-provenance.md §1.3, from the raw
 * dumps produced by probe-raw.ps1.
 *
 * Decoding lives in probe-lib.cjs. Read the scope note there before treating
 * any of this as a model for product code (review R2/R4).
 *
 * Run with any Node 20+. Where Node is not installed, VS Code's bundled
 * runtime works:  ELECTRON_RUN_AS_NODE=1 "<...>/Code.exe" summarize.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const lib = require('./probe-lib.cjs');

const RAW = path.join(lib.probeRoot(), 'raw');
if (!fs.existsSync(RAW)) {
  console.error(`no dumps at ${RAW}\nrun build-books.ps1 then probe-raw.ps1 first`);
  process.exit(1);
}

/**
 * Review R2's counterexample, kept executable so the grid logic cannot regress
 * into per-row counting. Row 1 is `A(rowspan=2), B`; row 2 is `C, D`. Every
 * row holds at most two <td>, but the block occupies three columns.
 */
function selfTest() {
  const cases = [
    { name: 'R2 rowspan grid', html: '<table><tr><td rowspan=2>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>', rows: 2, cols: 3 },
    { name: 'colspan width', html: '<table><tr><td colspan=3>A</td></tr><tr><td>B</td><td>C</td><td>D</td></tr></table>', rows: 2, cols: 3 },
  ];
  let ok = true;
  for (const c of cases) {
    const got = lib.htmlShape(c.html);
    const pass = got.rows === c.rows && got.cols === c.cols;
    ok = ok && pass;
    console.log(`self-test (${c.name}): ${got.rows}x${got.cols} -> ${pass ? 'OK' : `FAILED (expected ${c.rows}x${c.cols})`}`);
  }
  // Addresses that must NOT be converted to A1.
  for (const bad of ['C3:C4', 'R5:R7', 'R0C1', 'R5C3:R2C6', 'R1048577C1']) {
    const got = lib.r1c1ToA1(bad);
    const pass = got === null;
    ok = ok && pass;
    console.log(`self-test (reject ${bad}): ${JSON.stringify(got)} -> ${pass ? 'OK' : 'FAILED (must be null)'}`);
  }
  if (!ok) process.exitCode = 1;
}
selfTest();
console.log('');

const rows = lib.collectCases(RAW);

console.log('| case | book | sheet | R1C1 | A1 | addr | html | match | SourceURL | merge |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
  const merge = [r.hasColspan ? 'colspan' : '', r.hasRowspan ? 'rowspan' : ''].filter(Boolean).join('+') || '-';
  console.log(
    `| ${r.case} | ${r.book ?? '?'} | ${r.sheet ?? '?'} | ${r.addr ?? '?'} | ${r.a1 ?? '**A1不可**'} `
    + `| ${r.addrRows ?? '-'}x${r.addrCols ?? '-'} | ${r.rows ?? '-'}x${r.cols ?? '-'} `
    + `| ${r.shapeMatch ? 'OK' : 'MISMATCH'} | ${r.sourceUrl ? 'あり' : '**無し**'} | ${merge} |`,
  );
}

console.log('\n=== detail ===');
for (const r of rows) {
  console.log(`\n${r.case}`);
  console.log(`  Link.target : ${r.linkTarget ?? '(absent)'}`);
  console.log(`  Link.addr   : ${r.linkAddr ?? '(absent)'}  -> A1: ${r.linkA1 ?? 'N/A'}`);
  console.log(`  ObjDesc     : type=${JSON.stringify(r.objectType)} src=${JSON.stringify(r.sheet)}!${r.addr ?? '?'}`
    + `${r.odError ? `  ERROR: ${r.odError}` : ''}`);
  console.log(`  addr agree  : Link vs ObjectDescriptor -> ${r.addrAgree}`);
  console.log(`  SourceURL   : ${r.sourceUrl ?? '(absent)'}`);
  console.log(`  html grid   : ${r.rows}x${r.cols}  occupied per row: [${(r.perRow ?? []).join(',')}]`);
  console.log(`  sha256/16   : ${Object.entries(r.hashes).map(([k, h]) => `${k}=${h}`).join(' ')}`);
}

console.log('\nlock these results in with:  node verify-cases.cjs --update');

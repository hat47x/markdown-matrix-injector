/*
 * Shared decoding for the clipboard observation harness.
 *
 * SCOPE: this is an OBSERVATION harness, not a model for the product.
 * Review R2/R4 (01_Plans/input-assistance-design-review.md):
 *   - the product must parse HTML properly and separate the copied fragment
 *     from its surrounding context. The regex scan here is adequate only for
 *     regenerating the observation table from known fixtures.
 *   - the product must read OBJECTDESCRIPTOR through its declared offsets.
 *     This file does that, so the layout is documented by working example.
 *
 * Each clipboard format needs its own decoding:
 *   HTML Format        UTF-8, including the Version/StartHTML/SourceURL header
 *   Link               ANSI (system code page), NUL-separated fields
 *   Object Descriptor  OBJECTDESCRIPTOR struct + UTF-16 strings at offsets
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const XL_MAX_ROW = 1048576;
const XL_MAX_COL = 16384;

function probeRoot() {
  return process.env.MMI_PROBE_DIR || path.join(os.tmpdir(), 'mmi-clipboard-probe');
}

// The ANSI code page of the observing host. ja-JP here; change for other hosts.
const decodeAnsi = (b) => new TextDecoder('shift_jis').decode(b);
const decodeU8 = (b) => new TextDecoder('utf-8').decode(b);

function nulFields(buf, dec) {
  const out = [];
  let start = 0;
  for (let i = 0; i <= buf.length; i += 1) {
    if (i === buf.length || buf[i] === 0) {
      if (i > start) out.push(dec(buf.subarray(start, i)));
      start = i + 1;
    }
  }
  return out;
}

/**
 * OBJECTDESCRIPTOR field offsets:
 *   0  cbSize (4)          4  clsid (16)         20 dwDrawAspect (4)
 *   24 sizel (8)          32  pointl (8)         40 dwStatus (4)
 *   44 dwFullUserTypeName (4)                    48 dwSrcOfCopy (4)
 * -- 52 bytes, then the string heap. The two dw* fields are byte offsets from
 * the start of the struct to NUL-terminated UTF-16 strings, or 0 when absent.
 * https://learn.microsoft.com/en-us/windows/win32/api/oleidl/ns-oleidl-objectdescriptor
 */
function parseObjectDescriptor(buf) {
  if (!buf || buf.length < 52) return { error: `too small (${buf ? buf.length : 0} bytes)` };
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const cbSize = v.getUint32(0, true);
  if (cbSize > buf.length) return { error: `cbSize ${cbSize} exceeds buffer ${buf.length}` };
  const readAt = (off) => {
    if (off === 0) return null;
    if (off < 52 || off >= buf.length || off % 2 !== 0) return { error: `bad offset ${off}` };
    for (let i = off; i + 1 < buf.length; i += 2) {
      if (v.getUint16(i, true) === 0) return new TextDecoder('utf-16le').decode(buf.subarray(off, i));
    }
    return { error: `unterminated string at ${off}` };
  };
  return {
    cbSize,
    dwStatus: v.getUint32(40, true),
    fullUserTypeName: readAt(v.getUint32(44, true)),
    srcOfCopy: readAt(v.getUint32(48, true)),
  };
}

/** Split `sheet!R5C3:R12C6`. Sheet names may contain `!`, so split at the LAST one. */
function splitSrcOfCopy(s) {
  if (typeof s !== 'string') return { sheet: null, addr: null };
  const i = s.lastIndexOf('!');
  if (i < 0) return { sheet: null, addr: s };
  return { sheet: s.slice(0, i), addr: s.slice(i + 1) };
}

const colLabel = (n) => {
  let s = '';
  let v = n;
  while (v > 0) { const r = (v - 1) % 26; s = String.fromCharCode(65 + r) + s; v = Math.floor((v - 1) / 26); }
  return s;
};
const colIndex = (s) => [...s].reduce((r, c) => r * 26 + (c.charCodeAt(0) - 64), 0);

/**
 * R1C1 -> A1. Returns null for the row-only (`R5:R7`) and column-only
 * (`C3:C4`) forms. `C3:C4` is the dangerous one: lexically a valid A1 range,
 * but it means "columns 3..4, full height". Numeric bounds are checked so an
 * out-of-range or reversed address is rejected rather than converted.
 */
function r1c1ToA1(addr) {
  const m = /^R(\d+)C(\d+)(?::R(\d+)C(\d+))?$/.exec(addr || '');
  if (!m) return null;
  const nums = [+m[1], +m[2], m[3] ? +m[3] : +m[1], m[4] ? +m[4] : +m[2]];
  if (nums.some((n) => !Number.isSafeInteger(n) || n < 1)) return null;
  if (nums[0] > XL_MAX_ROW || nums[2] > XL_MAX_ROW || nums[1] > XL_MAX_COL || nums[3] > XL_MAX_COL) return null;
  if (nums[2] < nums[0] || nums[3] < nums[1]) return null;
  const a = `${colLabel(nums[1])}${nums[0]}`;
  return m[3] ? `${a}:${colLabel(nums[3])}${nums[2]}` : a;
}

/**
 * Shape of the copied block, via an occupancy grid (review R2).
 *
 * A per-row `<td>` count -- even the maximum across rows -- cannot recover the
 * geometry: a table whose first row is `A(rowspan=2), B` and whose second row
 * is `C, D` has at most 2 cells per row but occupies 3 columns. Only laying
 * cells into a grid, carrying rowspans down, gives the width.
 *
 * Rows are counted from the whole <table>: for a single-row copy Excel emits
 * the <tr> outside the <!--StartFragment--> markers, so fragment-only counting
 * reports zero rows. That conflates the copied fragment with its surrounding
 * context -- acceptable for these single-table fixtures, NOT for the product.
 */
function htmlShape(html) {
  const table = html.slice(html.indexOf('<table'));
  const trs = table.split(/<tr[\s>]/i).slice(1);
  const grid = [];
  const occupy = (r, c) => { (grid[r] ||= [])[c] = true; };
  let hasColspan = false;
  let hasRowspan = false;

  trs.forEach((tr, r) => {
    grid[r] ||= [];
    let c = 0;
    for (const m of tr.matchAll(/<t[dh]\b([^>]*)>/gi)) {
      const attrs = m[1];
      const cs = Math.max(1, Number((/colspan=["']?(\d+)/i.exec(attrs) || [, 1])[1]) || 1);
      const rs = Math.max(1, Number((/rowspan=["']?(\d+)/i.exec(attrs) || [, 1])[1]) || 1);
      if (cs > 1) hasColspan = true;
      if (rs > 1) hasRowspan = true;
      while (grid[r][c]) c += 1;               // skip cells covered from above
      for (let dr = 0; dr < rs; dr += 1) {
        for (let dc = 0; dc < cs; dc += 1) occupy(r + dr, c + dc);
      }
      c += cs;
    }
  });

  return {
    rows: grid.length,
    cols: grid.reduce((max, row) => Math.max(max, row.length), 0),
    hasColspan,
    hasRowspan,
    perRow: grid.map((row) => row.length),
  };
}

/** Reads every captured case under <probeRoot>/raw and decodes it. */
function collectCases(rawDir = path.join(probeRoot(), 'raw')) {
  const out = [];
  for (const name of fs.readdirSync(rawDir).sort()) {
    const dir = path.join(rawDir, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const rec = { case: name, hashes: {} };
    const read = (f) => {
      const p = path.join(dir, f);
      if (!fs.existsSync(p)) return null;
      const b = fs.readFileSync(p);
      rec.hashes[f] = crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
      return b;
    };

    const link = read('Link.bin');
    if (link) {
      const f = nulFields(link, decodeAnsi);
      rec.linkTarget = f[1];
      rec.linkAddr = f[2];
      const m = /^(.*)\[([^\]]+)\](.*)$/.exec(f[1] || '');
      rec.dir = m ? m[1] : '';
      rec.book = m ? m[2] : f[1];
      rec.linkSheet = m ? m[3] : null;
      rec.linkA1 = r1c1ToA1(f[2]);
    }

    const od = parseObjectDescriptor(read('Object_Descriptor.bin'));
    rec.odError = od.error ?? (typeof od.srcOfCopy === 'object' ? od.srcOfCopy?.error : null) ?? null;
    const split = splitSrcOfCopy(typeof od.srcOfCopy === 'string' ? od.srcOfCopy : null);
    rec.sheet = split.sheet;
    rec.addr = split.addr;
    rec.objectType = typeof od.fullUserTypeName === 'string' ? od.fullUserTypeName : null;
    rec.a1 = r1c1ToA1(rec.addr);

    const html = read('HTML_Format.bin');
    if (html) {
      const s = decodeU8(html);
      const su = /^SourceURL:(.*)$/m.exec(s);
      rec.sourceUrl = su && su[1].trim() ? su[1].trim() : null;
      Object.assign(rec, htmlShape(s));
    }

    rec.addrAgree = rec.linkA1 === rec.a1;

    if (rec.a1) {
      const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(rec.a1);
      if (m) {
        rec.addrRows = m[3] ? +m[4] - +m[2] + 1 : 1;
        rec.addrCols = m[3] ? colIndex(m[3]) - colIndex(m[1]) + 1 : 1;
        rec.shapeMatch = rec.addrRows === rec.rows && rec.addrCols === rec.cols;
      }
    } else {
      rec.shapeMatch = false;
    }
    out.push(rec);
  }
  return out;
}

module.exports = {
  probeRoot, decodeAnsi, decodeU8, nulFields, parseObjectDescriptor, splitSrcOfCopy,
  colLabel, colIndex, r1c1ToA1, htmlShape, collectCases, XL_MAX_ROW, XL_MAX_COL,
};

/**
 * Writes a design workbook with pictures for the manual E2E (issue-0196).
 *
 *   node --import tsx scripts/manual-e2e/gen-image-design.ts <out.xlsx> [changed]
 *
 * `changed` replaces the login picture's bytes: the picture was edited in Excel after review.
 */
import fs from 'node:fs';
import { pngOf, screenDesignWorkbook } from '../../test/helpers/buildXlsxWithImages.js';

const out = process.argv[2];
if (!out) throw new Error('usage: gen-image-design.ts <out.xlsx> [changed]');
const changed = process.argv[3] === 'changed';
const { bytes } = screenDesignWorkbook({
  memoText: '画面設計の補足（架空データ）',
  ...(changed ? { login: pngOf(8, 6, [250, 10, 10]) } : {}),
});
fs.writeFileSync(out, bytes);
console.log(`wrote ${out} (${bytes.length} bytes, ${changed ? 'changed' : 'original'})`);

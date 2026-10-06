/**
 * Survey for ADR-0022 option C (`where=`): in real documents, how often does a
 * `grep=` reference show rows that a single-column filter would not?
 *
 * `grep` matches the value in ANY displayed column, so "rows whose 必須 column is ○"
 * cannot be written exactly. For every reference with `grep`, find the displayed
 * columns that contain the needle, and count it as ambiguous when matching in
 * one column alone would give a different set of rows than `grep` shows.
 *
 *   node --import tsx scripts/grep-exactness-survey.ts <dir-or-md>... [--root <workspace>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildLogicalTable } from '../src/core/renderTable.js';
import { loadWorkbook } from '../src/core/workbookLoader.js';
import { extractEmbedQueries } from '../src/parser/embedSyntax.js';

function markdownFiles(target: string): string[] {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') return [];
    const child = path.join(target, entry.name);
    return entry.isDirectory() ? markdownFiles(child) : entry.name.endsWith('.md') ? [child] : [];
  });
}

const args = process.argv.slice(2);
const rootAt = args.indexOf('--root');
const root = rootAt >= 0 ? path.resolve(args.splice(rootAt, 2)[1]) : undefined;
let withGrep = 0;
let ambiguous = 0;
let unreadable = 0;
const rows: string[] = [];

for (const file of args.flatMap((target) => markdownFiles(path.resolve(target)))) {
  for (const embed of extractEmbedQueries(fs.readFileSync(file, 'utf8'))) {
    const needle = embed.params.get('grep');
    if (!needle) continue;
    withGrep += 1;
    try {
      const absolute = path.resolve(path.dirname(file), embed.filepath);
      if (root && !absolute.startsWith(root)) continue;
      const workbook = loadWorkbook({ absolutePath: absolute });
      const withoutGrep = new URLSearchParams(embed.params);
      withoutGrep.delete('grep');
      const all = buildLogicalTable({ ...embed, params: withoutGrep }, workbook);
      const shown = buildLogicalTable(embed, workbook);
      const lower = needle.toLowerCase();
      const width = Math.max(0, ...all.bodyRows.map((row) => row.length));
      const columns: { index: number; rows: number }[] = [];
      for (let c = 0; c < width; c += 1) {
        const hit = all.bodyRows.filter((row) => (row[c] ?? '').toLowerCase().includes(lower)).length;
        if (hit > 0) columns.push({ index: c, rows: hit });
      }
      // grep shows a row when ANY column matches; a single-column filter would show fewer when >1 column matches.
      const single = columns.length === 1;
      const isAmbiguous = !single && columns.some((column) => column.rows !== shown.bodyRows.length);
      if (isAmbiguous) ambiguous += 1;
      rows.push(`${isAmbiguous ? 'AMBIGUOUS' : 'exact    '}  ${path.relative(process.cwd(), file)}  grep=${needle}  shown=${shown.bodyRows.length}  perColumn=${columns.map((c) => `${all.headers?.[c.index] ?? `col${c.index + 1}`}:${c.rows}`).join(' ')}`);
    } catch {
      unreadable += 1;
    }
  }
}
console.log(rows.join('\n'));
console.log(`\nreferences with grep: ${withGrep}; ambiguous (grep shows rows another single column would not): ${ambiguous}; unreadable: ${unreadable}`);

#!/usr/bin/env node
/**
 * `mmi` -- the MMI engine without VS Code, for AI agents, CI and scripts.
 * Every command is read-only: it never writes to a source workbook, and only
 * writes a file when `-o` is given.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import XLSX from 'xlsx';
import { WorkbookCache } from '../cache/workbookCache.js';
import { tableCandidates } from '../adapters/tableRegionAdapter.js';
import type { Candidate } from '../core/candidate.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';
import { sliceRegion } from '../core/tableGeometry.js';
import { loadWorkbook, type WorkbookData } from '../core/workbookLoader.js';
import { createDiagnosticsForDocument } from '../dx/vscodeAdapters.js';
import { buildDeliveryManifestCsv } from '../manifest/collectDeliveryManifest.js';
import { detectRegions } from '../search/regionDetector.js';
import { RenderError, renderDocumentHtml, renderDocumentMarkdown } from './render.js';

const USAGE = `Usage: mmi <command> [options]

Commands:
  inspect <source>          List sheets and table regions of a workbook/CSV (structure only by default;
                            --json adds "candidates": the same regions as Semantic Candidates with status,
                            method, provenance and fingerprint)
      --values <n>            also print the first n body rows of each region
      --from <doc.md>         write suggested references relative to this document
  check <path...>           Validate MMI references in Markdown files or directories
                            (exit code 1 when any error is found)
  render <doc.md>           Expand references into Markdown tables (default) or HTML
      --to md|html
  manifest <doc.md>         List references that fall back to 別紙 cards as CSV

Common options:
  --root <dir>              workspace boundary for references (default: current directory)
  --json                    machine-readable output
  -o, --out <file>          write output to a file instead of stdout
  -h, --help`;

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      root: { type: 'string' },
      json: { type: 'boolean', default: false },
      out: { type: 'string', short: 'o' },
      to: { type: 'string', default: 'md' },
      values: { type: 'string', default: '0' },
      from: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, ...args] = positionals;
  if (values.help || !command) {
    console.log(USAGE);
    return command || values.help ? 0 : 2;
  }
  const root = path.resolve(values.root ?? process.cwd());
  const emit = (text: string) => (values.out ? fs.writeFileSync(values.out, text) : process.stdout.write(text.endsWith('\n') ? text : `${text}\n`));

  switch (command) {
    case 'inspect': {
      if (args.length !== 1) return usageError('inspect takes one source file');
      const result = inspectSource(path.resolve(args[0]), Number(values.values) || 0, values.from);
      emit(values.json ? JSON.stringify(result, null, 2) : formatInspect(result));
      return 0;
    }
    case 'check': {
      if (args.length === 0) return usageError('check needs at least one file or directory');
      const problems = await checkPaths(args.flatMap(collectMarkdownFiles), root);
      const errors = problems.filter((problem) => problem.severity === 'error').length;
      emit(values.json
        ? JSON.stringify({ errors, problems }, null, 2)
        : problems.map((p) => `${p.file}:${p.line}:${p.column} ${p.severity} ${p.code} ${p.message}`).concat(`${errors} error(s), ${problems.length - errors} other problem(s)`).join('\n'));
      return errors > 0 ? 1 : 0;
    }
    case 'render': {
      if (args.length !== 1) return usageError('render takes one Markdown file');
      if (values.to !== 'md' && values.to !== 'html') return usageError('--to must be md or html');
      const options = { markdownFilePath: path.resolve(args[0]), workspaceRoot: root };
      try {
        emit(values.to === 'html' ? renderDocumentHtml(options) : renderDocumentMarkdown(options));
      } catch (error) {
        if (!(error instanceof RenderError)) throw error;
        console.error(error.message);
        return 1;
      }
      return 0;
    }
    case 'manifest': {
      if (args.length !== 1) return usageError('manifest takes one Markdown file');
      const markdownFilePath = path.resolve(args[0]);
      const { records, csvText } = buildDeliveryManifestCsv({
        markdownText: fs.readFileSync(markdownFilePath, 'utf8'), markdownFilePath, workspaceRoot: root,
      });
      emit(values.json ? JSON.stringify(records, null, 2) : csvText);
      return 0;
    }
    default:
      return usageError(`unknown command: ${command}`);
  }
}

function usageError(message: string): number {
  console.error(`mmi: ${message}\n\n${USAGE}`);
  return 2;
}

export interface InspectRegion {
  a1: string;
  rows: number;
  columns: number;
  title?: string;
  headers?: string[];
  headerConfidence: string;
  notes: string[];
  reference: string;
  sample?: string[][];
}

export interface InspectResult {
  source: string;
  sheets: { name: string; usedRange?: string; regions: InspectRegion[] }[];
  /** The same structure as Semantic Candidates (issue-0193). `--json` only; the text output is unchanged. */
  candidates: Candidate[];
}

export function inspectSource(absolutePath: string, sampleRows: number, fromDocument?: string): InspectResult {
  const workbook = loadWorkbook({ absolutePath });
  const sourceDigest = readSourceFileIdentity(absolutePath).digest;
  const base = fromDocument ? path.dirname(path.resolve(fromDocument)) : process.cwd();
  let relative = path.relative(base, absolutePath).split(path.sep).join('/');
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return {
    source: relative,
    candidates: Object.entries(workbook.sheets).flatMap(([sheetName, sheet]) =>
      tableCandidates({ source: relative, sourceDigest, sheetName, sheet }),
    ),
    sheets: Object.entries(workbook.sheets).map(([name, sheet]) => ({
      name,
      ...(sheet.usedRange ? { usedRange: a1Of(sheet.usedRange) } : {}),
      regions: detectRegions(name, sheet, { maxValueSample: 0 }).map((region) => {
        const header = region.headerConfidence === 'likely' ? '?header=first' : '';
        return {
          a1: region.a1,
          rows: region.range.endRow - region.range.startRow + 1,
          columns: region.range.endCol - region.range.startCol + 1,
          ...(region.title ? { title: region.title } : {}),
          ...(region.headers ? { headers: region.headers } : {}),
          headerConfidence: region.headerConfidence,
          notes: region.reasons,
          reference: `![[${relative}#${name}|${region.a1}${header}]]`,
          ...(sampleRows > 0 ? { sample: sliceRegion(sheet, region.a1).slice(region.headers ? 1 : 0, (region.headers ? 1 : 0) + sampleRows) } : {}),
        };
      }),
    })),
  };
}

function a1Of(range: { startRow: number; startCol: number; endRow: number; endCol: number }): string {
  return XLSX.utils.encode_range({ s: { r: range.startRow, c: range.startCol }, e: { r: range.endRow, c: range.endCol } });
}

function formatInspect(result: InspectResult): string {
  const lines = [`source: ${result.source}`];
  for (const sheet of result.sheets) {
    lines.push('', `sheet: ${sheet.name}${sheet.usedRange ? ` (used ${sheet.usedRange})` : ''}`);
    if (sheet.regions.length === 0) lines.push('  (no table regions)');
    for (const region of sheet.regions) {
      lines.push(`  ${region.a1}  ${region.rows} rows x ${region.columns} cols  header: ${region.headerConfidence}${region.title ? `  title: ${region.title}` : ''}`);
      if (region.headers) lines.push(`    columns: ${region.headers.map((h, i) => `${XLSX.utils.encode_col(i)}=${h}`).join(', ')}`);
      if (region.notes.length) lines.push(`    notes: ${region.notes.join(', ')}`);
      lines.push(`    ${region.reference}`);
      for (const row of region.sample ?? []) lines.push(`    | ${row.join(' | ')} |`);
    }
  }
  return lines.join('\n');
}

export interface CheckProblem {
  file: string;
  line: number;
  column: number;
  severity: string;
  code: string;
  message: string;
}

export async function checkPaths(files: string[], root: string): Promise<CheckProblem[]> {
  const cache = new WorkbookCache<WorkbookData>();
  const problems: CheckProblem[] = [];
  for (const file of files) {
    const absolute = path.resolve(file);
    const items = await createDiagnosticsForDocument(fs.readFileSync(absolute, 'utf8'), absolute, root, {
      fileExists: async (filepath) => fs.existsSync(filepath) && fs.statSync(filepath).isFile(),
      readFile: async (filepath) => fs.readFileSync(filepath),
      readWorkbookSheetNames: async (filepath) => Object.keys(loadWorkbook({ absolutePath: filepath, cache }).sheets),
    });
    for (const { diagnostic, range } of items) {
      problems.push({
        file: path.relative(process.cwd(), absolute).split(path.sep).join('/'),
        line: range.start.line + 1,
        column: range.start.character + 1,
        severity: diagnostic.severity,
        code: diagnostic.code,
        message: diagnostic.message,
      });
    }
  }
  return problems;
}

function collectMarkdownFiles(target: string): string[] {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .flatMap((entry) => {
      const child = path.join(target, entry.name);
      return entry.isDirectory() ? collectMarkdownFiles(child) : entry.name.toLowerCase().endsWith('.md') ? [child] : [];
    });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    console.error(`mmi: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  });
}

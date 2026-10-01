/**
 * Deterministic scorer for the AI-writing benchmark (04_Documentation/benchmarks/ai-writing).
 * Compares a document an AI wrote against the source-of-truth workbook:
 *   - tableRowsNotInSource: table rows carrying a source ID that match no source row (transcription errors, invented rows)
 *   - unverifiedRows: table rows without any source ID (the author's own summary tables); reported, never failed
 *   - phantomIds: IDs anywhere in the text that exist in no source sheet
 *   - missingIds / unexpectedIds: rows the task required / forbade, judged on IDs inside tables (prose may mention any ID)
 *   - referenceErrors: `mmi check` errors (0 when the document has no references)
 * A cell subset is accepted (column selection); order must be kept.
 * Usage: node --import tsx scripts/ai-writing-bench/score.ts <task.json> <doc.md> [--masters <dir>]
 * Without --masters the kit's masters are used; pass the workspace's masters after `run.ts mutate`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPaths } from '../../src/cli/mmi.js';
import { RenderError, renderDocumentMarkdown } from '../../src/cli/render.js';
import { loadWorkbook } from '../../src/core/workbookLoader.js';
import { sliceRegion } from '../../src/core/tableGeometry.js';

export interface BenchTask {
  id: string;
  workbook: string;
  expectIds: string[];
  forbidIds: string[];
}

export interface Score {
  task: string;
  referenceErrors: number;
  rendered: boolean;
  tablesRows: number;
  tableRowsNotInSource: number;
  unverifiedRows: number;
  phantomIds: string[];
  missingIds: string[];
  unexpectedIds: string[];
  pass: boolean;
}

const ID_PATTERN = /\b(?:REQ|OP|ST|API|TC|FN|SC|IT|MSG)-[A-Z]?\d{2,3}\b/g;

export function sourceRows(workbookPath: string): { rows: string[][]; ids: Set<string> } {
  const workbook = loadWorkbook({ absolutePath: workbookPath });
  const rows: string[][] = [];
  for (const sheet of Object.values(workbook.sheets)) {
    for (const row of sliceRegion(sheet, undefined)) rows.push(row.map((cell) => cell.trim()));
  }
  const ids = new Set(rows.flatMap((row) => row.join(' ').match(ID_PATTERN) ?? []));
  return { rows, ids };
}

export function parseTables(markdown: string): string[][] {
  const bodyRows: string[][] = [];
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*\|.*\|\s*$/.test(lines[i]) || !/^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(lines[i + 1] ?? '')) continue;
    for (i += 2; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i += 1) bodyRows.push(splitRow(lines[i]));
    i -= 1;
  }
  return bodyRows;
}

function splitRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  const inner = line.trim().slice(1, -1);
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] === '\\' && (inner[i + 1] === '|' || inner[i + 1] === '\\')) { current += inner[i + 1]; i += 1; }
    else if (inner[i] === '|') { cells.push(current.trim()); current = ''; }
    else current += inner[i];
  }
  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/<br>/g, '\n'));
}

function isSubsequence(row: string[], source: string[]): boolean {
  let at = 0;
  for (const cell of source) if (at < row.length && cell === row[at]) at += 1;
  return at === row.length;
}

export async function scoreDocument(task: BenchTask, docPath: string, mastersDir: string): Promise<Score> {
  const truth = sourceRows(path.join(mastersDir, task.workbook));
  const doc = path.resolve(docPath);
  // The workspace is the folder holding masters/, as in the prompt (`--root .`).
  const workspaceRoot = path.dirname(path.resolve(mastersDir));
  const text = fs.readFileSync(doc, 'utf8');
  const hasReferences = /!\[\[/.test(text);
  const referenceErrors = hasReferences
    ? (await checkPaths([doc], workspaceRoot)).filter((problem) => problem.severity === 'error').length
    : 0;

  let expanded = text;
  let rendered = true;
  if (hasReferences) {
    try {
      expanded = renderDocumentMarkdown({ markdownFilePath: doc, workspaceRoot });
    } catch (error) {
      if (!(error instanceof RenderError)) throw error;
      rendered = false;
    }
  }

  const tableRows = parseTables(expanded).filter((row) => row.some((cell) => cell !== ''));
  const claimed = tableRows.filter((row) => (row.join(' ').match(ID_PATTERN) ?? []).length > 0);
  const notInSource = claimed.filter((row) => !truth.rows.some((source) => isSubsequence(row.filter((cell) => cell !== ''), source.filter((cell) => cell !== ''))));
  const idsInTables = new Set(claimed.flatMap((row) => row.join(' ').match(ID_PATTERN) ?? []));
  const phantomIds = [...new Set(expanded.match(ID_PATTERN) ?? [])].filter((id) => !truth.ids.has(id)).sort();
  const missingIds = task.expectIds.filter((id) => !idsInTables.has(id));
  const unexpectedIds = task.forbidIds.filter((id) => idsInTables.has(id));
  return {
    task: task.id,
    referenceErrors,
    rendered,
    tablesRows: tableRows.length,
    tableRowsNotInSource: notInSource.length,
    unverifiedRows: tableRows.length - claimed.length,
    phantomIds,
    missingIds,
    unexpectedIds,
    pass: rendered && referenceErrors === 0 && notInSource.length === 0 && phantomIds.length === 0 && missingIds.length === 0 && unexpectedIds.length === 0,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [taskPath, docPath, flag, masters] = process.argv.slice(2);
  if (!taskPath || !docPath) throw new Error('Usage: score.ts <task.json> <doc.md> [--masters <dir>]');
  const task = JSON.parse(fs.readFileSync(taskPath, 'utf8')) as BenchTask;
  const mastersDir = flag === '--masters' && masters ? masters : path.join(path.dirname(taskPath), '../../../kits/basic-design/masters');
  const score = await scoreDocument(task, docPath, mastersDir);
  console.log(JSON.stringify(score, null, 2));
  process.exitCode = score.pass ? 0 : 1;
}

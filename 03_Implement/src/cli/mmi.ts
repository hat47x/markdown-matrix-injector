#!/usr/bin/env node
/**
 * `mmi` -- the command-line interface for AI agents, CI and people who work
 * in a terminal (ADR-0019 D7 優先度1; 02_Architecture/table-navigation.md §5).
 *
 *   mmi inspect <book> [--doc <md>] [--sample <n>] [--values] [--json]
 *   mmi select <book> --table <name|id|range> [--sheet <s>] [--columns <h1,h2>]
 *              [--contains <text> [--in <header>] | --first <n>] [--doc <md>] [--json]
 *   mmi find "<description>" [--root <dir>] [--doc <md>] [--json]
 *   mmi check <md>... [--root <dir>] [--json]
 *   mmi render <md> [--root <dir>] [--format md|html] [--out <file>]
 *
 * Every command reads only. `check` exits 1 when a reference has an error,
 * `select` when the selection cannot be made; 2 is a usage error. With
 * --json the output is one JSON object carrying a `schema` field. `inspect`
 * returns structure only (headers, titles, names) unless --sample/--values
 * ask for cell values: the output may be sent to an AI provider, and what
 * may be sent is for the user's organization to decide.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import { WorkbookCache } from '../cache/workbookCache.js';
import { evaluateEmbed } from '../core/evaluateEmbed.js';
import { loadWorkbook, type WorkbookData } from '../core/workbookLoader.js';
import { createDiagnosticsForDocument, toRelativeSuggestion } from '../dx/vscodeAdapters.js';
import { analyzeBook, describeWorkbook, type WorkbookCatalog } from '../navigate/catalog.js';
import { selectFromBook, type RowSelection, type SelectionResult } from '../navigate/select.js';
import { parseEmbedSyntax } from '../parser/embedSyntax.js';
import { markdownMatrixPlugin } from '../plugin/markdownMatrixPlugin.js';
import { WorkspaceRegionIndex } from '../search/workspaceRegionIndex.js';

export const CLI_SCHEMA = 'mmi.cli/v0';
const WORKBOOK = /\.(xlsx|xlsm|xlsb|xls|csv|xml)$/i;
const EMBED = /!\[\[([^\]\n]+?)\]\]/g;

interface Parsed {
  command: string;
  positional: string[];
  flags: Map<string, string | true>;
}

class UsageError extends Error {}

export interface CliIo {
  out(text: string): void;
  err(text: string): void;
  cwd: string;
}

function parse(argv: readonly string[]): Parsed {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (['json', 'values', 'strict'].includes(key) || next === undefined || next.startsWith('--')) flags.set(key, true);
    else {
      flags.set(key, next);
      i += 1;
    }
  }
  return { command, positional, flags };
}

const flag = (parsed: Parsed, key: string): string | undefined => {
  const value = parsed.flags.get(key);
  return typeof value === 'string' ? value : undefined;
};

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  let parsed: Parsed;
  try {
    parsed = parse(argv);
    const json = parsed.flags.has('json');
    switch (parsed.command) {
      case 'inspect':
        return inspect(parsed, io, json);
      case 'select':
        return select(parsed, io, json);
      case 'find':
        return await find(parsed, io, json);
      case 'check':
        return await check(parsed, io, json);
      case 'render':
        return render(parsed, io);
      case 'help':
      case '--help':
        io.out(HELP);
        return 0;
      default:
        throw new UsageError(`不明なコマンドです: ${parsed.command}`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`${error.message}\n\n${HELP}`);
      return 2;
    }
    io.err(`mmi: ${(error as Error).message}`);
    return 1;
  }
}

const HELP = `使い方:
  mmi inspect <ブック> [--doc <md>] [--sample <行数>] [--values] [--json]
  mmi select <ブック> --table <表名|範囲> [--sheet <シート>] [--columns <見出し,見出し>]
             [--contains <文字列> [--in <見出し>] | --first <行数>] [--doc <md>] [--json]
  mmi find "<説明>" [--root <フォルダ>] [--doc <md>] [--json]
  mmi check <md>... [--root <フォルダ>] [--json]
  mmi render <md> [--root <フォルダ>] [--format md|html] [--out <ファイル>]`;

function resolve(io: CliIo, file: string): string {
  return path.resolve(io.cwd, file);
}

function referencePathFor(io: CliIo, bookPath: string, doc?: string): string {
  return doc ? toRelativeSuggestion(resolve(io, doc), bookPath) : `./${path.basename(bookPath)}`;
}

// ---------------------------------------------------------------------------

function inspect(parsed: Parsed, io: CliIo, json: boolean): number {
  const file = parsed.positional[0];
  if (!file) throw new UsageError('inspect にはブックを指定してください。');
  const bookPath = resolve(io, file);
  const catalog = describeWorkbook(bookPath, {
    referencePath: referencePathFor(io, bookPath, flag(parsed, 'doc')),
    sampleRows: Number(flag(parsed, 'sample') ?? 0),
    includeValues: parsed.flags.has('values'),
  });
  io.out(json ? JSON.stringify({ schema: CLI_SCHEMA, command: 'inspect', catalog }, null, 2) : describeCatalog(catalog));
  return 0;
}

function describeCatalog(catalog: WorkbookCatalog): string {
  const lines = [catalog.book];
  for (const sheet of catalog.sheets) {
    const visibility = sheet.visibility === 'visible' ? '' : sheet.visibility === 'hidden' ? '（非表示）' : '（Excelの画面から表示できない）';
    lines.push(`  シート ${sheet.name}${visibility}${sheet.usedRange ? ` 使用範囲 ${sheet.usedRange}` : ''}`);
    for (const table of sheet.tables) {
      const label = table.excelTable ? `テーブル「${table.excelTable}」` : table.title ? `「${table.title}」` : '';
      lines.push(`    表 ${table.id} ${label} 本体${table.bodyRows}行`);
      lines.push(`      列: ${table.columns.map((column) => column.header || `(${column.sheetColumn}列)`).join('、')}`);
      if (table.names.length > 0) lines.push(`      名前: ${table.names.join('、')}`);
      if (table.reference) lines.push(`      参照: ${table.reference}${table.renderMode === 'card' ? '（別紙）' : ''}`);
      for (const caution of table.cautions) lines.push(`      注意: ${caution.message}`);
      for (const row of table.sample ?? []) lines.push(`      | ${row.join(' | ')} |`);
    }
    for (const block of sheet.otherBlocks) {
      lines.push(`    ${ROLE_JA[block.role] ?? block.role} ${block.range}${block.labels ? ` ${block.labels.join('、')}` : ''}${block.excerpt ? ` ${block.excerpt.join(' / ')}` : ''}`);
    }
  }
  if (catalog.names.length > 0) {
    lines.push('  名前付き範囲');
    for (const name of catalog.names) lines.push(`    ${name.name}${name.scope ? `（${name.scope}）` : ''}: ${name.kind}${name.range ? ` ${name.sheet}!${name.range}` : ''}`);
  }
  if (catalog.unavailable.length > 0) lines.push(`  取得できなかった情報: ${catalog.unavailable.join('、')}`);
  return lines.join('\n');
}

const ROLE_JA: Record<string, string> = { 'key-value': '項目と値の組', prose: '文章', heading: '見出し', form: '記入欄', diagram: '図', unknown: '判定できない領域' };

// ---------------------------------------------------------------------------

function select(parsed: Parsed, io: CliIo, json: boolean): number {
  const file = parsed.positional[0];
  const table = flag(parsed, 'table');
  if (!file || !table) throw new UsageError('select にはブックと --table を指定してください。');
  const contains = flag(parsed, 'contains');
  const first = flag(parsed, 'first');
  if (contains !== undefined && first !== undefined) throw new UsageError('--contains と --first は同時に使えません。');
  const rows: RowSelection | undefined =
    contains !== undefined ? { contains, ...(flag(parsed, 'in') ? { column: flag(parsed, 'in') } : {}) } : first !== undefined ? { first: Number(first) } : undefined;
  const bookPath = resolve(io, file);
  const referencePath = referencePathFor(io, bookPath, flag(parsed, 'doc'));
  const result = selectFromBook(analyzeBook(bookPath, referencePath), referencePath, {
    table,
    ...(flag(parsed, 'sheet') ? { sheet: flag(parsed, 'sheet') } : {}),
    ...(flag(parsed, 'columns') ? { columns: flag(parsed, 'columns')!.split(',').map((column) => column.trim()).filter(Boolean) } : {}),
    ...(rows ? { rows } : {}),
  });
  if (json) {
    io.out(JSON.stringify({ schema: CLI_SCHEMA, command: 'select', result }, null, 2));
  } else {
    // stdout carries the reference alone, so it can be pasted or piped; everything else goes to stderr.
    if (result.reference) io.out(result.reference);
    const notes = describeSelection(result);
    if (notes) io.err(notes);
  }
  return result.ok ? 0 : 1;
}

function describeSelection(result: SelectionResult): string {
  const lines: string[] = [];
  for (const error of result.errors) lines.push(`エラー: ${error.message}${error.suggestions?.length ? `（候補: ${error.suggestions.join('、')}）` : ''}`);
  for (const warning of result.warnings) lines.push(`注意: ${warning.message}`);
  if (result.rows) lines.push(`行: ${result.rows.shown}/${result.rows.ofTotal}${result.rows.exact ? '' : '（指定した列だけの絞り込みと一致しません）'}${result.renderMode === 'card' ? '・別紙として表示' : ''}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------

async function find(parsed: Parsed, io: CliIo, json: boolean): Promise<number> {
  const text = parsed.positional.join(' ').trim();
  if (!text) throw new UsageError('find には説明を指定してください。');
  const root = resolve(io, flag(parsed, 'root') ?? '.');
  const doc = flag(parsed, 'doc');
  const index = new WorkspaceRegionIndex({
    loadWorkbook: (file) => loadWorkbook({ absolutePath: file }),
    statFile: (file) => {
      const stat = fs.statSync(file);
      return { mtimeMs: stat.mtimeMs, size: stat.size };
    },
  });
  await index.refresh(listWorkbooks(root));
  const relative = (bookPath: string): string => (doc ? toRelativeSuggestion(resolve(io, doc), bookPath) : toRelativeSuggestion(path.join(root, 'x.md'), bookPath));
  const result = index.query(text, relative);
  const candidates = result.candidates.map((candidate) => ({ reference: candidate.markdown, explanation: candidate.explanation, notes: candidate.notes }));
  if (json) {
    io.out(JSON.stringify({ schema: CLI_SCHEMA, command: 'find', status: result.status, reasons: result.reasons, candidates, requiresSelection: true }, null, 2));
  } else {
    io.out([...candidates.map((c, i) => `${i + 1}. ${c.reference}\n   ${c.explanation}`), ...result.reasons.map((reason) => `理由: ${reason}`)].join('\n') || '候補はありません。');
  }
  return result.status === 'candidates' ? 0 : 1;
}

function listWorkbooks(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name.startsWith('~$')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (WORKBOOK.test(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

// ---------------------------------------------------------------------------

interface CheckItem {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'information';
  code: string;
  message: string;
  reference: string;
}

async function check(parsed: Parsed, io: CliIo, json: boolean): Promise<number> {
  if (parsed.positional.length === 0) throw new UsageError('check には Markdown ファイルを指定してください。');
  const root = flag(parsed, 'root') ? resolve(io, flag(parsed, 'root')!) : undefined;
  const items: CheckItem[] = [];
  let references = 0;
  for (const file of parsed.positional) {
    const markdownFilePath = resolve(io, file);
    const text = fs.readFileSync(markdownFilePath, 'utf8');
    const workspaceRoot = root ?? path.dirname(markdownFilePath);
    const diagnostics = await createDiagnosticsForDocument(text, markdownFilePath, workspaceRoot, {
      fileExists: async (candidate) => fs.existsSync(candidate),
      readFile: async (candidate) => fs.readFileSync(candidate),
      readWorkbookSheetNames: async (candidate) => Object.keys(loadWorkbook({ absolutePath: candidate }).sheets),
    });
    for (const item of diagnostics) {
      items.push({
        file,
        line: item.range.start.line + 1,
        column: item.range.start.character + 1,
        severity: item.diagnostic.severity,
        code: item.diagnostic.code,
        message: item.diagnostic.message,
        reference: lineText(text, item.range.start.line),
      });
    }
    // What the preview would show: failures that only rendering reveals (a range, a header row).
    const cache = new WorkbookCache<WorkbookData>();
    for (const match of text.matchAll(EMBED)) {
      const embed = parseEmbedSyntax(match[0]);
      if (!embed) continue;
      references += 1;
      const at = position(text, match.index ?? 0);
      if (items.some((item) => item.file === file && item.line === at.line && item.severity === 'error')) continue;
      const outcome = evaluateEmbed(embed, { markdownFilePath, workspaceRoot, cache });
      if (outcome.kind === 'error') {
        items.push({ file, ...at, severity: 'error', code: 'MMI_RENDER_ERROR', message: outcome.message, reference: match[0] });
      }
    }
  }
  const errors = items.filter((item) => item.severity === 'error').length;
  if (json) {
    io.out(JSON.stringify({ schema: CLI_SCHEMA, command: 'check', references, errors, warnings: items.length - errors, items }, null, 2));
  } else {
    for (const item of items) io.out(`${item.file}:${item.line}:${item.column} ${item.severity} ${item.code} ${item.message}`);
    io.out(`参照 ${references}件、エラー ${errors}件、警告・情報 ${items.length - errors}件`);
  }
  return errors > 0 || (parsed.flags.has('strict') && items.length > 0) ? 1 : 0;
}

function position(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset).split('\n');
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

function lineText(text: string, line: number): string {
  return text.split('\n')[line] ?? '';
}

// ---------------------------------------------------------------------------

function render(parsed: Parsed, io: CliIo): number {
  const file = parsed.positional[0];
  if (!file) throw new UsageError('render には Markdown ファイルを指定してください。');
  const markdownFilePath = resolve(io, file);
  const workspaceRoot = flag(parsed, 'root') ? resolve(io, flag(parsed, 'root')!) : path.dirname(markdownFilePath);
  const text = fs.readFileSync(markdownFilePath, 'utf8');
  const format = flag(parsed, 'format') ?? 'md';
  let output: string;
  let failures = 0;
  if (format === 'html') {
    const md = new MarkdownIt({ html: true }).use(markdownMatrixPlugin, { markdownFilePath, workspaceRoot, cache: new WorkbookCache() });
    output = md.render(text);
    failures = (output.match(/class="mmi-error"/g) ?? []).length;
  } else if (format === 'md') {
    const expanded = expandToMarkdown(text, markdownFilePath, workspaceRoot);
    output = expanded.text;
    failures = expanded.failures;
  } else {
    throw new UsageError(`--format は md か html です: ${format}`);
  }
  const out = flag(parsed, 'out');
  if (out) fs.writeFileSync(resolve(io, out), output);
  else io.out(output);
  if (failures > 0) io.err(`mmi: ${failures}件の参照を表示できませんでした。`);
  return failures > 0 ? 1 : 0;
}

/**
 * Each reference becomes a plain Markdown table (or a note for a card or an
 * error), so an agent can read back what the document shows. Code fences are
 * left as they are.
 */
export function expandToMarkdown(text: string, markdownFilePath: string, workspaceRoot?: string): { text: string; failures: number } {
  const cache = new WorkbookCache<WorkbookData>();
  let failures = 0;
  let fence: string | undefined;
  const lines = text.split('\n').flatMap((line) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && (!fence || marker.startsWith(fence))) {
      fence = fence ? undefined : marker;
      return [line];
    }
    if (fence || !line.includes('![[')) return [line];
    const embeds = [...line.matchAll(EMBED)];
    const rest = embeds.reduce((remaining, match) => remaining.replace(match[0], ''), line).trim();
    const blocks = embeds.flatMap((match) => {
      const embed = parseEmbedSyntax(match[0]);
      if (!embed) return [match[0]];
      const outcome = evaluateEmbed(embed, { markdownFilePath, workspaceRoot, cache });
      if (outcome.kind === 'error') {
        failures += 1;
        return [`> MMIエラー: ${outcome.message}（${match[0]}）`];
      }
      if (outcome.kind === 'card') return [`> 別紙: ${embed.filepath}${embed.target ? ` / ${embed.target}` : ''}${embed.range ? ` ${embed.range}` : ''}（表が大きいため本文には載せません）`];
      const { headers, bodyRows } = outcome.logical;
      const width = Math.max(headers?.length ?? 0, ...bodyRows.map((row) => row.length), 1);
      const cell = (value: string | undefined): string => (value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
      const row = (cells: readonly string[] | undefined): string => `| ${Array.from({ length: width }, (_, i) => cell(cells?.[i])).join(' | ')} |`;
      return ['', row(headers ?? Array.from({ length: width }, () => '')), `|${' --- |'.repeat(width)}`, ...bodyRows.map(row), ''];
    });
    return [...(rest ? [rest] : []), ...blocks];
  });
  return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n'), failures };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = await runCli(process.argv.slice(2), {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
    cwd: process.cwd(),
  });
  process.exitCode = code;
}

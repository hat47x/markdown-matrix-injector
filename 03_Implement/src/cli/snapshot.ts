/**
 * `mmi snapshot`: シート／範囲を見た目のまま SVG へ書き出す（issue-0198）。
 *
 * 原本は読み取り専用で扱う。処理の前後で原本のダイジェストを比べ、変わっていれば失敗にする。
 * 出力は SVG だけで、同じ原本・シート・範囲・MMIの版からは同じバイト列になる。
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { renderSheetSvg, type SnapshotDiagnostic } from '../adapters/sheetSnapshot.js';
import { createSourceIdentityFromBytes } from '../core/sourceIdentity.js';

export interface SnapshotCommandOptions {
  sheet?: string;
  range?: string;
  out?: string;
  json?: boolean;
}

export interface SnapshotCommandIo {
  out(text: string): void;
  err(text: string): void;
  cwd: string;
}

export interface SnapshotSummary {
  source: string;
  output?: string;
  sheet: string;
  range?: string;
  width?: number;
  height?: number;
  renderer: string;
  sourceDigest?: string;
  svgDigest?: string;
  sourceUnchanged: boolean;
  diagnostics: SnapshotDiagnostic[];
}

const relativeTo = (cwd: string, target: string): string => path.relative(cwd, target).split(path.sep).join('/') || path.basename(target);

export function runSnapshot(args: string[], options: SnapshotCommandOptions, io: SnapshotCommandIo): number {
  if (args.length !== 1) return usage(io, 'snapshot takes one workbook (.xlsx / .xlsm)');
  if (!options.sheet) return usage(io, 'snapshot needs --sheet <name>');
  if (!options.out) return usage(io, 'snapshot needs -o, --out <file.svg>');
  const sourcePath = path.resolve(io.cwd, args[0]);
  const outputPath = path.resolve(io.cwd, options.out);
  if (sourcePath === outputPath) return usage(io, 'snapshot output must differ from the source workbook');

  const summary: SnapshotSummary = {
    source: relativeTo(io.cwd, sourcePath),
    sheet: options.sheet,
    renderer: '',
    sourceUnchanged: true,
    diagnostics: [],
  };
  const finish = (code: number): number => {
    if (options.json) io.out(JSON.stringify(summary, null, 2));
    else {
      for (const item of summary.diagnostics) {
        io.err(`mmi: ${item.code}${item.at ? ` (${item.at})` : ''}${item.count && item.count > 1 ? ` x${item.count}` : ''}: ${item.message}`);
      }
      if (summary.output) io.out(`snapshot: ${summary.output} (${summary.sheet}!${summary.range}, ${summary.width}x${summary.height}px, ${summary.renderer})`);
    }
    return code;
  };

  let before: Buffer;
  try {
    before = fs.readFileSync(sourcePath);
  } catch (error) {
    summary.diagnostics.push({ code: 'MMI_SNAPSHOT_SOURCE_UNREADABLE', severity: 'error', message: `原本を読めません: ${error instanceof Error ? error.message : String(error)}` });
    return finish(1);
  }
  const beforeDigest = createSourceIdentityFromBytes(before).digest;
  const result = renderSheetSvg({ bytes: before, sheet: options.sheet, ...(options.range !== undefined ? { range: options.range } : {}), sourceLabel: path.basename(sourcePath) });
  summary.renderer = result.renderer;
  summary.sourceDigest = result.sourceDigest;
  summary.diagnostics = result.diagnostics;
  if (result.range) summary.range = result.range;
  if (result.width !== undefined) summary.width = result.width;
  if (result.height !== undefined) summary.height = result.height;

  // 原本が処理の前後で変わっていないことを確かめる（読み取り専用の確認）。
  let afterDigest: string | undefined;
  try {
    afterDigest = createSourceIdentityFromBytes(fs.readFileSync(sourcePath)).digest;
  } catch {
    afterDigest = undefined;
  }
  if (afterDigest !== beforeDigest) {
    summary.sourceUnchanged = false;
    summary.diagnostics.push({ code: 'MMI_SNAPSHOT_SOURCE_CHANGED', severity: 'error', message: '処理中に原本が変わりました。描いた結果は書き出していません' });
    return finish(1);
  }
  if (!result.svg || result.diagnostics.some((item) => item.severity === 'error')) return finish(1);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, result.svg);
  summary.output = relativeTo(io.cwd, outputPath);
  summary.svgDigest = `sha256:${createHash('sha256').update(result.svg).digest('hex')}`;
  return finish(0);
}

function usage(io: SnapshotCommandIo, message: string): number {
  io.err(`mmi: ${message}\n\nUsage: mmi snapshot <book.xlsx> --sheet <name> [--range A1:F20] -o <out.svg> [--json]`);
  return 2;
}

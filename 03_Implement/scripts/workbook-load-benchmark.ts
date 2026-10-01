/**
 * Separates workbook filesystem I/O from decode/parse/SheetSource construction.
 *
 * Important: this process does NOT evict the OS page cache. initialReadMs
 * means only the first read issued by this benchmark process for that file;
 * it must not be reported as an OS-cold measurement.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { loadWorkbook, loadWorkbookFromBytes, type WorkbookData } from '../src/core/workbookLoader.js';

const SUPPORTED_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv', '.xml']);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const defaultInput = path.join(repoRoot, '04_Documentation/samples/practical/data');

interface Options {
  inputs: string[];
  iterations: number;
  warmup: number;
  output?: string;
}

interface Distribution {
  samples: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  meanMs: number;
}

function parseArgs(argv: readonly string[]): Options {
  const inputs: string[] = [];
  let iterations = 10;
  let warmup = 2;
  let output: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--iterations' || arg === '--warmup' || arg === '--out') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(arg + ' requires a value.');
      i += 1;
      if (arg === '--out') {
        output = path.resolve(value);
      } else {
        const parsed = Number.parseInt(value, 10);
        const minimum = arg === '--iterations' ? 1 : 0;
        if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(arg + ' must be >= ' + minimum + '.');
        if (arg === '--iterations') iterations = parsed;
        else warmup = parsed;
      }
      continue;
    }
    if (arg.startsWith('--')) throw new Error('Unknown argument: ' + arg);
    inputs.push(path.resolve(arg));
  }

  return { inputs: inputs.length > 0 ? inputs : [defaultInput], iterations, warmup, ...(output ? { output } : {}) };
}

function collectFiles(inputs: readonly string[]): string[] {
  const files: string[] = [];
  const visit = (target: string): void => {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(target).sort()) visit(path.join(target, name));
      return;
    }
    if (stat.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(target).toLowerCase())) files.push(path.resolve(target));
  };
  for (const input of inputs) visit(input);
  return [...new Set(files)].sort();
}

function timed<T>(fn: () => T): { value: T; ms: number } {
  const started = performance.now();
  const value = fn();
  return { value, ms: performance.now() - started };
}

function samples(iterations: number, fn: () => unknown): number[] {
  return Array.from({ length: iterations }, () => timed(fn).ms);
}

function warm(warmup: number, fn: () => unknown): void {
  for (let i = 0; i < warmup; i += 1) fn();
}

function distribution(values: readonly number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
  const round = (value: number): number => Math.round(value * 1000) / 1000;
  return {
    samples: values.length,
    minMs: round(sorted[0] ?? 0),
    p50Ms: round(percentile(0.5)),
    p95Ms: round(percentile(0.95)),
    maxMs: round(sorted.at(-1) ?? 0),
    meanMs: round(values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)),
  };
}

function workbookShape(workbook: WorkbookData): { sheets: number; usedCells: number } {
  let usedCells = 0;
  for (const sheet of Object.values(workbook.sheets)) {
    const range = sheet.usedRange;
    if (!range) continue;
    usedCells += Math.max(0, range.endRow - range.startRow + 1) * Math.max(0, range.endCol - range.startCol + 1);
  }
  return { sheets: Object.keys(workbook.sheets).length, usedCells };
}

export function main(argv = process.argv.slice(2)): Record<string, unknown> {
  const options = parseArgs(argv);
  const files = collectFiles(options.inputs);
  if (files.length === 0) throw new Error('No supported workbook files found.');

  const results = files.map((file) => {
    const initialRead = timed(() => fs.readFileSync(file));
    const initialModel = timed(() => loadWorkbookFromBytes(file, initialRead.value));

    warm(options.warmup, () => fs.readFileSync(file));
    const warmRead = samples(options.iterations, () => fs.readFileSync(file));

    warm(options.warmup, () => loadWorkbookFromBytes(file, initialRead.value));
    const modelBuild = samples(options.iterations, () => loadWorkbookFromBytes(file, initialRead.value));

    warm(options.warmup, () => loadWorkbook({ absolutePath: file }));
    const endToEnd = samples(options.iterations, () => loadWorkbook({ absolutePath: file }));

    return {
      file: path.relative(repoRoot, file).split(path.sep).join('/'),
      extension: path.extname(file).toLowerCase(),
      fileBytes: initialRead.value.byteLength,
      ...workbookShape(initialModel.value),
      initialReadMs: Math.round(initialRead.ms * 1000) / 1000,
      initialModelBuildMs: Math.round(initialModel.ms * 1000) / 1000,
      warmRead: distribution(warmRead),
      modelBuildFromBytes: distribution(modelBuild),
      endToEndWithoutWorkbookCache: distribution(endToEnd),
    };
  });

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      cpuCount: os.cpus().length,
      cacheState:
        'OS page cache is uncontrolled. initialReadMs is only the first read by this benchmark process, not proof of an OS-cold read.',
      workbookCache: 'disabled for end-to-end samples',
    },
    options: {
      iterations: options.iterations,
      warmup: options.warmup,
      inputs: options.inputs.map((input) => path.relative(repoRoot, input) || '.'),
    },
    files: results,
  };

  const json = JSON.stringify(report, null, 2) + '\n';
  if (options.output) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, json, 'utf8');
  }
  process.stdout.write(json);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

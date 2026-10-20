#!/usr/bin/env node
/**
 * Reusable CI runner for MMI (issue #526).
 *
 * It runs `mmi check` and `mmi provenance` against a user's workspace, writes a
 * compact GitHub Step Summary, and fails the job only for the conditions the
 * caller explicitly names. Nothing in the source workspace is written; the
 * only write is the summary file / GITHUB_STEP_SUMMARY.
 *
 * The script is dependency-free so it can ship with the action and run on a
 * stock Node runner.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SKIP_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'artifacts',
  'dist',
  'coverage',
  '.venv',
  'venv',
]);

export function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    paths: [],
    ledger: 'mmi-ledger.json',
    reviewBasis: 'mmi-review-basis.json',
    failOn: ['diagnostics', 'review-stale', 'missing'],
    mmi: 'mmi',
    mmiArgs: [],
    json: false,
    summary: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${argument} needs a value`);
      return argv[index];
    };
    switch (argument) {
      case '--root': options.root = next(); break;
      case '--paths': options.paths.push(next()); break;
      case '--ledger': options.ledger = next(); break;
      case '--review-basis': options.reviewBasis = next(); break;
      case '--fail-on':
        options.failOn = next().split(',').map((item) => item.trim()).filter(Boolean);
        break;
      case '--mmi': options.mmi = next(); break;
      case '--mmi-arg': options.mmiArgs.push(next()); break;
      case '--json': options.json = true; break;
      case '--summary': options.summary = next(); break;
      case '--help':
        options.help = true;
        break;
      default:
        throw new Error(`unknown argument: ${argument}`);
    }
  }
  const choices = new Set(['diagnostics', 'stale', 'review-stale', 'missing']);
  for (const choice of options.failOn) {
    if (!choices.has(choice)) {
      throw new Error(`--fail-on accepts diagnostics, stale, review-stale, missing (got ${choice})`);
    }
  }
  if (options.paths.length === 0) options.paths.push('.');
  return options;
}

export function discoverMarkdown(targets, root) {
  const documents = [];
  const walk = (target) => {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) return;
    if (stat.isFile()) {
      if (/\.md$/iu.test(target)) documents.push(target);
      return;
    }
    if (!stat.isDirectory()) return;
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
      walk(path.join(target, entry.name));
    }
  };
  for (const target of targets) {
    const absolute = path.resolve(root, target);
    if (!fs.existsSync(absolute)) throw new Error(`path does not exist: ${target}`);
    walk(absolute);
  }
  return [...new Set(documents)].sort();
}

function runMmi(options, args) {
  const result = spawnSync(options.mmi, [...options.mmiArgs, ...args], {
    cwd: options.root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function parseJson(name, result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(
      `${name} did not return JSON (exit ${result.status}): ${result.stderr || result.stdout}`,
    );
  }
}

const MAX_DETAILS = 100;

export function evaluate({ check, reports, documents, failOn }) {
  const summary = {
    documents: documents.length,
    checkErrors: check.errors,
    checkProblems: check.problems.length,
    extractedStale: 0,
    reviewStale: 0,
    reviewUnrecorded: 0,
    missingSources: 0,
    reportFailures: 0,
  };
  const diagnostics = [];
  const staleExtracted = [];
  const staleReviews = [];
  for (const report of reports) {
    if (report.error) {
      summary.reportFailures += 1;
      diagnostics.push({
        file: report.document,
        line: 1,
        column: 1,
        code: 'MMI_CI_PROVENANCE_FAILED',
        message: report.error,
      });
      continue;
    }
    summary.extractedStale += report.data.summary.stale;
    summary.reviewStale += report.data.summary.reviewStale;
    summary.reviewUnrecorded += report.data.summary.reviewUnrecorded;
    summary.missingSources += report.data.summary.missingSources;
    for (const problem of report.data.diagnostics) diagnostics.push(problem);
    for (const item of report.data.extracted) {
      if (item.freshness !== 'fresh') {
        staleExtracted.push({
          file: report.document,
          line: item.line,
          source: item.source,
          freshness: item.freshness,
          place: item.place,
        });
      }
    }
    for (const item of report.data.review.references) {
      if (item.status !== 'fresh') {
        staleReviews.push({
          file: report.document,
          line: 1,
          reference: item.reference,
          status: item.status,
        });
      }
    }
  }
  for (const problem of check.problems) diagnostics.push(problem);

  const failures = [];
  if (failOn.includes('diagnostics') && (check.errors > 0 || summary.reportFailures > 0)) {
    failures.push('diagnostics');
  }
  if (failOn.includes('stale') && summary.extractedStale > 0) failures.push('stale');
  if (failOn.includes('review-stale') && summary.reviewStale > 0) failures.push('review-stale');
  if (failOn.includes('missing') && summary.missingSources > 0) failures.push('missing');
  return {
    failed: failures.length > 0,
    failures,
    summary,
    diagnostics: diagnostics.slice(0, MAX_DETAILS),
    staleExtracted: staleExtracted.slice(0, MAX_DETAILS),
    staleReviews: staleReviews.slice(0, MAX_DETAILS),
  };
}

export function renderSummary(result) {
  const lines = [];
  lines.push('# MMI check');
  lines.push('');
  lines.push('| item | count |');
  lines.push('| --- | ---: |');
  lines.push(`| Markdown documents | ${result.summary.documents} |`);
  lines.push(`| Reference errors | ${result.summary.checkErrors} |`);
  lines.push(`| Diagnostics (all) | ${result.summary.checkProblems} |`);
  lines.push(`| Extracted assets changed/stale | ${result.summary.extractedStale} |`);
  lines.push(`| Linked prose needing review | ${result.summary.reviewStale} |`);
  lines.push(`| Linked references without a review basis | ${result.summary.reviewUnrecorded} |`);
  lines.push(`| Sources missing | ${result.summary.missingSources} |`);
  lines.push('');
  if (result.failed) {
    lines.push(`**Failed by:** ${result.failures.join(', ')}`);
  } else {
    lines.push('**No selected failure conditions.**');
  }
  lines.push('');
  lines.push('## Diagnostics');
  if (result.diagnostics.length === 0) {
    lines.push('なし');
  } else {
    lines.push('| file:line | code | message |');
    lines.push('| --- | --- | --- |');
    for (const item of result.diagnostics) {
      lines.push(
        `| ${item.file}:${item.line}:${item.column} | ${item.code} | ${String(item.message).replace(/\|/gu, '\\|')} |`,
      );
    }
  }
  lines.push('');
  lines.push('## Extracted assets');
  if (result.staleExtracted.length === 0) {
    lines.push('なし');
  } else {
    lines.push('| file:line | source | place | freshness |');
    lines.push('| --- | --- | --- | --- |');
    for (const item of result.staleExtracted) {
      lines.push(
        `| ${item.file}:${item.line} | ${item.source} | ${item.place ?? ''} | ${item.freshness} |`,
      );
    }
  }
  lines.push('');
  lines.push('## Linked prose');
  if (result.staleReviews.length === 0) {
    lines.push('なし');
  } else {
    lines.push('| file | reference | status |');
    lines.push('| --- | --- | --- |');
    for (const item of result.staleReviews) {
      lines.push(`| ${item.file} | ${item.reference} | ${item.status} |`);
    }
  }
  lines.push('');
  lines.push(
    'This report is read-only. It does not rewrite sources, the ledger, the review basis or Markdown.',
  );
  return `${lines.join('\n')}\n`;
}

export function runMmiCi(options) {
  const root = path.resolve(options.root);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`workspace root is not a directory: ${options.root}`);
  }
  const documents = discoverMarkdown(options.paths, root);
  const checkResult = runMmi(options, [
    'check', ...options.paths, '--root', root, '--json',
  ]);
  if (checkResult.status !== 0 && !checkResult.stdout.trim()) {
    throw new Error(`mmi check failed (exit ${checkResult.status}): ${checkResult.stderr}`);
  }
  const check = parseJson('mmi check', checkResult);

  const reports = documents.map((document) => {
    const result = runMmi(options, [
      'provenance', document,
      '--root', root,
      '--ledger', options.ledger,
      '--review-basis', options.reviewBasis,
      '--json',
    ]);
    if (result.status !== 0 || !result.stdout.trim()) {
      return {
        document: path.relative(root, document).split(path.sep).join('/'),
        error: result.stderr.trim() || `mmi provenance exited ${result.status}`,
      };
    }
    try {
      return {
        document: path.relative(root, document).split(path.sep).join('/'),
        data: JSON.parse(result.stdout),
      };
    } catch {
      return {
        document: path.relative(root, document).split(path.sep).join('/'),
        error: 'mmi provenance did not return JSON',
      };
    }
  });

  const result = evaluate({ check, reports, documents, failOn: options.failOn });
  const markdown = renderSummary(result);
  if (options.summary) {
    fs.mkdirSync(path.dirname(path.resolve(options.summary)), { recursive: true });
    fs.writeFileSync(options.summary, markdown);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  }
  if (!options.summary && !process.env.GITHUB_STEP_SUMMARY) {
    process.stdout.write(markdown);
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      failed: result.failed,
      failures: result.failures,
      summary: result.summary,
    }, null, 2)}\n`);
  }
  return result.failed ? 1 : 0;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(
        'Usage: mmi-ci.mjs [--root DIR] [--paths PATH]... [--ledger FILE]\n'
        + '                   [--review-basis FILE] [--fail-on LIST] [--mmi COMMAND]\n'
        + '                   [--mmi-arg ARG]... [--json] [--summary FILE]\n',
      );
      return 0;
    }
    return runMmiCi(options);
  } catch (error) {
    console.error(`mmi-ci: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}

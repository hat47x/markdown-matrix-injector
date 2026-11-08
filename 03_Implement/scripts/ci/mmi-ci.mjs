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
    expectCommit: undefined,
    expectLockDigest: undefined,
    expectNodeMajor: undefined,
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
      case '--expect-commit': options.expectCommit = next(); break;
      case '--expect-lock-digest': options.expectLockDigest = next(); break;
      case '--expect-node-major': options.expectNodeMajor = next(); break;
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
  if (options.expectCommit !== undefined && !/^[0-9a-f]{40}$/u.test(options.expectCommit)) {
    throw new Error(`--expect-commit needs a 40-digit lowercase hex commit (got ${options.expectCommit})`);
  }
  if (options.expectLockDigest !== undefined && !/^sha256:[0-9a-f]{64}$/u.test(options.expectLockDigest)) {
    throw new Error(`--expect-lock-digest needs sha256:<64 hex digits> (got ${options.expectLockDigest})`);
  }
  if (options.expectNodeMajor !== undefined) {
    if (!/^[1-9][0-9]*$/u.test(String(options.expectNodeMajor))) {
      throw new Error(`--expect-node-major needs a positive integer (got ${options.expectNodeMajor})`);
    }
    options.expectNodeMajor = Number(options.expectNodeMajor);
  }
  return options;
}

/**
 * Asks the MMI under test which build it is (`mmi --version --json`, #691).
 * Returns `{ status: 'ok', identity }` or `{ status: 'unavailable', reason }`;
 * it never throws, so a runner that cannot report its build (an old tarball,
 * `npx`, a fake) is recorded instead of crashing the job.
 */
export function readBuildIdentity(options) {
  let result;
  try {
    result = runMmi(options, ['--version', '--json']);
  } catch (error) {
    return { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) };
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return {
      status: 'unavailable',
      reason: `mmi --version --json did not return JSON (exit ${result.status})`,
    };
  }
  if (result.status !== 0 || !parsed || typeof parsed !== 'object' || parsed.schema !== 'mmi.build-identity/v1') {
    return {
      status: 'unavailable',
      reason: `mmi --version --json did not return mmi.build-identity/v1 (exit ${result.status})`,
    };
  }
  return {
    status: 'ok',
    identity: {
      version: typeof parsed.version === 'string' ? parsed.version : null,
      commit: typeof parsed.commit === 'string' ? parsed.commit : null,
      lockfileDigest: typeof parsed.lockfileDigest === 'string' ? parsed.lockfileDigest : null,
      dirty: typeof parsed.dirty === 'boolean' ? parsed.dirty : null,
      nodeMajor: Number.isInteger(parsed.node?.major) ? parsed.node.major : null,
      distribution: typeof parsed.distribution === 'string' ? parsed.distribution : null,
    },
  };
}

/**
 * Compares the reported build with the caller's expectations. With no
 * expectation the build is simply "unpinned". With one, anything that cannot
 * be confirmed (no identity, a null field, uncommitted changes under a commit
 * pin) counts as a mismatch: a pin that cannot be checked is not a pin.
 */
export function checkVersionPin(build, options) {
  const expectations = [
    ['commit', options.expectCommit],
    ['lockfileDigest', options.expectLockDigest],
    ['nodeMajor', options.expectNodeMajor],
  ].filter(([, value]) => value !== undefined);
  if (expectations.length === 0) return { pinned: false, mismatches: [] };
  const mismatches = [];
  if (build.status !== 'ok') {
    for (const [field, expected] of expectations) {
      mismatches.push({ field, expected, actual: null, reason: `build identity unavailable: ${build.reason}` });
    }
    return { pinned: true, mismatches };
  }
  for (const [field, expected] of expectations) {
    const actual = build.identity[field];
    if (actual === null) {
      mismatches.push({ field, expected, actual: null, reason: 'mmi did not report this value' });
    } else if (actual !== expected) {
      mismatches.push({ field, expected, actual, reason: 'differs from the expected value' });
    }
  }
  if (options.expectCommit !== undefined && build.identity.dirty === true) {
    mismatches.push({
      field: 'dirty', expected: false, actual: true,
      reason: 'the build has uncommitted changes, so the commit does not identify it',
    });
  }
  return { pinned: true, mismatches };
}

const cell = (value) => String(value).replace(/\|/gu, '\\|');

export function renderBuildSection(build, pin) {
  const lines = ['## MMI build', ''];
  if (build.status === 'ok') {
    const id = build.identity;
    const show = (value) => (value === null || value === undefined ? '不明' : cell(value));
    lines.push('| item | value |', '| --- | --- |');
    lines.push(`| version | ${show(id.version)} |`);
    lines.push(`| commit | ${show(id.commit)} |`);
    lines.push(`| lockfile digest | ${show(id.lockfileDigest)} |`);
    lines.push(`| Node.js major | ${show(id.nodeMajor)} |`);
    lines.push(`| distribution | ${show(id.distribution)} |`);
    lines.push(`| uncommitted changes | ${id.dirty === null ? '不明' : id.dirty ? 'あり' : 'なし'} |`);
  } else {
    lines.push(`MMIのビルド識別を取得できませんでした: ${cell(build.reason)}`);
  }
  lines.push('');
  if (!pin.pinned) {
    lines.push('**版は未固定**（`expect-commit`・`expect-lock-digest`・`expect-node-major` のいずれも未指定）。');
  } else if (pin.mismatches.length === 0) {
    lines.push('**版の固定: 一致**');
  } else {
    lines.push('**版の固定: 不一致。検査を実行していません。**', '');
    lines.push('| field | expected | actual | reason |', '| --- | --- | --- | --- |');
    for (const item of pin.mismatches) {
      lines.push(`| ${item.field} | ${cell(item.expected)} | ${item.actual === null ? '不明' : cell(item.actual)} | ${cell(item.reason)} |`);
    }
  }
  lines.push('');
  return lines.join('\n');
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
  if (result.buildSection) lines.push(result.buildSection);
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
  // Identify the MMI before it checks anything: a pin mismatch must stop the run.
  const build = readBuildIdentity(options);
  const pin = checkVersionPin(build, options);
  const buildSection = renderBuildSection(build, pin);
  if (pin.mismatches.length > 0) {
    return finish({
      options,
      markdown: `# MMI check\n\n${buildSection}`,
      json: { failed: true, failures: ['version-pin'], build, versionPin: pin },
      failed: true,
    });
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
  return finish({
    options,
    markdown: renderSummary({ ...result, buildSection }),
    json: {
      failed: result.failed,
      failures: result.failures,
      summary: result.summary,
      build,
      versionPin: pin,
    },
    failed: result.failed,
  });
}

function finish({ options, markdown, json, failed }) {
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
    process.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
  }
  return failed ? 1 : 0;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(
        'Usage: mmi-ci.mjs [--root DIR] [--paths PATH]... [--ledger FILE]\n'
        + '                   [--review-basis FILE] [--fail-on LIST] [--mmi COMMAND]\n'
        + '                   [--mmi-arg ARG]... [--json] [--summary FILE]\n'
        + '                   [--expect-commit SHA] [--expect-lock-digest sha256:HEX]\n'
        + '                   [--expect-node-major N]\n',
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

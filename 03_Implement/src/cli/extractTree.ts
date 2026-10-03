import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  canonicalJsonValue,
  decodeJsonPointer,
  readJsonTree,
  resolveJsonPointer,
  type JsonValue,
} from '../adapters/jsonTreeAdapter.js';
import { entryFor, recordEntries } from '../core/importLedger.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';

export interface ExtractTreeOptions {
  sourcePath: string;
  /** RFC 6901 JSON Pointer. The document root is the empty string. */
  pointer: string;
  outDir: string;
  fromDocument?: string;
  sourceLabel?: string;
  ledgerPath?: string;
}

export interface ExtractedTree {
  pointer: string;
  digest: string;
  candidateFingerprint: string;
  file: string;
  status: 'written' | 'unchanged';
  markdown: string;
}

export interface ExtractTreeProblem {
  code: string;
  message: string;
}

export interface ExtractTreeResult {
  extracted?: ExtractedTree;
  problems: ExtractTreeProblem[];
}

const sha256 = (data: Buffer): string =>
  `sha256:${createHash('sha256').update(data).digest('hex')}`;

function provenanceValue(text: string): string {
  return text
    .replace(/--/gu, '- -')
    .replace(/"/gu, "'")
    .replace(/[\r\n]+/gu, ' ');
}

function objectEntries(value: { [key: string]: JsonValue }): [string, JsonValue][] {
  return Object.keys(value)
    .sort()
    .map((key) => [key, value[key]]);
}

function renderLabel(text: string): string {
  return JSON.stringify(text);
}

function renderNestedList(
  value: JsonValue,
  label: string,
  depth = 0,
): string[] {
  const indent = '  '.repeat(depth);
  if (Array.isArray(value)) {
    return [
      `${indent}- ${label} (array)`,
      ...value.flatMap((child, index) =>
        renderNestedList(child, `[${index}]`, depth + 1)),
    ];
  }
  if (value !== null && typeof value === 'object') {
    const record = value as { [key: string]: JsonValue };
    return [
      `${indent}- ${label} (object)`,
      ...objectEntries(record).flatMap(([key, child]) =>
        renderNestedList(child, renderLabel(key), depth + 1)),
    ];
  }
  return [
    `${indent}- ${label}: ${canonicalJsonValue(value)}`,
  ];
}

function rootLabel(pointer: string): string {
  const tokens = decodeJsonPointer(pointer);
  if (tokens.length === 0) return 'root';
  const last = tokens[tokens.length - 1];
  return /^(0|[1-9][0-9]*)$/u.test(last)
    ? `[${last}]`
    : renderLabel(last);
}

function provenanceComment(
  source: string,
  pointer: string,
  sourceDigest: string,
  candidateFingerprint: string,
): string {
  return `<!-- mmi:extracted-tree source="${provenanceValue(source)}" path="${provenanceValue(pointer)}" source-sha256="${sourceDigest.slice(7)}" candidate-sha256="${candidateFingerprint.slice(7)}" projection="json-nested-list-v1" -->`;
}

export function extractJsonTree(
  options: ExtractTreeOptions,
): ExtractTreeResult {
  const result: ExtractTreeResult = { problems: [] };
  if (!/\.json$/iu.test(options.sourcePath)) {
    result.problems.push({
      code: 'MMI_TREE_SOURCE_UNSUPPORTED',
      message: 'tree extraction currently supports JSON sources only',
    });
    return result;
  }

  const sourceBytes = fs.readFileSync(options.sourcePath);
  const sourceDigest = readSourceFileIdentity(options.sourcePath).digest;
  const documentDirectory = path.dirname(
    path.resolve(
      options.fromDocument ?? path.join(process.cwd(), 'x.md'),
    ),
  );
  const source = options.sourceLabel
    ?? (
      path.relative(documentDirectory, options.sourcePath)
        .split(path.sep)
        .join('/')
      || path.basename(options.sourcePath)
    );

  let tree;
  try {
    tree = readJsonTree(sourceBytes.toString('utf8'), source, sourceDigest);
  } catch (error) {
    result.problems.push({
      code: 'MMI_TREE_JSON_INVALID',
      message: error instanceof Error ? error.message : String(error),
    });
    return result;
  }

  const candidate = tree.candidates.find(
    (item) => item.locator.structuralPath === options.pointer,
  );
  const subtree = resolveJsonPointer(tree.value, options.pointer);
  if (!candidate || subtree === undefined) {
    result.problems.push({
      code: 'MMI_TREE_CANDIDATE_NOT_FOUND',
      message:
        `no Tree Candidate at JSON Pointer ${options.pointer || '(root)'}; run \`mmi inspect\` to list detected Tree Candidates`,
    });
    return result;
  }

  const nested = renderNestedList(
    subtree,
    rootLabel(options.pointer),
  ).join('\n');
  const assetText =
    nested
    + '\n\n'
    + provenanceComment(
      source,
      options.pointer,
      sourceDigest,
      candidate.fingerprint.digest,
    )
    + '\n';
  const data = Buffer.from(assetText, 'utf8');
  const digest = sha256(data);

  fs.mkdirSync(options.outDir, { recursive: true });
  const outDirectory = fs.realpathSync(options.outDir);
  const sourceReal = fs.realpathSync(options.sourcePath);
  const file = path.join(
    outDirectory,
    `tree-${digest.slice(7, 19)}.md`,
  );
  if (file === sourceReal) {
    result.problems.push({
      code: 'MMI_EXTRACT_TARGET_IS_SOURCE',
      message: 'refusing to write over the source document',
    });
    return result;
  }

  let status: ExtractedTree['status'] = 'written';
  if (fs.existsSync(file)) {
    if (sha256(fs.readFileSync(file)) !== digest) {
      result.problems.push({
        code: 'MMI_EXTRACT_NAME_COLLISION',
        message: `${file} exists with different content; it was not overwritten`,
      });
      return result;
    }
    status = 'unchanged';
  } else {
    fs.writeFileSync(file, data);
  }

  result.extracted = {
    pointer: options.pointer,
    digest,
    candidateFingerprint: candidate.fingerprint.digest,
    file,
    status,
    markdown: assetText.trimEnd(),
  };

  if (options.ledgerPath) {
    recordEntries(options.ledgerPath, [
      entryFor(
        options.ledgerPath,
        options.sourcePath,
        candidate,
        file,
        'mmi extract --tree',
        {
          mode: 'json-nested-list-v1',
          pointer: options.pointer,
        },
      ),
    ]);
  }

  return result;
}

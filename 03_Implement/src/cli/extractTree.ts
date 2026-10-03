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
import {
  readXmlTree,
  resolveXmlElement,
  type XmlElement,
} from '../adapters/xmlTreeAdapter.js';
import type { Candidate } from '../core/candidate.js';
import { entryFor, recordEntries } from '../core/importLedger.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';
import { isXmlSpreadsheet2003Text } from '../core/workbookLoader.js';

export interface ExtractTreeOptions {
  sourcePath: string;
  /** RFC 6901 JSON Pointer. The document root is the empty string. */
  pointer: string;
  outDir: string;
  fromDocument?: string;
  sourceLabel?: string;
  ledgerPath?: string;
}

export interface ExtractXmlTreeOptions {
  sourcePath: string;
  /** Deterministic XML element path, or `root` for the document element. */
  structuralPath: string;
  outDir: string;
  fromDocument?: string;
  sourceLabel?: string;
  ledgerPath?: string;
}

export interface ExtractTreeSelectionOptions {
  sourcePath: string;
  /** JSON Pointer / XML structural path; `root` means the document root. */
  selector: string;
  outDir: string;
  fromDocument?: string;
  sourceLabel?: string;
  ledgerPath?: string;
}

export interface ExtractedTree {
  format: 'json' | 'xml';
  structuralPath: string;
  /** Compatibility alias for JSON callers. */
  pointer?: string;
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

function renderJsonNestedList(
  value: JsonValue,
  label: string,
  depth = 0,
): string[] {
  const indent = '  '.repeat(depth);
  if (Array.isArray(value)) {
    return [
      `${indent}- ${label} (array)`,
      ...value.flatMap((child, index) =>
        renderJsonNestedList(child, `[${index}]`, depth + 1)),
    ];
  }
  if (value !== null && typeof value === 'object') {
    const record = value as { [key: string]: JsonValue };
    return [
      `${indent}- ${label} (object)`,
      ...objectEntries(record).flatMap(([key, child]) =>
        renderJsonNestedList(child, renderLabel(key), depth + 1)),
    ];
  }
  return [
    `${indent}- ${label}: ${canonicalJsonValue(value)}`,
  ];
}

function renderXmlNestedList(
  element: XmlElement,
  depth = 0,
): string[] {
  const indent = '  '.repeat(depth);
  const lines = [`${indent}- <${element.name}>`];
  for (const [name, value] of Object.entries(element.attributes)
    .sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`${indent}  - @${name}: ${JSON.stringify(value)}`);
  }
  for (const item of element.content) {
    if (item.kind === 'text') {
      if (item.value.trim().length > 0) {
        lines.push(`${indent}  - #text: ${JSON.stringify(item.value)}`);
      }
    } else {
      lines.push(...renderXmlNestedList(item.element, depth + 1));
    }
  }
  return lines;
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
  structuralPath: string,
  sourceDigest: string,
  candidateFingerprint: string,
  projection: string,
): string {
  return `<!-- mmi:extracted-tree source="${provenanceValue(source)}" path="${provenanceValue(structuralPath)}" source-sha256="${sourceDigest.slice(7)}" candidate-sha256="${candidateFingerprint.slice(7)}" projection="${projection}" -->`;
}

export function extractTree(
  options: ExtractTreeSelectionOptions,
): ExtractTreeResult {
  const extension = path.extname(options.sourcePath).toLowerCase();
  if (extension === '.json') {
    return extractJsonTree({
      ...options,
      pointer: options.selector === 'root' ? '' : options.selector,
    });
  }
  if (extension === '.xml') {
    return extractXmlTree({
      ...options,
      structuralPath: options.selector,
    });
  }
  return {
    problems: [{
      code: 'MMI_TREE_SOURCE_UNSUPPORTED',
      message: 'tree extraction supports JSON and generic UTF-8 XML sources',
    }],
  };
}

export function extractJsonTree(
  options: ExtractTreeOptions,
): ExtractTreeResult {
  const result: ExtractTreeResult = { problems: [] };
  if (!/\.json$/iu.test(options.sourcePath)) {
    result.problems.push({
      code: 'MMI_TREE_SOURCE_UNSUPPORTED',
      message: 'JSON Tree extraction requires a .json source',
    });
    return result;
  }

  const sourceBytes = fs.readFileSync(options.sourcePath);
  const sourceDigest = readSourceFileIdentity(options.sourcePath).digest;
  const source = sourceLabel(options, options.sourcePath);

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

  const nested = renderJsonNestedList(
    subtree,
    rootLabel(options.pointer),
  ).join('\n');
  return writeTreeAsset({
    options,
    candidate,
    format: 'json',
    structuralPath: options.pointer,
    pointer: options.pointer,
    projection: 'json-nested-list-v1',
    conversion: {
      mode: 'json-nested-list-v1',
      pointer: options.pointer,
    },
    nested,
    source,
    sourceDigest,
  });
}

export function extractXmlTree(
  options: ExtractXmlTreeOptions,
): ExtractTreeResult {
  const result: ExtractTreeResult = { problems: [] };
  if (!/\.xml$/iu.test(options.sourcePath)) {
    result.problems.push({
      code: 'MMI_TREE_SOURCE_UNSUPPORTED',
      message: 'XML Tree extraction requires a .xml source',
    });
    return result;
  }

  const sourceBytes = fs.readFileSync(options.sourcePath);
  const xml = sourceBytes.toString('utf8');
  if (isXmlSpreadsheet2003Text(xml)) {
    result.problems.push({
      code: 'MMI_TREE_XML_SPREADSHEET',
      message:
        'XML Spreadsheet 2003 remains a table source; use inspect/extract --table instead of Tree extraction',
    });
    return result;
  }

  const sourceDigest = readSourceFileIdentity(options.sourcePath).digest;
  const source = sourceLabel(options, options.sourcePath);

  let tree;
  try {
    tree = readXmlTree(xml, source, sourceDigest);
  } catch (error) {
    result.problems.push({
      code: 'MMI_TREE_XML_INVALID',
      message: error instanceof Error ? error.message : String(error),
    });
    return result;
  }

  const structuralPath = options.structuralPath === 'root'
    ? tree.nodes[0]?.path
    : options.structuralPath;
  if (!structuralPath) {
    result.problems.push({
      code: 'MMI_TREE_CANDIDATE_NOT_FOUND',
      message: 'generic XML source has no root Tree Candidate',
    });
    return result;
  }

  const candidate = tree.candidates.find(
    (item) => item.locator.structuralPath === structuralPath,
  );
  const subtree = resolveXmlElement(tree, structuralPath);
  if (!candidate || !subtree) {
    result.problems.push({
      code: 'MMI_TREE_CANDIDATE_NOT_FOUND',
      message:
        `no Tree Candidate at XML path ${structuralPath}; run \`mmi inspect\` to list detected Tree Candidates`,
    });
    return result;
  }

  return writeTreeAsset({
    options,
    candidate,
    format: 'xml',
    structuralPath,
    projection: 'xml-nested-list-v1',
    conversion: {
      mode: 'xml-nested-list-v1',
      structuralPath,
    },
    nested: renderXmlNestedList(subtree).join('\n'),
    source,
    sourceDigest,
  });
}

function sourceLabel(
  options: {
    fromDocument?: string;
    sourceLabel?: string;
  },
  sourcePath: string,
): string {
  const documentDirectory = path.dirname(
    path.resolve(
      options.fromDocument ?? path.join(process.cwd(), 'x.md'),
    ),
  );
  return options.sourceLabel
    ?? (
      path.relative(documentDirectory, sourcePath)
        .split(path.sep)
        .join('/')
      || path.basename(sourcePath)
    );
}

function writeTreeAsset(input: {
  options: {
    sourcePath: string;
    outDir: string;
    ledgerPath?: string;
  };
  candidate: Candidate;
  format: 'json' | 'xml';
  structuralPath: string;
  pointer?: string;
  projection: string;
  conversion: Readonly<Record<string, string | number | boolean>>;
  nested: string;
  source: string;
  sourceDigest: string;
}): ExtractTreeResult {
  const result: ExtractTreeResult = { problems: [] };
  const assetText =
    input.nested
    + '\n\n'
    + provenanceComment(
      input.source,
      input.structuralPath,
      input.sourceDigest,
      input.candidate.fingerprint.digest,
      input.projection,
    )
    + '\n';
  const data = Buffer.from(assetText, 'utf8');
  const digest = sha256(data);

  fs.mkdirSync(input.options.outDir, { recursive: true });
  const outDirectory = fs.realpathSync(input.options.outDir);
  const sourceReal = fs.realpathSync(input.options.sourcePath);
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
    format: input.format,
    structuralPath: input.structuralPath,
    ...(input.pointer !== undefined ? { pointer: input.pointer } : {}),
    digest,
    candidateFingerprint: input.candidate.fingerprint.digest,
    file,
    status,
    markdown: assetText.trimEnd(),
  };

  if (input.options.ledgerPath) {
    recordEntries(input.options.ledgerPath, [
      entryFor(
        input.options.ledgerPath,
        input.options.sourcePath,
        input.candidate,
        file,
        'mmi extract --tree',
        input.conversion,
      ),
    ]);
  }

  return result;
}

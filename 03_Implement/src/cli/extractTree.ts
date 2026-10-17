import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  decodeFlatTextUtf8,
  readFlatTextTree,
  type FlatTextTreeMethod,
  type FlatTextTreeNode,
} from '../adapters/flatTextTreeStructuralizer.js';
import {
  canonicalJsonValue,
  decodeJsonPointer,
  readJsonTree,
  resolveJsonPointer,
  type JsonValue,
} from '../adapters/jsonTreeAdapter.js';
import {
  readXmlTree,
  resolveXmlTreePath,
  type XmlElementNode,
} from '../adapters/xmlTreeAdapter.js';
import { readYamlTree } from '../adapters/yamlTreeAdapter.js';
import {
  readTabularHierarchy,
  type TabularHierarchyConfig,
  type TabularHierarchyNode,
} from '../adapters/tabularHierarchyAdapter.js';
import { entryFor, recordEntries } from '../core/importLedger.js';
import { loadWorkbook } from '../core/workbookLoader.js';
import { cliErrorText } from './messageLanguage.js';
import { decodeJsonUtf8 } from '../core/jsonFormat.js';
import {
  decodeGenericXmlUtf8,
  isXmlSpreadsheet2003Bytes,
} from '../core/xmlFormat.js';
import { decodeYamlUtf8 } from '../core/yamlFormat.js';

export interface ExtractTreeOptions {
  sourcePath: string;
  /** Format-native structural path. JSON root is empty; flat text uses text:<method>:line:<n>. */
  pointer: string;
  outDir: string;
  fromDocument?: string;
  sourceLabel?: string;
  ledgerPath?: string;
  /**
   * Optional review-time identity guard. When supplied, extraction fails if
   * the current Candidate at the pointer no longer matches what was reviewed.
   */
  expectedCandidateFingerprint?: string;
}

export interface ExtractTabularHierarchyTreeOptions
  extends ExtractTreeOptions {
  sheet: string;
  config: TabularHierarchyConfig;
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

function escapeMarkdownInline(text: string): string {
  return text.replace(/([\\`*_[\]{}()#+\-.!<>|])/gu, '\\$1');
}

function renderLabel(text: string): string {
  return escapeMarkdownInline(JSON.stringify(text));
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
    `${indent}- ${label}: ${escapeMarkdownInline(canonicalJsonValue(value))}`,
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
  projection:
    | 'json-nested-list-v1'
    | 'yaml-nested-list-v1'
    | 'xml-nested-list-v1'
    | 'flat-text-nested-list-v1'
    | 'tabular-hierarchy-nested-list-v1',
  extra: Readonly<Record<string, string>> = {},
): string {
  const extraAttributes = Object.entries(extra)
    .map(([key, value]) =>
      ` ${key}="${provenanceValue(value)}"`)
    .join('');
  return `<!-- mmi:extracted-tree source="${provenanceValue(source)}" path="${provenanceValue(pointer)}" source-sha256="${sourceDigest.slice(7)}" candidate-sha256="${candidateFingerprint.slice(7)}" projection="${projection}"${extraAttributes} -->`;
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
  const sourceDigest = sha256(sourceBytes);
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
    tree = readJsonTree(
      decodeJsonUtf8(sourceBytes),
      source,
      sourceDigest,
    );
  } catch (error) {
    result.problems.push({
      code: 'MMI_TREE_JSON_INVALID',
      message: cliErrorText(error),
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
  if (
    options.expectedCandidateFingerprint
    && candidate.fingerprint.digest
      !== options.expectedCandidateFingerprint
  ) {
    result.problems.push({
      code: 'MMI_TREE_CANDIDATE_CHANGED',
      message:
        `Tree Candidate at JSON Pointer ${options.pointer || '(root)'} changed after review; review the current Candidate before extraction`,
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
      'json-nested-list-v1',
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


export function extractYamlTree(
  options: ExtractTreeOptions,
): ExtractTreeResult {
  const result: ExtractTreeResult = { problems: [] };
  if (!/\.ya?ml$/iu.test(options.sourcePath)) {
    result.problems.push({
      code: 'MMI_TREE_SOURCE_UNSUPPORTED',
      message: 'YAML Tree extraction requires a .yaml or .yml source',
    });
    return result;
  }

  const sourceBytes = fs.readFileSync(options.sourcePath);
  const sourceDigest = sha256(sourceBytes);
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
    tree = readYamlTree(
      decodeYamlUtf8(sourceBytes),
      source,
      sourceDigest,
    );
  } catch (error) {
    result.problems.push({
      code: 'MMI_TREE_YAML_INVALID',
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
        `no Tree Candidate at YAML Pointer ${options.pointer || '(root)'}; run \`mmi inspect\` to list detected Tree Candidates`,
    });
    return result;
  }
  if (
    options.expectedCandidateFingerprint
    && candidate.fingerprint.digest
      !== options.expectedCandidateFingerprint
  ) {
    result.problems.push({
      code: 'MMI_TREE_CANDIDATE_CHANGED',
      message:
        `Tree Candidate at YAML Pointer ${options.pointer || '(root)'} changed after review; review the current Candidate before extraction`,
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
      'yaml-nested-list-v1',
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
          mode: 'yaml-nested-list-v1',
          pointer: options.pointer,
        },
      ),
    ]);
  }

  return result;
}


function parseFlatTextTreePath(
  pointer: string,
): { method: FlatTextTreeMethod; line: number } | undefined {
  const match = pointer.match(
    /^text:(indent|heading-number|prefix-code):line:([1-9][0-9]*)$/u,
  );
  if (!match) return undefined;
  return {
    method: match[1] as FlatTextTreeMethod,
    line: Number(match[2]),
  };
}

function renderFlatTextNestedList(
  nodes: readonly FlatTextTreeNode[],
  rootLine: number,
  depth = 0,
): string[] {
  const byLine = new Map(nodes.map((node) => [node.line, node]));
  const node = byLine.get(rootLine);
  if (!node) return [];
  const lines = [
    `${'  '.repeat(depth)}- ${escapeMarkdownInline(node.label)}`,
  ];
  for (const childLine of node.childLines) {
    lines.push(
      ...renderFlatTextNestedList(nodes, childLine, depth + 1),
    );
  }
  return lines;
}

export function extractFlatTextTree(
  options: ExtractTreeOptions,
): ExtractTreeResult {
  const result: ExtractTreeResult = { problems: [] };
  if (!/\.(txt|text|log)$/iu.test(options.sourcePath)) {
    result.problems.push({
      code: 'MMI_TREE_SOURCE_UNSUPPORTED',
      message: 'flat-text Tree extraction requires a .txt, .text or .log source',
    });
    return result;
  }

  const parsedPath = parseFlatTextTreePath(options.pointer);
  if (!parsedPath) {
    result.problems.push({
      code: 'MMI_TREE_CANDIDATE_NOT_FOUND',
      message:
        'flat-text Tree extraction needs an exact path shown by inspect, such as text:indent:line:2',
    });
    return result;
  }

  const sourceBytes = fs.readFileSync(options.sourcePath);
  let sourceText: string;
  try {
    sourceText = decodeFlatTextUtf8(sourceBytes);
  } catch (error) {
    result.problems.push({
      code: 'MMI_TREE_TEXT_INVALID_UTF8',
      message: error instanceof Error ? error.message : String(error),
    });
    return result;
  }

  const sourceDigest = sha256(sourceBytes);
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
    tree = readFlatTextTree(
      sourceText,
      source,
      sourceDigest,
      { methods: [parsedPath.method] },
    );
  } catch (error) {
    result.problems.push({
      code: 'MMI_TREE_TEXT_INVALID',
      message: error instanceof Error ? error.message : String(error),
    });
    return result;
  }

  const hypothesis = tree.hypotheses.find(
    (item) => item.method === parsedPath.method,
  );
  const node = hypothesis?.nodes.find(
    (item) => item.structuralPath === options.pointer,
  );
  if (!hypothesis || hypothesis.status !== 'inferred' || !node) {
    result.problems.push({
      code: 'MMI_TREE_CANDIDATE_NOT_FOUND',
      message:
        `no inferred flat-text Tree Candidate at ${options.pointer}; rerun \`mmi inspect\` and review the current hierarchy hypothesis`,
    });
    return result;
  }

  const candidate = node.candidate;
  if (
    options.expectedCandidateFingerprint
    && candidate.fingerprint.digest
      !== options.expectedCandidateFingerprint
  ) {
    result.problems.push({
      code: 'MMI_TREE_CANDIDATE_CHANGED',
      message:
        `Tree Candidate at ${options.pointer} changed after review; review the current Candidate before extraction`,
    });
    return result;
  }

  const nested = renderFlatTextNestedList(
    hypothesis.nodes,
    node.line,
  ).join('\n');
  const assetText =
    nested
    + '\n\n'
    + provenanceComment(
      source,
      options.pointer,
      sourceDigest,
      candidate.fingerprint.digest,
      'flat-text-nested-list-v1',
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
          mode: 'flat-text-nested-list-v1',
          method: parsedPath.method,
          pointer: options.pointer,
        },
      ),
    ]);
  }

  return result;
}


function renderTabularHierarchyNestedList(
  nodes: readonly TabularHierarchyNode[],
  key: string,
  depth = 0,
): string[] {
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const node = byKey.get(key);
  if (!node) return [];
  const lines = [
    `${'  '.repeat(depth)}- ${escapeMarkdownInline(node.label)}`,
  ];
  for (const childKey of node.childKeys) {
    lines.push(
      ...renderTabularHierarchyNestedList(
        nodes,
        childKey,
        depth + 1,
      ),
    );
  }
  return lines;
}

function tabularHierarchyProvenance(
  options: ExtractTabularHierarchyTreeOptions,
): Record<string, string> {
  const encoded = (value: string): string =>
    encodeURIComponent(value);
  const headerRow: Record<string, string> = options.config.headerRow === undefined
    ? {}
    : { 'header-row': String(options.config.headerRow + 1) };
  return options.config.mode === 'parent-id'
    ? {
        'sheet-uri': encoded(options.sheet),
        'hierarchy-mode': options.config.mode,
        ...headerRow,
        'id-header-uri': encoded(options.config.idHeader),
        'parent-header-uri': encoded(options.config.parentHeader),
        ...(options.config.labelHeader
          ? { 'label-header-uri': encoded(options.config.labelHeader) }
          : {}),
      }
    : {
        'sheet-uri': encoded(options.sheet),
        'hierarchy-mode': options.config.mode,
        ...headerRow,
        'level-header-uri': encoded(options.config.levelHeader),
        'label-header-uri': encoded(options.config.labelHeader),
      };
}

function tabularHierarchyConversion(
  options: ExtractTabularHierarchyTreeOptions,
): Readonly<Record<string, string | number | boolean>> {
  return options.config.mode === 'parent-id'
    ? {
        mode: 'tabular-hierarchy-nested-list-v1',
        hierarchyMode: options.config.mode,
        sheet: options.sheet,
        pointer: options.pointer,
        ...(options.config.headerRow === undefined
          ? {}
          : { headerRow: options.config.headerRow }),
        idHeader: options.config.idHeader,
        parentHeader: options.config.parentHeader,
        ...(options.config.labelHeader
          ? { labelHeader: options.config.labelHeader }
          : {}),
      }
    : {
        mode: 'tabular-hierarchy-nested-list-v1',
        hierarchyMode: options.config.mode,
        sheet: options.sheet,
        pointer: options.pointer,
        ...(options.config.headerRow === undefined
          ? {}
          : { headerRow: options.config.headerRow }),
        levelHeader: options.config.levelHeader,
        labelHeader: options.config.labelHeader,
      };
}

export function extractTabularHierarchyTree(
  options: ExtractTabularHierarchyTreeOptions,
): ExtractTreeResult {
  const result: ExtractTreeResult = { problems: [] };
  if (!/\.(xlsx|xlsm|xls|csv)$/iu.test(options.sourcePath)) {
    result.problems.push({
      code: 'MMI_TREE_SOURCE_UNSUPPORTED',
      message:
        'tabular hierarchy extraction requires an XLSX/XLSM/XLS/CSV source',
    });
    return result;
  }

  const sourceBytes = fs.readFileSync(options.sourcePath);
  const sourceDigest = sha256(sourceBytes);
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

  let workbook: ReturnType<typeof loadWorkbook>;
  try {
    workbook = loadWorkbook({ absolutePath: options.sourcePath });
  } catch (error) {
    result.problems.push({
      code: 'MMI_TREE_SOURCE_UNREADABLE',
      message: error instanceof Error ? error.message : String(error),
    });
    return result;
  }
  const sheet = workbook.sheets[options.sheet];
  if (!sheet) {
    result.problems.push({
      code: 'MMI_TREE_SHEET_NOT_FOUND',
      message:
        `sheet ${JSON.stringify(options.sheet)} was not found; inspect the source to list available sheets`,
    });
    return result;
  }

  const hierarchy = readTabularHierarchy({
    source,
    sourceDigest,
    sheetName: options.sheet,
    sheet,
    config: options.config,
  });
  if (hierarchy.status !== 'inferred') {
    result.problems.push({
      code: 'MMI_TREE_CANDIDATE_NOT_FOUND',
      message:
        `tabular hierarchy could not be established: ${hierarchy.reasonCode}`,
    });
    return result;
  }
  const node = hierarchy.nodes.find(
    (item) => item.structuralPath === options.pointer,
  );
  if (!node) {
    result.problems.push({
      code: 'MMI_TREE_CANDIDATE_NOT_FOUND',
      message:
        `no tabular Tree Candidate at ${options.pointer}; rerun \`mmi inspect\` with the same hierarchy columns`,
    });
    return result;
  }

  const candidate = node.candidate;
  if (
    options.expectedCandidateFingerprint
    && candidate.fingerprint.digest
      !== options.expectedCandidateFingerprint
  ) {
    result.problems.push({
      code: 'MMI_TREE_CANDIDATE_CHANGED',
      message:
        `tabular Tree Candidate at ${options.pointer} changed after review; review the current Candidate before extraction`,
    });
    return result;
  }

  const nested = renderTabularHierarchyNestedList(
    hierarchy.nodes,
    node.key,
  ).join('\n');
  const assetText =
    nested
    + '\n\n'
    + provenanceComment(
      source,
      node.structuralPath,
      sourceDigest,
      candidate.fingerprint.digest,
      'tabular-hierarchy-nested-list-v1',
      tabularHierarchyProvenance(options),
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
        message:
          `${file} exists with different content; it was not overwritten`,
      });
      return result;
    }
    status = 'unchanged';
  } else {
    fs.writeFileSync(file, data);
  }

  result.extracted = {
    pointer: node.structuralPath,
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
        tabularHierarchyConversion(options),
      ),
    ]);
  }

  return result;
}


function compareXmlAttributeName(
  left: { name: string },
  right: { name: string },
): number {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

function renderXmlNestedList(
  element: XmlElementNode,
  depth = 0,
): string[] {
  const indent = '  '.repeat(depth);
  const lines = [`${indent}- <${escapeMarkdownInline(element.name)}>`];

  for (const attribute of [...element.attributes].sort(compareXmlAttributeName)) {
    lines.push(
      `${'  '.repeat(depth + 1)}- @${escapeMarkdownInline(attribute.name)}: ${escapeMarkdownInline(JSON.stringify(attribute.value))}`,
    );
  }
  for (const item of element.content) {
    if (item.kind === 'element') {
      lines.push(...renderXmlNestedList(item.element, depth + 1));
      continue;
    }
    if (item.value.trim().length > 0) {
      lines.push(
        `${'  '.repeat(depth + 1)}- #text: ${escapeMarkdownInline(JSON.stringify(item.value))}`,
      );
    }
  }
  return lines;
}

export function extractXmlTree(
  options: ExtractTreeOptions,
): ExtractTreeResult {
  const result: ExtractTreeResult = { problems: [] };
  if (!/\.xml$/iu.test(options.sourcePath)) {
    result.problems.push({
      code: 'MMI_TREE_SOURCE_UNSUPPORTED',
      message: 'XML Tree extraction requires an .xml source',
    });
    return result;
  }

  const sourceBytes = fs.readFileSync(options.sourcePath);
  if (isXmlSpreadsheet2003Bytes(sourceBytes)) {
    result.problems.push({
      code: 'MMI_TREE_XML_SPREADSHEET_TABLE_SOURCE',
      message:
        'XML Spreadsheet 2003 remains a workbook/table source; inspect and extract its Table Candidates instead',
    });
    return result;
  }

  let xml: string;
  try {
    xml = decodeGenericXmlUtf8(sourceBytes);
  } catch (error) {
    result.problems.push({
      code: 'MMI_TREE_XML_INVALID',
      message: error instanceof Error ? error.message : String(error),
    });
    return result;
  }

  const sourceDigest = sha256(sourceBytes);
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
    tree = readXmlTree(xml, source, sourceDigest);
  } catch (error) {
    result.problems.push({
      code: 'MMI_TREE_XML_INVALID',
      message: error instanceof Error ? error.message : String(error),
    });
    return result;
  }

  const node = resolveXmlTreePath(tree, options.pointer);
  if (!node) {
    result.problems.push({
      code: 'MMI_TREE_CANDIDATE_NOT_FOUND',
      message:
        `no Tree Candidate at XML path ${options.pointer || '(root)'}; run \`mmi inspect\` to list detected Tree Candidates`,
    });
    return result;
  }
  const candidate = node.candidate;
  if (
    options.expectedCandidateFingerprint
    && candidate.fingerprint.digest
      !== options.expectedCandidateFingerprint
  ) {
    result.problems.push({
      code: 'MMI_TREE_CANDIDATE_CHANGED',
      message:
        `Tree Candidate at XML path ${node.path} changed after review; review the current Candidate before extraction`,
    });
    return result;
  }

  const nested = renderXmlNestedList(node.element).join('\n');
  const assetText =
    nested
    + '\n\n'
    + provenanceComment(
      source,
      node.path,
      sourceDigest,
      candidate.fingerprint.digest,
      'xml-nested-list-v1',
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
    pointer: node.path,
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
          mode: 'xml-nested-list-v1',
          pointer: node.path,
        },
      ),
    ]);
  }

  return result;
}

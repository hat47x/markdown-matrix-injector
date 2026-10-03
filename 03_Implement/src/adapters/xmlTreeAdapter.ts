import { TextDecoder } from 'node:util';
import {
  candidateProblem,
  fingerprintOf,
  type Candidate,
} from '../core/candidate.js';

export const XML_TREE_ADAPTER_VERSION = '1';

export type XmlContent =
  | { kind: 'text'; value: string }
  | { kind: 'element'; element: XmlElement };

export interface XmlElement {
  name: string;
  attributes: Readonly<Record<string, string>>;
  content: readonly XmlContent[];
}

export interface XmlTreeNode {
  /** Deterministic element path, e.g. /catalog[1]/item[2]. */
  path: string;
  name: string;
  childPaths: readonly string[];
  /** Sorted @name=<JSON string> values. */
  attributeValues: readonly string[];
  /** Direct text/CDATA segments that contain non-whitespace content. */
  textSegments: readonly string[];
  element: XmlElement;
  candidate: Candidate;
}

export interface XmlTreeDocument {
  root: XmlElement;
  nodes: readonly XmlTreeNode[];
  candidates: readonly Candidate[];
}

export function decodeXmlUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Generic Tree XML must be valid UTF-8 bytes.');
  }
}

export function readXmlTree(
  text: string,
  source: string,
  sourceDigest: string,
): XmlTreeDocument {
  const root = parseXml(text);
  const nodes: XmlTreeNode[] = [];
  collectNodes(root, rootPath(root.name), source, sourceDigest, nodes);
  return {
    root,
    nodes,
    candidates: nodes.map((node) => node.candidate),
  };
}

export function resolveXmlElement(
  document: XmlTreeDocument,
  structuralPath: string,
): XmlElement | undefined {
  return document.nodes.find((node) => node.path === structuralPath)?.element;
}

export function canonicalXmlSubtree(element: XmlElement): string {
  const attributes = Object.entries(element.attributes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `A${JSON.stringify(name)}=${JSON.stringify(value)}`)
    .join(',');
  const content = element.content
    .map((item) => item.kind === 'text'
      ? `T${JSON.stringify(item.value)}`
      : `E${canonicalXmlSubtree(item.element)}`)
    .join(',');
  return `N${JSON.stringify(element.name)}[${attributes}]{${content}}`;
}

function collectNodes(
  element: XmlElement,
  path: string,
  source: string,
  sourceDigest: string,
  out: XmlTreeNode[],
): void {
  const childElements = element.content
    .filter((item): item is Extract<XmlContent, { kind: 'element' }> =>
      item.kind === 'element')
    .map((item) => item.element);
  const childPaths: string[] = [];
  const siblingCounts = new Map<string, number>();
  for (const child of childElements) {
    const occurrence = (siblingCounts.get(child.name) ?? 0) + 1;
    siblingCounts.set(child.name, occurrence);
    childPaths.push(`${path}/${child.name}[${occurrence}]`);
  }

  const attributeValues = Object.entries(element.attributes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `@${name}=${JSON.stringify(value)}`);
  const textSegments = element.content
    .filter((item): item is Extract<XmlContent, { kind: 'text' }> =>
      item.kind === 'text' && item.value.trim().length > 0)
    .map((item) => item.value);

  const claims: Candidate['claims'] = [
    {
      aspect: 'structural-path',
      value: path,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'xml-element-path',
    },
    {
      aspect: 'element-name',
      value: element.name,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'xml-element-name',
    },
    ...(childPaths.length > 0
      ? [{
          aspect: 'children',
          value: childPaths,
          status: 'observed' as const,
          execution: 'deterministic' as const,
          method: 'M0' as const,
          reasonCode: 'xml-parent-child',
        }]
      : []),
    ...(attributeValues.length > 0
      ? [{
          aspect: 'attributes',
          value: attributeValues,
          status: 'observed' as const,
          execution: 'deterministic' as const,
          method: 'M0' as const,
          reasonCode: 'xml-attributes',
        }]
      : []),
    ...(textSegments.length > 0
      ? [{
          aspect: 'text-segments',
          value: textSegments,
          status: 'observed' as const,
          execution: 'deterministic' as const,
          method: 'M0' as const,
          reasonCode: 'xml-direct-text',
        }]
      : []),
  ];

  const candidate: Candidate = {
    kind: 'tree',
    locator: {
      source,
      sourceDigest,
      structuralPath: path,
    },
    status: 'observed',
    execution: 'deterministic',
    method: 'M0',
    claims,
    provenance: {
      algorithm: 'mmi.xml-tree-adapter',
      run: {
        execution: 'deterministic',
        inputDigest: sourceDigest,
        config: {
          format: 'xml',
          elementPath: 'name-occurrence-v1',
          attributes: 'lexicographic',
          doctype: 'rejected',
        },
        implementationVersion: XML_TREE_ADAPTER_VERSION,
      },
    },
    fingerprint: fingerprintOf(
      'xml-subtree-canonical-v1',
      canonicalXmlSubtree(element),
    ),
    scores: [],
  };

  const problem = candidateProblem(candidate);
  if (problem) {
    throw new Error(`invalid XML Tree Candidate at ${path}: ${problem}`);
  }

  out.push({
    path,
    name: element.name,
    childPaths,
    attributeValues,
    textSegments,
    element,
    candidate,
  });

  let childIndex = 0;
  for (const item of element.content) {
    if (item.kind !== 'element') continue;
    collectNodes(
      item.element,
      childPaths[childIndex],
      source,
      sourceDigest,
      out,
    );
    childIndex += 1;
  }
}

function rootPath(name: string): string {
  return `/${name}[1]`;
}

function parseXml(input: string): XmlElement {
  const text = stripBom(input).replace(/\r\n?/gu, '\n');
  rejectUnsupportedEncoding(text);

  let position = 0;
  let root: MutableXmlElement | undefined;
  const stack: MutableXmlElement[] = [];

  const addText = (value: string, decode = true) => {
    const decoded = decode ? decodeXmlEntities(value) : value;
    if (stack.length === 0) {
      if (decoded.trim().length > 0) {
        throw xmlError(position, 'text is not allowed outside the root element');
      }
      return;
    }
    if (decoded.length > 0) {
      stack[stack.length - 1].content.push({ kind: 'text', value: decoded });
    }
  };

  while (position < text.length) {
    if (text[position] !== '<') {
      const next = text.indexOf('<', position);
      const end = next < 0 ? text.length : next;
      addText(text.slice(position, end));
      position = end;
      continue;
    }

    if (text.startsWith('<!--', position)) {
      const end = text.indexOf('-->', position + 4);
      if (end < 0) throw xmlError(position, 'unterminated XML comment');
      position = end + 3;
      continue;
    }

    if (text.startsWith('<![CDATA[', position)) {
      const end = text.indexOf(']]>', position + 9);
      if (end < 0) throw xmlError(position, 'unterminated CDATA section');
      addText(text.slice(position + 9, end), false);
      position = end + 3;
      continue;
    }

    if (/^<!DOCTYPE\b/iu.test(text.slice(position, position + 16))) {
      throw xmlError(
        position,
        'DOCTYPE is not supported; external/internal entity declarations are not expanded',
      );
    }

    if (text.startsWith('<?', position)) {
      const end = text.indexOf('?>', position + 2);
      if (end < 0) throw xmlError(position, 'unterminated processing instruction');
      position = end + 2;
      continue;
    }

    if (text.startsWith('</', position)) {
      const end = text.indexOf('>', position + 2);
      if (end < 0) throw xmlError(position, 'unterminated closing tag');
      const name = text.slice(position + 2, end).trim();
      assertXmlName(name, position);
      const current = stack.pop();
      if (!current) throw xmlError(position, `unexpected closing tag </${name}>`);
      if (current.name !== name) {
        throw xmlError(
          position,
          `closing tag </${name}> does not match <${current.name}>`,
        );
      }
      position = end + 1;
      continue;
    }

    if (text.startsWith('<!', position)) {
      throw xmlError(position, 'unsupported XML declaration');
    }

    const end = findTagEnd(text, position + 1);
    const raw = text.slice(position + 1, end);
    const parsed = parseStartTag(raw, position);
    const element: MutableXmlElement = {
      name: parsed.name,
      attributes: parsed.attributes,
      content: [],
    };

    if (stack.length > 0) {
      stack[stack.length - 1].content.push({
        kind: 'element',
        element,
      });
    } else {
      if (root) throw xmlError(position, 'XML document has more than one root element');
      root = element;
    }

    if (!parsed.selfClosing) stack.push(element);
    position = end + 1;
  }

  if (stack.length > 0) {
    throw xmlError(text.length, `unclosed element <${stack[stack.length - 1].name}>`);
  }
  if (!root) throw new Error('XML document has no root element');
  return freezeElement(root);
}

interface MutableXmlElement {
  name: string;
  attributes: Record<string, string>;
  content: MutableXmlContent[];
}

type MutableXmlContent =
  | { kind: 'text'; value: string }
  | { kind: 'element'; element: MutableXmlElement };

function freezeElement(element: MutableXmlElement): XmlElement {
  return {
    name: element.name,
    attributes: { ...element.attributes },
    content: element.content.map((item) => item.kind === 'text'
      ? { kind: 'text', value: item.value }
      : { kind: 'element', element: freezeElement(item.element) }),
  };
}

function parseStartTag(
  rawInput: string,
  offset: number,
): {
  name: string;
  attributes: Record<string, string>;
  selfClosing: boolean;
} {
  let raw = rawInput.trim();
  const selfClosing = raw.endsWith('/');
  if (selfClosing) raw = raw.slice(0, -1).trimEnd();

  let position = 0;
  const name = readToken(raw, (character) => /\s/u.test(character));
  position = name.length;
  assertXmlName(name, offset);

  const attributes: Record<string, string> = {};
  while (position < raw.length) {
    position = skipWhitespace(raw, position);
    if (position >= raw.length) break;

    const start = position;
    while (
      position < raw.length
      && !/[\s=]/u.test(raw[position])
    ) {
      position += 1;
    }
    const attributeName = raw.slice(start, position);
    assertXmlName(attributeName, offset + position);

    position = skipWhitespace(raw, position);
    if (raw[position] !== '=') {
      throw xmlError(offset + position, `attribute ${attributeName} needs =`);
    }
    position += 1;
    position = skipWhitespace(raw, position);
    const quote = raw[position];
    if (quote !== '"' && quote !== "'") {
      throw xmlError(
        offset + position,
        `attribute ${attributeName} must use quotes`,
      );
    }
    position += 1;
    const valueStart = position;
    const valueEnd = raw.indexOf(quote, valueStart);
    if (valueEnd < 0) {
      throw xmlError(offset + valueStart, `unterminated attribute ${attributeName}`);
    }
    if (Object.prototype.hasOwnProperty.call(attributes, attributeName)) {
      throw xmlError(offset + start, `duplicate attribute ${attributeName}`);
    }
    attributes[attributeName] = decodeXmlEntities(
      raw.slice(valueStart, valueEnd),
    );
    position = valueEnd + 1;
  }

  return { name, attributes, selfClosing };
}

function readToken(text: string, stop: (character: string) => boolean): string {
  let position = 0;
  while (position < text.length && !stop(text[position])) position += 1;
  return text.slice(0, position);
}

function skipWhitespace(text: string, position: number): number {
  while (position < text.length && /\s/u.test(text[position])) position += 1;
  return position;
}

function findTagEnd(text: string, start: number): number {
  let quote: '"' | "'" | undefined;
  for (let position = start; position < text.length; position += 1) {
    const character = text[position];
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '>') return position;
  }
  throw xmlError(start - 1, 'unterminated start tag');
}

function decodeXmlEntities(value: string): string {
  let output = '';
  let position = 0;
  while (position < value.length) {
    const ampersand = value.indexOf('&', position);
    if (ampersand < 0) {
      output += value.slice(position);
      break;
    }
    output += value.slice(position, ampersand);
    const semicolon = value.indexOf(';', ampersand + 1);
    if (semicolon < 0) {
      throw xmlError(ampersand, 'unterminated XML entity reference');
    }
    const entity = value.slice(ampersand + 1, semicolon);
    output += decodeEntity(entity, ampersand);
    position = semicolon + 1;
  }
  return output;
}

function decodeEntity(entity: string, position: number): string {
  const predefined: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    quot: '"',
  };
  if (Object.prototype.hasOwnProperty.call(predefined, entity)) {
    return predefined[entity];
  }

  let codePoint: number | undefined;
  if (/^#[0-9]+$/u.test(entity)) {
    codePoint = Number(entity.slice(1));
  } else if (/^#x[0-9a-f]+$/iu.test(entity)) {
    codePoint = Number.parseInt(entity.slice(2), 16);
  }
  if (codePoint === undefined || !validXmlCodePoint(codePoint)) {
    throw xmlError(position, `unsupported XML entity &${entity};`);
  }
  return String.fromCodePoint(codePoint);
}

function validXmlCodePoint(value: number): boolean {
  return value === 0x9
    || value === 0xa
    || value === 0xd
    || (value >= 0x20 && value <= 0xd7ff)
    || (value >= 0xe000 && value <= 0xfffd)
    || (value >= 0x10000 && value <= 0x10ffff);
}

function assertXmlName(name: string, position: number): void {
  if (
    name.length === 0
    || /^[0-9.-]/u.test(name)
    || /[\s<>"'=\/]/u.test(name)
  ) {
    throw xmlError(position, `invalid XML name: ${name || '(empty)'}`);
  }
}

function stripBom(text: string): string {
  return text.startsWith('\uFEFF') ? text.slice(1) : text;
}

function rejectUnsupportedEncoding(text: string): void {
  const declaration = text.match(
    /^\s*<\?xml\s+[^?]*encoding\s*=\s*(['"])([^'"]+)\1[^?]*\?>/iu,
  );
  if (!declaration) return;
  const encoding = declaration[2].toLowerCase().replace(/[_-]/gu, '');
  if (encoding !== 'utf8') {
    throw new Error(
      `Unsupported XML encoding declaration: ${declaration[2]}; generic Tree XML currently requires UTF-8`,
    );
  }
}

function xmlError(position: number, message: string): Error {
  return new Error(`XML parse error at offset ${position}: ${message}`);
}

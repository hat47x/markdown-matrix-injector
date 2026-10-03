import { SaxesParser, type SaxesTagNS } from 'saxes';

import {
  candidateProblem,
  fingerprintOf,
  type Candidate,
} from '../core/candidate.js';

export const XML_TREE_ADAPTER_VERSION = '2';

function parseXml(text: string): XmlElementNode {
  type Frame = {
    name: string;
    attributes: XmlAttribute[];
    content: XmlTreeContent[];
  };

  const parser = new SaxesParser({ xmlns: true });
  const stack: Frame[] = [];
  let root: XmlElementNode | undefined;

  const appendText = (value: string): void => {
    if (value.length === 0) return;
    const current = stack[stack.length - 1];
    if (!current) {
      if (value.trim().length > 0) {
        throw new Error(
          'text is not allowed outside the XML document element',
        );
      }
      return;
    }
    current.content.push({ kind: 'text', value });
  };

  parser.on('xmldecl', (declaration) => {
    if (
      declaration.encoding
      && !/^utf-?8$/iu.test(declaration.encoding)
    ) {
      throw new Error(
        `generic XML Tree sources must declare UTF-8, not ${declaration.encoding}`,
      );
    }
  });
  parser.on('doctype', () => {
    throw new Error(
      'DTD/declaration syntax is not supported for deterministic XML Tree extraction',
    );
  });
  parser.on('opentag', (tag: SaxesTagNS) => {
    stack.push({
      name: tag.name,
      attributes: Object.values(tag.attributes).map((attribute) => ({
        name: attribute.name,
        value: attribute.value,
      })),
      content: [],
    });
  });
  parser.on('text', appendText);
  parser.on('cdata', appendText);
  parser.on('closetag', (tag: SaxesTagNS) => {
    const current = stack.pop();
    if (!current || current.name !== tag.name) {
      throw new Error(`mismatched XML closing tag: ${tag.name}`);
    }
    const element: XmlElementNode = {
      name: current.name,
      attributes: current.attributes,
      content: current.content,
    };
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.content.push({ kind: 'element', element });
    } else if (!root) {
      root = element;
    } else {
      throw new Error('XML document contains multiple root elements');
    }
  });

  parser.write(text.replace(/^\uFEFF/u, '')).close();
  if (!root) throw new Error('XML document has no root element');
  return root;
}

function compareXmlName(
  left: { name: string },
  right: { name: string },
): number {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

function canonicalElement(element: XmlElementNode): string {
  const attributes = [...element.attributes]
    .sort(compareXmlName)
    .map((attribute) => [attribute.name, attribute.value]);
  const content = element.content.map((item) =>
    item.kind === 'text'
      ? ['text', item.value]
      : ['element', canonicalElement(item.element)]);
  return JSON.stringify({
    name: element.name,
    attributes,
    content,
  });
}

function pathFor(parent: string, name: string, ordinal: number): string {
  return `${parent}/${name}[${ordinal}]`;
}

function collectNodes(
  element: XmlElementNode,
  path: string,
  source: string,
  sourceDigest: string,
  out: XmlTreeNode[],
): void {
  const childElements = element.content
    .filter((item): item is Extract<XmlTreeContent, { kind: 'element' }> =>
      item.kind === 'element')
    .map((item) => item.element);
  const siblingCounts = new Map<string, number>();
  const childPaths = childElements.map((child) => {
    const ordinal = (siblingCounts.get(child.name) ?? 0) + 1;
    siblingCounts.set(child.name, ordinal);
    return pathFor(path, child.name, ordinal);
  });
  const attributeValues = [...element.attributes]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((attribute) => `@${attribute.name}=${JSON.stringify(attribute.value)}`);
  const textValues = element.content
    .filter((item): item is Extract<XmlTreeContent, { kind: 'text' }> =>
      item.kind === 'text')
    .map((item) => item.value)
    .filter((value) => value.trim().length > 0);

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
      aspect: 'node-type',
      value: 'element',
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'xml-element',
    },
    {
      aspect: 'element-name',
      value: element.name,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'xml-qualified-name',
    },
    {
      aspect: 'children',
      value: childPaths,
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'xml-parent-child',
    },
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
    ...(textValues.length > 0
      ? [{
          aspect: 'text',
          value: textValues,
          status: 'observed' as const,
          execution: 'deterministic' as const,
          method: 'M0' as const,
          reasonCode: 'xml-text',
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
          path: 'qualified-name-sibling-index-v1',
          dtd: 'rejected',
        },
        implementationVersion: XML_TREE_ADAPTER_VERSION,
      },
    },
    fingerprint: fingerprintOf(
      'xml-subtree-canonical-v1',
      canonicalElement(element),
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
    textValues,
    element,
    candidate,
  });

  childElements.forEach((child, index) => {
    collectNodes(
      child,
      childPaths[index],
      source,
      sourceDigest,
      out,
    );
  });
}

export function readXmlTree(
  text: string,
  source: string,
  sourceDigest: string,
): XmlTreeDocument {
  const root = parseXml(text);
  const nodes: XmlTreeNode[] = [];
  collectNodes(
    root,
    pathFor('', root.name, 1),
    source,
    sourceDigest,
    nodes,
  );
  return {
    root,
    nodes,
    candidates: nodes.map((node) => node.candidate),
  };
}

export function resolveXmlTreePath(
  document: XmlTreeDocument,
  structuralPath: string,
): XmlTreeNode | undefined {
  if (structuralPath === '') return document.nodes[0];
  return document.nodes.find((node) => node.path === structuralPath);
}

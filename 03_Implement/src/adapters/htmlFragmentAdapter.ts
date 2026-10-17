/**
 * Static HTML5 source observation for the document-decomposition pilot (#553).
 *
 * This module does not fetch URLs, execute scripts, update files, infer sections
 * from headings, or make an HTML snippet safe to execute in a browser.
 * Fragment serialization is a normalized HTML5 representation, not original
 * source bytes or a claim of semantic/visual equivalence.
 */
import { parse, serializeOuter, type DefaultTreeAdapterMap } from 'parse5';

import {
  candidateProblem,
  fingerprintOf,
  type Candidate,
  type CandidateKind,
} from '../core/candidate.js';
import { createSourceIdentityFromBytes } from '../core/sourceIdentity.js';

export const HTML_FRAGMENT_ADAPTER_VERSION = '1';

type HtmlNode = DefaultTreeAdapterMap['node'];
type HtmlElement = DefaultTreeAdapterMap['element'];
type HtmlDocumentNode = DefaultTreeAdapterMap['document'];

export type HtmlFragmentTag = 'main' | 'section' | 'table' | 'figure';

export interface HtmlFragmentNode {
  tagName: HtmlFragmentTag;
  /** Attribute ID is an observed hint, not a globally stable identity. */
  id?: string;
  /** Element path with 1-based same-tag sibling ordinals. */
  structuralPath: string;
  /** Normalized serialized outer HTML, not the source bytes. */
  html: string;
  candidate: Candidate;
}

export interface HtmlFragmentDocument {
  /** Parsed HTML5 tree retained for read-only, explicit-ID selection. */
  document: HtmlDocumentNode;
  source: string;
  sourceDigest: string;
  fragments: readonly HtmlFragmentNode[];
  candidates: readonly Candidate[];
}

function isElement(node: HtmlNode): node is HtmlElement {
  return 'tagName' in node;
}

function childrenOf(node: HtmlNode): readonly HtmlNode[] {
  return 'childNodes' in node ? node.childNodes : [];
}

function attribute(element: HtmlElement, name: string): string | undefined {
  return element.attrs.find((item) => item.name === name)?.value;
}

function containsDescendant(element: HtmlElement, predicate: (node: HtmlElement) => boolean): boolean {
  for (const child of element.childNodes) {
    if (!isElement(child)) continue;
    if (predicate(child) || containsDescendant(child, predicate)) return true;
  }
  return false;
}

function figureKind(element: HtmlElement): CandidateKind | undefined {
  if (containsDescendant(element, (child) =>
    child.tagName === 'svg'
    || (child.tagName === 'pre'
      && (attribute(child, 'class') ?? '').split(/\s+/u).includes('mermaid')))) {
    return 'diagram';
  }
  if (containsDescendant(element, (child) => child.tagName === 'img')) {
    return 'image';
  }
  // An arbitrary figure is not necessarily an image or a diagram.
  return undefined;
}

function fragmentKind(element: HtmlElement): CandidateKind | undefined {
  switch (element.tagName) {
    case 'main':
    case 'section':
      return 'section';
    case 'table':
      return 'table-range';
    case 'figure':
      return figureKind(element);
    default:
      return undefined;
  }
}

function collect(
  node: HtmlNode,
  parentPath: string,
  source: string,
  sourceDigest: string,
  result: HtmlFragmentNode[],
): void {
  const siblingCounts = new Map<string, number>();
  for (const child of childrenOf(node)) {
    if (!isElement(child)) continue;
    const ordinal = (siblingCounts.get(child.tagName) ?? 0) + 1;
    siblingCounts.set(child.tagName, ordinal);
    const structuralPath = `${parentPath}/${child.tagName}[${ordinal}]`;
    const kind = fragmentKind(child);
    if (kind) {
      const id = attribute(child, 'id');
      const html = serializeOuter(child);
      const candidate: Candidate = {
        kind,
        locator: { source, sourceDigest, structuralPath },
        status: 'observed',
        execution: 'deterministic',
        method: 'M0',
        claims: [
          {
            aspect: 'structural-path',
            value: structuralPath,
            status: 'observed',
            execution: 'deterministic',
            method: 'M0',
            reasonCode: 'html-dom-element-path',
          },
          {
            aspect: 'element-name',
            value: child.tagName,
            status: 'observed',
            execution: 'deterministic',
            method: 'M0',
            reasonCode: 'html-dom-tag',
          },
          ...(id === undefined ? [] : [{
            aspect: 'html-id',
            value: id,
            status: 'observed' as const,
            execution: 'deterministic' as const,
            method: 'M0' as const,
            reasonCode: 'html-id-attribute',
          }]),
        ],
        provenance: {
          algorithm: 'mmi.html-fragment-adapter',
          run: {
            execution: 'deterministic',
            inputDigest: sourceDigest,
            config: {
              parser: 'html5-parse5-v7',
              path: 'same-tag-sibling-index-v1',
              representation: 'normalized-outer-html-v1',
            },
            implementationVersion: HTML_FRAGMENT_ADAPTER_VERSION,
          },
        },
        fingerprint: fingerprintOf('html-outer-serialized-v1', html),
        scores: [],
      };
      const problem = candidateProblem(candidate);
      if (problem) {
        throw new Error(`invalid HTML Candidate at ${structuralPath}: ${problem}`);
      }
      result.push({
        tagName: child.tagName as HtmlFragmentTag,
        ...(id !== undefined ? { id } : {}),
        structuralPath,
        html,
        candidate,
      });
    }
    collect(child, structuralPath, source, sourceDigest, result);
  }
}

/**
 * The caller must pass the digest of these *exact UTF-8 bytes*; disagreement
 * must not be treated as an accepted snapshot. Non-UTF-8 input is out of scope.
 */
export function readHtmlFragments(
  html: string,
  source: string,
  sourceDigest: string,
): HtmlFragmentDocument {
  const actualDigest = createSourceIdentityFromBytes(Buffer.from(html, 'utf8')).digest;
  if (actualDigest !== sourceDigest) {
    throw new Error('MMI_HTML_SOURCE_CHANGED: supplied source digest does not match input bytes');
  }
  const document = parse(html, { scriptingEnabled: false });
  const fragments: HtmlFragmentNode[] = [];
  collect(document, '', source, sourceDigest, fragments);
  return {
    document,
    source,
    sourceDigest,
    fragments,
    candidates: fragments.map((fragment) => fragment.candidate),
  };
}

/**
 * Explicit-ID selection only (not CSS selection, not heading inference).
 * Returns a candidate only if that HTML ID uniquely identifies a supported
 * fragment; duplicate IDs anywhere in the document are an error.
 */
export function selectHtmlFragmentById(
  parsed: HtmlFragmentDocument,
  id: string,
  expectedFingerprint?: string,
): HtmlFragmentNode {
  if (!id) throw new Error('MMI_HTML_INVALID_SELECTOR: empty HTML ID');
  let occurrences = 0;
  const visit = (node: HtmlNode): void => {
    if (isElement(node) && attribute(node, 'id') === id) occurrences += 1;
    for (const child of childrenOf(node)) visit(child);
  };
  visit(parsed.document);

  if (occurrences !== 1) {
    throw new Error(
      `MMI_HTML_ID_NOT_UNIQUE: id ${JSON.stringify(id)} occurs ${occurrences} times`,
    );
  }

  const fragment = parsed.fragments.find((item) => item.id === id);
  if (!fragment) {
    throw new Error(`MMI_HTML_UNSUPPORTED_FRAGMENT: ${JSON.stringify(id)} is not a supported fragment`);
  }
  if (expectedFingerprint !== undefined
      && fragment.candidate.fingerprint.digest !== expectedFingerprint) {
    throw new Error('MMI_HTML_FRAGMENT_CHANGED: fragment fingerprint no longer matches review');
  }
  return fragment;
}

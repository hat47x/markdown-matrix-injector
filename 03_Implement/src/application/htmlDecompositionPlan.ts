/**
 * Read-only multi-fragment dependency plan for static HTML (#553).
 *
 * Outputs proposed link targets only: NO file writes, NO rewrites, NO claim
 * that an HTML fragment is a publishable or safely executable document.
 */
import path from 'node:path';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';

import {
  selectHtmlFragmentById,
  type HtmlFragmentDocument,
  type HtmlFragmentNode,
} from '../adapters/htmlFragmentAdapter.js';

type HtmlNode = DefaultTreeAdapterMap['node'];
type HtmlElement = DefaultTreeAdapterMap['element'];

export interface HtmlPlanSelection {
  /** Unique root element ID, confirmed by the user/reviewer. */
  id: string;
  /** Fingerprint returned by inspect, not an AI-generated approximation. */
  expectedFingerprint: string;
  /** Proposed workspace-relative POSIX .html path; no writing takes place. */
  output: string;
}

export interface HtmlPlanProblem {
  code:
    | 'MMI_HTML_UNRESOLVED_ANCHOR'
    | 'MMI_HTML_AMBIGUOUS_ANCHOR'
    | 'MMI_HTML_UNMATERIALIZED_ASSET'
    | 'MMI_HTML_UNMATERIALIZED_LINK'
    | 'MMI_HTML_ACTIVE_CONTENT'
    | 'MMI_HTML_INVALID_ANCHOR'
    | 'MMI_HTML_SOURCE_BASE_DEPENDENCY'
    | 'MMI_HTML_UNRESOLVED_IDREF'
    | 'MMI_HTML_CROSS_OUTPUT_IDREF';
  sourceId: string;
  detail: string;
}

export interface HtmlPlanAnchor {
  sourceId: string;
  href: string;
  /** The owning selected fragment, not necessarily the anchor ID. */
  targetFragmentId?: string;
  proposedHref?: string;
  status: 'same-output' | 'cross-output' | 'blocked';
}

export interface HtmlDecompositionPlan {
  schema: 'mmi.html-decomposition-plan/v0';
  source: string;
  sourceDigest: string;
  fragments: {
    id: string;
    output: string;
    structuralPath: string;
    kind: HtmlFragmentNode['candidate']['kind'];
    fingerprint: string;
  }[];
  /** All local fragment link rewrites are PROPOSALS, never changes to files. */
  anchors: HtmlPlanAnchor[];
  externalLinks: { sourceId: string; href: string }[];
  problems: HtmlPlanProblem[];
  /** Passing these checks does not prove artifact closure or publication parity. */
  hasIdentifiedBlockers: boolean;
}

function isElement(node: HtmlNode): node is HtmlElement {
  return 'tagName' in node;
}

function childNodes(node: HtmlNode): readonly HtmlNode[] {
  return 'childNodes' in node ? node.childNodes : [];
}

function portableOutput(output: string): string {
  if (!output || output.includes('\\') || output.startsWith('/')
    || /^[a-z]:/iu.test(output)
    || /[\x00-\x1f<>:"|?*]/u.test(output)
    || output.split('/').some((part) =>
      part === '' || part === '.' || part === '..'
      || /[. ]$/u.test(part)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))
    || !/\.html?$/iu.test(output)) {
    throw new Error('MMI_HTML_PLAN_INVALID_OUTPUT: use a plain workspace-relative .html path');
  }
  return output;
}

function isAncestorOf(parent: string, child: string): boolean {
  return child.startsWith(`${parent}/`);
}

interface ScanResult {
  ids: string[];
  anchors: string[];
  external: string[];
  idRefs: { target: string; attribute: string }[];
  problems: HtmlPlanProblem[];
}

function scanFragment(fragment: HtmlFragmentNode, id: string): ScanResult {
  const scan: ScanResult = {
    ids: [], anchors: [], external: [], idRefs: [], problems: [],
  };
  const problem = (code: HtmlPlanProblem['code'], detail: string): void => {
    scan.problems.push({ code, sourceId: id, detail });
  };
  const denyElements = new Set([
    'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button',
    'link', 'base', 'meta', 'template', 'foreignobject', 'canvas',
    'video', 'audio', 'track', 'source',
  ]);
  const root = parseFragment(fragment.html, { scriptingEnabled: false });
  const walk = (node: HtmlNode): void => {
    if (isElement(node)) {
      const tag = node.tagName.toLowerCase();
      if (denyElements.has(tag)) problem('MMI_HTML_ACTIVE_CONTENT', `unsupported element: ${tag}`);
      for (const attr of node.attrs) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();
        if (name === 'id') scan.ids.push(value);
        if (['aria-labelledby', 'aria-describedby', 'aria-controls',
          'aria-details', 'headers'].includes(name)) {
          for (const target of value.split(/\s+/u).filter(Boolean)) {
            scan.idRefs.push({ target, attribute: name });
          }
        }
        if (['for', 'list', 'form'].includes(name) && value) {
          scan.idRefs.push({ target: value, attribute: name });
        }
        if (/^on[a-z]/u.test(name) || name === 'srcdoc' || name === 'style'
          || /url\s*\(/iu.test(value)) {
          problem('MMI_HTML_ACTIVE_CONTENT', `unsupported attribute: ${name}`);
        }
        if (name === 'src' || name === 'srcset' || name === 'poster'
          || name === 'data' || name === 'action' || name === 'formaction') {
          problem('MMI_HTML_UNMATERIALIZED_ASSET', `unresolved asset: ${name}`);
        }
        if (name !== 'href' && name !== 'xlink:href') continue;
        if (value.startsWith('#')) {
          if (value.length > 1) scan.anchors.push(value);
        } else if (/^https?:\/\//iu.test(value) && tag === 'a') {
          scan.external.push(value);
        } else {
          problem('MMI_HTML_UNMATERIALIZED_LINK', `unsupported local/active link: ${value}`);
        }
      }
    }
    for (const child of childNodes(node)) walk(child);
  };
  walk(root);
  return scan;
}

/**
 * Require explicit, non-overlapping root fragments and unique output targets.
 * Builds a proposal for internal anchors without hiding unresolved references.
 */
export function planHtmlDecomposition(
  document: HtmlFragmentDocument,
  selections: readonly HtmlPlanSelection[],
): HtmlDecompositionPlan {
  if (selections.length === 0) {
    throw new Error('MMI_HTML_PLAN_EMPTY: select at least one reviewed fragment');
  }

  const usedIds = new Set<string>();
  const usedOutputs = new Set<string>();
  const selected = selections.map((selection) => {
    if (usedIds.has(selection.id)) {
      throw new Error('MMI_HTML_PLAN_DUPLICATE_SELECTION: fragment selected twice');
    }
    usedIds.add(selection.id);
    const output = portableOutput(selection.output);
    const outputKey = output.normalize('NFC').toLowerCase();
    if (usedOutputs.has(outputKey)) {
      throw new Error('MMI_HTML_PLAN_DUPLICATE_OUTPUT: two fragments share an output path');
    }
    usedOutputs.add(outputKey);
    const fragment = selectHtmlFragmentById(
      document, selection.id, selection.expectedFingerprint,
    );
    return { id: selection.id, output, fragment };
  });

  for (let i = 0; i < selected.length; i += 1) {
    for (let j = i + 1; j < selected.length; j += 1) {
      const left = selected[i].fragment.structuralPath;
      const right = selected[j].fragment.structuralPath;
      if (isAncestorOf(left, right) || isAncestorOf(right, left)) {
        throw new Error('MMI_HTML_PLAN_OVERLAP: selected fragments contain one another');
      }
    }
  }

  const scans = selected.map((item) => ({ item, scan: scanFragment(item.fragment, item.id) }));
  const owningFragments = new Map<string, typeof selected>();
  for (const { item, scan } of scans) {
    for (const id of scan.ids) {
      owningFragments.set(id, [...(owningFragments.get(id) ?? []), item]);
    }
  }

  // An ID may be duplicated elsewhere in the source outside selected roots.
  // A local anchor is not unambiguous merely because one selected fragment
  // happens to contain an element with that ID.
  const sourceIdCounts = new Map<string, number>();
  const countSourceIds = (node: HtmlNode): void => {
    if (isElement(node)) {
      for (const attr of node.attrs) {
        if (attr.name === 'id') {
          sourceIdCounts.set(attr.value, (sourceIdCounts.get(attr.value) ?? 0) + 1);
        }
      }
    }
    for (const child of childNodes(node)) countSourceIds(child);
  };
  countSourceIds(document.document);

  const sourceUsesBase = (node: HtmlNode): boolean => {
    if (isElement(node) && node.tagName.toLowerCase() === 'base') return true;
    return childNodes(node).some(sourceUsesBase);
  };

  const anchors: HtmlPlanAnchor[] = [];
  const problems = scans.flatMap(({ scan }) => scan.problems);
  if (sourceUsesBase(document.document)) {
    problems.push({
      code: 'MMI_HTML_SOURCE_BASE_DEPENDENCY',
      sourceId: '(document)',
      detail: 'source contains a base element; URL resolution must be reviewed',
    });
  }
  const externalLinks = scans.flatMap(({ item, scan }) =>
    scan.external.map((href) => ({ sourceId: item.id, href })));
  for (const { item, scan } of scans) {
    for (const { target, attribute } of scan.idRefs) {
      const owners = owningFragments.get(target) ?? [];
      const count = sourceIdCounts.get(target) ?? 0;
      if (count !== 1 || owners.length !== 1) {
        problems.push({
          code: 'MMI_HTML_UNRESOLVED_IDREF',
          sourceId: item.id,
          detail: `${attribute} references ${JSON.stringify(target)} without one selected, unique target`,
        });
      } else if (owners[0].output !== item.output) {
        problems.push({
          code: 'MMI_HTML_CROSS_OUTPUT_IDREF',
          sourceId: item.id,
          detail: `${attribute} references ${JSON.stringify(target)} in another output; cannot rewrite as a normal HTML IDREF`,
        });
      }
    }
    for (const href of scan.anchors) {
      let decoded: string;
      try {
        decoded = decodeURIComponent(href.slice(1));
      } catch {
        anchors.push({ sourceId: item.id, href, status: 'blocked' });
        problems.push({
          code: 'MMI_HTML_INVALID_ANCHOR',
          sourceId: item.id,
          detail: `invalid percent-encoding in ${href}`,
        });
        continue;
      }
      const owners = owningFragments.get(decoded) ?? [];
      const originalOccurrences = sourceIdCounts.get(decoded) ?? 0;
      if (owners.length !== 1 || originalOccurrences !== 1) {
        anchors.push({ sourceId: item.id, href, status: 'blocked' });
        problems.push({
          code: originalOccurrences > 1 || owners.length > 1
            ? 'MMI_HTML_AMBIGUOUS_ANCHOR'
            : 'MMI_HTML_UNRESOLVED_ANCHOR',
          sourceId: item.id,
          detail: originalOccurrences > 1 || owners.length > 1
            ? `${href} has duplicate identities in the source or selections`
            : `${href} is outside selected fragments or absent from the source`,
        });
        continue;
      }
      const target = owners[0];
      const same = target.output === item.output;
      const relativeOutput = path.posix.relative(path.posix.dirname(item.output), target.output);
      anchors.push({
        sourceId: item.id,
        href,
        targetFragmentId: target.id,
        proposedHref: same ? href : `${relativeOutput}${href}`,
        status: same ? 'same-output' : 'cross-output',
      });
    }
  }

  return {
    schema: 'mmi.html-decomposition-plan/v0',
    source: document.source,
    sourceDigest: document.sourceDigest,
    fragments: selected.map(({ id, output, fragment }) => ({
      id, output,
      structuralPath: fragment.structuralPath,
      kind: fragment.candidate.kind,
      fingerprint: fragment.candidate.fingerprint.digest,
    })),
    anchors,
    externalLinks,
    problems,
    hasIdentifiedBlockers: problems.length > 0,
  };
}

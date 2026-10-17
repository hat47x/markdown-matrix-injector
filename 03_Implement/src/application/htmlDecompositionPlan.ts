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
    | 'MMI_HTML_INVALID_ANCHOR';
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
    || output.includes('\0')
    || output.split('/').some((part) => part === '' || part === '.' || part === '..')
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
  problems: HtmlPlanProblem[];
}

function scanFragment(fragment: HtmlFragmentNode, id: string): ScanResult {
  const scan: ScanResult = { ids: [], anchors: [], external: [], problems: [] };
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
    const outputKey = output.toLowerCase();
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

  const anchors: HtmlPlanAnchor[] = [];
  const problems = scans.flatMap(({ scan }) => scan.problems);
  const externalLinks = scans.flatMap(({ item, scan }) =>
    scan.external.map((href) => ({ sourceId: item.id, href })));
  for (const { item, scan } of scans) {
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
      if (owners.length !== 1) {
        anchors.push({ sourceId: item.id, href, status: 'blocked' });
        problems.push({
          code: owners.length === 0
            ? 'MMI_HTML_UNRESOLVED_ANCHOR'
            : 'MMI_HTML_AMBIGUOUS_ANCHOR',
          sourceId: item.id,
          detail: `${href} is ${owners.length ? 'ambiguous' : 'outside selected fragments'}`,
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

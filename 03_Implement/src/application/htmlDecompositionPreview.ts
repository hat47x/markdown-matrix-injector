/**
 * Read-only serialization preview for a reviewed static HTML decomposition.
 *
 * No files or ledger entries are written. This is a structural HTML5 preview,
 * NOT a browser-safe publication, a sanitization result, or a detach receipt.
 */
import { createHash } from 'node:crypto';
import { parseFragment, serializeOuter, type DefaultTreeAdapterMap } from 'parse5';

import {
  selectHtmlFragmentById,
  type HtmlFragmentDocument,
} from '../adapters/htmlFragmentAdapter.js';
import {
  planHtmlDecomposition,
  type HtmlDecompositionPlan,
  type HtmlPlanSelection,
} from './htmlDecompositionPlan.js';

type HtmlNode = DefaultTreeAdapterMap['node'];
type HtmlElement = DefaultTreeAdapterMap['element'];

export interface HtmlPreviewFile {
  /** The exact workspace-relative output path proposed by the caller. */
  output: string;
  sourceId: string;
  /** Normalized HTML5 element serialization, NOT the source bytes. */
  html: string;
  digest: string;
  appliedAnchorRewrites: number;
}

export interface HtmlDecompositionPreview {
  plan: HtmlDecompositionPlan;
  /** No partial previews are emitted when the plan has identified blockers. */
  files: HtmlPreviewFile[];
  readyForReview: boolean;
}

function isElement(node: HtmlNode): node is HtmlElement {
  return 'tagName' in node;
}

function children(node: HtmlNode): readonly HtmlNode[] {
  return 'childNodes' in node ? node.childNodes : [];
}

function sha256(text: string): string {
  return 'sha256:' + createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Create complete in-memory HTML fragment previews and a source-to-target link
 * rewrite accounting record. No persistence, HTTP requests, or script execution.
 */
export function previewHtmlDecomposition(
  source: HtmlFragmentDocument,
  selections: readonly HtmlPlanSelection[],
): HtmlDecompositionPreview {
  // Revalidate every ID, fingerprint, original anchor, IDREF, and output name.
  const plan = planHtmlDecomposition(source, selections);
  if (plan.hasIdentifiedBlockers) {
    return { plan, files: [], readyForReview: false };
  }

  const files: HtmlPreviewFile[] = [];
  for (const selected of plan.fragments) {
    const fragment = selectHtmlFragmentById(
      source,
      selected.id,
      selected.fingerprint,
    );
    const root = parseFragment(fragment.html, { scriptingEnabled: false });
    const outerNodes = children(root).filter(isElement);
    if (outerNodes.length !== 1 || outerNodes[0].tagName !== fragment.tagName) {
      throw new Error('MMI_HTML_PREVIEW_STRUCTURE_CHANGED: fragment root is not unique');
    }
    const outer = outerNodes[0];

    // Anchor values may occur multiple times. Each occurrence needs an edit,
    // but a given sourceId + href must resolve to exactly one replacement.
    const replacements = new Map<string, string>();
    const expectedRewrites = plan.anchors.filter(
      (anchor) => anchor.sourceId === selected.id && anchor.status === 'cross-output',
    );
    for (const anchor of expectedRewrites) {
      if (!anchor.proposedHref) {
        throw new Error('MMI_HTML_PREVIEW_MISSING_REWRITE: planned link has no target');
      }
      const previous = replacements.get(anchor.href);
      if (previous && previous !== anchor.proposedHref) {
        throw new Error('MMI_HTML_PREVIEW_AMBIGUOUS_REWRITE: identical href has conflicting targets');
      }
      replacements.set(anchor.href, anchor.proposedHref);
    }

    let rewritten = 0;
    const walk = (node: HtmlNode): void => {
      if (isElement(node)) {
        for (const attribute of node.attrs) {
          if (attribute.name !== 'href' && attribute.name !== 'xlink:href') continue;
          const replacement = replacements.get(attribute.value);
          if (!replacement) continue;
          // Do not silently treat SVG or other namespaced references as links.
          if (node.tagName.toLowerCase() !== 'a'
              || node.namespaceURI !== 'http://www.w3.org/1999/xhtml'
              || attribute.name !== 'href') {
            throw new Error('MMI_HTML_PREVIEW_UNSUPPORTED_LINK_KIND: cannot rewrite non-HTML anchor');
          }
          attribute.value = replacement;
          rewritten += 1;
        }
      }
      for (const child of children(node)) walk(child);
    };
    walk(outer);
    if (rewritten !== expectedRewrites.length) {
      throw new Error('MMI_HTML_PREVIEW_REWRITE_MISMATCH: rewrite count differs from source plan');
    }

    const html = serializeOuter(outer) + '\n';
    files.push({
      sourceId: selected.id,
      output: selected.output,
      html,
      digest: sha256(html),
      appliedAnchorRewrites: rewritten,
    });
  }

  return { plan, files, readyForReview: true };
}

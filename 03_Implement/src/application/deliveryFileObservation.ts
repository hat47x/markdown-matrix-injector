import fs from 'node:fs';
import path from 'node:path';

import { LocalizedError } from '../core/messages/index.js';
import { stripInlineCode } from '../core/markdownLinks.js';
import {
  PathContainmentError,
  isPathWithinBoundary,
  resolveSourcePath,
} from '../core/pathResolver.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';
import { extractEmbedQueries } from '../parser/embedSyntax.js';

/** Exploratory read-only observation, not the contractually required delivery set. */
export const DELIVERY_FILE_OBSERVATION_SCHEMA =
  'mmi.delivery-file-observation/v0' as const;

export type DeliveryFileStatus =
  | 'resolved'
  | 'missing'
  | 'outside-workspace'
  | 'not-file'
  | 'unreadable';

export interface DeliveryFileReference {
  line: number;
  headings: string[];
  reference: string;
  sourcePath: string;
  status: DeliveryFileStatus;
  /** Workspace-relative display path; present only after safe resolution. */
  resolvedPath?: string;
  digest?: string;
  byteLength?: number;
  duplicateOfLine?: number;
  sameContentAsLine?: number;
}

export interface DeliveryFileObservation {
  schema: typeof DELIVERY_FILE_OBSERVATION_SCHEMA;
  scope: 'file-only-excel-mmi-embeds';
  /** This is referential closure only, never contractual or semantic completeness. */
  referentialCompleteness: 'empty' | 'complete' | 'incomplete';
  counts: {
    references: number;
    resolved: number;
    missing: number;
    outsideWorkspace: number;
    notFile: number;
    unreadable: number;
    duplicateReferences: number;
    sameContentDifferentFiles: number;
  };
  references: DeliveryFileReference[];
}

export interface ObserveDeliveryFilesOptions {
  markdownText: string;
  markdownFilePath: string;
  workspaceRoot: string;
}

/** Exclude HTML comment bodies across lines without altering the source or line numbers. */
function withoutHtmlComments(line: string, state: { open: boolean }): string {
  let at = 0;
  let visible = '';
  while (at < line.length) {
    if (state.open) {
      const end = line.indexOf('-->', at);
      if (end < 0) return visible;
      state.open = false;
      at = end + 3;
    } else {
      const start = line.indexOf('<!--', at);
      if (start < 0) return visible + line.slice(at);
      visible += line.slice(at, start);
      state.open = true;
      at = start + 4;
    }
  }
  return visible;
}

/**
 * The first #658 slice: file-only Excel MMI embeds in a single root Markdown.
 * Reuses the existing parser, containment resolver and source identity.
 *
 * It intentionally does not infer contractual deliverables, scan a directory,
 * recurse into referenced Markdown, or change the existing card manifest.
 */
export function observeDeliveryFiles(
  options: ObserveDeliveryFilesOptions,
): DeliveryFileObservation {
  const root = path.resolve(options.workspaceRoot);
  const markdownPath = path.resolve(options.markdownFilePath);
  if (!isPathWithinBoundary(markdownPath, root)) {
    throw new Error('Delivery Markdown must be inside the workspace');
  }

  const references: DeliveryFileReference[] = [];
  const headings: string[] = [];
  const firstLocation = new Map<string, number>();
  const firstDigest = new Map<string, { canonicalPath: string; line: number }>();
  let fence: { marker: string; width: number } | undefined;

  const htmlComment = { open: false };
  for (const [index, line] of options.markdownText.split(/\r?\n/u).entries()) {
    // A comment containing a fence-looking line must not open a real code fence.
    // Conversely, comment tokens inside a real code fence have no document effect.
    if (fence) {
      const closing = line.match(/^ {0,3}((?:\x60){3,}|~{3,})/u)?.[1];
      if (closing && fence.marker === closing[0] && closing.length >= fence.width) {
        fence = undefined;
      }
      continue;
    }

    // Code-spans are examples, not deliverable declarations. Mask them before
    // handling comments so a literal `<!--` does not swallow later references.
    const visible = withoutHtmlComments(stripInlineCode(line), htmlComment);
    const marker = visible.match(/^ {0,3}((?:\x60){3,}|~{3,})/u)?.[1];
    if (marker) {
      fence = { marker: marker[0], width: marker.length };
      continue;
    }

    const heading = visible.match(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*#*\s*$/u);
    if (heading) {
      const depth = heading[1].length;
      headings.splice(depth - 1);
      headings[depth - 1] = heading[2];
    }

    for (const embed of extractEmbedQueries(visible)) {
      // Only whole-workbook MMI references are provisional delivery entries.
      // An inline table, a plain Markdown link and non-Excel embeds are not.
      if (embed.target || embed.range || !/\.(?:xlsx|xlsm|xls)$/iu.test(embed.filepath)) {
        continue;
      }

      const record: DeliveryFileReference = {
        line: index + 1,
        headings: headings.filter((value): value is string => Boolean(value)),
        reference: embed.raw,
        sourcePath: embed.filepath,
        status: 'unreadable',
      };

      try {
        const resolved = resolveSourcePath({
          markdownFilePath: markdownPath,
          sourcePath: embed.filepath,
          workspaceRoot: root,
        });
        const stat = fs.statSync(resolved);
        if (!stat.isFile()) {
          record.status = 'not-file';
        } else {
          const canonical = fs.realpathSync(resolved);
          const identity = readSourceFileIdentity(resolved);
          record.status = 'resolved';
          record.resolvedPath = path.relative(root, resolved).split(path.sep).join('/');
          record.digest = identity.digest;
          record.byteLength = identity.byteLength;

          const priorLocation = firstLocation.get(canonical);
          if (priorLocation !== undefined) {
            record.duplicateOfLine = priorLocation;
          } else {
            firstLocation.set(canonical, record.line);
            const priorDigest = firstDigest.get(identity.digest);
            if (priorDigest && priorDigest.canonicalPath !== canonical) {
              record.sameContentAsLine = priorDigest.line;
            } else if (!priorDigest) {
              firstDigest.set(identity.digest, { canonicalPath: canonical, line: record.line });
            }
          }
        }
      } catch (error) {
        if (error instanceof PathContainmentError) {
          record.status = 'outside-workspace';
        } else if (error instanceof LocalizedError && error.messageId === 'sourceNotResolved') {
          record.status = 'missing';
        } else {
          // Permission errors and unstable/unreadable files never become PASS.
          record.status = 'unreadable';
        }
      }
      references.push(record);
    }
  }

  const count = (status: DeliveryFileStatus) =>
    references.filter((record) => record.status === status).length;
  const resolved = count('resolved');
  return {
    schema: DELIVERY_FILE_OBSERVATION_SCHEMA,
    scope: 'file-only-excel-mmi-embeds',
    referentialCompleteness: references.length === 0
      ? 'empty'
      : resolved === references.length ? 'complete' : 'incomplete',
    counts: {
      references: references.length,
      resolved,
      missing: count('missing'),
      outsideWorkspace: count('outside-workspace'),
      notFile: count('not-file'),
      unreadable: count('unreadable'),
      duplicateReferences: references.filter((record) => record.duplicateOfLine !== undefined).length,
      sameContentDifferentFiles: references.filter((record) => record.sameContentAsLine !== undefined).length,
    },
    references,
  };
}

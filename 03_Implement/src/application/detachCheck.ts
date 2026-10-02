import fs from 'node:fs';
import path from 'node:path';

import { FenceTracker, linkTargets, resolveLocalLink, stripInlineCode } from '../core/markdownLinks.js';
import { extractEmbedQueries } from '../parser/embedSyntax.js';

export interface DetachProblem {
  line: number;
  code: 'MMI_DETACH_REFERENCE_REMAINS' | 'MMI_DETACH_UNMATERIALIZED' | 'MMI_DETACH_LEGACY_CARD' | 'MMI_DETACH_BROKEN_LINK' | 'MMI_DETACH_LINK_OUTSIDE_ROOT';
  message: string;
  target?: string;
}

export interface DetachCheckResult {
  errors: number;
  problems: DetachProblem[];
}

export interface DetachCheckOptions {
  markdownFilePath: string;
  workspaceRoot: string;
}

/**
 * Verify the artifact being handed off is no longer dependent on MMI/source
 * references. This checks artifact closure, not business correctness.
 */
export function checkDetachedDocument(options: DetachCheckOptions): DetachCheckResult {
  const text = fs.readFileSync(options.markdownFilePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const problems: DetachProblem[] = [];
  const fence = new FenceTracker();

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (fence.skips(rawLine)) continue;
    const line = stripInlineCode(rawLine);

    for (const embed of extractEmbedQueries(line)) {
      problems.push({
        line: index + 1,
        code: 'MMI_DETACH_REFERENCE_REMAINS',
        message: 'MMI reference remains; materialize it before removing the source',
        target: embed.raw,
      });
    }
    if (line.includes('<!-- mmi:unmaterialized')) {
      problems.push({
        line: index + 1,
        code: 'MMI_DETACH_UNMATERIALIZED',
        message: 'materialization left an unresolved source-dependent reference',
      });
    }
    if (/^\s*(?:>\s*)+別紙\s*[:：]/u.test(line)) {
      problems.push({
        line: index + 1,
        code: 'MMI_DETACH_LEGACY_CARD',
        message: 'legacy 別紙 card contains no detached artifact',
      });
    }
    for (const target of linkTargets(rawLine)) {
      const resolved = resolveLocalLink(options.markdownFilePath, options.workspaceRoot, target);
      if (!resolved) continue;
      if (resolved.outsideRoot) {
        problems.push({
          line: index + 1,
          code: 'MMI_DETACH_LINK_OUTSIDE_ROOT',
          message: `local link leaves the detach workspace boundary: ${target}`,
          target,
        });
      } else if (!fs.existsSync(resolved.absolutePath)) {
        problems.push({
          line: index + 1,
          code: 'MMI_DETACH_BROKEN_LINK',
          message: `local link target does not exist: ${target}`,
          target,
        });
      }
    }
  }

  return { errors: problems.length, problems };
}

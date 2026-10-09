import path from 'node:path';

import { extractEmbedQueries } from '../parser/embedSyntax.js';

function decodedLocalReference(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizedFilesystemPath(value: string): string {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === 'win32'
    ? normalized.toLocaleLowerCase('en-US')
    : normalized;
}

function localReferenceCandidates(
  sourceReference: string,
  markdownFilePath: string,
  workspaceRoot?: string,
): string[] {
  const decoded = decodedLocalReference(sourceReference);
  if (path.isAbsolute(decoded)) {
    return [normalizedFilesystemPath(decoded)];
  }
  if (/^[a-z][a-z0-9+.-]*:/iu.test(decoded)) {
    return [];
  }
  const candidates = [
    path.resolve(path.dirname(markdownFilePath), decoded),
    ...(workspaceRoot ? [path.resolve(workspaceRoot, decoded)] : []),
  ];
  return [...new Set(candidates.map(normalizedFilesystemPath))];
}

/**
 * Returns true only when the Markdown text contains an MMI embed that can
 * resolve to the changed workbook. This is intentionally source-specific:
 * unrelated workbook saves must not force preview work.
 *
 * Both document-relative and workspace-root-relative MMI references are
 * considered because diagnostics and authoring support both forms.
 */
export function markdownReferencesWorkbook(
  markdownText: string,
  markdownFilePath: string,
  sourcePath: string,
  workspaceRoot?: string,
): boolean {
  const source = normalizedFilesystemPath(sourcePath);
  return extractEmbedQueries(markdownText).some((embed) =>
    localReferenceCandidates(
      embed.filepath,
      markdownFilePath,
      workspaceRoot,
    ).includes(source),
  );
}

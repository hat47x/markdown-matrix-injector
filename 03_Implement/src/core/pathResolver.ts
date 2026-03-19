import path from 'node:path';
import fs from 'node:fs';

export interface ResolveSourcePathOptions {
  markdownFilePath: string;
  sourcePath: string;
  workspaceRoot?: string;
}

export function resolveSourcePath(options: ResolveSourcePathOptions): string {
  const candidates = [
    path.resolve(path.dirname(options.markdownFilePath), options.sourcePath),
    options.workspaceRoot ? path.resolve(options.workspaceRoot, options.sourcePath) : undefined,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to resolve source file: ${options.sourcePath}`);
}

#!/usr/bin/env node
/**
 * Minimal MMI CLI bootstrap.
 *
 * Keep this file free of product/runtime dependencies so unsupported Node.js
 * versions fail with an actionable message before loading packages such as
 * SheetJS that may use newer JavaScript syntax.
 */

// Node built-ins only: safe to load on any supported or unsupported Node version.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const MINIMUM_NODE_MAJOR = 20;

export function nodeMajor(version: string): number | undefined {
  const match = /^(\d+)(?:\.|$)/u.exec(version.trim());
  if (!match) return undefined;
  const major = Number(match[1]);
  return Number.isInteger(major) ? major : undefined;
}

export function supportsNodeVersion(
  version: string,
  minimumMajor = MINIMUM_NODE_MAJOR,
): boolean {
  const major = nodeMajor(version);
  return major !== undefined && major >= minimumMajor;
}

export async function bootstrap(
  argv: readonly string[] = process.argv.slice(2),
  nodeVersion = process.versions.node,
): Promise<number> {
  if (!supportsNodeVersion(nodeVersion)) {
    console.error(
      `mmi: Node.js ${MINIMUM_NODE_MAJOR} or newer is required; current runtime is ${nodeVersion}.\n`
      + 'Install a supported Node.js release and run mmi again.',
    );
    return 2;
  }

  const { main } = await import('./mmi.js');
  return main([...argv]);
}

if (
  process.argv[1]
  && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
) {
  bootstrap().then(
    (code) => { process.exitCode = code; },
    (error) => {
      console.error(
        `mmi: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 2;
    },
  );
}

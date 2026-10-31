#!/usr/bin/env node
/**
 * Minimal `mmi-mcp` bootstrap.
 *
 * `mmi-mcp` speaks JSON-RPC over stdout, so an unsupported Node.js version must
 * be reported on stderr only, before `mcp.js` loads packages such as SheetJS
 * that may use newer JavaScript syntax. The version check is shared with the
 * `mmi` bootstrap. Keep this file free of product/runtime dependencies.
 */

// Node built-ins and the dependency-free `mmi` bootstrap only.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MINIMUM_NODE_MAJOR, supportsNodeVersion } from './bootstrap.js';

export async function bootstrapMcp(
  argv: readonly string[] = process.argv.slice(2),
  nodeVersion = process.versions.node,
): Promise<number> {
  if (!supportsNodeVersion(nodeVersion)) {
    // stderr only: stdout belongs to the MCP stdio transport.
    console.error(
      `mmi-mcp: Node.js ${MINIMUM_NODE_MAJOR} or newer is required; current runtime is ${nodeVersion}.\n`
      + 'Install a supported Node.js release and run mmi-mcp again.',
    );
    return 2;
  }

  const { main } = await import('./mcp.js');
  return main([...argv]);
}

if (
  process.argv[1]
  && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
) {
  bootstrapMcp().then(
    (code) => { process.exitCode = code; },
    (error) => {
      console.error(`mmi-mcp: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 2;
    },
  );
}

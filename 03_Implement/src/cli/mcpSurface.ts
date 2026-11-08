import { createHash } from 'node:crypto';

/**
 * `mmi.mcp-surface/v1` -- the machine-readable declaration of what `tools/list`
 * publishes. It is the server's own claim: a connection side can pin the
 * `digest` and detect a changed public surface, but it cannot learn from this
 * value alone whether the implementation honours `readOnly`.
 */
export const MCP_SURFACE_CONTRACT = 'mmi.mcp-surface/v1';

export interface McpSurfaceTool {
  name: string;
  inputSchema: unknown;
}

export interface McpSurfaceDeclaration {
  contract: typeof MCP_SURFACE_CONTRACT;
  readOnly: boolean;
  tools: Array<{ name: string; readOnly: boolean }>;
  digest: string;
  digestScope: 'name+inputSchema';
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * sha256 over the tool names and inputSchemas, sorted by name with object keys
 * sorted. `description` is left out so that rewording a sentence does not
 * invalidate a pinned value.
 */
export function mcpSurfaceDigest(tools: readonly McpSurfaceTool[]): string {
  const items = [...tools]
    .map((tool) => ({ name: tool.name, inputSchema: canonicalize(tool.inputSchema) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return `sha256:${createHash('sha256').update(JSON.stringify(items), 'utf8').digest('hex')}`;
}

export function buildMcpSurface(
  tools: readonly McpSurfaceTool[],
  readOnlyOf: (name: string) => boolean,
): McpSurfaceDeclaration {
  const declared = tools.map((tool) => ({ name: tool.name, readOnly: readOnlyOf(tool.name) }));
  return {
    contract: MCP_SURFACE_CONTRACT,
    readOnly: declared.every((tool) => tool.readOnly),
    tools: declared,
    digest: mcpSurfaceDigest(tools),
    digestScope: 'name+inputSchema',
  };
}

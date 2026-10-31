#!/usr/bin/env node
/**
 * `mmi-mcp` -- a read-only Model Context Protocol server for MMI.
 *
 * The server speaks JSON-RPC 2.0 over stdio (one JSON message per line, not
 * the Content-Length framing) and calls the same Application/CLI functions as
 * `mmi`. It never exposes extract/import/materialize/html-commit, and it never
 * writes a source, ledger or output file. It also does not open a network
 * connection: the only transport is the stdin/stdout stdio channel.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import type { CandidateLedgerFilter } from '../core/candidateLedgerView.js';
import { semanticCandidateSchemaJson } from '../core/candidateContract.js';
import { DEFAULT_LEDGER_FILE } from '../core/importLedger.js';
import { auditHtmlDecomposition } from '../application/auditHtmlDecomposition.js';
import type { HtmlPlanSelection } from '../application/htmlDecompositionPlan.js';
import { isPathWithinBoundary } from '../core/pathResolver.js';
import { importLedgerSchemaJson, reviewDecisionsSchemaJson } from '../core/reviewContracts.js';
import { createAiHandoffPackage, parseAiHandoffPackage } from '../dx/aiHandoff.js';
import { validateAiHandoffCandidateSelection } from '../dx/aiHandoffCandidateSelectionValidation.js';
import { validateAiHandoffNotationProposal } from '../dx/aiHandoffProposalValidation.js';
import { validateAiHandoffTransformationProposal } from '../dx/aiHandoffTransformationValidation.js';
import {
  applyLedgerView,
  checkPaths,
  collectMarkdownFiles,
  inspectSource,
  readCliVersion,
} from './mmi.js';
import { readBuildIdentity } from './buildIdentity.js';
import { checkExpectedSourceDigest } from '../core/sourceIdentity.js';
import { runFind, runSelect } from './navigateCommands.js';
import { RenderError, renderDocumentHtml, renderDocumentMarkdown } from './render.js';

export const MCP_PROTOCOL_VERSION = '2024-11-05';
export const MCP_MAX_LINE_BYTES = 8 * 1024 * 1024;

const SERVER_NAME = 'markdown-matrix-injector';
const JSON_RPC_VERSION = '2.0';

const INSTRUCTIONS = [
  'MMIの読み取り・検証ツールです。原本・ledger・成果物を変更しません。',
  'inspectは既定で構造だけを返します。値が必要なときだけvaluesを指定してください。',
  'checkでエラー0件を確認してから、renderで本文と表の一致を確かめてください。',
].join('\n');

type JsonObject = Record<string, unknown>;

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonObject;
}

export const MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: 'schema',
    description:
      'Return a public MMI JSON Schema. Read-only. contract is one of candidate, ledger, review-decisions.',
    inputSchema: {
      type: 'object',
      properties: {
        contract: { type: 'string', enum: ['candidate', 'ledger', 'review-decisions'] },
      },
      required: ['contract'],
      additionalProperties: false,
    },
  },
  {
    name: 'html-audit',
    description:
      'Read-only audit of reviewed HTML fragment outputs and their import ledger. ' +
      'Uses the same approved manifest as mmi html-commit; reports complete/incomplete/stale/blocked. ' +
      'Does not create, remove, repair, or approve files or ledger records.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Existing static HTML source path within the workspace.' },
        plan: { type: 'string', description: 'Existing reviewed html-commit JSON manifest with sourceDigest and fragments.' },
        ledger: { type: 'string', description: 'Optional existing ledger path. Defaults to mmi-ledger.json.' },
      },
      required: ['source', 'plan'],
      additionalProperties: false,
    },
  },
  {
    name: 'inspect',
    description:
      'List table/image/Tree Candidates, sheets, regions and reference examples for a source. Returns structure only by default; values are included only when values is set (same as mmi inspect --values). Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source file path within the workspace root.' },
        values: {
          type: 'integer',
          minimum: 0,
          description: 'Number of sample rows to include. 0 (default) returns structure only.',
        },
        from: {
          type: 'string',
          description: 'Markdown document the reference will be written into; references become relative to it.',
        },
        ledger: {
          type: 'string',
          description: 'Ledger path within the workspace root. Defaults to mmi-ledger.json.',
        },
        unimported: { type: 'boolean', description: 'Show only Candidates not yet in the ledger.' },
        excludeImported: { type: 'boolean', description: 'Exclude Candidates already in the ledger.' },
        expectedSourceDigest: { type: 'string', description: 'Expected source digest (sha256:...) from inspect locator.sourceDigest. The call is refused when the source no longer has this digest. Same as mmi inspect --expected-source-digest.' },
      },
      required: ['source'],
      additionalProperties: false,
    },
  },
  {
    name: 'check',
    description:
      'Validate MMI references in Markdown files or directories within the workspace. Returns the same {errors, problems} JSON as mmi check --json. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Markdown files or directories within the workspace root.',
        },
      },
      required: ['paths'],
      additionalProperties: false,
    },
  },
  {
    name: 'render',
    description:
      'Expand MMI references in one Markdown document. Returns the same text as mmi render (md or html). Read-only: does not write output.',
    inputSchema: {
      type: 'object',
      properties: {
        document: { type: 'string', description: 'Markdown file within the workspace root.' },
        to: { type: 'string', enum: ['md', 'html'], description: 'Output format. Defaults to md.' },
      },
      required: ['document'],
      additionalProperties: false,
    },
  },
  {
    name: 'select',
    description:
      'Select a table, columns and rows by name and return the MMI reference. Returns the same JSON as mmi select --json. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Workbook or CSV path within the workspace root.' },
        table: { type: 'string', description: 'Table as sheet!range, for example 機能一覧!A1:F11.' },
        candidate: { type: 'string', description: 'Table Candidate fingerprint from inspect.' },
        sheet: { type: 'string' },
        columns: { type: 'string', description: 'Comma-separated column headings (the header text of the table, not column letters), e.g. 機能ID,機能名. Same as mmi select --columns.' },
        contains: { type: 'string', description: 'Keep rows where a column contains this text.' },
        in: { type: 'string', description: 'Column heading (header text, not a column letter) that contains is applied to. Must be one of the shown columns. Same as mmi select --in.' },
        first: { type: 'integer', minimum: 0, description: 'Keep the first N rows.' },
        from: { type: 'string', description: 'Markdown document the reference will be written into.' },
        expectedSourceDigest: { type: 'string', description: 'Expected source digest (sha256:...) from inspect locator.sourceDigest. The call is refused when the source no longer has this digest. Same as mmi select --expected-source-digest.' },
      },
      required: ['source'],
      additionalProperties: false,
    },
  },
  {
    name: 'find',
    description:
      'Find table Candidates by description within the workspace. Returns the same JSON as mmi find --json. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Description of the table to find.' },
        from: { type: 'string', description: 'Markdown document the reference will be written into.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'handoff',
    description:
      'Build a local AI handoff package from inspected Candidates and optional document diagnostics. MMI does not send it anywhere. Returns the same JSON as mmi handoff --json. Values are omitted unless includeValues is true.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source file path within the workspace root.' },
        task: { type: 'string', description: 'What the external agent should propose.' },
        document: { type: 'string', description: 'Markdown document to check for diagnostics.' },
        includeValues: {
          type: 'boolean',
          description: 'Include Candidate claim values explicitly. Defaults to false.',
        },
      },
      required: ['source', 'task'],
      additionalProperties: false,
    },
  },
  {
    name: 'validate-proposal',
    description:
      'Re-validate an MMI notation proposal against a handoff package and document. Returns the same JSON as mmi validate-proposal --json. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        notation: { type: 'string', description: 'One proposed MMI notation.' },
        package: { type: 'string', description: 'Handoff package JSON path within the workspace root.' },
        document: { type: 'string', description: 'Markdown document within the workspace root.' },
      },
      required: ['notation', 'package', 'document'],
      additionalProperties: false,
    },
  },
  {
    name: 'validate-selection',
    description:
      'Re-validate a Candidate-selection proposal against a handoff package. Returns the same JSON as mmi validate-selection --json. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        proposal: {
          description: 'Proposal JSON path within the workspace root, or the proposal object itself.',
          anyOf: [{ type: 'string' }, { type: 'object' }],
        },
        package: { type: 'string', description: 'Handoff package JSON path within the workspace root.' },
      },
      required: ['proposal', 'package'],
      additionalProperties: false,
    },
  },
  {
    name: 'validate-transformation',
    description:
      'Re-validate a Linked/Extracted transformation proposal against a handoff package and document. Returns the same JSON as mmi validate-transformation --json. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        proposal: {
          description: 'Proposal JSON path within the workspace root, or the proposal object itself.',
          anyOf: [{ type: 'string' }, { type: 'object' }],
        },
        package: { type: 'string', description: 'Handoff package JSON path within the workspace root.' },
        document: { type: 'string', description: 'Markdown document within the workspace root.' },
      },
      required: ['proposal', 'package', 'document'],
      additionalProperties: false,
    },
  },
];

export const MCP_TOOL_NAMES: readonly string[] = MCP_TOOLS.map((tool) => tool.name);

// tools/list declares additionalProperties:false. Enforce it at call time so a
// misspelled pin such as "expectedSourceDigests" is rejected instead of being
// silently ignored and returning an unpinned success.
function rejectUnknownArguments(toolName: string, args: JsonObject): void {
  const definition = MCP_TOOLS.find((tool) => tool.name === toolName);
  const properties = definition?.inputSchema.properties;
  if (!isObject(properties)) return;
  const accepted = Object.keys(properties);
  const unknown = Object.keys(args).filter((key) => !accepted.includes(key));
  if (unknown.length > 0) {
    throw new InvalidParamsError(
      `Unknown argument ${unknown.map((key) => `"${key}"`).join(', ')} for tool ${toolName}. `
      + `Accepted arguments: ${accepted.join(', ')}.`,
    );
  }
}

export interface McpServerOptions {
  /** Workspace boundary. Paths outside it are rejected. Defaults to process.cwd(). */
  root: string;
  /** Display base for paths in CLI-compatible results. Defaults to root. */
  displayCwd?: string;
  /** Server version reported by initialize. Defaults to the package version. */
  version?: string;
}

export interface McpServer {
  readonly root: string;
  readonly displayCwd: string;
  handleLine(line: string): Promise<string | undefined>;
}

class InvalidParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidParamsError';
  }
}

/**
 * Machine-readable reason for a failed tool call. Clients can branch on the
 * code instead of matching message text, which varies with Node.js and the OS.
 * - outside-root: an argument or a link leaves the workspace root.
 * - not-found: the file or directory does not exist.
 * - parse-failed: the input exists but could not be read or parsed.
 * - digest-mismatch: the source no longer has the expectedSourceDigest the caller gave.
 * - tool-failed: any other failure while running the tool.
 */
export type McpFailureCode =
  | 'outside-root'
  | 'not-found'
  | 'parse-failed'
  | 'digest-mismatch'
  | 'tool-failed';

export const MCP_FAILURE_CODES: readonly McpFailureCode[] = [
  'outside-root',
  'not-found',
  'parse-failed',
  'digest-mismatch',
  'tool-failed',
];

export const MCP_ERROR_CONTRACT = 'mmi.mcp-error/v1';

class ToolFailure extends Error {
  constructor(message: string, readonly code: McpFailureCode) {
    super(message);
    this.name = 'ToolFailure';
  }
}

/** Wrap a lower-level error, keeping ENOENT/ENOTDIR apart from other failures. */
function wrapFailure(error: unknown, fallback: McpFailureCode = 'parse-failed'): ToolFailure {
  if (error instanceof ToolFailure) return error;
  const errno = isObject(error) ? error.code : undefined;
  const code = errno === 'ENOENT' || errno === 'ENOTDIR' ? 'not-found' : fallback;
  return new ToolFailure(messageOf(error), code);
}

/** Classify the stderr text of a CLI runner that reports failures as text. */
function failureFromText(text: string, fallback: string): ToolFailure {
  const message = text || fallback;
  const code: McpFailureCode = /ENOENT|ENOTDIR|no such file or directory/iu.test(message)
    ? 'not-found'
    : /source digest mismatch/u.test(message)
      ? 'digest-mismatch'
      : 'tool-failed';
  return new ToolFailure(message, code);
}

/**
 * Remove host absolute paths from an error message. Paths under the workspace
 * root become root-relative; any other absolute path becomes `<path>`.
 */
export function redactHostPaths(message: string, root: string): string {
  let out = message;
  for (const variant of new Set([root, root.replace(/\\/gu, '/')])) {
    if (variant.length === 0) continue;
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    out = out.replace(new RegExp(escaped + '[\\\\/]?', 'giu'), '');
  }
  out = out.replace(/[A-Za-z]:[\\/][^\s'"]*/gu, '<path>');
  out = out.replace(/(?<=^|[\s'"(])\/(?:[^\s'"/]+\/)+[^\s'"]*/gu, '<path>');
  return out;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function realpathOrSelf(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch {
    return target;
  }
}

/** Real path of the target, or of the nearest existing ancestor for a new path. */
function realpathOfNearest(target: string): string {
  let current = target;
  for (;;) {
    if (fs.existsSync(current)) return realpathOrSelf(current);
    const parent = path.dirname(current);
    if (parent === current) return target;
    current = parent;
  }
}

function requiredString(args: JsonObject, name: string): string {
  const value = args[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidParamsError(`Argument "${name}" must be a non-empty string.`);
  }
  return value;
}

function optionalString(args: JsonObject, name: string): string | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidParamsError(`Argument "${name}" must be a non-empty string when provided.`);
  }
  return value;
}

function optionalBoolean(args: JsonObject, name: string): boolean | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new InvalidParamsError(`Argument "${name}" must be a boolean when provided.`);
  }
  return value;
}

function optionalInteger(args: JsonObject, name: string, minimum: number): number | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new InvalidParamsError(`Argument "${name}" must be an integer >= ${minimum}.`);
  }
  return value;
}

function requiredStringArray(args: JsonObject, name: string): string[] {
  const value = args[name];
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidParamsError(`Argument "${name}" must be a non-empty array of strings.`);
  }
  return value.map((item, index) => {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new InvalidParamsError(`Argument "${name}[${index}]" must be a non-empty string.`);
    }
    return item;
  });
}

function rpcError(id: string | number | null, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: JSON_RPC_VERSION, id, error: { code, message } });
}

function rpcResult(id: string | number | null, result: unknown): string {
  return JSON.stringify({ jsonrpc: JSON_RPC_VERSION, id, result });
}

class McpServerImplementation implements McpServer {
  readonly root: string;
  readonly displayCwd: string;
  private readonly version: string;
  private initialized = false;

  constructor(options: McpServerOptions) {
    this.root = path.resolve(options.root);
    this.displayCwd = path.resolve(options.displayCwd ?? this.root);
    this.version = options.version ?? readCliVersion();
  }

  async handleLine(line: string): Promise<string | undefined> {
    if (Buffer.byteLength(line, 'utf8') > MCP_MAX_LINE_BYTES) {
      return rpcError(
        null,
        -32600,
        `Message exceeds the ${MCP_MAX_LINE_BYTES} byte stdin limit.`,
      );
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      return rpcError(null, -32700, 'Parse error: the line is not valid JSON.');
    }
    return this.handleValue(value);
  }

  private async handleValue(value: unknown): Promise<string | undefined> {
    if (Array.isArray(value)) {
      return rpcError(null, -32600, 'JSON-RPC batch requests are not supported.');
    }
    if (!isObject(value)) {
      return rpcError(null, -32600, 'Invalid Request: the message must be a JSON object.');
    }
    const message = value;
    if (message.jsonrpc !== undefined && message.jsonrpc !== JSON_RPC_VERSION) {
      return rpcError(null, -32600, 'Invalid Request: jsonrpc must be "2.0".');
    }

    const hasId = Object.prototype.hasOwnProperty.call(message, 'id');
    const id = hasId ? message.id : undefined;
    if (hasId && !(typeof id === 'string' || typeof id === 'number' || id === null)) {
      return rpcError(null, -32600, 'Invalid Request: id must be a string, number or null.');
    }
    const method = message.method;
    if (typeof method !== 'string' || method.length === 0) {
      return hasId
        ? rpcError(id as string | number | null, -32600, 'Invalid Request: method must be a string.')
        : undefined;
    }

    if (!hasId) {
      this.handleNotification(method);
      return undefined;
    }
    const requestId = id as string | number | null;

    try {
      if (method === 'initialize') {
        return rpcResult(requestId, this.initializeResult(message.params));
      }
      if (method === 'ping') return rpcResult(requestId, {});
      if (method === 'notifications/initialized') {
        this.initialized = true;
        return rpcResult(requestId, {});
      }
      if (!this.initialized) {
        return rpcError(
          requestId,
          -32002,
          'Server is not initialized. Send initialize before other requests.',
        );
      }
      if (method === 'tools/list') {
        return rpcResult(requestId, { tools: MCP_TOOLS });
      }
      if (method === 'tools/call') {
        return await this.callTool(requestId, message.params);
      }
      return rpcError(requestId, -32601, `Method not found: ${method}`);
    } catch (error) {
      if (error instanceof InvalidParamsError) {
        return rpcError(requestId, -32602, error.message);
      }
      return rpcError(requestId, -32603, `Internal error: ${messageOf(error)}`);
    }
  }

  private handleNotification(method: string): void {
    if (method === 'notifications/initialized') this.initialized = true;
  }

  private initializeResult(params: unknown): JsonObject {
    this.initialized = true;
    const requested = isObject(params) && typeof params.protocolVersion === 'string'
      ? params.protocolVersion
      : null;
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: this.version },
      instructions: INSTRUCTIONS,
      _meta: {
        'mmi/buildIdentity': readBuildIdentity(this.version),
        'mmi/protocolNegotiation': {
          requested,
          selected: MCP_PROTOCOL_VERSION,
          compatible: requested === MCP_PROTOCOL_VERSION,
        },
      },
    };
  }

  private async callTool(
    requestId: string | number | null,
    params: unknown,
  ): Promise<string> {
    if (!isObject(params)) {
      throw new InvalidParamsError('tools/call params must be an object.');
    }
    const name = params.name;
    if (typeof name !== 'string' || name.length === 0) {
      throw new InvalidParamsError('tools/call params.name must be a non-empty string.');
    }
    const args = params.arguments === undefined ? {} : params.arguments;
    if (!isObject(args)) {
      throw new InvalidParamsError('tools/call params.arguments must be an object.');
    }
    if (!MCP_TOOL_NAMES.includes(name)) {
      throw new InvalidParamsError(`Unknown tool: ${name}`);
    }
    rejectUnknownArguments(name, args);

    try {
      const text = await this.invokeTool(name, args);
      return rpcResult(requestId, {
        content: [{ type: 'text', text }],
        isError: false,
      });
    } catch (error) {
      if (error instanceof InvalidParamsError) throw error;
      const failure = error instanceof ToolFailure ? error : wrapFailure(error, 'tool-failed');
      const message = redactHostPaths(failure.message, this.root);
      const detail = { contract: MCP_ERROR_CONTRACT, code: failure.code, message };
      // 2024-11-05 has no structuredContent; _meta is the place the base
      // protocol reserves for extra data. Newer clients read structuredContent.
      return rpcResult(requestId, {
        content: [{ type: 'text', text: `mmi: ${message}` }],
        structuredContent: detail,
        _meta: { 'mmi/error': detail },
        isError: true,
      });
    }
  }

  private async invokeTool(name: string, args: JsonObject): Promise<string> {
    switch (name) {
      case 'schema':
        return this.schemaTool(args);
      case 'inspect':
        return this.inspectTool(args);
      case 'html-audit':
        return this.htmlAuditTool(args);
      case 'check':
        return await this.checkTool(args);
      case 'render':
        return this.renderTool(args);
      case 'select':
        return this.selectTool(args);
      case 'find':
        return await this.findTool(args);
      case 'handoff':
        return await this.handoffTool(args);
      case 'validate-proposal':
        return await this.validateProposalTool(args);
      case 'validate-selection':
        return this.validateSelectionTool(args);
      case 'validate-transformation':
        return await this.validateTransformationTool(args);
      default:
        throw new InvalidParamsError(`Unknown tool: ${name}`);
    }
  }

  private schemaTool(args: JsonObject): string {
    const contract = requiredString(args, 'contract');
    const schemas: Record<string, () => Record<string, unknown>> = {
      candidate: semanticCandidateSchemaJson,
      ledger: importLedgerSchemaJson,
      'review-decisions': reviewDecisionsSchemaJson,
    };
    const schema = schemas[contract];
    if (!schema) {
      throw new InvalidParamsError(
        'Argument "contract" must be one of: candidate, ledger, review-decisions.',
      );
    }
    return JSON.stringify(schema(), null, 2);
  }

  private htmlAuditTool(args: JsonObject): string {
    for (const name of Object.keys(args)) {
      if (!['source', 'plan', 'ledger'].includes(name)) {
        throw new InvalidParamsError(`Unexpected html-audit argument "${name}": this tool is read-only.`);
      }
    }
    const sourcePath = this.resolveInsideRoot(requiredString(args, 'source'), 'source');
    const planPath = this.resolveInsideRoot(requiredString(args, 'plan'), 'plan');
    const ledgerPath = this.resolveInsideRoot(
      optionalString(args, 'ledger') ?? DEFAULT_LEDGER_FILE, 'ledger',
    );
    const manifest = this.readJson(planPath, 'html-audit plan');
    if (!isObject(manifest)
        || typeof manifest.sourceDigest !== 'string'
        || !/^sha256:[0-9a-f]{64}$/u.test(manifest.sourceDigest)
        || !Array.isArray(manifest.fragments)
        || manifest.fragments.some((item) =>
          !isObject(item)
          || typeof item.id !== 'string'
          || typeof item.output !== 'string'
          || typeof item.expectedFingerprint !== 'string')) {
      throw new InvalidParamsError(
        'html-audit plan requires sourceDigest (sha256) and fragments with id, output, expectedFingerprint.',
      );
    }
    try {
      const report = auditHtmlDecomposition({
        workspaceRoot: this.root,
        sourcePath,
        ledgerPath,
        selections: manifest.fragments as HtmlPlanSelection[],
        expectedSourceDigest: manifest.sourceDigest,
      });
      // An inconsistent but well-formed batch is a successful inspection with
      // a non-complete status, not an RPC exception or implicit repair request.
      return JSON.stringify(report, null, 2);
    } catch (error) {
      throw wrapFailure(error);
    }
  }

  private inspectTool(args: JsonObject): string {
    const source = this.resolveInsideRoot(requiredString(args, 'source'), 'source');
    const values = optionalInteger(args, 'values', 0) ?? 0;
    const from = this.resolveOptionalInsideRoot(args, 'from');
    const ledgerOption = optionalString(args, 'ledger');
    const unimported = optionalBoolean(args, 'unimported') ?? false;
    const excludeImported = optionalBoolean(args, 'excludeImported') ?? false;
    if (unimported && excludeImported) {
      throw new InvalidParamsError('Arguments "unimported" and "excludeImported" cannot be combined.');
    }

    const expectedSourceDigest = optionalString(args, 'expectedSourceDigest');
    if (expectedSourceDigest !== undefined) {
      let check;
      try {
        check = checkExpectedSourceDigest(source, expectedSourceDigest);
      } catch (error) {
        throw new InvalidParamsError(messageOf(error));
      }
      if (!check.ok) throw new ToolFailure(check.message, 'digest-mismatch');
    }

    let raw;
    try {
      raw = inspectSource(source, values, from, undefined, undefined, this.displayCwd);
    } catch (error) {
      throw wrapFailure(error);
    }
    const ledgerPath = ledgerOption
      ? this.resolveInsideRoot(ledgerOption, 'ledger')
      : path.resolve(this.root, DEFAULT_LEDGER_FILE);
    const filter: CandidateLedgerFilter = unimported
      ? 'unimported'
      : excludeImported
        ? 'exclude-imported'
        : 'all';
    const useLedger = Boolean(
      ledgerOption || unimported || excludeImported || fs.existsSync(ledgerPath),
    );
    const result = useLedger
      ? applyLedgerView(raw, source, ledgerPath, filter, undefined, this.displayCwd)
      : raw;
    return JSON.stringify(result, null, 2);
  }

  private async checkTool(args: JsonObject): Promise<string> {
    const inputs = requiredStringArray(args, 'paths');
    const files = inputs.flatMap((input) => {
      const target = this.resolveInsideRoot(input, 'paths');
      let collected: string[];
      try {
        collected = collectMarkdownFiles(target);
      } catch (error) {
        throw wrapFailure(error);
      }
      // A directory walk can meet a symlinked Markdown file. Re-check every
      // collected file against the real root before reading it.
      return collected.map((file) => this.resolveInsideRoot(file, 'paths'));
    });
    const problems = await checkPaths(files, this.root, this.displayCwd);
    const errors = problems.filter((problem) => problem.severity === 'error').length;
    return JSON.stringify({ errors, problems }, null, 2);
  }

  private renderTool(args: JsonObject): string {
    const document = this.resolveInsideRoot(requiredString(args, 'document'), 'document');
    // render returns MMI-expanded Markdown. Refuse anything that is not a
    // Markdown document so a raw file (xlsx bytes, .env) is never returned in
    // the same success shape as an expansion result.
    if (path.extname(document).toLowerCase() !== '.md') {
      throw new InvalidParamsError('Argument "document" must be a Markdown file (.md).');
    }
    const to = optionalString(args, 'to') ?? 'md';
    if (to !== 'md' && to !== 'html') {
      throw new InvalidParamsError('Argument "to" must be "md" or "html".');
    }
    try {
      return to === 'html'
        ? renderDocumentHtml({ markdownFilePath: document, workspaceRoot: this.root })
        : renderDocumentMarkdown({ markdownFilePath: document, workspaceRoot: this.root });
    } catch (error) {
      throw wrapFailure(error);
    }
  }

  private selectTool(args: JsonObject): string {
    const source = this.resolveInsideRoot(requiredString(args, 'source'), 'source');
    const table = optionalString(args, 'table');
    const candidate = optionalString(args, 'candidate');
    if (!table && !candidate) {
      throw new InvalidParamsError('select needs either "table" or "candidate".');
    }
    if (table && candidate) {
      throw new InvalidParamsError('Arguments "table" and "candidate" cannot be combined.');
    }
    const contains = optionalString(args, 'contains');
    const first = optionalInteger(args, 'first', 0);
    if (contains !== undefined && first !== undefined) {
      throw new InvalidParamsError('Arguments "contains" and "first" cannot be combined.');
    }
    const sheet = optionalString(args, 'sheet');
    const columns = optionalString(args, 'columns');
    const inColumn = optionalString(args, 'in');
    const from = this.resolveOptionalInsideRoot(args, 'from');
    const expectedSourceDigest = optionalString(args, 'expectedSourceDigest');

    let out = '';
    let err = '';
    const code = runSelect(
      [source],
      {
        ...(table ? { table } : {}),
        ...(candidate ? { candidate } : {}),
        ...(sheet ? { sheet } : {}),
        ...(columns ? { columns } : {}),
        ...(contains !== undefined ? { contains } : {}),
        ...(inColumn ? { in: inColumn } : {}),
        ...(first !== undefined ? { first: String(first) } : {}),
        ...(from ? { from } : {}),
        ...(expectedSourceDigest !== undefined ? { 'expected-source-digest': expectedSourceDigest } : {}),
        json: true,
      },
      {
        out: (text) => { out += text; },
        err: (text) => { err += text; },
        cwd: this.root,
      },
    );
    if (!out) {
      throw failureFromText(err, `select failed with exit code ${code}.`);
    }
    return out;
  }

  private async findTool(args: JsonObject): Promise<string> {
    const query = requiredString(args, 'query');
    const from = this.resolveOptionalInsideRoot(args, 'from');
    this.assertNoEscapingLinks();
    let out = '';
    let err = '';
    const code = await runFind(
      [query],
      {
        root: this.root,
        ...(from ? { from } : {}),
        json: true,
      },
      {
        out: (text) => { out += text; },
        err: (text) => { err += text; },
        cwd: this.root,
      },
    );
    if (!out) {
      throw failureFromText(err, `find failed with exit code ${code}.`);
    }
    return out;
  }

  private async handoffTool(args: JsonObject): Promise<string> {
    const source = this.resolveInsideRoot(requiredString(args, 'source'), 'source');
    const task = requiredString(args, 'task');
    const document = this.resolveOptionalInsideRoot(args, 'document');
    const includeValues = optionalBoolean(args, 'includeValues') ?? false;

    let inspected;
    try {
      inspected = inspectSource(source, 0, document, undefined, undefined, this.displayCwd);
    } catch (error) {
      throw wrapFailure(error);
    }
    const diagnostics = document
      ? await checkPaths([document], this.root, this.displayCwd)
      : [];
    const handoff = createAiHandoffPackage({
      task,
      candidates: inspected.candidates,
      diagnostics,
      includeValues,
    });
    return JSON.stringify(handoff, null, 2);
  }

  private async validateProposalTool(args: JsonObject): Promise<string> {
    const notation = requiredString(args, 'notation');
    const packagePath = this.resolveInsideRoot(requiredString(args, 'package'), 'package');
    const document = this.resolveInsideRoot(requiredString(args, 'document'), 'document');
    const handoff = this.readHandoffPackage(packagePath);

    let validation;
    try {
      validation = await validateAiHandoffNotationProposal({
        handoff,
        rawNotation: notation,
        markdownFilePath: document,
        workspaceRoot: this.root,
      });
    } catch (error) {
      throw wrapFailure(error);
    }
    return JSON.stringify(validation, null, 2);
  }

  private validateSelectionTool(args: JsonObject): string {
    const proposal = this.readProposal(args, 'proposal');
    const packagePath = this.resolveInsideRoot(requiredString(args, 'package'), 'package');
    const handoff = this.readHandoffPackage(packagePath);

    let validation;
    try {
      validation = validateAiHandoffCandidateSelection(handoff, proposal);
    } catch (error) {
      throw wrapFailure(error);
    }
    return JSON.stringify(validation, null, 2);
  }

  private async validateTransformationTool(args: JsonObject): Promise<string> {
    const proposal = this.readProposal(args, 'proposal');
    const packagePath = this.resolveInsideRoot(requiredString(args, 'package'), 'package');
    const document = this.resolveInsideRoot(requiredString(args, 'document'), 'document');
    const handoff = this.readHandoffPackage(packagePath);

    let validation;
    try {
      validation = await validateAiHandoffTransformationProposal({
        handoff,
        proposal,
        markdownFilePath: document,
        workspaceRoot: this.root,
      });
    } catch (error) {
      throw wrapFailure(error);
    }
    return JSON.stringify(validation, null, 2);
  }

  private readProposal(args: JsonObject, name: string): unknown {
    const value = args[name];
    if (typeof value === 'string') {
      return this.readJson(this.resolveInsideRoot(value, name), `${name} proposal`);
    }
    if (isObject(value)) return value;
    throw new InvalidParamsError(`Argument "${name}" must be a path string or an object.`);
  }

  private readHandoffPackage(packagePath: string) {
    try {
      return parseAiHandoffPackage(fs.readFileSync(packagePath, 'utf8'));
    } catch (error) {
      throw wrapFailure(error);
    }
  }

  private readJson(filepath: string, label: string): unknown {
    let text: string;
    try {
      text = fs.readFileSync(filepath, 'utf8');
    } catch (error) {
      throw new ToolFailure(`${label}: ${messageOf(error)}`, wrapFailure(error).code);
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new ToolFailure(`${label} is not valid JSON: ${messageOf(error)}`, 'parse-failed');
    }
  }

  private resolveOptionalInsideRoot(args: JsonObject, name: string): string | undefined {
    const value = optionalString(args, name);
    return value === undefined ? undefined : this.resolveInsideRoot(value, name);
  }

  /**
   * `find` scans the workspace itself; its directory walk follows names rather
   * than resolved paths. Refuse the call when any link in the tree escapes the
   * root instead of letting that walk read outside the workspace.
   */
  private assertNoEscapingLinks(): void {
    const realRoot = realpathOrSelf(this.root);
    const walk = (directory: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
          if (!isPathWithinBoundary(realpathOrSelf(full), realRoot)) {
            throw new ToolFailure(
              `Workspace link resolves outside the MCP workspace root: ${path.relative(this.root, full)}`,
              'outside-root',
            );
          }
          continue;
        }
        if (entry.isDirectory()) walk(full);
      }
    };
    walk(this.root);
  }

  /**
   * Resolve a caller path against the workspace root and reject both lexical
   * traversal and symlinks that leave the root. The original (non-realpath)
   * path is returned so diagnostics and references match the CLI.
   */
  private resolveInsideRoot(value: string, label: string): string {
    const resolved = path.resolve(this.root, value);
    if (!isPathWithinBoundary(resolved, this.root)) {
      throw new ToolFailure(`Argument "${label}" is outside the MCP workspace root.`, 'outside-root');
    }
    const realRoot = realpathOrSelf(this.root);
    const realTarget = realpathOfNearest(resolved);
    if (!isPathWithinBoundary(realTarget, realRoot)) {
      throw new ToolFailure(
        `Argument "${label}" resolves outside the MCP workspace root through a symbolic link.`,
        'outside-root',
      );
    }
    return resolved;
  }
}

export function createMcpServer(options: McpServerOptions): McpServer {
  return new McpServerImplementation(options);
}

export interface RunMcpServerOptions extends McpServerOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/** Serve MCP over line-delimited JSON until stdin closes. */
export async function runMcpServer(options: RunMcpServerOptions): Promise<number> {
  const server = createMcpServer(options);
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const emit = async (line: string): Promise<void> => {
    if (line.trim().length === 0) return;
    const response = await server.handleLine(line);
    if (response !== undefined) output.write(`${response}\n`);
  };
  const rejectOversized = (): void => {
    output.write(
      `${rpcError(null, -32600, `Message exceeds the ${MCP_MAX_LINE_BYTES} byte stdin limit.`)}\n`,
    );
  };
  const decode = (parts: Buffer[]): string =>
    Buffer.concat(parts).toString('utf8').replace(/\r$/u, '');
  // Split stdin on newlines by hand. readline buffers a whole line before
  // handing it over, so a huge line without a newline would exhaust memory
  // before the size limit could apply.
  let pending: Buffer[] = [];
  let pendingBytes = 0;
  let discarding = false;
  for await (const raw of input as AsyncIterable<Buffer | string>) {
    let chunk = typeof raw === 'string' ? Buffer.from(raw, 'utf8') : raw;
    while (chunk.length > 0) {
      const newline = chunk.indexOf(0x0a);
      const part = newline === -1 ? chunk : chunk.subarray(0, newline);
      if (!discarding) {
        pendingBytes += part.length;
        // The +1 leaves room for a trailing CR that is not part of the message.
        if (pendingBytes > MCP_MAX_LINE_BYTES + 1) {
          discarding = true;
          pending = [];
          pendingBytes = 0;
          rejectOversized();
        } else {
          pending.push(part);
        }
      }
      if (newline === -1) break;
      if (!discarding) {
        const text = decode(pending);
        pending = [];
        pendingBytes = 0;
        await emit(text);
      }
      discarding = false;
      chunk = chunk.subarray(newline + 1);
    }
  }
  if (!discarding && pendingBytes > 0) await emit(decode(pending));
  return 0;
}

const USAGE = `Usage: mmi-mcp [--root <workspace>] [--version [--json]]

Starts a read-only MCP server on stdin/stdout. Messages are one JSON-RPC 2.0
object per line (no Content-Length framing). The workspace root defaults to the
current directory; paths outside it are rejected.`;

export async function main(argv: string[]): Promise<number> {
  let root: string;
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        root: { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
        json: { type: 'boolean', default: false },
      },
    });
    if (values.version) {
      console.log(
        values.json
          ? JSON.stringify(readBuildIdentity(readCliVersion()))
          : readCliVersion(),
      );
      return 0;
    }
    if (values.help) {
      console.log(USAGE);
      return 0;
    }
    if (positionals.length > 0) {
      console.error(`mmi-mcp: unexpected argument: ${positionals[0]}`);
      console.error(USAGE);
      return 2;
    }
    root = path.resolve(values.root ?? process.cwd());
  } catch (error) {
    console.error(`mmi-mcp: ${messageOf(error)}`);
    console.error(USAGE);
    return 2;
  }

  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`mmi-mcp: workspace root is not a directory: ${root}`);
    return 2;
  }
  await runMcpServer({ root });
  return 0;
}

if (
  process.argv[1]
  && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (error) => {
      console.error(`mmi-mcp: ${messageOf(error)}`);
      process.exitCode = 2;
    },
  );
}

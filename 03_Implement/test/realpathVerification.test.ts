import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveSourcePath } from '../src/core/pathResolver.js';
import { checkPaths } from '../src/cli/mmi.js';
import { createMcpServer, MCP_PROTOCOL_VERSION } from '../src/cli/mcp.js';
import { createDiagnosticsForDocument } from '../src/dx/vscodeAdapters.js';
import { isWorkspaceFileCandidate, resolveAuthoringSourcePath } from '../src/dx/workspaceBoundary.js';

for (const failedPath of ['file', 'boundary'] as const) {
  test(`realpath failure on ${failedPath} stops diagnostics before reading content`, async (t) => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-realpath-failure-'));
    const root = path.join(base, 'root');
    const outside = path.join(base, 'outside');
    fs.mkdirSync(root);
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'book.xlsx'), 'SYNTHETIC_OUTSIDE');
    try {
      try { fs.symlinkSync(outside, path.join(root, 'linked'), 'junction'); }
      catch (error) {
        if (['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) {
          t.skip('symlink creation is not permitted');
          return;
        }
        throw error;
      }
      const target = path.join(root, 'linked', 'book.xlsx');
      const doc = path.join(root, 'doc.md');
      fs.writeFileSync(doc, '![[./linked/book.xlsx#Missing|A1:B2]]');
      const server = createMcpServer({ root, version: 'test' });
      await server.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '1' } } }));
      const original = fs.realpathSync.bind(fs);
      t.mock.method(fs, 'realpathSync', ((input: fs.PathLike, options?: unknown) => {
        if (path.resolve(String(input)) === path.resolve(failedPath === 'file' ? target : root)) {
          throw Object.assign(new Error('synthetic denied'), { code: 'EACCES' });
        }
        return original(input, options as never);
      }) as typeof fs.realpathSync);
      let reads = 0;
      const isUnverified = (error: unknown): boolean => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Unable to verify workspace boundary/u);
        assert.equal(error.message.includes(base), false);
        assert.equal(error.message.includes(target), false);
        assert.doesNotMatch(String(error.stack), /synthetic denied|SYNTHETIC_OUTSIDE|EACCES/u);
        assert.doesNotMatch(error.message, /outside workspace boundary|file not found/u);
        return true;
      };
      await assert.rejects(createDiagnosticsForDocument(
        '![[./linked/book.xlsx#Missing|A1:B2]]', path.join(root, 'doc.md'), root,
        {
          fileExists: async (file) => fs.existsSync(file),
          readFile: async (file) => { reads++; return fs.readFileSync(file); },
          readWorkbookSheetNames: async (file) => { reads++; fs.readFileSync(file); return ['SYNTHETIC_OUTSIDE']; },
        },
      ), isUnverified);
      assert.equal(reads, 0);
      assert.throws(() => resolveSourcePath({ markdownFilePath: path.join(root, 'doc.md'), sourcePath: './linked/book.xlsx', workspaceRoot: root }), isUnverified);
      assert.throws(() => resolveAuthoringSourcePath('./linked/book.xlsx', doc, root), isUnverified);
      assert.throws(() => isWorkspaceFileCandidate(target, root), isUnverified);
      await assert.rejects(checkPaths([doc], root, root), isUnverified);
      const response = await server.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'check', arguments: { paths: ['doc.md'] } } }));
      assert.ok(response);
      const parsed = JSON.parse(response);
      assert.ok(parsed.error || parsed.result?.isError, 'unverified containment must not be a successful check');
      const responseText = parsed.error?.message ?? parsed.result?.content?.map((item: { text?: string }) => item.text ?? '').join(' ');
      assert.match(responseText, /Unable to verify workspace boundary/u);
      assert.equal(responseText.includes(base), false);
      assert.equal(responseText.includes(outside), false);
      assert.doesNotMatch(responseText, /synthetic denied|SYNTHETIC_OUTSIDE|EACCES/u);
    } finally {
      t.mock.restoreAll();
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
}

test('a missing source remains a missing-file result, not an unverified boundary', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-missing-source-'));
  try {
    const doc = path.join(root, 'doc.md');
    const items = await createDiagnosticsForDocument('![[./missing.xlsx#Sheet1|A1:B2]]', doc, root, {
      fileExists: async (file) => fs.existsSync(file),
      readFile: async () => { throw new Error('should not read'); },
      readWorkbookSheetNames: async () => { throw new Error('should not read'); },
    });
    assert.deepEqual(items.map((item) => item.diagnostic.code), ['MMI_FILE_NOT_FOUND']);
    assert.throws(() => resolveSourcePath({ markdownFilePath: doc, sourcePath: './missing.xlsx', workspaceRoot: root }), /Unable to resolve source file/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

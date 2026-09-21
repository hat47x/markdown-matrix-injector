/*
 * Observation-only probe extension. Records which DataTransfer MIME types a
 * Markdown paste provider actually receives from a real Excel copy.
 *
 * Review R5 (01_Plans/input-assistance-design-review.md):
 *   - success means provideDocumentPasteEdits was CALLED and its MIME list was
 *     recorded. Activation alone, or a paste that merely succeeded, is not a
 *     result. The harness fails when the provider was never invoked.
 *   - the paste is applied only to the dedicated paste-target document, never
 *     to whatever editor happens to be active.
 *   - every record carries the case id written by the harness.
 *
 * It never edits a workbook and never inserts MMI notation.
 */
const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const probeRoot = process.env.MMI_PROBE_DIR || path.join(os.tmpdir(), 'mmi-clipboard-probe');
const LOG = path.join(probeRoot, 'vscode-probe.log');
const TRIGGER = path.join(probeRoot, 'trigger.json');
const TARGET = path.join(probeRoot, 'paste-target.md');

let currentCase = null;

function log(obj) {
  fs.mkdirSync(probeRoot, { recursive: true });
  fs.appendFileSync(LOG, `${JSON.stringify({ caseId: currentCase, ...obj }, null, 2)}\n---\n`, 'utf8');
}

async function dumpTransfer(kind, dataTransfer) {
  const entries = [];
  for (const [mime, item] of dataTransfer) {
    const rec = { mime };
    try {
      const s = await item.asString();
      rec.length = s.length;
      rec.head = s.slice(0, 2000);
      // Whether the CF_HTML framing (Version:/StartHTML:/.../SourceURL:) that
      // wraps the OS clipboard's raw HTML format survives into the web-
      // standard DataTransfer text/html entry is exactly the open question
      // (input-assistance-paste-provenance.md §1.3/1.4) -- record it
      // explicitly rather than relying on `head` being long enough.
      rec.containsSourceUrlMarker = s.includes('SourceURL:');
      rec.containsCfHtmlVersionMarker = s.includes('Version:1.0') || s.startsWith('Version:');
      // Does the workbook's own filename appear ANYWHERE in this mime's full
      // text (not just the truncated `head`)? Pertinent to whether
      // src/dx/pasteDrop.ts's extractSupportedFilepathFromHtml can ever find
      // a real workbook path in an actual Excel-to-VS-Code paste (as opposed
      // to the synthetic fixtures its unit tests use).
      rec.workbookExtensionMatches = [...s.matchAll(/[^\s"'<>]+\.(?:xlsx|xls|csv|xml)/gi)].map((m) => m[0]);
      if (mime === 'text/html' || mime === 'text/plain') rec.full = s;
    } catch (e) {
      rec.asStringError = String(e);
    }
    try {
      const f = item.asFile && item.asFile();
      if (f) rec.file = { name: f.name, fsPath: f.uri ? f.uri.fsPath : null };
    } catch (e) {
      rec.asFileError = String(e);
    }
    entries.push(rec);
  }
  log({ kind, at: new Date().toISOString(), mimeCount: entries.length, mimes: entries.map((e) => e.mime), entries });
}

/** Only ever act on the dedicated target document (R5). */
function findTargetEditor() {
  const same = (u) => u && path.resolve(u.fsPath).toLowerCase() === path.resolve(TARGET).toLowerCase();
  return vscode.window.visibleTextEditors.find((e) => same(e.document.uri)) ?? null;
}

function activate(context) {
  log({ kind: 'activate', vscodeVersion: vscode.version, remoteName: vscode.env.remoteName ?? null, probeRoot });

  const provider = {
    async provideDocumentPasteEdits(document, _ranges, dataTransfer) {
      await dumpTransfer('provideDocumentPasteEdits', dataTransfer);
      log({ kind: 'provider-called', doc: document.uri.fsPath });
      return undefined; // observe only; let the normal paste happen
    },
    async prepareDocumentPaste(_document, _ranges, dataTransfer) {
      await dumpTransfer('prepareDocumentPaste', dataTransfer);
    },
  };

  const editKind = vscode.DocumentDropOrPasteEditKind.Text.append('mmiProbe', 'observe');
  // `pasteMimeTypes` is a real allowlist, NOT a wildcard filter: the official
  // sample (microsoft/vscode-extension-samples/document-paste) and this
  // repo's own production registration (src/extension.ts: PASTE_MIME_TYPES =
  // ['text/html','files']) both declare concrete mime strings. An earlier
  // version of this probe declared pasteMimeTypes: ['*'], which VS Code does
  // not recognise as "any mime type" -- it matched nothing, so
  // provideDocumentPasteEdits was never invoked and the resulting "no
  // provenance formats" reading was an artefact of that bug, not a real
  // finding about VS Code's DataTransfer. Cast the widest reasonable net:
  // every standard web clipboard type plus the raw Windows clipboard format
  // names identified in input-assistance-paste-provenance.md, in case any of
  // them pass through verbatim.
  const CANDIDATE_MIME_TYPES = [
    'text/plain', 'text/html', 'text/uri-list', 'files', 'vscode-editor-data',
    'Link', 'Object Descriptor', 'Link Source Descriptor', 'Csv', 'XML Spreadsheet', 'Hyperlink', 'SymbolicLink',
  ];
  context.subscriptions.push(
    vscode.languages.registerDocumentPasteEditProvider(
      [{ language: 'markdown' }, { language: 'plaintext' }],
      provider,
      { providedPasteEditKinds: [editKind], pasteMimeTypes: CANDIDATE_MIME_TYPES, copyMimeTypes: [] },
    ),
  );

  // The harness writes trigger.json ({caseId, mode}) once Excel has copied.
  const timer = setInterval(async () => {
    if (!fs.existsSync(TRIGGER)) return;
    let spec = {};
    try {
      // Windows PowerShell 5.1's `Out-File -Encoding utf8` always writes a
      // UTF-8 BOM (there is no utf8NoBOM option before PowerShell 6), so the
      // trigger file the harness writes carries a leading U+FEFF that
      // JSON.parse rejects outright if not stripped first.
      spec = JSON.parse(fs.readFileSync(TRIGGER, 'utf8').replace(/^﻿/, ''));
    } catch (e) {
      log({ kind: 'trigger-parse-error', error: String(e) });
    }
    try { fs.unlinkSync(TRIGGER); } catch { /* raced; continue anyway */ }
    currentCase = spec.caseId ?? 'unknown';
    try {
      const editor = findTargetEditor();
      if (!editor) {
        log({ kind: 'trigger-error', error: `paste-target editor not visible: ${TARGET}` });
        return;
      }
      await vscode.window.showTextDocument(editor.document, { preserveFocus: false });
      const end = editor.document.lineAt(editor.document.lineCount - 1).range.end;
      editor.selection = new vscode.Selection(end, end);
      log({ kind: 'trigger', doc: editor.document.uri.fsPath, mode: spec.mode ?? 'command', at: new Date().toISOString() });
      await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
      log({ kind: 'pasted', tail: editor.document.getText().slice(-800) });
    } catch (e) {
      log({ kind: 'trigger-error', error: String(e) });
    } finally {
      currentCase = null;
    }
  }, 400);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
}

function deactivate() {}
module.exports = { activate, deactivate };

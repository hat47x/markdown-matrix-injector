/**
 * Reads the raw Excel clipboard formats on local Windows through the OS's own
 * PowerShell (ADR-0017 option 2) -- no native addon, nothing installed.
 *
 * One warm helper process is started on first use (compiling the small Win32
 * shim costs ~1s once) and answers one request per paste; it exits after a
 * few idle minutes or with the extension. Every failure -- not Windows,
 * remote host, helper missing, busy clipboard, timeout -- resolves to
 * `undefined`, and the paste falls back to content matching. Nothing read is
 * stored.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';

import type { RawClipboard } from './clipboardProvenance.js';

const REQUEST_TIMEOUT_MS = 2_500;
const START_TIMEOUT_MS = 8_000;
const IDLE_EXIT_MS = 5 * 60_000;

interface Helper {
  child: ChildProcessWithoutNullStreams;
  lines: string[];
  waiters: ((line: string | undefined) => void)[];
  idle?: ReturnType<typeof setTimeout>;
}

let helper: Helper | undefined;
let starting: Promise<Helper | undefined> | undefined;

export function clipboardProvenanceSupported(remoteName: string | undefined): boolean {
  // On a remote host the extension and the clipboard are on different machines.
  return process.platform === 'win32' && !remoteName;
}

function nextLine(current: Helper, timeoutMs: number): Promise<string | undefined> {
  const queued = current.lines.shift();
  if (queued !== undefined) return Promise.resolve(queued);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      current.waiters = current.waiters.filter((waiter) => waiter !== done);
      resolve(undefined);
    }, timeoutMs);
    const done = (line: string | undefined) => {
      clearTimeout(timer);
      resolve(line);
    };
    current.waiters.push(done);
  });
}

async function start(extensionPath: string): Promise<Helper | undefined> {
  const script = path.join(extensionPath, 'media', 'clipboard', 'read-clipboard.ps1');
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Serve'], {
      windowsHide: true,
    });
  } catch {
    return undefined;
  }
  const current: Helper = { child, lines: [], waiters: [] };
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const waiter = current.waiters.shift();
    if (waiter) waiter(line);
    else current.lines.push(line);
  });
  const stop = () => {
    if (helper === current) helper = undefined;
    for (const waiter of current.waiters.splice(0)) waiter(undefined);
  };
  child.on('exit', stop);
  child.on('error', stop);
  const ready = await nextLine(current, START_TIMEOUT_MS);
  if (!ready?.includes('"ready"')) {
    child.kill();
    return undefined;
  }
  return current;
}

/** The raw formats of the current clipboard, or `undefined` on any failure. */
export async function readRawClipboard(extensionPath: string): Promise<RawClipboard | undefined> {
  if (!helper) {
    starting ??= start(extensionPath).finally(() => {
      starting = undefined;
    });
    helper = await starting;
  }
  const current = helper;
  if (!current) return undefined;
  if (current.idle) clearTimeout(current.idle);
  current.idle = setTimeout(() => current.child.kill(), IDLE_EXIT_MS);
  current.idle.unref(); // never keep the host alive just for the helper
  try {
    current.child.stdin.write('read\n');
  } catch {
    return undefined;
  }
  const line = await nextLine(current, REQUEST_TIMEOUT_MS);
  if (!line) return undefined;
  try {
    const parsed = JSON.parse(line) as { html?: string; objectDescriptor?: string; unicodeText?: string; error?: string };
    if (parsed.error) return undefined;
    const bytes = (value?: string) => (value ? Uint8Array.from(Buffer.from(value, 'base64')) : undefined);
    return {
      html: bytes(parsed.html),
      objectDescriptor: bytes(parsed.objectDescriptor),
      unicodeText: parsed.unicodeText ? Buffer.from(parsed.unicodeText, 'base64').toString('utf16le').replace(/\0+$/u, '') : undefined,
    };
  } catch {
    return undefined;
  }
}

/** Starts the helper ahead of the first paste, so that paste does not pay its ~2.5s start. */
export function warmClipboardHelper(extensionPath: string): void {
  if (helper || starting) return;
  starting = start(extensionPath).finally(() => {
    starting = undefined;
  });
  void starting.then((started) => {
    helper ??= started;
  });
}

export function stopClipboardHelper(): void {
  if (helper?.idle) clearTimeout(helper.idle);
  helper?.child.kill();
  helper = undefined;
}

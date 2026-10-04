/**
 * LibreOffice-backed deterministic region snapshots (issue-0198).
 *
 * The source workbook is loaded read-only. A temporary LibreOffice process
 * changes only in-memory print settings: all other sheets are hidden, the
 * requested A1 range becomes the print area, and the page size is set to the
 * physical size of that range. The source file is never saved.
 *
 * LibreOffice PDF is intentionally temporary because PDF metadata contains a
 * creation timestamp. pdftoppm rasterizes the one-page PDF; the PNG bytes are
 * the reproducible artifact and content identity.
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import XLSX from 'xlsx';

import type { Candidate } from '../core/candidate.js';
import { candidateProblem } from '../core/candidate.js';
import {
  entryFor,
  recordEntries,
  type Ledger,
} from '../core/importLedger.js';
import { loadWorkbook } from '../core/workbookLoader.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';
import { readZip } from '../core/zipReader.js';

export const REGION_SNAPSHOT_SCHEMA = 'mmi.region-snapshot/v1' as const;
export const REGION_SNAPSHOT_RENDERER = 'mmi.libreoffice-pdf-pdftoppm';
export const REGION_SNAPSHOT_IMPLEMENTATION_VERSION = '1';
export const DEFAULT_SNAPSHOT_DPI = 150;

const execFileAsync = promisify(execFile);
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

export type SnapshotDiagnosticCode =
  | 'MMI_SNAPSHOT_UNSUPPORTED_SOURCE'
  | 'MMI_SNAPSHOT_SHEET_NOT_FOUND'
  | 'MMI_SNAPSHOT_RANGE_INVALID'
  | 'MMI_SNAPSHOT_LIBREOFFICE_UNAVAILABLE'
  | 'MMI_SNAPSHOT_PDFTOPPM_UNAVAILABLE'
  | 'MMI_SNAPSHOT_PDFINFO_UNAVAILABLE'
  | 'MMI_SNAPSHOT_PYUNO_UNAVAILABLE'
  | 'MMI_SNAPSHOT_RENDER_FAILED'
  | 'MMI_SNAPSHOT_SOURCE_CHANGED'
  | 'MMI_SNAPSHOT_OUTPUT_COLLISION';

export class RegionSnapshotError extends Error {
  constructor(
    readonly code: SnapshotDiagnosticCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'RegionSnapshotError';
  }
}

export interface RegionSnapshotRuntime {
  libreOfficeExecutable?: string;
  pdftoppmExecutable?: string;
  pdfinfoExecutable?: string;
  pythonExecutable?: string;
  fcListExecutable?: string;
}

export interface RegionSnapshotOptions extends RegionSnapshotRuntime {
  sourcePath: string;
  sourceLabel?: string;
  sheet: string;
  range: string;
  outDir: string;
  ledgerPath?: string;
  /** Write the Markdown image reference relative to this document. */
  fromDocument?: string;
  dpi?: number;
}

export interface RegionSnapshotRendererIdentity {
  id: typeof REGION_SNAPSHOT_RENDERER;
  implementationVersion: typeof REGION_SNAPSHOT_IMPLEMENTATION_VERSION;
  libreOfficeVersion: string;
  pdftoppmVersion: string;
  fontSetDigest: string;
  dpi: number;
}

export interface RegionSnapshotManifest {
  schema: typeof REGION_SNAPSHOT_SCHEMA;
  source: {
    label: string;
    digest: string;
    application?: string;
    appVersion?: string;
  };
  selection: {
    sheet: string;
    range: string;
  };
  renderer: RegionSnapshotRendererIdentity;
  artifact: {
    file: string;
    digest: string;
    bytes: number;
    widthPx: number;
    heightPx: number;
  };
  renderedAtUtc: string;
}

export interface RegionSnapshotResult {
  candidate: Candidate;
  manifest: RegionSnapshotManifest;
  pngFile: string;
  manifestFile: string;
  status: 'written' | 'unchanged';
  reference: string;
  markdown: string;
  ledger?: Ledger;
}

export async function renderLibreOfficeRegionSnapshot(
  options: RegionSnapshotOptions,
): Promise<RegionSnapshotResult> {
  const sourcePath = path.resolve(options.sourcePath);
  const outDir = path.resolve(options.outDir);
  const sourceLabel = options.sourceLabel ?? path.basename(sourcePath);
  const dpi = options.dpi ?? DEFAULT_SNAPSHOT_DPI;

  validateInput(sourcePath, options.sheet, options.range, dpi);
  const normalizedRange = normalizeRange(options.range);
  const workbook = loadWorkbook({ absolutePath: sourcePath });
  if (!(options.sheet in workbook.sheets)) {
    throw new RegionSnapshotError(
      'MMI_SNAPSHOT_SHEET_NOT_FOUND',
      `worksheet not found: ${options.sheet}`,
    );
  }

  const sourceDigestBefore = readSourceFileIdentity(sourcePath).digest;
  const runtime = await probeSnapshotRuntime(options, dpi);
  const officeInfo = readOfficeApplicationInfo(fs.readFileSync(sourcePath));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-region-snapshot-'));
  const pdfFile = path.join(tempDir, 'snapshot.pdf');
  const pngBase = path.join(tempDir, 'snapshot');
  const tempPng = `${pngBase}.png`;
  let listener: ChildProcess | undefined;

  try {
    const profileDir = path.join(tempDir, 'lo-profile');
    fs.mkdirSync(profileDir);
    const pipeName = `mmi_snapshot_${process.pid}_${randomBytes(8).toString('hex')}`;
    listener = spawn(
      runtime.libreOfficeExecutable,
      [
        '--headless',
        '--nologo',
        '--nodefault',
        '--nofirststartwizard',
        '--norestore',
        `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
        `--accept=pipe,name=${pipeName};urp;StarOffice.ComponentContext`,
      ],
      {
        stdio: 'ignore',
        env: stableRenderEnvironment(process.env),
      },
    );
    let listenerError: Error | undefined;
    listener.once('error', (error) => {
      listenerError = error;
    });

    await runPyUnoExport({
      pythonExecutable: runtime.pythonExecutable,
      sourcePath,
      sheet: options.sheet,
      range: normalizedRange,
      pdfFile,
      pipeName,
    });
    if (listenerError) {
      throw new RegionSnapshotError(
        'MMI_SNAPSHOT_LIBREOFFICE_UNAVAILABLE',
        `LibreOffice listener failed: ${listenerError.message}`,
        { cause: listenerError },
      );
    }

    const pdfInfo = await runCommand(
      runtime.pdfinfoExecutable,
      [pdfFile],
      'MMI_SNAPSHOT_RENDER_FAILED',
      'pdfinfo failed',
      15_000,
    );
    const pageCount = parsePdfPageCount(pdfInfo.stdout);
    if (pageCount !== 1) {
      throw new RegionSnapshotError(
        'MMI_SNAPSHOT_RENDER_FAILED',
        `snapshot range rendered as ${pageCount} PDF pages; refusing to keep only the first page`,
      );
    }

    await runCommand(
      runtime.pdftoppmExecutable,
      ['-png', '-singlefile', '-r', String(dpi), pdfFile, pngBase],
      'MMI_SNAPSHOT_RENDER_FAILED',
      'pdftoppm failed',
      60_000,
    );

    if (!fs.existsSync(tempPng) || !fs.statSync(tempPng).isFile()) {
      throw new RegionSnapshotError(
        'MMI_SNAPSHOT_RENDER_FAILED',
        'snapshot renderer did not create a PNG',
      );
    }

    const sourceDigestAfter = readSourceFileIdentity(sourcePath).digest;
    if (sourceDigestAfter !== sourceDigestBefore) {
      throw new RegionSnapshotError(
        'MMI_SNAPSHOT_SOURCE_CHANGED',
        'source workbook changed while the snapshot was being rendered; retry with a stable source',
      );
    }

    const pngBytes = fs.readFileSync(tempPng);
    const pngSize = readPngSize(pngBytes);
    const pngDigest = sha256(pngBytes);
    const fingerprintRepresentation = [
      'region-snapshot-png-v1',
      runtime.id,
      `lo=${runtime.libreOfficeVersion}`,
      `pdftoppm=${runtime.pdftoppmVersion}`,
      `fonts=${runtime.fontSetDigest}`,
      `dpi=${dpi}`,
    ].join(';');

    const candidate: Candidate = {
      kind: 'region-snapshot',
      locator: {
        source: sourceLabel,
        sourceDigest: sourceDigestBefore,
        sheet: options.sheet,
        range: normalizedRange,
      },
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      claims: [{
        aspect: 'snapshot-range',
        value: `${options.sheet}!${normalizedRange}`,
        status: 'observed',
        execution: 'deterministic',
        method: 'M0',
        reasonCode: 'explicit-sheet-range',
      }],
      provenance: {
        algorithm: REGION_SNAPSHOT_RENDERER,
        run: {
          execution: 'deterministic',
          inputDigest: sourceDigestBefore,
          config: {
            sheet: options.sheet,
            range: normalizedRange,
            dpi,
            libreOfficeVersion: runtime.libreOfficeVersion,
            pdftoppmVersion: runtime.pdftoppmVersion,
            fontSetDigest: runtime.fontSetDigest,
          },
          implementationVersion: REGION_SNAPSHOT_IMPLEMENTATION_VERSION,
        },
      },
      fingerprint: {
        algorithm: 'sha256',
        representation: fingerprintRepresentation,
        digest: pngDigest,
      },
      scores: [],
    };
    const problem = candidateProblem(candidate);
    if (problem) {
      throw new RegionSnapshotError(
        'MMI_SNAPSHOT_RENDER_FAILED',
        `rendered region-snapshot Candidate is invalid: ${problem}`,
      );
    }

    fs.mkdirSync(outDir, { recursive: true });
    const digestHex = pngDigest.slice('sha256:'.length);
    const pngFile = path.join(outDir, `snapshot-${digestHex}.png`);
    const manifestFile = path.join(outDir, `snapshot-${digestHex}.mmi-snapshot.json`);
    const status = writeContentAddressed(pngFile, pngBytes);
    const manifest = existingOrCreateManifest({
      manifestFile,
      sourceLabel,
      sourceDigest: sourceDigestBefore,
      officeInfo,
      sheet: options.sheet,
      range: normalizedRange,
      runtime,
      pngFile,
      pngDigest,
      pngBytes: pngBytes.byteLength,
      pngWidth: pngSize.width,
      pngHeight: pngSize.height,
    });

    const documentDirectory = options.fromDocument
      ? path.dirname(path.resolve(options.fromDocument))
      : process.cwd();
    const relativePng = path.relative(documentDirectory, pngFile).split(path.sep).join('/');
    const reference = /\s/u.test(relativePng)
      ? relativePng.replace(/ /gu, '%20')
      : relativePng;
    const altText = `${options.sheet} ${normalizedRange}`;
    const markdown = [
      `![${altText}](${reference})`,
      snapshotProvenanceComment({
        source: sourceLabel,
        sourceDigest: sourceDigestBefore,
        sheet: options.sheet,
        range: normalizedRange,
        artifactDigest: pngDigest,
        renderer: runtime.id,
      }),
    ].join('\n');

    const ledger = options.ledgerPath
      ? recordEntries(options.ledgerPath, [
          entryFor(
            options.ledgerPath,
            sourcePath,
            candidate,
            pngFile,
            'mmi snapshot',
            {
              mode: 'region-snapshot-v1',
              renderer: runtime.id,
              rendererImplementationVersion: runtime.implementationVersion,
              libreOfficeVersion: runtime.libreOfficeVersion,
              pdftoppmVersion: runtime.pdftoppmVersion,
              fontSetDigest: runtime.fontSetDigest,
              dpi,
              sheet: options.sheet,
              range: normalizedRange,
              manifest: path.basename(manifestFile),
            },
          ),
        ])
      : undefined;

    return {
      candidate,
      manifest,
      pngFile,
      manifestFile,
      status,
      reference,
      markdown,
      ...(ledger ? { ledger } : {}),
    };
  } finally {
    if (listener) await stopListener(listener);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function probeSnapshotRuntime(
  runtime: RegionSnapshotRuntime = {},
  dpi = DEFAULT_SNAPSHOT_DPI,
): Promise<RegionSnapshotRendererIdentity & {
  libreOfficeExecutable: string;
  pdftoppmExecutable: string;
  pdfinfoExecutable: string;
  pythonExecutable: string;
}> {
  const libreOfficeExecutable = runtime.libreOfficeExecutable ?? 'libreoffice';
  const pdftoppmExecutable = runtime.pdftoppmExecutable ?? 'pdftoppm';
  const pdfinfoExecutable = runtime.pdfinfoExecutable ?? 'pdfinfo';
  const pythonExecutable = runtime.pythonExecutable
    ?? (fs.existsSync('/usr/bin/python3') ? '/usr/bin/python3' : 'python3');
  const fcListExecutable = runtime.fcListExecutable ?? 'fc-list';

  const lo = await runCommand(
    libreOfficeExecutable,
    ['--version'],
    'MMI_SNAPSHOT_LIBREOFFICE_UNAVAILABLE',
    'LibreOffice is unavailable',
    15_000,
  );
  const poppler = await runCommand(
    pdftoppmExecutable,
    ['-v'],
    'MMI_SNAPSHOT_PDFTOPPM_UNAVAILABLE',
    'pdftoppm is unavailable',
    15_000,
  );
  await runCommand(
    pdfinfoExecutable,
    ['-v'],
    'MMI_SNAPSHOT_PDFINFO_UNAVAILABLE',
    'pdfinfo is unavailable',
    15_000,
  );
  await runCommand(
    pythonExecutable,
    ['-c', 'import uno; print("pyuno-ok")'],
    'MMI_SNAPSHOT_PYUNO_UNAVAILABLE',
    'Python UNO bridge is unavailable',
    15_000,
  );
  const fonts = await runCommand(
    fcListExecutable,
    ['--format', '%{family}|%{style}\\n'],
    'MMI_SNAPSHOT_RENDER_FAILED',
    'fontconfig inventory is unavailable',
    15_000,
  );

  const libreOfficeVersion = firstNonEmptyLine(lo.stdout, lo.stderr);
  const pdftoppmVersion = firstNonEmptyLine(poppler.stderr, poppler.stdout);
  const fontLines = [...new Set(fonts.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean))]
    .sort()
    .join('\n');

  return {
    id: REGION_SNAPSHOT_RENDERER,
    implementationVersion: REGION_SNAPSHOT_IMPLEMENTATION_VERSION,
    libreOfficeVersion,
    pdftoppmVersion,
    fontSetDigest: sha256(Buffer.from(fontLines, 'utf8')),
    dpi,
    libreOfficeExecutable,
    pdftoppmExecutable,
    pdfinfoExecutable,
    pythonExecutable,
  };
}

function validateInput(sourcePath: string, sheet: string, range: string, dpi: number): void {
  const extension = path.extname(sourcePath).toLowerCase();
  if (!['.xlsx', '.xlsm'].includes(extension)) {
    throw new RegionSnapshotError(
      'MMI_SNAPSHOT_UNSUPPORTED_SOURCE',
      `region snapshot currently supports .xlsx/.xlsm, not ${extension || '(no extension)'}`,
    );
  }
  if (!sheet.trim()) {
    throw new RegionSnapshotError('MMI_SNAPSHOT_SHEET_NOT_FOUND', 'snapshot needs a worksheet name');
  }
  normalizeRange(range);
  if (!Number.isInteger(dpi) || dpi < 72 || dpi > 600) {
    throw new RegionSnapshotError(
      'MMI_SNAPSHOT_RANGE_INVALID',
      'snapshot dpi must be an integer from 72 to 600',
    );
  }
}

function normalizeRange(value: string): string {
  try {
    const decoded = XLSX.utils.decode_range(value.trim().toUpperCase());
    if (decoded.s.r < 0 || decoded.s.c < 0 || decoded.e.r < decoded.s.r || decoded.e.c < decoded.s.c) {
      throw new Error('invalid bounds');
    }
    return XLSX.utils.encode_range(decoded);
  } catch (error) {
    throw new RegionSnapshotError(
      'MMI_SNAPSHOT_RANGE_INVALID',
      `invalid snapshot range: ${value}`,
      { cause: error },
    );
  }
}

function stableRenderEnvironment(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...base,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
  };
}

async function runPyUnoExport(options: {
  pythonExecutable: string;
  sourcePath: string;
  sheet: string;
  range: string;
  pdfFile: string;
  pipeName: string;
}): Promise<void> {
  await runCommand(
    options.pythonExecutable,
    [
      '-c',
      PYUNO_RANGE_EXPORT,
      options.sourcePath,
      options.sheet,
      options.range,
      options.pdfFile,
      options.pipeName,
    ],
    'MMI_SNAPSHOT_RENDER_FAILED',
    'LibreOffice range export failed',
    45_000,
  );
}

async function runCommand(
  executable: string,
  args: readonly string[],
  code: SnapshotDiagnosticCode,
  label: string,
  timeout: number,
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(executable, [...args], {
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      encoding: 'utf8',
      env: stableRenderEnvironment(process.env),
    });
    return { stdout: String(result.stdout), stderr: String(result.stderr) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RegionSnapshotError(code, `${label}: ${detail}`, { cause: error });
  }
}

async function stopListener(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit').then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 750)),
  ]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([
      once(child, 'exit').then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 750)),
    ]);
  }
}

function writeContentAddressed(file: string, bytes: Buffer): 'written' | 'unchanged' {
  if (fs.existsSync(file)) {
    if (!fs.statSync(file).isFile() || sha256(fs.readFileSync(file)) !== sha256(bytes)) {
      throw new RegionSnapshotError(
        'MMI_SNAPSHOT_OUTPUT_COLLISION',
        `snapshot output exists with different bytes: ${file}`,
      );
    }
    return 'unchanged';
  }
  fs.writeFileSync(file, bytes);
  return 'written';
}

function existingOrCreateManifest(options: {
  manifestFile: string;
  sourceLabel: string;
  sourceDigest: string;
  officeInfo: { application?: string; appVersion?: string };
  sheet: string;
  range: string;
  runtime: RegionSnapshotRendererIdentity;
  pngFile: string;
  pngDigest: string;
  pngBytes: number;
  pngWidth: number;
  pngHeight: number;
}): RegionSnapshotManifest {
  if (fs.existsSync(options.manifestFile)) {
    const existing = JSON.parse(fs.readFileSync(options.manifestFile, 'utf8')) as RegionSnapshotManifest;
    if (
      existing.schema === REGION_SNAPSHOT_SCHEMA
      && existing.source.label === options.sourceLabel
      && existing.source.digest === options.sourceDigest
      && existing.selection.sheet === options.sheet
      && existing.selection.range === options.range
      && existing.artifact.file === path.basename(options.pngFile)
      && existing.artifact.digest === options.pngDigest
      && existing.artifact.bytes === options.pngBytes
      && existing.artifact.widthPx === options.pngWidth
      && existing.artifact.heightPx === options.pngHeight
      && existing.renderer.id === options.runtime.id
      && existing.renderer.implementationVersion === options.runtime.implementationVersion
      && existing.renderer.libreOfficeVersion === options.runtime.libreOfficeVersion
      && existing.renderer.pdftoppmVersion === options.runtime.pdftoppmVersion
      && existing.renderer.fontSetDigest === options.runtime.fontSetDigest
      && existing.renderer.dpi === options.runtime.dpi
    ) {
      return existing;
    }
    throw new RegionSnapshotError(
      'MMI_SNAPSHOT_OUTPUT_COLLISION',
      `snapshot manifest exists for different provenance: ${options.manifestFile}`,
    );
  }

  const manifest: RegionSnapshotManifest = {
    schema: REGION_SNAPSHOT_SCHEMA,
    source: {
      label: options.sourceLabel,
      digest: options.sourceDigest,
      ...options.officeInfo,
    },
    selection: {
      sheet: options.sheet,
      range: options.range,
    },
    renderer: {
      id: options.runtime.id,
      implementationVersion: options.runtime.implementationVersion,
      libreOfficeVersion: options.runtime.libreOfficeVersion,
      pdftoppmVersion: options.runtime.pdftoppmVersion,
      fontSetDigest: options.runtime.fontSetDigest,
      dpi: options.runtime.dpi,
    },
    artifact: {
      file: path.basename(options.pngFile),
      digest: options.pngDigest,
      bytes: options.pngBytes,
      widthPx: options.pngWidth,
      heightPx: options.pngHeight,
    },
    renderedAtUtc: new Date().toISOString(),
  };
  fs.writeFileSync(options.manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function readOfficeApplicationInfo(bytes: Uint8Array): {
  application?: string;
  appVersion?: string;
} {
  try {
    const app = readZip(bytes).get('docProps/app.xml');
    if (!app) return {};
    const xml = app.read().toString('utf8');
    const application = /<(?:\w+:)?Application>([^<]*)<\/(?:\w+:)?Application>/u.exec(xml)?.[1]?.trim();
    const appVersion = /<(?:\w+:)?AppVersion>([^<]*)<\/(?:\w+:)?AppVersion>/u.exec(xml)?.[1]?.trim();
    return {
      ...(application ? { application } : {}),
      ...(appVersion ? { appVersion } : {}),
    };
  } catch {
    return {};
  }
}

function firstNonEmptyLine(...values: string[]): string {
  for (const value of values) {
    const line = value.split(/\r?\n/u).map((item) => item.trim()).find(Boolean);
    if (line) return line;
  }
  return 'unknown';
}

function parsePdfPageCount(text: string): number {
  const match = /^Pages:\s+(\d+)\s*$/mu.exec(text);
  const pages = match ? Number(match[1]) : Number.NaN;
  if (!Number.isInteger(pages) || pages < 1) {
    throw new RegionSnapshotError(
      'MMI_SNAPSHOT_RENDER_FAILED',
      'pdfinfo did not report a valid page count',
    );
  }
  return pages;
}

function readPngSize(bytes: Buffer): { width: number; height: number } {
  if (
    bytes.byteLength < 24
    || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    throw new RegionSnapshotError(
      'MMI_SNAPSHOT_RENDER_FAILED',
      'snapshot rasterizer output is not a PNG',
    );
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1) {
    throw new RegionSnapshotError(
      'MMI_SNAPSHOT_RENDER_FAILED',
      'snapshot PNG has invalid dimensions',
    );
  }
  return { width, height };
}

function snapshotProvenanceComment(options: {
  source: string;
  sourceDigest: string;
  sheet: string;
  range: string;
  artifactDigest: string;
  renderer: string;
}): string {
  const clean = (value: string): string =>
    value
      .replace(/--/gu, '- -')
      .replace(/"/gu, "'")
      .replace(/[\r\n]+/gu, ' ');
  return `<!-- mmi:region-snapshot source="${clean(options.source)}" sheet="${clean(options.sheet)}" range="${clean(options.range)}" source-sha256="${options.sourceDigest.slice(7)}" artifact-sha256="${options.artifactDigest.slice(7)}" renderer="${clean(options.renderer)}" -->`;
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

const PYUNO_RANGE_EXPORT = String.raw`
import os
import sys
import time
import uno
from com.sun.star.beans import PropertyValue

source_path, sheet_name, a1_range, pdf_path, pipe_name = sys.argv[1:6]

def prop(name, value):
    item = PropertyValue()
    item.Name = name
    item.Value = value
    return item

local_ctx = uno.getComponentContext()
resolver = local_ctx.ServiceManager.createInstanceWithContext(
    'com.sun.star.bridge.UnoUrlResolver',
    local_ctx,
)
ctx = None
last_error = None
for _ in range(60):
    try:
        ctx = resolver.resolve(
            'uno:pipe,name=' + pipe_name + ';urp;StarOffice.ComponentContext'
        )
        break
    except Exception as error:
        last_error = error
        time.sleep(0.2)
if ctx is None:
    raise last_error

desktop = ctx.ServiceManager.createInstanceWithContext(
    'com.sun.star.frame.Desktop',
    ctx,
)
document = desktop.loadComponentFromURL(
    uno.systemPathToFileUrl(source_path),
    '_blank',
    0,
    (prop('Hidden', True), prop('ReadOnly', True)),
)
if document is None:
    raise RuntimeError('LibreOffice could not open the workbook')

try:
    sheets = document.getSheets()
    if not sheets.hasByName(sheet_name):
        raise RuntimeError('worksheet not found: ' + sheet_name)

    sheet = sheets.getByName(sheet_name)
    for index in range(sheets.getCount()):
        item = sheets.getByIndex(index)
        item.IsVisible = (item.getName() == sheet_name)

    selected = sheet.getCellRangeByName(a1_range)
    sheet.setPrintAreas((selected.RangeAddress,))

    styles = document.StyleFamilies.getByName('PageStyles')
    style = styles.getByName(sheet.PageStyle)
    style.LeftMargin = 0
    style.RightMargin = 0
    style.TopMargin = 0
    style.BottomMargin = 0
    style.CenterHorizontally = False
    style.CenterVertically = False
    style.Width = max(100, selected.Size.Width)
    style.Height = max(100, selected.Size.Height)
    style.ScaleToPagesX = 0
    style.ScaleToPagesY = 0
    style.ScaleToPages = 0
    for name in ('HeaderIsOn', 'FooterIsOn'):
        try:
            setattr(style, name, False)
        except Exception:
            pass

    document.storeToURL(
        uno.systemPathToFileUrl(pdf_path),
        (
            prop('FilterName', 'calc_pdf_Export'),
            prop('Overwrite', True),
        ),
    )
finally:
    document.close(True)
`;

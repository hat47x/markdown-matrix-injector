/**
 * `mmi pdf`: expand a document and hand the HTML to WeasyPrint in one step, so a delivery PDF does not need the
 * intermediate HTML file and two commands. WeasyPrint is the generator the delivery output is verified with
 * (docs/02_Architecture/delivery-pdf-output.md); MMI does not bundle it.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderDocumentHtml, RenderError, type RenderOptions } from './render.js';

/** `none` writes an untagged, unlabelled PDF; the others set the PDF identification WeasyPrint supports. */
export const PDF_VARIANTS = ['pdf/a-2a', 'pdf/a-2b', 'pdf/ua-1', 'none'] as const;
export type PdfVariant = (typeof PDF_VARIANTS)[number];

export interface PdfOptions extends RenderOptions {
  /** Output PDF path. Written through a temporary file, so a failed run never leaves a partial PDF. */
  output: string;
  variant: PdfVariant;
  /** WeasyPrint executable (default `weasyprint` from PATH). */
  weasyprint?: string;
}

export interface PdfRunResult {
  status: number | null;
  stderr: string;
  error?: Error;
}

export type PdfRunner = (command: string, args: string[], html: string) => PdfRunResult;

const runWithSpawn: PdfRunner = (command, args, html) => {
  const result = spawnSync(command, args, { input: html, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  return { status: result.status, stderr: result.stderr ?? '', error: result.error };
};

// Properties MMI's own CSS uses for other engines; WeasyPrint reports them as ignored and they change nothing.
const KNOWN_NOISE = /Ignored `(?:print-color-adjust|overflow-x)/;

/** Writes the PDF and returns WeasyPrint's warnings (for example glyphs missing from the fonts). */
export function buildPdf(options: PdfOptions, run: PdfRunner = runWithSpawn): string[] {
  const html = renderDocumentHtml(options);
  const command = options.weasyprint ?? process.env.MMI_WEASYPRINT ?? 'weasyprint';
  const temporary = `${options.output}.mmi-tmp`;
  const baseUrl = `${pathToFileURL(path.dirname(path.resolve(options.markdownFilePath))).href}/`;
  const args = ['-', temporary, '--base-url', baseUrl];
  if (options.variant !== 'none') args.push('--pdf-variant', options.variant, '--pdf-tags');
  const result = run(command, args, html);
  if (result.error) {
    fs.rmSync(temporary, { force: true });
    const missing = (result.error as NodeJS.ErrnoException).code === 'ENOENT';
    throw new RenderError(missing
      ? `WeasyPrint was not found (${command}). Install it (pip install weasyprint) or pass --weasyprint <path>.`
      : `WeasyPrint could not be started: ${result.error.message}`);
  }
  const lines = result.stderr.split(/\r?\n/).filter((line) => line.trim() && !KNOWN_NOISE.test(line));
  if (result.status !== 0) {
    fs.rmSync(temporary, { force: true });
    throw new RenderError(`WeasyPrint failed (exit ${result.status ?? 'signal'}):\n${lines.join('\n')}`);
  }
  if (!fs.existsSync(temporary)) throw new RenderError('WeasyPrint reported success but wrote no PDF.');
  fs.renameSync(temporary, options.output);
  return lines;
}

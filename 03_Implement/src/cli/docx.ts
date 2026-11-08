/**
 * `mmi docx`: a delivery document in Word through Pandoc (#636). MMI expands the references and writes the parts
 * Pandoc cannot (cover, table of contents, captions, page breaks, landscape sections, running header and footer);
 * Pandoc does the Markdown-to-Word conversion. Pandoc is not bundled.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FrontMatterError } from './documentExport.js';
import { RenderError, type RenderOptions } from './render.js';
import { renderWordMarkdown } from './wordMarkdown.js';
import { buildReferenceDocx, finishDocx } from './wordOoxml.js';

export interface DocxOptions extends RenderOptions {
  /** Output .docx path, written through a temporary file. */
  output: string;
  /** Pandoc executable (default `pandoc` from PATH, or MMI_PANDOC). */
  pandoc?: string;
  /** A Word file whose styles, header/footer and page setup replace MMI's own (Pandoc's `--reference-doc`). */
  referenceDoc?: string;
  now?: Date;
}

export interface PandocRunResult {
  status: number | null;
  stdout: Buffer;
  stderr: string;
  error?: Error;
}

export type PandocRunner = (command: string, args: string[], input?: string) => PandocRunResult;

const runWithSpawn: PandocRunner = (command, args, input) => {
  const result = spawnSync(command, args, { input, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  return { status: result.status, stdout: result.stdout ?? Buffer.alloc(0), stderr: (result.stderr ?? Buffer.alloc(0)).toString('utf8'), error: result.error };
};

function runPandoc(run: PandocRunner, command: string, args: string[], input?: string): PandocRunResult {
  const result = run(command, args, input);
  if (result.error) {
    const missing = (result.error as NodeJS.ErrnoException).code === 'ENOENT';
    throw new RenderError(missing
      ? `Pandoc was not found (${command}). Install it (https://pandoc.org/installing.html) or pass --pandoc <path>.`
      : `Pandoc could not be started: ${result.error.message}`);
  }
  if (result.status !== 0) throw new RenderError(`Pandoc failed (exit ${result.status ?? 'signal'}):\n${result.stderr.trim()}`);
  return result;
}

/** Writes the .docx and returns Pandoc's warnings. */
export function buildDocx(options: DocxOptions, run: PandocRunner = runWithSpawn): string[] {
  const command = options.pandoc ?? process.env.MMI_PANDOC ?? 'pandoc';
  let word: ReturnType<typeof renderWordMarkdown>;
  try {
    word = renderWordMarkdown(options);
  } catch (error) {
    if (error instanceof FrontMatterError) throw new RenderError(error.message);
    throw error;
  }
  const reference = options.referenceDoc
    ? fs.readFileSync(options.referenceDoc)
    : buildReferenceDocx(runPandoc(run, command, ['--print-default-data-file', 'reference.docx']).stdout, word.properties);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-docx-'));
  const temporary = `${options.output}.mmi-tmp`;
  try {
    const referencePath = path.join(temporaryDirectory, 'reference.docx');
    const convertedPath = path.join(temporaryDirectory, 'converted.docx');
    fs.writeFileSync(referencePath, reference);
    const result = runPandoc(run, command, [
      '-f', 'markdown-smart+east_asian_line_breaks', '-t', 'docx',
      '--reference-doc', referencePath,
      '--resource-path', path.dirname(path.resolve(options.markdownFilePath)),
      '-o', convertedPath,
    ], word.markdown);
    const finished = finishDocx(fs.readFileSync(convertedPath), { properties: word.properties, title: word.title, hasFields: word.hasFields, now: options.now ?? new Date() });
    fs.writeFileSync(temporary, finished);
    fs.renameSync(temporary, options.output);
    const notes = word.properties.coverTemplate
      ? ['coverTemplate is for the HTML/PDF export; the Word file uses the built-in cover (a customer cover goes in through --reference-doc)']
      : [];
    return [...notes, ...result.stderr.split(/\r?\n/).filter((line) => line.trim())];
  } finally {
    fs.rmSync(temporary, { force: true });
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

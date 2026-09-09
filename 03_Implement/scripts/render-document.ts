/** Render with the same MMI plugin as the VS Code preview before PDF conversion.
 * Usage: node --import tsx scripts/render-document.ts input.md output.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import { markdownMatrixPlugin } from '../src/plugin/markdownMatrixPlugin.js';
import { WorkbookCache } from '../src/cache/workbookCache.js';

export function renderDocument(input: string): string {
  const markdownFilePath = path.resolve(input);
  const md = new MarkdownIt({ html: true }).use(markdownMatrixPlugin, {
    markdownFilePath, workspaceRoot: path.dirname(markdownFilePath), cache: new WorkbookCache(),
  });
  const css = fs.readFileSync(new URL('../media/markdown-matrix.css', import.meta.url), 'utf8');
  const body = md.render(fs.readFileSync(markdownFilePath, 'utf8'));
  if (body.includes('class="mmi-error"')) throw new Error('MMI reference errors must be resolved before export.');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>MMI 文書出力</title><style>
  body { font-family: "Noto Sans CJK JP", "Yu Gothic", sans-serif; color: #182c40; line-height: 1.65; font-size: 10pt; }
  h1 { font-size: 21pt; } h2 { font-size: 14pt; margin-top: 1.5em; }
  a { color: #176989; } code { overflow-wrap: anywhere; } pre { white-space: pre-wrap; }
  ${css}
  @page { size: A4; margin: 18mm; @bottom-center { content: counter(page); font-size: 9pt; } }
  @page landscape { size: A4 landscape; }
  @page portrait { size: A4 portrait; }
  @media screen { body { max-width: 1100px; margin: 32px auto; padding: 0 24px; } }
  </style></head><body>${body}</body></html>`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: render-document.ts input.md output.html');
  fs.writeFileSync(output, renderDocument(input));
  console.log(`Rendered ${output}`);
}

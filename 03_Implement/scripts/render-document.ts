/** Render with the same MMI plugin as the VS Code preview before PDF conversion.
 * Usage: node --import tsx scripts/render-document.ts input.md output.html
 * Same as `mmi render input.md --to html -o output.html` (src/cli/mmi.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultWorkspaceRoot, renderDocumentHtml } from '../src/cli/render.js';

export function renderDocument(input: string): string {
  const markdownFilePath = path.resolve(input);
  return renderDocumentHtml({ markdownFilePath, workspaceRoot: defaultWorkspaceRoot(markdownFilePath) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: render-document.ts input.md output.html');
  fs.writeFileSync(output, renderDocument(input));
  console.log(`Rendered ${output}`);
}

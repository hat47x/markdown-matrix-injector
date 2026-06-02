/**
 * Regenerates 04_Documentation/samples/sier-design/design-doc-sample-rendered.html
 * using the REAL MMI render pipeline (markdownMatrixPlugin), not Pandoc.
 *
 * Pandoc cannot expand `![[...]]` embeds, so a Pandoc-only HTML contains zero
 * mmi-embed figures and is useless as G2 evidence. This script drives the same
 * plugin that the VS Code preview uses (extendMarkdownIt) and inlines the
 * contributed preview stylesheet so the output is a faithful, self-contained
 * G2 evidence artifact.
 *
 * Run:  cd 03_Implement && node --import tsx scripts/render-sample-html.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { WorkbookCache } from '../src/cache/workbookCache.js';
import { markdownMatrixPlugin } from '../src/plugin/markdownMatrixPlugin.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const sampleDir = path.join(repoRoot, '04_Documentation', 'samples', 'sier-design');
const mdPath = path.join(sampleDir, 'design-doc-sample.md');
const cssPath = path.join(repoRoot, '03_Implement', 'media', 'markdown-matrix.css');
const outPath = path.join(sampleDir, 'design-doc-sample-rendered.html');

const md = new MarkdownIt({ html: true });
md.use(markdownMatrixPlugin, {
  markdownFilePath: mdPath,
  workspaceRoot: sampleDir,
  cache: new WorkbookCache(),
});

const body = md.render(fs.readFileSync(mdPath, 'utf-8'));
const css = fs.readFileSync(cssPath, 'utf-8');
const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>システム設計書サンプル (MMI G2/G4 証跡)</title>
<style>
${css}
</style>
</head>
<body>
${body}
</body>
</html>
`;

fs.writeFileSync(outPath, html, 'utf-8');

const embedCount = (html.match(/<figure class="mmi-embed"/g) ?? []).length;
const tableCount = (html.match(/<table class="mmi-table">/g) ?? []).length;
const cardCount = (html.match(/<div class="mmi-card"/g) ?? []).length;
console.log(`Rendered ${path.relative(repoRoot, outPath)}`);
console.log(`  bytes=${html.length} figures(mmi-embed)=${embedCount} tables=${tableCount} cards=${cardCount}`);
if (embedCount === 0) {
  throw new Error('Regeneration produced zero mmi-embed figures — embeds were not expanded.');
}

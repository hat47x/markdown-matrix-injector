/**
 * "Find a table by description" on the fictional 方眼紙 corpus
 * (02_Architecture/import-assistance.md §6.6). For each request, the first
 * candidate's reference is rendered through the real pipeline and judged:
 * does it show the expected table, with the requested columns?
 *
 * Only APIs that predate the import engine are used, so the same script
 * measures the product before and after the change.
 *
 * Usage: node --import tsx scripts/import-assist-eval/search.ts
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderEmbedTable } from '../../src/core/renderTable.js';
import { getSmartFallbackDecisionAfterLoad } from '../../src/core/smartFallback.js';
import { loadWorkbook } from '../../src/core/workbookLoader.js';
import { parseEmbedSyntax } from '../../src/parser/embedSyntax.js';
import { WorkspaceRegionIndex } from '../../src/search/workspaceRegionIndex.js';
import { writeImportCorpus, type ExpectedTable } from './corpus.js';

/** Requests written with the corpus layout in view (not blind); a demonstration, not a benchmark. */
const REQUESTS: { text: string; table: string; columns?: string[] }[] = [
  { text: '受注登録の画面項目', table: '画面定義書_受注.xlsx/受注登録/items' },
  { text: '受注照会のイベント', table: '画面定義書_受注.xlsx/受注照会/events' },
  { text: '出荷指示の画面項目の項目名と初期値', table: '画面定義書_受注.xlsx/出荷指示/items', columns: ['項目名', '初期値'] },
  { text: 'T_ORDER_DETAILのカラム定義の論理名と物理名とデータ型', table: 'テーブル定義書_受注.xlsx/T_ORDER_DETAIL/columns', columns: ['論理名', '物理名', 'データ型'] },
  { text: 'テーブル定義書の改訂履歴', table: 'テーブル定義書_受注.xlsx/改訂履歴/revisions' },
  { text: 'コード定義の配送区分', table: 'テーブル定義書_受注.xlsx/コード定義/delivery' },
  { text: 'メッセージ一覧のメッセージIDとメッセージ', table: '権限・メッセージ定義.xlsx/メッセージ一覧/messages', columns: ['メッセージID', 'メッセージ'] },
];

const cellsOf = (html: string, tag: 'th' | 'td'): string[] =>
  [...html.matchAll(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'gs'))].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'));

function project(expected: ExpectedTable, columns?: string[]): { headers: string[]; first: string[] } {
  const indexes = columns ? columns.map((name) => expected.headers.indexOf(name)) : expected.headers.map((_, i) => i);
  return { headers: indexes.map((i) => expected.headers[i]), first: indexes.map((i) => expected.body[0][i]) };
}

export async function main(): Promise<Record<string, unknown>> {
  const corpus = writeImportCorpus();
  const files = corpus.books.map((book) => path.join(corpus.dir, book));
  const index = new WorkspaceRegionIndex({
    loadWorkbook: (file) => loadWorkbook({ absolutePath: file }),
    statFile: (file) => {
      const stat = fs.statSync(file);
      return { mtimeMs: stat.mtimeMs, size: stat.size };
    },
  });
  await index.refresh(files);
  const judge = (markdown: string, expected: ExpectedTable, columns?: string[]) => {
    const query = parseEmbedSyntax(markdown)!;
    const workbook = loadWorkbook({ absolutePath: path.join(corpus.dir, path.basename(query.filepath)) });
    const renderMode = getSmartFallbackDecisionAfterLoad(query, workbook).renderMode;
    const html = renderMode === 'table' ? renderEmbedTable(query, workbook) : '';
    const want = project(expected, columns);
    const headers = cellsOf(html, 'th');
    const first = cellsOf(html, 'td').slice(0, want.headers.length);
    return { renderMode, headers, ok: renderMode === 'table' && JSON.stringify(headers) === JSON.stringify(want.headers) && JSON.stringify(first) === JSON.stringify(want.first) };
  };
  const results = REQUESTS.map((request) => {
    const expected = corpus.tables.find((table) => table.id === request.table)!;
    const result = index.query(request.text, (bookPath) => `./${path.basename(bookPath)}`);
    const judged = result.candidates.map((candidate) => ({ reference: candidate.markdown, ...judge(candidate.markdown, expected, request.columns) }));
    return { request: request.text, status: result.status, top1: judged[0]?.ok ?? false, within5: judged.some((j) => j.ok), candidates: judged };
  });
  return {
    top1: `${results.filter((r) => r.top1).length}/${results.length}`,
    within5: `${results.filter((r) => r.within5).length}/${results.length}`,
    results,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await main(), null, 2));
}

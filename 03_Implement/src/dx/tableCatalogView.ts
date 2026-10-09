/**
 * "MMI 表の目録" in the Explorer (02_Architecture/table-navigation.md §6):
 * workbooks -> sheets -> tables -> columns, read without opening Excel.
 * A table can be inserted as a whole, or narrowed by choosing columns by
 * their headers and rows by a keyword or a count; either way the reference
 * goes through the guided flow's confirm step (the real rendering) before
 * anything is inserted. The workbooks are only read.
 */
import path from 'node:path';
import * as vscode from 'vscode';
import { describeWorkbook, analyzeBook, type CatalogTable, type WorkbookCatalog } from '../navigate/catalog.js';
import { selectFromBook, type RowSelection, type SelectionRequest, type SelectionResult } from '../navigate/select.js';
import { parseEmbedParts, type EmbedParts } from './embedEditor.js';
import { readWorkbookCached } from './sharedWorkbookCache.js';
import { toRelativeSuggestion } from './vscodeAdapters.js';

export const CATALOG_VIEW_ID = 'markdownMatrixInjector.tableCatalog';
export const CATALOG_REFRESH_COMMAND_ID = 'markdownMatrixInjector.catalog.refresh';
export const CATALOG_AUTHOR_SHEET_COMMAND_ID =
  'markdownMatrixInjector.catalog.authorFromSheet';
export const CATALOG_INSERT_TABLE_COMMAND_ID = 'markdownMatrixInjector.catalog.insertTable';
export const CATALOG_SELECT_COMMAND_ID = 'markdownMatrixInjector.catalog.selectFromTable';

/** Same file types as the rest of input assistance (the workbook glob); .xlsm/.xlsb are an open decision (table-navigation.md §7). */
const IMPORTABLE = /\.(xlsx|xls|xml|csv)$/i;

type Node =
  | { kind: 'book'; bookPath: string }
  | { kind: 'sheet'; bookPath: string; sheet: WorkbookCatalog['sheets'][number] }
  | { kind: 'table'; bookPath: string; table: CatalogTable }
  | { kind: 'column'; bookPath: string; table: CatalogTable; column: CatalogTable['columns'][number] };

export class TableCatalogProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly catalogs = new Map<string, WorkbookCatalog>();

  constructor(private readonly workbookGlob: string) {}

  refresh(): void {
    this.catalogs.clear();
    this.changed.fire(undefined);
  }

  catalogOf(bookPath: string): WorkbookCatalog {
    let catalog = this.catalogs.get(bookPath);
    if (!catalog) {
      catalog = describeWorkbook(bookPath, { workbook: readWorkbookCached(bookPath) });
      this.catalogs.set(bookPath, catalog);
    }
    return catalog;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'book') {
      const item = new vscode.TreeItem(path.basename(node.bookPath), vscode.TreeItemCollapsibleState.Collapsed);
      item.description = vscode.workspace.asRelativePath(path.dirname(node.bookPath));
      item.iconPath = new vscode.ThemeIcon('file');
      item.resourceUri = vscode.Uri.file(node.bookPath);
      item.contextValue = 'mmiBook';
      return item;
    }
    if (node.kind === 'sheet') {
      const item = new vscode.TreeItem(node.sheet.name, node.sheet.tables.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
      const hidden = node.sheet.visibility === 'visible' ? '' : node.sheet.visibility === 'hidden' ? '非表示・' : 'Excelで表示不可・';
      item.description = `${hidden}表 ${node.sheet.tables.length}`;
      item.iconPath = new vscode.ThemeIcon('table');
      item.contextValue = 'mmiSheet';
      return item;
    }
    if (node.kind === 'table') {
      const label = node.table.excelTable ?? node.table.title ?? node.table.range;
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
      item.description = `${node.table.range}・${node.table.bodyRows}行${node.table.cautions.length > 0 ? '・注意あり' : ''}`;
      item.tooltip = [
        node.table.id,
        node.table.source === 'excel-table' ? 'Excelテーブル（ブックで宣言された表）' : '構造から推定した表',
        ...(node.table.names.length > 0 ? [`名前: ${node.table.names.join('、')}`] : []),
        ...node.table.cautions.map((caution) => `注意: ${caution.message}`),
      ].join('\n');
      item.iconPath = new vscode.ThemeIcon(node.table.cautions.length > 0 ? 'warning' : 'symbol-structure');
      item.contextValue = 'mmiTable';
      return item;
    }
    const item = new vscode.TreeItem(node.column.header || `（${node.column.sheetColumn}列・見出しなし）`, vscode.TreeItemCollapsibleState.None);
    item.description = `${node.column.sheetColumn}列`;
    item.iconPath = new vscode.ThemeIcon('symbol-field');
    item.contextValue = 'mmiColumn';
    return item;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!node) {
      const files = (await vscode.workspace.findFiles(this.workbookGlob, '**/{node_modules,dist}/**', 2000))
        .filter((uri) => IMPORTABLE.test(uri.fsPath) && !path.basename(uri.fsPath).startsWith('~$'))
        .sort((a, b) => a.fsPath.localeCompare(b.fsPath));
      return files.map((uri) => ({ kind: 'book', bookPath: uri.fsPath }));
    }
    if (node.kind === 'book') {
      try {
        return this.catalogOf(node.bookPath).sheets.map((sheet) => ({ kind: 'sheet', bookPath: node.bookPath, sheet }));
      } catch (error) {
        void vscode.window.showWarningMessage(`MMI: ${path.basename(node.bookPath)} を読めませんでした: ${(error as Error).message}`);
        return [];
      }
    }
    if (node.kind === 'sheet') return node.sheet.tables.map((table) => ({ kind: 'table', bookPath: node.bookPath, table }));
    if (node.kind === 'table') return node.table.columns.map((column) => ({ kind: 'column', bookPath: node.bookPath, table: node.table, column }));
    return [];
  }
}

/** Builds the selection for the active Markdown document; `undefined` when there is no such document. */
export function selectForActiveDocument(bookPath: string, request: SelectionRequest): SelectionResult | undefined {
  const document = vscode.window.activeTextEditor?.document;
  if (!document || document.languageId !== 'markdown' || document.uri.scheme !== 'file') return undefined;
  const referencePath = toRelativeSuggestion(document.uri.fsPath, bookPath);
  return selectFromBook(analyzeBook(bookPath, referencePath, { workbook: readWorkbookCached(bookPath) }), referencePath, request);
}

/**
 * Asks for columns (by header) and rows, then returns the parts for the
 * confirm step. Warnings (e.g. grep matching more rows than the chosen
 * column) are shown before the confirm step, which then shows the real table.
 */
export async function chooseSelection(bookPath: string, table: CatalogTable): Promise<EmbedParts | undefined> {
  const headers = table.columns.map((column) => column.header).filter((header) => header !== '');
  let columns: string[] | undefined;
  if (headers.length > 0) {
    const picked = await vscode.window.showQuickPick(
      headers.map((header) => ({ label: header, picked: true })),
      { title: `MMI: ${table.excelTable ?? table.title ?? table.range} の列を選ぶ（見出しで選びます）`, canPickMany: true },
    );
    if (!picked) return undefined;
    if (picked.length === 0) {
      void vscode.window.showInformationMessage('MMI: 列を1つ以上選んでください。');
      return undefined;
    }
    columns = picked.length === headers.length ? undefined : picked.map((item) => item.label);
  }
  const mode = await vscode.window.showQuickPick(
    [
      { label: 'すべての行', value: 'all' as const },
      { label: '文字列を含む行', description: 'grep（表示する列のどこかに部分一致）', value: 'contains' as const },
      { label: '先頭から指定した行数', value: 'first' as const },
    ],
    { title: 'MMI: 行を選ぶ' },
  );
  if (!mode) return undefined;
  let rows: RowSelection | undefined;
  if (mode.value === 'contains') {
    const text = await vscode.window.showInputBox({ title: 'MMI: 含む文字列', prompt: '例: 保留、NG、要確認' });
    if (!text) return undefined;
    const shown = columns ?? headers;
    const column = shown.length > 0
      ? await vscode.window.showQuickPick([{ label: '（どの列でもよい）', value: '' }, ...shown.map((header) => ({ label: header, value: header }))], {
          title: 'MMI: どの列に含む行ですか（違う列に含む行も表示される場合は知らせます）',
        })
      : undefined;
    if (shown.length > 0 && !column) return undefined;
    rows = { contains: text, ...(column?.value ? { column: column.value } : {}) };
  } else if (mode.value === 'first') {
    const count = await vscode.window.showInputBox({ title: 'MMI: 行数', validateInput: (value) => (/^[1-9]\d*$/.test(value) ? undefined : '1以上の整数') });
    if (!count) return undefined;
    rows = { first: Number(count) };
  }
  const result = selectForActiveDocument(bookPath, { table: table.id, ...(columns ? { columns } : {}), ...(rows ? { rows } : {}) });
  return partsFromResult(result);
}

export function partsFromResult(result: SelectionResult | undefined): EmbedParts | undefined {
  if (!result) {
    void vscode.window.showInformationMessage('MMI: 参照を入れるMarkdown文書を開き、カーソルを置いてから実行してください。');
    return undefined;
  }
  if (!result.ok || !result.reference) {
    void vscode.window.showErrorMessage(`MMI: ${result.errors.map((error) => `${error.message}${error.suggestions?.length ? `（候補: ${error.suggestions.join('、')}）` : ''}`).join(' ')}`);
    return undefined;
  }
  const warnings = result.warnings.filter((warning) => warning.code !== 'TABLE_CAUTION');
  if (warnings.length > 0) void vscode.window.showWarningMessage(`MMI: ${warnings.map((warning) => warning.message).join(' ')}`);
  return parseEmbedParts(result.reference);
}

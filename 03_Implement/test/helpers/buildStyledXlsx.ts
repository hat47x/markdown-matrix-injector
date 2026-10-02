/**
 * 書式付きの小さな .xlsx をコードで組み立てる（issue-0198 のスナップショット試験用）。
 * バイナリの fixture を置かず、どこでも同じバイト列を作れる。
 *
 * 列幅・行の高さ・非表示、セル値（共有文字列・数値）、セル結合、styles.xml（fonts・fills・
 * borders・cellXfs）、描画（画像・図形・グラフ・グループ）を指定できる。
 */
import { zipOf } from './buildXlsxWithImages.js';

export const esc = (value: string): string => value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');

export interface StyledCell {
  /** A1 形式。 */
  ref: string;
  value?: string | number;
  /** cellXfs の番号。 */
  style?: number;
}

export interface StyledSheet {
  name: string;
  cols?: { min: number; max: number; width: number; hidden?: boolean }[];
  rows?: { r: number; ht?: number; hidden?: boolean }[];
  cells?: StyledCell[];
  merges?: string[];
  showGridLines?: boolean;
  defaultRowHeight?: number;
  /** wsDr の子要素（アンカー）をそのまま並べる。画像は `media` で rId を指定する。 */
  anchors?: string[];
  /** 描画の関係（rId → xl/media の名前）。 */
  drawingMedia?: Record<string, string>;
  /** 生成した描画XMLを置き換える（壊れた描画を作るため）。 */
  rawDrawing?: string;
  /** sheetData の後ろへそのまま足す（conditionalFormatting など）。 */
  extraXml?: string;
}

export interface StyleSheetSpec {
  /** `<font>...</font>` の中身。0番目が標準フォント。 */
  fonts?: string[];
  /** `<fill>...</fill>` の中身。0・1番目は Excel の予約（none・gray125）。 */
  fills?: string[];
  /** `<border>...</border>` の中身と属性。 */
  borders?: { attrs?: string; body: string }[];
  /** `<xf .../>` を丸ごと。 */
  cellXfs?: string[];
}

const DEFAULT_STYLES: Required<StyleSheetSpec> = {
  fonts: ['<sz val="11"/><name val="Yu Gothic"/>'],
  fills: ['<patternFill patternType="none"/>', '<patternFill patternType="gray125"/>'],
  borders: [{ body: '<left/><right/><top/><bottom/><diagonal/>' }],
  cellXfs: ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'],
};

export function styleSheetXml(spec: StyleSheetSpec = {}): string {
  const fonts = spec.fonts ?? DEFAULT_STYLES.fonts;
  const fills = spec.fills ?? DEFAULT_STYLES.fills;
  const borders = spec.borders ?? DEFAULT_STYLES.borders;
  const xfs = spec.cellXfs ?? DEFAULT_STYLES.cellXfs;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<fonts count="${fonts.length}">${fonts.map((f) => `<font>${f}</font>`).join('')}</fonts>`
    + `<fills count="${fills.length}">${fills.map((f) => `<fill>${f}</fill>`).join('')}</fills>`
    + `<borders count="${borders.length}">${borders.map((b) => `<border${b.attrs ? ` ${b.attrs}` : ''}>${b.body}</border>`).join('')}</borders>`
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}

const cellRow = (ref: string): number => Number(/\d+$/u.exec(ref)?.[0] ?? 1);

function sheetXml(sheet: StyledSheet, sharedIndex: (text: string) => number, hasDrawing: boolean): string {
  const rowMeta = new Map((sheet.rows ?? []).map((row) => [row.r, row]));
  const byRow = new Map<number, StyledCell[]>();
  for (const cell of sheet.cells ?? []) byRow.set(cellRow(cell.ref), [...(byRow.get(cellRow(cell.ref)) ?? []), cell]);
  for (const r of rowMeta.keys()) if (!byRow.has(r)) byRow.set(r, []);
  const rows = [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([r, cells]) => {
    const meta = rowMeta.get(r);
    const attrs = `${meta?.ht !== undefined ? ` ht="${meta.ht}" customHeight="1"` : ''}${meta?.hidden ? ' hidden="1"' : ''}`;
    const body = cells.map((cell) => {
      const s = cell.style ? ` s="${cell.style}"` : '';
      if (cell.value === undefined) return `<c r="${cell.ref}"${s}/>`;
      if (typeof cell.value === 'number') return `<c r="${cell.ref}"${s}><v>${cell.value}</v></c>`;
      return `<c r="${cell.ref}"${s} t="s"><v>${sharedIndex(cell.value)}</v></c>`;
    }).join('');
    return `<row r="${r}"${attrs}>${body}</row>`;
  });
  const cols = sheet.cols?.length
    ? `<cols>${sheet.cols.map((c) => `<col min="${c.min}" max="${c.max}" width="${c.width}" customWidth="1"${c.hidden ? ' hidden="1"' : ''}/>`).join('')}</cols>`
    : '';
  const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<sheetViews><sheetView workbookViewId="0"${sheet.showGridLines === false ? ' showGridLines="0"' : ''}/></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="${sheet.defaultRowHeight ?? 15}"/>`
    + cols
    + `<sheetData>${rows.join('')}</sheetData>`
    + merges
    + (sheet.extraXml ?? '')
    + (hasDrawing ? '<drawing r:id="rId1"/>' : '')
    + '</worksheet>';
}

export function buildStyledXlsx(sheets: StyledSheet[], options: { styles?: StyleSheetSpec; media?: Record<string, Buffer> } = {}): Buffer {
  const entries: Record<string, Buffer | string> = {};
  const shared: string[] = [];
  const sharedIndex = (text: string): number => {
    const found = shared.indexOf(text);
    if (found >= 0) return found;
    shared.push(text);
    return shared.length - 1;
  };
  const contentTypes = [
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Default Extension="png" ContentType="image/png"/>',
    '<Default Extension="emf" ContentType="image/x-emf"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
  ];
  const workbookRels: string[] = [];
  const sheetTags: string[] = [];
  sheets.forEach((sheet, index) => {
    const n = index + 1;
    contentTypes.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    workbookRels.push(`<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`);
    sheetTags.push(`<sheet name="${esc(sheet.name)}" sheetId="${n}" r:id="rId${n}"/>`);
    const hasDrawing = sheet.anchors !== undefined || sheet.rawDrawing !== undefined;
    entries[`xl/worksheets/sheet${n}.xml`] = sheetXml(sheet, sharedIndex, hasDrawing);
    if (hasDrawing) {
      contentTypes.push(`<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
      entries[`xl/drawings/drawing${n}.xml`] = sheet.rawDrawing
        ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${(sheet.anchors ?? []).join('')}</xdr:wsDr>`;
      entries[`xl/worksheets/_rels/sheet${n}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`;
      const rels = Object.entries(sheet.drawingMedia ?? {}).map(([rid, media]) => `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${media}"/>`);
      entries[`xl/drawings/_rels/drawing${n}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`;
    }
  });
  workbookRels.push(`<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);
  workbookRels.push(`<Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`);
  for (const [name, bytes] of Object.entries(options.media ?? {})) entries[`xl/media/${name}`] = bytes;
  entries['xl/styles.xml'] = styleSheetXml(options.styles);
  entries['xl/sharedStrings.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`;
  entries['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${contentTypes.join('')}</Types>`;
  entries['_rels/.rels'] = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  entries['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags.join('')}</sheets></workbook>`;
  entries['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels.join('')}</Relationships>`;
  return zipOf(entries);
}

// --- 描画アンカーの部品 ------------------------------------------------------------------

/** [列, 行]（0始まり）と、オフセット（EMU）。 */
export type At = [number, number, number?, number?];

const point = (tag: string, [col, row, colOff = 0, rowOff = 0]: At): string =>
  `<xdr:${tag}><xdr:col>${col}</xdr:col><xdr:colOff>${colOff}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>${rowOff}</xdr:rowOff></xdr:${tag}>`;

export const twoCell = (from: At, to: At, body: string): string =>
  `<xdr:twoCellAnchor>${point('from', from)}${point('to', to)}${body}<xdr:clientData/></xdr:twoCellAnchor>`;

export function picture(id: number, rid: string, name: string, extra = ''): string {
  return `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="${esc(name)}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${rid}"/>${extra}<a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>`;
}

export interface ShapeSpec {
  id: number;
  name: string;
  prst?: string;
  /** spPr の中身（塗り・線）。prstGeom の後ろに入る。 */
  paint?: string;
  text?: string;
  /** a:bodyPr の属性。 */
  bodyPr?: string;
  xfrm?: string;
  connector?: boolean;
  /** custGeom を使う（フリーフォーム）。 */
  custom?: boolean;
}

export function shape(spec: ShapeSpec): string {
  const geometry = spec.custom
    ? '<a:custGeom><a:avLst/><a:gdLst/><a:pathLst><a:path w="10" h="10"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="10" y="10"/></a:lnTo></a:path></a:pathLst></a:custGeom>'
    : `<a:prstGeom prst="${spec.prst ?? 'rect'}"><a:avLst/></a:prstGeom>`;
  const spPr = `<xdr:spPr>${spec.xfrm ?? ''}${geometry}${spec.paint ?? ''}</xdr:spPr>`;
  if (spec.connector) {
    return `<xdr:cxnSp macro=""><xdr:nvCxnSpPr><xdr:cNvPr id="${spec.id}" name="${esc(spec.name)}"/><xdr:cNvCxnSpPr/></xdr:nvCxnSpPr>${spPr}</xdr:cxnSp>`;
  }
  const text = spec.text !== undefined
    ? `<xdr:txBody><a:bodyPr ${spec.bodyPr ?? 'anchor="ctr"'}/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" sz="1100"><a:solidFill><a:srgbClr val="1F1F1F"/></a:solidFill></a:rPr><a:t>${esc(spec.text)}</a:t></a:r></a:p></xdr:txBody>`
    : '';
  return `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${spec.id}" name="${esc(spec.name)}"/><xdr:cNvSpPr/></xdr:nvSpPr>${spPr}${text}</xdr:sp>`;
}

export const chartFrame = (id: number, name: string): string =>
  `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${esc(name)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId99"/></a:graphicData></a:graphic></xdr:graphicFrame>`;

export const groupShape = (id: number, name: string, children: string): string =>
  `<xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="${id}" name="${esc(name)}"/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></xdr:grpSpPr>${children}</xdr:grpSp>`;

/**
 * 図形入りの架空の設計シート（画面遷移の図）。目視確認とテストで共通に使う。
 * 矩形・角丸矩形・楕円・矢印付き直線・ブロック矢印・貼り付け画像・グラフ・グループ・
 * フリーフォーム・吹き出し（未対応）を含む。
 */
export function shapeDesignSheet(png: Buffer): Buffer {
  const solid = (hex: string) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
  const line = (hex: string, w = 12700, extra = '') => `<a:ln w="${w}">${solid(hex)}${extra}</a:ln>`;
  return buildStyledXlsx([
    {
      name: '画面遷移',
      showGridLines: false,
      // 方眼紙: Yu Gothic 11pt で 26px の列。
      cols: [{ min: 1, max: 20, width: 3.25 }],
      cells: [
        { ref: 'B2', value: '画面遷移図', style: 1 },
        { ref: 'B14', value: '備考: 図形はMMIが描いたもの', style: 0 },
      ],
      merges: ['B2:H3'],
      anchors: [
        twoCell([1, 4], [6, 7], shape({ id: 2, name: 'ログイン', prst: 'rect', paint: `${solid('DDEBF7')}${line('2F5597')}`, text: 'ログイン' })),
        twoCell([9, 4], [14, 7], shape({ id: 3, name: 'メニュー', prst: 'roundRect', paint: `${solid('E2F0D9')}${line('548235')}`, text: 'メニュー' })),
        twoCell([6, 5, 0, 95250], [9, 5, 0, 95250], shape({ id: 4, name: '遷移', prst: 'straightConnector1', connector: true, paint: line('000000', 12700, '<a:tailEnd type="triangle"/>') })),
        twoCell([15, 4], [19, 7], shape({ id: 5, name: '終了', prst: 'ellipse', paint: `${solid('FFF2CC')}${line('BF9000')}`, text: '終了' })),
        twoCell([1, 8], [4, 10], shape({ id: 6, name: '右矢印', prst: 'rightArrow', paint: `${solid('F4B183')}` })),
        twoCell([5, 8], [9, 12], picture(7, 'rId1', '画面ダンプ')),
        twoCell([10, 8], [13, 12], chartFrame(8, 'グラフ 1')),
        twoCell([14, 8], [16, 10], groupShape(9, 'グループ 1', shape({ id: 10, name: '子', prst: 'rect' }))),
        twoCell([16, 8], [18, 10], shape({ id: 11, name: '吹き出し', prst: 'wedgeRectCallout', paint: solid('FFFFFF'), text: '注記' })),
        twoCell([14, 11], [16, 13], shape({ id: 12, name: 'フリーフォーム', custom: true })),
      ],
      drawingMedia: { rId1: 'image1.png' },
    },
  ], {
    styles: {
      fonts: ['<sz val="11"/><name val="Yu Gothic"/>', '<b/><sz val="14"/><color theme="1"/><name val="Yu Gothic"/>'],
      cellXfs: [
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
      ],
    },
    media: { 'image1.png': png },
  });
}

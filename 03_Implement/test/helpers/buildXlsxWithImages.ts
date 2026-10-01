/**
 * Builds small .xlsx packages with embedded pictures, in code, so image tests
 * are reproducible anywhere (no binary fixtures, no Excel). Fictional screen
 * dumps only: flat-colour PNGs. Covers what the image adapter must survive:
 * several sheets, one-cell/two-cell/absolute anchors, the same picture placed
 * twice, EMF media, a missing media part, an external (linked) picture and a
 * truncated drawing.
 */
import { crc32, deflateRawSync, deflateSync } from 'node:zlib';

export function zipOf(entries: Record<string, Buffer | string>, deflate = true): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const packed = deflate ? deflateRawSync(data) : data;
    const nameBytes = Buffer.from(name, 'utf8');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(deflate ? 8 : 0, 8);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    parts.push(header, nameBytes, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(deflate ? 8 : 0, 10);
    entry.writeUInt32LE(crc32(data), 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

/** A valid flat-colour PNG. */
export function pngOf(width: number, height: number, rgb: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** An EMF-looking blob: the signature at offset 40 is what the adapter checks. */
export function emfOf(): Buffer {
  const bytes = Buffer.alloc(88);
  bytes.writeUInt32LE(1, 0);
  bytes.writeUInt32LE(0x464d4520, 40);
  return bytes;
}

export interface AnchorSpec {
  kind: 'two' | 'one' | 'abs';
  /** [col, row], 0-based. */
  from?: [number, number];
  /** [col, row] of the `to` cell; offsets are zero unless `toOffset` is set. */
  to?: [number, number];
  toOffset?: boolean;
  ext?: [number, number];
  /** File name under xl/media. */
  media: string;
  name?: string;
  descr?: string;
  /** `embed` (default) or `link` (an external picture). */
  via?: 'embed' | 'link';
  /** Reference a media file that is not in the package. */
  missing?: boolean;
}

export interface SheetSpec {
  name: string;
  /** [row, col, text] cells, 0-based, written as inline strings. */
  cells?: [number, number, string][];
  anchors?: AnchorSpec[];
  /** Replaces the generated drawing XML (to make a broken one). */
  rawDrawing?: string;
}

const esc = (value: string): string => value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
const colName = (index: number): string => {
  let out = '';
  for (let v = index + 1; v > 0; v = Math.floor((v - 1) / 26)) out = String.fromCharCode(65 + ((v - 1) % 26)) + out;
  return out;
};

function drawingXml(sheet: SheetSpec, rels: string[]): string {
  const anchors = (sheet.anchors ?? []).map((a, i) => {
    const rid = `rId${i + 1}`;
    rels.push(
      a.via === 'link'
        ? `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="file:///C:/dumps/${a.media}" TargetMode="External"/>`
        : `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${a.missing ? `gone-${a.media}` : a.media}"/>`,
    );
    const point = (tag: string, [col, row]: [number, number], offsets: boolean) =>
      `<xdr:${tag}><xdr:col>${col}</xdr:col><xdr:colOff>${offsets ? 190500 : 0}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>${offsets ? 95250 : 0}</xdr:rowOff></xdr:${tag}>`;
    const pic = `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="${esc(a.name ?? `Picture ${i + 1}`)}"${a.descr ? ` descr="${esc(a.descr)}"` : ''}/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip ${a.via === 'link' ? 'r:link' : 'r:embed'}="${rid}"/></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="999" cy="999"/></a:xfrm></xdr:spPr></xdr:pic><xdr:clientData/>`;
    if (a.kind === 'two') return `<xdr:twoCellAnchor>${point('from', a.from ?? [0, 0], false)}${point('to', a.to ?? [1, 1], a.toOffset ?? false)}${pic}</xdr:twoCellAnchor>`;
    if (a.kind === 'one') return `<xdr:oneCellAnchor>${point('from', a.from ?? [0, 0], false)}<xdr:ext cx="${a.ext?.[0] ?? 1905000}" cy="${a.ext?.[1] ?? 952500}"/>${pic}</xdr:oneCellAnchor>`;
    return `<xdr:absoluteAnchor><xdr:pos x="0" y="0"/><xdr:ext cx="${a.ext?.[0] ?? 1905000}" cy="${a.ext?.[1] ?? 952500}"/>${pic}</xdr:absoluteAnchor>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join('')}</xdr:wsDr>`;
}

export function buildXlsxWithImages(sheets: SheetSpec[], media: Record<string, Buffer>): Buffer {
  const entries: Record<string, Buffer | string> = {};
  const contentTypes = ['<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>', '<Default Extension="xml" ContentType="application/xml"/>', '<Default Extension="png" ContentType="image/png"/>', '<Default Extension="emf" ContentType="image/x-emf"/>'];
  const workbookRels: string[] = [];
  const sheetTags: string[] = [];
  sheets.forEach((sheet, index) => {
    const n = index + 1;
    contentTypes.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    workbookRels.push(`<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`);
    sheetTags.push(`<sheet name="${esc(sheet.name)}" sheetId="${n}" r:id="rId${n}"/>`);
    const byRow = new Map<number, [number, string][]>();
    for (const [row, col, value] of sheet.cells ?? []) byRow.set(row, [...(byRow.get(row) ?? []), [col, value]]);
    const rows = [...byRow.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([row, cells]) => `<row r="${row + 1}">${cells.sort((a, b) => a[0] - b[0]).map(([col, value]) => `<c r="${colName(col)}${row + 1}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`).join('')}</row>`);
    const hasDrawing = sheet.anchors !== undefined || sheet.rawDrawing !== undefined;
    entries[`xl/worksheets/sheet${n}.xml`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${rows.join('')}</sheetData>${hasDrawing ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
    if (hasDrawing) {
      const drawingRels: string[] = [];
      entries[`xl/drawings/drawing${n}.xml`] = sheet.rawDrawing ?? drawingXml(sheet, drawingRels);
      entries[`xl/worksheets/_rels/sheet${n}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`;
      entries[`xl/drawings/_rels/drawing${n}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRels.join('')}</Relationships>`;
    }
  });
  for (const [name, bytes] of Object.entries(media)) entries[`xl/media/${name}`] = bytes;
  entries['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${contentTypes.join('')}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>`;
  entries['_rels/.rels'] = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  entries['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags.join('')}</sheets></workbook>`;
  entries['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels.join('')}</Relationships>`;
  return zipOf(entries);
}

/** The reference fixture: a fictional screen-design workbook. */
export function screenDesignWorkbook(
  overrides: { login?: Buffer; menu?: Buffer } = {},
): { bytes: Buffer; media: Record<string, Buffer> } {
  const login = overrides.login ?? pngOf(8, 6, [30, 90, 200]);
  const menu = overrides.menu ?? pngOf(10, 4, [200, 60, 60]);
  const media = { 'image1.png': login, 'image2.png': menu };
  const table: [number, number, string][] = [
    [0, 0, '画面ID'], [0, 1, '画面名'],
    [1, 0, 'S01'], [1, 1, 'ログイン'],
    [2, 0, 'S02'], [2, 1, 'メニュー'],
  ];
  const bytes = buildXlsxWithImages(
    [
      {
        name: '画面一覧',
        cells: table,
        anchors: [
          // Right of the table, same rows.
          { kind: 'two', from: [3, 0], to: [6, 4], name: 'ログイン画面', descr: 'ログイン画面のダンプ', media: 'image1.png' },
          // Two rows below the table (a gap of 1 empty row), one-cell anchor.
          { kind: 'one', from: [0, 5], media: 'image2.png', name: 'メニュー画面' },
          // The same media placed again: a duplicate by content.
          { kind: 'two', from: [8, 8], to: [10, 10], toOffset: true, media: 'image1.png', name: 'ログイン画面(再掲)' },
        ],
      },
      { name: '遷移図', cells: [[0, 0, '遷移図']], anchors: [{ kind: 'abs', media: 'image2.png', name: '遷移' }] },
      { name: 'メモ', cells: [[0, 0, '画像なし']] },
    ],
    media,
  );
  return { bytes, media };
}

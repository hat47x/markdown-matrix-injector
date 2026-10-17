import { capNames, similarNames } from './helpers.js';
import type { AllowedValues, MessageTable } from './types.js';

const quoted = (names: readonly string[], more: number): string =>
  names.map((name) => `「${name}」`).join('、') + (more > 0 ? ` ほか${more}件` : '');

function allowed(values: AllowedValues): string {
  switch (values.kind) {
    case 'enum':
      return values.values.join(' / ');
    case 'header':
      return 'first / none / 行番号';
    case 'columns':
      return '列文字のカンマ区切り（例: A,C）';
    case 'formatColumn':
      return '列:形式（例: E:json）';
    default:
      return '1文字以上';
  }
}

const bindingLabel = (kind: 'table' | 'name', declared: string): string =>
  `${kind === 'table' ? 'Excelテーブル' : '名前'}「${declared}」`;

export const jaMessages: MessageTable = {
  sheetNotFound: ({ sheet, available }) => {
    const base = `シート「${sheet}」が見つかりません。`;
    if (!available || available.length === 0) return base;
    const similar = similarNames(sheet, available);
    if (similar.length > 0) {
      const { shown, more } = capNames(similar);
      return `${base}シート名が変わった可能性があります。近い名前: ${quoted(shown, more)}`;
    }
    const { shown, more } = capNames(available);
    return `${base}このブックのシート: ${quoted(shown, more)}`;
  },
  sourceNotResolved: ({ path }) => `参照先のファイルが見つかりません: ${path}`,
  fileNotFound: ({ path }) => `参照先のファイルが見つかりません: ${path}`,
  outsideBoundary: ({ path, boundary }) =>
    `参照先のファイルが作業フォルダーの外にあります: ${path}` + (boundary ? `（作業フォルダー: ${boundary}）` : ''),
  invalidXml: () => 'XMLスプレッドシートとして読めません。対応しているのはSpreadsheet 2003 XMLだけです。',
  tableTooLarge: ({ cellCount, limit }) =>
    `表として表示するには大きすぎます（${cellCount}セルが上限の${limit}セルを超えています）。` +
    'mode=tableを指定しても上限は変わりません。範囲を絞るか、参照を分けてください。',
  timeBudgetExceeded: ({ elapsed, limit }) =>
    `表の処理が制限時間を超えました（${elapsed}ms > ${limit}ms）。範囲を小さくするか、カード表示にしてください。`,
  headersNotCheckable: () =>
    '`x-headers`は見出しの行と比べますが、この参照には見出しの行がありません。`header=first`（または行番号）を指定してください。',
  headersMismatch: ({ shown, more }) => {
    const items = shown.map(
      (item) => `${item.position}列目: 期待「${item.expected ?? '（なし）'}」→ 実際「${item.actual ?? '（なし）'}」`,
    );
    const rest = more > 0 ? ` ほか${more}列` : '';
    return `見出しが、参照を書いたときと違います（${items.join('、')}${rest}）。正本の列の挿入・削除・並べ替えで、参照が別の列を指している可能性があります。`;
  },
  unknownParam: ({ key, suggestion }) => `「${key}」は未知の指定のため無視されます。「${suggestion}」の誤りではありませんか？`,
  invalidParam: ({ key, value, allowed: values, suggestion }) =>
    `${key} の値「${value}」は使えません（${allowed(values)}）。この指定は無視されます。` +
    (suggestion !== undefined ? `「${suggestion}」の誤りではありませんか？` : ''),
  workbookEmpty: ({ file }) =>
    `${file} を読み込めません。ファイルが空です。保存や同期が終わってから、プレビューを再確認してください。`,
  workbookPasswordProtected: ({ file }) =>
    `${file} はパスワードで保護されている可能性があります。読み込めるのは保護されていない保存済みのブックです。パスワードを外すか、保護されていない複製を参照してください。`,
  workbookNotWorkbook: ({ file }) =>
    `${file} の内容はExcelブックではありません。Excelブック（.xlsx）として保存し直したか確認してください。`,
  workbookDamaged: ({ file, reason }) =>
    `${file} を読み込めません。ファイルが壊れているか、書き込み中の可能性があります（${reason}）。Excelでもう一度保存してから、プレビューを再確認してください。`,
  csvUtf16: () => 'CSVはUTF-8またはCP932で保存してください。UTF-16には対応していません。',
  csvInvalidUtf8: () => 'CSVのUTF-8データが不正です。',
  csvUnreadableEncoding: () => 'CSVをUTF-8またはCP932として読み込めません。文字コードを確認してください。',
  binding: ({ kind, declared, status, current, referenced }) => {
    const label = bindingLabel(kind, declared);
    switch (status) {
      case 'missing':
        return `${label}は、いま正本にありません（削除または改名された可能性があります）。参照の範囲は、これの定義から取った値のままです。`;
      case 'not-a-range':
        return `${label}は、範囲を指していないか、この参照の範囲と比べられません。`;
      case 'moved':
        return `${label}は、参照のシートとは別のシートへ移っています（現在 ${current}）。`;
      case 'changed':
        return `${label}の現在の範囲は ${current} で、参照の ${referenced} と合いません。行や列が増減した可能性があります。`;
      case 'narrower':
        return `${label}の現在の範囲は ${current} で、参照の ${referenced} はその一部です。意図した絞り込みでなければ、範囲を見直してください。`;
      default:
        return `${label}と一致しています。`;
    }
  },
  belowChanged: ({ expected, actual, grew }) =>
    grew
      ? `参照した範囲のすぐ下に、値のある行が${actual}行続いています（参照を書いたときは${expected}行）。` +
        '範囲の中に行が挿入され、表示されていた最後の行が、選んだときの行ではなくなった可能性があります。' +
        '範囲を確かめ、意図した変更ならx-belowを更新するか削除してください。'
      : `参照した範囲のすぐ下に、値のある行が${actual}行続いています（参照を書いたときは${expected}行）。` +
        '範囲の下の行が削除または移動した可能性があります。' +
        '範囲を確かめ、意図した変更ならx-belowを更新するか削除してください。',
};

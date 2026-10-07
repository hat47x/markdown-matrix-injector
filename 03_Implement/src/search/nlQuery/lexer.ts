/**
 * Lexer for the restricted Japanese request language of issue-0115
 * (input-assistance-cpu-search.md §3.1 / §3.4). Hand-written maximal munch:
 * at each position the longest keyword wins, otherwise characters accumulate
 * into a WORD (a name the resolver will try to match).
 *
 * Scanning runs over an NFKC-normalized copy, but every token keeps its span
 * in the *original* input so diagnostics can point at what the user typed.
 * No morphological analyser: keywords are a small closed list, and one-kana
 * particles only count after a non-hiragana character, so the と in 「まとめ」
 * stays part of the word while the と in 「IDと操作」 is a particle.
 */

export type UnsupportedKind = 'aggregation' | 'comparison' | 'negation' | 'sort' | 'exactMatch' | 'join';

export type TokenKind =
  | 'WORD'
  | 'QUOTED'
  | 'FILENAME'
  | 'RANGE'
  | 'PARTICLE'
  | 'SHEET'
  | 'TABLE'
  | 'BOOK'
  | 'COLUMN'
  | 'ROW'
  | 'VERB'
  | 'CONTAINS'
  | 'FILLER'
  | 'HONORIFIC'
  | 'PERIOD'
  | 'UNSUPPORTED';

export interface Span {
  /** Offset in the original input (UTF-16 units), inclusive. */
  start: number;
  /** Offset in the original input, exclusive. */
  end: number;
}

export interface Token {
  kind: TokenKind;
  /** Normalized (NFKC) text; for QUOTED the text between the quotes. */
  text: string;
  span: Span;
  /** Set for UNSUPPORTED. */
  unsupported?: UnsupportedKind;
}

interface Keyword {
  text: string;
  kind: TokenKind;
  unsupported?: UnsupportedKind;
  /** One-kana particles: only after a non-hiragana character. */
  afterNonHiragana?: boolean;
}

const KEYWORDS: Keyword[] = [
  // Compound particles first by length: 「からの」「での」 behave like の.
  ...['からの', 'での', 'への', 'との', 'から', 'の', 'を', 'で', 'と', 'や', 'が', 'に', 'へ', 'は'].map((text) => ({
    text,
    kind: 'PARTICLE' as const,
    afterNonHiragana: true,
  })),
  // Sentence ends: only the first sentence that names something is the request.
  ...['。', '！', '？', '!', '?'].map((text) => ({ text, kind: 'PERIOD' as const })),
  { text: '、', kind: 'PARTICLE' },
  { text: ',', kind: 'PARTICLE' },
  { text: 'および', kind: 'PARTICLE' },
  { text: 'シート', kind: 'SHEET' },
  { text: 'タブ', kind: 'SHEET' },
  ...['表', 'テーブル', '一覧', '一覧表', 'リスト', 'マトリクス表'].map((text) => ({ text, kind: 'TABLE' as const })),
  ...['ブック', 'ファイル', 'エクセル', 'excel'].map((text) => ({ text, kind: 'BOOK' as const })),
  ...['列', 'カラム', '項目', '欄'].map((text) => ({ text, kind: 'COLUMN' as const })),
  ...['行', 'レコード'].map((text) => ({ text, kind: 'ROW' as const })),
  ...[
    '見せて', '見せる', '見たい', '見る', '表示', '参照', '引用', '出して', '出す', '開いて', '抽出', '取り出して',
    '貼って', '貼りたい', '埋め込んで', '埋め込み', '挿入', 'ください', '下さい', 'して', 'したい', 'する',
    'お願い', 'ほしい', '欲しい', '探して', '検索', '抜き出して', '抜き出す', '抜き出したい', '載せて', '載せる',
    '載せたい', '知りたい', '教えて', '使いたい', '確認したい', '確認して', '出力して', 'まとめて',
    // Colloquial and polite forms of the same few verbs (貼る・載せる・出す・入れる・引用・参照).
    '貼っといて', '貼っておいて', '貼ってほしい', '載せといて', '載せておいて', '載せてほしい', '出しといて',
    '出しておいて', '出してほしい', '入れて', '入れたい', '入れといて', '入れておいて', '引用したい', '引用して',
    '参照したい', '参照して', '見せてほしい', '表示して', '表示したい', 'もらえますか', 'もらえる', 'いただけますか',
  ].map((text) => ({ text, kind: 'VERB' as const })),
  // Kana only: 様 / 氏 would split 仕様書 and 氏名.
  ...['さん', 'さま', 'くん'].map((text) => ({ text, kind: 'HONORIFIC' as const, afterNonHiragana: true })),
  // 「NGが出てる」「要確認が載っている」: the value appears somewhere -- a row-wide contains.
  ...['含む', '含まれる', '含まれてる', '含まれている', '含んだ', '含んでいる', '入っている', '入った', '入ってる', '書かれた', '書いてある', '出てる', '出ている', '載ってる', '載っている'].map(
    (text) => ({ text, kind: 'CONTAINS' as const }),
  ),
  ...['だけ', 'のみ', 'すべて', '全部', '全体', '範囲', 'もの', 'ところ', 'あたり', 'について', 'という', 'って'].map(
    (text) => ({ text, kind: 'FILLER' as const }),
  ),
  ...['集計', '合計', '平均', '件数', '個数', '最大', '最小', 'カウント', '数えて', '別に', 'ごとに', '毎に', 'グループ化'].map(
    (text) => ({ text, kind: 'UNSUPPORTED' as const, unsupported: 'aggregation' as const }),
  ),
  ...['以上', '以下', '未満', '超え', '超過', 'より大きい', 'より小さい', 'より多い', 'より少ない', 'より前', 'より後', '以前', '以降', '>', '<', '>=', '<=', '≧', '≦'].map(
    (text) => ({ text, kind: 'UNSUPPORTED' as const, unsupported: 'comparison' as const }),
  ),
  ...['以外', '除く', '除いて', '除外', '含まない', '含まれない', '含まず', 'ではない', 'じゃない', 'でない', 'ない', '無い', 'なし'].map(
    (text) => ({ text, kind: 'UNSUPPORTED' as const, unsupported: 'negation' as const }),
  ),
  ...['並べ替え', '並べ替えて', '並び替え', '並び替えて', '並べて', '並べる', 'ソート', '昇順', '降順', '順に', '順で', '順番', '順序', '最新', '最古', '上位', '下位', '新しい', '古い', '直近'].map(
    (text) => ({ text, kind: 'UNSUPPORTED' as const, unsupported: 'sort' as const }),
  ),
  ...['完全一致', '完全に一致', 'と一致', 'に一致', 'と等しい', 'に等しい', '等しい', 'と同じ', 'ぴったり', '='].map(
    (text) => ({ text, kind: 'UNSUPPORTED' as const, unsupported: 'exactMatch' as const }),
  ),
  // Putting two tables together. 「結合」 alone is not listed: it is part of names like 結合テスト.
  ...['つなげて', 'つなげる', 'つなげたい', 'つなぎ合わせ', '突き合わせ', '突合', '紐付け', '紐づけ', 'ひも付け', 'ジョイン', 'マージ', '結合して', '結合したい', 'くっつけ'].map(
    (text) => ({ text, kind: 'UNSUPPORTED' as const, unsupported: 'join' as const }),
  ),
];

// Longest first, so maximal munch is a first-match scan.
KEYWORDS.sort((a, b) => b.text.length - a.text.length);

const QUOTES: Record<string, string> = { '「': '」', '『': '』', '"': '"', '“': '”', "'": "'" };
const FILENAME = /^[^\s「」『』"'、,]+?\.(?:xlsx|xlsm|xls|csv|xml)(?![a-z0-9])/iu;
const RANGE = /^\$?[a-z]{1,3}\$?[1-9]\d{0,6}(?::\$?[a-z]{1,3}\$?[1-9]\d{0,6})?(?![a-z0-9])/iu;
const SPACE = /\s/u;

function isHiragana(ch: string | undefined): boolean {
  if (!ch) return false;
  const code = ch.codePointAt(0) ?? 0;
  return code >= 0x3041 && code <= 0x309f;
}

function isKanji(ch: string | undefined): boolean {
  if (!ch) return false;
  const code = ch.codePointAt(0) ?? 0;
  return (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf) || ch === '々';
}

/**
 * True when the hiragana just before `at` is okurigana (1-2 kana after a
 * kanji: 見積り, 取消し, 鈴木さん), so a particle may follow it. A longer or
 * kanji-less hiragana run (まとめ, ごと) is a word of its own.
 */
function afterOkurigana(text: string, at: number, wordStart: number): boolean {
  let start = at;
  while (start > 0 && isHiragana(text[start - 1])) start -= 1;
  // The kana must belong to the word being built, not be a particle just emitted.
  return wordStart >= 0 && wordStart < start && at - start <= 2 && isKanji(text[start - 1]);
}

/** A particle may follow a keyword that ends right here: 「鈴木さんを」「対応中のものを」. */
function afterKeyword(tokens: Token[], originalOffset: number): boolean {
  const last = tokens[tokens.length - 1];
  return last !== undefined && last.kind !== 'WORD' && last.kind !== 'PARTICLE' && last.span.end === originalOffset;
}

function isAsciiWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[a-z0-9_]/iu.test(ch);
}

/**
 * NFKC per code point with an origin map, so normalized offsets can be
 * mapped back. Per-code-point normalization loses cross-character
 * composition, which is irrelevant for this language.
 */
function normalizeWithOrigins(input: string): { text: string; origin: number[] } {
  let text = '';
  const origin: number[] = [];
  let offset = 0;
  for (const ch of input) {
    const normalized = ch.normalize('NFKC');
    for (let i = 0; i < normalized.length; i += 1) origin.push(offset);
    text += normalized;
    offset += ch.length;
  }
  origin.push(offset);
  return { text, origin };
}

export function tokenize(input: string): Token[] {
  const { text, origin } = normalizeWithOrigins(input);
  const lower = text.toLowerCase();
  const tokens: Token[] = [];
  let wordStart = -1;

  const span = (start: number, end: number): Span => ({ start: origin[start], end: origin[end] });
  const flushWord = (end: number): void => {
    if (wordStart < 0) return;
    const word = text.slice(wordStart, end).trim();
    if (word) tokens.push({ kind: 'WORD', text: word, span: span(wordStart, end) });
    wordStart = -1;
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (SPACE.test(ch)) {
      flushWord(i);
      i += 1;
      continue;
    }

    const close = QUOTES[ch];
    if (close) {
      const end = text.indexOf(close, i + 1);
      if (end > i) {
        flushWord(i);
        tokens.push({ kind: 'QUOTED', text: text.slice(i + 1, end), span: span(i, end + 1) });
        i = end + 1;
        continue;
      }
    }

    // FILENAME / RANGE only start at a word boundary; a file name swallows
    // the name characters accumulated so far (「設計書.xlsx」).
    const fileFrom = wordStart >= 0 ? wordStart : i;
    const file = FILENAME.exec(text.slice(fileFrom));
    if (file && (fileFrom === 0 || !isAsciiWordChar(text[fileFrom - 1]) || fileFrom === wordStart)) {
      wordStart = -1;
      tokens.push({ kind: 'FILENAME', text: file[0], span: span(fileFrom, fileFrom + file[0].length) });
      i = fileFrom + file[0].length;
      continue;
    }
    if (!isAsciiWordChar(text[i - 1])) {
      const range = RANGE.exec(text.slice(i));
      if (range && /\d/u.test(range[0])) {
        flushWord(i);
        tokens.push({ kind: 'RANGE', text: range[0].replace(/\$/gu, '').toUpperCase(), span: span(i, i + range[0].length) });
        i += range[0].length;
        continue;
      }
    }

    const keyword = KEYWORDS.find(
      (candidate) =>
        lower.startsWith(candidate.text, i) &&
        (!candidate.afterNonHiragana || !isHiragana(text[i - 1]) || i === 0 || afterOkurigana(text, i, wordStart) || afterKeyword(tokens, origin[i])) &&
        // An ASCII keyword ("excel") must not split an ASCII identifier.
        (!isAsciiWordChar(candidate.text[0]) ||
          (!isAsciiWordChar(text[i - 1]) && !isAsciiWordChar(text[i + candidate.text.length]))),
    );
    if (keyword) {
      flushWord(i);
      const end = i + keyword.text.length;
      tokens.push({ kind: keyword.kind, text: text.slice(i, end), span: span(i, end), unsupported: keyword.unsupported });
      i = end;
      continue;
    }

    if (wordStart < 0) wordStart = i;
    i += 1;
  }
  flushWord(text.length);
  return mergeCompounds(tokens);
}

/**
 * UNSUPPORTED is deliberately absent: a marker that makes a request
 * unsupported must never disappear into a merged word (「遅い順に並べて」 would
 * otherwise lose 順に). A column really named 「合計金額」 can be quoted.
 */
const MERGEABLE: ReadonlySet<TokenKind> = new Set(['SHEET', 'TABLE', 'BOOK', 'COLUMN', 'ROW', 'VERB']);

/**
 * A keyword glued to a following name is part of a compound, not a keyword:
 * 「代表者」 is not 代 + 表 + 者, 「表示名」 is a column. Merge prefix WORD +
 * keyword + WORD back into one WORD.
 */
function mergeCompounds(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const next = tokens[i + 1];
    if (MERGEABLE.has(token.kind) && next?.kind === 'WORD' && next.span.start === token.span.end) {
      const prev = out[out.length - 1];
      const glued = prev?.kind === 'WORD' && prev.span.end === token.span.start;
      const start = glued ? prev.span.start : token.span.start;
      const text = `${glued ? prev.text : ''}${token.text}${next.text}`;
      if (glued) out.pop();
      out.push({ kind: 'WORD', text, span: { start, end: next.span.end } });
      i += 1;
      continue;
    }
    // A verb followed by a case particle is a noun: 「参照を見せて」「表示と更新」.
    if (token.kind === 'VERB' && next?.kind === 'PARTICLE' && ['を', 'と', 'や', '、', ',', 'の', 'が'].includes(next.text)) {
      out.push({ kind: 'WORD', text: token.text, span: token.span });
      continue;
    }
    out.push(token);
  }
  return out;
}

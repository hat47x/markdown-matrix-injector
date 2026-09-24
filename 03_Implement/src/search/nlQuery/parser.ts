/**
 * Parser: tokens -> unresolved reference model (input-assistance-cpu-search.md
 * §3.1). The IR is internal; it is never written anywhere and is not a new
 * public notation. The only output of the pipeline is existing MMI notation.
 *
 * The grammar is deliberately small and phrase-based:
 *
 *   request  := phrase* verb?
 *   phrase   := FILENAME | RANGE | name SHEET | name TABLE | name BOOK
 *             | name COLUMN | name (を|が|の)? CONTAINS
 *             | name COLUMN (に|で) name (を|が)? CONTAINS     -- column-scoped
 *             | name が name ... ROW                           -- column condition
 *             | name particle? | UNSUPPORTED
 *   name     := WORD | QUOTED
 *
 * Nothing the parser cannot place is dropped silently: unsupported markers,
 * column-scoped conditions and filler words all end up in the IR with spans.
 */
import { tokenize, type Span, type Token, type UnsupportedKind } from './lexer.js';

export interface Hint {
  /** NFKC-normalized text used for matching. */
  text: string;
  /** Exactly what the user typed (quotes stripped) -- used for grep values. */
  raw: string;
  span: Span;
  quoted: boolean;
  /** Alternative reading, tried first by column resolution: 「確認項目」 for 確認 + 項目. */
  alt?: string;
}

export type UnsupportedConstruct = UnsupportedKind | 'columnCondition' | 'columnScopedContains';

export interface UnsupportedItem {
  kind: UnsupportedConstruct;
  text: string;
  span: Span;
  /**
   * For aggregation/sort words: the word as part of a possible name
   * (「平均」+「応答時間」, or 「件数」 alone). The compiler lifts the
   * unsupported marker only if this exact name exists in the index.
   */
  compound?: Hint;
}

export interface ContainsCondition {
  term: Hint;
  /** Set when the user limited the condition to one column. */
  column?: Hint;
  /** 「対応中のもの」: a value named without 含む; read as a row-wide partial match and said so. */
  implicit?: boolean;
}

export interface Diagnostic {
  code: 'ignored-word' | 'contains-without-term' | 'empty-request' | 'conflicting-hint';
  message: string;
  span: Span;
}

export interface QueryIR {
  input: string;
  source?: Hint;
  sheet?: Hint;
  table?: Hint;
  range?: Hint;
  /** Names that describe the target but carry no structural noun. */
  target: Hint[];
  columns: Hint[];
  contains: ContainsCondition[];
  unsupported: UnsupportedItem[];
  diagnostics: Diagnostic[];
}

const TARGET_PARTICLES = new Set(['の', 'からの', 'での', 'への', 'との', 'から', 'で', 'に', 'は', 'へ']);
const HIRAGANA_ONLY = /^[ぁ-ゟー]+$/u;
/** Inflected verb endings: 抜き出して, 貼りたい, 並べます. */
const VERB_ENDING = /[ぁ-ゟ](?:て|で|たい|たく|ます|ろ)$/u;
/** Light verbs after a verbal noun: 確認 + したい. */
const LIGHT_VERBS = new Set(['して', 'したい', 'する', 'します']);
/** 「対応中の{もの|やつ|行}」 */
const VALUE_HEADS = new Set(['もの', 'やつ', 'ヤツ', 'の']);

/**
 * After 「Xが」: does the clause go on to name a table (「APIが返すエラーの一覧」)?
 * Then it describes that table; otherwise it is a condition on column X.
 * Stops at the first verb, row noun or unsupported marker, like the
 * condition scan does.
 */
function describesTable(tokens: Token[], from: number): boolean {
  // A relative clause needs a verb (返す, 使えるか). Without one, 「判定がNGの表」
  // is still a column condition and must be rejected, not silently dropped.
  let verb = false;
  for (let i = from; i < tokens.length; i += 1) {
    const kind = tokens[i].kind;
    if (kind === 'WORD' && /[うくすつぬむるぐぶ]か?(?![ぁ-ゟ])/u.test(tokens[i].text)) verb = true;
    if (kind === 'TABLE' || kind === 'SHEET' || kind === 'BOOK') return verb;
    if (kind === 'VERB' || kind === 'ROW' || kind === 'UNSUPPORTED' || kind === 'CONTAINS') return false;
    if (kind === 'FILLER' && ['もの', 'だけ', 'のみ'].includes(tokens[i].text)) return false;
  }
  return false;
}

export function parseQuery(input: string): QueryIR {
  // Honorifics carry no meaning for lookup: 「鈴木さんを含む」 greps 鈴木.
  const all = tokenize(input).filter((token) => token.kind !== 'HONORIFIC');
  const ir: QueryIR = { input, target: [], columns: [], contains: [], unsupported: [], diagnostics: [] };
  // Only the first sentence that names something is the request; the rest is
  // context (「…を載せたい。運用手順書から参照したいので」). Unsupported markers
  // are still collected from every sentence, so none can hide after a 。.
  const sentences: Token[][] = [[]];
  for (const token of all) {
    if (token.kind === 'PERIOD') sentences.push([]);
    else sentences[sentences.length - 1].push(token);
  }
  const naming = (sentence: Token[]) => sentence.some((t) => t.kind === 'WORD' || t.kind === 'QUOTED' || t.kind === 'FILENAME');
  const chosen = sentences.find(naming) ?? sentences[0];
  const tokens = chosen;
  for (const sentence of sentences) {
    if (sentence === chosen || sentence.length === 0) continue;
    for (const token of sentence) {
      if (token.kind === 'UNSUPPORTED') ir.unsupported.push({ kind: token.unsupported ?? 'negation', text: token.text, span: token.span });
    }
    ir.diagnostics.push({
      code: 'ignored-word',
      message: `「${input.slice(sentence[0].span.start, sentence[sentence.length - 1].span.end)}」は依頼の補足として扱いました。`,
      span: { start: sentence[0].span.start, end: sentence[sentence.length - 1].span.end },
    });
  }
  const loose: { hint: Hint; particle?: string }[] = [];

  const hintOf = (token: Token, suffix?: Token): Hint => {
    const end = suffix ? suffix.span.end : token.span.end;
    const raw =
      token.kind === 'QUOTED' ? input.slice(token.span.start + 1, token.span.end - 1) : input.slice(token.span.start, end);
    return {
      text: suffix && token.kind !== 'QUOTED' ? `${token.text}${suffix.text}` : token.text,
      raw,
      span: { start: token.span.start, end },
      quoted: token.kind === 'QUOTED',
    };
  };
  const setOnce = (key: 'source' | 'sheet' | 'table' | 'range', hint: Hint): void => {
    const existing = ir[key];
    if (existing && existing.text !== hint.text) {
      ir.diagnostics.push({
        code: 'conflicting-hint',
        message: `「${existing.raw}」と「${hint.raw}」の両方が指定されています。先の指定を使います。`,
        span: hint.span,
      });
      return;
    }
    ir[key] = hint;
  };
  const isName = (token: Token | undefined): token is Token => token?.kind === 'WORD' || token?.kind === 'QUOTED';
  const isParticle = (token: Token | undefined, ...texts: string[]): boolean =>
    token?.kind === 'PARTICLE' && (texts.length === 0 || texts.includes(token.text));

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    switch (token.kind) {
      case 'FILENAME':
        setOnce('source', hintOf(token));
        continue;
      case 'RANGE':
        setOnce('range', hintOf(token));
        continue;
      case 'UNSUPPORTED': {
        const glued = tokens[i + 1]?.kind === 'WORD' && tokens[i + 1].span.start === token.span.end ? tokens[i + 1] : undefined;
        const nameLike = (token.unsupported === 'aggregation' || token.unsupported === 'sort') && token.text.length >= 2;
        ir.unsupported.push({
          kind: token.unsupported ?? 'negation',
          text: token.text,
          span: token.span,
          ...(nameLike ? { compound: hintOf(token, glued) } : {}),
        });
        continue;
      }
      case 'CONTAINS':
        ir.diagnostics.push({ code: 'contains-without-term', message: '何を含む行かが指定されていません。', span: token.span });
        continue;
      case 'TABLE':
      case 'SHEET':
      case 'BOOK': {
        // A bare noun after 「Xの」 retypes X: 「リリース判定の表」.
        const last = loose[loose.length - 1];
        const key = token.kind === 'TABLE' ? 'table' : token.kind === 'SHEET' ? 'sheet' : 'source';
        if (last && last.particle?.endsWith('の') && ir.target.length === 0) {
          loose.pop();
          setOnce(key, last.hint);
          continue;
        }
        // Nouns alone can be the name: 「テーブル一覧」 = テーブル + 一覧.
        let end = i;
        while (tokens[end + 1]?.kind === token.kind && tokens[end + 1].span.start === tokens[end].span.end) end += 1;
        if (end > i) {
          const text = tokens.slice(i, end + 1).map((t) => t.text).join('');
          const span = { start: token.span.start, end: tokens[end].span.end };
          setOnce(key, { text, raw: input.slice(span.start, span.end), span, quoted: false });
          i = end;
        }
        continue;
      }
      case 'WORD':
      case 'QUOTED':
        break;
      default:
        continue; // particles, verbs, fillers, bare COLUMN / ROW
    }

    if (token.kind === 'WORD' && HIRAGANA_ONLY.test(token.text)) {
      ir.diagnostics.push({
        code: 'ignored-word',
        message: `「${input.slice(token.span.start, token.span.end)}」は名前として扱いません。`,
        span: token.span,
      });
      continue;
    }

    const next = tokens[i + 1];
    const after = tokens[i + 2];
    const onlyVerbsFollow = tokens.slice(i + 1).every((t) => t.kind === 'VERB' || t.kind === 'FILLER');
    if (
      token.kind === 'WORD' &&
      ((next?.kind === 'VERB' && next.span.start === token.span.end && LIGHT_VERBS.has(next.text)) ||
        (onlyVerbsFollow && VERB_ENDING.test(token.text)))
    ) {
      continue; // a verb, not a name: 「確認したい」「抜き出して」
    }
    const valueHead = tokens[i + 2];
    const hasTargetSoFar = Boolean(ir.source || ir.sheet || ir.table || loose.length > 0);
    // Never after 「…が」「…は」: 「判定列がOKの行」 ties the value to a column.
    const tiedToSubject = isParticle(tokens[i - 1], 'が', 'は');
    if (
      hasTargetSoFar &&
      !tiedToSubject &&
      isParticle(next, 'の') &&
      (valueHead?.kind === 'ROW' || ((valueHead?.kind === 'FILLER' || valueHead?.kind === 'WORD') && VALUE_HEADS.has(valueHead.text)))
    ) {
      ir.contains.push({ term: hintOf(token), implicit: true });
      i += 2;
      continue;
    }
    if (next?.kind === 'SHEET') {
      setOnce('sheet', hintOf(token));
      i += 1;
    } else if (next?.kind === 'TABLE') {
      setOnce('table', hintOf(token, next));
      i += 1;
    } else if (next?.kind === 'BOOK') {
      setOnce('source', hintOf(token));
      i += 1;
    } else if (next?.kind === 'COLUMN') {
      // 「判定列に要確認を含む」: a condition limited to one column.
      const term = tokens[i + 3];
      const scoped =
        isParticle(after, 'に', 'で', 'が') &&
        isName(term) &&
        (tokens[i + 4]?.kind === 'CONTAINS' || (isParticle(tokens[i + 4], 'を', 'が') && tokens[i + 5]?.kind === 'CONTAINS'));
      if (scoped) {
        const end = tokens[i + 4].kind === 'CONTAINS' ? i + 4 : i + 5;
        ir.contains.push({ term: hintOf(term), column: hintOf(token) });
        ir.unsupported.push({
          kind: 'columnScopedContains',
          text: input.slice(token.span.start, tokens[end].span.end),
          span: { start: token.span.start, end: tokens[end].span.end },
        });
        i = end;
      } else if (isParticle(after, 'が', 'は')) {
        // 「判定列がOKの行」: a condition on one column. grep cannot say this.
        let end = i + 2;
        while (end + 1 < tokens.length && !['VERB', 'ROW', 'UNSUPPORTED'].includes(tokens[end + 1].kind)) end += 1;
        if (tokens[end + 1]?.kind === 'ROW') end += 1;
        ir.unsupported.push({
          kind: 'columnCondition',
          text: input.slice(token.span.start, tokens[end].span.end),
          span: { start: token.span.start, end: tokens[end].span.end },
        });
        i = end;
      } else {
        ir.columns.push({ ...hintOf(token), alt: token.kind === 'QUOTED' ? undefined : `${token.text}${next.text}` });
        i += 1;
      }
    } else if (next?.kind === 'CONTAINS') {
      ir.contains.push({ term: hintOf(token) });
      i += 1;
    } else if (isParticle(next, 'を', 'が', 'の') && after?.kind === 'CONTAINS') {
      ir.contains.push({ term: hintOf(token) });
      i += 2;
    } else if (isParticle(next, 'が') && !describesTable(tokens, i + 2)) {
      // 「判定が要確認の行」: a per-column equality/condition. grep cannot say this.
      let end = i + 1;
      while (end + 1 < tokens.length && !['VERB', 'ROW', 'UNSUPPORTED'].includes(tokens[end + 1].kind)) end += 1;
      if (tokens[end + 1]?.kind === 'ROW') end += 1;
      ir.unsupported.push({
        kind: 'columnCondition',
        text: input.slice(token.span.start, tokens[end].span.end),
        span: { start: token.span.start, end: tokens[end].span.end },
      });
      i = end;
    } else if (isParticle(next, 'に', 'へ') && tokens[i + 2]?.kind === 'VERB') {
      // 「レビュー資料に引用したい」: where the reference goes, not what it points at.
      ir.diagnostics.push({
        code: 'ignored-word',
        message: `「${input.slice(token.span.start, token.span.end)}」は貼り付け先として扱いました。`,
        span: token.span,
      });
      i += 1;
    } else if (isParticle(next, 'が')) {
      // 「APIが返すエラーの一覧」: a clause describing the table, not a condition.
      loose.push({ hint: hintOf(token) });
      i += 1;
    } else {
      loose.push({ hint: hintOf(token), particle: next?.kind === 'PARTICLE' ? next.text : undefined });
      if (next?.kind === 'PARTICLE') i += 1;
    }
  }

  // Loose names: 「Xの」「Xから」 describe the target; the rest are columns
  // once some target is known, otherwise they describe the target too.
  for (const entry of loose) {
    if (entry.particle && TARGET_PARTICLES.has(entry.particle)) ir.target.push(entry.hint);
  }
  const hasTarget = Boolean(ir.source || ir.sheet || ir.table || ir.target.length > 0);
  for (const entry of loose) {
    if (entry.particle && TARGET_PARTICLES.has(entry.particle)) continue;
    (hasTarget ? ir.columns : ir.target).push(entry.hint);
  }
  ir.columns.sort((a, b) => a.span.start - b.span.start);

  if (!ir.source && !ir.sheet && !ir.table && !ir.range && ir.target.length === 0 && ir.contains.length === 0) {
    ir.diagnostics.push({ code: 'empty-request', message: '参照先の名前が見つかりません。', span: { start: 0, end: input.length } });
  }
  return ir;
}

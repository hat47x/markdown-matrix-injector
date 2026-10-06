/**
 * Paraphrase lane (issue-0115): a request that describes a table by what it
 * is for ("誰が教えるか", "どれくらいの頻度で") shares no word with the table's
 * name, so name coverage rejects it. This lane judges the *structure* instead:
 *
 *   topic    -- a rare content word of the request occurs in the table's book /
 *               sheet / title (what the table is about);
 *   slots    -- the interrogatives of the request ask for header concepts
 *               (誰→担当・講師, いつ→日程・時期 ...) that the table's headers have;
 *   headers  -- or the request names a header word directly.
 *
 * A table is offered only when it has a topic AND at least one structural
 * match. The lane is method class M1 (deterministic, no learned model); its
 * candidates are `inferred`, never confirmed, and the person must choose.
 * It never runs for a request with a quoted name, a file/sheet/range, or an
 * unsupported imperative, so it cannot turn "合計を出して" into a table.
 *
 * The slot lexicon is generic Japanese interrogative -> header-concept
 * knowledge. It is not derived from any evaluation set.
 */
import type { RegionRecord } from '../regionCatalog.js';
import { normalizeText } from '../textFeatures.js';

export interface ConceptSlot {
  id: string;
  /** Any of these in the request (NFKC, case-folded) triggers the slot. */
  cues: readonly string[];
  /** A header containing any of these satisfies the slot. */
  headerTerms: readonly string[];
}

export const CONCEPT_SLOTS: readonly ConceptSlot[] = [
  { id: 'who', cues: ['誰', 'だれ', '担当者', '責任者'], headerTerms: ['担当', '責任', '対象者', '講師', '通知先', '承認', '申請者', '宛先', '役割', '窓口', '作成者', '実施者', '参加者', '出席者', '対象', 'オーナー', '所有'] },
  { id: 'when', cues: ['いつ', '時期', '日程', '期間', 'いつまで', '何日'], headerTerms: ['日', '時期', '期限', '日程', '時刻', '開始', '終了', '予定', '期間', '実施', '開催', '納期', '期日', 'スケジュール'] },
  { id: 'frequency', cues: ['頻度', '何回', '間隔', 'どのくらいの周期'], headerTerms: ['頻度', '周期', '間隔', '回数'] },
  { id: 'quantity', cues: ['どれくらい', 'どのくらい', 'いくら', '何件', '何個', '何人', '規模', '件数', '何世代', 'どれだけ'], headerTerms: ['件数', '数', '量', '工数', '金額', '人数', 'サイズ', '規模', '世代', '容量', '見積', '費用', '単価', '影響', 'レベル', '程度'] },
  { id: 'purpose', cues: ['何のため', '目的', 'なぜ', '理由', 'ため'], headerTerms: ['目的', '用途', '理由', '概要', '背景', 'ねらい', '狙い', '趣旨'] },
  { id: 'where', cues: ['どこ', '場所', '置く', '保管', '保存'], headerTerms: ['場所', '保管', '保存', '宛先', '送信', '媒体', '拠点', '格納', '配置', '経路', 'パス', '置き場', '先', '元'] },
  { id: 'method', cues: ['どうやって', 'やり方', '方法', 'どのよう', '手順', 'どう'], headerTerms: ['方法', '手順', '方式', 'やり方', '手段', '対応', '方針', '手法'] },
  { id: 'what', cues: ['何を', 'どんな', 'どの値', '何が', '内容'], headerTerms: ['内容', '項目', '対象', '種別', '名称', '種類', '区分', '名'] },
  { id: 'threshold', cues: ['超えたら', '超える', '越えたら', 'しきい', '閾値', '基準', '上限', '下限'], headerTerms: ['閾値', 'しきい', '基準', '条件', '上限', '下限', '警告', '許容'] },
  { id: 'rule', cues: ['ルール', '規則', '決まり', 'ポリシー', '方針'], headerTerms: ['ルール', '規則', '条件', '基準', '方針', 'ポリシー', '規約'] },
  { id: 'status', cues: ['状況', '状態', '進捗', 'どこまで進'], headerTerms: ['状態', '状況', 'ステータス', '進捗', '結果'] },
  { id: 'priority', cues: ['優先', '重要', '緊急'], headerTerms: ['優先', '重要', '緊急', 'レベル', 'ランク'] },
  { id: 'source', cues: ['どこから', 'どこの', '元', '出どころ'], headerTerms: ['送信元', '起点', '元', '入力', '連携元', '依頼元', '発生源', '出典'] },
  { id: 'destination', cues: ['どこへ', '行き先', '送り先', '宛先'], headerTerms: ['宛先', '連携先', '送信先', '出力', '送り先', '先'] },
  { id: 'result', cues: ['どうなる', '結果', '期待'], headerTerms: ['結果', '期待', '判定', '合否', '成否'] },
  { id: 'contact', cues: ['連絡', '問い合わせ先'], headerTerms: ['連絡', '窓口', '電話', 'メール', '問い合わせ'] },
  { id: 'kind', cues: ['種類', 'タイプ', '分類', '区別'], headerTerms: ['種別', '種類', '分類', '区分', 'タイプ'] },
];

/** The request is a question that describes a table (not an imperative task). */
export function isDescriptionQuestion(input: string): boolean {
  const text = input.normalize('NFKC').trim();
  if (!/[?？]$|か$|か。$/u.test(text)) return false;
  return /誰|だれ|いつ|どれ|どの|どこ|何|どう|どんな|いくら|なぜ/u.test(text);
}

const CONTENT_RUN = /[\p{Script=Han}゠-ヿｦ-ﾟa-z0-9]{2,}/gu;

const HAN = /\p{Script=Han}/u;

/**
 * Evidence units of a text: bigrams that contain a kanji (a kanji pair is
 * nearly always a word) and, for runs of katakana / Latin, trigrams -- two
 * katakana letters (`ケー` in アンケート and テストケース) match by accident.
 */
function contentBigrams(text: string): string[] {
  const grams = new Set<string>();
  for (const [run] of text.normalize('NFKC').toLowerCase().matchAll(CONTENT_RUN)) {
    const chars = [...run];
    for (let i = 0; i + 1 < chars.length; i += 1) {
      if (HAN.test(chars[i]) || HAN.test(chars[i + 1])) grams.add(chars[i] + chars[i + 1]);
    }
    for (let i = 0; i + 2 < chars.length; i += 1) {
      const gram = chars[i] + chars[i + 1] + chars[i + 2];
      if (!HAN.test(gram)) grams.add(gram);
    }
  }
  return [...grams];
}

/** Bigrams that carry no topic by themselves (frames of the question, generic table nouns). */
const STOP_BIGRAMS = new Set(['一覧', '表', '管理', '情報', 'デー', 'ータ', '設計', '定義', '項目', '内容', '一覧表', '資料', '書', '台帳']);

export interface ParaphraseMatch {
  region: RegionRecord;
  score: number;
  topic: string[];
  slots: string[];
  headers: string[];
}

export interface ParaphraseOptions {
  /** A topic bigram must occur in at most this many regions' topic text. */
  maxTopicDocumentFrequency?: number;
  /**
   * Structural matches (slots + named headers) a table needs. 1 for a question,
   * which states what is asked; 2 for a bare noun phrase, which states less.
   */
  minStructural?: number;
}

export function paraphraseMatches(
  input: string,
  regions: readonly RegionRecord[],
  options: ParaphraseOptions = {},
): ParaphraseMatch[] {
  const maxDf = options.maxTopicDocumentFrequency ?? 4;
  const text = input.normalize('NFKC').toLowerCase();
  const queryGrams = contentBigrams(input).filter((gram) => !STOP_BIGRAMS.has(gram));
  const triggered = CONCEPT_SLOTS.filter((slot) => slot.cues.some((cue) => text.includes(cue.normalize('NFKC').toLowerCase())));

  const topicGrams = regions.map((region) =>
    new Set(contentBigrams([region.bookStem, region.sheet, region.title ?? ''].join(' '))));
  const df = new Map<string, number>();
  for (const grams of topicGrams) for (const gram of grams) df.set(gram, (df.get(gram) ?? 0) + 1);

  const matches: ParaphraseMatch[] = [];
  regions.forEach((region, index) => {
    const topic = queryGrams.filter((gram) => topicGrams[index].has(gram) && (df.get(gram) ?? 0) <= maxDf);
    if (topic.length === 0) return;
    const headers = (region.headers ?? []).map((header) => normalizeText(header));
    const slots = triggered
      .filter((slot) => headers.some((header) => slot.headerTerms.some((term) => header.includes(normalizeText(term)))))
      .map((slot) => slot.id);
    // A header word named outright by the request (not a slot cue's own word).
    const direct = (region.headers ?? []).filter((header) => {
      const grams = contentBigrams(header);
      return grams.length > 0 && grams.some((gram) => queryGrams.includes(gram) && !topic.includes(gram));
    });
    const structural = slots.length + direct.length;
    if (structural < (options.minStructural ?? 1)) return;
    // Half of the asked-for concepts must be present, so a table that has one
    // of five asked slots is not offered on a shared topic word alone.
    if (triggered.length >= 2 && slots.length + direct.length < Math.ceil(triggered.length / 2)) return;
    matches.push({ region, score: 2 * topic.length + structural, topic, slots, headers: direct });
  });
  return matches.sort((a, b) => b.score - a.score || a.region.id.localeCompare(b.region.id));
}

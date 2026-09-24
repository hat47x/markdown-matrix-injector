/**
 * Candidate retrieval methods compared in issue-0115 (input-assistance-cpu-
 * search.md §4). All four read the same `EncodedCorpus` -- one vocabulary,
 * one weighted feature vector per region -- so a comparison varies only the
 * method, never the features, data, or candidate count.
 *
 * Retrieval narrows candidates; it never decides a range. Every caller must
 * still resolve names and exactly re-verify against the source (design §1).
 */
import type { FeatureBag } from './textFeatures.js';

export interface EncodedVector {
  /** Feature ids, ascending. */
  ids: Int32Array;
  /** Weights aligned with `ids` (role-weighted term frequency for documents). */
  weights: Float32Array;
}

export interface ScoredDoc {
  doc: number;
  score: number;
}

/**
 * Shared vocabulary + document store with incremental add/remove.
 * Document frequency is maintained incrementally, so IDF is always current.
 */
export class EncodedCorpus {
  private readonly vocab = new Map<string, number>();
  private readonly features: string[] = [];
  private readonly df: number[] = [];
  private readonly docs: (EncodedVector | undefined)[] = [];
  private readonly docLength: number[] = [];
  private live = 0;
  private totalLength = 0;
  private revision = 0;

  add(bag: FeatureBag): number {
    const pairs: [number, number][] = [];
    for (const [feature, weight] of bag) {
      if (weight <= 0) continue;
      let id = this.vocab.get(feature);
      if (id === undefined) {
        id = this.features.length;
        this.vocab.set(feature, id);
        this.features.push(feature);
        this.df.push(0);
      }
      pairs.push([id, weight]);
    }
    pairs.sort((a, b) => a[0] - b[0]);
    const vector: EncodedVector = {
      ids: Int32Array.from(pairs, (pair) => pair[0]),
      weights: Float32Array.from(pairs, (pair) => pair[1]),
    };
    let length = 0;
    for (const [id, weight] of pairs) {
      this.df[id] += 1;
      length += weight;
    }
    const doc = this.docs.length;
    this.docs.push(vector);
    this.docLength.push(length);
    this.live += 1;
    this.totalLength += length;
    this.revision += 1;
    return doc;
  }

  remove(doc: number): void {
    const vector = this.docs[doc];
    if (!vector) return;
    for (const id of vector.ids) this.df[id] -= 1;
    this.docs[doc] = undefined;
    this.live -= 1;
    this.totalLength -= this.docLength[doc];
    this.revision += 1;
  }

  /** Query features not in the vocabulary cannot match any document and are dropped. */
  encodeQuery(bag: FeatureBag): EncodedVector {
    const pairs: [number, number][] = [];
    for (const [feature, weight] of bag) {
      const id = this.vocab.get(feature);
      if (id !== undefined && weight > 0 && this.df[id] > 0) pairs.push([id, weight]);
    }
    pairs.sort((a, b) => a[0] - b[0]);
    return {
      ids: Int32Array.from(pairs, (pair) => pair[0]),
      weights: Float32Array.from(pairs, (pair) => pair[1]),
    };
  }

  doc(doc: number): EncodedVector | undefined {
    return this.docs[doc];
  }

  featureOf(id: number): string {
    return this.features[id];
  }

  lengthOf(doc: number): number {
    return this.docLength[doc] ?? 0;
  }

  get documentSlots(): number {
    return this.docs.length;
  }

  get liveDocuments(): number {
    return this.live;
  }

  get averageLength(): number {
    return this.live === 0 ? 0 : this.totalLength / this.live;
  }

  get vocabularySize(): number {
    return this.features.length;
  }

  get changeRevision(): number {
    return this.revision;
  }

  documentFrequency(id: number): number {
    return this.df[id] ?? 0;
  }

  /** BM25-style IDF, always >= 0. */
  idf(id: number): number {
    const n = this.live;
    const df = this.df[id] ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  /** Rough structural size of the store (vectors + vocabulary), in bytes. */
  memoryEstimate(): number {
    let bytes = 0;
    for (const vector of this.docs) if (vector) bytes += vector.ids.byteLength + vector.weights.byteLength + 64;
    for (const feature of this.features) bytes += feature.length * 2 + 48;
    return bytes;
  }
}

export interface Retriever {
  readonly name: string;
  /** Indexes every live document of the corpus (full build). */
  build(): void;
  /** Incrementally indexes one document already added to the corpus. */
  add(doc: number): void;
  /** Removes a document; call before `corpus.remove(doc)`. */
  remove(doc: number): void;
  search(query: EncodedVector, k: number): ScoredDoc[];
  /** Rough structural index size in bytes (excluding the shared corpus). */
  memoryEstimate(): number;
}

// ---------------------------------------------------------------------------

/**
 * Posting lists keyed by feature id, stored as parallel number arrays
 * (doc ids, weights): ~16 bytes per posting instead of a Map entry each.
 * Removal is a tombstone; lists are compacted once tombstoned postings
 * outnumber live ones. Document ids are never reused by `EncodedCorpus`, so a
 * tombstoned id cannot come back to life.
 */
class Postings {
  private readonly docs = new Map<number, number[]>();
  private readonly weights = new Map<number, number[]>();
  private readonly removed = new Set<number>();
  private livePostings = 0;
  private deadPostings = 0;

  clear(): void {
    this.docs.clear();
    this.weights.clear();
    this.removed.clear();
    this.livePostings = 0;
    this.deadPostings = 0;
  }

  add(doc: number, vector: EncodedVector): void {
    for (let i = 0; i < vector.ids.length; i += 1) {
      const id = vector.ids[i];
      let docs = this.docs.get(id);
      if (!docs) {
        docs = [];
        this.docs.set(id, docs);
        this.weights.set(id, []);
      }
      docs.push(doc);
      this.weights.get(id)!.push(vector.weights[i]);
    }
    this.livePostings += vector.ids.length;
  }

  remove(doc: number, vector: EncodedVector): void {
    this.removed.add(doc);
    this.livePostings -= vector.ids.length;
    this.deadPostings += vector.ids.length;
    if (this.deadPostings > this.livePostings && this.deadPostings > 4096) this.compact();
  }

  forEach(id: number, visit: (doc: number, weight: number) => void): void {
    const docs = this.docs.get(id);
    if (!docs) return;
    const weights = this.weights.get(id)!;
    const removed = this.removed;
    for (let i = 0; i < docs.length; i += 1) if (!removed.has(docs[i])) visit(docs[i], weights[i]);
  }

  memoryEstimate(): number {
    let bytes = 0;
    for (const docs of this.docs.values()) bytes += 2 * (48 + docs.length * 8);
    return bytes + this.removed.size * 16;
  }

  private compact(): void {
    for (const [id, docs] of this.docs) {
      const weights = this.weights.get(id)!;
      let write = 0;
      for (let read = 0; read < docs.length; read += 1) {
        if (this.removed.has(docs[read])) continue;
        docs[write] = docs[read];
        weights[write] = weights[read];
        write += 1;
      }
      if (write === 0) {
        this.docs.delete(id);
        this.weights.delete(id);
      } else {
        docs.length = write;
        weights.length = write;
      }
    }
    this.removed.clear();
    this.deadPostings = 0;
  }
}

function topK(scores: Map<number, number>, k: number): ScoredDoc[] {
  return [...scores.entries()]
    .map(([doc, score]) => ({ doc, score }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.doc - b.doc)
    .slice(0, k);
}

/**
 * Baseline 1: exact whole-token index. Only `w:` features (whole normalized
 * words / segments) participate -- no n-grams, no IDF. A document scores the
 * sum of its role weights for every query word it contains exactly.
 */
export class ExactTokenRetriever implements Retriever {
  readonly name = 'exact';
  private readonly postings = new Postings();

  constructor(private readonly corpus: EncodedCorpus) {}

  build(): void {
    this.postings.clear();
    for (let doc = 0; doc < this.corpus.documentSlots; doc += 1) this.add(doc);
  }

  add(doc: number): void {
    const vector = this.corpus.doc(doc);
    if (vector) this.postings.add(doc, this.wordsOnly(vector));
  }

  remove(doc: number): void {
    const vector = this.corpus.doc(doc);
    if (vector) this.postings.remove(doc, this.wordsOnly(vector));
  }

  search(query: EncodedVector, k: number): ScoredDoc[] {
    const scores = new Map<number, number>();
    for (const id of query.ids) {
      if (!this.corpus.featureOf(id).startsWith('w:')) continue;
      this.postings.forEach(id, (doc, weight) => scores.set(doc, (scores.get(doc) ?? 0) + weight));
    }
    return topK(scores, k);
  }

  memoryEstimate(): number {
    return this.postings.memoryEstimate();
  }

  private wordsOnly(vector: EncodedVector): EncodedVector {
    const ids: number[] = [];
    const weights: number[] = [];
    for (let i = 0; i < vector.ids.length; i += 1) {
      if (this.corpus.featureOf(vector.ids[i]).startsWith('w:')) {
        ids.push(vector.ids[i]);
        weights.push(vector.weights[i]);
      }
    }
    return { ids: Int32Array.from(ids), weights: Float32Array.from(weights) };
  }
}

/** Baseline 2: BM25 over the role-weighted n-gram features (BM25F-lite). */
export class Bm25Retriever implements Retriever {
  readonly name = 'bm25';
  private readonly postings = new Postings();

  constructor(
    private readonly corpus: EncodedCorpus,
    private readonly k1 = 1.2,
    private readonly b = 0.75,
  ) {}

  build(): void {
    this.postings.clear();
    for (let doc = 0; doc < this.corpus.documentSlots; doc += 1) this.add(doc);
  }

  add(doc: number): void {
    const vector = this.corpus.doc(doc);
    if (vector) this.postings.add(doc, vector);
  }

  remove(doc: number): void {
    const vector = this.corpus.doc(doc);
    if (vector) this.postings.remove(doc, vector);
  }

  search(query: EncodedVector, k: number): ScoredDoc[] {
    const scores = new Map<number, number>();
    const avg = this.corpus.averageLength || 1;
    for (let i = 0; i < query.ids.length; i += 1) {
      const id = query.ids[i];
      const idf = this.corpus.idf(id);
      const qw = query.weights[i];
      this.postings.forEach(id, (doc, tf) => {
        const norm = tf + this.k1 * (1 - this.b + (this.b * this.corpus.lengthOf(doc)) / avg);
        scores.set(doc, (scores.get(doc) ?? 0) + idf * ((tf * (this.k1 + 1)) / norm) * qw);
      });
    }
    return topK(scores, k);
  }

  memoryEstimate(): number {
    return this.postings.memoryEstimate();
  }
}

/**
 * Baseline 3: TF-IDF cosine (sublinear tf). Document norms depend on the
 * current IDF, so they are recomputed lazily after any corpus change.
 */
export class CosineRetriever implements Retriever {
  readonly name = 'cosine';
  private readonly postings = new Postings();
  private norms = new Map<number, number>();
  private normsRevision = -1;

  constructor(private readonly corpus: EncodedCorpus) {}

  build(): void {
    this.postings.clear();
    for (let doc = 0; doc < this.corpus.documentSlots; doc += 1) this.add(doc);
  }

  add(doc: number): void {
    const vector = this.corpus.doc(doc);
    if (vector) this.postings.add(doc, vector);
  }

  remove(doc: number): void {
    const vector = this.corpus.doc(doc);
    if (vector) this.postings.remove(doc, vector);
  }

  search(query: EncodedVector, k: number): ScoredDoc[] {
    this.refreshNorms();
    const scores = new Map<number, number>();
    let queryNorm = 0;
    for (let i = 0; i < query.ids.length; i += 1) {
      const id = query.ids[i];
      const idf = this.corpus.idf(id);
      const qw = Math.log1p(query.weights[i]) * idf;
      queryNorm += qw * qw;
      this.postings.forEach(id, (doc, tf) => scores.set(doc, (scores.get(doc) ?? 0) + qw * Math.log1p(tf) * idf));
    }
    const qn = Math.sqrt(queryNorm) || 1;
    for (const [doc, dot] of scores) scores.set(doc, dot / (qn * (this.norms.get(doc) || 1)));
    return topK(scores, k);
  }

  /** Exact cosine of one document against a query; used for FlyHash reranking. */
  cosine(query: EncodedVector, doc: number): number {
    this.refreshNorms();
    const vector = this.corpus.doc(doc);
    if (!vector) return 0;
    let dot = 0;
    let queryNorm = 0;
    let i = 0;
    let j = 0;
    for (let q = 0; q < query.ids.length; q += 1) {
      const w = Math.log1p(query.weights[q]) * this.corpus.idf(query.ids[q]);
      queryNorm += w * w;
    }
    while (i < query.ids.length && j < vector.ids.length) {
      if (query.ids[i] === vector.ids[j]) {
        const idf = this.corpus.idf(query.ids[i]);
        dot += Math.log1p(query.weights[i]) * idf * Math.log1p(vector.weights[j]) * idf;
        i += 1;
        j += 1;
      } else if (query.ids[i] < vector.ids[j]) i += 1;
      else j += 1;
    }
    return dot / ((Math.sqrt(queryNorm) || 1) * (this.norms.get(doc) || 1));
  }

  memoryEstimate(): number {
    return this.postings.memoryEstimate() + this.norms.size * 24;
  }

  private refreshNorms(): void {
    if (this.normsRevision === this.corpus.changeRevision) return;
    this.norms = new Map();
    for (let doc = 0; doc < this.corpus.documentSlots; doc += 1) {
      const vector = this.corpus.doc(doc);
      if (!vector) continue;
      let sum = 0;
      for (let i = 0; i < vector.ids.length; i += 1) {
        const w = Math.log1p(vector.weights[i]) * this.corpus.idf(vector.ids[i]);
        sum += w * w;
      }
      this.norms.set(doc, Math.sqrt(sum));
    }
    this.normsRevision = this.corpus.changeRevision;
  }
}

// ---------------------------------------------------------------------------

export interface FlyHashParams {
  /** Output units (expansion dimension). */
  outputs: number;
  /** Output units each input feature connects to. */
  connections: number;
  /** Winners kept by winner-take-all. */
  winners: number;
  /** Projection seed; with the feature strings it fully determines every tag. */
  seed: number;
  /** Candidates collected from the activation index before reranking. */
  candidatePool: number;
  /** Rerank candidates by exact TF-IDF cosine (design §4.2). */
  rerank: boolean;
}

export const DEFAULT_FLYHASH_PARAMS: FlyHashParams = {
  outputs: 4096,
  connections: 8,
  winners: 32,
  seed: 20260924,
  candidatePool: 100,
  rerank: true,
};

/**
 * Evaluated method: FlyHash (Dasgupta, Stevens & Navlakha 2017 style).
 *
 * sparse input -> fixed-seed sparse binary projection into `outputs` units
 * (each input feature wired to `connections` units, chosen by hashing the
 * feature *string* with the seed so tags do not depend on vocabulary order)
 * -> winner-take-all keeps the top `winners` units as the region's tag ->
 * an inverted index from active unit to regions (no brute force over all tags)
 * -> candidates by tag overlap -> optional exact cosine rerank.
 *
 * Input weights are log(1+tf) x IDF, with IDF frozen at `build()` so an
 * incremental `add()` does not silently re-tag every other region; features
 * first seen after the build get the rarest-feature IDF. `build()` again to
 * refreeze. Nothing here is claimed to reproduce the paper's results.
 */
export class FlyHashRetriever implements Retriever {
  readonly name: string;
  private readonly params: FlyHashParams;
  private readonly unitPostings: number[][];
  private readonly tags = new Map<number, Int32Array>();
  private frozenIdf: Float32Array = new Float32Array(0);
  private maxIdf = 1;
  private readonly wiring = new Map<number, Int32Array>();
  private readonly activation: Float32Array;

  constructor(
    private readonly corpus: EncodedCorpus,
    private readonly cosine: CosineRetriever,
    params: Partial<FlyHashParams> = {},
  ) {
    this.params = { ...DEFAULT_FLYHASH_PARAMS, ...params };
    const { outputs, connections, winners } = this.params;
    if (!(outputs > 0 && connections > 0 && winners > 0 && winners <= outputs && connections <= outputs)) {
      throw new Error('FlyHash parameters must satisfy 0 < winners <= outputs and 0 < connections <= outputs.');
    }
    this.name = `flyhash(m=${outputs},s=${connections},k=${winners}${this.params.rerank ? '' : ',no-rerank'})`;
    this.unitPostings = Array.from({ length: outputs }, () => []);
    this.activation = new Float32Array(outputs);
  }

  get settings(): Readonly<FlyHashParams> {
    return this.params;
  }

  build(): void {
    for (const list of this.unitPostings) list.length = 0;
    this.tags.clear();
    this.frozenIdf = new Float32Array(this.corpus.vocabularySize);
    this.maxIdf = 0;
    for (let id = 0; id < this.corpus.vocabularySize; id += 1) {
      const idf = this.corpus.idf(id);
      this.frozenIdf[id] = idf;
      if (idf > this.maxIdf) this.maxIdf = idf;
    }
    for (let doc = 0; doc < this.corpus.documentSlots; doc += 1) this.add(doc);
  }

  add(doc: number): void {
    const vector = this.corpus.doc(doc);
    if (!vector) return;
    const tag = this.tagOf(vector);
    this.tags.set(doc, tag);
    for (const unit of tag) this.unitPostings[unit].push(doc);
  }

  remove(doc: number): void {
    const tag = this.tags.get(doc);
    if (!tag) return;
    for (const unit of tag) {
      const list = this.unitPostings[unit];
      const at = list.indexOf(doc);
      if (at >= 0) list.splice(at, 1);
    }
    this.tags.delete(doc);
  }

  search(query: EncodedVector, k: number): ScoredDoc[] {
    const tag = this.tagOf(query);
    const overlap = new Map<number, number>();
    for (const unit of tag) for (const doc of this.unitPostings[unit]) overlap.set(doc, (overlap.get(doc) ?? 0) + 1);
    const pool = topK(overlap, this.params.rerank ? this.params.candidatePool : k);
    if (!this.params.rerank) return pool;
    return pool
      .map(({ doc }) => ({ doc, score: this.cosine.cosine(query, doc) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.doc - b.doc)
      .slice(0, k);
  }

  /** The tag a vector would get; exposed for tests and diagnostics. */
  tagOf(vector: EncodedVector): Int32Array {
    const touched: number[] = [];
    for (let i = 0; i < vector.ids.length; i += 1) {
      const id = vector.ids[i];
      const idf = id < this.frozenIdf.length ? this.frozenIdf[id] : this.maxIdf || this.corpus.idf(id);
      const weight = Math.log1p(vector.weights[i]) * idf;
      if (weight <= 0) continue;
      for (const unit of this.wiringOf(id)) {
        if (this.activation[unit] === 0) touched.push(unit);
        this.activation[unit] += weight;
      }
    }
    touched.sort((a, b) => this.activation[b] - this.activation[a] || a - b);
    const winners = touched.slice(0, Math.min(this.params.winners, touched.length)).sort((a, b) => a - b);
    for (const unit of touched) this.activation[unit] = 0;
    return Int32Array.from(winners);
  }

  memoryEstimate(): number {
    let bytes = 0;
    for (const list of this.unitPostings) bytes += 32 + list.length * 8;
    for (const tag of this.tags.values()) bytes += tag.byteLength + 48;
    for (const wires of this.wiring.values()) bytes += wires.byteLength + 48;
    return bytes + this.frozenIdf.byteLength;
  }

  private wiringOf(id: number): Int32Array {
    let wires = this.wiring.get(id);
    if (wires) return wires;
    const feature = this.corpus.featureOf(id);
    const units = new Set<number>();
    for (let j = 0; units.size < this.params.connections && j < this.params.connections * 4; j += 1) {
      units.add(hash32(`${this.params.seed}\u0000${feature}\u0000${j}`) % this.params.outputs);
    }
    wires = Int32Array.from(units);
    this.wiring.set(id, wires);
    return wires;
  }
}

/** FNV-1a 32-bit over UTF-16 code units, followed by a murmur-style finalizer. */
function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

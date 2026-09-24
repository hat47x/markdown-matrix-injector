/**
 * Keeps one `EncodedCorpus` in step with a `RegionCatalog` and hosts every
 * retrieval method over it, so the methods compared in issue-0115 always see
 * identical features and data (input-assistance-cpu-search.md §4.1).
 *
 * `sync()` is incremental: a book whose region list object did not change is
 * not touched; a changed book has its old documents removed and new ones
 * added in every retriever. The first sync does a full build (which is also
 * where FlyHash freezes its IDF snapshot).
 */
import type { RegionCatalog, RegionRecord } from './regionCatalog.js';
import { regionFeatureBag, regionNames } from './regionCatalog.js';
import {
  Bm25Retriever,
  CosineRetriever,
  EncodedCorpus,
  ExactTokenRetriever,
  FlyHashRetriever,
  type FlyHashParams,
  type Retriever,
  type ScoredDoc,
} from './retrievers.js';
import { addTextFeatures, DEFAULT_ROLE_WEIGHTS, type FeatureBag, type FeatureRole } from './textFeatures.js';

export type RetrievalMethod = 'exact' | 'bm25' | 'cosine' | 'flyhash';

export const RETRIEVAL_METHODS: readonly RetrievalMethod[] = ['exact', 'bm25', 'cosine', 'flyhash'];

export interface SearchIndexOptions {
  methods?: readonly RetrievalMethod[];
  flyhash?: Partial<FlyHashParams>;
  weights?: Readonly<Record<FeatureRole, number>>;
}

export interface RegionHit {
  region: RegionRecord;
  doc: number;
  score: number;
}

export interface SyncResult {
  added: number;
  removed: number;
  fullBuild: boolean;
}

export class RegionSearchIndex {
  readonly corpus = new EncodedCorpus();
  readonly cosine: CosineRetriever;
  private readonly retrievers = new Map<RetrievalMethod, Retriever>();
  private readonly regionsByDoc = new Map<number, RegionRecord>();
  private readonly bags = new Map<number, FeatureBag>();
  /** Features of names only (book / sheet / title / headers), and their region frequency. */
  private readonly namesBags = new Map<number, FeatureBag>();
  private readonly namesDf = new Map<string, number>();
  private readonly books = new Map<string, { regions: readonly RegionRecord[]; docs: number[] }>();
  private built = false;
  private readonly weights: Readonly<Record<FeatureRole, number>>;

  constructor(
    private readonly catalog: RegionCatalog,
    options: SearchIndexOptions = {},
  ) {
    this.weights = options.weights ?? DEFAULT_ROLE_WEIGHTS;
    this.cosine = new CosineRetriever(this.corpus);
    for (const method of options.methods ?? RETRIEVAL_METHODS) {
      this.retrievers.set(method, this.createRetriever(method, options.flyhash));
    }
  }

  get methods(): RetrievalMethod[] {
    return [...this.retrievers.keys()];
  }

  retriever(method: RetrievalMethod): Retriever {
    const retriever = this.retrievers.get(method);
    if (!retriever) throw new Error(`Retrieval method not enabled: ${method}`);
    return retriever;
  }

  sync(): SyncResult {
    const result: SyncResult = { added: 0, removed: 0, fullBuild: !this.built };
    const live = new Set(this.catalog.bookPaths());
    for (const [path, entry] of this.books) {
      if (live.has(path) && this.catalog.regionsOf(path) === entry.regions) continue;
      for (const doc of entry.docs) this.removeDoc(doc);
      result.removed += entry.docs.length;
      this.books.delete(path);
    }
    for (const path of live) {
      if (this.books.has(path)) continue;
      const regions = this.catalog.regionsOf(path);
      const docs = regions.map((region) => this.addDoc(region));
      this.books.set(path, { regions, docs });
      result.added += docs.length;
    }
    if (!this.built) {
      this.cosine.build();
      for (const retriever of this.retrievers.values()) if (retriever !== this.cosine) retriever.build();
      this.built = true;
    }
    return result;
  }

  /** Rebuilds every retriever from the current corpus (refreezes FlyHash IDF). */
  rebuild(): void {
    this.built = false;
    this.sync();
  }

  search(method: RetrievalMethod, bag: FeatureBag, k: number): RegionHit[] {
    const query = this.corpus.encodeQuery(bag);
    return this.retriever(method)
      .search(query, k)
      .map((hit) => this.hitOf(hit))
      .filter((hit): hit is RegionHit => hit !== undefined);
  }

  /** Exact TF-IDF cosine of the given documents against a query, best first. */
  scoreDocs(bag: FeatureBag, docs: Iterable<number>): RegionHit[] {
    const query = this.corpus.encodeQuery(bag);
    const hits: RegionHit[] = [];
    for (const doc of docs) {
      const hit = this.hitOf({ doc, score: this.cosine.cosine(query, doc) });
      if (hit) hits.push(hit);
    }
    return hits.sort((a, b) => b.score - a.score || a.doc - b.doc);
  }

  bookPaths(): string[] {
    return [...this.books.keys()];
  }

  docsOfBook(path: string): number[] {
    return this.books.get(path)?.docs ?? [];
  }

  namesBagOf(doc: number): FeatureBag | undefined {
    return this.namesBags.get(doc);
  }

  /** How many indexed regions carry `feature` in a name. */
  namesFrequency(feature: string): number {
    return this.namesDf.get(feature) ?? 0;
  }

  bagOf(doc: number): FeatureBag | undefined {
    return this.bags.get(doc);
  }

  region(doc: number): RegionRecord | undefined {
    return this.regionsByDoc.get(doc);
  }

  get size(): number {
    return this.regionsByDoc.size;
  }

  /** Structural size estimate: shared corpus plus each retriever's own index. */
  memoryEstimate(): { corpus: number; byMethod: Record<string, number> } {
    const byMethod: Record<string, number> = {};
    for (const [method, retriever] of this.retrievers) byMethod[method] = retriever.memoryEstimate();
    return { corpus: this.corpus.memoryEstimate(), byMethod };
  }

  private hitOf(hit: ScoredDoc): RegionHit | undefined {
    const region = this.regionsByDoc.get(hit.doc);
    return region ? { region, doc: hit.doc, score: hit.score } : undefined;
  }

  private addDoc(region: RegionRecord): number {
    const bag = regionFeatureBag(region, this.weights);
    const doc = this.corpus.add(bag);
    this.regionsByDoc.set(doc, region);
    this.bags.set(doc, bag);
    const names: FeatureBag = new Map();
    for (const name of regionNames(region)) addTextFeatures(names, name.text, 1);
    this.namesBags.set(doc, names);
    for (const feature of names.keys()) this.namesDf.set(feature, (this.namesDf.get(feature) ?? 0) + 1);
    if (this.built) {
      this.cosine.add(doc);
      for (const retriever of this.retrievers.values()) if (retriever !== this.cosine) retriever.add(doc);
    }
    return doc;
  }

  private removeDoc(doc: number): void {
    if (this.built) {
      this.cosine.remove(doc);
      for (const retriever of this.retrievers.values()) if (retriever !== this.cosine) retriever.remove(doc);
    }
    this.corpus.remove(doc);
    this.regionsByDoc.delete(doc);
    this.bags.delete(doc);
    for (const feature of this.namesBags.get(doc)?.keys() ?? []) {
      const left = (this.namesDf.get(feature) ?? 1) - 1;
      if (left > 0) this.namesDf.set(feature, left);
      else this.namesDf.delete(feature);
    }
    this.namesBags.delete(doc);
  }

  private createRetriever(method: RetrievalMethod, flyhash?: Partial<FlyHashParams>): Retriever {
    switch (method) {
      case 'exact':
        return new ExactTokenRetriever(this.corpus);
      case 'bm25':
        return new Bm25Retriever(this.corpus);
      case 'cosine':
        return this.cosine;
      case 'flyhash':
        return new FlyHashRetriever(this.corpus, this.cosine, flyhash);
    }
  }
}

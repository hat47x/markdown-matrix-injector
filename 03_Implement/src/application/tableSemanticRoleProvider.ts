import type { Candidate } from '../core/candidate.js';
import type {
  CandidateReviewInventoryItem,
} from './candidateReviewInventory.js';
import type {
  CandidateReviewProviderLane,
} from './candidateReviewProviderRefresh.js';
import {
  cosine,
  createEmbeddingProvider,
  type EmbeddingProviderConfig,
  type FetchLike,
} from '../search/semantic/embeddingProvider.js';
import {
  verifyEmbeddingArtifactIdentity,
  type DiscoveryFetch,
} from '../search/semantic/runtimeDiscovery.js';

export const TABLE_SEMANTIC_ROLE_PROVIDER_ALGORITHM =
  'mmi.table-semantic-role-embedding';
export const TABLE_SEMANTIC_ROLE_CATALOG_VERSION = '1';

export interface TableSemanticRole {
  id:
    | 'list-master'
    | 'mapping-crosswalk'
    | 'schedule-plan'
    | 'check-test'
    | 'workflow-transition'
    | 'interface-spec'
    | 'condition-rule';
  description: string;
}

export const TABLE_SEMANTIC_ROLES: readonly TableSemanticRole[] = [
  {
    id: 'list-master',
    description:
      '一覧・マスタ。複数の対象を行に並べ、名称、ID、属性、状態などを列で管理する表。',
  },
  {
    id: 'mapping-crosswalk',
    description:
      '対応表・マッピング。二つ以上の分類、ID、項目、役割、状態などの対応関係を示す表。',
  },
  {
    id: 'schedule-plan',
    description:
      '日程・計画。日付、時刻、期間、担当、予定、マイルストーンなどを整理する表。',
  },
  {
    id: 'check-test',
    description:
      'チェック・試験。確認項目、期待値、結果、判定、証跡、テストケースなどを整理する表。',
  },
  {
    id: 'workflow-transition',
    description:
      '手順・状態遷移。前後状態、操作、条件、手順、遷移、処理順などを表す表。',
  },
  {
    id: 'interface-spec',
    description:
      '仕様・インターフェース。項目名、型、桁、必須、形式、説明、入出力などを定義する表。',
  },
  {
    id: 'condition-rule',
    description:
      '条件・ルール。条件と結果、権限、適用可否、判定規則、例外などを整理する表。',
  },
];

export interface TableSemanticRoleProviderOptions
  extends EmbeddingProviderConfig {
  items: readonly CandidateReviewInventoryItem[];
  expectedArtifactDigest?: string;
  minScore?: number;
  minMargin?: number;
  embeddingFetch?: FetchLike;
  identityFetch?: DiscoveryFetch;
}

const DEFAULT_MIN_SCORE = 0.6;
const DEFAULT_MIN_MARGIN = 0.05;

export function tableSemanticRoleDescriptor(
  item: Extract<CandidateReviewInventoryItem, { kind: 'table' }>,
): string | undefined {
  const title = item.candidate.claims.find(
    (claim) => claim.aspect === 'title',
  )?.value;
  const header = item.candidate.claims.find(
    (claim) => claim.aspect === 'header',
  )?.value;
  const headers = Array.isArray(header)
    ? header.filter((value): value is string => typeof value === 'string')
    : typeof header === 'string'
      ? [header]
      : [];
  const parts = [
    `シート: ${item.sheet}`,
    typeof title === 'string' && title.trim()
      ? `表題: ${title.trim()}`
      : '',
    headers.length > 0 ? `見出し: ${headers.join('、')}` : '',
  ].filter(Boolean);
  return parts.length > 1 ? parts.join(' / ') : undefined;
}

export function createTableSemanticRoleProviderLane(
  options: TableSemanticRoleProviderOptions,
): CandidateReviewProviderLane {
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const minMargin = options.minMargin ?? DEFAULT_MIN_MARGIN;
  if (!(minScore >= -1 && minScore <= 1)) {
    throw new Error('table semantic role minScore must be between -1 and 1');
  }
  if (!(minMargin >= 0 && minMargin <= 2)) {
    throw new Error('table semantic role minMargin must be between 0 and 2');
  }

  const provider = createEmbeddingProvider(
    options,
    options.embeddingFetch,
  );
  const providerId =
    `mmi.table-semantic-role:${provider.descriptor.id}`;
  const tables = options.items.flatMap((item) =>
    item.kind === 'table'
      && item.candidate.execution === 'deterministic'
      ? [item]
      : []);

  return {
    providerId,
    async collect(context) {
      if (tables.length === 0) return [];

      if (options.expectedArtifactDigest) {
        const identityOk = await verifyEmbeddingArtifactIdentity(
          {
            api: options.api,
            endpoint: options.endpoint,
            model: options.model,
            expectedArtifactDigest: options.expectedArtifactDigest,
          },
          options.identityFetch,
        );
        if (!identityOk) {
          throw new Error(
            'Local embedding artifact identity no longer matches the selected model',
          );
        }
      }

      const eligible = tables.flatMap((item) => {
        if (
          item.candidate.locator.source !== context.sourceLabel
          || item.candidate.locator.sourceDigest !== context.sourceDigest
        ) {
          return [];
        }
        const descriptor = tableSemanticRoleDescriptor(item);
        return descriptor ? [{ item, descriptor }] : [];
      });
      if (eligible.length === 0) return [];

      const roleVectors = await provider.embed(
        TABLE_SEMANTIC_ROLES.map((role) =>
          `${provider.documentPrefix}${role.description}`),
      );
      if (!roleVectors) {
        throw new Error('Local embedding runtime/model is unavailable');
      }

      const tableVectors = await provider.embed(
        eligible.map(({ descriptor }) =>
          `${provider.queryPrefix}${descriptor}`),
      );
      if (!tableVectors) {
        throw new Error('Local embedding runtime/model is unavailable');
      }

      const artifactVersion = options.expectedArtifactDigest
        ?? `runtime-alias:${provider.model}`;
      const parameters = {
        roleCatalogVersion: TABLE_SEMANTIC_ROLE_CATALOG_VERSION,
        minScore,
        minMargin,
        api: options.api,
      };

      return eligible.flatMap(({ item }, tableIndex) => {
        const ranked = TABLE_SEMANTIC_ROLES.map((role, roleIndex) => ({
          role,
          score: cosine(tableVectors[tableIndex], roleVectors[roleIndex]),
        })).sort((left, right) =>
          right.score - left.score
          || left.role.id.localeCompare(right.role.id));

        const best = ranked[0];
        const second = ranked[1];
        if (!best || best.score < minScore) return [];
        const margin = second ? best.score - second.score : 2;
        if (margin < minMargin) return [];

        const base = item.candidate;
        const candidate: Candidate = {
          kind: 'table-range',
          locator: { ...base.locator },
          status: 'inferred',
          execution: 'provider-dependent',
          method: 'M2',
          claims: [{
            aspect: 'semantic-role',
            value: best.role.id,
            status: 'inferred',
            execution: 'provider-dependent',
            method: 'M2',
            reasonCode: 'local-embedding-fixed-role-catalog',
            evidence: [
              {
                code: 'deterministic-table-identity-bound',
              },
              {
                code: 'fixed-role-catalog',
                detail: TABLE_SEMANTIC_ROLE_CATALOG_VERSION,
              },
            ],
          }],
          provenance: {
            algorithm: TABLE_SEMANTIC_ROLE_PROVIDER_ALGORITHM,
            run: {
              execution: 'provider-dependent',
              inputDigest: context.sourceDigest,
              provider: providerId,
              model: provider.model,
              artifactVersion,
              parameters,
            },
          },
          fingerprint: { ...base.fingerprint },
          scores: [{
            provider: providerId,
            scale: 'cosine',
            value: best.score,
          }],
          ...(base.reference ? { reference: base.reference } : {}),
        };

        return [{
          kind: 'table' as const,
          candidate,
          sheet: item.sheet,
          range: item.range,
          ...(item.title ? { title: item.title } : {}),
        }];
      });
    },
  };
}

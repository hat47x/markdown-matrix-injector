import type {
  Candidate,
  CandidateKind,
  Claim,
  EpistemicStatus,
  Evidence,
  ExecutionProperty,
  Fingerprint,
  MethodClass,
  Provenance,
  ProviderScore,
  SourceLocator,
} from '../core/candidate.js';
import { candidateProblem } from '../core/candidate.js';

export const AI_HANDOFF_SCHEMA = 'mmi.ai-handoff/v1' as const;

export type HandoffAllowedOperation =
  | 'propose-mmi-notation'
  | 'explain-candidate-choice'
  | 'suggest-user-review';

export type HandoffForbiddenOperation =
  | 'modify-source'
  | 'write-workspace'
  | 'execute-command'
  | 'access-network'
  | 'read-outside-workspace'
  | 'treat-inference-as-authority'
  | 'treat-proposal-as-validated';

export interface HandoffDiagnosticInput {
  file: string;
  line: number;
  column: number;
  severity: string;
  code: string;
  message: string;
}

export interface HandoffEvidence {
  code: string;
  detail?: string;
}

export interface HandoffClaimView {
  candidateKind: CandidateKind;
  locator: SourceLocator;
  aspect: string;
  status: EpistemicStatus;
  execution: ExecutionProperty;
  method: MethodClass;
  reasonCode: string;
  evidence: readonly HandoffEvidence[];
  value?: string | readonly string[];
  provenance: HandoffProvenanceView;
  fingerprint: Fingerprint;
  reference?: string;
}

export interface HandoffCandidateView {
  kind: CandidateKind;
  locator: SourceLocator;
  status: EpistemicStatus;
  execution: ExecutionProperty;
  method: MethodClass;
  claims: readonly HandoffClaimView[];
  provenance: HandoffProvenanceView;
  fingerprint: Fingerprint;
  scores: readonly ProviderScore[];
  reference?: string;
}

export type HandoffUnresolvedIssue =
  | {
      kind: 'diagnostic';
      file: string;
      line: number;
      column: number;
      severity: string;
      code: string;
      message: string;
    }
  | {
      kind: 'abstained-claim';
      candidateKind: CandidateKind;
      locator: SourceLocator;
      aspect: string;
      execution: ExecutionProperty;
      method: MethodClass;
      reasonCode: string;
      evidence: readonly HandoffEvidence[];
      provenance: HandoffProvenanceView;
      fingerprint: Fingerprint;
      reference?: string;
    };

export type HandoffProvenanceView =
  | {
      algorithm: string;
      run: {
        execution: 'deterministic';
        inputDigest: string;
        config: Readonly<Record<string, string | number | boolean>>;
        implementationVersion: string;
      };
    }
  | {
      algorithm: string;
      run: {
        execution: 'provider-dependent';
        inputDigest: string;
        provider: string;
        model: string;
        artifactVersion: string;
        parameters: Readonly<Record<string, string | number | boolean>>;
      };
    };

export interface AiHandoffPackageV1 {
  schema: typeof AI_HANDOFF_SCHEMA;
  task: string;
  privacy: {
    sourceValues: 'omitted' | 'included-explicitly';
    evidenceDetails: 'omitted' | 'included-explicitly';
  };
  sources: ReadonlyArray<{
    source: string;
    sourceDigest: string;
  }>;
  confirmedFacts: readonly HandoffClaimView[];
  inferredCandidates: readonly HandoffCandidateView[];
  unresolvedIssues: readonly HandoffUnresolvedIssue[];
  allowedOperations: readonly HandoffAllowedOperation[];
  forbiddenOperations: readonly HandoffForbiddenOperation[];
  returnContract: {
    proposalOnly: true;
    authorityRevalidationRequired: true;
    preferredNotation: 'mmi-embed';
  };
}

export interface CreateAiHandoffPackageInput {
  task: string;
  candidates: readonly Candidate[];
  diagnostics?: readonly HandoffDiagnosticInput[];
  includeValues?: boolean;
}

export function parseAiHandoffPackage(text: string): AiHandoffPackageV1 {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('AI handoff package is not valid JSON.');
  }
  assertAiHandoffPackage(value);
  return value;
}

export function assertAiHandoffPackage(
  value: unknown,
): asserts value is AiHandoffPackageV1 {
  if (!value || typeof value !== 'object') {
    throw new Error('AI handoff package must be an object.');
  }
  const pkg = value as Partial<AiHandoffPackageV1>;
  if (pkg.schema !== AI_HANDOFF_SCHEMA) {
    throw new Error(`Unsupported AI handoff schema: ${String(pkg.schema)}`);
  }
  if (typeof pkg.task !== 'string' || pkg.task.trim().length === 0) {
    throw new Error('AI handoff package requires a non-empty task.');
  }
  if (!Array.isArray(pkg.sources) || pkg.sources.length === 0) {
    throw new Error('AI handoff package requires at least one source.');
  }
  for (const [index, source] of pkg.sources.entries()) {
    if (
      !source
      || typeof source.source !== 'string'
      || source.source.trim().length === 0
      || typeof source.sourceDigest !== 'string'
      || !/^sha256:[0-9a-f]{64}$/u.test(source.sourceDigest)
    ) {
      throw new Error(`AI handoff package source ${index} is invalid.`);
    }
  }
  if (
    !pkg.returnContract
    || pkg.returnContract.proposalOnly !== true
    || pkg.returnContract.authorityRevalidationRequired !== true
    || pkg.returnContract.preferredNotation !== 'mmi-embed'
  ) {
    throw new Error('AI handoff package Authority return contract is invalid.');
  }
  if (!Array.isArray(pkg.allowedOperations) || !Array.isArray(pkg.forbiddenOperations)) {
    throw new Error('AI handoff package operation boundaries are missing.');
  }
}

const ALLOWED_OPERATIONS: readonly HandoffAllowedOperation[] = [
  'propose-mmi-notation',
  'explain-candidate-choice',
  'suggest-user-review',
];

const FORBIDDEN_OPERATIONS: readonly HandoffForbiddenOperation[] = [
  'modify-source',
  'write-workspace',
  'execute-command',
  'access-network',
  'read-outside-workspace',
  'treat-inference-as-authority',
  'treat-proposal-as-validated',
];

export function createAiHandoffPackage(
  input: CreateAiHandoffPackageInput,
): AiHandoffPackageV1 {
  const task = input.task.trim();
  if (!task) throw new Error('AI handoff task must not be empty.');

  input.candidates.forEach((candidate, index) => {
    const problem = candidateProblem(candidate);
    if (problem) {
      throw new Error(`AI handoff candidate ${index} is invalid: ${problem}`);
    }
  });

  const includeValues = input.includeValues === true;
  const confirmedFacts: HandoffClaimView[] = [];
  const inferredCandidates: HandoffCandidateView[] = [];
  const unresolvedIssues: HandoffUnresolvedIssue[] = [];

  for (const candidate of input.candidates) {
    const inferredClaims: HandoffClaimView[] = [];

    for (const claim of candidate.claims) {
      if (claim.status === 'observed' || claim.status === 'confirmed') {
        confirmedFacts.push(claimView(candidate, claim, includeValues));
      } else if (claim.status === 'inferred') {
        inferredClaims.push(claimView(candidate, claim, includeValues));
      } else {
        unresolvedIssues.push(abstainedIssue(candidate, claim, includeValues));
      }
    }

    if (inferredClaims.length > 0 || candidate.status === 'inferred') {
      inferredCandidates.push({
        kind: candidate.kind,
        locator: copyLocator(candidate.locator),
        status: candidate.status,
        execution: candidate.execution,
        method: candidate.method,
        claims: inferredClaims,
        provenance: provenanceView(candidate.provenance),
        fingerprint: { ...candidate.fingerprint },
        scores: candidate.scores.map((score) => ({ ...score })),
        ...(candidate.reference ? { reference: candidate.reference } : {}),
      });
    }
  }

  for (const diagnostic of input.diagnostics ?? []) {
    unresolvedIssues.push({
      kind: 'diagnostic',
      file: diagnostic.file,
      line: diagnostic.line,
      column: diagnostic.column,
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
    });
  }

  const sources = new Map<string, { source: string; sourceDigest: string }>();
  for (const candidate of input.candidates) {
    const key = `${candidate.locator.source}\u0000${candidate.locator.sourceDigest}`;
    sources.set(key, {
      source: candidate.locator.source,
      sourceDigest: candidate.locator.sourceDigest,
    });
  }

  return {
    schema: AI_HANDOFF_SCHEMA,
    task,
    privacy: {
      sourceValues: includeValues ? 'included-explicitly' : 'omitted',
      evidenceDetails: includeValues ? 'included-explicitly' : 'omitted',
    },
    sources: [...sources.values()].sort((left, right) =>
      left.source.localeCompare(right.source)
      || left.sourceDigest.localeCompare(right.sourceDigest)),
    confirmedFacts,
    inferredCandidates,
    unresolvedIssues,
    allowedOperations: [...ALLOWED_OPERATIONS],
    forbiddenOperations: [...FORBIDDEN_OPERATIONS],
    returnContract: {
      proposalOnly: true,
      authorityRevalidationRequired: true,
      preferredNotation: 'mmi-embed',
    },
  };
}

export function renderAiHandoffPrompt(pkg: AiHandoffPackageV1): string {
  if (pkg.schema !== AI_HANDOFF_SCHEMA) {
    throw new Error(`Unsupported AI handoff schema: ${String(pkg.schema)}`);
  }

  const lines = [
    'MMIがローカルで生成した判断材料です。MMI自身は外部サービスへ送信していません。',
    '',
    `依頼: ${pkg.task}`,
    '',
    '制約:',
    '- 提案だけを返してください。原本やワークスペースを変更しないでください。',
    '- observed/confirmed と inferred を混同しないでください。',
    '- MMI記法を提案する場合も、採用前にMMIのAuthority Planeで再検証されます。',
    '- 記載されていない値や内容を推測で補わないでください。',
    `- source values: ${pkg.privacy.sourceValues}`,
    '',
    '確定側の事実:',
    ...formatFacts(pkg.confirmedFacts),
    '',
    '推定候補:',
    ...formatCandidates(pkg.inferredCandidates),
    '',
    '未解決事項:',
    ...formatUnresolved(pkg.unresolvedIssues),
    '',
    `許可される操作: ${pkg.allowedOperations.join(', ')}`,
    `禁止される操作: ${pkg.forbiddenOperations.join(', ')}`,
    '',
    '返答では、提案内容、根拠に使った項目、未確定の点を分けてください。',
  ];

  return lines.join('\n');
}

function claimView(
  candidate: Candidate,
  claim: Claim,
  includeValues: boolean,
): HandoffClaimView {
  return {
    candidateKind: candidate.kind,
    locator: copyLocator(candidate.locator),
    aspect: claim.aspect,
    status: claim.status,
    execution: claim.execution,
    method: claim.method,
    reasonCode: claim.reasonCode,
    evidence: copyEvidence(claim.evidence, includeValues),
    ...(includeValues && claim.value !== undefined
      ? { value: Array.isArray(claim.value) ? [...claim.value] : claim.value }
      : {}),
    provenance: provenanceView(candidate.provenance),
    fingerprint: { ...candidate.fingerprint },
    ...(candidate.reference ? { reference: candidate.reference } : {}),
  };
}

function abstainedIssue(
  candidate: Candidate,
  claim: Claim,
  includeValues: boolean,
): HandoffUnresolvedIssue {
  return {
    kind: 'abstained-claim',
    candidateKind: candidate.kind,
    locator: copyLocator(candidate.locator),
    aspect: claim.aspect,
    execution: claim.execution,
    method: claim.method,
    reasonCode: claim.reasonCode,
    evidence: copyEvidence(claim.evidence, includeValues),
    provenance: provenanceView(candidate.provenance),
    fingerprint: { ...candidate.fingerprint },
    ...(candidate.reference ? { reference: candidate.reference } : {}),
  };
}

function copyEvidence(
  evidence: readonly Evidence[] | undefined,
  includeDetails: boolean,
): HandoffEvidence[] {
  return (evidence ?? []).map((item) => ({
    code: item.code,
    ...(includeDetails && item.detail !== undefined
      ? { detail: item.detail }
      : {}),
  }));
}

function copyLocator(locator: SourceLocator): SourceLocator {
  return { ...locator };
}

function provenanceView(provenance: Provenance): HandoffProvenanceView {
  const run = provenance.run;
  if (run.execution === 'deterministic') {
    return {
      algorithm: provenance.algorithm,
      run: {
        execution: run.execution,
        inputDigest: run.inputDigest,
        config: { ...run.config },
        implementationVersion: run.implementationVersion,
      },
    };
  }
  return {
    algorithm: provenance.algorithm,
    run: {
      execution: run.execution,
      inputDigest: run.inputDigest,
      provider: run.provider,
      model: run.model,
      artifactVersion: run.artifactVersion,
      parameters: { ...run.parameters },
    },
  };
}

function formatFacts(items: readonly HandoffClaimView[]): string[] {
  if (items.length === 0) return ['- なし'];
  return items.map((item) =>
    `- [${item.status}/${item.execution}] ${formatLocator(item.locator)} ${item.aspect}${formatValue(item)} (${item.reasonCode})`);
}

function formatCandidates(items: readonly HandoffCandidateView[]): string[] {
  if (items.length === 0) return ['- なし'];
  return items.map((item) => {
    const claims = item.claims.map((claim) =>
      `${claim.aspect}${formatValue(claim)} (${claim.reasonCode})`).join('; ');
    return `- [${item.status}/${item.execution}/${item.method}] ${formatLocator(item.locator)}: ${claims || '推定Claimなし'}`;
  });
}

function formatUnresolved(items: readonly HandoffUnresolvedIssue[]): string[] {
  if (items.length === 0) return ['- なし'];
  return items.map((item) => {
    if (item.kind === 'diagnostic') {
      return `- [diagnostic/${item.severity}] ${item.file}:${item.line}:${item.column} ${item.code} ${item.message}`;
    }
    return `- [abstained/${item.execution}/${item.method}] ${formatLocator(item.locator)} ${item.aspect} (${item.reasonCode})`;
  });
}

function formatValue(item: { value?: string | readonly string[] }): string {
  if (item.value === undefined) return ' [value omitted]';
  return ` = ${Array.isArray(item.value) ? item.value.join(', ') : item.value}`;
}

function formatLocator(locator: SourceLocator): string {
  return [
    locator.source,
    locator.sheet ? `#${locator.sheet}` : '',
    locator.range ? `|${locator.range}` : '',
  ].join('');
}

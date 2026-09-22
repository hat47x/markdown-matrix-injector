import { createHash } from 'node:crypto';
import {
  STRUCTURED_ARTIFACT_OBSERVATION_SCHEMA,
  assertStructuredArtifactObservation,
  type StructuredArtifactObservationV0,
} from './structuredArtifactNeutralObservation.js';
import {
  extractWorksheetFormatFeatures,
  type WorksheetFormatSnapshot,
} from './worksheetFormatFeatureAdapter.js';
import {
  WORKSHEET_FORMAT_FEATURE_VERSION,
} from './worksheetFormatPrototype.js';

export const MMI_WORKSHEET_NEUTRAL_PRODUCER_SCHEMA =
  'mmi-worksheet-format-snapshot/v1' as const;

export const MMI_WORKSHEET_NEUTRAL_ADAPTER_VERSION =
  'mmi-structured-artifact-neutral-adapter-v0' as const;

export const MMI_WORKSHEET_NEUTRAL_NON_EMPTY_METHOD =
  'mmi-snapshot-non-empty-bounds-v1' as const;

export const MMI_WORKSHEET_NEUTRAL_MERGE_METHOD =
  'mmi-snapshot-region-merge-count-v1' as const;

export const MMI_WORKSHEET_NEUTRAL_HEADER_METHOD =
  `mmi-worksheet-format-header-candidate-${WORKSHEET_FORMAT_FEATURE_VERSION}` as const;

export const MMI_WORKSHEET_NEUTRAL_ADAPTER_CONFIG_DIGEST =
  sha256(JSON.stringify([
    MMI_WORKSHEET_NEUTRAL_ADAPTER_VERSION,
    MMI_WORKSHEET_NEUTRAL_NON_EMPTY_METHOD,
    MMI_WORKSHEET_NEUTRAL_MERGE_METHOD,
    MMI_WORKSHEET_NEUTRAL_HEADER_METHOD,
    'hidden-row-column-visibility:unavailable',
  ]));

export interface MmiWorksheetNeutralObservationInput {
  snapshot: WorksheetFormatSnapshot;
  sheetName: string;
  sourceDigest: string;
  sourceFamilyId: string;
  workbookOrDocument: string;
  producerVersionOrGitSha: string;
  sourceFormat?: 'xlsx' | 'synthetic';
  privacyClass?:
    | 'public'
    | 'internal'
    | 'restricted'
    | 'unknown';
  split?: 'train' | 'valid' | 'test' | 'unassigned';
  mutationFamily?: string | null;
}

interface RegionBounds {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
  nonEmptyCount: number;
}

export function createMmiWorksheetStructuredArtifactObservation(
  input: MmiWorksheetNeutralObservationInput,
): StructuredArtifactObservationV0 {
  assertNonEmpty('sheetName', input.sheetName);
  assertDigest(input.sourceDigest, 'sourceDigest');
  assertNonEmpty('sourceFamilyId', input.sourceFamilyId);
  assertNonEmpty(
    'workbookOrDocument',
    input.workbookOrDocument,
  );
  assertNonEmpty(
    'producerVersionOrGitSha',
    input.producerVersionOrGitSha,
  );
  if (
    input.mutationFamily !== undefined
    && input.mutationFamily !== null
  ) {
    assertNonEmpty(
      'mutationFamily',
      input.mutationFamily,
    );
  }

  const sourceFormat =
    input.sourceFormat ?? 'xlsx';
  const privacyClass =
    input.privacyClass ?? 'unknown';
  const split = input.split ?? 'unassigned';

  const formatObservation =
    extractWorksheetFormatFeatures(input.snapshot);
  const bounds = findNonEmptyBounds(input.snapshot);

  const rowCount =
    bounds.endRow - bounds.startRow + 1;
  const colCount =
    bounds.endColumn - bounds.startColumn + 1;
  const slotCount = rowCount * colCount;
  const mergeCount =
    countOverlappingMerges(
      input.snapshot,
      bounds,
    );

  const observation: StructuredArtifactObservationV0 = {
    schema: STRUCTURED_ARTIFACT_OBSERVATION_SCHEMA,
    observation_id:
      `markdown-matrix-injector/${input.sourceFamilyId}/${input.sheetName}/r${bounds.startRow + 1}c${bounds.startColumn + 1}-r${bounds.endRow + 1}c${bounds.endColumn + 1}`,
    producer: {
      repository:
        'hat47x/markdown-matrix-injector',
      producer_schema:
        MMI_WORKSHEET_NEUTRAL_PRODUCER_SCHEMA,
      producer_version_or_git_sha:
        input.producerVersionOrGitSha,
      adapter_version:
        MMI_WORKSHEET_NEUTRAL_ADAPTER_VERSION,
    },
    source: {
      source_digest: input.sourceDigest,
      source_format: sourceFormat,
      source_family_id: input.sourceFamilyId,
      sheet_or_entity_id: input.sheetName,
      privacy_class: privacyClass,
      synthetic: sourceFormat === 'synthetic',
    },
    region: {
      coordinate_system: 'one_based_inclusive',
      row_start: bounds.startRow + 1,
      row_end: bounds.endRow + 1,
      col_start: bounds.startColumn + 1,
      col_end: bounds.endColumn + 1,
      row_count: rowCount,
      col_count: colCount,
      parent_region_id: null,
      region_role_hint: 'sheet',
    },
    features: {
      'geometry.non_empty_ratio': {
        value: bounds.nonEmptyCount / slotCount,
        kind: 'measured',
        method:
          MMI_WORKSHEET_NEUTRAL_NON_EMPTY_METHOD,
        confidence: null,
      },
      'geometry.merged_cell_count': {
        value: mergeCount,
        kind: 'measured',
        method:
          MMI_WORKSHEET_NEUTRAL_MERGE_METHOD,
        confidence: null,
      },
      'role.header_candidate_signal': {
        value:
          formatObservation.headerRow === undefined
            ? 'absent'
            : 'present',
        kind: 'categorical',
        method:
          MMI_WORKSHEET_NEUTRAL_HEADER_METHOD,
        confidence: null,
      },
    },
    labels: {},
    split: {
      split,
      group_keys: {
        source_family: input.sourceFamilyId,
        workbook_or_document:
          input.workbookOrDocument,
        mutation_family:
          input.mutationFamily ?? null,
      },
    },
    provenance: {
      source_observation_ref:
        `worksheet-format-snapshot:${input.sheetName}`,
      source_observation_digest:
        createSnapshotDigest(
          input.sheetName,
          input.snapshot,
        ),
      adapter_config_digest:
        MMI_WORKSHEET_NEUTRAL_ADAPTER_CONFIG_DIGEST,
    },
  };

  assertStructuredArtifactObservation(observation);
  return observation;
}

function findNonEmptyBounds(
  snapshot: WorksheetFormatSnapshot,
): RegionBounds {
  const cells = snapshot.cells
    .filter(
      (cell) =>
        normalizedText(cell.text) !== '',
    )
    .map((cell) => ({
      row: cell.row,
      column: cell.column,
    }));

  if (cells.length === 0) {
    throw new Error(
      'MMI worksheet neutral observation requires at least one non-empty text cell.',
    );
  }

  return {
    startRow: Math.min(...cells.map((cell) => cell.row)),
    endRow: Math.max(...cells.map((cell) => cell.row)),
    startColumn:
      Math.min(...cells.map((cell) => cell.column)),
    endColumn:
      Math.max(...cells.map((cell) => cell.column)),
    nonEmptyCount: cells.length,
  };
}

function countOverlappingMerges(
  snapshot: WorksheetFormatSnapshot,
  bounds: RegionBounds,
): number {
  return (snapshot.merges ?? []).filter(
    (merge) =>
      merge.startRow <= bounds.endRow
      && bounds.startRow <= merge.endRow
      && merge.startColumn <= bounds.endColumn
      && bounds.startColumn <= merge.endColumn,
  ).length;
}

function createSnapshotDigest(
  sheetName: string,
  snapshot: WorksheetFormatSnapshot,
): string {
  const cells = snapshot.cells
    .map((cell) => [
      cell.row,
      cell.column,
      cell.text ?? null,
      cell.fillTone ?? null,
      cell.borderKind ?? null,
    ])
    .sort(
      (left, right) =>
        Number(left[0]) - Number(right[0])
        || Number(left[1]) - Number(right[1]),
    );
  const merges = [...(snapshot.merges ?? [])]
    .map((merge) => [
      merge.startRow,
      merge.startColumn,
      merge.endRow,
      merge.endColumn,
    ])
    .sort(
      (left, right) =>
        left[0] - right[0]
        || left[1] - right[1]
        || left[2] - right[2]
        || left[3] - right[3],
    );

  return sha256(JSON.stringify([
    MMI_WORKSHEET_NEUTRAL_PRODUCER_SCHEMA,
    sheetName,
    cells,
    merges,
  ]));
}

function normalizedText(
  value: string | undefined,
): string {
  return (value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ');
}

function assertDigest(
  value: string,
  label: string,
): void {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new Error(
      `MMI worksheet neutral observation ${label} must be sha256:<64 lowercase hex>.`,
    );
  }
}

function assertNonEmpty(
  label: string,
  value: string,
): void {
  if (value.trim().length === 0) {
    throw new Error(
      `MMI worksheet neutral observation ${label} must not be empty.`,
    );
  }
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256')
    .update(value, 'utf8')
    .digest('hex')}`;
}

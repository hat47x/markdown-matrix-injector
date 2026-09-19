import type {
  SourceIdentityV1,
} from '../core/sourceIdentity.js';
import {
  createContainedCognitiveObservation,
  type ContainedCognitiveObservationInput,
} from './cognitiveSourceObservation.js';
import type {
  CognitiveObservation,
} from './cognitiveContract.js';
import {
  adaptWorksheetFormatMatchToCognitiveOutcome,
  type FlyWorksheetFormatPerceptionOutcome,
} from './flyWorksheetFormatPerceptionProvider.js';
import {
  formatProfileToWorksheetPrototype,
  type FormatProfileV1,
} from './formatProfile.js';
import type {
  XlsxFormatSnapshotResult,
} from './xlsxFormatSnapshotReader.js';
import {
  matchWorksheetFormatSnapshot,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  WORKSHEET_FORMAT_FEATURE_VERSION,
  type WorksheetFormatSourceProfile,
} from './worksheetFormatPrototype.js';

export type WorksheetFormatSnapshotReader = (
  absolutePath: string,
  sheetName?: string,
) => XlsxFormatSnapshotResult;

export interface ContainedWorksheetFormatPerceptionInput {
  observationId: string;
  sourceKind: string;
  markdownFilePath: string;
  sourcePath: string;
  workspaceRoot?: string;
  sheetName?: string;
  approvedProfiles: readonly FormatProfileV1[];
  sourceProfile?: WorksheetFormatSourceProfile;
}

export interface WorksheetFormatSourceObservationPayload {
  kind: 'worksheet-format';
  sheetName: string;
}

export interface ContainedWorksheetFormatPerceptionResult {
  observation: CognitiveObservation<WorksheetFormatSourceObservationPayload>;
  sourceIdentity: SourceIdentityV1;
  resolvedPath: string;
  sheetName: string;
  perception: FlyWorksheetFormatPerceptionOutcome;
}

export function prepareContainedWorksheetFormatPerceptionWithReader(
  input: ContainedWorksheetFormatPerceptionInput,
  reader: WorksheetFormatSnapshotReader,
): ContainedWorksheetFormatPerceptionResult {
  const sourceProfile =
    input.sourceProfile ?? SHEETJS_CE_XLSX_0203_SOURCE_PROFILE;

  const prototypes = input.approvedProfiles.map((profile) =>
    formatProfileToWorksheetPrototype(profile, sourceProfile),
  );

  let snapshotResult: XlsxFormatSnapshotResult | undefined;

  const observationInput: ContainedCognitiveObservationInput = {
    id: input.observationId,
    kind: 'worksheet-format',
    schemaVersion: 'worksheet-format-observation-v1',
    sourceKind: input.sourceKind,
    markdownFilePath: input.markdownFilePath,
    sourcePath: input.sourcePath,
    ...(input.workspaceRoot === undefined
      ? {}
      : { workspaceRoot: input.workspaceRoot }),
    featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
    sourceProfileId: sourceProfile.id,
  };

  const observed = createContainedCognitiveObservation(
    observationInput,
    (resolvedPath): WorksheetFormatSourceObservationPayload => {
      snapshotResult = reader(resolvedPath, input.sheetName);
      assertSnapshotResult(snapshotResult);
      return {
        kind: 'worksheet-format',
        sheetName: snapshotResult.sheetName,
      };
    },
  );

  if (snapshotResult === undefined) {
    throw new Error(
      'Worksheet format snapshot reader did not produce a result.',
    );
  }

  const match = matchWorksheetFormatSnapshot(
    snapshotResult.snapshot,
    prototypes,
    sourceProfile,
  );

  const perception = adaptWorksheetFormatMatchToCognitiveOutcome(
    observed.observation,
    match,
  );

  return {
    observation: observed.observation,
    sourceIdentity: { ...observed.sourceIdentity },
    resolvedPath: observed.resolvedPath,
    sheetName: snapshotResult.sheetName,
    perception,
  };
}

export async function prepareContainedWorksheetFormatPerceptionWithDefaultReader(
  input: ContainedWorksheetFormatPerceptionInput,
): Promise<ContainedWorksheetFormatPerceptionResult> {
  const { readXlsxFormatSnapshot } = await import(
    './xlsxFormatSnapshotReader.js'
  );

  return prepareContainedWorksheetFormatPerceptionWithReader(
    input,
    (absolutePath, sheetName) =>
      readXlsxFormatSnapshot({
        absolutePath,
        ...(sheetName === undefined ? {} : { sheetName }),
      }),
  );
}

function assertSnapshotResult(
  result: XlsxFormatSnapshotResult,
): void {
  if (result.sheetName.trim().length === 0) {
    throw new Error(
      'Worksheet format snapshot reader must return a non-empty sheet name.',
    );
  }
  if (!result.snapshot || !Array.isArray(result.snapshot.cells)) {
    throw new Error(
      'Worksheet format snapshot reader returned an invalid snapshot.',
    );
  }
  if (
    result.snapshot.merges !== undefined
    && !Array.isArray(result.snapshot.merges)
  ) {
    throw new Error(
      'Worksheet format snapshot reader returned invalid merges.',
    );
  }
}

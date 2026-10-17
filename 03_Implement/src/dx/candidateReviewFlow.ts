import path from 'node:path';
import * as vscode from 'vscode';

import {
  buildCandidateReviewInventory,
  type CandidateReviewInventoryItem,
  type CandidateReviewInventoryOptions,
} from '../application/candidateReviewInventory.js';
import {
  candidateReviewActionPolicy,
} from '../application/candidateReviewActionPolicy.js';
import {
  availableCandidateReviewFacets,
  candidateReviewFacetFilter,
  type CandidateReviewFacetSelection,
} from '../application/candidateReviewFilter.js';
import {
  addCandidateReviewAdjustment,
  appendCandidateReviewObservation,
  candidateReviewObservationSnapshot,
  createCandidateReviewObservation,
  DEFAULT_CANDIDATE_REVIEW_OBSERVATION_FILE,
  emptyCandidateReviewAdjustmentSummary,
} from '../application/candidateReviewObservation.js';
import {
  candidateReviewSessionKey,
  remainingCandidateReviewItems,
} from '../application/candidateReviewSession.js';
import {
  CandidateReviewProviderCache,
  startCandidateReviewProviderRefresh,
  type CandidateReviewProviderLane,
} from '../application/candidateReviewProviderRefresh.js';
import {
  discardUnrecordedImageExtraction,
  discardUnrecordedTableExtraction,
  extractImages,
  extractTable,
  finalizeReviewedImageExtraction,
  finalizeReviewedTableExtraction,
} from '../cli/extract.js';
import {
  extractFlatTextTree,
  extractJsonTree,
  extractTabularHierarchyTree,
  extractXmlTree,
  extractYamlTree,
} from '../cli/extractTree.js';
import { shapeSnapshotSelection } from '../adapters/excelImageAdapter.js';
import type {
  TabularHierarchyConfig,
} from '../adapters/tabularHierarchyAdapter.js';
import type { Candidate, ReviewState } from '../core/candidate.js';
import { loadWorkbook } from '../core/workbookLoader.js';
import type { CandidateLedgerFilter } from '../core/candidateLedgerView.js';
import {
  clearReviewDecisionForCandidate,
  DEFAULT_REVIEW_DECISIONS_FILE,
  readReviewDecisions,
  recordDeferredDecision,
  recordRejectedDecision,
} from '../core/candidateReviewDecisions.js';
import { candidateReviewView } from '../core/candidateReviewView.js';
import { placeOf, readLedger } from '../core/importLedger.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';
import {
  RegionSnapshotError,
  renderLibreOfficeRegionSnapshot,
} from '../snapshot/libreOfficeRegionSnapshot.js';
import { uiText } from './uiPhrases.js';

export const REVIEW_CANDIDATES_COMMAND_ID =
  'markdownMatrixInjector.reviewCandidates';
export const REVIEW_HIERARCHY_CANDIDATES_COMMAND_ID =
  'markdownMatrixInjector.reviewHierarchyCandidates';
export const REVIEW_TABULAR_HIERARCHY_CANDIDATES_COMMAND_ID =
  'markdownMatrixInjector.reviewTabularHierarchyCandidates';

const FILTERS: readonly {
  value: CandidateLedgerFilter;
  label: string;
  description: string;
}[] = [
  {
    value: 'unimported',
    label: uiText('Not imported only'),
    description: uiText('Not imported, and candidates whose same content was imported elsewhere'),
  },
  {
    value: 'exclude-imported',
    label: uiText('Needs review'),
    description: uiText('Everything except imported (changed, recheck, duplicate, not imported)'),
  },
  {
    value: 'all',
    label: uiText('All'),
    description: uiText('All Candidates, including imported ones'),
  },
];

interface CandidateFacetQuickPickItem extends vscode.QuickPickItem {
  facet: CandidateReviewFacetSelection;
}

function facetLabel(facet: CandidateReviewFacetSelection): string {
  if (facet.axis === 'kind') {
    switch (facet.value) {
      case 'table-range':
        return uiText('$(table) Kind: table');
      case 'image':
        return uiText('$(file-media) Kind: image');
      case 'tree':
        return uiText('$(list-tree) Kind: tree');
      case 'choice-list':
        return uiText('$(list-selection) Kind: choice list');
      case 'shape':
        return uiText('$(symbol-structure) Kind: shape');
      default:
        return uiText('Kind: {0}', facet.value);
    }
  }
  if (facet.axis === 'status') {
    switch (facet.value) {
      case 'observed':
        return uiText('Origin: observed (stated in the source)');
      case 'inferred':
        return uiText('Origin: inferred');
      case 'abstained':
        return uiText('Origin: abstained (no claim)');
    }
  }
  return facet.value === 'deterministic'
    ? uiText('Execution: deterministic')
    : uiText('Execution: provider-dependent');
}

function facetDescription(
  facet: CandidateReviewFacetSelection,
): string {
  switch (facet.axis) {
    case 'kind':
      return uiText('Candidate type');
    case 'status':
      return uiText('origin / epistemic state');
    case 'execution':
      return uiText('execution characteristic');
  }
}

function facetQuickPickItem(
  facet: CandidateReviewFacetSelection,
): CandidateFacetQuickPickItem {
  return {
    label: facetLabel(facet),
    description: facetDescription(facet),
    facet,
  };
}

function workspaceRoot(sourcePath: string): string {
  return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(sourcePath))
    ?.uri.fsPath ?? path.dirname(sourcePath);
}

function reviewObservationFile(sourcePath: string): string | undefined {
  const uri = vscode.Uri.file(sourcePath);
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) return undefined;

  const enabled = vscode.workspace
    .getConfiguration('markdownMatrixInjector', uri)
    .get<boolean>('reviewObservation.enabled', false);
  return enabled
    ? path.join(
        folder.uri.fsPath,
        DEFAULT_CANDIDATE_REVIEW_OBSERVATION_FILE,
      )
    : undefined;
}

function supportedReviewSource(sourcePath: string): boolean {
  return /\.(xlsx|xlsm|xls|csv|xml|json|ya?ml|txt|text|log)$/iu.test(sourcePath);
}

async function chooseSource(target?: vscode.Uri): Promise<string | undefined> {
  if (
    target?.scheme === 'file'
    && supportedReviewSource(target.fsPath)
  ) {
    return target.fsPath;
  }
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      'MMI source': [
        'xlsx',
        'xlsm',
        'xls',
        'csv',
        'xml',
        'json',
        'yaml',
        'yml',
        'txt',
        'text',
        'log',
      ],
    },
    title: uiText('MMI: Choose the source to review Candidates from'),
  });
  return picked?.[0]?.fsPath;
}

function supportedHierarchyReviewSource(
  sourcePath: string,
  includeXml = true,
): boolean {
  return /\.(xlsx|xlsm|xls|csv)$/iu.test(sourcePath)
    || (includeXml && /\.xml$/iu.test(sourcePath));
}

async function chooseHierarchySource(
  target?: vscode.Uri,
  includeXml = true,
): Promise<string | undefined> {
  if (
    target?.scheme === 'file'
    && supportedHierarchyReviewSource(target.fsPath, includeXml)
  ) {
    return target.fsPath;
  }
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      'MMI hierarchy source': includeXml
        ? ['xlsx', 'xlsm', 'xls', 'csv', 'xml']
        : ['xlsx', 'xlsm', 'xls', 'csv'],
    },
    title: includeXml
      ? uiText('MMI: Choose the source to review hierarchy Candidates from')
      : uiText('MMI: Choose the source to review tabular-hierarchy Candidates from'),
  });
  return picked?.[0]?.fsPath;
}

interface HeaderChoice extends vscode.QuickPickItem {
  header: string;
}

interface HeaderRowChoice extends vscode.QuickPickItem {
  row: number;
}

const MAX_HIERARCHY_HEADER_ROW_CHOICES = 50;

/** The title every step of the hierarchy configuration shares. */
const AVAILABILITY_TITLE = uiText('MMI: Hierarchy Candidates');

function uniqueHeaderChoices(
  sheet: ReturnType<typeof loadWorkbook>['sheets'][string],
  row: number,
): HeaderChoice[] {
  const range = sheet.usedRange;
  if (!range) return [];
  const values: Array<{ header: string; column: number }> = [];
  for (let column = range.startCol; column <= range.endCol; column += 1) {
    const header = sheet.cellAt(row, column)?.text.trim() ?? '';
    if (header) values.push({ header, column });
  }
  const counts = new Map<string, number>();
  for (const item of values) {
    counts.set(item.header, (counts.get(item.header) ?? 0) + 1);
  }
  return values
    .filter((item) => counts.get(item.header) === 1)
    .map((item) => ({
      label: item.header,
      description: uiText('column {0}', columnName(item.column)),
      header: item.header,
    }));
}

function hierarchyHeaderRowChoices(
  sheet: ReturnType<typeof loadWorkbook>['sheets'][string],
): HeaderRowChoice[] {
  const range = sheet.usedRange;
  if (!range) return [];
  const endRow = Math.min(
    range.endRow,
    range.startRow + MAX_HIERARCHY_HEADER_ROW_CHOICES - 1,
  );
  const rows: HeaderRowChoice[] = [];
  for (let row = range.startRow; row <= endRow; row += 1) {
    const headers = uniqueHeaderChoices(sheet, row);
    if (headers.length < 2) continue;
    rows.push({
      label: uiText('row {0}', row + 1),
      description: headers
        .slice(0, 5)
        .map((item) => item.header)
        .join(' · '),
      detail: headers.length > 5
        ? uiText('{0} unique headers (the first 5 are shown)', headers.length)
        : uiText('{0} unique headers', headers.length),
      row,
    });
  }
  return rows;
}

function columnName(index: number): string {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

async function chooseHierarchyConfig(
  sourcePath: string,
): Promise<
  | {
      sheet: string;
      config: TabularHierarchyConfig;
    }
  | undefined
> {
  let workbook: ReturnType<typeof loadWorkbook>;
  try {
    workbook = loadWorkbook({ absolutePath: sourcePath });
  } catch (error) {
    await vscode.window.showErrorMessage(
      uiText('MMI: This source cannot be used for the tabular hierarchy review: {0}', error instanceof Error ? error.message : String(error)),
    );
    return undefined;
  }

  const sheetNames = Object.keys(workbook.sheets);
  if (sheetNames.length === 0) {
    await vscode.window.showInformationMessage(
      uiText('MMI: No sheet can produce a hierarchy Candidate.'),
    );
    return undefined;
  }

  const sheet = sheetNames.length === 1
    ? sheetNames[0]
    : (await vscode.window.showQuickPick(
        sheetNames.map((name) => ({ label: name, sheet: name })),
        {
          placeHolder: uiText('Choose the sheet to review as a hierarchy'),
          title: AVAILABILITY_TITLE,
        },
      ))?.sheet;
  if (!sheet) return undefined;

  const sheetSource = workbook.sheets[sheet];
  const headerRows = hierarchyHeaderRowChoices(sheetSource);
  if (headerRows.length === 0) {
    await vscode.window.showInformationMessage(
      uiText('MMI: Within the first {0} used rows, no row has two or more headers that can be named uniquely. Duplicated headers are not guessed as hierarchy columns.', MAX_HIERARCHY_HEADER_ROW_CHOICES),
    );
    return undefined;
  }
  const headerRow = headerRows.length === 1
    ? headerRows[0].row
    : (await vscode.window.showQuickPick(headerRows, {
        placeHolder: uiText('Choose the header row'),
        title: AVAILABILITY_TITLE,
      }))?.row;
  if (headerRow === undefined) return undefined;

  const headers = uniqueHeaderChoices(sheetSource, headerRow);

  const mode = await vscode.window.showQuickPick(
    [
      {
        label: uiText('Build the hierarchy with a parent-ID column'),
        description: uiText('State the ID column and the parent-ID column to make the parent-child relation'),
        mode: 'parent-id' as const,
      },
      {
        label: uiText('Build the hierarchy with a Level column'),
        description: uiText('State the Level column and the display-name column to make the parent-child relation'),
        mode: 'level' as const,
      },
    ],
    {
      placeHolder: uiText('Choose how the hierarchy is expressed'),
      title: AVAILABILITY_TITLE,
    },
  );
  if (!mode) return undefined;

  if (mode.mode === 'parent-id') {
    const id = await vscode.window.showQuickPick(headers, {
      placeHolder: uiText('Choose the ID column'),
      title: AVAILABILITY_TITLE,
    });
    if (!id) return undefined;
    const parent = await vscode.window.showQuickPick(
      headers.filter((item) => item.header !== id.header),
      {
        placeHolder: uiText('Choose the parent-ID column'),
        title: AVAILABILITY_TITLE,
      },
    );
    if (!parent) return undefined;

    const label = await vscode.window.showQuickPick(
      [
        {
          label: uiText('(Use the ID column as the display name)'),
          description: uiText('Do not name a separate display-name column'),
          header: undefined as string | undefined,
        },
        ...headers
          .filter(
            (item) =>
              item.header !== id.header
              && item.header !== parent.header,
          )
          .map((item) => ({
            ...item,
            header: item.header as string | undefined,
          })),
      ],
      {
        placeHolder: uiText('Choose the display-name column (optional)'),
        title: AVAILABILITY_TITLE,
      },
    );
    if (!label) return undefined;

    return {
      sheet,
      config: {
        mode: 'parent-id',
        headerRow,
        idHeader: id.header,
        parentHeader: parent.header,
        ...(label.header ? { labelHeader: label.header } : {}),
      },
    };
  }

  const level = await vscode.window.showQuickPick(headers, {
    placeHolder: uiText('Choose the Level column'),
    title: AVAILABILITY_TITLE,
  });
  if (!level) return undefined;
  const label = await vscode.window.showQuickPick(
    headers.filter((item) => item.header !== level.header),
    {
      placeHolder: uiText('Choose the display-name column'),
      title: AVAILABILITY_TITLE,
    },
  );
  if (!label) return undefined;

  return {
    sheet,
    config: {
      mode: 'level',
      headerRow,
      levelHeader: level.header,
      labelHeader: label.header,
    },
  };
}

function stateLabel(state: string): string {
  switch (state) {
    case 'imported':
      return uiText('imported');
    case 'changed':
      return uiText('changed');
    case 'stale':
      return uiText('recheck');
    case 'duplicate':
      return uiText('duplicate exists');
    default:
      return uiText('not imported');
  }
}

function reviewStateLabel(
  state: Extract<
    ReviewState,
    'unreviewed' | 'accepted' | 'modified' | 'rejected' | 'deferred'
  >,
): string {
  switch (state) {
    case 'accepted':
      return uiText('accepted');
    case 'modified':
      return uiText('modified');
    case 'rejected':
      return uiText('rejected');
    case 'deferred':
      return uiText('deferred');
    case 'unreviewed':
      return uiText('unreviewed');
  }
}

/** `state · Review: reviewState · tail` in the reader language. */
function reviewDescription(
  ledgerState: string,
  reviewState: ReturnType<typeof reviewStateLabel>,
  tail: string,
): string {
  return uiText('{0} · Review: {1} · {2}', ledgerState, reviewState, tail);
}

function epistemicDetail(candidate: Candidate): string {
  const inferred = candidate.claims.filter(
    (claim) => claim.status === 'inferred',
  );
  return [
    uiText('Origin: {0} · Execution: {1} · Method: {2}', candidate.status, candidate.execution, candidate.method),
    inferred.length > 0
      ? uiText('Inferred: {0}', inferred
          .map((claim) =>
            `${claim.aspect}=${Array.isArray(claim.value)
              ? claim.value.join(', ')
              : String(claim.value ?? '')}`)
          .join(', '))
      : uiText('No inferences'),
  ].join(' · ');
}

function quickPickItem(
  source: CandidateReviewInventoryItem,
  ledgerState: string,
  reviewState: Extract<
    ReviewState,
    'unreviewed' | 'accepted' | 'modified' | 'rejected' | 'deferred'
  >,
  rejected: boolean,
  deferred: boolean,
  researchScores: readonly {
    provider: string;
    scale: string;
    value: number;
  }[],
) {
  const providerEvidence = researchScores.length > 0
    ? `provider evidence: ${researchScores
        .map((score) =>
          `${score.provider}/${score.scale}=${score.value}`)
        .join(', ')}`
    : uiText('no provider scores');

  if (source.kind === 'tree') {
    const pointer = source.pointer || uiText('(root)');
    return {
      label: `$(list-tree) ${pointer}`,
      description:
        reviewDescription(
          stateLabel(ledgerState),
          reviewStateLabel(reviewState),
          `${source.format.toUpperCase()} Tree${source.method ? ` · ${source.method}` : ''}`,
        ),
      detail: [
        epistemicDetail(source.candidate),
        `${source.nodeType} · ${source.childCount} children · ${source.leafCount} scalar children`,
        providerEvidence,
      ].join(' · '),
      source,
      rejected,
      deferred,
      reviewState,
      ledgerState,
    };
  }

  if (source.kind === 'image') {
    const image = source.image;
    return {
      label:
        `$(file-media) ${image.description
          ?? image.name
          ?? uiText('Image {0}', image.ordinal)}`,
      description:
        reviewDescription(
          stateLabel(ledgerState),
          reviewStateLabel(reviewState),
          `${image.sheet}${image.range ? ` ${image.range}` : ''}`,
        ),
      detail: [
        epistemicDetail(source.candidate),
        `${image.format.toUpperCase()} · ${image.bytes} bytes`,
        providerEvidence,
      ].join(' · '),
      source,
      rejected,
      deferred,
      reviewState,
      ledgerState,
    };
  }

  if (source.kind === 'shape') {
    const shape = source.shape;
    const text = shape.textRuns.length > 0
      ? shape.textRuns.join(' / ')
      : uiText('no text inside the shape');
    return {
      label:
        `$(symbol-structure) ${shape.name
          ?? (shape.objectKind === 'connector'
            ? uiText('Connector {0}', shape.ordinal)
            : uiText('Shape {0}', shape.ordinal))}`,
      description:
        reviewDescription(
          stateLabel(ledgerState),
          reviewStateLabel(reviewState),
          `${shape.sheet}${shape.range ? ` ${shape.range}` : ''}`,
        ),
      detail: [
        epistemicDetail(source.candidate),
        shape.objectKind === 'connector' ? 'connector' : 'AutoShape',
        shape.presetGeometry ?? uiText('no geometry'),
        text,
        providerEvidence,
      ].join(' · '),
      source,
      rejected,
      deferred,
      reviewState,
      ledgerState,
    };
  }

  if (source.kind === 'choice-list') {
    const choice = source.choiceList;
    const values = choice.choices
      ? uiText('{0} values: {1}', choice.choices.length, `${choice.choices.slice(0, 6).join(', ')}${choice.choices.length > 6 ? ', …' : ''}`)
      : choice.formula1
        ? uiText('Formula: {0} (the values are unresolved)', choice.formula1)
        : uiText('could not read the source');
    return {
      label: uiText('$(list-selection) Choice list {0}', choice.range),
      description:
        reviewDescription(
          stateLabel(ledgerState),
          reviewStateLabel(reviewState),
          `${choice.sheet} ${choice.range}`,
        ),
      detail: [
        epistemicDetail(source.candidate),
        values,
        choice.allowBlank ? uiText('blank allowed') : uiText('blank not allowed'),
        providerEvidence,
      ].join(' · '),
      source,
      rejected,
      deferred,
      reviewState,
      ledgerState,
    };
  }

  if (source.kind === 'note') {
    const note = source.note;
    return {
      label: `$(note) Note ${note.cell}`,
      description:
        reviewDescription(
          stateLabel(ledgerState),
          reviewStateLabel(reviewState),
          `${note.sheet} ${note.cell}${note.author !== undefined ? ` · ${note.author}` : ''}`,
        ),
      detail: [
        epistemicDetail(source.candidate),
        note.text || uiText('(empty note)'),
        providerEvidence,
      ].join(' · '),
      source,
      rejected,
      deferred,
      reviewState,
      ledgerState,
    };
  }

  return {
    label:
      `$(table) ${source.title ?? `${source.sheet} ${source.range}`}`,
    description:
      reviewDescription(
        stateLabel(ledgerState),
        reviewStateLabel(reviewState),
        `${source.sheet} ${source.range}`,
      ),
    detail: [
      epistemicDetail(source.candidate),
      providerEvidence,
    ].join(' · '),
    source,
    rejected,
    deferred,
    reviewState,
    ledgerState,
  };
}

export interface ReviewCandidatesOptions {
  inventory?: CandidateReviewInventoryOptions;
  /**
   * Slow/model-backed Candidate producers. Review opens from deterministic
   * items and memory-cached provider results; these lanes refresh in the
   * background and never gate the current session.
   */
  providerLanes?: readonly CandidateReviewProviderLane[];
  /** Dependency injection for tests/hosts. Defaults to the extension cache. */
  providerCache?: CandidateReviewProviderCache;
}

const reviewProviderCache = new CandidateReviewProviderCache();

async function reviewConfiguredHierarchy(
  target: vscode.Uri | undefined,
  includeXml: boolean,
): Promise<void> {
  const sourcePath = await chooseHierarchySource(target, includeXml);
  if (!sourcePath) return;
  const hierarchy = await chooseHierarchyConfig(sourcePath);
  if (!hierarchy) return;
  await reviewCandidates(vscode.Uri.file(sourcePath), {
    inventory: { tabularHierarchy: hierarchy, hierarchyOnly: true },
  });
}

export async function reviewHierarchyCandidates(
  target?: vscode.Uri,
): Promise<void> {
  await reviewConfiguredHierarchy(target, true);
}

export async function reviewTabularHierarchyCandidates(
  target?: vscode.Uri,
): Promise<void> {
  await reviewConfiguredHierarchy(target, false);
}

export async function reviewCandidates(
  target?: vscode.Uri,
  options: ReviewCandidatesOptions = {},
): Promise<void> {
  const sourcePath = await chooseSource(target);
  if (!sourcePath) return;

  const root = workspaceRoot(sourcePath);
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const reviewDecisionsPath = path.join(
    root,
    DEFAULT_REVIEW_DECISIONS_FILE,
  );
  const sourceLabel =
    path.relative(root, sourcePath).split(path.sep).join('/')
    || path.basename(sourcePath);

  let inventory;
  try {
    inventory = buildCandidateReviewInventory(
      sourcePath,
      sourceLabel,
      options.inventory,
    );
  } catch (error) {
    await vscode.window.showErrorMessage(
      uiText('MMI: Could not read the Candidates: {0}', error instanceof Error
        ? error.message
        : String(error)),
    );
    return;
  }

  if (inventory.tabularHierarchyAbstention) {
    const detail = inventory.tabularHierarchyAbstention.evidence.length > 0
      ? `: ${inventory.tabularHierarchyAbstention.evidence.join(' / ')}`
      : '';
    await vscode.window.showWarningMessage(
      uiText('MMI: A Tree Candidate could not be finalized from the given hierarchy columns ({0}){1}', inventory.tabularHierarchyAbstention.reasonCode, detail),
    );
    if (
      options.inventory?.hierarchyOnly
      && inventory.items.length === 0
    ) {
      return;
    }
  }

  const imageErrors = inventory.imageDiagnostics.filter(
    (item) => item.severity === 'error',
  );
  if (imageErrors.length > 0) {
    await vscode.window.showWarningMessage(
      uiText('MMI: Some image Candidates could not be read: {0}. The other available Candidates can still be reviewed.', imageErrors
        .map((item) => item.message)
        .join(' / ')),
    );
  }

  const choiceListProblems = inventory.choiceListDiagnostics ?? [];
  if (choiceListProblems.length > 0) {
    await vscode.window.showWarningMessage(
      uiText('MMI: Choice-list Candidates need review: {0}. The Candidates that could be read can still be reviewed.', choiceListProblems
        .map((item) =>
          `${item.sheet ? `${item.sheet}: ` : ''}${item.message}`)
        .join(' / ')),
    );
  }

  const noteProblems = inventory.noteDiagnostics ?? [];
  if (noteProblems.length > 0) {
    await vscode.window.showWarningMessage(
      uiText('MMI: Note Candidates need review: {0}. The Candidates that could be read can still be reviewed.', noteProblems
        .map((item) =>
          `${item.sheet ? `${item.sheet}${item.cell ? `!${item.cell}` : ''}: ` : ''}${item.message}`)
        .join(' / ')),
    );
  }

  const providerLanes = options.providerLanes ?? [];
  const providerCache = options.providerCache ?? reviewProviderCache;
  const sourceDigest = inventory.items[0]?.candidate.locator.sourceDigest
    ?? readSourceFileIdentity(sourcePath).digest;
  const providerRefresh = startCandidateReviewProviderRefresh(
    { sourcePath, sourceLabel, sourceDigest },
    providerLanes,
    providerCache,
  );
  // Current review uses only deterministic + already-cached provider output.
  // Newly generated provider results never mutate an open QuickPick session.
  const reviewItems = [
    ...inventory.items,
    ...providerRefresh.cachedItems,
  ];
  if (providerLanes.length > 0) {
    void providerRefresh.settled.then((summary) => {
      if (summary.completedProviders.length > 0) {
        void vscode.window.setStatusBarMessage(
          uiText('MMI: Provider Candidates are ready ({0}). They take effect at the next review.', summary.cachedItemCount),
          5000,
        );
      }
      if (summary.failedProviders.length > 0) {
        void vscode.window.setStatusBarMessage(
          uiText('MMI: Could not fetch {0} provider lanes. Editing can continue.', summary.failedProviders.length),
          5000,
        );
      }
    });
  }

  if (reviewItems.length === 0) {
    if (providerLanes.length > 0) {
      void vscode.window.setStatusBarMessage(
        uiText('MMI: No immediate Candidates. Provider Candidates are being prepared in the background.'),
        5000,
      );
    } else {
      await vscode.window.showInformationMessage(
        uiText('MMI: This source has no Candidates to review.'),
      );
    }
    return;
  }

  const byKey = new Map(
    reviewItems.map((item) => [candidateReviewSessionKey(item.candidate), item]),
  );
  let ledger: ReturnType<typeof readLedger>;
  let reviewDecisions: ReturnType<typeof readReviewDecisions>;
  try {
    ledger = readLedger(ledgerPath);
    reviewDecisions = readReviewDecisions(reviewDecisionsPath);
  } catch (error) {
    await vscode.window.showErrorMessage(
      uiText('MMI: Could not read the review state: {0}', error instanceof Error
        ? error.message
        : String(error)),
    );
    return;
  }

  const filterChoice = await vscode.window.showQuickPick(FILTERS, {
    title: uiText('MMI: Candidate review'),
    placeHolder: uiText('Choose the Candidates to show'),
  });
  if (!filterChoice) return;

  const initialView = candidateReviewView(
    reviewItems.map((item) => item.candidate),
    ledger,
    reviewDecisions,
    ledgerPath,
    reviewDecisionsPath,
    sourcePath,
    filterChoice.value,
  );
  if (initialView.length === 0) {
    await vscode.window.showInformationMessage(
      uiText('MMI: No Candidates match the condition.'),
    );
    return;
  }

  const facetOptions = availableCandidateReviewFacets(
    initialView.map((item) => item.candidate),
  ).map(facetQuickPickItem);
  const selectedFacets = await vscode.window.showQuickPick(
    facetOptions,
    {
      canPickMany: true,
      title: uiText('MMI: Candidate review — narrowing'),
      placeHolder:
        uiText('Choose only the conditions you need (OR within an axis, AND across axes, all values for an untouched axis)'),
      matchOnDescription: true,
    },
  );
  if (selectedFacets === undefined) return;

  const facetFilter = candidateReviewFacetFilter(
    selectedFacets.map((item) => item.facet),
  );
  const processedKeys = new Set<string>();
  const sessionMarkdownEditor =
    vscode.window.activeTextEditor?.document.languageId === 'markdown'
    && vscode.window.activeTextEditor.document.uri.scheme === 'file'
      ? vscode.window.activeTextEditor
      : undefined;
  const observationFile = reviewObservationFile(sourcePath);
  const observationStartedAtUtc = new Date().toISOString();
  const observationInitial = observationFile
    ? candidateReviewObservationSnapshot(
        initialView,
        facetFilter,
      )
    : undefined;
  let selectedCount = 0;
  let reviewAdjustments = emptyCandidateReviewAdjustmentSummary();

  try {
  for (;;) {
    try {
      ledger = readLedger(ledgerPath);
      reviewDecisions = readReviewDecisions(reviewDecisionsPath);
    } catch (error) {
      await vscode.window.showErrorMessage(
        uiText('MMI: Could not reload the review state: {0}', error instanceof Error
          ? error.message
          : String(error)),
      );
      return;
    }

    const view = candidateReviewView(
      reviewItems.map((item) => item.candidate),
      ledger,
      reviewDecisions,
      ledgerPath,
      reviewDecisionsPath,
      sourcePath,
      filterChoice.value,
    );
    const filteredView = remainingCandidateReviewItems(
      view,
      facetFilter,
      processedKeys,
    );
    if (filteredView.length === 0) {
      await vscode.window.showInformationMessage(
        processedKeys.size > 0
          ? uiText('MMI: The review of this condition is complete.')
          : uiText('MMI: No Candidates match the narrowing condition.'),
      );
      return;
    }

    const picked = await vscode.window.showQuickPick(
      filteredView.flatMap((item) => {
      const source = byKey.get(candidateReviewSessionKey(item.candidate));
      return source
        ? [
            quickPickItem(
              source,
              item.ledgerState,
              item.reviewState,
              item.rejected,
              item.deferred,
              item.researchScores,
            ),
          ]
        : [];
    }),
      {
        title: uiText('MMI: Candidate review'),
        placeHolder:
          uiText('Choose a Candidate ({0} remaining. Esc ends the review)', filteredView.length),
        matchOnDescription: true,
        matchOnDetail: true,
      },
    );
    if (!picked) return;
    selectedCount += 1;
    const actionPolicy = candidateReviewActionPolicy(picked.source);
    const canUseDeterministicExtract =
      actionPolicy.extraction === 'deterministic-extract';

  if (
    picked.source.kind === 'image'
    && !picked.source.image.extractable
  ) {
    await vscode.window.showWarningMessage(
      uiText('MMI: {0} cannot be taken into Markdown. The Candidate is review-only.', picked.source.image.format),
    );
    processedKeys.add(candidateReviewSessionKey(picked.source.candidate));
    continue;
  }

  const shapeSnapshot =
    picked.source.kind === 'shape'
      ? shapeSnapshotSelection(picked.source.shape)
      : undefined;
  const canSnapshotShape =
    Boolean(shapeSnapshot)
    && picked.source.candidate.execution === 'deterministic';

  const action = await vscode.window.showQuickPick(
    [
      ...(picked.source.kind === 'choice-list'
        ? [{
            label: uiText('Review only, then next'),
            value: 'next' as const,
            description:
              uiText('Leaves the Excel input rule unconverted; confirms what was observed and moves on'),
          }]
        : picked.source.kind === 'shape'
          ? [
              {
                label: uiText('Review only, then next'),
                value: 'next' as const,
                description:
                  actionPolicy.reason
                  ?? uiText('Leaves the shape unconverted; confirms what could be read from the source and moves on'),
              },
              ...(canSnapshotShape
                ? [{
                    label: uiText('Render this range as an image'),
                    value: 'snapshot-shape' as const,
                    description:
                      uiText('Renders the deterministic two-cell-anchor range as a region-snapshot and records it as another Candidate in the ledger'),
                  }]
                : []),
            ]
          : canUseDeterministicExtract
            ? [{
                label: uiText('Import'),
                value: 'extract' as const,
                description: uiText('Records it into the standard assets and the ledger through the existing deterministic extract path'),
              }]
            : [{
                label: uiText('Review only, then next'),
                value: 'next' as const,
                description:
                  actionPolicy.reason
                  ?? uiText('This Candidate cannot be imported within the current Authority boundary'),
              }]),
      ...(picked.source.kind === 'tree' && canUseDeterministicExtract
        ? [{
            label: uiText('Review only, then next'),
            value: 'next' as const,
            description: uiText('Leaves the tree unimported; confirms it and moves on'),
          }]
        : []),
      ...(canUseDeterministicExtract && picked.source.kind === 'table'
        ? [{
            label: uiText('Edit and import'),
            value: 'extract-modified' as const,
            description:
              uiText('Edits the extracted Markdown table and records the edited version in the ledger'),
          }]
        : canUseDeterministicExtract && picked.source.kind === 'image'
          ? [{
              label: uiText('Fix the description and import'),
              value: 'extract-modified-image' as const,
              description:
                uiText('Keeps the image bytes and the source untouched; records the manually fixed alt text in the ledger'),
            }]
          : []),
      ...(picked.ledgerState === 'imported'
        ? []
        : [
            ...(picked.rejected
              ? [{
                  label: uiText('Lift the rejection'),
                  value: 'clear-decision' as const,
                  description: uiText('Puts this Candidate back into the normal review'),
                }]
              : picked.deferred
                ? [{
                    label: uiText('Lift the deferral'),
                    value: 'clear-decision' as const,
                    description: uiText('Puts this Candidate back into the normal review'),
                  }]
                : [
                    {
                      label: uiText('Reject'),
                      value: 'reject' as const,
                      description:
                        uiText('Candidates with the same content and basis stay hidden until the source changes'),
                    },
                    {
                      label: uiText('Defer'),
                      value: 'defer' as const,
                      description:
                        uiText('Temporarily keeps Candidates with the same content and basis out of the normal review'),
                    },
                  ]),
          ]),
    ],
    {
      title: uiText('MMI: What to do with this Candidate'),
      placeHolder: uiText('The source book is not changed'),
    },
  );
  if (!action) continue;

  if (
    !canUseDeterministicExtract
    && (
      action.value === 'extract'
      || action.value === 'extract-modified'
      || action.value === 'extract-modified-image'
    )
  ) {
    await vscode.window.showErrorMessage(
      uiText('MMI: Provider-dependent Candidates are not bound to a deterministic re-verification of the source, so this path cannot import them.'),
    );
    processedKeys.add(candidateReviewSessionKey(picked.source.candidate));
    continue;
  }

  if (action.value === 'next') {
    processedKeys.add(candidateReviewSessionKey(picked.source.candidate));
    continue;
  }

  if (action.value === 'reject' || action.value === 'defer') {
    try {
      if (action.value === 'reject') {
        recordRejectedDecision(
          reviewDecisionsPath,
          sourcePath,
          picked.source.candidate,
          'MMI Candidate review UI',
        );
      } else {
        recordDeferredDecision(
          reviewDecisionsPath,
          sourcePath,
          picked.source.candidate,
          'MMI Candidate review UI',
        );
      }
    } catch (error) {
      await vscode.window.showErrorMessage(
        uiText('MMI: Could not save the {0} decision: {1}', action.value === 'reject' ? uiText('reject') : uiText('defer'),
          error instanceof Error ? error.message : String(error)),
      );
      return;
    }
    await vscode.window.showInformationMessage(
      action.value === 'reject'
        ? uiText('MMI: The Candidate is rejected. It shows again when its content or the basis of the decision changes.')
        : uiText('MMI: The Candidate is deferred. It leaves the normal review and can be lifted from the Show all view.'),
    );
    processedKeys.add(candidateReviewSessionKey(picked.source.candidate));
    continue;
  }

  if (action.value === 'clear-decision') {
    try {
      clearReviewDecisionForCandidate(
        reviewDecisionsPath,
        sourcePath,
        picked.source.candidate,
      );
    } catch (error) {
      await vscode.window.showErrorMessage(
        uiText('MMI: Could not clear the review state: {0}',
          error instanceof Error ? error.message : String(error)),
      );
      return;
    }
    await vscode.window.showInformationMessage(
      uiText('MMI: The review state of the Candidate is cleared.'),
    );
    continue;
  }

  if (
    action.value === 'snapshot-shape'
    && picked.source.kind === 'shape'
  ) {
    const selection = shapeSnapshotSelection(picked.source.shape);
    if (!selection) {
      await vscode.window.showErrorMessage(
        uiText('MMI: This shape cannot be rendered as an image automatically because its last cell cannot be determined safely.'),
      );
      continue;
    }

    const active = sessionMarkdownEditor;
    const markdownDocument =
      active?.document.languageId === 'markdown'
        ? active.document.uri.fsPath
        : undefined;
    let snapshot;
    try {
      snapshot = await renderLibreOfficeRegionSnapshot({
        sourcePath,
        sourceLabel,
        sheet: selection.sheet,
        range: selection.range,
        outDir: path.join(root, 'assets', 'snapshots'),
        ledgerPath,
        ...(markdownDocument
          ? { fromDocument: markdownDocument }
          : {}),
      });
    } catch (error) {
      const detail = error instanceof RegionSnapshotError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);
      await vscode.window.showErrorMessage(
        uiText('MMI: Could not render the shape range as an image: {0}', detail),
      );
      continue;
    }

    if (active?.document.languageId === 'markdown') {
      const insert = await vscode.window.showQuickPick(
        [
          {
            label: uiText('Also insert into the Markdown'),
            value: true,
            description:
              uiText('Inserts the snapshot image reference and provenance at the current cursor position'),
          },
          {
            label: uiText('Render only'),
            value: false,
            description:
              uiText('Creates only the region-snapshot assets and the ledger; the body text is not changed'),
          },
        ],
        { title: uiText('MMI: Rendering the shape range as an image is done') },
      );
      if (insert?.value) {
        const targetEditor = await vscode.window.showTextDocument(
          active.document,
          active.viewColumn,
        );
        const insertAt = targetEditor.selection.active;
        const insertedText = `${snapshot.markdown}\n`;
        const edited = await targetEditor.edit((edit) =>
          edit.insert(insertAt, insertedText));
        if (edited) {
          const endOffset =
            targetEditor.document.offsetAt(insertAt)
            + insertedText.length;
          const end = targetEditor.document.positionAt(endOffset);
          targetEditor.selection = new vscode.Selection(end, end);
          targetEditor.revealRange(new vscode.Range(end, end));
        }
      }
    }

    await vscode.window.showInformationMessage(
      uiText('MMI: The shape range is rendered as an image at {0} and recorded into mmi-ledger.json as a region-snapshot. The review state of the Shape Candidate itself is not changed.', path.relative(root, snapshot.pngFile)),
    );
    processedKeys.add(
      candidateReviewSessionKey(picked.source.candidate),
    );
    continue;
  }

  if (
    picked.source.kind === 'choice-list'
    || picked.source.kind === 'shape'
  ) {
    await vscode.window.showErrorMessage(
      picked.source.kind === 'choice-list'
        ? uiText('MMI: Choice-list Candidates do not become Extracted assets yet. Only review, reject, and defer are available.')
        : uiText('MMI: Shape Candidates do not become Extracted assets yet. Only review, reject, and defer are available.'),
    );
    processedKeys.add(candidateReviewSessionKey(picked.source.candidate));
    continue;
  }

  const active = sessionMarkdownEditor;
  const markdownDocument =
    active?.document.languageId === 'markdown'
      ? active.document.uri.fsPath
      : undefined;
  const outDir = path.join(root, 'assets');

  let extractedMarkdown: string;
  let extractedFile: string;
  if (
    action.value === 'extract-modified-image'
    && picked.source.kind === 'image'
  ) {
    const draft = extractImages({
      sourcePath,
      selection: String(picked.source.image.ordinal),
      outDir,
      ...(markdownDocument
        ? { fromDocument: markdownDocument }
        : {}),
      sourceLabel,
      expectedCandidate: picked.source.candidate,
    });
    if (
      draft.problems.length > 0
      || draft.extracted.length !== 1
    ) {
      await vscode.window.showErrorMessage(
        uiText('MMI: Could not create the image reference for editing: {0}', draft.problems
          .map((problem) => problem.message)
          .join(' / ') || uiText('could not extract the image uniquely')),
      );
      return;
    }

    const draftImage = draft.extracted[0];
    const editedAltText = await vscode.window.showInputBox({
      title: uiText('MMI: Fix the image description'),
      prompt:
        uiText('The image bytes and the source book are not changed. Only the alt text in the Markdown is edited.'),
      value: draftImage.altText,
      placeHolder: uiText('image description'),
    });
    if (editedAltText === undefined) {
      discardUnrecordedImageExtraction(draftImage);
      continue;
    }

    const finalized = finalizeReviewedImageExtraction({
      sourcePath,
      ledgerPath,
      extracted: draftImage,
      candidate: picked.source.candidate,
      altText: editedAltText,
      ...(markdownDocument
        ? { fromDocument: markdownDocument }
        : {}),
      sourceLabel,
      basis: 'MMI Candidate review UI: reviewed image alt text',
    });
    if (finalized.problems.length > 0 || !finalized.extracted) {
      discardUnrecordedImageExtraction(draftImage);
      await vscode.window.showErrorMessage(
        uiText('MMI: Could not adopt the fixed image: {0}', finalized.problems
          .map((problem) => problem.message)
          .join(' / ')),
      );
      return;
    }
    if (finalized.extracted.reviewState === 'modified') {
      reviewAdjustments = addCandidateReviewAdjustment(
        reviewAdjustments,
        'imageAlt',
        finalized.extracted.reviewAdjustment,
      );
    }
    extractedMarkdown = finalized.extracted.markdown;
    extractedFile = finalized.extracted.file;
  } else if (
    action.value === 'extract-modified'
    && picked.source.kind === 'table'
  ) {
    const draft = extractTable({
      sourcePath,
      sheet: picked.source.sheet,
      range: picked.source.range,
      outDir,
      ...(markdownDocument
        ? { fromDocument: markdownDocument }
        : {}),
      sourceLabel,
      expectedCandidate: picked.source.candidate,
    });
    if (draft.problems.length > 0 || !draft.extracted) {
      await vscode.window.showErrorMessage(
        uiText('MMI: Could not create the table for editing: {0}', draft.problems
          .map((problem) => problem.message)
          .join(' / ')),
      );
      return;
    }

    const reviewDocument = await vscode.workspace.openTextDocument({
      content: draft.extracted.markdown,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(
      reviewDocument,
      { preview: false },
    );
    const adoptButton = uiText('Adopt the fixes');
    const reviewAction = await vscode.window.showInformationMessage(
      uiText('MMI: Fix the table into the shape you need. When you are done, choose "{0}" to record the fixed version and its provenance without changing the source book.', adoptButton),
      adoptButton,
      uiText('Cancel'),
    );
    if (reviewAction !== adoptButton) {
      discardUnrecordedTableExtraction(draft.extracted);
      continue;
    }

    const finalized = finalizeReviewedTableExtraction({
      sourcePath,
      outDir,
      ledgerPath,
      extracted: draft.extracted,
      editedMarkdown: reviewDocument.getText(),
      candidate: picked.source.candidate,
      ...(markdownDocument
        ? { fromDocument: markdownDocument }
        : {}),
      sourceLabel,
      basis: 'MMI Candidate review UI: reviewed table output',
    });
    if (finalized.problems.length > 0 || !finalized.extracted) {
      discardUnrecordedTableExtraction(draft.extracted);
      await vscode.window.showErrorMessage(
        uiText('MMI: Could not adopt the fixed version: {0}', finalized.problems
          .map((problem) => problem.message)
          .join(' / ')),
      );
      return;
    }
    if (finalized.extracted.reviewState === 'modified') {
      reviewAdjustments = addCandidateReviewAdjustment(
        reviewAdjustments,
        'table',
        finalized.extracted.reviewAdjustment,
      );
    }
    extractedMarkdown = finalized.extracted.markdown;
    extractedFile = finalized.extracted.file;
  } else if (picked.source.kind === 'image') {
    const result = extractImages({
      sourcePath,
      selection: String(picked.source.image.ordinal),
      outDir,
      ...(markdownDocument
        ? { fromDocument: markdownDocument }
        : {}),
      sourceLabel,
      ledgerPath,
      expectedCandidate: picked.source.candidate,
    });
    if (
      result.problems.length > 0
      || result.extracted.length !== 1
    ) {
      await vscode.window.showErrorMessage(
        uiText('MMI: Could not import: {0}', result.problems
          .map((problem) => problem.message)
          .join(' / ')),
      );
      return;
    }
    extractedMarkdown = result.extracted[0].markdown;
    extractedFile = result.extracted[0].file;
  } else if (picked.source.kind === 'tree') {
    const commonTreeOptions = {
      sourcePath,
      pointer: picked.source.pointer,
      outDir,
      ...(markdownDocument
        ? { fromDocument: markdownDocument }
        : {}),
      sourceLabel,
      ledgerPath,
      expectedCandidateFingerprint:
        picked.source.candidate.fingerprint.digest,
    };
    const result = picked.source.format === 'tabular'
      ? extractTabularHierarchyTree({
          ...commonTreeOptions,
          sheet: picked.source.sheet!,
          config: picked.source.tabularHierarchy!,
        })
      : picked.source.format === 'xml'
        ? extractXmlTree(commonTreeOptions)
        : picked.source.format === 'yaml'
          ? extractYamlTree(commonTreeOptions)
          : picked.source.format === 'text'
            ? extractFlatTextTree(commonTreeOptions)
            : extractJsonTree(commonTreeOptions);
    if (result.problems.length > 0 || !result.extracted) {
      await vscode.window.showErrorMessage(
        uiText('MMI: Could not import: {0}', result.problems
          .map((problem) => problem.message)
          .join(' / ')),
      );
      return;
    }
    extractedMarkdown = result.extracted.markdown;
    extractedFile = result.extracted.file;
  } else if (picked.source.kind === 'table') {
    const result = extractTable({
      sourcePath,
      sheet: picked.source.sheet,
      range: picked.source.range,
      outDir,
      ...(markdownDocument
        ? { fromDocument: markdownDocument }
        : {}),
      sourceLabel,
      ledgerPath,
      expectedCandidate: picked.source.candidate,
    });
    if (result.problems.length > 0 || !result.extracted) {
      await vscode.window.showErrorMessage(
        uiText('MMI: Could not import: {0}', result.problems
          .map((problem) => problem.message)
          .join(' / ')),
      );
      return;
    }
    extractedMarkdown = result.extracted.markdown;
    extractedFile = result.extracted.file;
  } else {
    // Note candidates are review-only (candidateReviewActionPolicy), so the
    // action list never offers an extract action for them and this branch is
    // not reached. The explicit guard keeps the table-only fields narrowed.
    await vscode.window.showErrorMessage(
      uiText('MMI: Excel Notes do not become Extracted assets yet. Only review, reject, and defer are available.'),
    );
    processedKeys.add(candidateReviewSessionKey(picked.source.candidate));
    continue;
  }

  try {
    clearReviewDecisionForCandidate(
      reviewDecisionsPath,
      sourcePath,
      picked.source.candidate,
    );
  } catch (error) {
    await vscode.window.showWarningMessage(
      uiText('MMI: The import is done, but the old review state could not be cleared: {0}',
        error instanceof Error ? error.message : String(error)),
    );
  }

  if (active?.document.languageId === 'markdown') {
    const kindLabel =
      picked.source.kind === 'image'
        ? uiText('image reference')
        : picked.source.kind === 'tree'
          ? uiText('Markdown tree')
          : uiText('Markdown table');
    const insert = await vscode.window.showQuickPick(
      [
        {
          label: uiText('Also insert into the Markdown'),
          value: true,
          description:
            uiText('Inserts {0} and provenance at the current cursor position', kindLabel),
        },
        {
          label: uiText('Import into the standard assets only'),
          value: false,
          description: uiText('the body text is not changed'),
        },
      ],
      {
        title: uiText('MMI: The import is done'),
      },
    );
    if (insert?.value) {
      const targetEditor = await vscode.window.showTextDocument(
        active.document,
        active.viewColumn,
      );
      const insertAt = targetEditor.selection.active;
      const insertedText = `${extractedMarkdown}\n`;
      const edited = await targetEditor.edit((edit) =>
        edit.insert(insertAt, insertedText));
      if (edited) {
        const endOffset =
          targetEditor.document.offsetAt(insertAt) + insertedText.length;
        const end = targetEditor.document.positionAt(endOffset);
        targetEditor.selection = new vscode.Selection(end, end);
        targetEditor.revealRange(new vscode.Range(end, end));
      }
    }
  }

  await vscode.window.showInformationMessage(
    uiText('MMI: Imported into {0} and recorded into mmi-ledger.json.', path.relative(root, extractedFile)),
  );
  processedKeys.add(candidateReviewSessionKey(picked.source.candidate));
  }
  } finally {
    if (observationFile && observationInitial) {
      try {
        const finalLedger = readLedger(ledgerPath);
        const finalReviewDecisions = readReviewDecisions(
          reviewDecisionsPath,
        );
        const finalView = candidateReviewView(
          reviewItems.map((item) => item.candidate),
          finalLedger,
          finalReviewDecisions,
          ledgerPath,
          reviewDecisionsPath,
          sourcePath,
          'all',
        );
        const observation = createCandidateReviewObservation({
          sourceLabel,
          sourceDigest,
          startedAtUtc: observationStartedAtUtc,
          endedAtUtc: new Date().toISOString(),
          interruptedMarkdownEditing: Boolean(sessionMarkdownEditor),
          ledgerFilter: filterChoice.value,
          facetFilter,
          selectedCount,
          initial: observationInitial,
          final: candidateReviewObservationSnapshot(
            finalView,
            facetFilter,
          ),
          adjustments: reviewAdjustments,
        });
        appendCandidateReviewObservation(
          observationFile,
          observation,
        );
      } catch (error) {
        void vscode.window.showWarningMessage(
          uiText('MMI: Could not save the observation record of the Candidate review: {0}',
            error instanceof Error ? error.message : String(error)),
        );
      }
    }
  }
}

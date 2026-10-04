import {
  candidateProblem,
  fingerprintOf,
  type Candidate,
  type Evidence,
} from '../core/candidate.js';
import type { SheetSource } from '../core/sheetSource.js';

export const TABULAR_HIERARCHY_ADAPTER_VERSION = '1';

export type TabularHierarchyConfig =
  | {
      mode: 'parent-id';
      idHeader: string;
      parentHeader: string;
      labelHeader?: string;
    }
  | {
      mode: 'level';
      levelHeader: string;
      labelHeader: string;
    };

export interface TabularHierarchyInput {
  source: string;
  sourceDigest: string;
  sheetName: string;
  sheet: SheetSource;
  config: TabularHierarchyConfig;
}

export interface TabularHierarchyNode {
  row: number;
  label: string;
  key: string;
  depth: number;
  parentKey?: string;
  childKeys: readonly string[];
  structuralPath: string;
  candidate: Candidate;
}

export interface TabularHierarchyResult {
  status: 'inferred' | 'abstained';
  reasonCode: string;
  nodes: readonly TabularHierarchyNode[];
  candidates: readonly Candidate[];
  resolvedColumns: Readonly<Record<string, number>>;
}

interface RowRecord {
  row: number;
  key: string;
  label: string;
  parentKey?: string;
  sourceLevel?: number;
  evidence: Evidence[];
}

interface ResolvedHeaders {
  headerRow: number;
  columns: Record<string, number>;
}

export function readTabularHierarchy(
  input: TabularHierarchyInput,
): TabularHierarchyResult {
  const range = input.sheet.usedRange;
  if (!range) {
    return abstain(input, 'tabular-hierarchy-empty-sheet', {}, [{
      code: 'empty-sheet',
    }]);
  }

  const resolved = resolveHeaders(input);
  if ('reasonCode' in resolved) {
    return abstain(input, resolved.reasonCode, resolved.columns, resolved.evidence);
  }

  const rows = input.config.mode === 'parent-id'
    ? readParentRows(input, resolved)
    : readLevelRows(input, resolved);

  if ('reasonCode' in rows) {
    return abstain(input, rows.reasonCode, resolved.columns, rows.evidence);
  }
  if (rows.records.length === 0) {
    return abstain(input, 'tabular-hierarchy-no-data-rows', resolved.columns, [{
      code: 'no-data-rows',
    }]);
  }

  const related = input.config.mode === 'parent-id'
    ? relateParentRows(rows.records)
    : relateLevelRows(rows.records);

  if ('reasonCode' in related) {
    return abstain(input, related.reasonCode, resolved.columns, related.evidence);
  }

  const children = new Map<string, string[]>();
  for (const record of related.records) {
    if (!record.parentKey) continue;
    const list = children.get(record.parentKey) ?? [];
    list.push(record.key);
    children.set(record.parentKey, list);
  }
  const byKey = new Map(related.records.map((record) => [record.key, record]));
  const depthMemo = new Map<string, number>();
  const depthOf = (key: string): number => {
    const memo = depthMemo.get(key);
    if (memo !== undefined) return memo;
    const record = byKey.get(key)!;
    const depth = record.parentKey ? depthOf(record.parentKey) + 1 : 0;
    depthMemo.set(key, depth);
    return depth;
  };

  const subtree = (key: string): unknown => {
    const record = byKey.get(key)!;
    return {
      key: record.key,
      label: record.label,
      children: (children.get(key) ?? []).map(subtree),
    };
  };

  const nodes = related.records.map((record) => {
    const structuralPath =
      `table-hierarchy:${input.config.mode}:id:${encodeURIComponent(record.key)}`;
    const childKeys = children.get(record.key) ?? [];
    const claims: Candidate['claims'] = [
      {
        aspect: 'source-row',
        value: String(record.row + 1),
        status: 'observed',
        execution: 'deterministic',
        method: 'M0',
        reasonCode: 'source-row-coordinate',
      },
      {
        aspect: 'node-key',
        value: record.key,
        status: 'observed',
        execution: 'deterministic',
        method: 'M0',
        reasonCode: input.config.mode === 'parent-id'
          ? 'configured-id-column'
          : 'source-row-identity',
      },
      {
        aspect: 'label',
        value: record.label,
        status: 'observed',
        execution: 'deterministic',
        method: 'M0',
        reasonCode: 'configured-label-column',
      },
      ...(input.config.mode === 'parent-id'
        ? [{
            aspect: 'parent-key-source',
            value: record.parentKey ?? '',
            status: 'observed' as const,
            execution: 'deterministic' as const,
            method: 'M0' as const,
            reasonCode: 'configured-parent-column',
          }]
        : [{
            aspect: 'hierarchy-level-source',
            value: String(record.sourceLevel),
            status: 'observed' as const,
            execution: 'deterministic' as const,
            method: 'M0' as const,
            reasonCode: 'configured-level-column',
          }]),
      {
        aspect: 'structural-path',
        value: structuralPath,
        status: 'inferred',
        execution: 'deterministic',
        method: 'M1',
        reasonCode: `tabular-${input.config.mode}-path`,
        evidence: record.evidence,
      },
      {
        aspect: 'parent-node',
        value: record.parentKey ?? '(root)',
        status: 'inferred',
        execution: 'deterministic',
        method: 'M1',
        reasonCode: `tabular-${input.config.mode}-parent`,
        evidence: record.evidence,
      },
      {
        aspect: 'hierarchy-depth',
        value: String(depthOf(record.key)),
        status: 'inferred',
        execution: 'deterministic',
        method: 'M1',
        reasonCode: `tabular-${input.config.mode}-depth`,
        evidence: record.evidence,
      },
      {
        aspect: 'children',
        value: childKeys,
        status: 'inferred',
        execution: 'deterministic',
        method: 'M1',
        reasonCode: `tabular-${input.config.mode}-children`,
        evidence: record.evidence,
      },
    ];

    const candidate: Candidate = {
      kind: 'tree',
      locator: {
        source: input.source,
        sourceDigest: input.sourceDigest,
        sheet: input.sheetName,
        structuralPath,
      },
      status: 'inferred',
      execution: 'deterministic',
      method: 'M1',
      claims,
      provenance: {
        algorithm: `mmi.tabular-hierarchy.${input.config.mode}`,
        run: {
          execution: 'deterministic',
          inputDigest: input.sourceDigest,
          config: provenanceConfig(input.config, resolved.columns, resolved.headerRow),
          implementationVersion: TABULAR_HIERARCHY_ADAPTER_VERSION,
        },
      },
      fingerprint: fingerprintOf(
        'tabular-hierarchy-subtree-v1',
        JSON.stringify(subtree(record.key)),
      ),
      scores: [],
    };
    const problem = candidateProblem(candidate);
    if (problem) {
      throw new Error(
        `invalid tabular Tree Candidate for ${record.key}: ${problem}`,
      );
    }

    return {
      row: record.row,
      label: record.label,
      key: record.key,
      depth: depthOf(record.key),
      ...(record.parentKey ? { parentKey: record.parentKey } : {}),
      childKeys,
      structuralPath,
      candidate,
    };
  });

  return {
    status: 'inferred',
    reasonCode: `tabular-${input.config.mode}-hierarchy`,
    nodes,
    candidates: nodes.map((node) => node.candidate),
    resolvedColumns: resolved.columns,
  };
}

function resolveHeaders(
  input: TabularHierarchyInput,
):
  | ResolvedHeaders
  | { reasonCode: string; columns: Record<string, number>; evidence: Evidence[] } {
  const range = input.sheet.usedRange!;
  const wanted = input.config.mode === 'parent-id'
    ? [
        ['id', input.config.idHeader],
        ['parent', input.config.parentHeader],
        ...(input.config.labelHeader
          ? [['label', input.config.labelHeader] as const]
          : []),
      ]
    : [
        ['level', input.config.levelHeader],
        ['label', input.config.labelHeader],
      ];

  const columns: Record<string, number> = {};
  for (const [role, header] of wanted) {
    const matches: number[] = [];
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      if (input.sheet.cellAt(range.startRow, col)?.text.trim() === header.trim()) {
        matches.push(col);
      }
    }
    if (matches.length === 0) {
      return {
        reasonCode: 'tabular-hierarchy-header-missing',
        columns,
        evidence: [{
          code: 'configured-header-missing',
          detail: `${role} header ${JSON.stringify(header)} was not found on row ${range.startRow + 1}`,
        }],
      };
    }
    if (matches.length > 1) {
      return {
        reasonCode: 'tabular-hierarchy-header-duplicate',
        columns,
        evidence: [{
          code: 'configured-header-duplicate',
          detail: `${role} header ${JSON.stringify(header)} matched columns ${matches.map(columnName).join(', ')}`,
        }],
      };
    }
    columns[role] = matches[0];
  }

  return { headerRow: range.startRow, columns };
}

function readParentRows(
  input: TabularHierarchyInput,
  resolved: ResolvedHeaders,
):
  | { records: RowRecord[] }
  | { reasonCode: string; evidence: Evidence[] } {
  const range = input.sheet.usedRange!;
  const records: RowRecord[] = [];
  const seen = new Map<string, number>();

  for (let row = resolved.headerRow + 1; row <= range.endRow; row += 1) {
    const id = cellText(input.sheet, row, resolved.columns.id);
    const parent = cellText(input.sheet, row, resolved.columns.parent);
    const label = resolved.columns.label === undefined
      ? id
      : cellText(input.sheet, row, resolved.columns.label);
    if (!id && !parent && !label) continue;
    if (!id) {
      return {
        reasonCode: 'tabular-hierarchy-id-missing',
        evidence: [{
          code: 'id-missing',
          detail: `row ${row + 1} has hierarchy data but no ID`,
        }],
      };
    }
    if (seen.has(id)) {
      return {
        reasonCode: 'tabular-hierarchy-id-duplicate',
        evidence: [{
          code: 'duplicate-id',
          detail: `ID ${JSON.stringify(id)} appears on rows ${seen.get(id)! + 1} and ${row + 1}`,
        }],
      };
    }
    seen.set(id, row);
    records.push({
      row,
      key: id,
      label: label || id,
      ...(parent ? { parentKey: parent } : {}),
      evidence: [{
        code: 'configured-parent-columns',
        detail: `row ${row + 1}; ID ${columnName(resolved.columns.id)}; parent ${columnName(resolved.columns.parent)}`,
      }],
    });
  }
  return { records };
}

function relateParentRows(
  records: readonly RowRecord[],
):
  | { records: RowRecord[] }
  | { reasonCode: string; evidence: Evidence[] } {
  const ids = new Set(records.map((record) => record.key));
  for (const record of records) {
    if (record.parentKey === record.key) {
      return {
        reasonCode: 'tabular-hierarchy-self-parent',
        evidence: [{
          code: 'self-parent',
          detail: `ID ${JSON.stringify(record.key)} points to itself`,
        }],
      };
    }
    if (record.parentKey && !ids.has(record.parentKey)) {
      return {
        reasonCode: 'tabular-hierarchy-parent-missing',
        evidence: [{
          code: 'parent-id-missing',
          detail: `ID ${JSON.stringify(record.key)} references missing parent ${JSON.stringify(record.parentKey)}`,
        }],
      };
    }
  }

  const byKey = new Map(records.map((record) => [record.key, record]));
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (key: string): string[] | undefined => {
    const current = state.get(key) ?? 0;
    if (current === 1) return [key];
    if (current === 2) return undefined;
    state.set(key, 1);
    const parent = byKey.get(key)?.parentKey;
    if (parent) {
      const cycle = visit(parent);
      if (cycle) return cycle[0] === key ? [...cycle, key] : [...cycle, key];
    }
    state.set(key, 2);
    return undefined;
  };
  for (const record of records) {
    const cycle = visit(record.key);
    if (cycle) {
      return {
        reasonCode: 'tabular-hierarchy-cycle',
        evidence: [{
          code: 'parent-cycle',
          detail: `parent relation contains a cycle involving ${cycle.reverse().join(' -> ')}`,
        }],
      };
    }
  }

  return { records: [...records] };
}

function readLevelRows(
  input: TabularHierarchyInput,
  resolved: ResolvedHeaders,
):
  | { records: RowRecord[] }
  | { reasonCode: string; evidence: Evidence[] } {
  const range = input.sheet.usedRange!;
  const raw: Array<{
    row: number;
    label: string;
    level: number;
  }> = [];

  for (let row = resolved.headerRow + 1; row <= range.endRow; row += 1) {
    const levelText = cellText(input.sheet, row, resolved.columns.level);
    const label = cellText(input.sheet, row, resolved.columns.label);
    if (!levelText && !label) continue;
    if (!/^[0-9]+$/u.test(levelText)) {
      return {
        reasonCode: 'tabular-hierarchy-level-invalid',
        evidence: [{
          code: 'level-not-nonnegative-integer',
          detail: `row ${row + 1} has level ${JSON.stringify(levelText)}`,
        }],
      };
    }
    if (!label) {
      return {
        reasonCode: 'tabular-hierarchy-label-missing',
        evidence: [{
          code: 'label-missing',
          detail: `row ${row + 1} has a hierarchy level but no label`,
        }],
      };
    }
    raw.push({ row, label, level: Number(levelText) });
  }

  if (raw.length === 0) return { records: [] };
  const baseline = Math.min(...raw.map((item) => item.level));
  const records: RowRecord[] = raw.map((item) => ({
    row: item.row,
    key: `row:${item.row + 1}`,
    label: item.label,
    sourceLevel: item.level,
    evidence: [{
      code: 'configured-level-column',
      detail: `row ${item.row + 1}; level ${columnName(resolved.columns.level)}; label ${columnName(resolved.columns.label)}`,
    }],
  }));

  const stack: RowRecord[] = [];
  for (const record of records) {
    const normalized = record.sourceLevel! - baseline;
    if (normalized < 0) {
      throw new Error('normalized hierarchy level must not be negative');
    }
    if (normalized > stack.length) {
      return {
        reasonCode: 'tabular-hierarchy-level-jump',
        evidence: [{
          code: 'level-jump',
          detail: `row ${record.row + 1} jumps from depth ${stack.length - 1} to ${normalized}`,
        }],
      };
    }
    while (stack.length > normalized) stack.pop();
    if (normalized > 0) {
      const parent = stack.at(-1);
      if (!parent) {
        return {
          reasonCode: 'tabular-hierarchy-level-parent-missing',
          evidence: [{
            code: 'level-parent-missing',
            detail: `row ${record.row + 1} has no preceding level ${normalized - 1} row`,
          }],
        };
      }
      record.parentKey = parent.key;
    }
    stack.push(record);
  }

  return { records };
}

function relateLevelRows(
  records: readonly RowRecord[],
): { records: RowRecord[] } {
  return { records: [...records] };
}

function abstain(
  input: TabularHierarchyInput,
  reasonCode: string,
  resolvedColumns: Record<string, number>,
  evidence: Evidence[],
): TabularHierarchyResult {
  const structuralPath = `table-hierarchy:${input.config.mode}`;
  const candidate: Candidate = {
    kind: 'tree',
    locator: {
      source: input.source,
      sourceDigest: input.sourceDigest,
      sheet: input.sheetName,
      structuralPath,
    },
    status: 'abstained',
    execution: 'deterministic',
    method: 'M1',
    claims: [{
      aspect: 'hierarchy',
      status: 'abstained',
      execution: 'deterministic',
      method: 'M1',
      reasonCode,
      evidence,
    }],
    provenance: {
      algorithm: `mmi.tabular-hierarchy.${input.config.mode}`,
      run: {
        execution: 'deterministic',
        inputDigest: input.sourceDigest,
        config: provenanceConfig(
          input.config,
          resolvedColumns,
          input.sheet.usedRange?.startRow ?? 0,
        ),
        implementationVersion: TABULAR_HIERARCHY_ADAPTER_VERSION,
      },
    },
    fingerprint: fingerprintOf(
      'tabular-hierarchy-source-v1',
      JSON.stringify({
        sheet: input.sheetName,
        config: input.config,
        resolvedColumns,
      }),
    ),
    scores: [],
  };
  const problem = candidateProblem(candidate);
  if (problem) {
    throw new Error(
      `invalid abstained tabular hierarchy Candidate: ${problem}`,
    );
  }
  return {
    status: 'abstained',
    reasonCode,
    nodes: [],
    candidates: [candidate],
    resolvedColumns,
  };
}

function provenanceConfig(
  config: TabularHierarchyConfig,
  columns: Record<string, number>,
  headerRow: number,
): Readonly<Record<string, string | number | boolean>> {
  return {
    mode: config.mode,
    headerRow,
    ...(config.mode === 'parent-id'
      ? {
          idHeader: config.idHeader,
          parentHeader: config.parentHeader,
          ...(config.labelHeader ? { labelHeader: config.labelHeader } : {}),
        }
      : {
          levelHeader: config.levelHeader,
          labelHeader: config.labelHeader,
        }),
    ...Object.fromEntries(
      Object.entries(columns).map(([role, col]) => [`${role}Column`, col]),
    ),
  };
}

function cellText(sheet: SheetSource, row: number, col: number): string {
  return sheet.cellAt(row, col)?.text.trim() ?? '';
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

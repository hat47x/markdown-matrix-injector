import path from 'node:path';
import { columnToIndex, indexToColumn, parseRangeToCellRange } from '../core/tableGeometry.js';
import { observeSourceCells, type ObservedSourceCell } from './observeSourceCells.js';
import { readBoundedSourceBytes } from '../core/readBoundedSourceBytes.js';
import { resolveSourcePath } from '../core/pathResolver.js';

interface IdSelection {
  source: string;
  sheet: string;
  range: string;
  namespace: string;
  role: 'definition' | 'reference';
  expectedSourceDigest: string;
  attributes?: Record<string, string>;
}
function parseSelections(input: unknown): IdSelection[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 16) throw new Error('ID selections must be an array of 1 to 16 entries');
  const fields = ['source', 'sheet', 'range', 'namespace', 'role', 'expectedSourceDigest'];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).some((key) => ![...fields, 'attributes'].includes(key))
      || !fields.every((key) => typeof entry[key] === 'string' && entry[key].length > 0)
      || !['definition', 'reference'].includes(entry.role)
      || !/^sha256:[0-9a-f]{64}$/u.test(entry.expectedSourceDigest)) throw new Error('invalid ID selection; specify source, sheet, range, namespace, role and expectedSourceDigest and optional attributes');
    if (entry.attributes !== undefined) {
      const attributes = entry.attributes;
      if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)
        || Object.keys(attributes).length < 1 || Object.keys(attributes).length > 16
        || Object.entries(attributes).some(([name, col]) => !name.trim() || name.length > 64
          || typeof col !== 'string' || !/^[A-Z]{1,3}$/u.test(col) || columnToIndex(col) >= 16384)
        || new Set(Object.values(attributes)).size !== Object.keys(attributes).length) throw new Error('attributes requires 1 to 16 distinct A1 columns with nonempty names of at most 64 characters');
      if (!/^[A-Z]{1,3}[1-9]\d*(?::[A-Z]{1,3}[1-9]\d*)?$/iu.test(entry.range)) throw new Error('attributes requires a single-column ID range');
      const range = parseRangeToCellRange(entry.range);
      if (range.startCol !== range.endCol || Object.values(attributes).includes(indexToColumn(range.startCol))) throw new Error('attributes requires a single ID column distinct from attribute columns');
    }
    if (!/\.(xlsx|xlsm|xls|xml)$/iu.test(entry.source)) throw new Error('ID matching supports Excel and XML Spreadsheet 2003; CSV requires a whitespace-preserving loader');
    if (path.isAbsolute(entry.source) || entry.source.split(/[\\/]/u).some((part: string) => part === '..')) throw new Error('ID source must be root-relative without parent traversal');
  }
  return input as IdSelection[];
}

interface AttributeObservation {
  name: string;
  address: string;
  type?: ObservedSourceCell['type'];
  value?: string | number | boolean;
  reason?: string;
}
function observeAttribute(name: string, cell: ObservedSourceCell): AttributeObservation {
  const reason = cell.mergeRole !== 'none' ? 'merged-cell'
    : cell.valueOrigin !== 'literal' ? 'not-literal-or-unobserved'
    : !['s', 'n', 'b', 'd'].includes(cell.type ?? '') ? 'unsupported-type'
    : cell.payload?.value === null || cell.payload?.value === undefined ? 'value-unavailable'
    : typeof cell.payload.value === 'number' && !Number.isFinite(cell.payload.value) ? 'non-finite-number' : undefined;
  if (reason) return { name, address: cell.address, reason };
  const value = cell.payload!.value;
  return { name, address: cell.address, type: cell.type,
    value: value instanceof Date ? value.toISOString() : value as string | number | boolean };
}

/** Exact literal-token evidence only; caller-selected roles never establish business identity. */
export function matchSourceIds(input: unknown, root: string) {
  const selections = parseSelections(input);
  const bytesBySource = new Map<string, Buffer>();
  const selectedCells = new Set<string>();
  const groups = new Map<string, { namespace: string; id: string; definitions: number[]; references: number[] }>();
  const occurrences: { selection: number; address: string; id: string; attributes?: AttributeObservation[] }[] = [];
  const gaps: { selection: number; address: string; reason: string }[] = [];
  const observations = selections.map((selection, index) => {
    const file = resolveSourcePath({ markdownFilePath: path.join(root, '__mmi_ids__.md'), sourcePath: selection.source, workspaceRoot: root });
    let bytes = bytesBySource.get(file);
    if (!bytes) { bytes = readBoundedSourceBytes(file, 16 * 1024 * 1024); bytesBySource.set(file, bytes); }
    const idRange = parseRangeToCellRange(selection.range);
    const attributeColumns = Object.values(selection.attributes ?? {}).map(columnToIndex);
    // ponytail: one enclosing rectangle, bounded to 4096 cells; use sparse projections if real layouts exceed this.
    const observationRange = selection.attributes
      ? `${indexToColumn(Math.min(idRange.startCol, ...attributeColumns))}${idRange.startRow + 1}:${indexToColumn(Math.max(idRange.endCol, ...attributeColumns))}${idRange.endRow + 1}`
      : selection.range;
    const observed = observeSourceCells({ ...selection, range: observationRange, source: path.relative(root, file), bytes, includeValues: true,
      maxCells: 4096 - selectedCells.size });
    const cellsByAddress = new Map(observed.cells.map((cell) => [cell.address, cell]));
    for (const cell of observed.cells) {
      // Repeated/overlapping selections must not manufacture duplicate definitions.
      const locator = JSON.stringify([file, selection.sheet, cell.address]);
      if (selectedCells.has(locator)) throw new Error('ID selections overlap; select each physical cell once');
      selectedCells.add(locator);
    }
    for (const cell of observed.cells) {
      if (selection.attributes && parseRangeToCellRange(cell.address).startCol !== idRange.startCol) continue;
      const reason = cell.mergeRole !== 'none' ? 'merged-cell'
        : cell.valueOrigin !== 'literal' ? 'not-literal-or-unobserved'
        : cell.type !== 's' || typeof cell.payload?.value !== 'string' ? 'not-string'
        : cell.payload.value.trim().length === 0 ? 'empty-string' : undefined;
      if (reason) { gaps.push({ selection: index, address: cell.address, reason }); continue; }
      const id = cell.payload!.value as string;
      const key = JSON.stringify([selection.namespace, id]);
      const group = groups.get(key) ?? { namespace: selection.namespace, id, definitions: [], references: [] };
      group[selection.role === 'definition' ? 'definitions' : 'references'].push(occurrences.length);
      groups.set(key, group);
      occurrences.push({ selection: index, address: cell.address, id,
        ...(selection.attributes ? { attributes: Object.entries(selection.attributes).map(([name, column]) =>
          observeAttribute(name, cellsByAddress.get(`${column}${parseRangeToCellRange(cell.address).startRow + 1}`)!)) } : {}),
      });
    }
    return { ...selection, source: observed.source, range: selection.attributes ? `${indexToColumn(idRange.startCol)}${idRange.startRow + 1}:${indexToColumn(idRange.endCol)}${idRange.endRow + 1}` : observed.range,
      ...(selection.attributes ? { observationRange: observed.range, attributeBasis: 'caller-specified' as const } : {}), sourceIdentity: observed.sourceIdentity,
      roleBasis: 'caller-specified' as const };
  });
  const matches = [...groups.values()].map((group) => {
    const members = [...group.definitions, ...group.references];
    const names = [...new Set(members.flatMap((i) => occurrences[i].attributes?.map((a) => a.name) ?? []))];
    const attributeComparisons = names.map((name) => {
      const variants = new Map<string, { type: AttributeObservation['type']; value: AttributeObservation['value']; occurrences: number[] }>();
      const unavailable: { occurrence: number; reason: string }[] = [];
      for (const i of members) {
        const attribute = occurrences[i].attributes?.find((a) => a.name === name);
        if (!attribute || attribute.reason) { unavailable.push({ occurrence: i, reason: attribute?.reason ?? 'not-selected' }); continue; }
        const key = JSON.stringify([attribute.type, attribute.value]);
        const variant = variants.get(key) ?? { type: attribute.type, value: attribute.value, occurrences: [] };
        variant.occurrences.push(i); variants.set(key, variant);
      }
      return { name, status: variants.size > 1 ? 'different-values' : members.length > 1 && !unavailable.length ? 'equal-values' : 'insufficient-observations',
        incomplete: unavailable.length > 0, variants: [...variants.values()], unavailable };
    });
    return { ...group,
      status: group.definitions.length > 1 ? 'ambiguous' : group.definitions.length === 0 ? 'missing-definition'
        : group.references.length === 0 ? 'definition-only' : 'unique-token-match',
      ...(names.length ? { attributeComparisons } : {}),
    };
  });
  return { contract: 'mmi.source-id-matches/v0',
    status: gaps.length || matches.some((match) => ['ambiguous', 'missing-definition'].includes(match.status)
      || match.attributeComparisons?.some((a) => a.status !== 'equal-values')) ? 'needs-review' : 'observed',
    comparison: 'exact-literal-string-within-caller-namespace', consistency: 'per-file-observation',
    selections: observations, occurrences, matches, gaps,
    limitations: ['caller-selected-scope-only', 'equal-tokens-do-not-establish-business-identity',
      'no-normalization-or-formula-evaluation', 'excluded-cells-may-hide-definitions', 'not-a-collection-snapshot'],
  };
}

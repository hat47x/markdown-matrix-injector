import path from 'node:path';
import { observeSourceCells } from './observeSourceCells.js';
import { readBoundedSourceBytes } from '../core/readBoundedSourceBytes.js';
import { resolveSourcePath } from '../core/pathResolver.js';
import { compareAttributes, type AttributeObservation } from './sourceIdAttributes.js';

interface IdSelection {
  source: string;
  sheet: string;
  range: string;
  namespace: string;
  role: 'definition' | 'reference';
  expectedSourceDigest: string;
  /** Caller-named attribute -> column letter. The ID range must then be one column; each attribute is read from the ID's own row. */
  attributes?: Record<string, string>;
}
const ATTRIBUTE_NAME = /^\S{1,64}$/u;
function parseSelections(input: unknown): IdSelection[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 16) throw new Error('ID selections must be an array of 1 to 16 entries');
  const fields = ['source', 'sheet', 'range', 'namespace', 'role', 'expectedSourceDigest'];
  for (const entry of input) {
    const hasAttributes = Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry) && 'attributes' in entry;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).length !== fields.length + (hasAttributes ? 1 : 0)
      || !fields.every((key) => typeof entry[key] === 'string' && entry[key].length > 0)
      || !['definition', 'reference'].includes(entry.role)
      || !/^sha256:[0-9a-f]{64}$/u.test(entry.expectedSourceDigest)) throw new Error('invalid ID selection; specify source, sheet, range, namespace, role and expectedSourceDigest only');
    if (hasAttributes) {
      const attrs = entry.attributes;
      const names = attrs && typeof attrs === 'object' && !Array.isArray(attrs) ? Object.keys(attrs) : [];
      if (names.length < 1 || names.length > 8 || !names.every((name) => ATTRIBUTE_NAME.test(name) && typeof attrs[name] === 'string' && /^[A-Z]{1,3}$/u.test(attrs[name]))) {
        throw new Error('attributes must map 1 to 8 names to column letters (A to XFD)');
      }
      if (!/^([A-Z]{1,3})[1-9]\d*:\1[1-9]\d*$/iu.test(entry.range)) throw new Error('a selection with attributes must select a single ID column (for example A2:A20)');
    }
    if (!/\.(xlsx|xlsm|xls|xml)$/iu.test(entry.source)) throw new Error('ID matching supports Excel and XML Spreadsheet 2003; CSV requires a whitespace-preserving loader');
    if (path.isAbsolute(entry.source) || entry.source.split(/[\\/]/u).some((part: string) => part === '..')) throw new Error('ID source must be root-relative without parent traversal');
  }
  return input as IdSelection[];
}

/** Exact literal-token evidence only; caller-selected roles never establish business identity. */
export function matchSourceIds(input: unknown, root: string) {
  const selections = parseSelections(input);
  const bytesBySource = new Map<string, Buffer>();
  const selectedCells = new Set<string>();
  const groups = new Map<string, { namespace: string; id: string; definitions: number[]; references: number[] }>();
  const occurrences: { selection: number; address: string; id: string }[] = [];
  const gaps: { selection: number; address: string; reason: string }[] = [];
  const attributeObservations: AttributeObservation[] = [];
  const rowOf = new Map<number, number>();
  const observations = selections.map((selection, index) => {
    const file = resolveSourcePath({ markdownFilePath: path.join(root, '__mmi_ids__.md'), sourcePath: selection.source, workspaceRoot: root });
    let bytes = bytesBySource.get(file);
    if (!bytes) { bytes = readBoundedSourceBytes(file, 16 * 1024 * 1024); bytesBySource.set(file, bytes); }
    const observed = observeSourceCells({ ...selection, source: path.relative(root, file), bytes, includeValues: true,
      maxCells: 4096 - selectedCells.size });
    for (const cell of observed.cells) {
      // Repeated/overlapping selections must not manufacture duplicate definitions.
      const locator = JSON.stringify([file, selection.sheet, cell.address]);
      if (selectedCells.has(locator)) throw new Error('ID selections overlap; select each physical cell once');
      selectedCells.add(locator);
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
      rowOf.set(occurrences.length, Number(cell.address.replace(/^[A-Z]+/u, '')));
      occurrences.push({ selection: index, address: cell.address, id });
    }
    for (const [attribute, column] of Object.entries(selection.attributes ?? {})) {
      const bounds = observed.range.match(/^[A-Z]+(\d+)(?::[A-Z]+(\d+))?$/iu)!;
      const attributeRange = `${column}${bounds[1]}:${column}${bounds[2] ?? bounds[1]}`;
      const attributeCells = observeSourceCells({ ...selection, range: attributeRange, source: path.relative(root, file), bytes, includeValues: true,
        maxCells: 4096 - selectedCells.size });
      for (const cell of attributeCells.cells) {
        const locator = JSON.stringify([file, selection.sheet, cell.address]);
        if (selectedCells.has(locator)) throw new Error('ID and attribute cells overlap; select each physical cell once');
        selectedCells.add(locator);
        const reason = cell.mergeRole !== 'none' ? 'merged-cell'
          : cell.valueOrigin !== 'literal' ? 'not-literal-or-unobserved'
          : cell.presence !== 'represented' || cell.payload === undefined ? 'not-represented' : undefined;
        attributeObservations.push({ selection: index, attribute, row: Number(cell.address.replace(/^[A-Z]+/u, '')), address: cell.address,
          ...(reason ? { gap: reason } : { type: cell.type, value: cell.payload!.value }) });
      }
    }
    return { ...selection, source: observed.source, range: observed.range, sourceIdentity: observed.sourceIdentity,
      roleBasis: 'caller-specified' as const };
  });
  const attributes = compareAttributes(selections, occurrences.map((occurrence, i) => ({ ...occurrence, row: rowOf.get(i)! })), attributeObservations, groups.values());
  const matches = [...groups.values()].map((group) => ({ ...group,
    status: group.definitions.length > 1 ? 'ambiguous' : group.definitions.length === 0 ? 'missing-definition'
      : group.references.length === 0 ? 'definition-only' : 'unique-token-match' }));
  return { contract: 'mmi.source-id-matches/v0',
    status: gaps.length || matches.some((match) => ['ambiguous', 'missing-definition'].includes(match.status))
      || attributes.some((entry) => entry.status !== 'equal') ? 'needs-review' : 'observed',
    comparison: 'exact-literal-string-within-caller-namespace', consistency: 'per-file-observation',
    selections: observations, occurrences, matches, gaps,
    ...(attributes.length ? { attributes } : {}),
    limitations: ['caller-selected-scope-only', 'equal-tokens-do-not-establish-business-identity',
      'no-normalization-or-formula-evaluation', 'excluded-cells-may-hide-definitions', 'not-a-collection-snapshot'],
  };
}

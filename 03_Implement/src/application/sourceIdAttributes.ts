/**
 * Attribute comparison for explicit-ID matching (#661).
 *
 * For each (namespace, ID, attribute) the values that the caller-named columns
 * hold, in every place the ID occurs, are compared with their types: the number
 * 10 is not the string "10". Nothing is normalized or evaluated. A difference is
 * evidence for a person to review, never a business contradiction; a missing
 * observation (merge, formula, unrepresented cell) is reported as insufficient,
 * never counted as equal.
 */
export type AttributeValue = string | number | boolean | Date | null;

export interface AttributeSelectionInput {
  attributes?: Record<string, string>;
}

export interface AttributeObservation {
  selection: number;
  attribute: string;
  row: number;
  address: string;
  gap?: string;
  type?: string;
  value?: AttributeValue;
}

export interface IdOccurrenceRow {
  selection: number;
  address: string;
  id: string;
  row: number;
}

export interface IdGroup {
  namespace: string;
  id: string;
  definitions: number[];
  references: number[];
}

export interface AttributeComparison {
  namespace: string;
  id: string;
  attribute: string;
  status: 'equal' | 'different' | 'insufficient';
  values: { selection: number; occurrence: number; address: string; type: string; value: string | number | boolean | null; text: string }[];
  gaps: { selection: number; occurrence: number; address: string; reason: string }[];
}

export function compareAttributes(
  selections: readonly AttributeSelectionInput[],
  occurrences: readonly IdOccurrenceRow[],
  observations: readonly AttributeObservation[],
  groups: Iterable<IdGroup>,
): AttributeComparison[] {
  const out: AttributeComparison[] = [];
  const names = [...new Set(selections.flatMap((selection) => Object.keys(selection.attributes ?? {})))];
  for (const group of groups) {
    const indexes = [...group.definitions, ...group.references];
    for (const attribute of names) {
      const values: AttributeComparison['values'] = [];
      const gaps: AttributeComparison['gaps'] = [];
      for (const occurrenceIndex of indexes) {
        const occurrence = occurrences[occurrenceIndex];
        if (!selections[occurrence.selection].attributes?.[attribute]) continue;
        const observed = observations.find((entry) => entry.selection === occurrence.selection && entry.attribute === attribute && entry.row === occurrence.row);
        if (!observed) continue;
        if (observed.gap) {
          gaps.push({ selection: occurrence.selection, occurrence: occurrenceIndex, address: observed.address, reason: observed.gap });
          continue;
        }
        const value = observed.value instanceof Date ? observed.value.toISOString() : (observed.value ?? null);
        values.push({ selection: occurrence.selection, occurrence: occurrenceIndex, address: observed.address, type: observed.type ?? 'unknown', value, text: String(value) });
      }
      if (values.length === 0 && gaps.length === 0) continue;
      const distinct = new Set(values.map((entry) => JSON.stringify([entry.type, entry.value])));
      out.push({
        namespace: group.namespace,
        id: group.id,
        attribute,
        status: gaps.length > 0 || values.length < 2 ? 'insufficient' : distinct.size === 1 ? 'equal' : 'different',
        values,
        gaps,
      });
    }
  }
  return out;
}

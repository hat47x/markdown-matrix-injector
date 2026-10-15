const fold = (value: string): string => value.normalize('NFKC').toLowerCase();

/** How many names a message spells out before it says how many more there are. */
export const MAX_LISTED_NAMES = 5;

/**
 * Sheets whose name contains, or is contained in, the missing one -- the usual shape of a rename
 * (`画面` -> `画面項目`). Never includes the name itself.
 */
export function similarNames(target: string, available: readonly string[]): string[] {
  const wanted = fold(target);
  if (wanted.length === 0) return [];
  return available.filter((name) => {
    const candidate = fold(name);
    return candidate.length > 0 && candidate !== wanted && (candidate.includes(wanted) || wanted.includes(candidate));
  });
}

export function capNames(names: readonly string[]): { shown: readonly string[]; more: number } {
  return { shown: names.slice(0, MAX_LISTED_NAMES), more: Math.max(0, names.length - MAX_LISTED_NAMES) };
}

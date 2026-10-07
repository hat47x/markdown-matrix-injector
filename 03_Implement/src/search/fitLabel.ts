/**
 * How a candidate's fit is shown (ADR-0023). The number is a rule-of-thumb guide from
 * `compiler.ts` (`fitOf`), not a probability; it sits at the end of the description so it
 * informs the choice without ranking above the table's name.
 */
export function fitLabel(fit: number | undefined): string {
  return fit === undefined ? '' : `適合度 ${fit.toFixed(2)}`;
}

/** `left` and the fit label, joined only when both exist. */
export function withFit(left: string, fit: number | undefined): string {
  const label = fitLabel(fit);
  return label === '' ? left : `${left} ・ ${label}`;
}

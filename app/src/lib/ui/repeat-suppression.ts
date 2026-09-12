/**
 * DON'T PRINT WHAT THE LINE ABOVE ALREADY SAID (P287).
 *
 * Several lists on this site carry a sentence that belongs to a row's CATEGORY rather than to the
 * row: the availability explanation on /today's slate board, the integrity meaning on /results'
 * per-date accounting. Each row printed its own copy, so a fifteen-game slate said
 * "Game started — the pregame simulation and its uncertainty range are preserved for review."
 * ten times, and eight dates of accounting said "Every generated row reached a final state." seven
 * times. In both cases a label immediately beside it — a readiness chip, a "Complete" tag — had
 * already said the same thing in two words.
 *
 * The rule is one line long, and having it in one place is the point: two surfaces implementing
 * "collapse the repeats" separately is how they drift into collapsing differently.
 *
 * WHAT THIS IS NOT. It is not a way to drop information. The suppressed sentence is still the row's
 * own value in the contract, still available to an aria-label or a tooltip, and the first row of
 * every run still prints it — so the sentence always introduces the rows it applies to, and a
 * reader never meets a run without having read what it means.
 */

/**
 * For a list of per-row values, which rows should PRINT theirs: the first of each run of equal
 * neighbours. A row whose value differs from the row above it always prints.
 *
 * Comparison is strict equality, so callers pass the rendered string itself rather than a key —
 * two rows whose sentences differ by a word are correctly treated as different.
 *
 * @example firstOfRun(["a", "a", "b", "a"]) → [true, false, true, true]
 */
export function firstOfRun<T>(values: readonly T[]): boolean[] {
  return values.map((v, i) => i === 0 || v !== values[i - 1]);
}

/**
 * The single value every row shares, or null when they do not all share one — for a list whose
 * header can carry the sentence instead of any row. Null for an empty list, and null for a
 * single-row list, where a header line and a row line would be the same repetition this avoids.
 */
export function sharedValue<T>(values: readonly T[]): T | null {
  if (values.length < 2) return null;
  const first = values[0];
  return values.every((v) => v === first) ? first : null;
}

/**
 * The Simulate board's filter-chip list — DERIVED from the rows present, never hand-kept.
 *
 * Program 178 · Release A. A static `CHIPS` array is how a chip count and a card count drift apart:
 * it is why NFL had no chip while live NFL simulations were on the board, and it is why the World
 * Cup closeout needed a guard to stop an archived competition being re-added by hand. Deriving the
 * list makes both classes of defect unreachable — a sport with no rows cannot have a chip, and a
 * sport with rows cannot be missing one.
 *
 * This array decides ORDER only. A sport present in the rows but absent from it is appended rather
 * than dropped, so adding a sport can never silently lose its chip.
 */
/* EPL sits beside MLB: as of P188 they are the two sports carrying per-fixture simulations. */
export const CHIP_ORDER = ["mlb", "epl", "nfl", "nba", "ufc", "world_cup"] as const;

export function chipsFor(games: ReadonlyArray<{ sport: string }>): string[] {
  const present = new Set(games.map((g) => g.sport));
  const ordered = CHIP_ORDER.filter((k) => present.has(k));
  const extra = [...present].filter((k) => !(CHIP_ORDER as readonly string[]).includes(k)).sort();
  return ["all", ...ordered, ...extra];
}

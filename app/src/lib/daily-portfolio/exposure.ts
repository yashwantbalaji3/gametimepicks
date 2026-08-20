/**
 * THE definition of daily open exposure — one function, used by every WRITER of daily-portfolio.json.
 *
 * Why this file exists: the generator (accounting.ts) and the player-prop settler each computed open
 * exposure with their own inline reduce. They agreed until they didn't — the settler summed EVERY lane
 * while the generator summed only ACTIVE ones, so a day on which nothing was ever placed was published
 * as $250 at risk. That failed the money invariant nightly and understated availableBankroll by the
 * same $250. Two writers, two definitions, one silent divergence.
 *
 * The rule: open exposure is money AT RISK, which is Σ exposure over lanes with status "active".
 *   · "awaiting"/"candidate" — no placed card behind them, so nothing is at risk;
 *   · "won"/"lost"           — settled, the stake is released (the settler also zeroes lane.exposure).
 *
 * DELIBERATELY NOT USED BY THE INVARIANT. money-integrity.ts and audits/product-truth.mjs re-derive
 * this sum themselves. An invariant that imports the writer's arithmetic cannot catch the writer's
 * arithmetic being wrong — the independence is the point, not duplication to be tidied away later.
 */

/** A lane, narrowed to the two fields exposure depends on. Structural so both TS and JS callers fit. */
export interface ExposureLane {
  status?: string;
  exposure?: number;
}

/** Lanes that actually place money. */
export function activeLanes<T extends ExposureLane>(lanes: readonly T[] | null | undefined): T[] {
  return (lanes ?? []).filter((l) => l.status === "active");
}

/** Σ exposure over ACTIVE lanes, rounded to cents. Optionally narrowed to one product. */
export function sumActiveExposure(
  lanes: readonly ExposureLane[] | null | undefined,
  predicate?: (lane: ExposureLane) => boolean,
): number {
  const rows = activeLanes(lanes).filter((l) => (predicate ? predicate(l) : true));
  return Math.round(rows.reduce((n, l) => n + (l.exposure ?? 0), 0) * 100) / 100;
}

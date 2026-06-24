/**
 * Repository-wide STALENESS guard. A product artifact (Moonshot lane, WC Specials snapshot, Homer Nukes
 * lanes, Bank Builder daily card) is STALE when its slate predates the current slate — it must then render
 * as STALE (not ACTIVE) and must NOT contribute open exposure. Pure + deterministic.
 */

export type Freshness = "fresh" | "stale" | "unknown";

/** Extract a YYYY-MM-DD date from a slate string or an ISO timestamp. */
export function slateDateOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * A product is FRESH only when its slate equals the current slate date. An older slate is STALE; a missing
 * date is UNKNOWN (treated as not-fresh — fail closed). A FUTURE-dated slate is also flagged stale (it can't
 * be the live card for the current day).
 */
export function freshnessFor(artifactDate: string | null | undefined, currentSlateDate: string): Freshness {
  const a = slateDateOf(artifactDate);
  if (!a) return "unknown";
  return a === currentSlateDate ? "fresh" : "stale";
}

export function isStale(artifactDate: string | null | undefined, currentSlateDate: string): boolean {
  return freshnessFor(artifactDate, currentSlateDate) !== "fresh";
}

/** A short, honest status label for a product surface. */
export function stalenessLabel(f: Freshness): string {
  return f === "fresh" ? "ACTIVE" : f === "stale" ? "STALE" : "AWAITING";
}

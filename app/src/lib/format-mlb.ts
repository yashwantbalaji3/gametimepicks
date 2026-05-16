import type { MlbMarketKey } from "./types-mlb";

const MARKET_LABEL: Record<MlbMarketKey, string> = {
  pitcher_strikeouts: "Strikeouts",
  batter_hits: "Hits",
  batter_total_bases: "Total Bases",
  batter_hits_runs_rbis: "Hits + Runs + RBIs",
};

const MARKET_SHORT: Record<MlbMarketKey, string> = {
  pitcher_strikeouts: "K",
  batter_hits: "H",
  batter_total_bases: "TB",
  batter_hits_runs_rbis: "HRR",
};

export function mlbMarketLabel(k: string): string {
  return MARKET_LABEL[k as MlbMarketKey] ?? k;
}

export function mlbMarketShort(k: string): string {
  return MARKET_SHORT[k as MlbMarketKey] ?? k;
}

export function formatAmericanOdds(odds: number): string {
  if (!Number.isFinite(odds)) return "—";
  const rounded = Math.round(odds);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

/**
 * Render an ET-friendly local tipoff label from a UTC ISO string like
 * "2026-05-16T17:10:00Z". Returns e.g. "1:10 PM ET". Returns the raw
 * string on any parse failure.
 */
export function formatTipoffEt(commenceTimeIso: string | null | undefined): string {
  if (!commenceTimeIso) return "TBD";
  try {
    const d = new Date(commenceTimeIso);
    if (Number.isNaN(d.getTime())) return commenceTimeIso;
    const fmt = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York",
    });
    return `${fmt.format(d)} ET`;
  } catch {
    return commenceTimeIso;
  }
}

/**
 * Display a percentage value (a pp-edge) as e.g. "+7.9%" / "−2.1%".
 * Renders an em-dash for null. Keeps a single decimal point.
 */
export function formatEdgePct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "—";
  const rounded = Math.round(pct * 10) / 10;
  if (rounded > 0) return `+${rounded}%`;
  if (rounded < 0) return `${rounded.toString().replace("-", "−")}%`;
  return "0%";
}

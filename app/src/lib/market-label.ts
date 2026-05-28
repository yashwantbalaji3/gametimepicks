/**
 * Human-readable market label resolver.
 *
 * Pipeline emits internal market keys (`batter_hits`, `pitcher_strikeouts`,
 * `player_points_alternate`, etc.). The UI wants readable labels —
 * "Hits", "Pitcher Ks", "PTS". This module is the single source of
 * truth so the leg row, recent-form drawer, and any future surface all
 * spell the same market the same way.
 *
 * Rules:
 *   - If the snapshot leg carries an explicit `marketLabel` that
 *     differs from the raw `market` key, use it (the pipeline already
 *     made the decision and we should honor it).
 *   - Otherwise map by `(sport, market)`. NBA points / rebounds /
 *     assists, MLB hits / total bases / H+R+RBI / pitcher Ks. Alt-line
 *     variants share the same label since users care about the stat,
 *     not which line they're inspecting.
 *   - Unknown markets fall back to the raw market string or "Stat" if
 *     the input is empty — never throw, never return undefined.
 */

const NBA_LABELS: Record<string, string> = {
  pts: "PTS",
  player_points: "PTS",
  player_points_alternate: "PTS",
  reb: "REB",
  player_rebounds: "REB",
  player_rebounds_alternate: "REB",
  ast: "AST",
  player_assists: "AST",
  player_assists_alternate: "AST",
  player_threes: "3-pointers",
  player_threes_alternate: "3-pointers",
  player_blocks: "Blocks",
  player_steals: "Steals",
};

const MLB_LABELS: Record<string, string> = {
  batter_hits: "Hits",
  batter_hits_alternate: "Hits",
  batter_total_bases: "Total Bases",
  batter_total_bases_alternate: "Total Bases",
  batter_hits_runs_rbis: "H+R+RBI",
  batter_hits_runs_rbis_alternate: "H+R+RBI",
  batter_home_runs: "Home Runs",
  pitcher_strikeouts: "Pitcher Ks",
  pitcher_strikeouts_alternate: "Pitcher Ks",
  pitcher_outs: "Pitcher Outs",
  pitcher_walks: "Pitcher Walks",
  batter_runs_scored: "Runs",
  batter_rbis: "RBIs",
  batter_walks: "Walks",
};

const FALLBACK_LABEL = "Stat";

/** Resolve the human-readable label for a market.
 *
 *  @param sport       Sport key ("nba", "mlb", etc.). Case-insensitive.
 *  @param market      Raw market key from the snapshot.
 *  @param marketLabel Pre-resolved label from the snapshot (may be null).
 */
export function humanMarketLabel(
  sport: string | null | undefined,
  market: string | null | undefined,
  marketLabel?: string | null,
): string {
  const rawMarket = (market ?? "").trim();
  // Honor pipeline-provided labels when they're not just the raw key.
  if (marketLabel && marketLabel.trim() && marketLabel !== rawMarket) {
    return marketLabel.trim();
  }
  const s = (sport ?? "").toLowerCase();
  const m = rawMarket.toLowerCase();
  if (!m) return FALLBACK_LABEL;
  if (s === "nba" && NBA_LABELS[m]) return NBA_LABELS[m];
  if (s === "mlb" && MLB_LABELS[m]) return MLB_LABELS[m];
  // Cross-sport fallback: some keys are unique enough to map without
  // the sport disambiguator (e.g. legacy snapshots stored "pts" only).
  if (NBA_LABELS[m]) return NBA_LABELS[m];
  if (MLB_LABELS[m]) return MLB_LABELS[m];
  return rawMarket || FALLBACK_LABEL;
}

/** Format a leg's "side/line" pair human-readably: "Over 0.5",
 *  "Under 6.5", or "—" when the line is missing. Side strings come
 *  from the snapshot in mixed case; we lowercase the first letter for
 *  display ("Over"/"Under") unless the snapshot already used title
 *  case. */
export function formatSideLine(
  side: string | null | undefined,
  line: number | null | undefined,
): string {
  const s = (side ?? "").trim();
  const sideLabel = s
    ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
    : "";
  const lineLabel = line != null && Number.isFinite(line)
    ? line.toFixed(1)
    : null;
  if (sideLabel && lineLabel) return `${sideLabel} ${lineLabel}`;
  if (sideLabel) return sideLabel;
  if (lineLabel) return lineLabel;
  return "—";
}

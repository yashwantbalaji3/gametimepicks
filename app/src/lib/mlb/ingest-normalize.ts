/**
 * MLB ingestion normalizers — the PURE transform layer of the daily MLB pipeline. They convert raw
 * provider responses (The Odds API for prop odds, MLB Stats API for the schedule) into the committed
 * artifact shapes the app already reads: `mlb/schedule/<date>.json`, `mlb/home-run-props/<date>.json`,
 * and a combined `mlb/player-props/<date>.json` (hits / total bases / strikeouts / RBI / runs).
 *
 * No I/O here — the fetching + writing lives in scripts/ingest-mlb-slate.mjs. Keeping the transforms
 * pure makes them unit-testable with fixture responses and ensures the pipeline never fabricates:
 * an empty provider response yields empty artifacts, not invented picks.
 */

// ── Provider response shapes (subset of fields we use) ──────────────────────────────────────────────
export interface OddsApiEvent { id: string; commence_time: string; home_team: string; away_team: string }
export interface OddsApiOutcome { name: string; description?: string; price: number; point?: number }
export interface OddsApiMarket { key: string; outcomes: OddsApiOutcome[] }
export interface OddsApiBookmaker { key: string; title: string; markets: OddsApiMarket[] }
export interface OddsApiEventOdds extends OddsApiEvent { bookmakers: OddsApiBookmaker[] }

/** The MLB prop markets the pipeline ingests, mapped to the app's market keys + display labels. */
export const MLB_PROP_MARKETS: Record<string, { key: string; label: string; group: "hr" | "hits" | "bases" | "runs" | "pitchers" }> = {
  batter_home_runs: { key: "batter_home_runs", label: "To hit a home run", group: "hr" },
  batter_hits: { key: "batter_hits", label: "Hits", group: "hits" },
  batter_total_bases: { key: "batter_total_bases", label: "Total bases", group: "bases" },
  batter_rbis: { key: "batter_rbis", label: "RBIs", group: "runs" },
  batter_runs_scored: { key: "batter_runs_scored", label: "Runs scored", group: "runs" },
  pitcher_strikeouts: { key: "pitcher_strikeouts", label: "Strikeouts", group: "pitchers" },
  pitcher_outs: { key: "pitcher_outs", label: "Outs recorded", group: "pitchers" },
  pitcher_earned_runs: { key: "pitcher_earned_runs", label: "Earned runs", group: "pitchers" },
};
export const MLB_INGEST_MARKET_KEYS = Object.keys(MLB_PROP_MARKETS);

export interface NormalizedGame { gameId: string; home: string; away: string; commenceTime: string; matchup: string }
export interface NormalizedSchedule { sport: "MLB"; date: string; generatedAt: string; source: string; games: NormalizedGame[] }

export interface NormalizedProp {
  id: string;
  gameId: string;
  matchup: string;
  player: string;
  team: string | null;       // resolved when the outcome maps to a side; else null
  opponent: string | null;
  market: string;
  marketLabel: string;
  group: string;
  selection: string;         // e.g. "Over 0.5"
  point: number | null;
  americanOdds: number;
  provider: string;
  startTimeUtc: string;
}
export interface NormalizedProps { date: string; generatedAt: string; source: string; props: NormalizedProp[] }

const round = (n: number) => Math.round(n);

/** Odds API events → committed schedule artifact. Empty in → empty games out. */
export function normalizeMlbSchedule(events: OddsApiEvent[], date: string, generatedAt: string): NormalizedSchedule {
  const games: NormalizedGame[] = (events ?? [])
    .filter((e) => e?.id && e.home_team && e.away_team && (e.commence_time ?? "").slice(0, 10) === date)
    .map((e) => ({ gameId: String(e.id), home: e.home_team, away: e.away_team, commenceTime: e.commence_time, matchup: `${e.away_team} @ ${e.home_team}` }));
  return { sport: "MLB", date, generatedAt, source: "the-odds-api/baseball_mlb/events", games };
}

/** Pick the best (most favorable to the bettor among the Over side) price per player+market across books.
 *  We surface the OVER side at the lowest line offered, choosing the best available American price. */
export function normalizeMlbProps(eventsOdds: OddsApiEventOdds[], date: string, generatedAt: string): NormalizedProps {
  const props: NormalizedProp[] = [];
  for (const ev of eventsOdds ?? []) {
    if ((ev.commence_time ?? "").slice(0, 10) !== date) continue;
    const matchup = `${ev.away_team} @ ${ev.home_team}`;
    // best price per (player|market|point|side=Over)
    const best = new Map<string, NormalizedProp>();
    for (const bk of ev.bookmakers ?? []) {
      for (const mk of bk.markets ?? []) {
        const meta = MLB_PROP_MARKETS[mk.key];
        if (!meta) continue;
        for (const o of mk.outcomes ?? []) {
          // Over/Yes side only — the home-run + counting markets are surfaced as the "Over" lean.
          const side = (o.name ?? "").toLowerCase();
          if (side !== "over" && side !== "yes") continue;
          const player = o.description ?? o.name;
          if (!player || typeof o.price !== "number") continue;
          const point = typeof o.point === "number" ? o.point : null;
          const id = `${ev.id}:${mk.key}:${player}:${point ?? ""}`;
          const selection = point != null ? `Over ${point}` : "Yes";
          const existing = best.get(id);
          if (!existing || o.price > existing.americanOdds) {
            best.set(id, {
              id, gameId: String(ev.id), matchup, player, team: null, opponent: null,
              market: meta.key, marketLabel: meta.label, group: meta.group, selection, point,
              americanOdds: round(o.price), provider: bk.title ?? bk.key, startTimeUtc: ev.commence_time,
            });
          }
        }
      }
    }
    props.push(...best.values());
  }
  return { date, generatedAt, source: "the-odds-api/baseball_mlb/events/odds", props };
}

/** The home-run subset, in the exact shape the Homer Nukes loader prefers (`mlb/home-run-props/<date>.json`). */
export function extractHomeRunProps(props: NormalizedProps): { date: string; generatedAt: string; source: string; props: NormalizedProp[] } {
  return { date: props.date, generatedAt: props.generatedAt, source: props.source, props: props.props.filter((p) => p.group === "hr") };
}

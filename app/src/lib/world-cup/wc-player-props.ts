/**
 * World Cup player-prop loader (Phase C pilot) — surfaces the REAL, provider-priced player props already
 * ingested into `world-cup/player-projections` (The Odds API: anytime goalscorer, shots, shots on target,
 * assists). Market-IMPLIED reads only (de-vigged book prices) — NO independent per-player model, no
 * fabrication. Settlement is PENDING (no goalscorer/shots settlement source), so these are never
 * product-eligible; the loader carries that status through so the UI can label it honestly.
 *
 * Pure transform (`toWcPlayerProps`) + a thin fs reader. The transform fabricates nothing — it reflects
 * exactly what the ingest wrote (player, team, market, odds, implied prob, bookmaker, lineup status).
 */
import fs from "node:fs";
import path from "node:path";

export type WcPropMarket =
  | "player_goal_scorer_anytime"
  | "player_shots_on_target"
  | "player_shots"
  | "player_assists";

export const WC_PROP_MARKET_LABEL: Record<WcPropMarket, string> = {
  player_goal_scorer_anytime: "Anytime goalscorer",
  player_shots_on_target: "Shots on target",
  player_shots: "Shots",
  player_assists: "Assists",
};

export interface WcPlayerProp {
  player: string;
  team: string | null;
  market: WcPropMarket;
  marketLabel: string;
  pick: string;
  line: number | null;
  americanOdds: number | null;
  /** De-vigged market-implied probability (0-1) — NOT an independent model. */
  impliedProb: number | null;
  bookmaker: string | null;
  lineupStatus: string;
}

export interface WcPlayerPropsFixture {
  fixture: string;
  matchDate: string;
  props: WcPlayerProp[];
}

export interface WcPlayerProps {
  generatedAt: string | null;
  priceSource: string | null;
  identitySource: string | null;
  lineupsPosted: boolean;
  /** Settlement is unsupported for these markets until a scorer/shots settlement source exists. */
  settlementSupport: "unsupported" | "pending";
  count: number;
  marketsCovered: WcPropMarket[];
  fixtures: WcPlayerPropsFixture[];
  caveats: string[];
}

const KNOWN_MARKETS: WcPropMarket[] = [
  "player_goal_scorer_anytime",
  "player_shots_on_target",
  "player_shots",
  "player_assists",
];

/** Pure: parsed artifact → structured, honest player-props (fabricates nothing). */
export function toWcPlayerProps(raw: unknown): WcPlayerProps {
  const a = (raw ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(a.matches) ? (a.matches as Record<string, unknown>[]) : [];
  const caveats = new Set<string>();
  const byFixture = new Map<string, WcPlayerPropsFixture>();

  for (const r of rows) {
    const market = String(r.market ?? "") as WcPropMarket;
    if (!KNOWN_MARKETS.includes(market)) continue;
    const p = (r.player ?? {}) as Record<string, unknown>;
    (Array.isArray(r.dataCaveats) ? (r.dataCaveats as string[]) : []).forEach((c) => caveats.add(c));
    const fixture = String(r.fixture ?? "—");
    if (!byFixture.has(fixture)) {
      byFixture.set(fixture, { fixture, matchDate: String(r.matchDate ?? ""), props: [] });
    }
    byFixture.get(fixture)!.props.push({
      player: String(p.name ?? "Unknown"),
      team: p.team ? String(p.team) : null,
      market,
      marketLabel: WC_PROP_MARKET_LABEL[market],
      pick: String(r.pick ?? ""),
      line: typeof r.line === "number" ? r.line : null,
      americanOdds: typeof r.americanOdds === "number" ? r.americanOdds : null,
      impliedProb: typeof r.marketProbability === "number" ? r.marketProbability : null,
      bookmaker: r.bookmaker ? String(r.bookmaker) : null,
      lineupStatus: String(r.lineupStatus ?? "unknown"),
    });
  }

  const marketsCovered = KNOWN_MARKETS.filter((m) => rows.some((r) => r.market === m));
  return {
    generatedAt: a.generatedAt ? String(a.generatedAt) : null,
    priceSource: a.priceSource ? String(a.priceSource) : null,
    identitySource: a.identitySource ? String(a.identitySource) : null,
    lineupsPosted: a.lineupsPosted === true,
    settlementSupport: "unsupported",
    count: rows.filter((r) => KNOWN_MARKETS.includes(String(r.market ?? "") as WcPropMarket)).length,
    marketsCovered,
    fixtures: [...byFixture.values()],
    caveats: [...caveats],
  };
}

/** Load the current WC player-props artifact (latest.json), or null if absent. */
export function loadWcPlayerProps(dataRoot?: string): WcPlayerProps | null {
  const root = dataRoot ?? path.join(process.cwd(), "public", "data");
  const p = path.join(root, "world-cup", "player-projections", "latest.json");
  try {
    return toWcPlayerProps(JSON.parse(fs.readFileSync(p, "utf8")));
  } catch {
    return null;
  }
}

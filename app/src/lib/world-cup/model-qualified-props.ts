/**
 * MODEL-QUALIFIED player props — the honest bridge between raw sportsbook inventory and what we
 * actually surface as a pick.
 *
 * The slate ships 168 posted player-prop markets. Listing all of them reads like 168 recommendations,
 * which is dishonest: a posted market is INVENTORY, not a pick. This module applies explicit, deterministic
 * model filters and returns ONE top model-qualified pick per (game × market) — or `null` (rendered as
 * "No model-qualified pick") when nothing clears the gates.
 *
 * A prop is model-qualified ONLY when ALL of the following hold:
 *   1. settlement-supported market — one of the four posted, officially-settleable markets (no fabricated
 *      markets; Cards/Other are not offered by the feed → always "No model-qualified pick").
 *   2. odds-backed — a real American price exists AND a bookmaker (provider) is named.
 *   3. pre-event — joinable to a team match with a kickoff that is still in the future (a started game is
 *      never shown as a new playable pick).
 *   4. odds within the addable range — no leg shorter than -500 and no longer than +400 (longer prices are
 *      Moonshot/Specials longshot territory, not a lower-volatility addable leg).
 *   5. role-quality eligible — the player passes the starter / key-attacker gate (goalkeepers, defenders on
 *      attacking props, bench / rotation risk, and unmatched-no-position players are excluded with a reason).
 *   6. clears a market-specific probability floor — the book prices the player as a real threat in that market.
 *
 * Honest by construction: June-23 props are limited-data / market-implied (lineups not posted, edge = 0), so
 * selection is market-implied probability + role quality, and every qualified pick is labelled limited-data.
 * Pure + deterministic — no fabricated odds, players, lineups, or edges.
 */
import fs from "node:fs";
import path from "node:path";
import { classifyPlayerRoles, roleKeyForRow, type PropRowLike } from "./player-role-quality";
import { INDIVIDUAL_LEG_ODDS_GUARDS } from "../parlays/risk-odds-bands";

/** Matrix columns in display order. `sourceMarket` ties a column to a posted feed market; columns
 *  without one (Cards, Other) are not offered by the feed and always render "No model-qualified pick". */
export type PropMarketKey =
  | "anytime_goalscorer"
  | "shots_on_target"
  | "assists"
  | "shots"
  | "cards"
  | "other";

export interface PropMarketColumn {
  key: PropMarketKey;
  label: string;
  shortLabel: string;
  sourceMarket: string | null; // feed market id, or null when not offered
  minProbability: number;      // market-implied floor a pick must clear
  settlement: string;          // how the leg officially settles
}

/** The five named columns + Other. Only the four posted markets can ever qualify a pick. */
export const PROP_MARKET_COLUMNS: PropMarketColumn[] = [
  { key: "anytime_goalscorer", label: "Anytime Goalscorer", shortLabel: "Anytime GS", sourceMarket: "player_goal_scorer_anytime", minProbability: 0.45, settlement: "official goal in regulation (ESPN/FIFA)" },
  { key: "shots_on_target",    label: "Shots on Target",    shortLabel: "SOT",        sourceMarket: "player_shots_on_target",    minProbability: 0.58, settlement: "official shots-on-target stat" },
  { key: "assists",            label: "Assists",             shortLabel: "Assists",    sourceMarket: "player_assists",            minProbability: 0.30, settlement: "official assist stat" },
  { key: "shots",              label: "Shots",               shortLabel: "Shots",      sourceMarket: "player_shots",              minProbability: 0.55, settlement: "official shots stat" },
  { key: "cards",              label: "Cards",               shortLabel: "Cards",      sourceMarket: null,                        minProbability: 1,    settlement: "official booking stat" },
  { key: "other",             label: "Other",               shortLabel: "Other",      sourceMarket: null,                        minProbability: 1,    settlement: "—" },
];

/** Addable-leg odds window. Floor reuses the shared leg guard so this never disagrees with the parlay engine. */
export const QUALIFY_ODDS_MIN = INDIVIDUAL_LEG_ODDS_GUARDS.minFavoriteAmerican; // -500
export const QUALIFY_ODDS_MAX = 400;  // longer than +400 → Moonshot/Specials longshot lane, not an addable leg
export const LOWER_VOLATILITY_MAX = 250; // odds ≤ +250 → "Addable leg" (lower-volatility); above → higher-volatility

export type Volatility = "lower" | "higher";

export interface ModelQualifiedPick {
  gameId: string;
  matchup: string;
  kickoffUtc: string | null;
  kickoffEt: string;
  marketKey: PropMarketKey;
  marketLabel: string;
  market: string;          // feed market id
  selection: string;       // human-readable leg, e.g. "Over 0.5 Shots on Target"
  player: string;
  team: string | null;
  line: number | null;
  odds: number;
  provider: string | null;
  modelConfidence: number; // model/market-implied probability [0-1]
  edge: number;            // edgePct (0 pre-lineup, limited-data)
  volatility: Volatility;
  addable: boolean;        // lower-volatility leg a user could add to a parlay
  risk: string;            // display label: "Lower-volatility" | "Higher-volatility"
  reason: string;
  dataQuality: string;
  isModelPick: true;
}

export interface GamePropRow {
  gameId: string;
  matchup: string;
  kickoffUtc: string | null;
  kickoffEt: string;
  started: boolean;
  cells: Record<PropMarketKey, ModelQualifiedPick | null>;
}

export interface ModelQualifiedPropsResult {
  date: string;
  generatedAt: string | null;
  lineupsPosted: boolean;
  nowIso: string;
  evaluatedCount: number;  // raw sportsbook prop markets evaluated
  qualifiedCount: number;  // model-qualified picks surfaced (non-null cells)
  gameCount: number;
  columns: PropMarketColumn[];
  games: GamePropRow[];
  note: string;
}

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

const COL_BY_SOURCE: Map<string, PropMarketColumn> = new Map(
  PROP_MARKET_COLUMNS.filter((c) => c.sourceMarket).map((c) => [c.sourceMarket as string, c]),
);

/** Minimal shape the model-qualification predicate needs from a (raw or normalized) prop row. */
export interface QualifiableRow {
  market?: string | null;
  americanOdds?: number | null;
  bookmaker?: string | null;        // provider
  modelProbability?: number | null;
  marketProbability?: number | null;
  projectionStatus?: string | null;
}

/**
 * The single source of truth for "is this prop a model pick?" — used by both the matrix and the /build
 * leg pool so they never disagree. Checks settlement-supported market + odds-backed + provider + odds
 * window + market-implied probability floor + role-quality eligibility. (Pre-event is checked by the
 * caller via the team kickoff, since a row carries no kickoff of its own.)
 */
export function modelQualifies(row: QualifiableRow, roleEligible: boolean): boolean {
  if (!roleEligible) return false;
  const col = row.market ? COL_BY_SOURCE.get(row.market) : undefined;
  if (!col) return false; // not a settlement-supported / posted market
  if (row.projectionStatus && row.projectionStatus !== "active") return false;
  const odds = typeof row.americanOdds === "number" ? row.americanOdds : null;
  if (odds == null) return false;
  if (!row.bookmaker) return false;
  if (odds < QUALIFY_ODDS_MIN || odds > QUALIFY_ODDS_MAX) return false;
  const prob = typeof row.modelProbability === "number" ? row.modelProbability
    : (typeof row.marketProbability === "number" ? row.marketProbability : 0);
  return prob >= col.minProbability;
}

interface TeamMatch { eventId: string; kickoffUtc: string | null; home: string; away: string }

/** fixture string → team-projection eventId + kickoff (player props key on a different id). */
function teamMatchByFixture(root: string, date: string): Map<string, TeamMatch> {
  const out = new Map<string, TeamMatch>();
  try {
    const dir = path.join(root, "world-cup", "projections");
    const dated = date ? path.join(dir, `${date}.json`) : "";
    const file = dated && fs.existsSync(dated) ? dated : path.join(dir, "latest.json");
    const team = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const r of team.matches ?? []) {
      const fixture = `${r.homeTeam} vs ${r.awayTeam}`;
      if (!out.has(fixture)) out.set(fixture, { eventId: String(r.matchId), kickoffUtc: r.kickoffUtc ?? null, home: r.homeTeam, away: r.awayTeam });
    }
  } catch { /* no team projections → no join */ }
  return out;
}

const ET_FMT = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
function kickoffEtLabel(kickoffUtc: string | null): string {
  if (!kickoffUtc) return "TBD";
  try { return `${ET_FMT.format(new Date(kickoffUtc))} ET`; } catch { return "TBD"; }
}

/** Build the human-readable selection label for a posted prop row. */
function selectionLabel(col: PropMarketColumn, pick: string, line: number | null): string {
  if (col.key === "anytime_goalscorer") return "Anytime Goalscorer";
  if (line != null) return `${pick} ${line} ${col.label}`;
  return `${col.label} (${pick})`;
}

/**
 * Load the model-qualified player-prop matrix for a slate. Reads the date-specific props + team
 * projections (falls back to latest). Returns an empty (but well-formed) result when the artifact is
 * missing or the date doesn't match the requested slate.
 */
export function loadModelQualifiedProps(root: string, nowIso: string, date: string): ModelQualifiedPropsResult {
  const emptyNote = "Model picks only — sportsbook inventory is hidden unless it passes the model filter. Limited-data / market-implied: lineups not yet posted.";
  const empty: ModelQualifiedPropsResult = {
    date, generatedAt: null, lineupsPosted: false, nowIso,
    evaluatedCount: 0, qualifiedCount: 0, gameCount: 0,
    columns: PROP_MARKET_COLUMNS, games: [], note: emptyNote,
  };

  let pp: { matches?: Array<Record<string, any>>; date?: string; generatedAt?: string; lineupsPosted?: boolean };
  try {
    const dir = path.join(root, "world-cup", "player-projections");
    const dated = date ? path.join(dir, `${date}.json`) : "";
    const file = dated && fs.existsSync(dated) ? dated : path.join(dir, "latest.json");
    pp = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { return empty; }
  if (!date || (pp.date && pp.date !== date)) return empty; // only the current slate's props — never a stale day

  const rows = (pp.matches ?? []) as Array<Record<string, any>>;
  const teamByFixture = teamMatchByFixture(root, date);

  // Role-quality gate over the WHOLE slate (per-team ranking needs all rows at once).
  const roleRows: PropRowLike[] = rows.map((r) => ({
    player: r.player ?? {}, market: r.market, americanOdds: r.americanOdds, modelProbability: r.modelProbability,
  }));
  const roleByKey = classifyPlayerRoles(roleRows, Boolean(pp.lineupsPosted));

  // Group qualifying candidates by game → market.
  interface Cand { row: Record<string, any>; col: PropMarketColumn; tm: TeamMatch; prob: number }
  const byGame = new Map<string, { tm: TeamMatch; matchup: string; cands: Cand[] }>();

  for (const row of rows) {
    const col = COL_BY_SOURCE.get(row.market);
    if (!col) continue; // not a settlement-supported / posted market
    if (row.projectionStatus && row.projectionStatus !== "active") continue;
    const odds = typeof row.americanOdds === "number" ? row.americanOdds : null;
    if (odds == null) continue;                                   // not odds-backed
    if (!row.bookmaker) continue;                                  // no provider
    if (odds < QUALIFY_ODDS_MIN || odds > QUALIFY_ODDS_MAX) continue; // outside addable window
    const tm = teamByFixture.get(String(row.fixture));
    if (!tm) continue;                                            // can't join → can't settle / group by game
    const prob = typeof row.modelProbability === "number" ? row.modelProbability
      : (typeof row.marketProbability === "number" ? row.marketProbability : 0);
    if (prob < col.minProbability) continue;                      // below the market threat floor
    const player = row.player ?? {};
    if (!player.name) continue;
    const role = roleByKey.get(roleKeyForRow({ player }));
    if (!role || !role.eligibleForSpecials) continue;            // role-quality gate (GK/bench/defender/unknown out)

    const matchup = String(row.fixture);
    let g = byGame.get(tm.eventId);
    if (!g) { g = { tm, matchup, cands: [] }; byGame.set(tm.eventId, g); }
    g.cands.push({ row, col, tm, prob });
  }

  // Stable game order = kickoff time, then matchup.
  const games: GamePropRow[] = [];
  let qualifiedCount = 0;
  const orderedGameIds = [...byGame.keys()].sort((a, b) => {
    const ga = byGame.get(a)!, gb = byGame.get(b)!;
    const ka = ga.tm.kickoffUtc ?? "", kb = gb.tm.kickoffUtc ?? "";
    return ka < kb ? -1 : ka > kb ? 1 : ga.matchup.localeCompare(gb.matchup);
  });

  // Ensure every joinable fixture appears (even with all-empty cells) so the matrix shows the full slate.
  const allFixtures = new Set<string>(orderedGameIds);
  for (const [, tm] of teamByFixture) if (!allFixtures.has(tm.eventId)) {
    // include fixtures with no candidates so users see the complete board with honest empties
    byGame.set(tm.eventId, { tm, matchup: `${tm.home} vs ${tm.away}`, cands: [] });
    orderedGameIds.push(tm.eventId);
  }
  orderedGameIds.sort((a, b) => {
    const ga = byGame.get(a)!, gb = byGame.get(b)!;
    const ka = ga.tm.kickoffUtc ?? "", kb = gb.tm.kickoffUtc ?? "";
    return ka < kb ? -1 : ka > kb ? 1 : ga.matchup.localeCompare(gb.matchup);
  });

  for (const gameId of orderedGameIds) {
    const g = byGame.get(gameId)!;
    const started = !!g.tm.kickoffUtc && g.tm.kickoffUtc <= nowIso;
    const cells = Object.fromEntries(PROP_MARKET_COLUMNS.map((c) => [c.key, null])) as Record<PropMarketKey, ModelQualifiedPick | null>;

    if (!started) {
      for (const col of PROP_MARKET_COLUMNS) {
        if (!col.sourceMarket) continue; // Cards/Other never qualify
        const inMarket = g.cands.filter((c) => c.col.key === col.key);
        if (inMarket.length === 0) continue;
        // Rank: higher model probability, then shorter (more likely) price as a tiebreak.
        inMarket.sort((a, b) => (b.prob - a.prob) || (dec(a.row.americanOdds) - dec(b.row.americanOdds)));
        const top = inMarket[0];
        const odds = top.row.americanOdds as number;
        const volatility: Volatility = odds <= LOWER_VOLATILITY_MAX ? "lower" : "higher";
        const player = top.row.player ?? {};
        const role = roleByKey.get(roleKeyForRow({ player }));
        const pick: ModelQualifiedPick = {
          gameId, matchup: g.matchup, kickoffUtc: g.tm.kickoffUtc, kickoffEt: kickoffEtLabel(g.tm.kickoffUtc),
          marketKey: col.key, marketLabel: col.label, market: col.sourceMarket,
          selection: selectionLabel(col, String(top.row.pick ?? "Over"), typeof top.row.line === "number" ? top.row.line : null),
          player: String(player.name), team: player.team ?? null,
          line: typeof top.row.line === "number" ? top.row.line : null,
          odds, provider: top.row.bookmaker ?? null,
          modelConfidence: top.prob, edge: typeof top.row.edgePct === "number" ? top.row.edgePct : 0,
          volatility, addable: volatility === "lower",
          risk: volatility === "lower" ? "Lower-volatility" : "Higher-volatility",
          reason: `${Math.round(top.prob * 100)}% market-implied · ${role?.roleTier?.replace(/_/g, " ") ?? "role"} · ${col.label.toLowerCase()}`,
          dataQuality: String(top.row.dataQuality ?? "limited"),
          isModelPick: true,
        };
        cells[col.key] = pick;
        qualifiedCount += 1;
      }
    }

    games.push({ gameId, matchup: g.matchup, kickoffUtc: g.tm.kickoffUtc, kickoffEt: kickoffEtLabel(g.tm.kickoffUtc), started, cells });
  }

  return {
    date,
    generatedAt: pp.generatedAt ?? null,
    lineupsPosted: Boolean(pp.lineupsPosted),
    nowIso,
    evaluatedCount: rows.length,
    qualifiedCount,
    gameCount: games.length,
    columns: PROP_MARKET_COLUMNS,
    games,
    note: emptyNote,
  };
}

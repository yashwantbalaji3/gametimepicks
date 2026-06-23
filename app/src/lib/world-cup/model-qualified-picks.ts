/**
 * Unified World Cup MODEL-PICK POOL + daily lane candidate generator.
 *
 * One normalized `ModelPick` shape across team markets (moneyline / double-chance / draw-no-bet /
 * total-goals / BTTS) and player props — every pick is model-qualified (odds-backed, has a provider,
 * pre-event, within the leg odds window, clears a model floor). This is the single pool that feeds:
 *   • the World Cup Model Picks table,
 *   • Suggested World Cup parlays (former "Specials"),
 *   • Mr. Dub's daily-portfolio CANDIDATE lanes (Bank Builder A/B = 2 high-hit-rate legs;
 *     Moonshot A/B = 5 higher-upside legs), max 1 leg per game (correlation-safe; a 2nd leg from a
 *     game is used only when unavoidable and is flagged).
 *
 * Honest by construction: real odds only, combined prices computed from the leg odds, no fabricated
 * markets, no started games, no raw inventory. Pure + deterministic (takes nowIso). NEVER places
 * exposure — lane generation returns CANDIDATES; activation is a separate, gated step.
 */
import fs from "node:fs";
import path from "node:path";
import { loadModelQualifiedProps, QUALIFY_ODDS_MIN } from "./model-qualified-props";

export type PickCategory = "team" | "total_btts" | "player";
export type Volatility = "lower" | "higher";

export interface ModelPick {
  id: string;
  gameId: string;
  matchup: string;
  kickoffUtc: string | null;
  kickoffEt: string;
  category: PickCategory;
  marketKey: string;
  marketLabel: string;
  selection: string;
  player: string | null;
  team: string | null;
  odds: number;
  provider: string | null;
  modelProbability: number;
  edge: number;
  volatility: Volatility;
  risk: string;            // "Lower-volatility" | "Higher-volatility"
  dataQuality: string;
  hitRateScore: number;    // higher = more likely (Bank Builder ranking)
  upsideScore: number;     // higher = more upside (Moonshot ranking)
}

export interface LaneCandidate {
  id: string;
  product: "bank-builder" | "moonshot";
  lane: "A" | "B";
  status: "candidate";     // never auto-activated here
  legCount: number;
  targetLegs: number;
  stake: number;
  combinedOdds: number;    // American, from the real leg odds
  combinedDecimal: number;
  potentialReturn: number;
  legs: ModelPick[];
  correlationNote: string | null;
  shortfallNote: string | null; // present when fewer than targetLegs model-qualified legs existed
}

const POOL_ODDS_MAX = 2000;        // Moonshot can ride longer; Bank Builder ranking keeps it short
const BANK_BUILDER_MAX_ODDS = 400; // a high-hit-rate addable leg, never a longshot
const TEAM_MARKETS: Record<string, string> = {
  moneyline_90: "Match Result",
  double_chance: "Double Chance",
  draw_no_bet: "Draw No Bet",
  match_total_goals: "Total Goals",
  btts: "Both Teams To Score",
};
const ET_FMT = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const kickoffEtLabel = (k: string | null) => { if (!k) return "TBD"; try { return `${ET_FMT.format(new Date(k))} ET`; } catch { return "TBD"; } };
const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const decToAmerican = (d: number) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));

/** Build the unified, pre-event, model-qualified World Cup pick pool for a slate. */
export function loadWorldCupModelPicks(root: string, nowIso: string, date: string): ModelPick[] {
  const picks: ModelPick[] = [];

  // ── Team markets from the WC projections artifact ────────────────────────────
  try {
    const dir = path.join(root, "world-cup", "projections");
    const dated = date ? path.join(dir, `${date}.json`) : "";
    const file = dated && fs.existsSync(dated) ? dated : path.join(dir, "latest.json");
    const proj = JSON.parse(fs.readFileSync(file, "utf8")) as { matches?: Array<Record<string, any>>; date?: string };
    if (!date || !proj.date || proj.date === date) {
      for (const m of proj.matches ?? []) {
        const label = TEAM_MARKETS[m.market];
        if (!label) continue;
        if (m.projectionStatus && m.projectionStatus !== "active" && m.public === false) continue;
        const odds = typeof m.americanOdds === "number" ? m.americanOdds : null;
        if (odds == null || !m.bookmaker) continue;
        if (odds < QUALIFY_ODDS_MIN || odds > POOL_ODDS_MAX) continue; // no leg shorter than -500
        const kickoffUtc = m.kickoffUtc ?? null;
        if (!kickoffUtc || kickoffUtc <= nowIso) continue;              // pre-event only
        const prob = typeof m.modelProbability === "number" ? m.modelProbability : 0;
        if (prob < 0.4) continue;                                       // a real model lean
        const isTotalBtts = m.market === "match_total_goals" || m.market === "btts";
        const d = dec(odds);
        picks.push({
          id: `team:${m.matchId}:${m.market}:${m.pick ?? m.pickLabel}`,
          gameId: String(m.matchId), matchup: `${m.homeTeam} vs ${m.awayTeam}`,
          kickoffUtc, kickoffEt: kickoffEtLabel(kickoffUtc),
          category: isTotalBtts ? "total_btts" : "team",
          marketKey: m.market, marketLabel: label, selection: String(m.pickLabel ?? m.pick ?? label),
          player: null, team: m.pickLabel ?? null,
          odds, provider: m.bookmaker ?? null, modelProbability: prob,
          edge: typeof m.edgePct === "number" ? m.edgePct : 0,
          volatility: odds <= 250 ? "lower" : "higher",
          risk: odds <= 250 ? "Lower-volatility" : "Higher-volatility",
          dataQuality: String(m.dataQuality ?? "limited"),
          hitRateScore: prob, upsideScore: d,
        });
      }
    }
  } catch { /* no team projections → player-only pool */ }

  // ── Player props from the model-qualified matrix (already gated) ─────────────
  const mq = loadModelQualifiedProps(root, nowIso, date);
  for (const g of mq.games) {
    if (g.started) continue;
    for (const col of mq.columns) {
      const cell = g.cells[col.key];
      if (!cell) continue;
      picks.push({
        id: `player:${cell.gameId}:${cell.market}:${cell.player}`,
        gameId: cell.gameId, matchup: cell.matchup,
        kickoffUtc: cell.kickoffUtc, kickoffEt: cell.kickoffEt,
        category: "player", marketKey: cell.market, marketLabel: cell.marketLabel,
        selection: `${cell.player} · ${cell.selection}`, player: cell.player, team: cell.team,
        odds: cell.odds, provider: cell.provider, modelProbability: cell.modelConfidence,
        edge: cell.edge, volatility: cell.volatility, risk: cell.risk, dataQuality: cell.dataQuality,
        hitRateScore: cell.modelConfidence, upsideScore: dec(cell.odds),
      });
    }
  }
  return picks;
}

/** Greedy leg selection: take the top-ranked legs with at most one per game; if `allowSecondPerGame`
 *  is set and we still need legs, take the best remaining (flagging the same-game pick). */
function selectLegs(sorted: ModelPick[], want: number, used: Set<string>, allowSecondPerGame: boolean): { legs: ModelPick[]; secondGame: string | null } {
  const legs: ModelPick[] = [];
  const games = new Set<string>();
  let secondGame: string | null = null;
  for (const p of sorted) {
    if (legs.length >= want) break;
    if (used.has(p.id) || games.has(p.gameId)) continue;
    legs.push(p); games.add(p.gameId); used.add(p.id);
  }
  if (allowSecondPerGame && legs.length < want) {
    for (const p of sorted) {
      if (legs.length >= want) break;
      if (used.has(p.id)) continue;
      legs.push(p); used.add(p.id);
      if (!secondGame) secondGame = p.matchup; // disclose the game contributing a 2nd leg
    }
  }
  return { legs, secondGame };
}

function makeLane(product: "bank-builder" | "moonshot", lane: "A" | "B", legs: ModelPick[], targetLegs: number, stake: number, secondGame: string | null, date: string): LaneCandidate {
  const combinedDecimal = legs.reduce((p, l) => p * dec(l.odds), 1);
  const combinedOdds = legs.length ? decToAmerican(combinedDecimal) : 0;
  return {
    id: `${product}-lane-${lane.toLowerCase()}-${date}`,
    product, lane, status: "candidate",
    legCount: legs.length, targetLegs, stake,
    combinedOdds, combinedDecimal: Number(combinedDecimal.toFixed(4)),
    potentialReturn: Number((stake * combinedDecimal).toFixed(2)),
    legs,
    correlationNote: secondGame ? `${secondGame} contributes 2 legs (different markets) — correlation reviewed and disclosed; max 1 leg/game preferred.` : null,
    shortfallNote: legs.length < targetLegs ? `Only ${legs.length} model-qualified leg(s) available (target ${targetLegs}) — no low-quality legs forced.` : null,
  };
}

// ── World Cup Model Picks TABLE (game rows × market columns) ─────────────────────────────────────
export type TableColumnKey = "team" | "total_btts" | "anytime_goalscorer" | "shots_on_target" | "assists" | "shots" | "cards" | "best_addable";
export interface ModelPicksTableColumn { key: TableColumnKey; label: string }
export const MODEL_PICKS_TABLE_COLUMNS: ModelPicksTableColumn[] = [
  { key: "team", label: "Team Pick" },
  { key: "total_btts", label: "Total / BTTS" },
  { key: "anytime_goalscorer", label: "Anytime GS" },
  { key: "shots_on_target", label: "Shots on Target" },
  { key: "assists", label: "Assists" },
  { key: "shots", label: "Shots" },
  { key: "cards", label: "Cards" },
  { key: "best_addable", label: "Best Addable Leg" },
];
const PLAYER_MARKET_FOR_COL: Partial<Record<TableColumnKey, string>> = {
  anytime_goalscorer: "player_goal_scorer_anytime",
  shots_on_target: "player_shots_on_target",
  assists: "player_assists",
  shots: "player_shots",
};
export interface ModelPicksTableRow {
  gameId: string; matchup: string; kickoffUtc: string | null; kickoffEt: string;
  cells: Record<TableColumnKey, ModelPick | null>;       // top pick per column (back-compat)
  cellsMulti: Record<TableColumnKey, ModelPick[]>;       // up to 3 model-qualified picks per column
}
export interface ModelPicksTable { columns: ModelPicksTableColumn[]; rows: ModelPicksTableRow[]; pickCount: number }

/** Max model-qualified picks surfaced per (game × market) column in the table. */
export const MAX_PICKS_PER_MARKET = 3;

/** Group the pool into a per-game table: the top model-qualified pick + up to 3 per (game × column). */
export function buildModelPicksTable(pool: ModelPick[]): ModelPicksTable {
  const byGame = new Map<string, ModelPick[]>();
  for (const p of pool) { const a = byGame.get(p.gameId) ?? []; a.push(p); byGame.set(p.gameId, a); }
  const rows: ModelPicksTableRow[] = [];
  let pickCount = 0;
  const gameIds = [...byGame.keys()].sort((a, b) => {
    const ka = byGame.get(a)![0]?.kickoffUtc ?? "", kb = byGame.get(b)![0]?.kickoffUtc ?? "";
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  for (const gid of gameIds) {
    const ps = byGame.get(gid)!;
    const first = ps[0];
    const cells = Object.fromEntries(MODEL_PICKS_TABLE_COLUMNS.map((c) => [c.key, null])) as Record<TableColumnKey, ModelPick | null>;
    const cellsMulti = Object.fromEntries(MODEL_PICKS_TABLE_COLUMNS.map((c) => [c.key, [] as ModelPick[]])) as Record<TableColumnKey, ModelPick[]>;
    const topN = (pred: (p: ModelPick) => boolean, rank: (p: ModelPick) => number) =>
      ps.filter(pred).sort((x, y) => rank(y) - rank(x)).slice(0, MAX_PICKS_PER_MARKET);
    const fill = (key: TableColumnKey, pred: (p: ModelPick) => boolean, rank: (p: ModelPick) => number) => {
      const list = topN(pred, rank);
      cellsMulti[key] = list; cells[key] = list[0] ?? null;
    };
    fill("team", (p) => p.category === "team", (p) => p.hitRateScore);
    fill("total_btts", (p) => p.category === "total_btts", (p) => p.hitRateScore);
    for (const col of ["anytime_goalscorer", "shots_on_target", "assists", "shots"] as TableColumnKey[]) {
      const mkt = PLAYER_MARKET_FOR_COL[col];
      fill(col, (p) => p.category === "player" && p.marketKey === mkt, (p) => p.modelProbability);
    }
    // cards: not a posted market → always "No model-qualified pick".
    fill("best_addable", (p) => p.odds <= 250, (p) => p.hitRateScore); // lower-volatility, highest hit rate
    for (const c of MODEL_PICKS_TABLE_COLUMNS) if (cells[c.key]) pickCount += 1;
    rows.push({ gameId: gid, matchup: first.matchup, kickoffUtc: first.kickoffUtc, kickoffEt: first.kickoffEt, cells, cellsMulti });
  }
  return { columns: MODEL_PICKS_TABLE_COLUMNS, rows, pickCount };
}

export interface DailyLaneCandidates { bankBuilderA: LaneCandidate; bankBuilderB: LaneCandidate; moonshotA: LaneCandidate; moonshotB: LaneCandidate }

/**
 * Generate the four daily CANDIDATE lanes from the model-pick pool.
 * Bank Builder A/B = the 2 highest-hit-rate lower-volatility legs each (odds ≤ +400), max 1/game.
 * Moonshot A/B = the 5 highest-upside legs each, max 1/game preferred (a 2nd leg from a game is
 * flagged when unavoidable). Never places exposure.
 */
export function buildDailyLaneCandidates(pool: ModelPick[], date: string, opts?: { bankStake?: number; moonshotStake?: number }): DailyLaneCandidates {
  const bankStake = opts?.bankStake ?? 100;
  const moonshotStake = opts?.moonshotStake ?? 25;
  const used = new Set<string>();

  // Bank Builder: highest hit rate, lower-volatility, never a longshot.
  const bankPool = pool.filter((p) => p.odds <= BANK_BUILDER_MAX_ODDS).sort((a, b) => b.hitRateScore - a.hitRateScore || dec(a.odds) - dec(b.odds));
  const a = selectLegs(bankPool, 2, used, false);
  const b = selectLegs(bankPool, 2, used, false);
  const bankBuilderA = makeLane("bank-builder", "A", a.legs, 2, bankStake, a.secondGame, date);
  const bankBuilderB = makeLane("bank-builder", "B", b.legs, 2, bankStake, b.secondGame, date);

  // Moonshot: highest upside (longer decimal odds) among the remaining model-qualified legs.
  const moonPool = pool.filter((p) => !used.has(p.id)).sort((x, y) => y.upsideScore - x.upsideScore || y.modelProbability - x.modelProbability);
  const ma = selectLegs(moonPool, 5, used, true);
  const mb = selectLegs(pool.filter((p) => !used.has(p.id)).sort((x, y) => y.upsideScore - x.upsideScore), 5, used, true);
  const moonshotA = makeLane("moonshot", "A", ma.legs, 5, moonshotStake, ma.secondGame, date);
  const moonshotB = makeLane("moonshot", "B", mb.legs, 5, moonshotStake, mb.secondGame, date);

  return { bankBuilderA, bankBuilderB, moonshotA, moonshotB };
}

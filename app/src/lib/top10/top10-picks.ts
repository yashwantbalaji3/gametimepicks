/**
 * MODEL TOP 10 PICKS — one universal, cross-sport daily board derived ONLY from the real generated
 * artifacts (WC knockout board team markets · WC model-qualified player props · MLB prop leans).
 * Nothing here is fetched or fabricated: every pick carries its source artifact, real odds, and the
 * model/market probabilities those artifacts already hold. Pass leans, completed/started games, and
 * per-game duplicate markets are excluded. Ranking blends settled MARKET RELIABILITY (DC 8-0 …
 * BTTS 1-3 — see lib/methodology/ladder-policy) with the pick's own model probability and edge —
 * NOT raw payout, so a juicy longshot never outranks a reliable read.
 */
import fs from "node:fs";
import path from "node:path";
import { loadRoundOf32Board, type RoundOf32Game } from "@/lib/world-cup/round-of-32";
import { MARKET_RELIABILITY, type LadderMarket } from "@/lib/methodology/ladder-policy";

export interface Top10Pick {
  id: string;
  sport: "world-cup" | "mlb";
  kind: "team" | "prop";
  game: string;               // "Brazil v Norway"
  gameSlug: string | null;    // detail link when one exists
  market: string;             // human label
  selection: string;
  odds: number;               // American
  modelProbability: number | null;
  marketProbability: number | null;
  confidence: string;         // artifact's own tier
  score: number;              // ranking blend (reliability × prob + edge)
  reason: string;             // specific, from real signals — never generic fluff
  risk: string;
  source: string;             // artifact provenance
  startsAt: string | null;    // ISO kickoff/first-pitch
  status: "pregame";
  /** WC country code of the team the pick is ON (double chance / DNB / moneyline) → renders a flag.
   *  null for goal markets (totals / BTTS name no single team) and for MLB. Falls back to a monogram. */
  flagCode?: string | null;
}

export interface Top10Board {
  date: string;
  generatedFrom: string[];
  overall: Top10Pick[];
  safe: Top10Pick[];
  value: Top10Pick[];
  props: Top10Pick[];
  team: Top10Pick[];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const readJson = (p: string): any => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const impliedProb = (american: number): number | null => {
  if (!Number.isFinite(american) || american === 0) return null;
  return round3(american < 0 ? -american / (-american + 100) : 100 / (american + 100));
};

/** WC TEAM candidates from the knockout board — one candidate per (game, market), pregame only. */
function wcTeamPicks(root: string, nowMs: number): Top10Pick[] {
  // Thread the caller's clock so pregame filtering is deterministic (not wall-clock coupled).
  const board = loadRoundOf32Board(root, nowMs);
  if (!board) return [];
  const out: Top10Pick[] = [];
  for (const g of board.games as RoundOf32Game[]) {
    if (g.status !== "live_odds") continue;                       // started/completed/pending → not bettable
    const ko = Date.parse(g.kickoffUtc);
    if (!Number.isFinite(ko) || ko <= nowMs) continue;            // pregame only, real clock
    const p = g.picks; if (!p) continue;
    const draw = p.moneyline?.draw ?? 0;
    const push = (marketKey: LadderMarket, label: string, pick?: { pick: string; americanOdds: number; modelProbability: number }) => {
      if (!pick || !Number.isFinite(pick.americanOdds) || pick.americanOdds === 0) return;
      if (pick.americanOdds <= -700) return;                      // ultra-juiced adds no value
      const rel = MARKET_RELIABILITY[marketKey] * (marketKey === "match_total_goals" && draw >= 0.26 ? 0.75 : 1);
      const mkt = impliedProb(pick.americanOdds);
      const edge = mkt != null ? Math.max(0, pick.modelProbability - mkt) : 0;
      const riskBits = [
        draw >= 0.26 ? `90' draw ${Math.round(draw * 100)}%` : null,
        marketKey === "btts" ? "BTTS is 1-3 settled" : null,
        pick.americanOdds > 150 ? "longer price" : null,
      ].filter(Boolean);
      // Flag the team the pick is ON (draw-protected / match-result markets name one team). Goal
      // markets (totals / BTTS) name no single team → null (component falls back to the sport glyph).
      const flagCode = g.home && pick.pick.includes(g.home) ? g.homeCode : g.away && pick.pick.includes(g.away) ? g.awayCode : null;
      out.push({
        id: `${g.gameSlug}:${marketKey}`,
        sport: "world-cup", kind: "team", flagCode,
        game: `${g.home} v ${g.away}`, gameSlug: g.gameSlug,
        market: label, selection: pick.pick, odds: pick.americanOdds,
        modelProbability: round3(pick.modelProbability), marketProbability: mkt,
        confidence: g.confidence,
        score: round3(rel * pick.modelProbability + edge * 0.5),
        reason: `${Math.round(pick.modelProbability * 100)}% model on a ${label.toLowerCase()} read (${g.confidence.toLowerCase()} game)${marketKey === "double_chance" || marketKey === "draw_no_bet" ? " — draw-protected, the settled 8-0 market family" : ""}${edge > 0.02 && mkt != null ? ` · +${Math.round(edge * 100)}pt edge vs the market` : ""}`,
        risk: riskBits.join(" · ") || "standard single-market risk",
        source: "world-cup/round-of-32/board.json",
        startsAt: g.kickoffUtc, status: "pregame",
      });
    };
    push("double_chance", "Double Chance", p.doubleChance);
    push("draw_no_bet", "Draw No Bet", p.drawNoBet);
    if (p.moneyline) push("moneyline_90", "Moneyline (90′)", { pick: `${p.moneyline.pick} to win`, americanOdds: p.moneyline.americanOdds, modelProbability: p.moneyline.modelProbability });
    push("match_total_goals", "Total Goals", p.total);
    push("btts", "BTTS", p.btts);
  }
  return out;
}

/** WC PLAYER-PROP candidates — only the artifact's own model-qualified rows (parlayEligible/public). */
function wcPropPicks(root: string, date: string, nowMs: number): Top10Pick[] {
  const doc = readJson(path.join(root, "world-cup", "player-projections", `${date}.json`))
    ?? readJson(path.join(root, "world-cup", "player-projections", "latest.json"));
  const rows: any[] = doc?.matches ?? [];
  const out: Top10Pick[] = [];
  for (const r of rows) {
    if (r.projectionStatus !== "active" || r.parlayEligible !== true) continue; // the artifact's own quality gate
    if (typeof r.americanOdds !== "number" || r.americanOdds === 0) continue;
    if (!r.player?.name) continue;
    const prob = typeof r.modelProbability === "number" ? r.modelProbability : null;
    const mkt = typeof r.marketProbability === "number" ? r.marketProbability : impliedProb(r.americanOdds);
    if (prob == null) continue;
    const market = String(r.market || "").replace(/^player_/, "").replace(/_/g, " ");
    out.push({
      id: `${r.matchId ?? r.fixture}:${r.player.name}:${r.market}`,
      sport: "world-cup", kind: "prop",
      game: r.fixture ?? "", gameSlug: null,
      market, selection: `${r.player.name} — ${r.pick}${r.line != null ? ` ${r.line}` : ""} ${market}`,
      odds: r.americanOdds,
      modelProbability: round3(prob), marketProbability: mkt,
      confidence: r.confidence ?? "Lean",
      // WC props settle ~8% historically — a hard 0.5 reliability haircut keeps them honest vs team markets.
      score: round3(0.5 * prob + Math.max(0, prob - (mkt ?? prob)) * 0.5),
      reason: `${Math.round(prob * 100)}% model vs ${mkt != null ? Math.round(mkt * 100) + "%" : "—"} market on ${r.player.team}'s ${r.player.position?.toLowerCase() ?? "player"} (${doc?.lineupsPosted ? "lineups posted" : "pre-lineup"})`,
      risk: "player props are the most volatile market family (~8% settled WC hit) — small stakes only",
      source: `world-cup/player-projections/${doc?.date ?? date}.json`,
      startsAt: null, status: "pregame",
    });
  }
  return out;
}

/** MLB PROP candidates from the daily board leans — non-Pass, pregame, the board's own confidence. */
function mlbPropPicks(root: string, date: string, nowMs: number): Top10Pick[] {
  const board = readJson(path.join(root, "mlb", "boards", `${date}.json`));
  const leans: any[] = board?.leans ?? [];
  const out: Top10Pick[] = [];
  for (const r of leans) {
    if (!r.lean || r.lean === "Pass") continue;                   // Pass leans are NOT picks
    const start = Date.parse(r.commenceTime ?? "");
    if (!Number.isFinite(start) || start <= nowMs) continue;      // pregame only
    const over = r.lean === "Over";
    const odds = over ? r.oddsOver : r.oddsUnder;
    const prob = over ? r.modelProbOver : r.modelProbUnder;
    const mkt = over ? r.impliedOver : r.impliedUnder;
    if (typeof odds !== "number" || odds === 0 || typeof prob !== "number") continue;
    out.push({
      id: r.id,
      sport: "mlb", kind: "prop",
      game: `${r.awayTeamAbbr} @ ${r.homeTeamAbbr}`, gameSlug: null,
      market: r.marketLabel ?? r.marketKey, selection: `${r.playerName} ${r.lean} ${r.line} ${r.marketLabel ?? ""}`.trim(),
      odds, modelProbability: round3(prob), marketProbability: typeof mkt === "number" ? round3(mkt) : impliedProb(odds),
      confidence: r.confidence ?? "Lean",
      // MLB leans settle nightly (validated pipeline) — 0.7 reliability vs team markets' 0.85-1.0.
      score: round3(0.7 * prob + Math.max(0, (r.edgePct ?? 0) / 100) * 0.5),
      reason: r.reason ?? `${Math.round(prob * 100)}% model ${r.lean} ${r.line} from ${r.samples ?? "recent"} games (${r.projection != null ? "proj " + r.projection : "market-implied"})`,
      risk: (Array.isArray(r.riskFlags) && r.riskFlags.length ? r.riskFlags.join(" · ") : "single-player variance"),
      source: `mlb/boards/${date}.json`,
      startsAt: r.commenceTime ?? null, status: "pregame",
    });
  }
  return out;
}

/** Dedupe: at most 2 picks per game and 1 per (game, market family) so the board isn't one fixture. */
function diversify(picks: Top10Pick[], cap = 10): Top10Pick[] {
  const perGame = new Map<string, number>();
  const seenMarket = new Set<string>();
  const out: Top10Pick[] = [];
  for (const p of picks) {
    const mk = `${p.game}:${p.market}`;
    if (seenMarket.has(mk)) continue;
    if ((perGame.get(p.game) ?? 0) >= 2) continue;
    seenMarket.add(mk);
    perGame.set(p.game, (perGame.get(p.game) ?? 0) + 1);
    out.push(p);
    if (out.length >= cap) break;
  }
  return out;
}

/** Build the full Top 10 board for a slate date. Pure read of committed artifacts; `nowMs` from caller. */
export function buildTop10Board(root: string, date: string, nowMs: number): Top10Board {
  const all = [
    ...wcTeamPicks(root, nowMs),
    ...wcPropPicks(root, date, nowMs),
    ...mlbPropPicks(root, date, nowMs),
  ].sort((a, b) => b.score - a.score);

  const team = all.filter((p) => p.kind === "team");
  const props = all.filter((p) => p.kind === "prop");
  const safe = all.filter((p) => (p.modelProbability ?? 0) >= 0.6 && p.odds <= 150);
  const value = all.filter((p) => {
    const edge = p.modelProbability != null && p.marketProbability != null ? p.modelProbability - p.marketProbability : 0;
    return edge > 0.02 && p.odds >= -150;
  });

  return {
    date,
    generatedFrom: [...new Set(all.map((p) => p.source))],
    overall: diversify(all),
    safe: diversify(safe),
    value: diversify(value),
    props: diversify(props),
    team: diversify(team),
  };
}

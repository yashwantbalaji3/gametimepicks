/**
 * Knockout PICK-BOARD view-model — one clean, scannable row per knockout game, derived ONLY from the
 * real generated artifacts (round-of-32 board + player-projections). This is the "best pick per
 * category" layer the sportsbook-style board renders: result / protection / total / BTTS / best player
 * prop, plus score lean, confidence, knockout risk and the same-game parlay previews for row expansion.
 *
 * HARD CONTRACT: nothing is fabricated. A missing market is null (the UI renders "Market pending" /
 * "Not offered"); a completed/started game is never bettable; the best player prop only surfaces from
 * REAL posted rows that clear the model-qualification gate (settlement-supported market, odds window,
 * probability floor, non-GK role) — otherwise `propsPosted:false` and the cell reads pending.
 */
import fs from "node:fs";
import path from "node:path";
import {
  loadRoundOf32Board,
  effectiveRoundOf32Status,
  deriveScoreLean,
  knockoutRisk,
  upsetRisk,
  expectedGameScript,
  buildBoardTeamParlays,
  stageLabel,
  type RoundOf32Game,
  type RoundOf32Status,
  type BoardTeamParlayResult,
} from "./round-of-32";
import { modelQualifies } from "./model-qualified-props";
import { gameDetailParams } from "@/lib/game-detail";

export interface BoardPickCell {
  label: string;          // "Canada to win" / "Over 2.5" / "BTTS No"
  market: string;         // "Moneyline" / "Double Chance" / …
  odds: number;           // real posted American price
  prob: number | null;    // model probability 0..1
}
export interface BoardPlayerPropCell extends BoardPickCell {
  player: string;
  team: string | null;
}
export interface KnockoutBoardRow {
  slug: string;
  home: string; away: string;
  homeCode: string | null; awayCode: string | null;
  kickoffUtc: string; kickoffEt: string; matchDate: string;
  stage: string | null;
  status: RoundOf32Status;      // effective at build; the client re-derives with the real clock
  bettable: boolean;            // live_odds only — completed/started are records, never bettable
  scoreLean: string | null;
  scoreLeanConfidence: "High" | "Medium" | "Low" | null;
  resultPick: BoardPickCell | null;
  protectionPick: BoardPickCell | null;   // best of double-chance / draw-no-bet by model probability
  totalPick: BoardPickCell | null;        // null → "Market pending"
  bttsPick: BoardPickCell | null;         // null → "Market pending"
  bestPlayerProp: BoardPlayerPropCell | null; // null when propsPosted=false → "Props pending"
  propsPosted: boolean;
  confidence: string;
  knockoutRisk: { label: "Low" | "Medium" | "High"; reason: string } | null;
  upsetPct: number | null;
  ctaHref: string | null;
  whyHit: string | null;        // the model's expected game script
  whyFail: string | null;       // the knockout-risk reason (what breaks the pick)
  teamPicks: BoardPickCell[];   // top team markets for the expansion (≤3, by model probability)
  parlays: BoardTeamParlayResult[]; // Safe/Balanced/Aggressive same-game previews (real combined prices)
  note: string | null;
}
export interface KnockoutBoardView {
  generatedAt: string;
  slateLabel: string;
  stage: string;
  horizonEt: string;
  disclaimer: string;
  rows: KnockoutBoardRow[];
}

const MARKET_LABELS: Record<string, string> = {
  player_goal_scorer_anytime: "Anytime goalscorer",
  player_shots_on_target: "Shots on target",
  player_shots: "Shots",
  player_assists: "Assists",
};

/** Best REAL posted player prop per fixture, from the dated player-projections artifact. Model-qualified
 *  only (settlement-supported market, odds window, probability floor); goalkeepers never qualify. */
function bestPropsByFixture(root: string, dates: string[]): Map<string, BoardPlayerPropCell> {
  const best = new Map<string, BoardPlayerPropCell>();
  for (const date of new Set(dates)) {
    let rows: any[] = [];
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(root, "world-cup", "player-projections", `${date}.json`), "utf8"));
      rows = Array.isArray(doc.matches) ? doc.matches : [];
    } catch { continue; }
    for (const r of rows) {
      const position = r?.player?.position ?? null;
      const roleEligible = !!position && position !== "Goalkeeper";
      if (!modelQualifies(r, roleEligible)) continue;
      const prob = typeof r.modelProbability === "number" ? r.modelProbability : null;
      const cell: BoardPlayerPropCell = {
        player: r.player?.name ?? "—",
        team: r.player?.team ?? null,
        market: MARKET_LABELS[r.market] ?? r.market,
        label: `${r.player?.name ?? "—"} · ${MARKET_LABELS[r.market] ?? r.market}${r.line != null ? ` ${r.pick} ${r.line}` : r.pick === "Yes" ? "" : ` ${r.pick}`}`,
        odds: r.americanOdds,
        prob,
      };
      const prev = best.get(r.fixture);
      if (!prev || (prob ?? 0) > (prev.prob ?? 0)) best.set(r.fixture, cell);
    }
  }
  return best;
}

function cellFrom(market: string, p: { pick: string; americanOdds: number; modelProbability: number } | undefined | null): BoardPickCell | null {
  if (!p || typeof p.americanOdds !== "number" || !Number.isFinite(p.americanOdds) || p.americanOdds === 0) return null;
  return { label: p.pick, market, odds: p.americanOdds, prob: typeof p.modelProbability === "number" ? p.modelProbability : null };
}

/** Best protection market: double chance vs draw-no-bet, by model probability (both are real picks). */
function protectionFrom(g: RoundOf32Game): BoardPickCell | null {
  const dc = cellFrom("Double Chance", g.picks?.doubleChance as any);
  const dnb = cellFrom("Draw No Bet", g.picks?.drawNoBet as any);
  if (dc && dnb) return (dc.prob ?? 0) >= (dnb.prob ?? 0) ? dc : dnb;
  return dc ?? dnb;
}

/** Build the full knockout pick-board view. Pure read of real artifacts; fail-closed (null). */
export function buildKnockoutBoardView(root?: string, nowMs?: number): KnockoutBoardView | null {
  const base = root ?? path.join(process.cwd(), "public", "data");
  const board = loadRoundOf32Board(base);
  if (!board) return null;
  const now = nowMs ?? Date.now();

  const detailSlugs = new Set(
    gameDetailParams().filter((p) => p.sport === "world-cup").map((p) => p.gameId),
  );
  const props = bestPropsByFixture(base, board.games.map((g) => g.matchDate));

  const rows: KnockoutBoardRow[] = board.games.map((g) => {
    const status = effectiveRoundOf32Status(g, now);
    const bettable = status === "live_odds";
    const lean = deriveScoreLean(g);
    const ko = knockoutRisk(g);
    const up = upsetRisk(g);
    const fixture = `${g.home} vs ${g.away}`;
    const prop = props.get(fixture) ?? null;
    const ml = g.picks?.moneyline;
    const resultPick = ml ? { label: ml.pick, market: "Moneyline (90′)", odds: ml.americanOdds, prob: ml.modelProbability } : null;
    const protectionPick = protectionFrom(g);
    const totalPick = cellFrom("Total Goals", g.picks?.total as any);
    const bttsPick = cellFrom("BTTS", g.picks?.btts as any);
    const teamPicks = [resultPick, protectionPick, totalPick, bttsPick]
      .filter((c): c is BoardPickCell => !!c)
      .sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0))
      .slice(0, 3);
    const ctaHref =
      status === "live_odds" || status === "completed"
        ? (detailSlugs.has(g.gameSlug) ? `/games/world-cup/${g.gameSlug}` : `/world-cup/round-of-32/${g.gameSlug}`)
        : null;
    return {
      slug: g.gameSlug,
      home: g.home, away: g.away, homeCode: g.homeCode, awayCode: g.awayCode,
      kickoffUtc: g.kickoffUtc, kickoffEt: g.kickoffEt, matchDate: g.matchDate,
      stage: stageLabel(g.stage),
      status, bettable,
      scoreLean: lean.available ? lean.scoreLean : null,
      scoreLeanConfidence: lean.available ? lean.confidence : null,
      resultPick, protectionPick, totalPick, bttsPick,
      bestPlayerProp: prop,
      propsPosted: !!prop,
      confidence: g.confidence,
      knockoutRisk: ko,
      upsetPct: up?.pct ?? null,
      ctaHref,
      whyHit: expectedGameScript(g),
      whyFail: ko ? ko.reason : null,
      teamPicks,
      parlays: bettable ? buildBoardTeamParlays(g) : [],
      note: g.note ?? null,
    };
  });

  return {
    generatedAt: board.generatedAt,
    slateLabel: board.slateLabel,
    stage: board.stage,
    horizonEt: board.horizonEt,
    disclaimer: board.disclaimer,
    rows,
  };
}

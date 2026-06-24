/**
 * Broad WORLD CUP team-leg pool for the Bank Builder safest-card selector. Reads the committed
 * market-outlook (real de-vigged 3-way moneyline + totals from real bookmakers) and emits the FAVORITE
 * moneyline side + the model-favored total for every game on the slate — so the selector can build
 * soccer-first cards from high-hit-rate favorites (e.g. Brazil moneyline, Morocco moneyline).
 *
 * Honesty: real sportsbook prices only (no fabricated lines, no derived/synthetic markets like a computed
 * double chance). modelProbability = the bookmaker's DE-VIGGED win probability for the chosen side. Team
 * logos come from the projections artifact. Pre-event filtering is the CALLER's job (so we can include a
 * just-started slate when generating before tip-off).
 */
import fs from "node:fs";
import path from "node:path";
import type { ModelPick } from "../world-cup/model-qualified-picks";

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const norm = (s: string) => (s || "").toLowerCase().replace(/&/g, "and").replace(/\band\b/g, "").replace(/[^a-z]/g, "");
const readJson = (p: string): any => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

// Bank Builder odds window — wider on the favorite side than WC Specials so strong moneyline favorites
// (e.g. Morocco -550) still qualify as the safest legs.
const ODDS_MIN = -650;
const ODDS_MAX = 400;

/** Build a logo + kickoff lookup from the projections artifact, keyed by normalized "home|away". */
function projectionIndex(root: string, date: string): Map<string, any> {
  const proj = readJson(path.join(root, "world-cup", "projections", `${date}.json`)) ?? readJson(path.join(root, "world-cup", "projections", "latest.json"));
  const idx = new Map<string, any>();
  for (const m of proj?.matches ?? []) {
    if (!m.homeTeam || !m.awayTeam) continue;
    idx.set(`${norm(m.homeTeam)}|${norm(m.awayTeam)}`, m);
  }
  return idx;
}

/**
 * WC team-leg pool for `date` from the market-outlook. One moneyline-favorite leg + one total leg per
 * ready game. modelProbability is the de-vigged market probability of the chosen side. Returns [] when the
 * outlook is missing (fail-closed).
 */
export function loadWorldCupTeamLegs(root: string, _nowIso: string, date: string): ModelPick[] {
  const outlook = readJson(path.join(root, "world-cup", "market-outlook-2026-06-24.json".replace("2026-06-24", date)))
    ?? readJson(path.join(root, "world-cup", `market-outlook-${date}.json`))
    ?? readJson(path.join(root, "world-cup", "market-outlook-latest.json"));
  if (!outlook?.matches) return [];
  const projIdx = projectionIndex(root, date);

  const out: ModelPick[] = [];
  for (const m of outlook.matches) {
    if (!(m.commenceTime ?? "").startsWith(date)) continue; // this slate only
    const r = m.result;
    const proj = projIdx.get(`${norm(m.homeTeam)}|${norm(m.awayTeam)}`);
    const gameId = String(m.oddsEventId ?? proj?.matchId ?? `${m.homeTeam}-${m.awayTeam}`);
    const matchup = `${m.homeTeam} vs ${m.awayTeam}`;
    const kickoffUtc = m.commenceTime ?? proj?.kickoffUtc ?? null;
    const kickoffEt = kickoffUtc ? new Date(kickoffUtc).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET" : "";

    // ── Moneyline favorite (real de-vigged 3-way) ──
    if (r && typeof r.homeWinPct === "number" && typeof r.awayWinPct === "number") {
      const homeFav = r.homeWinPct >= r.awayWinPct;
      const team = homeFav ? m.homeTeam : m.awayTeam;
      const odds = homeFav ? r.homeOdds : r.awayOdds;
      const prob = homeFav ? r.homeWinPct : r.awayWinPct;
      const logo = homeFav ? proj?.homeLogo : proj?.awayLogo;
      if (typeof odds === "number" && odds >= ODDS_MIN && odds <= ODDS_MAX) {
        out.push({
          id: `WORLD_CUP:${gameId}:moneyline_90:${team}`,
          sport: "WORLD_CUP", gameId, matchup, kickoffUtc, kickoffEt,
          category: "team", marketKey: "moneyline_90", marketLabel: "Moneyline (90′)",
          selection: `${team} to win`, player: null, team,
          odds, provider: r.bookmaker ?? null, modelProbability: round4(prob), edge: 0,
          volatility: (prob >= 0.6 ? "low" : "medium") as any, risk: prob >= 0.6 ? "Lower-volatility" : "Higher-volatility",
          dataQuality: "A", hitRateScore: Math.round(prob * 100), upsideScore: Math.round((dec(odds) - 1) * 25),
          teamLogo: logo ?? null, playerId: null, playerPortrait: null,
        });
      }
    }
    // ── Total goals (model-favored side) ──
    const t = m.totals;
    if (t && typeof t.overPct === "number" && typeof t.underPct === "number" && typeof t.line === "number") {
      const over = t.overPct >= t.underPct;
      const odds = over ? t.overOdds : t.underOdds;
      const prob = over ? t.overPct : t.underPct;
      if (typeof odds === "number" && odds >= ODDS_MIN && odds <= ODDS_MAX) {
        out.push({
          id: `WORLD_CUP:${gameId}:match_total_goals:${over ? "over" : "under"}${t.line}`,
          sport: "WORLD_CUP", gameId, matchup, kickoffUtc, kickoffEt,
          category: "total_btts", marketKey: "match_total_goals", marketLabel: "Total Goals",
          selection: `${over ? "Over" : "Under"} ${t.line}`, player: null, team: null,
          odds, provider: t.bookmaker ?? null, modelProbability: round4(prob), edge: 0,
          volatility: "medium" as any, risk: prob >= 0.6 ? "Lower-volatility" : "Higher-volatility",
          dataQuality: "A", hitRateScore: Math.round(prob * 100), upsideScore: Math.round((dec(odds) - 1) * 25),
          teamLogo: proj?.homeLogo ?? null, playerId: null, playerPortrait: null,
        });
      }
    }
  }
  return out;
}

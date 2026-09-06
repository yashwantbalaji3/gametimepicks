/**
 * LIVE team-leg pool for Bank Builder, from the committed MLB team-market artifact.
 *
 * Bank Builder is team/game-markets only, and its pool was the World Cup — a competition that has
 * been archived since long before this file existed. `loadWorldCupTeamLegs` returns 0 picks and has
 * for months; the MLB fill behind it is all player props, which the team-only rule removes. Measured
 * on 2026-09-05: 0 + 0 + (55 → 0). The product could not have produced a card on any slate.
 *
 * `public/data/mlb/team-markets/<date>.json` is the live replacement, generated daily by the MLB
 * board job: real DraftKings prices for moneyline, run line and total across the full slate. It is
 * the same SHAPE of source the World Cup pool read, so this file mirrors that one's contract rather
 * than inventing a second convention.
 *
 * WHAT `modelProbability` MEANS HERE, because the field name overstates it. It is the bookmaker's
 * DE-VIGGED probability — `noVigProb` — exactly as the World Cup team-leg loader used the de-vigged
 * moneyline. It is the market's opinion with the margin removed, not a model's disagreement with the
 * market, and `edge` is 0 for every leg because there is none to claim. This repository's own
 * calibration work demoted every modelled MLB market to market-context, so the market's own number
 * is the honest input for a lower-volatility product.
 *
 * SETTLEABILITY IS A PRECONDITION, not a later concern. Only the three markets
 * `build-mlb-product-settlement.mjs` grades from the committed StatsAPI linescore cache are emitted.
 * A card carrying a leg nobody can grade is unfalsifiable, and this program exists because three
 * such cards sat pending for nineteen days.
 */
import fs from "node:fs";
import path from "node:path";
import type { ModelPick } from "../world-cup/model-qualified-picks";

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const readJson = (p: string): any => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** The same window the World Cup loader used: heavy favourites still qualify as the safest legs,
 *  and nothing longer than +400 belongs in a lower-volatility product. */
const ODDS_MIN = -650;
const ODDS_MAX = 400;

/** Markets `build-mlb-product-settlement.mjs` can grade from a final linescore. Nothing else ships. */
export const SETTLEABLE_TEAM_MARKETS = Object.freeze(["mlb_moneyline", "mlb_total_runs", "mlb_run_line"]);

const etTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET" : "";

const inWindow = (o: unknown): o is number => typeof o === "number" && Number.isFinite(o) && o >= ODDS_MIN && o <= ODDS_MAX;

function pick(
  gameId: string, matchup: string, kickoffUtc: string | null, marketKey: string, marketLabel: string,
  selection: string, team: string | null, odds: number, prob: number, provider: string | null,
): ModelPick {
  return {
    id: `MLB:${gameId}:${marketKey}:${selection.replace(/\s+/g, "_")}`,
    sport: "MLB", gameId, matchup, kickoffUtc, kickoffEt: etTime(kickoffUtc),
    category: marketKey === "mlb_total_runs" ? "total_btts" : "team",
    marketKey, marketLabel, selection,
    player: null,                       // a team leg, and Bank Builder's filter depends on this
    team,
    odds, provider,
    modelProbability: round4(prob),
    edge: 0,                            // the market's own de-vigged number — no edge is claimed
    volatility: (prob >= 0.6 ? "low" : "medium") as ModelPick["volatility"],
    risk: prob >= 0.6 ? "Lower-volatility" : "Higher-volatility",
    dataQuality: "A",
    hitRateScore: Math.round(prob * 100),
    upsideScore: Math.round((dec(odds) - 1) * 25),
    teamLogo: null, playerId: null, playerPortrait: null,
  };
}

/**
 * Every settleable team leg on `date`, or an empty list when the slate has not been priced.
 *
 * Pre-event filtering is the CALLER's job, matching the World Cup loader — generation runs before
 * first pitch and the caller already applies its own started-game guard.
 */
export function loadMlbTeamLegs(root: string, _nowIso: string, date: string): ModelPick[] {
  const doc = readJson(path.join(root, "mlb", "team-markets", `${date}.json`));
  const games = doc?.games;
  if (!games) return [];
  const out: ModelPick[] = [];

  for (const g of Array.isArray(games) ? games : Object.values(games)) {
    const game: any = g;
    const gameId = String(game?.gameId ?? "");
    if (!gameId) continue;
    const matchup = `${game.awayTeam} @ ${game.homeTeam}`;
    const kickoffUtc = game.commenceTime ?? null;
    const provider = game.bookmaker ?? doc.bookmaker ?? null;

    // ── Moneyline: the de-vigged FAVOURITE only. Bank Builder wants the likelier side, and offering
    //    both sides of one game would let the selector build a card against itself.
    const ml = game.moneyline;
    if (ml?.home && ml?.away) {
      const homeFav = (ml.home.noVigProb ?? 0) >= (ml.away.noVigProb ?? 0);
      const side = homeFav ? ml.home : ml.away;
      const team = homeFav ? game.homeTeam : game.awayTeam;
      if (inWindow(side?.odds) && typeof side?.noVigProb === "number") {
        out.push(pick(gameId, matchup, kickoffUtc, "mlb_moneyline", "Moneyline", `${team} to win`, team, side.odds, side.noVigProb, provider));
      }
    }

    // ── Total runs: the de-vigged favoured side of the posted line.
    const t = game.total;
    if (t?.over && t?.under && typeof t.line === "number") {
      const over = (t.over.noVigProb ?? 0) >= (t.under.noVigProb ?? 0);
      const side = over ? t.over : t.under;
      if (inWindow(side?.odds) && typeof side?.noVigProb === "number") {
        out.push(pick(gameId, matchup, kickoffUtc, "mlb_total_runs", "Total Runs",
          `${over ? "Over" : "Under"} ${t.line}`, null, side.odds, side.noVigProb, provider));
      }
    }

    // ── Run line: the side de-vigged to cover. Named `coverNoVigProb` in this artifact, not
    //    `noVigProb` — reading the wrong key here would have emitted every run line at probability 0
    //    and ranked them last for ever, which is the quiet kind of wrong this product already had.
    const rl = game.runLine;
    if (rl?.home && rl?.away) {
      const homeCovers = (rl.home.coverNoVigProb ?? 0) >= (rl.away.coverNoVigProb ?? 0);
      const side = homeCovers ? rl.home : rl.away;
      const team = homeCovers ? game.homeTeam : game.awayTeam;
      if (inWindow(side?.odds) && typeof side?.coverNoVigProb === "number") {
        out.push(pick(gameId, matchup, kickoffUtc, "mlb_run_line", "Run Line",
          `${team} ${side.line > 0 ? "+" : ""}${side.line}`, team, side.odds, side.coverNoVigProb, provider));
      }
    }
  }
  return out;
}

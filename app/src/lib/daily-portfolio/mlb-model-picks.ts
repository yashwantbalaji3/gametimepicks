/**
 * MLB leg pool for the cross-sport Bank Builder safest-card selector. Reads the committed MLB MODEL board
 * (`mlb/boards/<date>.json` leans) and emits ModelPicks in the SAME shape as the World Cup pool, so the BB
 * selector can build cross-sport ladders (e.g. an MLB "batter to record a hit" + a WC double chance).
 *
 * Honesty: real odds only (a leg is dropped without a real bookmaker price). Each leg's modelProbability is
 * the MODEL's own probability — P(outcome) from the board's projection + sigma (recent-form distribution),
 * NOT the raw market price — and `edge` is model vs de-vigged market. The model picks the favored SIDE.
 */
import fs from "node:fs";
import path from "node:path";
import type { ModelPick } from "../world-cup/model-qualified-picks";

const QUALIFY_ODDS_MIN = -500; // no leg shorter than -500 (Bank Builder window)
const POOL_ODDS_MAX = 400;
const MODEL_PROB_FLOOR = 0.5;  // a Bank Builder leg must be model-favored

/** Standard normal CDF via a numerically-stable erf approximation (Abramowitz & Stegun 7.1.26). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  let p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  p = 1 - p;
  return z >= 0 ? p : 1 - p;
}

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const round4 = (n: number) => Math.round(n * 10000) / 10000;

const MARKET_LABELS: Record<string, string> = {
  batter_hits: "Hits",
  pitcher_strikeouts: "Strikeouts",
  batter_total_bases: "Total Bases",
  batter_hits_runs_rbis: "Hits + Runs + RBIs",
};

/**
 * Build the MLB ModelPick pool for a date from the committed model board. Fails closed (returns []) when
 * the board is missing/empty. Only pre-event, real-priced, model-favored legs in the BB odds window.
 */
export function loadMlbModelPicks(root: string, nowIso: string, date: string): ModelPick[] {
  let board: any;
  try {
    const file = path.join(root, "mlb", "boards", `${date}.json`);
    board = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return []; // no board → no MLB legs (fail closed)
  }
  if (board?.isDemo || board?.propsAvailable === false) return [];

  const out: ModelPick[] = [];
  for (const l of board.leans ?? []) {
    const marketKey = String(l.marketKey ?? l.market ?? "");
    const line = typeof l.line === "number" ? l.line : null;
    const projection = typeof l.projection === "number" ? l.projection : null;
    const sigma = typeof l.sigma === "number" && l.sigma > 0 ? l.sigma : null;
    const commenceTime = l.commenceTime ?? null;
    if (line == null || projection == null || sigma == null) continue;
    if (!l.bookmaker) continue;                          // real price required
    if (!commenceTime || commenceTime <= nowIso) continue; // pre-event only

    // Probability is anchored to the DE-VIGGED MARKET (the most reliable "how likely" estimate for a
    // liquid prop), and we take the MARKET-FAVORED side — but only when the model's own projection AGREES
    // that side is favored. This avoids normal-approximation artifacts on skewed count props while keeping
    // an independent model gate (no market-echo without model agreement).
    const io = typeof l.impliedOver === "number" ? l.impliedOver : null;
    const iu = typeof l.impliedUnder === "number" ? l.impliedUnder : null;
    if (io == null || iu == null || io + iu <= 0) continue; // need both prices to de-vig
    const fairOver = io / (io + iu);
    const side: "over" | "under" = fairOver >= 0.5 ? "over" : "under";
    const modelProbability = side === "over" ? fairOver : 1 - fairOver; // de-vigged market prob of the favored side

    // Model (projection) must agree the chosen side is favored, else skip (model + market disagree).
    const projProbOfSide = side === "over"
      ? 1 - normalCdf((line - projection) / sigma)
      : normalCdf((line - projection) / sigma);
    if (projProbOfSide < 0.5) continue;
    if (modelProbability < MODEL_PROB_FLOOR) continue;   // must be a real favorite

    const odds = side === "over" ? l.oddsOver : l.oddsUnder;
    if (typeof odds !== "number" || odds < QUALIFY_ODDS_MIN || odds > POOL_ODDS_MAX) continue;
    const edge = round4(projProbOfSide - modelProbability); // model's edge over the fair market

    const label = MARKET_LABELS[marketKey] ?? marketKey;
    const selection = `${side === "over" ? "Over" : "Under"} ${line} ${label}`;
    out.push({
      id: `MLB:${l.id ?? `${l.gameId}-${l.playerName}-${marketKey}-${line}`}:${side}`,
      sport: "MLB",
      gameId: String(l.gameId ?? l.gamePk ?? ""),
      matchup: `${l.awayTeamAbbr ?? l.awayTeamName ?? "?"} @ ${l.homeTeamAbbr ?? l.homeTeamName ?? "?"}`,
      kickoffUtc: commenceTime,
      kickoffEt: new Date(commenceTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET",
      category: "player",
      marketKey,
      marketLabel: label,
      selection,
      player: l.playerName ?? null,
      team: l.playerTeamAbbr ?? null,
      odds,
      provider: l.bookmaker ?? null,
      modelProbability: round4(modelProbability),
      edge,
      volatility: (modelProbability >= 0.6 ? "low" : "medium") as any,
      risk: modelProbability >= 0.6 ? "Lower-volatility" : "Higher-volatility",
      dataQuality: typeof l.samples === "number" && l.samples >= 40 ? "A" : "B",
      hitRateScore: Math.round(modelProbability * 100),
      upsideScore: Math.round((dec(odds) - 1) * 25),
    });
  }
  return out;
}

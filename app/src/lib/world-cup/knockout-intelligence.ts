/**
 * Knockout intelligence — a SHARED, HONEST ranking layer for Round-of-32 (and later knockout) football.
 *
 * Knockout football is not the group stage: a draw at 90' goes to extra time, favorites manage risk and
 * protect leads, and underdogs sit deep. This module turns that into a ranking signal that every product
 * (Specials themes, per-game prop parlays, Moonshot/Bank-Builder annotations) can share, so they all agree.
 *
 * INTEGRITY: it invents NOTHING. Every signal is derived from the de-vigged market probabilities the books
 * are already pricing (which themselves encode strength/form/injuries/rest) plus the known knockout STAGE.
 * Where the user's wishlist needs data we don't have (Elo, xG, manager tendencies, travel, fatigue), we use
 * the market-implied probability as the honest proxy and SAY SO — we never fabricate a stat model.
 */
import type { ModelPick } from "./model-qualified-picks";

export interface KnockoutContext {
  matchId: string;
  fixture: string;
  knockout: boolean;
  stage: string | null;
  homeTeam: string;
  awayTeam: string;
  pHome: number;          // de-vig 3-way (90') win probabilities
  pDraw: number;
  pAway: number;
  favorite: "home" | "away" | null;
  favoriteTeam: string | null;
  favProb: number;        // max(pHome, pAway)
  tightness: number;      // 0..1 — how close the two sides are (1 = coin flip)
  extraTimeRisk: number;  // 0..1 — likelihood a draw at 90' forces extra time (high draw prob + no clear favorite)
  pUnder: number | null;  // de-vig Under 2.5
  pBttsNo: number | null; // de-vig BTTS No
  defensiveLean: number;  // 0..1 — how much the market expects a cautious, low-event game
  conservatismLean: number; // 0..1 — favorite-protects-lead → prefer lower-variance markets
  contenderTier: "strong-favorite" | "favorite" | "even" | "underdog-live"; // market-implied, NOT a fabricated Elo
  notes: string[];
}

const KNOCKOUT_STAGES = new Set(["r32", "r16", "qf", "sf", "final", "round_of_32", "round_of_16"]);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Build a per-match knockout context from the team-market projection objects (one game = several market rows). */
export function buildKnockoutContexts(teamMatches: Array<Record<string, any>>): Map<string, KnockoutContext> {
  const byGame = new Map<string, Array<Record<string, any>>>();
  for (const m of teamMatches) {
    const id = String(m.matchId ?? "");
    if (!id) continue;
    (byGame.get(id) ?? byGame.set(id, []).get(id)!).push(m);
  }
  const out = new Map<string, KnockoutContext>();
  for (const [id, rows] of byGame) {
    const ml = rows.find((r) => r.market === "moneyline_90");
    const tot = rows.find((r) => r.market === "match_total_goals");
    const btts = rows.find((r) => r.market === "btts");
    const home = ml?.homeTeam ?? rows[0]?.homeTeam ?? "";
    const away = ml?.awayTeam ?? rows[0]?.awayTeam ?? "";
    const o = (side: string) => ml?.outcomes?.find((x: any) => x.side === side)?.modelProbability ?? null;
    const pHome = o("home") ?? 0, pDraw = o("draw") ?? 0, pAway = o("away") ?? 0;
    const favProb = Math.max(pHome, pAway);
    const favorite = pHome === pAway ? null : (pHome > pAway ? "home" : "away");
    const tightness = clamp01(1 - Math.abs(pHome - pAway));
    const extraTimeRisk = clamp01(pDraw * (1 - Math.abs(pHome - pAway))); // even game with a real draw price
    const pUnder = tot?.outcomes?.find((x: any) => x.side === "under")?.modelProbability ?? null;
    const pBttsNo = btts?.outcomes?.find((x: any) => x.side === "no")?.modelProbability ?? null;
    const defensiveLean = clamp01(((pUnder ?? 0.5) + (pBttsNo ?? 0.5)) / 2);
    // A clear favorite in a knockout protects its lead → leans lower-variance late; scaled by how dominant.
    const conservatismLean = clamp01((favProb - 0.45) / 0.4);
    const contenderTier: KnockoutContext["contenderTier"] =
      favProb >= 0.65 ? "strong-favorite" : favProb >= 0.52 ? "favorite" : tightness >= 0.8 ? "even" : "underdog-live";
    const knockout = !!(rows.find((r) => r.knockout) || KNOCKOUT_STAGES.has(String(rows[0]?.stage ?? "").toLowerCase()));
    const notes: string[] = [];
    if (knockout) {
      notes.push("Knockout (single-leg elimination): a draw at 90' goes to extra time, so 90-minute markets price in cautious, lead-protecting football.");
      if (extraTimeRisk >= 0.22) notes.push(`Even matchup (${Math.round(pDraw * 100)}% draw at 90') — real extra-time risk; double chance / draw-no-bet de-risk a 90-minute call.`);
      if (conservatismLean >= 0.5 && favorite) notes.push(`${favorite === "home" ? home : away} is a clear favorite expected to manage the game — lower-variance markets (DC/DNB) fit the knockout script.`);
      if (defensiveLean >= 0.55) notes.push(`Market leans cautious/low-event (Under 2.5 + BTTS No) — typical of a tight knockout tie.`);
    }
    out.set(id, {
      matchId: id, fixture: `${home} vs ${away}`, knockout, stage: rows[0]?.stage ?? null,
      homeTeam: home, awayTeam: away, pHome, pDraw, pAway, favorite,
      favoriteTeam: favorite === "home" ? home : favorite === "away" ? away : null,
      favProb, tightness, extraTimeRisk, pUnder, pBttsNo, defensiveLean, conservatismLean, contenderTier, notes,
    });
  }
  return out;
}

/** A 0.85..1.15 ranking multiplier: rewards legs that FIT the knockout script, gently penalizes legs that
 *  fight it. Used to re-rank cards/legs without ever overriding the de-vig probability itself. */
export function knockoutFitMultiplier(leg: Pick<ModelPick, "marketKey" | "selection" | "odds">, ctx: KnockoutContext | undefined): number {
  if (!ctx || !ctx.knockout) return 1;
  const sel = (leg.selection ?? "").toLowerCase();
  let m = 1;
  const lowerVariance = leg.marketKey === "double_chance" || leg.marketKey === "draw_no_bet";
  if (lowerVariance && ctx.conservatismLean >= 0.4) m += 0.10;                 // DC/DNB suit a favorite managing a tie
  if (leg.marketKey === "match_total_goals" && sel.includes("under") && ctx.defensiveLean >= 0.55) m += 0.08;
  if (leg.marketKey === "btts" && sel.includes("no") && ctx.defensiveLean >= 0.55) m += 0.08;
  if (leg.marketKey === "match_total_goals" && sel.includes("over") && ctx.defensiveLean >= 0.6) m -= 0.08; // overs fight a cagey tie
  if (leg.marketKey === "moneyline_90" && ctx.extraTimeRisk >= 0.25) m -= 0.06;  // straight 90' winner is exposed to extra time
  return Math.max(0.85, Math.min(1.15, m));
}

/** Compact human label for a game's knockout posture (UI eyebrow / card note). */
export function knockoutTierLabel(ctx: KnockoutContext): string {
  if (!ctx.knockout) return "Group-stage dynamics";
  switch (ctx.contenderTier) {
    case "strong-favorite": return `Knockout · clear favorite (${ctx.favoriteTeam})`;
    case "favorite": return `Knockout · slight favorite (${ctx.favoriteTeam})`;
    case "even": return "Knockout · even tie (extra-time live)";
    default: return "Knockout · live underdog";
  }
}

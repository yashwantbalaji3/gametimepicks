/**
 * World Cup EDITORIAL layer — turns the shared knockout-intelligence context + de-vigged market prices
 * into the analyst-voice content that makes every product read like a sportsbook editorial desk wrote it,
 * not an odds combiner: an expected game script, an honest correlation profile, confidence + volatility
 * labels, and a "why these legs belong together" narrative.
 *
 * INTEGRITY: derived ONLY from market-implied probabilities + tournament structure (knockout stage). No
 * fabricated stats, no invented Elo/xG/fatigue numbers. Where a factor (rotation, travel, manager) has no
 * data, the narrative speaks in market/tournament terms ("the price implies…", "knockout caution favors…")
 * and never asserts a number we don't have.
 */
import type { KnockoutContext } from "./knockout-intelligence";

/** Minimal leg shape every product can map onto (ModelPick / SpecialLeg / parlay leg). */
export interface EditorialLeg {
  gameId: string;            // matchId — same id ⇒ same game ⇒ correlated
  marketKey: string;         // moneyline_90 | double_chance | draw_no_bet | match_total_goals | btts | player_*
  selection: string;         // human pick text (used to read over/under, yes/no, side)
  team?: string | null;      // team the leg leans toward (for result/clean-sheet legs)
  player?: string | null;    // player name (player props)
  odds: number;              // American
}

export type Confidence = "High" | "Solid" | "Lean" | "Speculative";
export type Volatility = "Low" | "Medium" | "High" | "Extreme";

const lc = (s: string | null | undefined) => (s ?? "").toLowerCase();

/** Confidence from the combined model probability (P all legs land). */
export function confidenceLabel(jointProb: number): Confidence {
  if (jointProb >= 0.55) return "High";
  if (jointProb >= 0.38) return "Solid";
  if (jointProb >= 0.22) return "Lean";
  return "Speculative";
}

/** Volatility from the combined American price (how wild the payout swing is). */
export function volatilityLabel(combinedAmerican: number): Volatility {
  if (combinedAmerican <= 120) return "Low";
  if (combinedAmerican <= 350) return "Medium";
  if (combinedAmerican <= 900) return "High";
  return "Extreme";
}

/** Does a leg lean toward a HIGH-event (attacking) or LOW-event (defensive) game state? 0 = result-only. */
function eventLean(leg: EditorialLeg): -1 | 0 | 1 {
  const k = leg.marketKey;
  const s = lc(leg.selection);
  if (k === "match_total_goals") return s.includes("over") ? 1 : -1;
  if (k === "btts") return s.includes("no") ? -1 : 1;
  if (k.startsWith("player_")) return 1;                 // any player attacking prop ⇒ high-event lean
  if (k === "draw_no_bet" || k === "double_chance" || k === "moneyline_90") return 0; // result-only
  return 0;
}

/** Honest correlation profile for a parlay's legs — NEVER claims independence when legs share a game. */
export function correlationProfile(legs: EditorialLeg[]): {
  score: number; direction: "independent" | "positive" | "negative" | "mixed"; summary: string;
} {
  const byGame = new Map<string, EditorialLeg[]>();
  for (const l of legs) byGame.set(l.gameId, [...(byGame.get(l.gameId) ?? []), l]);
  const shared = [...byGame.values()].filter((g) => g.length >= 2);
  if (!shared.length) {
    return { score: 0, direction: "independent", summary: "Legs are in different matches — effectively independent; one game's script can't swing the whole slip." };
  }
  // Within each shared game, agreeing event-leans ⇒ positive; opposing leans ⇒ negative tension.
  let positive = 0, negative = 0;
  for (const g of shared) {
    const leans = g.map(eventLean).filter((x) => x !== 0);
    const hi = leans.filter((x) => x === 1).length, lo = leans.filter((x) => x === -1).length;
    if (hi && lo) negative += 1; else positive += 1;
  }
  const sharedLegCount = shared.reduce((n, g) => n + g.length, 0);
  const score = Math.min(1, Number((sharedLegCount / legs.length).toFixed(2)));
  const direction = positive && negative ? "mixed" : negative ? "negative" : "positive";
  const summary =
    direction === "positive"
      ? "Same-game legs that move TOGETHER — if the game flows as expected they tend to hit (or miss) as a bloc. Correlated, not independent; the price reflects one story, not several."
      : direction === "negative"
        ? "Same-game legs in TENSION and NOT independent (one needs goals, another needs them suppressed) — they can't all land in every script; the correlation runs negative, so weigh the combined price with that conflict in mind."
        : "A mix of same-game correlation across more than one match — partly a bloc, partly independent.";
  return { score, direction, summary };
}

/** Expected game script for a single match, in analyst voice, from the de-vig context. */
export function expectedGameScript(ctx: KnockoutContext): string {
  const fav = ctx.favoriteTeam;
  const dog = ctx.favorite === "home" ? ctx.awayTeam : ctx.favorite === "away" ? ctx.homeTeam : null;
  const favPct = Math.round(ctx.favProb * 100);
  const drawPct = Math.round(ctx.pDraw * 100);
  if (ctx.contenderTier === "strong-favorite" && fav) {
    return `${fav} are a clear favorite (${favPct}% to win in 90'); the market expects them to control possession and territory${dog ? ` while ${dog} defend deep and look to spring counters` : ""}. Knockout caution means they'll protect a lead once ahead.`;
  }
  if (ctx.contenderTier === "favorite" && fav) {
    return `${fav} are a slight favorite (${favPct}%) but this is a real contest; expect a measured first half and a game that opens up only if the favorite breaks through. Extra time is a live outcome (${drawPct}% draw at 90').`;
  }
  if (ctx.contenderTier === "even") {
    return `A coin-flip knockout tie (${drawPct}% draw at 90') — both sides have incentive to stay compact and avoid the decisive mistake. High extra-time risk; 90-minute result bets carry that exposure.`;
  }
  return `${dog ?? ctx.awayTeam} are live underdogs being asked to defend and counter; the favorite carries the play but knockout nerves and a deep block keep the door open for a low-scoring upset.`;
}

/** A narrative HEADLINE + story for a longshot/Moonshot lane, read from the legs' own markets/sides — so a
 *  Moonshot tells a believable story ("Low-scoring knockout", "Favorites advance") instead of reading as a
 *  random odds stack. Derived only from the legs; no fabricated data. */
export function moonshotNarrative(legs: EditorialLeg[]): { title: string; story: string } {
  if (!legs.length) return { title: "Moonshot", story: "Awaiting a qualified longshot card." };
  const leans = legs.map(eventLean);
  const defensive = leans.filter((x) => x === -1).length;
  const attacking = legs.filter((l) => l.marketKey.startsWith("player_") || eventLean(l) === 1).length;
  const playerLegs = legs.filter((l) => l.marketKey.startsWith("player_")).length;
  const dogs = legs.filter((l) => (l.marketKey === "moneyline_90" || l.marketKey === "double_chance" || l.marketKey === "draw_no_bet") && l.odds >= 120).length;
  const favs = legs.filter((l) => (l.marketKey === "moneyline_90" || l.marketKey === "double_chance" || l.marketKey === "draw_no_bet") && l.odds <= -120).length;
  const n = legs.length;
  if (defensive >= Math.ceil(n / 2) && defensive >= 2)
    return { title: "Low-scoring knockout", story: "A cautious-ties parlay: the legs all need games to stay tight — unders and no-both-score, exactly the script knockout football tends to follow when neither side wants the decisive mistake." };
  if (dogs >= 2)
    return { title: "Underdog chaos", story: "A bracket-buster: multiple live underdogs and draws priced as longshots. It needs the favorites to slip — improbable individually, but knockout football breeds upsets, and the combined price pays for the risk." };
  if (favs >= 2 && playerLegs === 0)
    return { title: "Favorites advance", story: "The clear favorites all assert themselves and progress — individually likely, but stacking several lifts the price into longshot territory. One upset anywhere breaks it." };
  if (playerLegs >= Math.ceil(n / 2))
    return { title: "Goals from the stars", story: "Leans on the slate's headline attackers delivering — goals, assists and shots from the players the market trusts most. High-event games make it land; a quiet night from any one breaks it." };
  return { title: "Mixed knockout angles", story: "A spread of independent knockout angles across the window — different games, different markets, one longshot ticket. Diversified, so no single game script carries it." };
}

/** Short tournament-context line for a team given its market-implied standing in this tie. */
export function tournamentContext(ctx: KnockoutContext): string {
  switch (ctx.contenderTier) {
    case "strong-favorite": return "Market treats the favorite as a genuine deep-run side — motivated to advance but mindful of rotation and avoiding extra time.";
    case "favorite": return "A favorite the market backs to progress, but without the cushion to coast — knockout pressure keeps it honest.";
    case "even": return "No clear progression edge — the bracket could swing either way; expect risk-averse management from both benches.";
    default: return "An underdog priced to go out, but knockout football and a low block give a puncher's chance — exactly where upsets live.";
  }
}

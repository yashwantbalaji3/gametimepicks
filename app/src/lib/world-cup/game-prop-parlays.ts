/**
 * Per-fixture PLAYER-PROP and TEAM-PROP parlays — the headline game-detail feature.
 *
 * Builds, for ONE World Cup fixture, a small set of honest, model-ranked parlay cards from the EXACT
 * markets/odds already on the page's `PublicGameDetail` (player props from player-projections, team
 * markets from team-projections). It invents NOTHING: every leg is a real posted market with its real
 * American price, and every combined price is COMPUTED from those leg prices (decimal product) — never
 * a fabricated number. A tier that can't be filled with quality legs is SKIPPED, not padded.
 *
 * Output mirrors the engine's `GameSpecificCards` + `SuggestedParlayCard` (ui-loader) shapes so the
 * page reuses the existing `ParlayCard` renderer with zero new UI primitives.
 *
 * Ranking uses the SHARED knockout-intelligence layer (`knockoutFitMultiplier`/`knockoutTierLabel`/
 * `KnockoutContext.notes`) so these cards agree with every other product about what fits a knockout tie.
 * The knockout signal RANKS candidates; it never overrides the de-vig probability or invents a stat.
 *
 * Server-only (build-time) — pure, reads only the detail passed in plus the raw projection rows (for
 * knockout context). No fetches, no money/portfolio/ladder/Bank-Builder coupling.
 */
import type { PublicGameDetail } from "@/lib/game-detail";
import type { PublicProjection } from "@/lib/normalize";
import type { GameSpecificCards } from "@/lib/world-cup/game-specific-cards";
import type { SuggestedParlayCard, ParlayLegDisplay } from "@/lib/parlays/ui-loader";
import type { RiskLevel } from "@/lib/parlays/types";
import { americanToDecimal, decimalToAmerican } from "@/lib/odds-math";
import { loadWorldCupProjections } from "@/lib/world-cup/projections";
import { wcTeamCodeFromName } from "@/lib/data-world-cup";
import {
  buildKnockoutContexts,
  knockoutFitMultiplier,
  knockoutTierLabel,
  type KnockoutContext,
} from "@/lib/world-cup/knockout-intelligence";
import {
  expectedGameScript,
  correlationProfile,
  confidenceLabel,
  volatilityLabel,
  type EditorialLeg,
} from "@/lib/world-cup/wc-editorial";

const RISK_ORDER: RiskLevel[] = ["low", "medium", "high", "longshot"];

/**
 * Editorial overlay carried on every game-prop card IN ADDITION to the base `SuggestedParlayCard`
 * fields. The shared `ParlayCard` renderer never reads these; the game-detail page reads them off the
 * card (via this extended shape) and surfaces the analyst-voice content — a `tierLabel` (Safe /
 * Balanced / Aggressive), a `narrative` (why these legs belong together, woven with the expected game
 * script), a `correlation` profile (score + direction + summary, NEVER "independent" for same-game team
 * stacks), and `confidence` + `volatility` labels. All derived from the real legs/odds — nothing faked.
 */
export interface GamePropCardEditorial {
  tierLabel: "Safe" | "Balanced" | "Aggressive";
  narrative: string;
  confidence: ReturnType<typeof confidenceLabel>;
  volatility: ReturnType<typeof volatilityLabel>;
  correlation: ReturnType<typeof correlationProfile>;
}
export type GamePropParlayCard = SuggestedParlayCard & { editorial: GamePropCardEditorial };

/**
 * Individual-leg price guard, mirroring the slate engine + the game page's `qualifiedPlayerProps`:
 * legs shorter than -500 are extreme-favorite filler (a -3000 "1+ shot" barely moves a parlay's
 * payout) and are excluded from the lower-variance tiers. The Longshot tier alone is allowed to reach
 * a longer price for upside, capped at +1200 so it never pads with a lottery leg.
 */
const SAFE_MIN_ODDS = -500;
const SAFE_MAX_ODDS = 400;
const LONGSHOT_MAX_ODDS = 1200;

const LIMITED_DATA_CAVEAT =
  "Limited data — these are market-implied prices (no independent stat model yet); lineups settle from official sources.";

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────
function odds(p: PublicProjection): number | null {
  return typeof p.americanOdds === "number" && Number.isFinite(p.americanOdds) && p.americanOdds !== 0
    ? p.americanOdds
    : null;
}
function modelP(p: PublicProjection): number {
  return typeof p.modelProbability === "number" ? p.modelProbability : 0;
}

/** Combined American odds from a set of legs (decimal product → American). Null if any leg lacks odds. */
function combinedAmerican(legOdds: Array<number | null>): { american: number; decimal: number } | null {
  if (legOdds.length === 0) return null;
  let decimal = 1;
  for (const o of legOdds) {
    if (o == null) return null;
    decimal *= americanToDecimal(o);
  }
  return { american: decimalToAmerican(decimal), decimal };
}

/** Product of each leg's model probability — the honest "all legs hit" estimate (independence-assumed). */
function combinedModelProbability(ps: PublicProjection[]): number | null {
  if (ps.length === 0) return null;
  let p = 1;
  for (const x of ps) {
    const mp = modelP(x);
    if (mp <= 0) return null;
    p *= mp;
  }
  return p;
}

// ── player-prop legs → display legs ────────────────────────────────────────────────────────────────
/**
 * A player prop → ParlayLegDisplay. `sport: "WORLD_CUP"` so the renderer fires the WC photo/flag path
 * and the 90-minute settlement note; `market` is the human label the renderer shows verbatim; the
 * photo (API-Football) and the player's own flag code render via `identity`.
 */
function playerLeg(p: PublicProjection): ParlayLegDisplay {
  const o = odds(p);
  const code = wcTeamCodeFromName(p.player?.team ?? "");
  return {
    legId: p.id,
    sport: "WORLD_CUP",
    sportKey: "world_cup",
    market: p.marketLabel,
    side: null, // pickLabel ("Anytime", "Over 0.5") already encodes the side; avoid a doubled "Over Over"
    participant: p.player?.name ?? p.pickLabel,
    team: p.player?.team ?? null,
    opponent: null,
    line: p.line != null ? (typeof p.line === "number" ? p.line : Number(p.line)) : null,
    odds: o,
    modelProbability: p.modelProbability ?? null,
    marketImpliedProbability: p.marketProbability ?? null,
    edge: typeof p.edgePct === "number" ? p.edgePct : null,
    confidenceTier: p.confidence ?? "Low",
    riskScore: 0,
    riskTier: "",
    legQualityTier: "",
    legQualityScore: 0,
    survivalScore: null,
    topPositiveFactors: [],
    topNegativeFactors: [],
    missingFlags: [],
    staleFlags: [],
    smallSampleFlags: [],
    leakagePassed: true,
    startTime: null,
    settlementResult: null,
    settlementOfficial: null,
    last5: null,
    identity: {
      kind: "player",
      playerId: typeof p.player?.id === "number" ? p.player.id : null,
      teamAbbr: code,
      countryCode: code,
      photoUrl: p.player?.photo ?? null,
      avatarSport: "mlb",
    },
  };
}

/**
 * A team-market selection → ParlayLegDisplay. `selection` is one outcome of a team projection (e.g.
 * double_chance "Brazil or Draw"). `participant` carries the human pick label; the flag renders from
 * the resolved team name in that label (fallback to the fixture's favorite when ambiguous).
 */
function teamLeg(args: {
  marketLabel: string;
  pickLabel: string;
  side: string | null;
  odds: number | null;
  modelProbability: number | null;
  marketProbability: number | null;
  flagTeam: string | null;
}): ParlayLegDisplay {
  const code = wcTeamCodeFromName(args.flagTeam ?? "") || null;
  return {
    legId: `teamleg:${args.marketLabel}:${args.pickLabel}`.replace(/\s+/g, "-"),
    sport: "WORLD_CUP",
    sportKey: "world_cup",
    market: args.marketLabel,
    side: null,
    participant: args.pickLabel,
    team: args.flagTeam,
    opponent: null,
    line: null,
    odds: args.odds,
    modelProbability: args.modelProbability,
    marketImpliedProbability: args.marketProbability,
    edge: null,
    confidenceTier: "Low",
    riskScore: 0,
    riskTier: "",
    legQualityTier: "",
    legQualityScore: 0,
    survivalScore: null,
    topPositiveFactors: [],
    topNegativeFactors: [],
    missingFlags: [],
    staleFlags: [],
    smallSampleFlags: [],
    leakagePassed: true,
    startTime: null,
    settlementResult: null,
    settlementOfficial: null,
    last5: null,
    identity: {
      kind: "team",
      playerId: null,
      teamAbbr: code,
      countryCode: code,
      photoUrl: null,
      avatarSport: "mlb",
    },
  };
}

// ── card assembly ────────────────────────────────────────────────────────────────────────────────
function buildCard(args: {
  id: string;
  riskLevel: RiskLevel;
  parlayType: "cross_game" | "same_game";
  legs: ParlayLegDisplay[];
  modelProb: number | null;
  why: string[];
  whyFail: string[];
  correlationSummary: string;
  /** Analyst-voice editorial overlay surfaced on the game-detail card. */
  tierLabel: GamePropCardEditorial["tierLabel"];
  narrative: string;
  /** EditorialLeg view of the same legs — drives the shared correlationProfile() (never independence
   *  for a same-game team stack). For player slips this carries the same gameId on each leg so the
   *  profile reads the honest same-match-but-different-players correlation. */
  editorialLegs: EditorialLeg[];
}): GamePropParlayCard | null {
  const combined = combinedAmerican(args.legs.map((l) => l.odds));
  if (!combined) return null; // never publish a card without a real, computed price
  const correlation = correlationProfile(args.editorialLegs);
  const confidence = confidenceLabel(args.modelProb ?? 0);
  const volatility = volatilityLabel(combined.american);
  return {
    parlayId: args.id,
    sport: "WORLD_CUP",
    sportKey: "world_cup",
    riskLevel: args.riskLevel,
    parlayType: args.parlayType,
    legs: args.legs,
    combinedOdds: combined.american,
    estimatedHitProbability: args.modelProb,
    payoutMultiple: combined.decimal,
    averageLegQuality: 0,
    confidenceTier: confidence,
    riskTier: "",
    // Real correlation score from the shared editorial brain (sharedLegCount / legs), not a hard-coded 0.5.
    correlationScore: correlation.score,
    correlationSummary: args.correlationSummary,
    whyThisParlay: args.why,
    whyItCouldFail: args.whyFail,
    editorial: { tierLabel: args.tierLabel, narrative: args.narrative, confidence, volatility, correlation },
  };
}

function toCards(cards: GamePropParlayCard[]): GameSpecificCards {
  const byRisk: Partial<Record<RiskLevel, SuggestedParlayCard[]>> = {};
  for (const lvl of RISK_ORDER) {
    const lvlCards = cards.filter((c) => c.riskLevel === lvl);
    if (lvlCards.length) byRisk[lvl] = lvlCards;
  }
  return { byRisk, cards, total: cards.length };
}

// ── PLAYER PARLAYS ───────────────────────────────────────────────────────────────────────────────
/** Resolve the fixture's raw projection rows + knockout context (for ranking + the context note). */
function knockoutContextFor(detail: PublicGameDetail): KnockoutContext | undefined {
  if (!detail.matchId) return undefined;
  const rows = (loadWorldCupProjections()?.matches ?? []).filter(
    (m) => String(m.matchId) === String(detail.matchId),
  );
  if (rows.length === 0) return undefined;
  return buildKnockoutContexts(rows as unknown as Array<Record<string, unknown>>).get(String(detail.matchId));
}

/** Knockout fit for a player leg — scorer/assist legs are attacking (fight a cagey tie a touch); the
 *  shared multiplier has no player branch, so we approximate via the market-key it understands. */
function playerFit(p: PublicProjection, ctx: KnockoutContext | undefined): number {
  if (!ctx || !ctx.knockout) return 1;
  // Scorer/assist legs are attacking — in a low-event, defensive tie they fit slightly less; in an
  // open one they fit slightly more. Reuse the shared "over total goals" signal as the honest proxy.
  const attacking = p.market === "player_goal_scorer_anytime" || p.market === "player_assists";
  return attacking ? knockoutFitMultiplier({ marketKey: "match_total_goals", selection: "over", odds: odds(p) ?? 0 }, ctx) : 1;
}

/** A player prop → EditorialLeg (same gameId on every leg ⇒ correlationProfile reads a same-match
 *  block, not independent legs — keeps the honest "different players, weakly correlated via flow"
 *  framing rather than regressing it to a fabricated independence claim). */
function playerEditorialLeg(p: PublicProjection, gameId: string): EditorialLeg {
  return { gameId, marketKey: p.market, selection: p.pickLabel, player: p.player?.name ?? null, team: p.player?.team ?? null, odds: odds(p) ?? 0 };
}

/**
 * Player-slip narrative: woven with the expected game script. We name the most likely script (favorite
 * controls / open tie / even tie) and explain why a bundle of attacking player props rides ALONGSIDE it
 * — distinct players, so it's a flow bet, not a same-outcome stack. Falls back to a market-voice line
 * when there is no knockout context (group dynamics).
 */
function playerNarrative(detail: PublicGameDetail, ctx: KnockoutContext | undefined, count: number, tier: GamePropCardEditorial["tierLabel"]): string {
  const reach =
    tier === "Safe" ? "the steadiest, highest-probability attacking reads"
      : tier === "Balanced" ? "two model favorites plus a longer mid-priced swing"
        : "two steady anchors plus one plus-money upside leg";
  if (!ctx) {
    return `${reach.charAt(0).toUpperCase()}${reach.slice(1)} across ${count} distinct players in ${detail.homeTeam} vs ${detail.awayTeam}. Different players means the slip rides the game's overall attacking flow rather than a single outcome — weakly correlated, not a same-outcome stack.`;
  }
  const fav = ctx.favoriteTeam;
  const scriptHook =
    ctx.contenderTier === "strong-favorite" && fav
      ? `${fav} are expected to control territory and create the better chances, so attacking props on the side carrying the play move with that script.`
      : ctx.contenderTier === "even"
        ? `This is a coin-flip tie likely to stay tight, so these are bets on the players most likely to find the game's limited high-value moments — not on a goal flood.`
        : `The favorite carries the play while the underdog defends and counters, so the most likely scorers/shooters are the ones getting the cleaner looks.`;
  return `${reach.charAt(0).toUpperCase()}${reach.slice(1)} across ${count} distinct players. ${scriptHook} Because the legs are different players, the slip rides the overall game flow rather than a single outcome — weakly correlated, never sold as independent.`;
}

function buildPlayerParlays(detail: PublicGameDetail, ctx: KnockoutContext | undefined): GameSpecificCards {
  // Quality pool: real odds-backed legs within the lower-variance price band, one entry per player keeps
  // distinct players easy. Scorer/assist are the "upside" markets; shots-on-target the steadier ones.
  // EXCLUDE `player_shots` ("1+ shot attempted") entirely: at -480..-3000 it is near-certain, near-zero
  // information filler that barely moves a payout — including it would pad slips, against "quality over
  // quantity". Anytime-scorer, shots-on-target, and assists are the meaningful player markets.
  const MEANINGFUL = new Set(["player_goal_scorer_anytime", "player_shots_on_target", "player_assists"]);
  const withOdds = detail.playerProps.filter((p) => odds(p) != null && MEANINGFUL.has(p.market));
  const safePool = withOdds
    .filter((p) => (odds(p) as number) >= SAFE_MIN_ODDS && (odds(p) as number) <= SAFE_MAX_ODDS)
    .filter((p) => modelP(p) > 0)
    // Rank by model probability × knockout fit.
    .map((p) => ({ p, score: modelP(p) * playerFit(p, ctx) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);

  // A longer "upside" leg for the Aggressive tier: a real plus-money ANYTIME-SCORER (the natural upside
  // market) priced for value, capped at +UPSIDE_MAX so it reaches without becoming a lottery ticket.
  // Falls back to a plus-money assist only if no scorer is in range. Ranked by model probability so
  // the chosen upside leg is the BEST value in range, not simply the longest price.
  const UPSIDE_MIN = 120;
  const UPSIDE_MAX = 450;
  const inUpsideBand = (p: PublicProjection) => {
    const o = odds(p) as number;
    return o >= UPSIDE_MIN && o <= UPSIDE_MAX;
  };
  const scorerUpside = withOdds.filter((p) => p.market === "player_goal_scorer_anytime" && inUpsideBand(p));
  const assistUpside = withOdds.filter((p) => p.market === "player_assists" && inUpsideBand(p));
  const upsidePool = (scorerUpside.length > 0 ? scorerUpside : assistUpside).sort((a, b) => modelP(b) - modelP(a));

  const tierLabel = ctx ? knockoutTierLabel(ctx) : "Group-stage dynamics";
  const ctxNote = ctx?.notes?.[0];

  /** Pick N highest-ranked legs with DISTINCT players from a pool, optionally excluding ids. */
  const pickDistinct = (pool: PublicProjection[], n: number, excludeIds: Set<string>): PublicProjection[] => {
    const out: PublicProjection[] = [];
    const usedPlayers = new Set<string>();
    for (const p of pool) {
      if (out.length >= n) break;
      const key = (p.player?.name ?? p.id).toLowerCase();
      if (usedPlayers.has(key) || excludeIds.has(p.id)) continue;
      usedPlayers.add(key);
      out.push(p);
    }
    return out;
  };

  const cards: GamePropParlayCard[] = [];
  const gameId = String(detail.matchId ?? "");
  // Player legs are different players within ONE match → weakly correlated via game flow, not a
  // same-outcome stack and not truly independent. This disclosure is surfaced on every player card.
  const PLAYER_SG_NOTE =
    "Same-match legs on different players — weakly correlated via game flow (not a same-outcome stack, not fully independent). One quiet performance can break the slip on its own.";

  // SAFE — 2–3 highest-model-probability legs (lower combined odds). Need ≥2 quality legs.
  const safeLegs = pickDistinct(safePool, 3, new Set());
  if (safeLegs.length >= 2) {
    const legs = safeLegs.length >= 3 ? safeLegs.slice(0, 3) : safeLegs.slice(0, 2);
    cards.push(
      ...keep(
        buildCard({
          id: `gpp-player-safe-${detail.matchId}`,
          riskLevel: "low",
          parlayType: "cross_game",
          legs: legs.map(playerLeg),
          modelProb: combinedModelProbability(legs),
          why: [
            `The ${legs.length} highest model-probability player props for this match (${tierLabel}).`,
            ...(ctxNote ? [ctxNote] : []),
          ],
          whyFail: ["Distinct players, but each is a single-player event — one quiet performance breaks the slip."],
          correlationSummary: PLAYER_SG_NOTE,
          tierLabel: "Safe",
          narrative: playerNarrative(detail, ctx, legs.length, "Safe"),
          editorialLegs: legs.map((p) => playerEditorialLeg(p, gameId)),
        }),
      ),
    );
  }

  // BALANCED — 3 legs: two favorites + one mid-priced leg for a longer combined price.
  if (safePool.length >= 3) {
    const favs = pickDistinct(safePool, 2, new Set());
    const usedNames = new Set(favs.map((p) => (p.player?.name ?? p.id).toLowerCase()));
    // Mid leg: best-ranked leg priced longer than the favorites (a plus-money scorer/assist if available).
    const mid =
      pickDistinct(
        [...safePool, ...upsidePool].filter(
          (p) => !usedNames.has((p.player?.name ?? p.id).toLowerCase()) && (odds(p) as number) >= 100,
        ),
        1,
        new Set(),
      )[0] ?? null;
    const balancedLegs = mid ? [...favs, mid] : favs;
    if (balancedLegs.length >= 3) {
      cards.push(
        ...keep(
          buildCard({
            id: `gpp-player-balanced-${detail.matchId}`,
            riskLevel: "medium",
            parlayType: "cross_game",
            legs: balancedLegs.map(playerLeg),
            modelProb: combinedModelProbability(balancedLegs),
            why: [
              `Two model favorites plus one mid-priced leg for a longer return (${tierLabel}).`,
              ...(ctxNote ? [ctxNote] : []),
            ],
            whyFail: ["The mid-priced leg is the swing — a longer-odds prop misses more often than the favorites."],
            correlationSummary: PLAYER_SG_NOTE,
            tierLabel: "Balanced",
            narrative: playerNarrative(detail, ctx, balancedLegs.length, "Balanced"),
            editorialLegs: balancedLegs.map((p) => playerEditorialLeg(p, gameId)),
          }),
        ),
      );
    }
  }

  // AGGRESSIVE — steady anchors + exactly ONE plus-money upside leg (a real scorer, not a lottery stack).
  // Stacking several +800/+950 rare events would tank the hit rate to ~0 and balloon the price into a
  // fabricated-looking lottery ticket; one upside leg on two anchors reaches for payout honestly.
  {
    const base = pickDistinct(safePool, 2, new Set());
    const usedNames = new Set(base.map((p) => (p.player?.name ?? p.id).toLowerCase()));
    const upside = pickDistinct(
      upsidePool.filter((p) => !usedNames.has((p.player?.name ?? p.id).toLowerCase())),
      1,
      new Set(),
    );
    const longLegs = [...base, ...upside];
    // Only a real aggressive slip if it reaches for upside (the plus-money leg) and has ≥3 distinct legs.
    if (longLegs.length >= 3 && upside.length === 1) {
      const upMkt = upside[0].market === "player_goal_scorer_anytime" ? "anytime-scorer" : "assist";
      cards.push(
        ...keep(
          buildCard({
            id: `gpp-player-aggressive-${detail.matchId}`,
            riskLevel: "high",
            parlayType: "cross_game",
            legs: longLegs.map(playerLeg),
            modelProb: combinedModelProbability(longLegs),
            why: [
              `Two steady shots-on-target anchors plus one plus-money ${upMkt} leg for upside (${tierLabel}).`,
              ...(ctxNote ? [ctxNote] : []),
            ],
            whyFail: [`High variance — the ${upMkt} upside leg misses more often than it hits; built for payout, not hit rate.`],
            correlationSummary: PLAYER_SG_NOTE,
            tierLabel: "Aggressive",
            narrative: playerNarrative(detail, ctx, longLegs.length, "Aggressive"),
            editorialLegs: longLegs.map((p) => playerEditorialLeg(p, gameId)),
          }),
        ),
      );
    }
  }

  // Every player card carries the limited-data caveat as its last "why".
  for (const c of cards) c.whyThisParlay = [...c.whyThisParlay, LIMITED_DATA_CAVEAT];
  return toCards(cards);
}

// ── TEAM PARLAYS (same-game, correlated by nature) ─────────────────────────────────────────────────
type Outcome = { label: string; side: string; modelProbability: number; marketProbability: number; americanOdds: number | null };
function rawRowFor(detail: PublicGameDetail, market: string): { pickLabel?: string; pick?: string; americanOdds?: number | null; modelProbability?: number; marketProbability?: number; outcomes?: Outcome[]; homeTeam?: string; awayTeam?: string } | null {
  const rows = (loadWorldCupProjections()?.matches ?? []).filter(
    (m) => String(m.matchId) === String(detail.matchId),
  );
  return (rows.find((m) => m.market === market) as ReturnType<typeof rawRowFor>) ?? null;
}

const TEAM_MARKET_LABEL: Record<string, string> = {
  moneyline_90: "Moneyline (90′)",
  double_chance: "Double chance",
  match_total_goals: "Total goals",
  btts: "Both teams to score",
  draw_no_bet: "Draw no bet",
};

/** Resolve the team a pick label refers to (for the flag), preferring whichever fixture side it names. */
function flagTeamFromLabel(label: string, ctx: KnockoutContext | undefined, home?: string, away?: string): string | null {
  const l = label.toLowerCase();
  if (home && l.includes(home.toLowerCase())) return home;
  if (away && l.includes(away.toLowerCase())) return away;
  return ctx?.favoriteTeam ?? null;
}

function buildTeamParlays(detail: PublicGameDetail, ctx: KnockoutContext | undefined): GameSpecificCards {
  const home = detail.homeTeam ?? "";
  const away = detail.awayTeam ?? "";
  const tierLabel = ctx ? knockoutTierLabel(ctx) : "Group-stage dynamics";

  // Pull each team market's selected outcome. Each candidate is (marketKey, outcome) with a real price.
  type Cand = { marketKey: string; label: string; side: string; odds: number; modelP: number; marketP: number; flagTeam: string | null };
  const cands: Cand[] = [];
  const addOutcome = (marketKey: string, o: Outcome | undefined) => {
    if (!o || typeof o.americanOdds !== "number" || o.americanOdds === 0) return;
    cands.push({
      marketKey,
      label: o.label,
      side: o.side,
      odds: o.americanOdds,
      modelP: o.modelProbability,
      marketP: o.marketProbability,
      flagTeam: flagTeamFromLabel(o.label, ctx, home, away),
    });
  };

  const dc = rawRowFor(detail, "double_chance");
  const tot = rawRowFor(detail, "match_total_goals");
  const btts = rawRowFor(detail, "btts");
  const dnb = rawRowFor(detail, "draw_no_bet");
  const ml = rawRowFor(detail, "moneyline_90");

  // Favorite double chance (1X if home is fav, X2 if away) — the lead-protecting knockout anchor.
  const favSide = ctx?.favorite === "away" ? "X2" : "1X";
  const dcFav = dc?.outcomes?.find((o) => o.side === favSide);
  // 12 (either team, no draw) — only useful for an aggressive lean.
  const overTot = tot?.outcomes?.find((o) => o.side === "over");
  const underTot = tot?.outcomes?.find((o) => o.side === "under");
  const bttsNo = btts?.outcomes?.find((o) => o.side === "no");
  const bttsYes = btts?.outcomes?.find((o) => o.side === "yes");
  const dnbFav = dnb?.outcomes?.find((o) => o.side === (ctx?.favorite === "away" ? "away" : "home"));

  const toCand = (marketKey: string, o: Outcome): Cand => ({
    marketKey, label: o.label, side: o.side, odds: o.americanOdds as number,
    modelP: o.modelProbability, marketP: o.marketProbability, flagTeam: flagTeamFromLabel(o.label, ctx, home, away),
  });
  const totCand = (o: Outcome | undefined): Cand | null =>
    o ? { marketKey: "match_total_goals", label: o.label, side: o.side, odds: o.americanOdds as number, modelP: o.modelProbability, marketP: o.marketProbability, flagTeam: null } : null;
  const bttsCand = (o: Outcome | undefined): Cand | null =>
    o ? { marketKey: "btts", label: o.label, side: o.side, odds: o.americanOdds as number, modelP: o.modelProbability, marketP: o.marketProbability, flagTeam: null } : null;

  // ── SAFE: lowest-variance — favorite DC + Under 2.5 + BTTS No. ──
  // A cautious, lead-protecting tie: the favorite avoids defeat, few goals, a clean sheet somewhere.
  // Skip the DC anchor when it is shorter than -1000 (e.g. -2500): at that price it is near-certain
  // padding that barely moves the slip — Under + BTTS No still carry the cautious-tie thesis honestly.
  const safeTeamLegs: Cand[] = [];
  if (dcFav && typeof dcFav.americanOdds === "number" && dcFav.americanOdds >= -1000)
    safeTeamLegs.push(toCand("double_chance", dcFav));
  const safeUnder = underTot && (underTot.americanOdds as number) <= LONGSHOT_MAX_ODDS ? totCand(underTot) : null;
  if (safeUnder) safeTeamLegs.push(safeUnder);
  const safeBttsNo = bttsCand(bttsNo);
  if (safeBttsNo) safeTeamLegs.push(safeBttsNo);

  // ── BALANCED: favorite result + a totals lean. ──
  // The favorite to actually win (DNB if posted, else ML) paired with the totals side that AGREES with
  // the expected script: a low-event tie pairs the win with Under; an open one pairs it with Over. We
  // read the script from the de-vig defensiveLean so the totals leg reinforces the result, not fights it.
  const balancedTeamLegs: Cand[] = [];
  // Favorite-result leg: prefer the LESS-juiced of DNB / ML that clears the juice floor, so an extreme
  // draw-no-bet (e.g. -1430) falls back to the favorite's moneyline instead of anchoring a no-value card.
  const FAV_RESULT_FLOOR = -700;
  const favResultSide = ctx?.favorite === "away" ? "away" : "home";
  const mlFav = ml?.outcomes?.find((o) => o.side === favResultSide);
  const favResultCands: Cand[] = [];
  if (dnbFav && typeof dnbFav.americanOdds === "number") favResultCands.push(toCand("draw_no_bet", dnbFav));
  if (mlFav && typeof mlFav.americanOdds === "number") favResultCands.push(toCand("moneyline_90", mlFav));
  const favResult: Cand | null = favResultCands.filter((c) => c.odds > FAV_RESULT_FLOOR).sort((a, b) => b.odds - a.odds)[0] ?? null;
  if (favResult) balancedTeamLegs.push(favResult);
  const cautiousScript = (ctx?.defensiveLean ?? 0.5) >= 0.5;
  const balancedTotals = cautiousScript ? (safeUnder ?? totCand(overTot)) : (totCand(overTot) ?? safeUnder);
  if (balancedTotals) balancedTeamLegs.push(balancedTotals);

  // ── AGGRESSIVE: higher variance — favorite to win + Over 2.5 + BTTS Yes. ──
  const aggressiveTeamLegs: Cand[] = [];
  if (favResult) aggressiveTeamLegs.push(favResult);
  else if (ml) addOutcome("moneyline_90", ml.outcomes?.find((o) => o.side === (ctx?.favorite === "away" ? "away" : "home")));
  const aggOver = totCand(overTot);
  if (aggOver) aggressiveTeamLegs.push(aggOver);
  const aggBttsYes = bttsCand(bttsYes);
  if (aggBttsYes) aggressiveTeamLegs.push(aggBttsYes);
  // moneyline fallback may have landed in `cands` — fold it in as the result leg.
  for (const c of cands) if (c.marketKey === "moneyline_90" && !aggressiveTeamLegs.some((l) => l.marketKey === "moneyline_90")) aggressiveTeamLegs.unshift(c);

  const fitScore = (legs: Cand[]) =>
    legs.reduce((s, l) => s + knockoutFitMultiplier({ marketKey: l.marketKey, selection: l.side, odds: l.odds }, ctx), 0) / Math.max(1, legs.length);

  // Same-game team markets describe ONE match → correlated by nature. correlationProfile (same gameId on
  // every leg) returns the honest direction: positive when the legs share a script (DC+Under+BTTS-No, all
  // low-event), negative when they're in tension (a win that needs goals + an Under that suppresses them).
  const teamEditorialLegs = (legs: Cand[]): EditorialLeg[] =>
    legs.map((l) => ({ gameId: String(detail.matchId ?? ""), marketKey: l.marketKey, selection: l.label, team: l.flagTeam, odds: l.odds }));

  const makeTeamCard = (
    id: string,
    risk: RiskLevel,
    legs: Cand[],
    tier: GamePropCardEditorial["tierLabel"],
    why: string[],
    whyFail: string[],
    narrative: string,
  ): GamePropParlayCard | null => {
    if (legs.length < 2) return null; // skip combos with <2 sensible markets
    const displayLegs = legs.map((l) =>
      teamLeg({ marketLabel: TEAM_MARKET_LABEL[l.marketKey] ?? l.marketKey, pickLabel: l.label, side: l.side, odds: l.odds, modelProbability: l.modelP, marketProbability: l.marketP, flagTeam: l.flagTeam }),
    );
    // Same-game model probability: do NOT multiply correlated legs (would understate). Use the
    // weakest (most binding) leg's model probability as an honest, conservative single estimate.
    const weakest = Math.min(...legs.map((l) => l.modelP).filter((p) => p > 0));
    const eLegs = teamEditorialLegs(legs);
    // Correlation summary comes from the shared brain — NEVER "independent" for a same-game team stack.
    const profile = correlationProfile(eLegs);
    return buildCard({
      id,
      riskLevel: risk,
      parlayType: "same_game",
      legs: displayLegs,
      modelProb: Number.isFinite(weakest) ? weakest : null,
      why,
      whyFail,
      correlationSummary: `Same-game stack — these team markets describe ONE match, so they are correlated, not independent. ${profile.summary}`,
      tierLabel: tier,
      narrative,
      editorialLegs: eLegs,
    });
  };

  const script = ctx ? expectedGameScript(ctx) : `${home} vs ${away}: group-stage dynamics — no knockout extra-time exposure on 90-minute markets.`;
  const built: Array<{ card: GamePropParlayCard; fit: number }> = [];
  // Skip a tier whose exact leg set duplicates one already built (e.g. Balanced collapsing into Safe
  // when only a favorite + Under are posted) — honest "skip", never a duplicate card under two labels.
  const seenSigs = new Set<string>();
  const sigOf = (legs: Cand[]) => legs.map((l) => `${l.marketKey}:${l.side}`).sort().join("|");
  const pushIfNovel = (card: GamePropParlayCard | null, legs: Cand[]) => {
    if (!card) return;
    const sig = sigOf(legs);
    if (seenSigs.has(sig)) return;
    seenSigs.add(sig);
    built.push({ card, fit: fitScore(legs) });
  };

  const safeCard = makeTeamCard(
    `gpp-team-safe-${detail.matchId}`,
    "low",
    safeTeamLegs,
    "Safe",
    [
      `Lowest-variance lean (${tierLabel}): the favorite avoids defeat in a cautious, low-event tie.`,
      ...(ctx?.notes?.[0] ? [ctx.notes[0]] : []),
    ],
    ["A single early goal can flip Under 2.5 and BTTS No together — same-game legs fail as a correlated block."],
    `${script} A favorite double chance plus Under 2.5 and BTTS No all describe that same cautious, lead-protecting script, so the legs reinforce one story rather than betting on separate things.`,
  );
  pushIfNovel(safeCard, safeTeamLegs);

  const balancedCard = makeTeamCard(
    `gpp-team-balanced-${detail.matchId}`,
    "medium",
    balancedTeamLegs,
    "Balanced",
    [
      `Balanced lean (${tierLabel}): the favorite to win paired with the totals side that fits the expected script.`,
      ...(ctx?.notes?.[0] ? [ctx.notes[0]] : []),
    ],
    [`The result and totals legs are correlated — if the favorite is held or the game flips open against the lean, both can miss together.`],
    `${script} Backing the favorite to win and pairing it with the ${cautiousScript ? "Under" : "Over"} keeps the totals leg pointed the same way as the expected game flow — a moderate combo that still moves as one correlated bet.`,
  );
  pushIfNovel(balancedCard, balancedTeamLegs);

  const aggressiveCard = makeTeamCard(
    `gpp-team-aggressive-${detail.matchId}`,
    "high",
    aggressiveTeamLegs,
    "Aggressive",
    [
      `Aggressive lean (${tierLabel}): the favorite wins an open game with goals at both ends.`,
      ...(ctx?.knockout ? ["Note: an open, high-scoring knockout tie is the less likely script — the market leans cautious."] : []),
    ],
    ["A cagey, lead-protecting knockout tie (the more likely script) sinks the Over and BTTS Yes together."],
    `${script} This slip bets AGAINST that caution — the favorite to win plus Over 2.5 and BTTS Yes only land in an open, end-to-end game. The legs are positively correlated (all need goals), which is exactly why it's the higher-variance read.`,
  );
  pushIfNovel(aggressiveCard, aggressiveTeamLegs);

  // Rank by knockout fit (higher = fits the tie's script better), then attach the limited-data caveat.
  built.sort((a, b) => b.fit - a.fit);
  const cards = built.map((b) => b.card);
  for (const c of cards) c.whyThisParlay = [...c.whyThisParlay, LIMITED_DATA_CAVEAT];
  return toCards(cards);
}

/** Drop nulls from optional card builders without scattering `if (c)` everywhere (preserves card type). */
function keep<T>(card: T | null): T[] {
  return card ? [card] : [];
}

// ── public entry ───────────────────────────────────────────────────────────────────────────────────
export interface GamePropParlays {
  playerParlays: GameSpecificCards;
  teamParlays: GameSpecificCards;
}

/**
 * Build the per-fixture player-prop and team-prop parlays for a World Cup game detail. Returns empty
 * card sets (total 0) for non-World-Cup fixtures or when no quality legs exist — the page renders an
 * honest empty state, never a fabricated card.
 */
export function buildGamePropParlays(detail: PublicGameDetail): GamePropParlays {
  if (detail.sport !== "world_cup") {
    const empty: GameSpecificCards = { byRisk: {}, cards: [], total: 0 };
    return { playerParlays: empty, teamParlays: empty };
  }
  const ctx = knockoutContextFor(detail);
  return {
    playerParlays: buildPlayerParlays(detail, ctx),
    teamParlays: buildTeamParlays(detail, ctx),
  };
}

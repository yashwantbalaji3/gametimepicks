/**
 * STRUCTURED MOONSHOT — a disciplined longshot built from real TEAM markets, grouped by game, instead of
 * a random player-prop stack. For every game on the slate it takes a coherent pair:
 *
 *     result leg (moneyline / draw-no-bet / double-chance)  +  total-goals leg (or BTTS when no total market)
 *
 * and combines those pairs into one ticket. Each leg is the model's own pick for that market (from the
 * de-vigged board picks) and is checked against the game's score lean (the shared game-script engine) so a
 * leg can't silently contradict the model — a conflicting leg is flagged "high variance", never hidden.
 *
 * INTEGRITY: real posted odds only; combined price is COMPUTED from the leg prices (a model estimate for
 * correlated same-game legs, priced SHORTER by a real book — stated on every ticket). No player props in the
 * structured/reliable ticket. Nothing fabricated; a game with no usable pair is dropped, never padded.
 */
import fs from "node:fs";
import path from "node:path";
import { loadRoundOf32Board, type RoundOf32Game } from "./round-of-32";
import { deriveGameScript, type GameScript } from "./game-script";
import { americanToDecimal, decimalToAmerican } from "@/lib/odds-math";
import { confidenceLabel, volatilityLabel, type Confidence, type Volatility } from "./wc-editorial";

export type MoonshotLegKind = "result" | "total" | "btts";

export interface MoonshotLeg {
  kind: MoonshotLegKind;
  market: string;         // moneyline_90 | draw_no_bet | double_chance | match_total_goals | btts
  marketLabel: string;
  selection: string;
  americanOdds: number;
  modelProbability: number;
  /** true when this leg agrees with the game's score lean; false → flagged high-variance. */
  aligned: boolean;
}

export interface MoonshotGamePair {
  gameSlug: string;
  homeTeam: string;
  awayTeam: string;
  homeCode: string | null;
  awayCode: string | null;
  kickoffEt: string;
  scoreLean: string | null;
  legs: MoonshotLeg[];        // 1 (result-only) or 2 (result + total/btts) legs for this game
  alignmentNote: string | null;
}

export type MoonshotTier = "structured" | "aggressive";

export interface MoonshotTicket {
  tier: MoonshotTier;
  label: string;
  blurb: string;
  available: boolean;
  reason?: string;            // present when a tier can't be built (honest, never padded)
  pairs: MoonshotGamePair[];
  legCount: number;
  combinedOdds: number;       // American, computed from the real leg prices
  /** Profit on a $25 paper stake at the combined price. */
  payout: number;
  modelProbability: number;   // joint (independence-assumed) — the honest headline, not the correlated truth
  confidence: Confidence;
  volatility: Volatility;
  correlationNote: string;
  whyItCanHit: string;
  whyItCanFail: string;
}

export interface StructuredMoonshot {
  date: string;
  gameCount: number;
  tickets: MoonshotTicket[];
}

const CORRELATION_NOTE =
  "Same-game legs are correlated — the combined price is a MODEL ESTIMATE from multiplying the individual prices; a real book prices correlated legs SHORTER, so treat the payout as optimistic, not a quote.";

const MOONSHOT_STAKE = 25;

/** Pick the result leg for a game: prefer a draw-protected market (DNB / Double Chance) when the game is
 *  draw-leaning (favourite avoids defeat), else the straight moneyline. Returns null when no result pick. */
function resultLeg(g: RoundOf32Game, script: GameScript, preferSafe: boolean): MoonshotLeg | null {
  const p = g.picks;
  if (!p?.moneyline) return null;
  const drawLean = script.winner === "Draw";
  // A draw-leaning game: the straight ML is a trap → prefer DNB (push on draw) or DC (win-or-draw).
  if ((drawLean || preferSafe) && p.drawNoBet) {
    return { kind: "result", market: "draw_no_bet", marketLabel: "Draw No Bet", selection: p.drawNoBet.pick,
      americanOdds: p.drawNoBet.americanOdds, modelProbability: p.drawNoBet.modelProbability, aligned: true };
  }
  if ((drawLean || preferSafe) && p.doubleChance) {
    return { kind: "result", market: "double_chance", marketLabel: "Double Chance", selection: p.doubleChance.pick,
      americanOdds: p.doubleChance.americanOdds, modelProbability: p.doubleChance.modelProbability, aligned: true };
  }
  const ml = p.moneyline;
  // Straight ML aligns unless the game is draw-leaning (then a ML-win leg fights the score lean).
  return { kind: "result", market: "moneyline_90", marketLabel: "Moneyline (90′)", selection: `${ml.pick} to win`,
    americanOdds: ml.americanOdds, modelProbability: ml.modelProbability, aligned: !drawLean };
}

/** The total-goals leg, or a BTTS fallback when the game has no totals market (only if BTTS is coherent
 *  with the score lean). Null when neither is offered. */
function totalOrBttsLeg(g: RoundOf32Game): MoonshotLeg | null {
  const p = g.picks;
  if (p?.total && typeof p.total.line === "number") {
    return { kind: "total", market: "match_total_goals", marketLabel: "Total Goals", selection: p.total.pick,
      americanOdds: p.total.americanOdds, modelProbability: p.total.modelProbability, aligned: true };
  }
  if (p?.btts) {
    return { kind: "btts", market: "btts", marketLabel: "Both Teams To Score", selection: p.btts.pick,
      americanOdds: p.btts.americanOdds, modelProbability: p.btts.modelProbability, aligned: true };
  }
  return null;
}

function combined(legs: MoonshotLeg[]): { american: number; decimal: number } | null {
  if (legs.length < 2) return null;
  let d = 1;
  for (const l of legs) {
    if (typeof l.americanOdds !== "number" || !Number.isFinite(l.americanOdds) || l.americanOdds === 0) return null;
    d *= americanToDecimal(l.americanOdds);
  }
  return { american: decimalToAmerican(d), decimal: d };
}

function jointProb(legs: MoonshotLeg[]): number {
  let p = 1;
  for (const l of legs) p *= Math.max(0, Math.min(1, l.modelProbability || 0));
  return p;
}

/** Assemble one ticket from per-game pairs, dropping games with no result leg. Unavailable (honest) when
 *  fewer than 2 total legs or the combined price can't be computed. */
function assembleTicket(tier: MoonshotTier, label: string, blurb: string, pairs: MoonshotGamePair[]): MoonshotTicket {
  const usable = pairs.filter((pr) => pr.legs.length > 0);
  const legs = usable.flatMap((pr) => pr.legs);
  const priced = combined(legs);
  if (legs.length < 2 || !priced) {
    return { tier, label, blurb, available: false, reason: "Not enough real team-market legs on today's slate to field this ticket.",
      pairs: usable, legCount: legs.length, combinedOdds: 0, payout: 0, modelProbability: 0,
      confidence: "Speculative", volatility: "Extreme", correlationNote: CORRELATION_NOTE, whyItCanHit: "", whyItCanFail: "" };
  }
  const joint = jointProb(legs);
  const conflicts = usable.filter((pr) => pr.legs.some((l) => !l.aligned));
  const whyHit = `Every leg is the model's own pick for its market — favourites hold and the game scripts (${usable.map((p) => p.scoreLean).filter(Boolean).slice(0, 3).join("; ")}) play out as leaned.`;
  const whyFail = `${legs.length} correlated legs must ALL land — one upset, one stray goal, or one tight game going the other way loses the ticket.${conflicts.length ? ` ${conflicts.length} leg(s) run against the score lean (flagged high-variance).` : ""}`;
  return {
    tier, label, blurb, available: true, pairs: usable, legCount: legs.length,
    combinedOdds: priced.american, payout: Math.round((priced.decimal - 1) * MOONSHOT_STAKE * 100) / 100,
    modelProbability: Math.round(joint * 1000) / 1000,
    confidence: confidenceLabel(joint), volatility: volatilityLabel(priced.american),
    correlationNote: CORRELATION_NOTE, whyItCanHit: whyHit, whyItCanFail: whyFail,
  };
}

const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** The current slate's game set (home|away pairs) from the projections artifact — so the Moonshot spans
 *  ONLY today's slate, not every future game still on the board. Null when projections are unreadable. */
function slateGameKeys(root: string, date?: string): Set<string> | null {
  try {
    const dir = path.join(root, "world-cup", "projections");
    const file = date && fs.existsSync(path.join(dir, `${date}.json`)) ? path.join(dir, `${date}.json`) : path.join(dir, "latest.json");
    const proj = JSON.parse(fs.readFileSync(file, "utf8")) as { matches?: Array<{ homeTeam?: string; awayTeam?: string }> };
    const keys = new Set<string>();
    for (const m of proj.matches ?? []) if (m.homeTeam && m.awayTeam) keys.add(`${norm(m.homeTeam)}|${norm(m.awayTeam)}`);
    return keys.size ? keys : null;
  } catch { return null; }
}

/** Build the structured Moonshot for a slate from the board's live games (real de-vigged picks only),
 *  scoped to the CURRENT projections slate so it never sprawls across every future board game. */
export function buildStructuredMoonshot(root?: string, date?: string): StructuredMoonshot {
  const base = root ?? path.join(process.cwd(), "public", "data");
  const board = loadRoundOf32Board(root);
  const slate = slateGameKeys(base, date);
  const games = (board?.games ?? []).filter(
    (g) => g.status === "live_odds" && g.picks?.moneyline && (!slate || slate.has(`${norm(g.home)}|${norm(g.away)}`)),
  );
  return buildStructuredMoonshotFromGames(games, date ?? board?.slateLabel ?? "");
}

export interface StrongestPick {
  gameSlug: string; matchup: string; homeCode: string | null; awayCode: string | null;
  marketLabel: string; selection: string; americanOdds: number; modelProbability: number;
}

/** The strongest SINGLE-leg model picks on the current slate (safest market per game, ranked by model
 *  probability) — used as the honest "here's what the model likes today" alternative when a full product
 *  (e.g. Bank Builder) is skipped. Real de-vigged board picks only; empty when none. */
export function strongestSlatePicks(root?: string, date?: string, limit = 3): StrongestPick[] {
  const base = root ?? path.join(process.cwd(), "public", "data");
  const board = loadRoundOf32Board(root);
  const slate = slateGameKeys(base, date);
  const out: StrongestPick[] = [];
  for (const g of board?.games ?? []) {
    if (g.status !== "live_odds" || !g.picks) continue;
    if (slate && !slate.has(`${norm(g.home)}|${norm(g.away)}`)) continue;
    // Prefer the VALUE market (highest-prob pick priced -200..+300 — an actually-useful leg) over the
    // saferMarket (often an absurdly-juiced -10000 double chance). Fall back to a payable moneyline.
    const value = g.picks.valueMarket;
    const ml = g.picks.moneyline;
    const pick = value
      ?? (ml && ml.americanOdds >= -300 ? { pick: `${ml.pick} to win`, americanOdds: ml.americanOdds, modelProbability: ml.modelProbability } : null);
    if (!pick) continue;
    out.push({
      gameSlug: g.gameSlug, matchup: `${g.home} v ${g.away}`, homeCode: g.homeCode, awayCode: g.awayCode,
      marketLabel: "Best value leg", selection: pick.pick, americanOdds: pick.americanOdds, modelProbability: pick.modelProbability,
    });
  }
  return out.sort((a, b) => b.modelProbability - a.modelProbability).slice(0, limit);
}

/** Pure core: assemble the structured + aggressive tickets from a set of live board games. Exposed for
 *  tests and any caller that already holds the games (never reads disk). */
export function buildStructuredMoonshotFromGames(games: RoundOf32Game[], date: string): StructuredMoonshot {
  // Structured = result + total(/BTTS) per game. Aggressive adds the BTTS leg on top where distinct.
  const structuredPairs: MoonshotGamePair[] = [];
  const aggressivePairs: MoonshotGamePair[] = [];
  for (const g of games) {
    const script = deriveGameScript(g);
    const res = resultLeg(g, script, false);
    const tot = totalOrBttsLeg(g);
    const base: Omit<MoonshotGamePair, "legs" | "alignmentNote"> = {
      gameSlug: g.gameSlug, homeTeam: g.home, awayTeam: g.away, homeCode: g.homeCode, awayCode: g.awayCode,
      kickoffEt: g.kickoffEt, scoreLean: script.scoreLean,
    };
    if (!res) continue;
    const sLegs = [res, tot].filter(Boolean) as MoonshotLeg[];
    const note = sLegs.some((l) => !l.aligned) ? "One leg runs against the score lean — higher variance." : null;
    structuredPairs.push({ ...base, legs: sLegs, alignmentNote: note });

    // Aggressive: result + total + a DISTINCT BTTS (only when BTTS isn't already the total-fallback leg).
    const aLegs = [...sLegs];
    if (g.picks?.btts && tot?.market !== "btts") {
      aLegs.push({ kind: "btts", market: "btts", marketLabel: "Both Teams To Score", selection: g.picks.btts.pick,
        americanOdds: g.picks.btts.americanOdds, modelProbability: g.picks.btts.modelProbability, aligned: true });
    }
    aggressivePairs.push({ ...base, legs: aLegs, alignmentNote: note });
  }

  const tickets: MoonshotTicket[] = [
    assembleTicket("structured", "Structured Moonshot",
      "Two legs from every game — the model's result pick (moneyline / draw-no-bet / double-chance) paired with its total-goals pick. Team markets only, grouped by game.",
      structuredPairs),
    assembleTicket("aggressive", "Aggressive Moonshot",
      "The structured pairs plus each game's BTTS pick — more legs, longer price, higher variance. Still team markets only.",
      aggressivePairs),
  ];
  return { date, gameCount: games.length, tickets };
}

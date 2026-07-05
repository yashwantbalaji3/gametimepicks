/**
 * FRESH DAILY BANK BUILDER PROPOSAL — a safe, DISPLAY-ONLY restart for the days the real dual ladder is
 * terminal (both lanes completed/stopped, operator-gated). It shows what the model would build to START a
 * fresh $100 paper ladder TODAY: a safest 2-leg survival lane (Lane A) + a value 2-leg lane (Lane B), from
 * REAL de-vigged team markets, grouped so the user always sees legs — never a dead product.
 *
 * MONEY-SAFE by construction: this is a proposal, not a placement. It reads nothing from and writes nothing
 * to the canonical crown ladder / portfolio.json; every lane is a $0-placed candidate. The historical
 * settled record is untouched. Team markets only (moneyline / draw-no-bet / double-chance / BTTS / totals) —
 * no player props, nothing fabricated; a game with no usable safe leg is simply skipped.
 */
import fs from "node:fs";
import path from "node:path";
import { loadRoundOf32Board, type RoundOf32Game, type RoundOf32Picks } from "./round-of-32";
import { deriveGameScript } from "./game-script";
import { americanToDecimal, decimalToAmerican } from "@/lib/odds-math";

/** Honest per-leg lifecycle status, derived ONLY from kickoff vs now (never a fabricated hit/miss). A
 *  hit/missed is set ONLY when real official settlement data is present (not implemented here → we never
 *  assert a winner without it). */
export type LegStatus = "pregame" | "in_progress" | "awaiting_settlement" | "hit" | "missed";

export interface ProposalLeg {
  market: string;
  marketLabel: string;
  selection: string;
  americanOdds: number;
  modelProbability: number;
  gameSlug: string;
  matchup: string;
  homeCode: string | null;
  aligned: boolean;      // agrees with the game's score lean
  kickoffUtc?: string | null;
  legStatus?: LegStatus;
}

export interface ProposalLane {
  lane: "A" | "B";
  kind: "survival" | "value";
  label: string;
  legs: ProposalLeg[];
  combinedOdds: number;
  combinedDecimal: number;
  modelProbability: number;   // joint (independence-assumed)
  stake: number;              // $100 fresh-ladder seed (paper)
  potentialReturn: number;
  confidence: "High" | "Solid" | "Lean";
  whyLadderPick: string;
  whyItCouldFail: string;
  /** live-lane bookkeeping (present on a promoted/approved lane). */
  legsSettled?: number;       // legs whose game is over (awaiting/hit/missed)
  legsTotal?: number;
  laneStatus?: "pregame" | "in_progress" | "awaiting_settlement";
}

export interface BankBuilderProposal {
  available: boolean;
  date: string;
  lanes: ProposalLane[];
  note: string;
  /** true when these are the operator-APPROVED, pinned lanes (active paper ladder) rather than the live
   *  auto-generated proposal. Drives the "Active paper ladder" framing (no operator-action copy). */
  approved?: boolean;
}

const GAME_MS = 2.5 * 60 * 60 * 1000;

/** Per-leg status from kickoff vs now — pregame / in_progress / awaiting_settlement. Never hit/missed
 *  without official data (this function has none). */
export function legStatusFromKickoff(kickoffUtc: string | null | undefined, nowMs: number): LegStatus {
  const ko = kickoffUtc ? Date.parse(kickoffUtc) : NaN;
  if (!Number.isFinite(ko) || ko > nowMs) return "pregame";
  return nowMs - ko >= GAME_MS ? "awaiting_settlement" : "in_progress";
}

/** Load the operator-APPROVED, pinned Bank Builder lanes for a date (if any), stamping honest per-leg +
 *  per-lane live status from the current clock. Returns null when no approval exists for the date. This is
 *  the source of truth so the live generator can't swap an approved leg after its game kicks off. */
export function loadApprovedBankBuilder(root: string, date: string, nowMs = Date.now()): BankBuilderProposal | null {
  let doc: { date?: string; lanes?: ProposalLane[]; note?: string };
  try {
    doc = JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "bank-builder-approved.json"), "utf8"));
  } catch { return null; }
  if (!doc || doc.date !== date || !Array.isArray(doc.lanes) || !doc.lanes.length) return null;
  const stake = (doc as { stake?: number }).stake ?? 100;
  const lanes = doc.lanes.map((lane) => {
    const legs = lane.legs.map((l) => ({ ...l, legStatus: legStatusFromKickoff(l.kickoffUtc, nowMs) }));
    const settled = legs.filter((l) => l.legStatus === "awaiting_settlement" || l.legStatus === "hit" || l.legStatus === "missed").length;
    const anyStarted = legs.some((l) => l.legStatus !== "pregame");
    const laneStatus: ProposalLane["laneStatus"] = settled === legs.length ? "awaiting_settlement" : anyStarted ? "in_progress" : "pregame";
    return { ...lane, stake: lane.stake ?? stake, legs, legsSettled: settled, legsTotal: legs.length, laneStatus };
  });
  return {
    available: true, approved: true, date: doc.date,
    lanes,
    note: "Approved daily Bank Builder — an ACTIVE paper ladder. Paper-only ($100 seed, educational); the canonical $100→$10K proof ladder is unchanged and updates only through official settlement. Started/finished legs are marked below and grade from official results — never a fabricated hit.",
  };
}

const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

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

interface Candidate extends ProposalLeg { volScore: number }

/** Every usable TEAM-market leg for one game, tagged with a volatility score (lower = safer). Ultra-juiced
 *  legs (≤ -600) and coin-flip prices are excluded from the SAFE set; value legs keep a payable band. */
function gameCandidates(g: RoundOf32Game): Candidate[] {
  const p: RoundOf32Picks | null = g.picks;
  if (!p) return [];
  const script = deriveGameScript(g);
  const alignedResult = script.winner; // team name or "Draw"
  const out: Candidate[] = [];
  const push = (market: string, label: string, pick: { pick: string; americanOdds: number; modelProbability: number } | undefined, aligned: boolean) => {
    if (!pick || typeof pick.americanOdds !== "number" || !Number.isFinite(pick.americanOdds) || pick.americanOdds === 0) return;
    out.push({
      market, marketLabel: label, selection: pick.pick, americanOdds: pick.americanOdds, modelProbability: pick.modelProbability,
      gameSlug: g.gameSlug, matchup: `${g.home} v ${g.away}`, homeCode: g.homeCode, aligned,
      volScore: 1 - (pick.modelProbability ?? 0), // higher model prob → lower volatility
    });
  };
  // Draw-protected results are the SAFEST knockout legs → offer DNB / DC first.
  push("draw_no_bet", "Draw No Bet", p.drawNoBet, true);
  push("double_chance", "Double Chance", p.doubleChance, true);
  const mlAligned = !!p.moneyline && (alignedResult !== "Draw");
  push("moneyline_90", "Moneyline (90′)", p.moneyline ? { pick: `${p.moneyline.pick} to win`, americanOdds: p.moneyline.americanOdds, modelProbability: p.moneyline.modelProbability } : undefined, mlAligned);
  push("match_total_goals", "Total Goals", p.total, true);
  push("btts", "Both Teams To Score", p.btts, true);
  return out;
}

function assembleLane(lane: "A" | "B", kind: "survival" | "value", legs: ProposalLeg[]): ProposalLane | null {
  if (legs.length < 2) return null;
  let d = 1;
  for (const l of legs) d *= americanToDecimal(l.americanOdds);
  let joint = 1;
  for (const l of legs) joint *= Math.max(0, Math.min(1, l.modelProbability || 0));
  const stake = 100;
  const conf: ProposalLane["confidence"] = joint >= 0.5 ? "High" : joint >= 0.35 ? "Solid" : "Lean";
  const isSurvival = kind === "survival";
  return {
    lane, kind,
    label: isSurvival ? "Lane A · Survival (safest)" : "Lane B · Value",
    legs,
    combinedOdds: decimalToAmerican(d), combinedDecimal: Number(d.toFixed(4)),
    modelProbability: Math.round(joint * 1000) / 1000,
    stake, potentialReturn: Math.round(stake * d * 100) / 100, confidence: conf,
    whyLadderPick: isSurvival
      ? "The two highest-probability draw-protected / favourite legs on the slate, from different games — built to CLEAR a rung, not to swing for a payout. Each agrees with its game's score lean."
      : "The two best-value legs (model edge over the market price) from different games — a slightly longer price than the survival lane while staying inside a payable band.",
    whyItCouldFail: `Both legs must land — ${legs.map((l) => l.matchup).join(" and ")} going the other way (an upset, a stray goal, or a tight game flipping) loses the rung. Knockout games carry extra-time/penalty variance on 90′ result legs.`,
  };
}

/** Build the fresh daily Bank Builder proposal from the board's live slate games. Real team markets only. */
export function buildBankBuilderProposal(root?: string, date?: string): BankBuilderProposal {
  const base = root ?? path.join(process.cwd(), "public", "data");
  // APPROVED lanes win: once an operator approves a day's lanes they are PINNED (with honest per-leg live
  // status) so the auto-generator can't swap a leg after its game kicks off. Falls through to the live
  // proposal only on days with no approval.
  const approved = loadApprovedBankBuilder(base, date ?? "");
  if (approved) return approved;
  const board = loadRoundOf32Board(root);
  const slate = slateGameKeys(base, date);
  const games = (board?.games ?? []).filter(
    (g) => g.status === "live_odds" && g.picks?.moneyline && (!slate || slate.has(`${norm(g.home)}|${norm(g.away)}`)),
  );
  return buildBankBuilderProposalFromGames(games, date ?? board?.slateLabel ?? "");
}

/** Pure core: assemble the survival + value lanes from a set of live board games (never reads disk). */
export function buildBankBuilderProposalFromGames(games: RoundOf32Game[], date: string): BankBuilderProposal {
  const emptyNote = "No fresh Bank Builder lane is buildable from today's slate — not enough safe two-leg team-market value across different games. The model is holding rather than forcing a weak ladder.";
  if (games.length < 2) return { available: false, date, lanes: [], note: emptyNote };

  const cands = games.map((g) => gameCandidates(g)).filter((c) => c.length > 0);
  // SURVIVAL (Lane A): within EACH game, keep only payable, high-probability legs (drop ultra-juiced
  // -600+ and coin-flips), THEN take that game's safest; then the two safest across DIFFERENT games.
  //
  // MARKET-RELIABILITY WEIGHTING (July-4 model review, from the CANONICAL settled ledger): double
  // chance is 8-0 and DNB near-perfect; totals are 63% overall but every recent knockout loss was a
  // 90'-draw trap (Over 2.5 died on Argentina 1-1, Under 2.5 on Belgium 2-2); BTTS is 1-3 (25%).
  // The survival lane therefore penalizes totals in DRAW-RISKY games (90' draw ≥ 26% — the same
  // threshold knockoutRisk uses) and always demotes BTTS to a last resort, instead of trusting the
  // raw model probability that walked Lane A into the July-3 Over-2.5 trap.
  const drawRisky = new Map<string, boolean>(
    games.map((g) => [g.gameSlug, (g.picks?.moneyline?.draw ?? 0) >= 0.26]),
  );
  const survivalScore = (c: Candidate): number =>
    c.volScore
    + (c.market === "btts" ? 0.25 : 0)
    + (c.market === "match_total_goals" && drawRisky.get(c.gameSlug) ? 0.15 : 0);
  const safestPerGame = cands
    .map((cs) => cs.filter((c) => c.americanOdds >= -600 && c.modelProbability >= 0.55).sort((a, b) => survivalScore(a) - survivalScore(b))[0])
    .filter(Boolean)
    .sort((a, b) => survivalScore(a as Candidate) - survivalScore(b as Candidate)) as Candidate[];
  const laneALegs = pickTwoDistinctGames(safestPerGame);

  // VALUE (Lane B): the best PAYABLE leg per game (-200..+300, highest model prob), two across different
  // games, excluding legs already used by Lane A.
  const usedIds = new Set(laneALegs.map((l) => `${l.gameSlug}:${l.market}`));
  const valuePerGame = cands.map((cs) => [...cs]
    .filter((c) => c.americanOdds >= -200 && c.americanOdds <= 300 && !usedIds.has(`${c.gameSlug}:${c.market}`))
    .sort((a, b) => b.modelProbability - a.modelProbability)[0])
    .filter(Boolean)
    .sort((a, b) => b.modelProbability - a.modelProbability) as Candidate[];
  const laneBLegs = pickTwoDistinctGames(valuePerGame);

  const lanes = [assembleLane("A", "survival", laneALegs), assembleLane("B", "value", laneBLegs)].filter(Boolean) as ProposalLane[];
  return {
    available: lanes.length > 0,
    date,
    lanes,
    note: lanes.length
      ? "Fresh daily proposal — the model's Bank Builder lanes for a NEW paper ladder. Display-only: $0 placed. Starting a live run is an OPERATOR decision (it commits the paper bankroll to a cycle that settlement grades into the tracked record), so the ladder never auto-restarts into a thin slate after a loss. The historical $100→$10K proof ladder is unchanged."
      : emptyNote,
  };
}

/** Take up to two legs from DISTINCT games (never two legs on one game — cross-lane/independence rule). */
function pickTwoDistinctGames(sorted: ProposalLeg[]): ProposalLeg[] {
  const out: ProposalLeg[] = [];
  const games = new Set<string>();
  for (const l of sorted) {
    if (games.has(l.gameSlug)) continue;
    out.push(l); games.add(l.gameSlug);
    if (out.length === 2) break;
  }
  return out;
}

/**
 * Daily-portfolio ACTIVATION ACCOUNTING.
 *
 * Turns the four model-built candidate lanes (Bank Builder A/B + Moonshot A/B) into an ACTIVE daily
 * paper portfolio with explicit, testable money math. The display model (and the only mutation this
 * layer makes) is:
 *   activeBankroll    = portfolio.currentBankroll        // UNCHANGED at activation (settled bankroll)
 *   openExposure      = Σ ACTIVE lane stakes             // rises when lanes activate
 *   availableBankroll = activeBankroll − openExposure
 *   potentialReturn   = Σ ACTIVE lane potential returns
 *   crown             = portfolio.crownBankroll          // historical, NEVER touched
 * Activating a lane raises open exposure + lowers available; it does NOT change active bankroll or the
 * crown (those only move on official settlement). Pure + deterministic given (root, nowIso, date).
 */
import fs from "node:fs";
import path from "node:path";
import { loadWorldCupModelPicks, buildDailyLaneCandidates, MOONSHOT_MIN_COMBINED_ODDS, type LaneCandidate, type ModelPick } from "../world-cup/model-qualified-picks";
import { readLaneRungs, selectSafestTargetFitCard, SEED_EXPOSURE, type GeneratedLane } from "./bank-builder-generation";
import { selectCrossLaneBankBuilder } from "./bank-builder-correlation-review";
import { loadMlbModelPicks } from "./mlb-model-picks";
import { loadWorldCupTeamLegs } from "./wc-team-legs";
import { moonshotNarrative } from "../world-cup/wc-editorial";

/** Activation cutoff — a lane cannot be newly activated if any leg kicks off within this many minutes. */
export const ACTIVATION_CUTOFF_MIN = 30;
export const MOONSHOT_MAX_EXPOSURE = 50;

export interface ActivationEligibility { eligible: boolean; reason: string }
export interface PortfolioLaneLeg { id: string; matchup: string; market: string; selection: string; player: string | null; odds: number; provider: string | null; modelConfidence: number; kickoffEt: string; risk: string; photoUrl?: string | null; teamLogo?: string | null }
export interface PortfolioLane {
  id: string;
  product: "bank-builder" | "moonshot";
  productLabel: string;
  lane: "A" | "B";
  step: number;
  clearedSteps: number;
  // "won"/"lost" = an approved step ALREADY settled in the ladder (same-day settlement) — a finished rung,
  // $0 exposure, NOT active. Only "active" places open exposure (see the active-filter in the builder).
  status: "active" | "candidate" | "awaiting" | "won" | "lost";
  stake: number;            // the balance riding on the card (rolled for Bank Builder)
  exposure: number;         // the at-risk amount: Bank Builder $100 seed; Moonshot $25 stake
  targetReturn: number | null; // rung goal (Bank Builder), else null
  fitsTarget: boolean;
  combinedOdds: number;
  combinedDecimal: number;
  potentialReturn: number;
  legCount: number;
  targetLegs: number;
  legs: PortfolioLaneLeg[];
  correlationNote: string | null;
  shortfallNote: string | null;
  whyThisCard: string[];
  narrative?: { title: string; story: string }; // Moonshot story (display-only; never affects money math)
  activationEligibility: ActivationEligibility;
  locked?: boolean;           // approved-card lock honored (legs pinned)
  approvedAt?: string;
}
export interface PersistedDailyPortfolio {
  version: "daily-portfolio-v1";
  date: string;
  generatedAt: string | null;
  activeBankroll: number;
  crownBankroll: number;
  openExposure: number;
  availableBankroll: number;
  potentialReturn: number;
  products: {
    bankBuilder: { exposure: number; record: { wins: number; losses: number; voids: number; pending: number } };
    moonshot: { exposure: number; record: { wins: number; losses: number; voids: number; pending: number } };
  };
  lanes: PortfolioLane[];
  settlement: { status: "pending" | "settled" | "none"; realizedPnl: number };
  note: string;
}

const PRODUCT_LABEL: Record<string, string> = { "bank-builder": "Bank Builder", moonshot: "Moonshot" };

export function laneEligibility(lane: LaneCandidate, nowMs: number): ActivationEligibility {
  if (lane.legCount < lane.targetLegs) return { eligible: false, reason: `only ${lane.legCount}/${lane.targetLegs} model-qualified legs — awaiting a full lane` };
  // Moonshot must clear the longshot floor — a thin 3-leg lane of short favorites is not a moonshot.
  if (lane.product === "moonshot" && lane.combinedOdds < MOONSHOT_MIN_COMBINED_ODDS)
    return { eligible: false, reason: `combined +${lane.combinedOdds} is below the +${MOONSHOT_MIN_COMBINED_ODDS} longshot floor — awaiting a longer card` };
  for (const l of lane.legs) {
    const ms = l.kickoffUtc ? Date.parse(l.kickoffUtc) : NaN;
    if (!Number.isFinite(ms)) return { eligible: false, reason: `${l.matchup} has no machine kickoff` };
    if (nowMs >= ms) return { eligible: false, reason: `${l.matchup} has started — no late activation` };
    if (ms - nowMs < ACTIVATION_CUTOFF_MIN * 60000) return { eligible: false, reason: `${l.matchup} within ${ACTIVATION_CUTOFF_MIN}m of kickoff` };
  }
  return { eligible: true, reason: "all legs pre-event and outside the cutoff" };
}

function whyThisCard(lane: LaneCandidate): string[] {
  const why: string[] = [];
  if (lane.product === "bank-builder") why.push("Lower-volatility: the 2 highest model-confidence legs, max 1 per game.");
  else why.push(`Higher-upside: ${lane.legCount} model-qualified longshot legs (up to 5, min 3) for a longer combined price.`);
  const avg = lane.legs.length ? Math.round((lane.legs.reduce((s, l) => s + l.modelProbability, 0) / lane.legs.length) * 100) : 0;
  why.push(`Avg model confidence ${avg}% across ${lane.legCount} legs · combined ${lane.combinedOdds > 0 ? "+" : ""}${lane.combinedOdds}.`);
  if (lane.correlationNote) why.push(lane.correlationNote);
  return why;
}

const toLeg = (p: ModelPick): PortfolioLaneLeg => ({ id: p.id, matchup: p.matchup, market: p.marketLabel, selection: p.selection, player: p.player, odds: p.odds, provider: p.provider, modelConfidence: p.modelProbability, kickoffEt: p.kickoffEt, risk: p.risk, photoUrl: p.playerPortrait ?? null, teamLogo: p.teamLogo ?? null });

function toPortfolioLane(lane: LaneCandidate, status: PortfolioLane["status"], eligibility: ActivationEligibility): PortfolioLane {
  return {
    id: lane.id, product: lane.product, productLabel: PRODUCT_LABEL[lane.product] ?? lane.product, lane: lane.lane,
    step: 1, clearedSteps: 0, status, stake: lane.stake, exposure: lane.stake, targetReturn: null, fitsTarget: true,
    combinedOdds: lane.combinedOdds, combinedDecimal: lane.combinedDecimal,
    potentialReturn: lane.potentialReturn, legCount: lane.legCount, targetLegs: lane.targetLegs,
    legs: lane.legs.map(toLeg),
    correlationNote: lane.correlationNote, shortfallNote: lane.shortfallNote,
    whyThisCard: whyThisCard(lane), activationEligibility: eligibility,
    narrative: lane.product === "moonshot" && lane.legs.length
      ? moonshotNarrative(lane.legs.map((p) => ({ gameId: p.gameId, marketKey: p.marketKey, selection: p.selection, team: p.team, player: p.player, odds: p.odds })))
      : undefined,
  };
}

/** Map a Bank Builder GeneratedLane (target-fit next-step card) to a PortfolioLane. Exposure is the
 *  $100 seed (ledger convention); the card displays the rolled balance riding toward the rung goal. */
function toBBLane(g: GeneratedLane, status: PortfolioLane["status"], eligibility: ActivationEligibility): PortfolioLane {
  return {
    id: `bank-builder-lane-${g.lane.toLowerCase()}-step-${g.step}`, product: "bank-builder", productLabel: "Bank Builder", lane: g.lane,
    step: g.step, clearedSteps: g.clearedSteps, status, stake: g.rolledStake, exposure: g.seedExposure,
    targetReturn: g.targetReturn, fitsTarget: g.fitsTarget,
    combinedOdds: g.combinedOdds, combinedDecimal: g.combinedDecimal, potentialReturn: g.potentialReturn,
    legCount: g.legs.length, targetLegs: 2, legs: g.legs.map(toLeg),
    correlationNote: g.correlationNote, shortfallNote: g.shortfallNote,
    whyThisCard: g.whyThisCard, activationEligibility: eligibility,
  };
}

/** Activation eligibility for a Bank Builder generated lane (pre-event, cutoff, full + target-fit). */
function bbEligibility(g: GeneratedLane, nowMs: number): ActivationEligibility {
  if (g.legs.length < 2) return { eligible: false, reason: "fewer than 2 model-qualified legs — awaiting a full card" };
  if (!g.fitsTarget) return { eligible: false, reason: `no 2-leg combo reaches the Step ${g.step} target — candidate only` };
  for (const l of g.legs) {
    const ms = l.kickoffUtc ? Date.parse(l.kickoffUtc) : NaN;
    if (!Number.isFinite(ms)) return { eligible: false, reason: `${l.matchup} has no machine kickoff` };
    if (nowMs >= ms) return { eligible: false, reason: `${l.matchup} has started — no late activation` };
    if (ms - nowMs < ACTIVATION_CUTOFF_MIN * 60000) return { eligible: false, reason: `${l.matchup} within ${ACTIVATION_CUTOFF_MIN}m of kickoff` };
  }
  return { eligible: true, reason: "all legs pre-event, outside the cutoff, and the card reaches the rung target" };
}

/**
 * The SINGLE source of money truth for the daily view: `mr-dub/portfolio.json` (the cumulative-crown
 * canonical, set only by official settlement + reconciliation). If that's unreadable we DERIVE the same
 * numbers from the realized-history base `mr-dub/banked-ladders.json` (crown = Σ official finals; bankroll
 * = crown + historicalDualLaneLosses). We NEVER fall back to a hardcoded constant — a stale literal here
 * once made the regenerator silently write a single-ladder total over the real cumulative-crown bankroll.
 * If neither canonical file is readable, we THROW (fail loudly) rather than fabricate a bankroll.
 */
export function readCanonicalMoney(root: string): { activeBankroll: number; crownBankroll: number } {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "portfolio.json"), "utf8"));
    if (typeof p.currentBankroll === "number" && typeof p.crownBankroll === "number") {
      return { activeBankroll: p.currentBankroll, crownBankroll: p.crownBankroll };
    }
  } catch { /* fall through to the per-event ledger */ }
  // Derive the CURRENT figures from the per-event ledger (Σ realized paperProfit + the original seed) and
  // the banked crown (Σ official completed-ladder finals). We MUST use the ledger — which INCLUDES the live
  // cycle's realized losses — NOT `crownTotal + historicalDualLaneLosses`, which is the pre-cycle BASE and
  // understates the bankroll (it omits the active cycle's realized losses, reading high by that amount).
  const banked = JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "banked-ladders.json"), "utf8"));
  const ledger = JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "ledger.json"), "utf8"));
  const seed = Number(banked.ladders?.[0]?.start ?? 100) || 100;
  const sumProfit = round2((ledger.events ?? []).reduce((s: number, e: any) => s + (Number(e.paperProfit) || 0), 0));
  const crownBankroll = round2((banked.ladders ?? []).reduce((s: number, l: any) => s + (Number(l.final) || 0), 0) || banked.crownTotal);
  return { activeBankroll: round2(seed + sumProfit), crownBankroll };
}

const round2 = (n: number) => Number(n.toFixed(2));
const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const decToAmerican = (d: number) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));
const legKey = (id: string) => { const p = String(id).split(":"); return p.length >= 3 ? `${p[1]}:${p[2]}` : String(id); };

/** Approved-card lock: once a Bank Builder lane's card is approved for a date, it is pinned in
 *  mr-dub/bank-builder-locks.json so a later refresh can't silently swap its legs. */
export interface CardLockEntry { approvedAt: string; reason?: string; legs: PortfolioLaneLeg[] }
export interface CardLock {
  date: string;
  note?: string;
  /** Legacy / Bank Builder lane locks (top-level `lanes` == Bank Builder for backward compatibility). */
  lanes?: Record<string, CardLockEntry>;
  bankBuilder?: Record<string, CardLockEntry>;
  /** Moonshot lane locks — an operator-approved longshot card pins + activates the same way. */
  moonshot?: Record<string, CardLockEntry>;
}
function loadCardLock(root: string, date: string): CardLock | null {
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "bank-builder-locks.json"), "utf8")) as CardLock;
    return lock?.date === date ? lock : null;
  } catch { return null; }
}
/** Resolve the locked lanes for a product (legacy top-level `lanes` counts as Bank Builder). */
export function locksFor(lock: CardLock | null, product: PortfolioLane["product"]): Record<string, CardLockEntry> | null {
  if (!lock) return null;
  if (product === "bank-builder") return lock.bankBuilder ?? lock.lanes ?? null;
  if (product === "moonshot") return lock.moonshot ?? null;
  return null;
}
/**
 * Honor the approved-card lock for a product's lanes. For each locked lane, if EVERY locked leg's
 * game+market is still available in the live pool (odds posted, market present, game not pulled), the
 * locked card is preserved verbatim and re-priced from its own legs; the lane is flagged `locked`. If any
 * locked leg is gone (odds unavailable / game canceled / market removed) the lock is stale and the lane is
 * left as the freshly-generated card with a note — the only automatic replacement path.
 *
 * An approved card is intended to be PLACED: when `activate` is set and every locked leg is still pre-event
 * (outside the activation cutoff), the lane is forced ACTIVE so its paper exposure posts even if auto-
 * generation would have left it awaiting (e.g. a thin Moonshot slate). Never touches canonical money.
 */
export function applyCardLocks(
  lanes: PortfolioLane[],
  entries: Record<string, CardLockEntry> | null,
  pool: ModelPick[],
  product: PortfolioLane["product"],
  opts: { activate: boolean; nowMs: number },
): void {
  if (!entries) return;
  const byKey = new Map(pool.map((p) => [legKey(p.id), p]));
  for (const lane of lanes) {
    if (lane.product !== product) continue;
    const entry = entries[lane.lane];
    if (!entry?.legs?.length) continue;
    const missing = entry.legs.filter((l) => !byKey.has(legKey(l.id)));
    if (missing.length) {
      lane.shortfallNote = `Locked card released: ${missing.map((m) => m.selection).join(", ")} odds unavailable — regenerated. (approved ${entry.approvedAt})`;
      continue; // stale lock → keep regenerated card
    }
    const combinedDecimal = entry.legs.reduce((d, l) => d * dec(l.odds), 1);
    lane.legs = entry.legs;
    lane.legCount = entry.legs.length;
    lane.combinedOdds = decToAmerican(combinedDecimal);
    lane.combinedDecimal = Number(combinedDecimal.toFixed(4));
    lane.potentialReturn = round2(lane.stake * combinedDecimal);
    lane.fitsTarget = lane.potentialReturn >= (lane.targetReturn ?? 0);
    (lane as PortfolioLane & { locked?: boolean; approvedAt?: string }).locked = true;
    (lane as PortfolioLane & { locked?: boolean; approvedAt?: string }).approvedAt = entry.approvedAt;
    lane.whyThisCard = [`🔒 Approved card locked${entry.reason ? ` (${entry.reason})` : ""} on ${entry.approvedAt} — refreshes won't swap these legs unless an odds/market becomes unavailable.`, ...(lane.whyThisCard ?? [])].slice(0, 3);
    if (opts.activate && lane.status !== "active") {
      const allPreEvent = entry.legs.every((l) => {
        const ms = Date.parse(byKey.get(legKey(l.id))?.kickoffUtc ?? "");
        return Number.isFinite(ms) && ms - opts.nowMs >= ACTIVATION_CUTOFF_MIN * 60000;
      });
      if (allPreEvent) {
        lane.status = "active";
        lane.shortfallNote = null;
        lane.activationEligibility = { eligible: true, reason: "approved card locked — paper exposure placed" };
      }
    }
  }
}

/**
 * Build the activated daily portfolio object. `activate=false` leaves every lane a candidate (plan/
 * dry-run); `activate=true` marks eligible lanes ACTIVE (placing paper exposure). Eligible Moonshot
 * exposure is capped at MOONSHOT_MAX_EXPOSURE. NEVER changes active bankroll or crown.
 */
/** Canonical market key → the human label the daily-portfolio legs carry (the format the settlement already
 *  grades for the active Moonshot lanes). Keeps injected Bank Builder legs settlement-supported. */
const BB_MARKET_LABEL: Record<string, string> = {
  moneyline_90: "Match Result", double_chance: "Double Chance", draw_no_bet: "Draw No Bet",
  match_total_goals: "Total Goals", btts: "Both Teams To Score",
};

/**
 * Operator-APPROVED Bank Builder lanes for the date, read from mr-dub/bank-builder-approved.json and mapped
 * to ACTIVE PortfolioLanes (paper). Once the operator approves a day's lanes they are the source of truth —
 * pinned across refreshes — so the terminal-ladder auto-gate no longer hides Bank Builder. Legs carry the
 * settlement-supported label/selection the nightly settle already grades; the exposure is the $100 paper
 * seed. This NEVER touches canonical money — it only shapes the daily paper view.
 */
function approvedBankBuilderLanes(root: string, date: string): PortfolioLane[] {
  let doc: { date?: string; stake?: number; lanes?: Array<Record<string, any>> };
  try { doc = JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "bank-builder-approved.json"), "utf8")); } catch { return []; }
  if (!doc || doc.date !== date || !Array.isArray(doc.lanes)) return [];
  const stake = doc.stake ?? 100;
  // SAME-DAY SETTLEMENT GUARD: when an approved lane's step is ALREADY settled in the ladder (e.g. the card
  // settles at ~11pm ET on its own slate date, before the next-day roll), it must NOT re-surface as an
  // ACTIVE $100-at-risk / pending card — the seed is no longer at risk and the step is a cleared rung. Read
  // the ladder's per-step official result; when settled, render the lane as won/lost with $0 exposure (still
  // visible as history, never falls through to auto-generation). DISPLAY-ONLY: canonical money (portfolio.json
  // bankroll/crown/record) is never touched here — only the daily portfolio's exposure/status presentation.
  let ladderRun: Record<string, any> | null = null;
  try { ladderRun = JSON.parse(fs.readFileSync(path.join(root, "methodology", "launch", "dual-bank-builder-active.json"), "utf8")).run; } catch { ladderRun = null; }
  const settledStepResult = (laneLetter: unknown, step: number): "won" | "lost" | null => {
    const lane = ladderRun?.[`lane${String(laneLetter).toUpperCase()}`];
    const s = (lane?.steps ?? []).find((x: Record<string, any>) => x?.step === step);
    return s && s.status === "settled" && (s.result === "won" || s.result === "lost") ? s.result : null;
  };
  return doc.lanes.map((l): PortfolioLane => {
    // Per-lane stake + step win over the file defaults, so Lane A can carry its rolled Step-3 wager
    // (e.g. $700.78) while Lane B is a fresh $100 Step 1.
    const laneStake = typeof l.stake === "number" ? l.stake : stake;
    const step = typeof l.step === "number" ? l.step : 1;
    const settled = settledStepResult(l.lane, step); // "won" | "lost" | null — already-settled same-day step
    const legs: PortfolioLaneLeg[] = (l.legs ?? []).map((leg: Record<string, any>) => ({
      id: `bb-approved:${leg.gameSlug}:${leg.market}`,
      matchup: (leg.matchup ?? "").replace(/ v /, " vs "),
      market: BB_MARKET_LABEL[leg.market] ?? leg.marketLabel ?? leg.market,
      selection: leg.selection,
      player: null,
      odds: leg.americanOdds,
      provider: leg.provider ?? "consensus",
      modelConfidence: leg.modelProbability ?? 0,
      kickoffEt: leg.kickoffUtc ? new Date(leg.kickoffUtc).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET" : "",
      risk: "Lower-volatility",
      teamLogo: null,
    }));
    return {
      id: `bank-builder-approved-lane-${String(l.lane).toLowerCase()}-${date}`,
      product: "bank-builder", productLabel: "Bank Builder", lane: l.lane,
      // exposure is the $100 paper SEED (the at-risk / canonical-drawdown amount), never the rolled ladder
      // stake — consistent with the generated-lane path (seedExposure) + the ledger convention. `stake` still
      // carries the rolled Step-N wager (e.g. $174.23) for the card display. A SETTLED step is a finished
      // rung: status = the official result, exposure $0 (seed no longer at risk), clearedSteps counts it.
      step, clearedSteps: settled === "won" ? step : (typeof l.clearedSteps === "number" ? l.clearedSteps : 0), status: settled ?? "active", stake: laneStake, exposure: settled ? 0 : SEED_EXPOSURE,
      targetReturn: null, fitsTarget: true,
      combinedOdds: l.combinedOdds ?? 0, combinedDecimal: l.combinedDecimal ?? 1,
      potentialReturn: l.potentialReturn ?? round2(laneStake * (l.combinedDecimal ?? 1)),
      legCount: legs.length, targetLegs: legs.length, legs,
      correlationNote: null, shortfallNote: null,
      whyThisCard: [l.whyLadderPick, l.whyItCouldFail].filter(Boolean),
      activationEligibility: settled
        ? { eligible: false, reason: `settled ${settled} — official result recorded; seed no longer at risk` }
        : { eligible: true, reason: "operator-approved active paper ladder" },
      locked: true, approvedAt: doc.date,
    };
  });
}

export function buildPersistedDailyPortfolio(root: string, nowIso: string, date: string, generatedAt: string | null, activate: boolean): PersistedDailyPortfolio {
  const { activeBankroll, crownBankroll } = readCanonicalMoney(root);
  const _nowMsPre = Date.parse(nowIso);
  // Defense-in-depth: NEVER let an already-started game into the pool, even if a source artifact is stale
  // and still lists it (e.g. the market-outlook the team-leg loader reads is regenerated separately).
  // A started game can never be a live bettable leg. Pre-event only.
  const preEvent = <T extends { kickoffUtc?: string | null }>(legs: T[]): T[] =>
    legs.filter((p) => { const k = p.kickoffUtc ? Date.parse(p.kickoffUtc) : NaN; return !Number.isFinite(k) || k > _nowMsPre; });
  const pool = preEvent(loadWorldCupModelPicks(root, nowIso, date));
  // Bank Builder draws from a SOCCER-FIRST cross-sport pool: the broad World Cup team-leg pool (real
  // de-vigged moneyline favorites + totals for every game, e.g. Brazil moneyline) is PREFERRED; the model
  // pool fills any game/market the outlook didn't cover; the MLB board is the last fill. The selector leans
  // on the World Cup legs. Moonshot stays World-Cup-only (the WC longshot lane).
  const wcTeam = preEvent(loadWorldCupTeamLegs(root, nowIso, date));
  const seenWc = new Set(wcTeam.map((p) => `${p.gameId}:${p.marketKey}`));
  const wcFill = pool.filter((p) => !seenWc.has(`${p.gameId}:${p.marketKey}`));
  // HARD RULE — Bank Builder is TEAM / GAME-MARKET ONLY (moneyline / DNB / double-chance / totals / BTTS),
  // never player props. `wcTeam` is already team-only, but the model-pick fill + the MLB board carry
  // high-implied player props (e.g. a −480 "Over 0.5 shots") that out-rank the moneyline favorites in the
  // safest-target-fit selector and produce a weak prop-stacked ladder instead of Spain ML / Portugal ML.
  // A team leg has `player == null`; a player prop names the player. Filter the whole pool once.
  const bbPool = [...wcTeam, ...wcFill, ...loadMlbModelPicks(root, nowIso, date)].filter((p) => p.player == null);
  const nowMs = Date.parse(nowIso);
  const lanes: PortfolioLane[] = [];

  // ── Operator-APPROVED Bank Builder lanes win: when the operator has approved a day's lanes they are the
  //    active paper ladder (pinned), so the terminal-ladder auto-gate no longer hides Bank Builder. Paper
  //    only — canonical money is never touched here; the nightly settle grades these from official results. ──
  const usedBB = new Set<string>();
  const approvedBB = approvedBankBuilderLanes(root, date);
  if (approvedBB.length) {
    for (const lane of approvedBB) { lanes.push(lane); lane.legs.forEach((l) => usedBB.add(l.id)); }
  } else {
  // ── Bank Builder: pick Lane A + Lane B TOGETHER so they share no game (cross-lane independence),
  //    each fitting its next rung (Lane A Step 4, Lane B Step 2), team/game markets preferred. ──
  const rungs = readLaneRungs(root);
  if (rungs.laneA && rungs.laneB) {
    const { laneA, laneB } = selectCrossLaneBankBuilder(bbPool, rungs.laneA, rungs.laneB);
    for (const g of [laneA, laneB]) {
      g.legs.forEach((l) => usedBB.add(l.id));
      const elig = bbEligibility(g, nowMs);
      const status: PortfolioLane["status"] = g.legs.length < 2 ? "awaiting" : (activate && elig.eligible ? "active" : "candidate");
      lanes.push(toBBLane(g, status, elig));
    }
  } else {
    // Only one lane has a next rung — fall back to the single-lane target-fit selector. Use the
    // TEAM-MARKET-ONLY bbPool (NOT the raw `pool`, which carries player props) so the fallback lane is a
    // team-market ladder too — this is the path that runs when one lane is stopped (e.g. post-settlement
    // Lane A advanced, Lane B awaiting) and was the source of the prop-stacked Lane A.
    for (const rung of [rungs.laneA, rungs.laneB]) {
      if (!rung) continue;
      const g = selectSafestTargetFitCard(bbPool, rung, usedBB);
      g.legs.forEach((l) => usedBB.add(l.id));
      const elig = bbEligibility(g, nowMs);
      const status: PortfolioLane["status"] = g.legs.length < 2 ? "awaiting" : (activate && elig.eligible ? "active" : "candidate");
      lanes.push(toBBLane(g, status, elig));
    }
  }
  } // end auto-generated Bank Builder (no operator-approved lanes for the date)

  // ── Approved-card lock: pin any approved Bank Builder lane so this refresh can't swap its legs. ──
  const cardLock = loadCardLock(root, date);
  applyCardLocks(lanes, locksFor(cardLock, "bank-builder"), bbPool, "bank-builder", { activate, nowMs });
  for (const lane of lanes) if (lane.product === "bank-builder" && (lane as PortfolioLane & { locked?: boolean }).locked) lane.legs.forEach((l) => usedBB.add(l.id));

  // ── Moonshot: up to 5 higher-upside longshot legs per lane (min 3, ≥+700 floor), from the pool MINUS
  //    the Bank Builder legs (distinct lanes). A thin slate leaves lanes AWAITING — never forced. ──
  const poolForMoon = pool.filter((p) => !usedBB.has(p.id));
  const cands = buildDailyLaneCandidates(poolForMoon, date);
  let moonshotExposure = 0;
  for (const c of [cands.moonshotA, cands.moonshotB] as LaneCandidate[]) {
    const elig = laneEligibility(c, nowMs);
    let status: PortfolioLane["status"] = c.legCount < c.targetLegs ? "awaiting" : "candidate";
    if (activate && elig.eligible) {
      if (moonshotExposure + c.stake > MOONSHOT_MAX_EXPOSURE) { lanes.push(toPortfolioLane(c, "candidate", { eligible: false, reason: `Moonshot exposure cap $${MOONSHOT_MAX_EXPOSURE} reached` })); continue; }
      status = "active"; moonshotExposure += c.stake;
    }
    lanes.push(toPortfolioLane(c, status, elig));
  }
  // Honor an operator-approved Moonshot card lock (same principle as Bank Builder): pin + place it.
  applyCardLocks(lanes, locksFor(cardLock, "moonshot"), poolForMoon, "moonshot", { activate, nowMs });

  const active = lanes.filter((l) => l.status === "active");
  const coreExposure = round2(active.filter((l) => l.product === "bank-builder").reduce((s, l) => s + l.exposure, 0));
  const moonExposure = round2(active.filter((l) => l.product === "moonshot").reduce((s, l) => s + l.exposure, 0));
  const openExposure = round2(coreExposure + moonExposure);
  const potentialReturn = round2(active.reduce((s, l) => s + l.potentialReturn, 0));
  const zero = { wins: 0, losses: 0, voids: 0, pending: 0 };

  return {
    version: "daily-portfolio-v1", date, generatedAt,
    activeBankroll, crownBankroll,
    openExposure, availableBankroll: round2(activeBankroll - openExposure), potentialReturn,
    products: {
      bankBuilder: { exposure: coreExposure, record: { ...zero, pending: active.filter((l) => l.product === "bank-builder").length } },
      moonshot: { exposure: moonExposure, record: { ...zero, pending: active.filter((l) => l.product === "moonshot").length } },
    },
    lanes,
    settlement: { status: active.length ? "pending" : "none", realizedPnl: 0 },
    note: active.length
      ? "Active daily paper portfolio — open exposure is at risk; active bankroll and crown are unchanged until official settlement."
      : "Daily paper portfolio candidates — no exposure placed; active bankroll and crown unchanged.",
  };
}

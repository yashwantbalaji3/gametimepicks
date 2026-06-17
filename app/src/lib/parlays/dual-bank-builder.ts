/**
 * Dual Bank Builder lane selector. Picks the best FOUR non-correlated legs of the day and builds two
 * lanes (A: lower-volatility survival, B: diversified alternate exposure). Strictly gated: if fewer
 * than four qualified, non-correlated, fresh, started-not-yet legs exist, it returns
 * `no_qualified_launch` with reasons — it NEVER forces a launch. Pure: this evaluation layer NEVER
 * mutates prior Bank Builder runs/data; the launch command decides whether to persist a new run id.
 */
import type {
  EligibleLeg, DualBankBuilderResult, BankBuilderLane, BankBuilderLaneLeg, BankBuilderLaunchStatus,
} from "./types";
import { MODEL_VERSION } from "./types";
import { correlate } from "./correlation";
import { combinedAmerican, combinedHitProbability } from "./odds-math";

export interface BankBuilderOptions {
  /** "launch" lets the result reach status "launched"; "dry_run" caps it at "dry_run_only". */
  mode: "launch" | "dry_run";
  /** run id generator output (caller supplies; never reuse a prior run id). */
  newRunId?: string | null;
  /** Prefer one World Cup leg in EACH lane when ≥2 qualified soccer matches exist (default true). */
  preferSoccerPerLane?: boolean;
}

const isSoccer = (l: EligibleLeg): boolean => l.sport === "WORLD_CUP";

/**
 * Try to build two lanes that each carry one qualified soccer leg (from different matches) plus one
 * non-soccer leg (from a different game), pairwise non-correlated. Returns null if it can't be done
 * honestly (e.g. fewer than two qualified soccer matches) — never forced.
 */
function buildSoccerPerLane(pool: EligibleLeg[]): { laneA: EligibleLeg[]; laneB: EligibleLeg[] } | null {
  const soccer = pool.filter(isSoccer).sort((a, b) => survivalScore(b) - survivalScore(a));
  const nonSoccer = pool.filter((l) => !isSoccer(l)).sort((a, b) => survivalScore(b) - survivalScore(a));
  // One soccer leg per lane from two DIFFERENT matches.
  const soccerA = soccer[0];
  if (!soccerA) return null;
  const soccerB = soccer.find((l) => l.eventId !== soccerA.eventId);
  if (!soccerB) return null;

  const usedGames = new Set([soccerA.eventId, soccerB.eventId]);
  const partnerFor = (anchor: EligibleLeg, others: EligibleLeg[]): EligibleLeg | null => {
    // Prefer a non-soccer partner from a new game; else any leg from a new game.
    for (const cand of others) {
      if (usedGames.has(cand.eventId)) continue;
      if (pairOk(anchor, cand)) { usedGames.add(cand.eventId); return cand; }
    }
    return null;
  };
  const partnerA = partnerFor(soccerA, nonSoccer) ?? partnerFor(soccerA, soccer.slice(2));
  if (!partnerA) return null;
  const partnerB = partnerFor(soccerB, nonSoccer) ?? partnerFor(soccerB, soccer.slice(2));
  if (!partnerB) return null;

  return { laneA: [soccerA, partnerA], laneB: [soccerB, partnerB] };
}

/**
 * Survival score (0–100): how likely a leg is NOT to lose — distinct from value/edge. Rewards low
 * variance (high model hit probability) + quality + low risk, penalizes fragility. A heavy-favorite
 * double-chance (~90%+ to cover) is a textbook survival leg even with zero edge, so survival credits
 * model probability directly (capped) rather than leaning only on the edge-driven quality score.
 */
export function survivalScore(l: EligibleLeg): number {
  let s = l.legQualityScore;
  s -= l.riskScore * 25;
  if (l.legQualityTier === "elite") s += 8;
  if (l.legQualityTier === "strong") s += 4;
  // Low-variance credit: high model hit probability = high survival (the point of a survival lane).
  if (typeof l.modelProbability === "number" && Number.isFinite(l.modelProbability)) {
    s += Math.max(0, Math.min(0.45, l.modelProbability - 0.5)) * 40; // 0.5→0, 0.75→+10, 0.95→+18
  }
  if (l.staleDataFlags.length) s -= 30;
  if (l.smallSampleFlags.length) s -= 8;
  if (l.marketScope === "unknown") s -= 100;
  return Math.max(0, Math.min(100, Math.round(s)));
}

const SURVIVAL_ELIGIBLE = 70;

/** Capitalize the pick side for display (over → Over, under → Under, yes/no → Yes/No). */
export function sideLabel(side: string | null): string {
  if (!side) return "";
  const s = side.toLowerCase();
  if (s === "over") return "Over";
  if (s === "under") return "Under";
  if (s === "yes") return "Yes";
  if (s === "no") return "No";
  return "";
}

function laneLeg(l: EligibleLeg): BankBuilderLaneLeg {
  const sl = sideLabel(l.side);
  // Exact pick label, e.g. "JR Ritchie Strikeouts Over 3.5" (side is included for O/U markets).
  const label = `${l.participantName} ${l.marketType}${sl ? ` ${sl}` : ""}${l.line != null ? ` ${l.line}` : ""}`.replace(/\s+/g, " ").trim();
  return {
    legId: l.legId, sport: l.sport, eventId: l.eventId, label, marketType: l.marketType,
    odds: l.odds, modelProbability: l.modelProbability, legQualityTier: l.legQualityTier,
    legQualityScore: l.legQualityScore, riskScore: l.riskScore,
    side: l.side, line: l.line, startTime: l.startTime, confidenceTier: l.confidenceTier,
    dataQuality: l.dataQualityGrade, topPositiveFactors: l.topPositiveFactors, topNegativeFactors: l.topNegativeFactors,
  };
}

function pairOk(a: EligibleLeg, b: EligibleLeg): boolean {
  const c = correlate(a, b);
  return c.correlationType !== "conflicting" && c.correlationType !== "unknown" && c.correlationScore > -0.2 && c.correlationScore < 0.5;
}

function buildLane(id: "A" | "B", legs: EligibleLeg[], label: string): BankBuilderLane {
  return {
    laneId: id,
    label,
    legs: legs.map(laneLeg),
    combinedOdds: combinedAmerican(legs.map((l) => l.odds)),
    laneSurvivalScore: Math.round(legs.reduce((s, l) => s + survivalScore(l), 0) / Math.max(1, legs.length)),
    estimatedHitProbability: combinedHitProbability(legs.map((l) => l.modelProbability)),
  };
}

export function selectDualBankBuilder(eligible: EligibleLeg[], date: string, opts: BankBuilderOptions): DualBankBuilderResult {
  const rejected: Array<{ legId: string; reason: string }> = [];
  const noLaunchReasons: string[] = [];

  // Qualified pool: survival ≥ threshold, non-fragile-ish, fresh, valid scope.
  const qualified = eligible
    .filter((l) => {
      const sv = survivalScore(l);
      if (l.marketScope === "unknown") { rejected.push({ legId: l.legId, reason: "unknown market scope" }); return false; }
      if (l.staleDataFlags.length) { rejected.push({ legId: l.legId, reason: "stale critical data" }); return false; }
      if (sv < SURVIVAL_ELIGIBLE) { rejected.push({ legId: l.legId, reason: `survival ${sv} < ${SURVIVAL_ELIGIBLE}` }); return false; }
      return true;
    })
    .sort((a, b) => survivalScore(b) - survivalScore(a));

  // De-duplicate exposure: one leg per (game, participant) — strongest survival wins.
  const seenExposure = new Set<string>();
  const pool: EligibleLeg[] = [];
  for (const l of qualified) {
    const key = `${l.eventId}:${l.participantName}`;
    if (seenExposure.has(key)) { rejected.push({ legId: l.legId, reason: "duplicate game/participant exposure" }); continue; }
    seenExposure.add(key);
    pool.push(l);
  }

  const distinctGames = new Set(pool.map((l) => l.eventId)).size;

  let selected: EligibleLeg[];
  let laneAlegs: EligibleLeg[];
  let laneBlegs: EligibleLeg[];

  // ── Preferred: one qualified soccer leg in EACH lane (when ≥2 soccer matches qualify) ──────────
  const soccerLanes = opts.preferSoccerPerLane !== false ? buildSoccerPerLane(pool) : null;
  if (soccerLanes) {
    laneAlegs = soccerLanes.laneA;
    laneBlegs = soccerLanes.laneB;
    selected = [...laneAlegs, ...laneBlegs];
  } else {
    // ── Game-diversified best-four selection ─────────────────────────────────────────────────────
    // Pass 1: highest-survival leg from each distinct game (pairwise non-correlated) so two
    // game-disjoint lanes can be formed whenever ≥ 4 qualified games exist.
    selected = [];
    const usedGames = new Set<string>();
    for (const cand of pool) {
      if (selected.length >= 4) break;
      if (usedGames.has(cand.eventId)) continue;
      if (selected.every((s) => pairOk(s, cand))) { selected.push(cand); usedGames.add(cand.eventId); }
    }
    // Pass 2: only if too few distinct games, allow a 2nd non-correlated leg from a used game.
    if (selected.length < 4) {
      for (const cand of pool) {
        if (selected.length >= 4) break;
        if (selected.includes(cand)) continue;
        if (selected.every((s) => pairOk(s, cand))) selected.push(cand);
      }
    }
    // Split into two lanes, each internally game-disjoint: strongest pair → Lane A, rest → B.
    const bySurv = [...selected].sort((a, b) => survivalScore(b) - survivalScore(a));
    laneAlegs = bySurv.length ? [bySurv[0]] : [];
    for (let i = 1; i < bySurv.length && laneAlegs.length < 2; i++) {
      if (bySurv[i].eventId !== laneAlegs[0].eventId) laneAlegs.push(bySurv[i]);
    }
    const usedIds = new Set(laneAlegs.map((l) => l.legId));
    laneBlegs = bySurv.filter((l) => !usedIds.has(l.legId)).slice(0, 2);
  }

  const laneBdisjoint = laneBlegs.length === 2 && laneBlegs[0].eventId !== laneBlegs[1].eventId;
  const soccerPerLane = laneAlegs.some(isSoccer) && laneBlegs.some(isSoccer);

  const gates: DualBankBuilderResult["launchGateSummary"] = [
    { gate: "≥4 qualified non-correlated legs", passed: selected.length >= 4, detail: `${selected.length} selected (survival ≥ ${SURVIVAL_ELIGIBLE})` },
    { gate: "≥2 distinct games", passed: distinctGames >= 2, detail: `${distinctGames} distinct games in qualified pool` },
    { gate: "no stale/unknown-scope legs", passed: selected.every((l) => l.staleDataFlags.length === 0 && l.marketScope !== "unknown"), detail: "checked per leg" },
    { gate: "two game-disjoint 2-leg lanes", passed: laneAlegs.length === 2 && laneBlegs.length === 2 && laneAlegs[0].eventId !== laneAlegs[1].eventId && laneBdisjoint, detail: `laneA games ${laneAlegs.map((l) => l.eventId).join(",")} · laneB games ${laneBlegs.map((l) => l.eventId).join(",")}` },
  ];
  // Hard gates only decide the launch; soccer-per-lane is a PREFERENCE, recorded but not a blocker.
  const allPassed = gates.every((g) => g.passed);
  gates.push({ gate: "one soccer leg per lane (preferred)", passed: soccerPerLane, detail: soccerPerLane ? "World Cup leg in both lanes" : "soccer not in both lanes (preference only — not a hard blocker)" });

  if (!allPassed) {
    for (const g of gates) if (!g.passed) noLaunchReasons.push(`${g.gate} — ${g.detail}`);
    return {
      runId: null, date, status: "no_qualified_launch",
      laneA: null, laneB: null,
      selectedFourLegs: selected.map(laneLeg),
      rejectedCandidates: rejected.slice(0, 50),
      launchGateSummary: gates,
      noLaunchReasons,
      modelVersion: MODEL_VERSION,
      createdAt: null,
      published: false,
    };
  }

  if (laneAlegs.length < 2 || laneBlegs.length < 2) {
    noLaunchReasons.push("could not form two game-disjoint 2-leg lanes from the non-correlated pool");
    return {
      runId: null, date, status: "no_qualified_launch",
      laneA: null, laneB: null,
      selectedFourLegs: selected.map(laneLeg),
      rejectedCandidates: rejected.slice(0, 50),
      launchGateSummary: [...gates, { gate: "two 2-leg lanes built", passed: false, detail: `laneA=${laneAlegs.length} laneB=${laneBlegs.length}` }],
      noLaunchReasons,
      modelVersion: MODEL_VERSION,
      createdAt: null,
      published: false,
    };
  }

  const status: BankBuilderLaunchStatus = opts.mode === "launch" ? "launched" : "dry_run_only";
  return {
    runId: status === "launched" ? (opts.newRunId ?? null) : null,
    date,
    status,
    laneA: buildLane("A", laneAlegs, "Lane A: lower-volatility survival lane"),
    laneB: buildLane("B", laneBlegs, "Lane B: diversified alternate exposure lane"),
    selectedFourLegs: selected.map(laneLeg),
    rejectedCandidates: rejected.slice(0, 50),
    launchGateSummary: [...gates, { gate: "two 2-leg lanes built", passed: true, detail: "Lane A + Lane B" }],
    noLaunchReasons: [],
    modelVersion: MODEL_VERSION,
    createdAt: null,
    published: false,
  };
}

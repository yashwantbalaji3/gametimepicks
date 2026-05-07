/**
 * Phase 12 — Parlay Lab matching logic.
 *
 * Pure, side-effect-free functions that take user-pasted parlay legs
 * and match them against the model's existing PropLean data for the
 * selected slate. No network calls. No fabricated data. If a leg can't
 * be matched, that's reported honestly.
 *
 * Hard rules enforced here:
 *   - We NEVER invent alternate lines. If the user pastes "LeBron over
 *     6.5 AST" but our board only has 5.5 AST for LeBron, we report
 *     "no matching model line" rather than guessing what the model
 *     would say at 6.5.
 *   - We NEVER claim a leg is profitable. Our output describes whether
 *     the model AGREES or DISAGREES with the chosen side, not whether
 *     it would be a winning bet.
 *   - Same-game multi-leg parlays surface a correlation warning. We
 *     don't attempt to compute the joint probability — just warn that
 *     legs in the same game are not independent.
 *   - Risk profile is a labeling exercise, not advice. "Conservative"
 *     means high-confidence + healthy data; "Aggressive" means
 *     higher-edge-but-thin-data. Both are simulations.
 */

import type { PropLean, Market, LeanType, ConfidenceTier } from "./types";

export interface PastedLeg {
  /** What the user typed. Free-text player name. */
  rawPlayerName: string;
  /** Market: PTS / REB / AST. Free-text input gets normalized. */
  market: Market;
  /** Side the parlay slip says — Over or Under. */
  side: "Over" | "Under";
  /** Line the slip shows. */
  line: number;
  /** Optional American odds (-110, +120, etc.). */
  oddsAmerican?: number | null;
  /** Optional sportsbook name for display. */
  sportsbook?: string;
}

export type MatchVerdict =
  | "model_agrees"          // model leans the same side
  | "model_opposes"          // model leans opposite side
  | "model_passes"           // model said No Play / Pass on this prop
  | "no_matching_line"       // we have the player but not at this line
  | "no_matching_player"     // we don't have this player on the slate
  | "data_quality_warning";  // matched but recent10/playerId is missing

export interface LegAnalysis {
  leg: PastedLeg;
  verdict: MatchVerdict;
  matchedLean: PropLean | null;
  /** Side the model leans. Same string convention as `lean.lean`. */
  modelSide: LeanType | null;
  modelProjection: number | null;
  modelEdgePct: number | null;
  modelConfidence: ConfidenceTier | null;
  /** Did we have valid recent10 trend data? */
  hasRecent10: boolean;
  /** Was the matched lean's playerId valid (>0)? */
  hasValidPlayerId: boolean;
  /** Per-leg human-readable note for display. Never claims profitability. */
  note: string;
}

export interface ParlayAnalysis {
  legs: LegAnalysis[];
  /** Number of distinct games covered by the legs. */
  uniqueGames: number;
  /** True if 2+ legs share the same game. */
  hasSameGameLegs: boolean;
  /** Risk profile classification — purely a label, not advice. */
  riskProfile: "conservative" | "balanced" | "aggressive" | "uncertain";
  /** Combined American odds when every leg has odds. null otherwise. */
  combinedOddsAmerican: number | null;
  /** Implied probability of the combined American odds. null if any leg missing. */
  combinedImpliedProbability: number | null;
  /** Top-level summary for the UI. Never claims profitability. */
  summary: string;
}

// ---------------------------------------------------------------------------
// Player name matching (Phase 12 — same normalization rule as grouping.ts)
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ---------------------------------------------------------------------------
// American odds <-> implied probability
// ---------------------------------------------------------------------------

export function americanToImplied(odds: number): number {
  if (!Number.isFinite(odds) || odds === 0) return 0;
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

export function impliedToAmerican(p: number): number {
  // Standard conversion. Result rounded to nearest integer for display.
  if (p <= 0 || p >= 1) return 0;
  if (p >= 0.5) return Math.round((-p / (1 - p)) * 100);
  return Math.round(((1 - p) / p) * 100);
}

// ---------------------------------------------------------------------------
// Single-leg matching
// ---------------------------------------------------------------------------

export function analyzeLeg(leg: PastedLeg, slateLeans: PropLean[]): LegAnalysis {
  const legNameNorm = normalizeName(leg.rawPlayerName);

  const playerLeans = slateLeans.filter(
    (l) => normalizeName(l.playerName) === legNameNorm,
  );

  if (playerLeans.length === 0) {
    return {
      leg,
      verdict: "no_matching_player",
      matchedLean: null,
      modelSide: null,
      modelProjection: null,
      modelEdgePct: null,
      modelConfidence: null,
      hasRecent10: false,
      hasValidPlayerId: false,
      note: `No "${leg.rawPlayerName}" on this slate. Check spelling or pick a different game.`,
    };
  }

  const marketLeans = playerLeans.filter((l) => l.market === leg.market);

  if (marketLeans.length === 0) {
    return {
      leg,
      verdict: "no_matching_player",
      matchedLean: null,
      modelSide: null,
      modelProjection: null,
      modelEdgePct: null,
      modelConfidence: null,
      hasRecent10: false,
      hasValidPlayerId: false,
      note: `${leg.rawPlayerName} is on the slate but no ${leg.market} prop is available.`,
    };
  }

  // Match by line. Tolerate a 0.01 epsilon for floating point.
  const exactLineLean =
    marketLeans.find((l) => Math.abs(l.line - leg.line) < 0.01) ?? null;

  if (!exactLineLean) {
    const availableLines = Array.from(new Set(marketLeans.map((l) => l.line))).sort();
    return {
      leg,
      verdict: "no_matching_line",
      matchedLean: null,
      modelSide: null,
      modelProjection: null,
      modelEdgePct: null,
      modelConfidence: null,
      hasRecent10: false,
      hasValidPlayerId: false,
      note: `Available ${leg.market} lines for ${leg.rawPlayerName}: ${availableLines.join(", ")}. We don't synthesize alternate lines.`,
    };
  }

  // We have a real model line. Score the leg.
  const lean = exactLineLean;
  const hasRecent10 =
    Array.isArray(lean.recent10) && lean.recent10.length >= 2;
  const hasValidPlayerId =
    typeof lean.playerId === "number" && lean.playerId > 0;

  // model_passes: model decided No Play / Pass on this prop
  if (lean.lean === "No Play" || lean.lean === "Pass") {
    return {
      leg,
      verdict: "model_passes",
      matchedLean: lean,
      modelSide: lean.lean,
      modelProjection: lean.projection,
      modelEdgePct: lean.edgePct,
      modelConfidence: lean.confidence,
      hasRecent10,
      hasValidPlayerId,
      note: `Model declined this prop (${lean.confidence}). The slip's ${leg.side} pick is not supported by the model.`,
    };
  }

  // Compare sides
  const modelSays = lean.lean; // "Over" | "Under" | "No Play" | "Pass"
  const userSays = leg.side;

  if (modelSays === userSays) {
    let note = `Model agrees: leans ${modelSays} ${lean.line}`;
    if (typeof lean.edgePct === "number" && Number.isFinite(lean.edgePct)) {
      note += ` (${lean.edgePct >= 0 ? "+" : ""}${lean.edgePct.toFixed(1)}% edge)`;
    }
    note += ` — confidence ${lean.confidence}.`;

    // Data quality flag layered on top
    if (!hasValidPlayerId) {
      return {
        leg,
        verdict: "data_quality_warning",
        matchedLean: lean,
        modelSide: lean.lean,
        modelProjection: lean.projection,
        modelEdgePct: lean.edgePct,
        modelConfidence: lean.confidence,
        hasRecent10,
        hasValidPlayerId,
        note: `${note} ⚠ playerId is unresolved on this row — recent trend data may be missing.`,
      };
    }

    return {
      leg,
      verdict: "model_agrees",
      matchedLean: lean,
      modelSide: lean.lean,
      modelProjection: lean.projection,
      modelEdgePct: lean.edgePct,
      modelConfidence: lean.confidence,
      hasRecent10,
      hasValidPlayerId,
      note,
    };
  }

  // Opposing
  let oppNote = `Model OPPOSES: leans ${modelSays} ${lean.line}, you picked ${userSays}.`;
  if (typeof lean.edgePct === "number" && Number.isFinite(lean.edgePct)) {
    oppNote += ` (model edge ${lean.edgePct >= 0 ? "+" : ""}${lean.edgePct.toFixed(1)}%)`;
  }
  return {
    leg,
    verdict: "model_opposes",
    matchedLean: lean,
    modelSide: lean.lean,
    modelProjection: lean.projection,
    modelEdgePct: lean.edgePct,
    modelConfidence: lean.confidence,
    hasRecent10,
    hasValidPlayerId,
    note: oppNote,
  };
}

// ---------------------------------------------------------------------------
// Whole-parlay analysis
// ---------------------------------------------------------------------------

export function analyzeParlay(
  legs: PastedLeg[],
  slateLeans: PropLean[],
): ParlayAnalysis {
  const legAnalyses = legs.map((leg) => analyzeLeg(leg, slateLeans));

  // Collect unique games
  const games = new Set<string>();
  for (const a of legAnalyses) {
    if (a.matchedLean?.gameId) games.add(a.matchedLean.gameId);
  }

  // Combined American odds (only if every leg has odds)
  let combinedOddsAmerican: number | null = null;
  let combinedImpliedProbability: number | null = null;
  if (legs.every((l) => typeof l.oddsAmerican === "number" && l.oddsAmerican !== 0)) {
    const product = legs.reduce(
      (acc, l) => acc * americanToImplied(l.oddsAmerican as number),
      1,
    );
    combinedImpliedProbability = product;
    combinedOddsAmerican = impliedToAmerican(product);
  }

  // Risk profile classification
  const agrees = legAnalyses.filter((a) => a.verdict === "model_agrees").length;
  const opposes = legAnalyses.filter((a) => a.verdict === "model_opposes").length;
  const dq = legAnalyses.filter(
    (a) => a.verdict === "data_quality_warning" || !a.hasValidPlayerId || !a.hasRecent10,
  ).length;
  const high = legAnalyses.filter((a) => a.modelConfidence === "High").length;
  const total = legAnalyses.length;

  let riskProfile: ParlayAnalysis["riskProfile"] = "uncertain";
  if (total > 0) {
    const allMatched = legAnalyses.every(
      (a) => a.matchedLean !== null && a.verdict !== "model_passes",
    );
    if (allMatched && agrees === total && high === total && dq === 0) {
      riskProfile = "conservative";
    } else if (allMatched && agrees >= total - 1 && opposes === 0) {
      riskProfile = "balanced";
    } else if (opposes > 0 || dq > total / 2) {
      riskProfile = "aggressive";
    } else {
      riskProfile = "uncertain";
    }
  }

  // Build the summary line — purely descriptive, no profitability claim
  let summary = "";
  if (total === 0) {
    summary = "No legs entered.";
  } else {
    summary = `${agrees}/${total} legs align with the model.`;
    if (opposes > 0) summary += ` ${opposes} OPPOSE the model.`;
    if (games.size === 1 && total > 1) {
      summary += " All legs in one game — outcomes are correlated.";
    }
    if (dq > 0) summary += ` ${dq} legs have weak data quality.`;
  }

  return {
    legs: legAnalyses,
    uniqueGames: games.size,
    hasSameGameLegs: games.size > 0 && games.size < total,
    riskProfile,
    combinedOddsAmerican,
    combinedImpliedProbability,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Quick paste parser
// ---------------------------------------------------------------------------

/**
 * Parse one line of pasted text into a `PastedLeg` if possible.
 *
 * Accepts formats like:
 *   "LeBron James Over 25.5 PTS -110"
 *   "Donovan Mitchell Under 5.5 AST"
 *   "Cade Cunningham PTS Over 22.5"
 *   "Anthony Davis Over 9.5 REB +120"
 *
 * Returns null if the line couldn't be confidently parsed. We don't
 * guess — better to ask the user to fix the format than to mis-attribute.
 */
export function parsePastedLine(line: string): PastedLeg | null {
  const cleaned = line.trim();
  if (!cleaned || cleaned.startsWith("#")) return null;

  // Find market token (PTS / REB / AST), case-insensitive
  const marketMatch = cleaned.match(/\b(PTS|REB|AST|points?|rebounds?|assists?)\b/i);
  if (!marketMatch) return null;
  const rawMarket = marketMatch[0].toLowerCase();
  let market: Market;
  if (rawMarket.startsWith("pt") || rawMarket === "points") market = "PTS";
  else if (rawMarket.startsWith("re")) market = "REB";
  else market = "AST";

  // Find side
  const sideMatch = cleaned.match(/\b(Over|Under|O|U)\b/i);
  if (!sideMatch) return null;
  const side: "Over" | "Under" = /^o/i.test(sideMatch[0]) ? "Over" : "Under";

  // Find line — first decimal/integer that isn't the odds
  const numbers = Array.from(cleaned.matchAll(/-?\d+(?:\.\d+)?/g)).map((m) => ({
    value: parseFloat(m[0]),
    raw: m[0],
    pos: m.index ?? 0,
  }));
  if (numbers.length === 0) return null;

  // Heuristic: line is the smallest non-negative number under 100 that
  // isn't preceded by a '+' or '-' sign character (that would be odds).
  const lineCandidate = numbers.find(
    (n) =>
      n.value >= 0 && n.value < 100 && !n.raw.startsWith("-"),
  );
  if (!lineCandidate) return null;

  // Odds: a number that looks like American odds (>= 100 absolute, signed)
  const oddsCandidate = numbers.find((n) => Math.abs(n.value) >= 100);

  // Player name = everything BEFORE the side keyword and the market keyword,
  // whichever comes first. Strip trailing punctuation.
  const stopPos = Math.min(
    sideMatch.index ?? cleaned.length,
    marketMatch.index ?? cleaned.length,
  );
  let rawPlayerName = cleaned.substring(0, stopPos).trim();
  rawPlayerName = rawPlayerName.replace(/[—–\-:|]+$/, "").trim();

  if (!rawPlayerName) return null;

  return {
    rawPlayerName,
    market,
    side,
    line: lineCandidate.value,
    oddsAmerican: oddsCandidate ? oddsCandidate.value : null,
  };
}

export function parsePastedBlock(text: string): PastedLeg[] {
  return text
    .split(/\r?\n/)
    .map((line) => parsePastedLine(line))
    .filter((leg): leg is PastedLeg => leg !== null);
}

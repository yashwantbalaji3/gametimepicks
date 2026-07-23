/**
 * DETERMINISTIC MLB GAME-SIMULATION GENERATOR — v1 (Phase 4).
 *
 * Turns an existing, already-committed MLB board (`public/data/mlb/boards/<date>.json`) into a
 * deterministic `GameSimulationArtifact` that PASSES `validateGameSimulation`. There is NO network, NO
 * new API, and NO money write here — every number in the output derives from a real board field or a
 * seeded sample of one.
 *
 * Approach (OPTION A — seeded sampling, valid because the board carries `projection` + `sigma`):
 *   For each player-prop lean that has a finite `projection` AND finite `sigma`, we draw `RUN_COUNT`
 *   seeded Gaussian samples ~ N(projection, sigma) (clamped at 0 for count stats), then compute the
 *   over/under hit-rate vs the board `line` — that IS the simulated model probability — and build a
 *   real histogram from the actual samples. A lean lacking `projection` or `sigma` is NEVER sampled: it
 *   contributes no distribution and is declared as an unavailable module. Nothing is fabricated.
 *
 * Determinism: the ONLY non-deterministic field is `generatedAt`, which is injected. Every random draw
 * descends from a string seed (see rng.ts). The same board ⇒ byte-identical artifact (ignoring
 * `generatedAt`), asserted via a stable `artifactHash`.
 *
 * Honesty: because we ACTUALLY run RUN_COUNT (=10000) seeded iterations, `runCount: 10000` is truthful and
 * the UI may later say "10,000-run simulation". We never persist the phrase "Monte Carlo" — the honest
 * label is "deterministic seeded simulation".
 *
 * Framework-free (no React/Next) so tsx runs the CLI + tests directly.
 */

import { SeededRng, leanSeed, stableHash } from "./rng";
import type {
  GameSimStatus,
  GameSimulationArtifact,
  GameSimulationGame,
  SimDistribution,
  SimDistributionBin,
  SimDistributions,
  SimFreshness,
  SimGeneratedPick,
  SimMarketLine,
  SimMarketSnapshot,
  SimRiskTier,
  SimSummary,
  SimUnavailableModule,
} from "./types";

// ---------------------------------------------------------------------------
// Engine constants — bump `SIMULATION_VERSION` on any breaking sampling/shape change.
// ---------------------------------------------------------------------------

/** A real count of real iterations actually drawn per sampled lean. Makes `runCount` truthful.
 *  Bumped 1,000 → 10,000 (2026-07-09): smoother tails, stable headline numbers across reruns; the
 *  artifact stays small because distributions are BINNED (fixed integer bins, only the counts grow).
 *  The UI reads the artifact's runCount, so every "N-run" label updates automatically. */
export const RUN_COUNT = 10000;
/** Model tag; drives staleness together with the simulation version. */
export const MODEL_VERSION = "mlb-2026.07";
/** Engine/format version; part of every seed so a version bump reshuffles streams deterministically. */
export const SIMULATION_VERSION = 1;
/** Max generated picks surfaced per game (ranked). */
export const MAX_PICKS_PER_GAME = 8;
/** Target number of histogram bins for a sampled distribution. */
const HISTOGRAM_BINS = 10;

// ---------------------------------------------------------------------------
// Board input shapes (structurally typed — we read only the fields we rely on).
// ---------------------------------------------------------------------------

interface BoardReasonBullet {
  label?: string;
  text?: string;
  tone?: string;
}

export interface BoardLean {
  id?: string;
  gameId: string;
  gamePk: number;
  commenceTime?: string;
  homeTeamAbbr?: string;
  homeTeamName?: string;
  awayTeamAbbr?: string;
  awayTeamName?: string;
  venue?: string;
  playerId?: number | string;
  playerName?: string;
  playerTeamAbbr?: string;
  playerRole?: string;
  opponentAbbr?: string;
  marketKey: string;
  marketLabel?: string;
  line: number;
  oddsOver?: number;
  oddsUnder?: number;
  impliedOver?: number;
  impliedUnder?: number;
  bookmaker?: string;
  projection?: number;
  sigma?: number;
  samples?: number;
  lean?: string;
  confidence?: string;
  modelProbOver?: number;
  modelProbUnder?: number;
  edgePct?: number;
  edgePctOver?: number;
  edgePctUnder?: number;
  riskFlags?: string[];
  reason?: string;
  reasonBullets?: BoardReasonBullet[];
}

export interface BoardGame {
  gamePk: number;
  gameDate?: string;
  date?: string;
  venue?: string;
  awayTeamAbbr?: string;
  awayTeamName?: string;
  homeTeamAbbr?: string;
  homeTeamName?: string;
}

export interface MlbBoard {
  sport?: string;
  date: string;
  generatedAt?: string;
  games?: BoardGame[];
  leans?: BoardLean[];
  bookmaker?: string;
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Count-stat markets clamp samples at 0 (you can't record −1 hits). All current MLB props are counts. */
function isCountStat(_marketKey: string): boolean {
  return true;
}

/** Map the board's confidence string to a display 0..1 confidence. Unknown ⇒ conservative 0.4. */
function confidenceToScore(confidence: string | undefined): number {
  switch ((confidence || "").toLowerCase()) {
    case "high":
      return 0.8;
    case "medium":
      return 0.6;
    case "low":
      return 0.4;
    default:
      return 0.4; // insufficient_data / unknown
  }
}

/**
 * Coarse risk tier from confidence + risk flags. Anomaly/insufficient-data flags always demote to a
 * volatile tier; otherwise confidence drives it. Deterministic, display-only.
 */
function riskTierFor(confidence: string | undefined, riskFlags: string[] | undefined): SimRiskTier {
  const flags = riskFlags || [];
  if (flags.includes("insufficient_data")) return "longshot";
  if (flags.includes("r5_model_anomaly")) return "value";
  switch ((confidence || "").toLowerCase()) {
    case "high":
      return "anchor";
    case "medium":
      return "core";
    case "low":
      return "value";
    default:
      return "longshot";
  }
}

/** Flatten the board's structured reasonBullets to honest plain strings (no invention). */
function reasonBulletsToStrings(bullets: BoardReasonBullet[] | undefined): string[] {
  if (!Array.isArray(bullets)) return [];
  return bullets
    .map((b) => {
      const label = typeof b.label === "string" ? b.label.trim() : "";
      const text = typeof b.text === "string" ? b.text.trim() : "";
      if (label && text) return `${label}: ${text}`;
      return text || label;
    })
    .filter((s) => s.length > 0);
}

/** Deterministic slug `away-vs-home-date`, lowercased + hyphenated. */
function makeSlug(awayAbbr: string, homeAbbr: string, date: string): string {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `${clean(awayAbbr || "away")}-vs-${clean(homeAbbr || "home")}-${date}`;
}

// ---------------------------------------------------------------------------
// Per-game identity resolution — DOUBLEHEADER-SAFE
// ---------------------------------------------------------------------------
//
// THE DEFECT THIS GUARDS AGAINST: a doubleheader is two DISTINCT games with the SAME teams + date but
// DIFFERENT schedule ids (MLB gamePk). Upstream, the board's PER-LEAN `gamePk` can be stamped by a
// team/date-only join that collapses BOTH games onto ONE gamePk (last-wins) — the real 2026-07-22 board
// stamps every PIT@NYY lean with 823519 (823518 appears on NO lean) and every BAL@BOS lean with 824732
// (824735 dropped). Naively taking `leans[0].gamePk` (the old behaviour) therefore labels both sim games
// with the SAME id: the twin whose id was dropped resolves to NO simulation downstream and shows
// "not yet simulated", while its sibling renders.
//
// THE FIX: re-derive each game's gamePk from the AUTHORITATIVE schedule (`board.games[]`, which carries
// the correct DISTINCT gamePks + `gameDate` per game) using a per-game-UNIQUE key (team-pair + a strict
// commence-time↔gameDate ordering), and FAIL CLOSED when a unique match cannot be proven — leaving the
// game honestly unavailable (no gamePk emitted) rather than mislabeling it with its twin's identity.

export interface GameGroupIdentity {
  gameId: string;
  awayTeamAbbr?: string;
  homeTeamAbbr?: string;
  /** ISO commence time carried by the group's leans (odds-API event start). */
  commenceTime?: string;
  /** The gamePk stamped on the group's leans — UNRELIABLE for doubleheaders (may be the twin's). */
  leanGamePk?: number;
}

export interface ScheduleGame {
  gamePk: number;
  awayTeamAbbr?: string;
  homeTeamAbbr?: string;
  /** ISO scheduled start from the board schedule (authoritative, distinct per DH game). */
  gameDate?: string;
}

export interface ResolvedIdentity {
  /** The resolved schedule gamePk, or `null` when identity could NOT be proven (fail-closed). */
  gamePk: number | null;
  /** True ⇔ a UNIQUE schedule game was proven for this group. */
  resolved: boolean;
  /** How the match was made (or why it failed) — provenance for the artifact + tests. */
  method: string;
}

/** Normalize a team-pair to a stable comparison key (case/punctuation-insensitive). */
function teamPairKey(away: string | undefined, home: string | undefined): string {
  const clean = (s: string | undefined) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${clean(away)}@${clean(home)}`;
}

/** Parse an ISO timestamp to epoch ms, or `null` when absent/unparseable. */
function parseIsoMs(iso: string | undefined): number | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Resolve each lean-group's TRUE gamePk from the schedule — doubleheader-safe. Pure + deterministic.
 *
 * Guarantees:
 *   (a) two groups sharing a team-pair NEVER receive the SAME gamePk (distinct identity or fail-closed);
 *   (b) a group is `resolved:true` ONLY when a unique schedule game can be proven; otherwise
 *       `{ gamePk: null, resolved: false }` so the caller leaves it honestly unavailable (fail-closed);
 *   (c) NO team/date-only first-match fallback — a multi-game (doubleheader) pair is split ONLY by a
 *       strict, tie-free commence-time↔gameDate ordering, never by "take the first schedule row".
 *
 * @param groups        one entry per distinct gameId (first-seen order), from the board's leans
 * @param scheduleGames the board's `games[]` schedule rows (authoritative gamePk + gameDate)
 */
export function resolveGamePks(
  groups: GameGroupIdentity[],
  scheduleGames: ScheduleGame[],
): Map<string, ResolvedIdentity> {
  const out = new Map<string, ResolvedIdentity>();

  // Bucket groups + schedule rows by normalized team-pair.
  const groupsByPair = new Map<string, GameGroupIdentity[]>();
  for (const g of groups) {
    const k = teamPairKey(g.awayTeamAbbr, g.homeTeamAbbr);
    const arr = groupsByPair.get(k);
    if (arr) arr.push(g);
    else groupsByPair.set(k, [g]);
  }
  const schedByPair = new Map<string, ScheduleGame[]>();
  for (const s of scheduleGames) {
    const k = teamPairKey(s.awayTeamAbbr, s.homeTeamAbbr);
    const arr = schedByPair.get(k);
    if (arr) arr.push(s);
    else schedByPair.set(k, [s]);
  }

  for (const [pair, gs] of groupsByPair) {
    const bg = schedByPair.get(pair) ?? [];

    // ── No schedule rows for this pair at all ──
    if (bg.length === 0) {
      if (gs.length === 1 && gs[0].leanGamePk != null) {
        // Exactly one game identity for the pair ⇒ no doubleheader collision is possible ⇒ trusting the
        // lean's own gamePk is safe.
        out.set(gs[0].gameId, { gamePk: gs[0].leanGamePk, resolved: true, method: "lean-single-no-schedule" });
      } else {
        for (const g of gs) out.set(g.gameId, { gamePk: null, resolved: false, method: "unresolved-no-schedule" });
      }
      continue;
    }

    // ── Exactly one game identity for this pair ──
    if (gs.length === 1) {
      const g = gs[0];
      if (bg.length === 1) {
        // Single schedule row ⇒ unambiguous.
        out.set(g.gameId, { gamePk: bg[0].gamePk, resolved: true, method: "schedule-unique" });
      } else {
        // One group but several schedule rows (e.g. only one game of a DH carries props). Match by nearest
        // scheduled start when both sides have times; else accept the lean gamePk only if it IS one of the
        // schedule rows; else fail closed.
        const gMs = parseIsoMs(g.commenceTime);
        const allDated = bg.every((b) => parseIsoMs(b.gameDate) != null);
        if (gMs != null && allDated) {
          let best = bg[0];
          let bestDelta = Infinity;
          for (const b of bg) {
            const delta = Math.abs((parseIsoMs(b.gameDate) as number) - gMs);
            if (delta < bestDelta) {
              bestDelta = delta;
              best = b;
            }
          }
          out.set(g.gameId, { gamePk: best.gamePk, resolved: true, method: "schedule-nearest-time" });
        } else if (g.leanGamePk != null && bg.some((b) => b.gamePk === g.leanGamePk)) {
          out.set(g.gameId, { gamePk: g.leanGamePk, resolved: true, method: "lean-matches-schedule" });
        } else {
          out.set(g.gameId, { gamePk: null, resolved: false, method: "unresolved-underdetermined" });
        }
      }
      continue;
    }

    // ── Multiple game identities for this pair: a DOUBLEHEADER ──
    // Split ONLY by a clean N↔N, strictly-time-ordered bijection. This guarantees DISTINCT gamePks and
    // never falls back to "first match". Any counts mismatch, missing time, or time TIE ⇒ fail closed.
    const balanced = gs.length === bg.length;
    const gsSorted = [...gs].sort(
      (a, b) => (parseIsoMs(a.commenceTime) ?? Infinity) - (parseIsoMs(b.commenceTime) ?? Infinity) || a.gameId.localeCompare(b.gameId),
    );
    const bgSorted = [...bg].sort(
      (a, b) => (parseIsoMs(a.gameDate) ?? Infinity) - (parseIsoMs(b.gameDate) ?? Infinity) || a.gamePk - b.gamePk,
    );
    const gsMs = gsSorted.map((g) => parseIsoMs(g.commenceTime));
    const bgMs = bgSorted.map((b) => parseIsoMs(b.gameDate));
    const strictlyIncreasing = (ms: Array<number | null>): boolean =>
      ms.every((m, i) => m != null && (i === 0 || (ms[i - 1] as number) < m));
    if (balanced && strictlyIncreasing(gsMs) && strictlyIncreasing(bgMs)) {
      for (let i = 0; i < gsSorted.length; i += 1) {
        out.set(gsSorted[i].gameId, { gamePk: bgSorted[i].gamePk, resolved: true, method: "schedule-time-order" });
      }
    } else {
      for (const g of gs) out.set(g.gameId, { gamePk: null, resolved: false, method: "unresolved-ambiguous" });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Sampling — the deterministic core of a single lean
// ---------------------------------------------------------------------------

export interface SampleResult {
  samples: number[];
  overRate: number;
  underRate: number;
  mean: number;
  std: number;
  min: number;
  max: number;
}

/**
 * Draw `runCount` seeded Gaussian samples ~ N(projection, sigma), clamped at 0 for count stats, then
 * compute the empirical over/under rate vs `line` plus summary stats. Fully deterministic given the
 * seed string. Pushes/exact-line samples (value === line) count toward UNDER (standard "over N.5" lines
 * are non-integer so this is rarely hit, but we resolve it deterministically).
 */
export function sampleLean(
  seedString: string,
  projection: number,
  sigma: number,
  line: number,
  runCount: number,
  countStat: boolean,
): SampleResult {
  const rng = new SeededRng(seedString);
  const samples = new Array<number>(runCount);
  let over = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < runCount; i += 1) {
    let v = rng.normal(projection, sigma);
    if (countStat && v < 0) v = 0;
    samples[i] = v;
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
    if (v > line) over += 1;
  }
  const mean = sum / runCount;
  let sqDiff = 0;
  for (let i = 0; i < runCount; i += 1) {
    const d = samples[i] - mean;
    sqDiff += d * d;
  }
  const std = Math.sqrt(sqDiff / runCount);
  const overRate = over / runCount;
  return { samples, overRate, underRate: 1 - overRate, mean, std, min, max };
}

/**
 * Build a real histogram distribution from actual samples. Integer per-bin counts sum EXACTLY to
 * `runCount` (every sample lands in exactly one bin), and each bin's `probability` = count / runCount.
 * For count stats we bin on integer boundaries; bins are contiguous [lowerEdge, upperEdge). Returns
 * `null` only for a degenerate (single-value) range, which the caller treats as no-distribution.
 */
export function buildDistribution(
  key: string,
  label: string,
  result: SampleResult,
  runCount: number,
): SimDistribution | null {
  const { samples, min, max } = result;
  if (!(max > min)) return null; // degenerate: all identical (e.g. sigma collapsed) — no real histogram

  // Bin on rounded-integer counts when the observed range is small enough that integer bins are natural;
  // otherwise fall back to `HISTOGRAM_BINS` equal-width bins across the observed range.
  const lo = Math.floor(min);
  const hi = Math.ceil(max);
  const integerSpan = hi - lo;
  const useIntegerBins = integerSpan <= HISTOGRAM_BINS * 2 && integerSpan >= 1;

  let edges: number[];
  if (useIntegerBins) {
    edges = [];
    for (let e = lo; e <= hi; e += 1) edges.push(e);
  } else {
    const width = (max - min) / HISTOGRAM_BINS;
    edges = [];
    for (let i = 0; i <= HISTOGRAM_BINS; i += 1) edges.push(min + width * i);
    // Nudge the last edge up so the max sample is strictly inside the final bin.
    edges[edges.length - 1] = max + Math.abs(max) * 1e-9 + 1e-9;
  }

  const binCount = edges.length - 1;
  const counts = new Array<number>(binCount).fill(0);
  for (const v of samples) {
    // Find the bin whose [lowerEdge, upperEdge) contains v. Clamp into range for safety.
    let idx = binCount - 1;
    for (let bi = 0; bi < binCount; bi += 1) {
      if (v >= edges[bi] && v < edges[bi + 1]) {
        idx = bi;
        break;
      }
    }
    if (v < edges[0]) idx = 0;
    counts[idx] += 1;
  }

  const total = counts.reduce((a, c) => a + c, 0);
  // Sanity: every sample must have been binned exactly once.
  if (total !== runCount) {
    // Push any unbinned remainder into the last bin so counts always sum to runCount (deterministic).
    counts[binCount - 1] += runCount - total;
  }

  const bins: SimDistributionBin[] = counts.map((count, bi) => {
    const lower = edges[bi];
    const upper = edges[bi + 1];
    const lowerLabel = useIntegerBins ? String(Math.round(lower)) : lower.toFixed(1);
    const upperLabel = useIntegerBins ? String(Math.round(upper) - 1) : upper.toFixed(1);
    const binLabel = useIntegerBins
      ? lowerLabel === upperLabel
        ? lowerLabel
        : `${lowerLabel}-${upperLabel}`
      : `${lowerLabel}-${upperLabel}`;
    return {
      label: binLabel,
      lowerEdge: Number(lower.toFixed(4)),
      upperEdge: Number(upper.toFixed(4)),
      count,
      probability: Number((count / runCount).toFixed(6)),
    };
  });

  return {
    key,
    label,
    sampleCount: runCount,
    bins,
  };
}

// ---------------------------------------------------------------------------
// Market snapshot + picks
// ---------------------------------------------------------------------------

/**
 * Build the market snapshot for a game from its leans — real board lines ONLY. For each lean we emit
 * two sourced lines (over + under) with the board's American odds + implied probabilities. Nothing is
 * synthesized.
 */
function buildMarketSnapshot(leans: BoardLean[], bookmaker: string | undefined, capturedAt: string): SimMarketSnapshot {
  const lines: SimMarketLine[] = [];
  for (const lean of leans) {
    const player = lean.playerName;
    if (isFiniteNum(lean.oddsOver) && isFiniteNum(lean.impliedOver)) {
      lines.push({
        market: lean.marketKey,
        side: "over",
        player,
        line: isFiniteNum(lean.line) ? lean.line : null,
        americanOdds: lean.oddsOver,
        impliedProbability: lean.impliedOver,
      });
    }
    if (isFiniteNum(lean.oddsUnder) && isFiniteNum(lean.impliedUnder)) {
      lines.push({
        market: lean.marketKey,
        side: "under",
        player,
        line: isFiniteNum(lean.line) ? lean.line : null,
        americanOdds: lean.oddsUnder,
        impliedProbability: lean.impliedUnder,
      });
    }
  }
  return { bookmaker, capturedAt, lines };
}

interface RankedPick {
  pick: SimGeneratedPick;
  score: number;
}

/**
 * Build a generated pick from a lean. When the lean was sampled, `modelProbability` is the SAMPLED
 * over/under rate on the chosen side; otherwise it falls back to the board's own modelProb for that
 * side. Every pick carries non-empty `sourceFields` naming the REAL board fields used (validator
 * requires provenance). Returns `null` if the lean has no usable side/odds to price.
 */
function buildPick(
  lean: BoardLean,
  gameId: string,
  sampled: SampleResult | null,
): RankedPick | null {
  // Determine side. Board `lean` is "Over" | "Under" | "Pass". "Pass" leans still price the stronger
  // side by edge so the pick is informative, but we never invent a side that has no odds.
  const rawLean = (lean.lean || "").toLowerCase();
  let side: "over" | "under";
  if (rawLean === "over") side = "over";
  else if (rawLean === "under") side = "under";
  else {
    // Pass / unknown: choose the side the board's edge favors.
    const eo = isFiniteNum(lean.edgePctOver) ? lean.edgePctOver : -Infinity;
    const eu = isFiniteNum(lean.edgePctUnder) ? lean.edgePctUnder : -Infinity;
    side = eo >= eu ? "over" : "under";
  }

  const marketProbability = side === "over" ? lean.impliedOver : lean.impliedUnder;
  if (!isFiniteNum(marketProbability)) return null; // no priceable market side

  // Model probability: sampled rate when available, else board modelProb for the side.
  const boardModelProb = side === "over" ? lean.modelProbOver : lean.modelProbUnder;
  const sourceFields: string[] = ["line", `implied${side === "over" ? "Over" : "Under"}`];
  let modelProbability: number;
  if (sampled) {
    modelProbability = side === "over" ? sampled.overRate : sampled.underRate;
    sourceFields.push("projection", "sigma", "samples");
  } else if (isFiniteNum(boardModelProb)) {
    modelProbability = boardModelProb;
    sourceFields.push(`modelProb${side === "over" ? "Over" : "Under"}`);
  } else {
    return null; // no honest way to price the model side
  }

  const projection = isFiniteNum(lean.projection)
    ? lean.projection
    : sampled
      ? sampled.mean
      : (isFiniteNum(lean.line) ? lean.line : 0);

  const edgePct = Number(((modelProbability - marketProbability) * 100).toFixed(2));
  const confidence = confidenceToScore(lean.confidence);
  const riskTier = riskTierFor(lean.confidence, lean.riskFlags);

  // Ranking score: |edge| weighted by confidence, softly de-weighted by anomaly/insufficient flags.
  const flags = lean.riskFlags || [];
  let riskPenalty = 1;
  if (flags.includes("insufficient_data")) riskPenalty *= 0.3;
  if (flags.includes("r5_model_anomaly")) riskPenalty *= 0.6;
  const score = Math.abs(edgePct) * confidence * riskPenalty;

  const line = isFiniteNum(lean.line) ? lean.line : null;
  const idBase = lean.id || `${gameId}-${lean.playerId ?? "p"}-${lean.marketKey}-${line ?? "x"}`;

  const pick: SimGeneratedPick = {
    id: `${idBase}-${side}`,
    sport: "mlb",
    gameId,
    market: lean.marketKey,
    player: lean.playerName,
    line,
    side,
    projection: Number(projection.toFixed(4)),
    modelProbability: Number(modelProbability.toFixed(6)),
    marketProbability: Number(marketProbability.toFixed(6)),
    edgePct,
    confidence,
    riskTier,
    reasonBullets: reasonBulletsToStrings(lean.reasonBullets),
    sourceFields,
    paperOnly: true,
  };
  return { pick, score };
}

// ---------------------------------------------------------------------------
// Per-game assembly
// ---------------------------------------------------------------------------

export interface GameBuildResult {
  game: GameSimulationGame;
  sampledCount: number;
  pickCount: number;
  distributionCount: number;
  topEdge: number;
}

/**
 * Assemble ONE game's simulation from its leans. Produces: real market snapshot, sampled distributions
 * (only for leans with projection+sigma), a summary, ranked generated picks (top-N), and honest
 * unavailable modules (MLB-unsupported soccer modules + any props missing sigma). Returns the game plus
 * per-game stats. `integrity.artifactHash` is filled by the caller once the game payload is final.
 */
function buildGame(
  board: MlbBoard,
  date: string,
  gameId: string,
  gamePk: number | null,
  identityResolved: boolean,
  leans: BoardLean[],
  sourceBoardHash: string,
  generatedAt: string,
): GameBuildResult {
  const first = leans[0];
  const homeAbbr = first.homeTeamAbbr || "HOME";
  const awayAbbr = first.awayTeamAbbr || "AWAY";
  const homeName = first.homeTeamName || homeAbbr;
  const awayName = first.awayTeamName || awayAbbr;
  const capturedAt = board.generatedAt || first.commenceTime || generatedAt;

  const freshness: SimFreshness = {
    slateDate: date,
    sourceCapturedAt: capturedAt,
    generatedAt,
    note: `Player-prop props only (deterministic seeded simulation, ${RUN_COUNT.toLocaleString()} iterations per prop).`,
  };

  const marketSnapshot = buildMarketSnapshot(leans, board.bookmaker || first.bookmaker, capturedAt);

  const distributions: Record<string, SimDistribution> = {};
  const rankedPicks: RankedPick[] = [];
  const propsMissingSigma: BoardLean[] = [];
  let sampledCount = 0;

  for (const lean of leans) {
    const hasInputs = isFiniteNum(lean.projection) && isFiniteNum(lean.sigma) && isFiniteNum(lean.line);
    let sampled: SampleResult | null = null;
    if (hasInputs) {
      const seed = leanSeed({
        date,
        // Seed off the RESOLVED gamePk when known; fall back to the stable gameId when identity is
        // unresolved so the stream stays deterministic (the game is marked unavailable regardless).
        gamePk: isFiniteNum(gamePk) ? gamePk : gameId,
        modelVersion: MODEL_VERSION,
        simulationVersion: SIMULATION_VERSION,
        marketKey: lean.marketKey,
        playerId: lean.playerId ?? "p",
        line: lean.line,
      });
      sampled = sampleLean(seed, lean.projection as number, lean.sigma as number, lean.line, RUN_COUNT, isCountStat(lean.marketKey));
      sampledCount += 1;

      const distKey = `${lean.marketKey}__${lean.playerId ?? "p"}__${lean.line}`;
      const distLabel = `${lean.playerName || "Player"} — ${lean.marketLabel || lean.marketKey} (line ${lean.line})`;
      const dist = buildDistribution(distKey, distLabel, sampled, RUN_COUNT);
      if (dist) distributions[distKey] = dist;
    } else {
      propsMissingSigma.push(lean);
    }

    const ranked = buildPick(lean, gameId, sampled);
    if (ranked) rankedPicks.push(ranked);
  }

  // Rank picks by score (desc), stable-tiebreak by id for determinism, take top-N.
  rankedPicks.sort((a, b) => (b.score - a.score) || a.pick.id.localeCompare(b.pick.id));
  const topPicks = rankedPicks.slice(0, MAX_PICKS_PER_GAME).map((r) => r.pick);
  const topEdge = topPicks.reduce((m, p) => Math.max(m, Math.abs(p.edgePct)), 0);

  // Summary: honest, model-derived. This is a player-prop-only board (no team ML/total lines), so we do
  // NOT claim win/total probabilities we don't have. The headline reports what the board actually is.
  const summary: SimSummary = {
    headline: `${awayAbbr} @ ${homeAbbr}: ${sampledCount} player-prop market${sampledCount === 1 ? "" : "s"} simulated over ${RUN_COUNT} deterministic iterations each.`,
  };

  // Unavailable modules — honest declarations. MLB has none of the soccer modules; add a distributions
  // note only if NO distribution was produced; add a per-prop sigma-missing note listing the omitted props.
  const unavailableModules: SimUnavailableModule[] = [
    {
      module: "scoreline",
      reason: "not_supported_for_sport",
      requiredArtifactField: "distributions.scoreline",
      displayCopy: "Scoreline distributions are a soccer module and are not generated for MLB.",
    },
    {
      module: "first_scorer",
      reason: "not_supported_for_sport",
      requiredArtifactField: "distributions.first_scorer",
      displayCopy: "First-scorer markets are a soccer module and are not generated for MLB.",
    },
    {
      module: "xg",
      reason: "not_supported_for_sport",
      requiredArtifactField: "simulationSummary.xg",
      displayCopy: "Expected goals (xG) is a soccer metric and does not apply to baseball.",
    },
    {
      module: "corners",
      reason: "not_supported_for_sport",
      requiredArtifactField: "distributions.corners",
      displayCopy: "Corners are a soccer module and are not generated for MLB.",
    },
    {
      module: "cards",
      reason: "not_supported_for_sport",
      requiredArtifactField: "distributions.cards",
      displayCopy: "Cards are a soccer module and are not generated for MLB.",
    },
  ];

  const hasRealDistributions = Object.keys(distributions).length > 0;
  if (!hasRealDistributions) {
    unavailableModules.push({
      module: "distributions",
      reason: "no_sampling",
      requiredArtifactField: "distributions",
      displayCopy: "No prop on this game carried the projection + sigma needed to simulate a histogram.",
    });
  }
  if (propsMissingSigma.length > 0) {
    const names = propsMissingSigma
      .map((l) => `${l.playerName || "player"} ${l.marketLabel || l.marketKey}`)
      .slice(0, 12)
      .join("; ");
    unavailableModules.push({
      module: "props_missing_sigma",
      reason: "insufficient_inputs",
      requiredArtifactField: "sigma",
      displayCopy: `${propsMissingSigma.length} prop${propsMissingSigma.length === 1 ? "" : "s"} lacked the sigma needed to simulate a distribution (${names}).`,
    });
  }

  // FAIL-CLOSED identity: when we could NOT prove a unique schedule game (e.g. an unresolvable
  // doubleheader), declare it honestly and refuse to emit a gamePk — a game with no gamePk cannot be
  // joined to the twin's board fixture downstream, so it surfaces as "not yet simulated" rather than
  // rendering under the wrong game's identity.
  if (!identityResolved) {
    unavailableModules.push({
      module: "game_identity",
      reason: "ambiguous_doubleheader",
      requiredArtifactField: "gamePk",
      displayCopy:
        "This game shares its teams and date with another game (a doubleheader) and could not be matched to a unique schedule id, so no simulation is attached here (shown as not yet available rather than risk labeling it with the other game's result).",
    });
  }

  const distributionsField: SimDistributions = hasRealDistributions ? distributions : null;

  // Identity gate: a ready game REQUIRES a proven unique gamePk. An unresolved game is always unavailable,
  // and its gamePk is OMITTED so nothing downstream can mis-join it to its doubleheader twin.
  const status: GameSimStatus = identityResolved ? (topPicks.length > 0 ? "ready" : "unavailable") : "unavailable";
  const gamePkField = identityResolved && isFiniteNum(gamePk) ? gamePk : undefined;

  const game: GameSimulationGame = {
    gameId,
    gamePk: gamePkField,
    slug: makeSlug(awayAbbr, homeAbbr, date),
    teams: { home: homeName, away: awayName },
    status,
    freshness,
    marketSnapshot,
    simulationSummary: summary,
    distributions: distributionsField,
    generatedPicks: topPicks,
    unavailableModules,
    integrity: { sourceBoardHash, artifactHash: "" }, // artifactHash filled after payload is final
  };

  // Fill the per-game artifactHash from the game's own content (excluding the placeholder itself and any
  // injected timestamp so it is reproducible for the same board slice).
  const gameForHash = {
    ...game,
    freshness: { ...game.freshness, generatedAt: "" },
    integrity: { sourceBoardHash, artifactHash: "" },
  };
  game.integrity.artifactHash = stableHash(gameForHash);

  return {
    game,
    sampledCount,
    pickCount: topPicks.length,
    distributionCount: Object.keys(distributions).length,
    topEdge: Number(topEdge.toFixed(2)),
  };
}

// ---------------------------------------------------------------------------
// Top-level artifact assembly
// ---------------------------------------------------------------------------

export interface GenerateResult {
  artifact: GameSimulationArtifact;
  stats: {
    date: string;
    games: number;
    readyGames: number;
    totalPicks: number;
    totalDistributions: number;
    sampledLeans: number;
    unsampledLeans: number;
    runCount: number;
    sourceBoardHash: string;
    artifactHash: string;
    perGame: Array<{ gameId: string; gamePk: number; away: string; home: string; picks: number; distributions: number; topEdge: number; status: string }>;
  };
}

/**
 * Build the full artifact from a parsed board. Pure + deterministic except for the injected
 * `generatedAt`. `date` defaults to the board's `date`. The board's leans are grouped by gameId; games
 * with no leans are skipped (they have nothing to simulate — the reader reports them "unavailable"
 * naturally by their absence).
 */
export function generateMlbGameSimulations(board: MlbBoard, generatedAt: string, dateOverride?: string): GenerateResult {
  const date = dateOverride || board.date;
  const leans = Array.isArray(board.leans) ? board.leans : [];

  // `sourceBoardHash` = stable hash of the canonical board slice we actually consume (date + the leans),
  // so a change to any consumed board field flips the hash while irrelevant board churn does not.
  const sourceBoardHash = stableHash({ date, leans });

  // Group leans by gameId (preserving first-seen order for stable output).
  const order: string[] = [];
  const byGame = new Map<string, BoardLean[]>();
  for (const lean of leans) {
    if (!lean || typeof lean.gameId !== "string") continue;
    if (!byGame.has(lean.gameId)) {
      byGame.set(lean.gameId, []);
      order.push(lean.gameId);
    }
    byGame.get(lean.gameId)!.push(lean);
  }

  // DOUBLEHEADER-SAFE IDENTITY: re-derive each game's gamePk from the AUTHORITATIVE schedule
  // (`board.games[]`) instead of trusting the per-lean gamePk (which can collapse a doubleheader's twins
  // onto one id). `resolveGamePks` returns a unique gamePk per game or fails closed (see its doc).
  const scheduleGames: ScheduleGame[] = (Array.isArray(board.games) ? board.games : []).map((g) => ({
    gamePk: g.gamePk,
    awayTeamAbbr: g.awayTeamAbbr,
    homeTeamAbbr: g.homeTeamAbbr,
    gameDate: g.gameDate,
  }));
  const identities = resolveGamePks(
    order.map((gid) => {
      const g0 = byGame.get(gid)![0];
      return {
        gameId: gid,
        awayTeamAbbr: g0.awayTeamAbbr,
        homeTeamAbbr: g0.homeTeamAbbr,
        commenceTime: g0.commenceTime,
        leanGamePk: g0.gamePk,
      };
    }),
    scheduleGames,
  );

  const games: GameSimulationGame[] = [];
  const perGame: GenerateResult["stats"]["perGame"] = [];
  let totalPicks = 0;
  let totalDistributions = 0;
  let sampledLeans = 0;
  let readyGames = 0;

  for (const gameId of order) {
    const gLeans = byGame.get(gameId)!;
    const identity = identities.get(gameId) ?? { gamePk: null, resolved: false, method: "unresolved-missing" };
    const gamePk = identity.gamePk;
    const built = buildGame(board, date, gameId, gamePk, identity.resolved, gLeans, sourceBoardHash, generatedAt);
    games.push(built.game);
    totalPicks += built.pickCount;
    totalDistributions += built.distributionCount;
    sampledLeans += built.sampledCount;
    if (built.game.status === "ready") readyGames += 1;
    perGame.push({
      gameId,
      // Report the RESOLVED gamePk (0 when identity is unresolved/omitted, so the stats stay numeric).
      gamePk: gamePk ?? 0,
      away: gLeans[0].awayTeamAbbr || "AWAY",
      home: gLeans[0].homeTeamAbbr || "HOME",
      picks: built.pickCount,
      distributions: built.distributionCount,
      topEdge: built.topEdge,
      status: built.game.status,
    });
  }

  const unsampledLeans = leans.length - sampledLeans;

  // Assemble the artifact WITHOUT the top-level artifactHash (and with an empty generatedAt for hashing),
  // compute the stable artifactHash over the games payload, then set it. `generatedAt` is EXCLUDED from
  // the hash so the same board always yields the same artifactHash regardless of when it was generated.
  const artifact: GameSimulationArtifact = {
    date,
    sport: "mlb",
    generatedAt,
    modelVersion: MODEL_VERSION,
    simulationVersion: SIMULATION_VERSION,
    runCount: RUN_COUNT,
    sourceBoardHash,
    artifactHash: "",
    games,
  };

  const artifactHash = computeArtifactHash(artifact);
  artifact.artifactHash = artifactHash;

  return {
    artifact,
    stats: {
      date,
      games: games.length,
      readyGames,
      totalPicks,
      totalDistributions,
      sampledLeans,
      unsampledLeans,
      runCount: RUN_COUNT,
      sourceBoardHash,
      artifactHash,
      perGame,
    },
  };
}

/**
 * Compute the reproducible top-level artifact hash. Hashes everything EXCEPT the volatile `generatedAt`
 * and the `artifactHash` field itself (and blanks each game's freshness.generatedAt), so the same board
 * ⇒ identical hash. Exported for tests.
 */
export function computeArtifactHash(artifact: GameSimulationArtifact): string {
  const forHash = {
    date: artifact.date,
    sport: artifact.sport,
    modelVersion: artifact.modelVersion,
    simulationVersion: artifact.simulationVersion,
    runCount: artifact.runCount,
    sourceBoardHash: artifact.sourceBoardHash,
    games: artifact.games.map((g) => ({
      ...g,
      freshness: { ...g.freshness, generatedAt: "" },
    })),
  };
  return stableHash(forHash);
}

/**
 * MLB GAME-LEVEL MODEL / MARKET INTELLIGENCE (Sprint 029 · Phase 4).
 *
 * ONE object describing a game's moneyline, run line and total, reused by Market Center, the game
 * report, /today and the homepage. Every number a surface renders is derived here, so no page does
 * sportsbook math and no two pages can arrive at different answers for the same game.
 *
 * Pairing (./pairing) decides WHETHER a comparison may be shown. This module decides WHAT the two
 * sides actually say. It never re-implements the gate logic — it calls the selector.
 *
 * ── The comparison is neutral, and deliberately so ──
 *
 * A difference is reported in PERCENTAGE POINTS, with no claim attached. Per
 * lib/mlb/model-calibration-status, no GameTimePicks model has been validated to out-predict the
 * market, so a gap between the two numbers is a disagreement to look at, not an advantage to act
 * on. There is no function here that ranks games, picks a side, or labels a difference favourable —
 * such a helper would be the whole product's honesty problem in one call site.
 *
 * ── Run-line sign convention: VERIFIED, not assumed ──
 *
 * The two sources describe different quantities under similar-looking numbers, and matching them by
 * line value alone is silently wrong roughly half the time:
 *
 *   simulation   `homeCover(L)`  = P(home wins by MORE than L)   — i.e. home LAYING −L
 *   sportsbook   `home.line`     = the home side's SIGNED line   — −1.5 laying, +1.5 receiving
 *
 * So home receiving +L covers whenever away fails to win by more than L, which is `1 − awayCover(L)`
 * and NOT `homeCover(L)`. Both identities were checked against each game's own `runDifferential`
 * histogram before this module was written (agreement to <0.001 across the slate); the guards in
 * game-intelligence.test.mjs re-derive them from a distribution rather than restating the constants.
 *
 * When the book posts a magnitude the simulation did not publish, the comparison is withheld.
 * Interpolating a cover probability would invent a number and dress it in the artifact's credibility.
 *
 * ── Totals and pushes ──
 *
 * An integer total (8, not 8.5) can push, so over/under/push is a three-way outcome. The book's
 * two-way de-vig has no push term, so comparing a raw simulation over-frequency against it would
 * compare two different questions. `overProb`/`underProb`/`pushProb` are reported as the simulation
 * actually found them, and the COMPARISON uses the push-excluded conditional so both sides answer
 * "given the total is not exactly the line, how often does it go over?".
 */
import { getMarketIntelligenceMode, type MarketIntelligence } from "./pairing";
import { evaluateArtifactFreshness, evaluateEventPhase, type EventPhase, type FreshnessReading } from "./freshness";
import type { GameMarketFamily } from "./types";

// ── Inputs: the shapes the live artifacts actually have ─────────────────────────────────────────

/** One priced side as `mlb/team-markets/<date>.json` stores it. */
export interface BookSide {
  readonly odds?: number | null;
  readonly impliedProb?: number | null;
  readonly noVigProb?: number | null;
  /** Run-line sides carry their own signed line and a cover probability. */
  readonly line?: number | null;
  readonly coverNoVigProb?: number | null;
}

export interface BookGameMarkets {
  readonly gameId: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly commenceTime?: string | null;
  readonly bookmaker?: string | null;
  readonly moneyline?: { home?: BookSide | null; away?: BookSide | null } | null;
  readonly runLine?: { line?: number | null; home?: BookSide | null; away?: BookSide | null } | null;
  readonly total?: { line?: number | null; over?: BookSide | null; under?: BookSide | null } | null;
}

export interface SimDistributionBin {
  readonly value: number;
  readonly probability: number;
  readonly count?: number;
}

export interface SimRunLineEntry {
  readonly line: number;
  readonly homeCover: number;
  readonly awayCover: number;
}

/** The subset of `mlb/full-game-simulations/<date>.json` this module reads. */
export interface SimGame {
  readonly gamePk: number;
  readonly runCount?: number | null;
  readonly status?: string | null;
  readonly completeness?: { level?: string | null; notes?: ReadonlyArray<string> | null } | null;
  readonly winProbability?: { home?: number | null; away?: number | null } | null;
  readonly runs?: {
    home?: { mean?: number; median?: number; p10?: number; p90?: number } | null;
    away?: { mean?: number; median?: number; p10?: number; p90?: number } | null;
  } | null;
  readonly totalRuns?: {
    mean?: number;
    median?: number;
    p10?: number;
    p90?: number;
    distribution?: ReadonlyArray<SimDistributionBin> | null;
  } | null;
  readonly runLine?: ReadonlyArray<SimRunLineEntry> | null;
  readonly artifactHash?: string | null;
}

// ── Outputs ─────────────────────────────────────────────────────────────────────────────────────

/**
 * How much weight the simulation itself says it deserves. Surfaced alongside every model number so
 * a degraded run is never presented with the same confidence as a complete one.
 */
export interface ModelUncertainty {
  readonly runCount: number | null;
  /** "complete" | "degraded" | whatever the artifact recorded. Passed through, not reinterpreted. */
  readonly completeness: string | null;
  readonly notes: ReadonlyArray<string>;
  /** True when the artifact flagged itself as degraded. */
  readonly isDegraded: boolean;
}

export interface SnapshotProvenance {
  readonly capturedAt: string | null;
  readonly captureLabel: string | null;
  readonly freshness: FreshnessReading | null;
  readonly bookmaker: string | null;
}

/** A neutral gap between two probabilities, in percentage points. Never called an advantage. */
export interface ProbabilityComparison {
  readonly modelProb: number;
  readonly marketProb: number;
  /** model − market, in PERCENTAGE POINTS (so 0.61 vs 0.562 → 4.8). */
  readonly differencePoints: number;
}

export interface MoneylineIntelligence {
  readonly family: "MONEYLINE";
  readonly intelligence: MarketIntelligence;
  readonly model: {
    readonly homeWinProb: number;
    readonly awayWinProb: number;
    readonly homeMedianRuns: number | null;
    readonly awayMedianRuns: number | null;
    readonly uncertainty: ModelUncertainty;
  } | null;
  readonly sportsbook: {
    readonly homeOdds: number | null;
    readonly awayOdds: number | null;
    readonly homeImpliedProb: number | null;
    readonly awayImpliedProb: number | null;
    readonly homeNoVigProb: number | null;
    readonly awayNoVigProb: number | null;
  } | null;
  readonly comparison: { readonly home: ProbabilityComparison; readonly away: ProbabilityComparison } | null;
}

export interface RunLineIntelligence {
  readonly family: "RUN_LINE";
  readonly intelligence: MarketIntelligence;
  /** The home side's SIGNED line as the book posted it. Negative = home laying. */
  readonly homeLine: number | null;
  readonly model: {
    readonly homeCoverProb: number;
    readonly awayCoverProb: number;
    /** Which simulation identity produced the number, so an audit can retrace it. */
    readonly derivation: "home_lays" | "home_receives";
    readonly uncertainty: ModelUncertainty;
  } | null;
  readonly sportsbook: {
    readonly homeOdds: number | null;
    readonly awayOdds: number | null;
    readonly homeCoverNoVigProb: number | null;
    readonly awayCoverNoVigProb: number | null;
  } | null;
  readonly comparison: { readonly home: ProbabilityComparison } | null;
}

export interface TotalIntelligence {
  readonly family: "TOTAL";
  readonly intelligence: MarketIntelligence;
  readonly line: number | null;
  readonly model: {
    readonly medianTotal: number | null;
    readonly meanTotal: number | null;
    readonly p10: number | null;
    readonly p90: number | null;
    /** As simulated, including the push mass for an integer line. */
    readonly overProb: number;
    readonly underProb: number;
    readonly pushProb: number;
    /** Push-excluded, which is the quantity the book's two-way price actually describes. */
    readonly overProbExcludingPush: number;
    readonly uncertainty: ModelUncertainty;
  } | null;
  readonly sportsbook: {
    readonly overOdds: number | null;
    readonly underOdds: number | null;
    readonly overNoVigProb: number | null;
    readonly underNoVigProb: number | null;
  } | null;
  readonly comparison: { readonly over: ProbabilityComparison } | null;
}

export interface GameIntelligence {
  readonly gameId: string;
  readonly gamePk: number | null;
  readonly homeTeam: string;
  readonly awayTeam: string;
  /**
   * Team ABBREVIATIONS ("ARI"), distinct from the display names above.
   *
   * Carried because the logo CDN is keyed by abbreviation: passing a full team name silently 404s
   * and falls back to an initials badge, which LOOKS fine and is therefore easy to ship broken.
   * Null when the board did not supply one — the caller must then fall back rather than guess.
   */
  readonly homeTeamAbbr: string | null;
  readonly awayTeamAbbr: string | null;
  readonly startTime: string | null;
  readonly eventPhase: EventPhase;
  readonly snapshot: SnapshotProvenance;
  readonly moneyline: MoneylineIntelligence;
  readonly runLine: RunLineIntelligence;
  readonly total: TotalIntelligence;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** model − market in percentage points, rounded to one decimal — the precision we can defend. */
function compare(modelProb: number, marketProb: number): ProbabilityComparison {
  return {
    modelProb,
    marketProb,
    differencePoints: Math.round((modelProb - marketProb) * 1000) / 10,
  };
}

function uncertaintyOf(sim: SimGame): ModelUncertainty {
  const level = sim.completeness?.level ?? sim.status ?? null;
  return {
    runCount: num(sim.runCount),
    completeness: level,
    notes: sim.completeness?.notes ?? [],
    isDegraded: level === "degraded",
  };
}

/**
 * Sum the probability mass of a histogram over a predicate.
 *
 * Reads `probability` when present and otherwise normalizes `count`, because an artifact that
 * carries only counts is still answerable — and silently returning 0 for it would look like a
 * confident "never happens".
 */
export function massWhere(
  distribution: ReadonlyArray<SimDistributionBin> | null | undefined,
  predicate: (value: number) => boolean,
): number | null {
  if (!distribution || distribution.length === 0) return null;
  let total = 0;
  let selected = 0;
  let sawProbability = false;
  for (const bin of distribution) {
    const p = num(bin.probability);
    if (p !== null) {
      sawProbability = true;
      total += p;
      if (predicate(bin.value)) selected += p;
    } else {
      const c = num(bin.count);
      if (c === null) continue;
      total += c;
      if (predicate(bin.value)) selected += c;
    }
  }
  if (total <= 0) return null;
  // Normalizing rather than trusting the sum to be 1 keeps a truncated histogram honest.
  return sawProbability && Math.abs(total - 1) < 0.02 ? selected : selected / total;
}

/**
 * The simulation's cover probability for the home side at the book's SIGNED line.
 *
 * Returns null when the simulation published no entry at that magnitude — the caller must degrade
 * rather than interpolate. See the module header for why the two identities differ.
 */
export function homeCoverProbability(
  sim: SimGame,
  signedHomeLine: number,
): { prob: number; derivation: "home_lays" | "home_receives" } | null {
  const magnitude = Math.abs(signedHomeLine);
  const entry = (sim.runLine ?? []).find((r) => r.line === magnitude);
  if (!entry) return null;

  if (signedHomeLine < 0) {
    // Home is laying: it must win by more than the magnitude. That is exactly `homeCover`.
    const p = num(entry.homeCover);
    return p === null ? null : { prob: p, derivation: "home_lays" };
  }
  // Home is receiving: it covers unless AWAY wins by more than the magnitude.
  const away = num(entry.awayCover);
  return away === null ? null : { prob: 1 - away, derivation: "home_receives" };
}

// ── Builder ─────────────────────────────────────────────────────────────────────────────────────

export interface GameIntelligenceInput {
  readonly sport?: string;
  readonly book: BookGameMarkets;
  readonly sim: SimGame | null;
  readonly gamePk: number | null;
  /** Team abbreviations from the board, for logo lookup. Display names come from the book. */
  readonly homeTeamAbbr?: string | null;
  readonly awayTeamAbbr?: string | null;
  /** Slate date of the sportsbook artifact and its generation timestamp. */
  readonly artifact: { readonly date: string | null; readonly generatedAt: string | null };
  /** Today's date in ET — the calendar the slate is keyed on. */
  readonly todayEt: string;
  /** Current instant, for event phase only. Never used as a capture time. */
  readonly nowIso: string;
}

/**
 * Build the canonical intelligence object for one game.
 *
 * Pure: no clock, no filesystem, no network. Every time-dependent answer comes from `todayEt` /
 * `nowIso`, so a surface and its test can pin the same instant.
 */
export function buildGameIntelligence(input: GameIntelligenceInput): GameIntelligence {
  const { book, sim } = input;
  const sport = input.sport ?? "mlb";
  const freshness = evaluateArtifactFreshness(
    { artifactDate: input.artifact.date, generatedAt: input.artifact.generatedAt },
    input.todayEt,
  );
  const startTime = book.commenceTime ?? null;

  const snapshot: SnapshotProvenance = {
    capturedAt: input.artifact.generatedAt,
    captureLabel: captureLabel(freshness),
    freshness,
    bookmaker: book.bookmaker ?? null,
  };

  const modeFor = (
    family: GameMarketFamily,
    hasBook: boolean,
    odds: number | null,
    line: number | null,
    requiresLine: boolean,
    modelPresent: boolean,
    thresholdOk: boolean,
  ) =>
    getMarketIntelligenceMode({
      sport,
      kind: "game",
      family,
      sportsbook: { present: hasBook, americanOdds: odds, line, requiresLine },
      model: { present: modelPresent, supportsThreshold: thresholdOk },
      freshness,
      eventResolved: input.gamePk != null,
    });

  return {
    gameId: book.gameId,
    gamePk: input.gamePk,
    homeTeam: book.homeTeam,
    awayTeam: book.awayTeam,
    homeTeamAbbr: input.homeTeamAbbr ?? null,
    awayTeamAbbr: input.awayTeamAbbr ?? null,
    startTime,
    eventPhase: evaluateEventPhase(startTime, input.nowIso),
    snapshot,
    moneyline: buildMoneyline(book, sim, modeFor),
    runLine: buildRunLine(book, sim, modeFor),
    total: buildTotal(book, sim, modeFor),
  };
}

type ModeFor = (
  family: GameMarketFamily,
  hasBook: boolean,
  odds: number | null,
  line: number | null,
  requiresLine: boolean,
  modelPresent: boolean,
  thresholdOk: boolean,
) => MarketIntelligence;

function buildMoneyline(book: BookGameMarkets, sim: SimGame | null, modeFor: ModeFor): MoneylineIntelligence {
  const homeOdds = num(book.moneyline?.home?.odds);
  const awayOdds = num(book.moneyline?.away?.odds);
  const homeWin = num(sim?.winProbability?.home);
  const awayWin = num(sim?.winProbability?.away);
  const modelPresent = Boolean(sim) && homeWin !== null && awayWin !== null;

  const intelligence = modeFor("MONEYLINE", Boolean(book.moneyline), homeOdds, null, false, modelPresent, modelPresent);

  const model =
    intelligence.hasModel && homeWin !== null && awayWin !== null && sim
      ? {
          homeWinProb: homeWin,
          awayWinProb: awayWin,
          homeMedianRuns: num(sim.runs?.home?.median),
          awayMedianRuns: num(sim.runs?.away?.median),
          uncertainty: uncertaintyOf(sim),
        }
      : null;

  const homeNoVig = num(book.moneyline?.home?.noVigProb);
  const awayNoVig = num(book.moneyline?.away?.noVigProb);
  const sportsbook = intelligence.hasSportsbook
    ? {
        homeOdds,
        awayOdds,
        homeImpliedProb: num(book.moneyline?.home?.impliedProb),
        awayImpliedProb: num(book.moneyline?.away?.impliedProb),
        homeNoVigProb: homeNoVig,
        awayNoVigProb: awayNoVig,
      }
    : null;

  const comparison =
    model && sportsbook && homeNoVig !== null && awayNoVig !== null
      ? { home: compare(model.homeWinProb, homeNoVig), away: compare(model.awayWinProb, awayNoVig) }
      : null;

  return { family: "MONEYLINE", intelligence, model, sportsbook, comparison };
}

function buildRunLine(book: BookGameMarkets, sim: SimGame | null, modeFor: ModeFor): RunLineIntelligence {
  const homeLine = num(book.runLine?.home?.line) ?? num(book.runLine?.line);
  const homeOdds = num(book.runLine?.home?.odds);
  const awayOdds = num(book.runLine?.away?.odds);

  // Threshold support is decided BEFORE any number is read, so an unsupported magnitude cannot
  // reach the output at all.
  const cover = sim && homeLine !== null ? homeCoverProbability(sim, homeLine) : null;
  const thresholdOk = cover !== null;

  const intelligence = modeFor(
    "RUN_LINE",
    Boolean(book.runLine),
    homeOdds,
    homeLine,
    true,
    Boolean(sim),
    thresholdOk,
  );

  const model =
    intelligence.hasModel && cover && sim
      ? {
          homeCoverProb: cover.prob,
          awayCoverProb: 1 - cover.prob,
          derivation: cover.derivation,
          uncertainty: uncertaintyOf(sim),
        }
      : null;

  const homeCoverBook = num(book.runLine?.home?.coverNoVigProb);
  const sportsbook = intelligence.hasSportsbook
    ? {
        homeOdds,
        awayOdds,
        homeCoverNoVigProb: homeCoverBook,
        awayCoverNoVigProb: num(book.runLine?.away?.coverNoVigProb),
      }
    : null;

  const comparison =
    model && sportsbook && homeCoverBook !== null ? { home: compare(model.homeCoverProb, homeCoverBook) } : null;

  return { family: "RUN_LINE", intelligence, homeLine, model, sportsbook, comparison };
}

function buildTotal(book: BookGameMarkets, sim: SimGame | null, modeFor: ModeFor): TotalIntelligence {
  const line = num(book.total?.line);
  const overOdds = num(book.total?.over?.odds);
  const underOdds = num(book.total?.under?.odds);
  const distribution = sim?.totalRuns?.distribution ?? null;

  const overProb = line !== null ? massWhere(distribution, (v) => v > line) : null;
  const underProb = line !== null ? massWhere(distribution, (v) => v < line) : null;
  const pushProb = line !== null ? massWhere(distribution, (v) => v === line) : null;
  const thresholdOk = overProb !== null && underProb !== null;

  const intelligence = modeFor("TOTAL", Boolean(book.total), overOdds, line, true, Boolean(sim), thresholdOk);

  let model: TotalIntelligence["model"] = null;
  if (intelligence.hasModel && sim && overProb !== null && underProb !== null) {
    const push = pushProb ?? 0;
    const decisive = overProb + underProb;
    model = {
      medianTotal: num(sim.totalRuns?.median),
      meanTotal: num(sim.totalRuns?.mean),
      p10: num(sim.totalRuns?.p10),
      p90: num(sim.totalRuns?.p90),
      overProb,
      underProb,
      pushProb: push,
      // The book's two-way price has no push term, so the comparable quantity is conditional on the
      // total not landing exactly on the line.
      overProbExcludingPush: decisive > 0 ? overProb / decisive : overProb,
      uncertainty: uncertaintyOf(sim),
    };
  }

  const overNoVig = num(book.total?.over?.noVigProb);
  const sportsbook = intelligence.hasSportsbook
    ? {
        overOdds,
        underOdds,
        overNoVigProb: overNoVig,
        underNoVigProb: num(book.total?.under?.noVigProb),
      }
    : null;

  const comparison =
    model && sportsbook && overNoVig !== null ? { over: compare(model.overProbExcludingPush, overNoVig) } : null;

  return { family: "TOTAL", intelligence, line, model, sportsbook, comparison };
}

/** Artifact-level capture label. Never relative ("4 minutes ago") — the feed has no row timestamp. */
function captureLabel(freshness: FreshnessReading): string | null {
  if (!freshness.generatedAt) return null;
  const t = Date.parse(freshness.generatedAt);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const date = d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  return `Sportsbook snapshot captured ${date} at ${time} ET`;
}

/**
 * Plain-English phrasing for a neutral difference.
 *
 * The vocabulary is the point: "percentage points" and "difference", never "edge" or "value". The
 * two numbers are a model estimate and a price-derived estimate; which one is closer to the truth is
 * exactly what has not been established.
 */
export function describeDifference(c: ProbabilityComparison): string {
  const d = c.differencePoints;
  if (Math.abs(d) < 0.05) return "Model and sportsbook agree";
  const direction = d > 0 ? "higher" : "lower";
  return `${Math.abs(d).toFixed(1)} percentage points ${direction} than the sportsbook price implies`;
}

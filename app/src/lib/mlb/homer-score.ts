/**
 * Homer Score — the Homer Nukes ranking engine. A pure, deterministic 0–100 score that fuses the real
 * drivers of a home run: the BATTER's power profile, the PITCHER's home-run vulnerability, and the
 * ENVIRONMENT (park + weather). It does NOT fabricate inputs — when an input is missing it falls back to
 * a neutral value, and the caller decides whether enough real signal exists to surface a pick.
 *
 * Weights (sum to 1.0): batter 0.45 · pitcher 0.35 · environment 0.20. Each component is normalized to
 * 0..1 against league-typical ranges, blended, and scaled to 0..100. Higher = more likely / better spot.
 */

export interface BatterFactors {
  hrRate?: number;        // HR per PA (league ~0.035)
  barrelRate?: number;    // barrels per BBE (league ~0.08)
  hardHitRate?: number;   // hard-hit % (league ~0.40)
  xSlg?: number;          // expected slugging (league ~0.420)
  pullPct?: number;       // pull % (league ~0.40)
  recentForm?: number;    // 0..1 normalized recent power form (0.5 = neutral)
}
export interface PitcherFactors {
  hr9?: number;           // HR allowed per 9 (league ~1.25)
  flyBallPct?: number;    // fly-ball % allowed (league ~0.37)
  barrelAllowed?: number; // barrels allowed per BBE (league ~0.08)
  hardContactAllowed?: number; // hard-hit % allowed (league ~0.40)
  handednessEdge?: number; // -1..1, + = batter has the platoon edge vs this pitcher
}
export interface EnvironmentFactors {
  parkHrFactor?: number;  // park HR factor (1.0 = neutral; >1 favors HR)
  tempF?: number;         // temperature °F (warmer carries)
  windOutMph?: number;    // wind blowing OUT to CF, mph (negative = blowing in)
  humidity?: number;      // 0..1 (higher = ball carries slightly more)
}

export interface HomerScoreInputs {
  batter?: BatterFactors;
  pitcher?: PitcherFactors;
  environment?: EnvironmentFactors;
}

export interface HomerScoreResult {
  score: number;                 // 0..100
  components: { batter: number; pitcher: number; environment: number }; // each 0..100
  inputsPresent: { batter: boolean; pitcher: boolean; environment: boolean };
  confidence: "high" | "medium" | "low"; // how much real signal fed the score
}

/** The advanced inputs the full Homer Score model consumes. Until a Statcast/weather feed is wired,
 *  these report as "pending" and the score falls back to the de-vigged market probability (Partial Model). */
export const HOMER_SCORE_INPUTS = [
  "Barrel %", "Hard-Hit %", "xSLG", "HR/FB", "Pitcher HR/9", "Weather", "Park factor",
] as const;

/** Which advanced inputs are currently LIVE. No Statcast/weather feed is wired yet, so the model runs in
 *  Partial Model mode (market-probability ranking). Returns the live-input count for honest UI labeling. */
export function homerModelInputStatus(): { total: number; live: number; partial: boolean; pending: readonly string[] } {
  const live = 0; // ← becomes > 0 when the Statcast / park / weather loaders are wired
  return { total: HOMER_SCORE_INPUTS.length, live, partial: live < HOMER_SCORE_INPUTS.length, pending: HOMER_SCORE_INPUTS };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
/** Map a value to 0..1 across [lo, hi] (lo→0, hi→1), clamped. */
const norm = (v: number | undefined, lo: number, hi: number, neutral: number): number =>
  clamp01(((v ?? neutral) - lo) / (hi - lo));

/** Batter power sub-score (0..1): HR rate, barrels, hard-hit, xSLG, pull, recent form. */
function batterScore(b: BatterFactors): { v: number; present: boolean } {
  const present = b.hrRate != null || b.barrelRate != null || b.xSlg != null || b.hardHitRate != null;
  const v =
    0.30 * norm(b.hrRate, 0.01, 0.07, 0.035) +
    0.25 * norm(b.barrelRate, 0.03, 0.16, 0.08) +
    0.15 * norm(b.hardHitRate, 0.30, 0.55, 0.40) +
    0.15 * norm(b.xSlg, 0.34, 0.62, 0.42) +
    0.08 * norm(b.pullPct, 0.30, 0.55, 0.40) +
    0.07 * clamp01(b.recentForm ?? 0.5);
  return { v: clamp01(v), present };
}

/** Pitcher HR-vulnerability sub-score (0..1): more HR/9, fly balls, barrels, hard contact = higher. */
function pitcherScore(p: PitcherFactors): { v: number; present: boolean } {
  const present = p.hr9 != null || p.flyBallPct != null || p.barrelAllowed != null;
  const v =
    0.35 * norm(p.hr9, 0.6, 2.2, 1.25) +
    0.22 * norm(p.flyBallPct, 0.28, 0.48, 0.37) +
    0.20 * norm(p.barrelAllowed, 0.04, 0.14, 0.08) +
    0.13 * norm(p.hardContactAllowed, 0.30, 0.52, 0.40) +
    0.10 * clamp01(((p.handednessEdge ?? 0) + 1) / 2);
  return { v: clamp01(v), present };
}

/** Environment sub-score (0..1): park HR factor, temperature, wind out, humidity. */
function environmentScore(e: EnvironmentFactors): { v: number; present: boolean } {
  const present = e.parkHrFactor != null || e.tempF != null || e.windOutMph != null;
  const v =
    0.50 * norm(e.parkHrFactor, 0.80, 1.25, 1.0) +
    0.25 * norm(e.tempF, 50, 95, 72) +
    0.18 * norm(e.windOutMph, -12, 15, 0) +
    0.07 * clamp01(e.humidity ?? 0.5);
  return { v: clamp01(v), present };
}

/**
 * Compute the 0–100 Homer Score. Batter 0.45 · Pitcher 0.35 · Environment 0.20. Confidence reflects how
 * many of the three input groups carried real data (3 → high, 2 → medium, ≤1 → low).
 */
export function computeHomerScore(inputs: HomerScoreInputs): HomerScoreResult {
  const b = batterScore(inputs.batter ?? {});
  const p = pitcherScore(inputs.pitcher ?? {});
  const e = environmentScore(inputs.environment ?? {});
  const blended = 0.45 * b.v + 0.35 * p.v + 0.20 * e.v;
  const presentCount = [b.present, p.present, e.present].filter(Boolean).length;
  const confidence = presentCount >= 3 ? "high" : presentCount === 2 ? "medium" : "low";
  return {
    score: Math.round(blended * 100),
    components: { batter: Math.round(b.v * 100), pitcher: Math.round(p.v * 100), environment: Math.round(e.v * 100) },
    inputsPresent: { batter: b.present, pitcher: p.present, environment: e.present },
    confidence,
  };
}

/** Parse the documented Homer Nukes factor fields off a raw prop/market row into engine inputs. Returns
 *  null when the row carries none of the modeling inputs (so the caller doesn't fabricate a score). */
export function homerInputsFromRow(r: Record<string, any>): HomerScoreInputs | null {
  const batter: BatterFactors = {
    hrRate: r.hrRate ?? r.batter?.hrRate, barrelRate: r.barrelRate ?? r.batter?.barrelRate,
    hardHitRate: r.hardHitRate ?? r.batter?.hardHitRate, xSlg: r.xSlg ?? r.batter?.xSlg,
    pullPct: r.pullPct ?? r.batter?.pullPct, recentForm: r.recentForm ?? r.batter?.recentForm,
  };
  const pitcher: PitcherFactors = {
    hr9: r.pitcherHr9 ?? r.pitcher?.hr9, flyBallPct: r.pitcherFlyBallPct ?? r.pitcher?.flyBallPct,
    barrelAllowed: r.pitcher?.barrelAllowed, hardContactAllowed: r.pitcher?.hardContactAllowed,
    handednessEdge: r.handednessEdge ?? r.pitcher?.handednessEdge,
  };
  const environment: EnvironmentFactors = {
    parkHrFactor: r.parkHrFactor ?? r.park?.hrFactor, tempF: r.tempF ?? r.weather?.tempF,
    windOutMph: r.windOutMph ?? r.weather?.windOutMph, humidity: r.humidity ?? r.weather?.humidity,
  };
  const anyReal = [batter.hrRate, batter.barrelRate, batter.xSlg, pitcher.hr9, pitcher.flyBallPct, environment.parkHrFactor, environment.tempF]
    .some((x) => typeof x === "number");
  return anyReal ? { batter, pitcher, environment } : null;
}

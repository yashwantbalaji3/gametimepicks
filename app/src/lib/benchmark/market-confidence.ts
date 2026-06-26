/**
 * Market Confidence Index (MCI) — a 0–100 confidence score for a single betting leg, built ONLY from
 * available, real signals. It is a model FEATURE / display signal, never an automatic pick driver and
 * never a steam-chaser: line movement only NUDGES confidence, it never flips a selection.
 *
 * Components (each 0–1; only the AVAILABLE ones are averaged, with their weights renormalized — a missing
 * input is excluded and disclosed in `note`, never silently treated as 0):
 *   • probStrength   (w 0.45) — how far the de-vigged model probability sits above a coin flip.
 *   • marketAgreement(w 0.25) — model vs de-vigged market price agree (well-calibrated leg).
 *   • movement       (w 0.20) — pre-kickoff line movement from the benchmark engine; shortening (prob ↑)
 *                               lifts confidence, drifting lowers it. Needs ≥2 real captures, else excluded.
 *   • calibration    (w 0.10) — historical hit-rate vs predicted for this market bucket. Excluded until
 *                               the learning pipeline has enough settled outcomes (never fabricated).
 *
 * Honest by construction: with one snapshot and no settled history, MCI = f(probStrength, agreement) and
 * `note` says the movement + calibration inputs are pending data.
 */
import type { MarketMovement } from "./market-movement";

export interface MciInputs {
  modelProb: number;                       // de-vigged model probability the leg hits, 0..1
  marketProb?: number | null;              // de-vigged market probability (for agreement), 0..1
  movement?: MarketMovement | null;        // from market-movement.ts (≥2 captures to count)
  historicalCalibration?: number | null;   // 0..1 reliability for this market bucket; null until data
}

export interface Mci {
  score: number;                           // 0..100
  band: "low" | "moderate" | "strong" | "elite";
  components: { probStrength: number; marketAgreement: number | null; movement: number | null; calibration: number | null };
  inputsUsed: string[];
  note: string;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round = (n: number, p = 0) => Math.round(n * 10 ** p) / 10 ** p;

export function marketConfidence(i: MciInputs): Mci {
  const probStrength = clamp01((i.modelProb - 0.5) / 0.5); // 0.5→0, 1.0→1

  const marketAgreement = (i.marketProb != null)
    ? clamp01(1 - Math.abs(i.modelProb - i.marketProb) / 0.1) // within 10pp → full agreement
    : null;

  // Movement only counts with ≥2 real captures; ±10pp implied-prob move = full swing of the component.
  const movement = (i.movement && i.movement.steps >= 2)
    ? clamp01(0.5 + (i.movement.impliedProbDelta / 0.1) * 0.5)
    : null;

  const calibration = (i.historicalCalibration != null) ? clamp01(i.historicalCalibration) : null;

  const parts: Array<[string, number | null, number]> = [
    ["probStrength", probStrength, 0.45],
    ["marketAgreement", marketAgreement, 0.25],
    ["movement", movement, 0.20],
    ["calibration", calibration, 0.10],
  ];
  const present = parts.filter(([, v]) => v != null) as Array<[string, number, number]>;
  const wsum = present.reduce((s, [, , w]) => s + w, 0);
  const score = round((present.reduce((s, [, v, w]) => s + v * w, 0) / wsum) * 100);

  const band: Mci["band"] = score >= 75 ? "elite" : score >= 60 ? "strong" : score >= 40 ? "moderate" : "low";
  const missing = parts.filter(([, v]) => v == null).map(([k]) => k);
  const note = missing.length
    ? `Computed from ${present.map((p) => p[0]).join(", ")}; pending data: ${missing.join(", ")}.`
    : "Computed from all four inputs.";

  return {
    score, band,
    components: { probStrength: round(probStrength, 3), marketAgreement: marketAgreement == null ? null : round(marketAgreement, 3), movement: movement == null ? null : round(movement, 3), calibration },
    inputsUsed: present.map((p) => p[0]),
    note,
  };
}

/** Card-level MCI: the product of leg survival is already the joint prob; the card MCI is the
 *  exposure-weighted mean of its legs' MCI (a card is only as confident as its legs, on average). */
export function cardConfidence(legMcis: Mci[]): number {
  if (!legMcis.length) return 0;
  return round(legMcis.reduce((s, m) => s + m.score, 0) / legMcis.length);
}

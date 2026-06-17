/**
 * Risk / projection-volatility scoring — 0..1, higher = more fragile/uncertain. Distinct from both
 * probability and confidence. Drives Bank Builder survival gating and "fragile leg" warnings. Pure.
 */
export interface RiskInputs {
  roleUncertainty: number;        // 0..1
  staleData: boolean;
  missingCriticalData: boolean;
  smallSample: boolean;
  volatileMarket: boolean;        // big line/odds movement
  fragilePropType: boolean;       // single-game single-player high-variance prop
  dnpOrScratchRisk: boolean;      // player prop without confirmed lineup
  overCorrelation: boolean;       // correlated with other selected legs
}

export interface RiskResult {
  score: number; // 0..1
  band: "low" | "elevated" | "high";
  drivers: string[];
}

const WEIGHTS: Record<keyof Omit<RiskInputs, "roleUncertainty">, number> = {
  staleData: 0.15,
  missingCriticalData: 0.25,
  smallSample: 0.12,
  volatileMarket: 0.1,
  fragilePropType: 0.18,
  dnpOrScratchRisk: 0.2,
  overCorrelation: 0.12,
};

export function computeRisk(inp: RiskInputs): RiskResult {
  let score = 0.25 * Math.max(0, Math.min(1, inp.roleUncertainty));
  const drivers: string[] = [];
  if (inp.roleUncertainty >= 0.5) drivers.push("role uncertainty");
  for (const [k, w] of Object.entries(WEIGHTS) as Array<[keyof typeof WEIGHTS, number]>) {
    if (inp[k]) {
      score += w;
      drivers.push(k.replace(/([A-Z])/g, " $1").toLowerCase().trim());
    }
  }
  score = Math.max(0, Math.min(1, score));
  const band = score >= 0.6 ? "high" : score >= 0.35 ? "elevated" : "low";
  return { score, band, drivers };
}

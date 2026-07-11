/**
 * UFC PREDICTION TABLE — a pure, honest per-fight summary for the whole card. Every fight from the real
 * ESPN schedule appears; each is joined to its market-implied report (odds-backed) or marked odds-pending.
 *
 * HONESTY MATRIX (the whole point):
 *   • Moneyline — MARKET-IMPLIED where two-sided odds exist (de-vigged win prob + a favorite lean at ≥58%);
 *     "Odds pending" otherwise. Never a model pick.
 *   • Rounds / Goes-distance / Method — the connected feed is h2h only and the internal model is
 *     unvalidated, so these are `provider_needed` (never a fabricated public number, never a model edge).
 *   • No model probability / edge / EV / best-bet is ever emitted here.
 *
 * Pure: no fetch, no fs, no money. Extensionless imports.
 */
import type { MultiSportGameReport } from "../multi-sport-report/schema";
import { indexOddsBouts, type UfcOddsArtifact } from "../multi-sport-report/ufc-adapter";

export interface UfcScheduleFight { boutId?: string; fighterA?: string; fighterB?: string; weightClass?: string | null }

/** A prop column's public state. `market` would mean a real provider market exists (none today). */
export type PropStatus = "market" | "provider_needed";

export interface UfcPredictionRow {
  boutId: string;
  /** The matched market-implied report's eventId (for the Details expansion), or null when odds-pending. */
  reportId: string | null;
  fight: string;
  fighterA: string;
  fighterB: string;
  oddsBacked: boolean;
  /** "Market-implied lean: X" · "No clear market lean" · "Odds pending". Never "model pick". */
  moneyline: string;
  winProbs: Array<{ name: string; prob: number }> | null;
  oddsA: number | null;
  oddsB: number | null;
  rounds: PropStatus;
  goesDistance: PropStatus;
  method: PropStatus;
  /** Honest overall status chip. */
  status: "Odds-backed" | "Odds pending";
}

const norm = (s: unknown): string => String(s ?? "").toLowerCase().replace(/[^a-z ]/g, "").trim();
const inUnit = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

/**
 * Build one row per scheduled fight. `reports` are the market-implied MultiSportGameReports (odds-backed
 * fights only); `odds` gives both-sided American prices. Nothing is fabricated — a fight with no report is
 * honestly "Odds pending", and props are `provider_needed`.
 */
export function buildUfcPredictionTable(
  fights: UfcScheduleFight[],
  reports: MultiSportGameReport[],
  odds: UfcOddsArtifact | null | undefined,
): UfcPredictionRow[] {
  // Join reports to fights by NORMALIZED FIGHTER-NAME SET — the ESPN schedule and the Odds-API projections
  // carry different boutId date-prefixes for the same fight, so a boutId join would miss most matches.
  const nameKey = (a: unknown, b: unknown): string => [norm(a), norm(b)].sort().join("|");
  const reportByNames = new Map<string, MultiSportGameReport>();
  for (const r of reports) {
    const parts = String(r.eventName ?? "").split(/\s+vs\.?\s+/i);
    if (parts.length === 2) reportByNames.set(nameKey(parts[0], parts[1]), r);
  }
  const oddsIdx = indexOddsBouts(odds);

  return (fights ?? []).map((f, i) => {
    const a = f.fighterA ?? "Fighter A";
    const b = f.fighterB ?? "Fighter B";
    const boutId = f.boutId ?? (`${norm(a)}|${norm(b)}` || `fight-${i}`);
    const report = reportByNames.get(nameKey(a, b));
    const oddsBacked = Boolean(report);

    // Both-sided American odds from the real board (order-independent join).
    const bout = oddsIdx.get([norm(a), norm(b)].sort().join("|"));
    const priceOf = (name: string): number | null => {
      const side = bout?.sides?.find((s) => norm(s.name) === norm(name));
      return typeof side?.price === "number" ? side.price : null;
    };

    let moneyline = "Odds pending";
    let winProbs: UfcPredictionRow["winProbs"] = null;
    if (report) {
      const wps = (report.simulationOutput.winProbabilities ?? []).filter((w) => inUnit(w.probability));
      winProbs = wps.map((w) => ({ name: w.label, prob: w.probability }));
      const lean = report.topLeans[0];
      moneyline = lean ? `Market-implied lean: ${lean.selection.replace(/ moneyline$/i, "")}` : "No clear market lean";
    }

    return {
      boutId,
      reportId: report?.eventId ?? null,
      fight: `${a} vs ${b}`,
      fighterA: a,
      fighterB: b,
      oddsBacked,
      moneyline,
      winProbs,
      // Only surface odds alongside a market-implied read; a pending fight shows no numbers (raw board
      // prices still live in the Advanced Odds Board).
      oddsA: oddsBacked ? priceOf(a) : null,
      oddsB: oddsBacked ? priceOf(b) : null,
      // h2h-only feed + unvalidated model ⇒ these are provider-needed, never faked.
      rounds: "provider_needed",
      goesDistance: "provider_needed",
      method: "provider_needed",
      status: oddsBacked ? "Odds-backed" : "Odds pending",
    };
  });
}

/** Convenience count for headers/spotlights. */
export function oddsBackedCount(rows: UfcPredictionRow[]): number {
  return rows.filter((r) => r.oddsBacked).length;
}

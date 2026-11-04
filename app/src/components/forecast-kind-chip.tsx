/**
 * One legend for the three kinds of numbers a game page can print (founder 2026-11-04, Theater P3):
 *   official  — the frozen Official Forecast, labelled MODEL PROJECTION: gold, solid border
 *   simulated — a Game Simulation run (hypothetical): green, dashed border
 *   final     — the real, recorded result: white, solid border
 * Pure (no hooks); server- and client-safe. Styles: globals.css `.gtp-kind-chip`. The text always names the kind, so
 * the colour is never the only cue.
 */
export type ForecastKind = "official" | "simulated" | "final";

export const FORECAST_KIND_TEXT: Readonly<Record<ForecastKind, string>> = Object.freeze({
  official: "MODEL PROJECTION",
  simulated: "SIMULATED",
  final: "FINAL · REAL RESULT",
});

export default function ForecastKindChip({ kind, detail }: { kind: ForecastKind; detail?: string }) {
  return (
    <span className={`gtp-kind-chip is-${kind}`} data-forecast-kind={kind}>
      {FORECAST_KIND_TEXT[kind]}{detail ? <span className="gtp-kind-chip-detail"> · {detail}</span> : null}
    </span>
  );
}

/** The three chips side by side, for a page's legend. */
export function ForecastKindLegend() {
  return (
    <p className="gtp-kind-legend" data-forecast-kind-legend="">
      <ForecastKindChip kind="official" detail="Official Forecast" />
      <ForecastKindChip kind="simulated" detail="hypothetical game" />
      <ForecastKindChip kind="final" />
    </p>
  );
}

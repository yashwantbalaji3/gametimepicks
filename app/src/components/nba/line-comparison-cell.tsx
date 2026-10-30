/**
 * Model-versus-line presentation (launch program 2026-10-28). SERVER-safe, no state.
 *
 * <LineComparisonCell> prints the official median always; the line, the difference and its colour ONLY when the display
 * switch allows public lines AND the comparison is valid (line-comparison.mjs). Every other case is the projection alone,
 * neutral — a colour is never derived from the projection by itself. <LineComparisonLegend> must sit beside any coloured
 * cell (founder rule: green / red / neutral explained, and not a probability, pick or value).
 *
 * DEFAULT PRIVATE (2026-10-29): this cell knows no family, so it cannot apply the per-family direction gate
 * (lib/odds/display-authorization.mjs publicDirectionGate). Now that the site surface is authorized, its default display is
 * PRIVATE rather than NBA_LINE_DISPLAY: a caller must pass `display` explicitly AND gate the family itself. Public pages
 * use the shared section (components/odds/prop-line-comparison.tsx), which applies the gate.
 */
import React from "react";
import { COMPARISON_LEGEND, comparisonTone, TONE_TOKEN, UNAVAILABLE_REASON } from "@/lib/sports/nba/line-comparison.mjs";
import { signedDifference } from "@/lib/odds/prop-line-view.mjs";

type Comparison = { direction: string; median?: number | null; line?: number; difference?: number; differenceExact?: number; book?: string; capturedAt?: string; reason?: string };

const PRIVATE_DISPLAY = Object.freeze({ public: false });

const one = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(1) : "—");
const et = (iso?: string) => {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(t)) + " ET" : "—";
};

export function LineComparisonCell({ median, comparison, display = PRIVATE_DISPLAY }: { median: number | null | undefined; comparison?: Comparison | null; display?: { public: boolean } }) {
  const shown = display.public && comparison && comparison.direction !== "UNAVAILABLE";
  if (!shown) {
    const why = display.public && comparison?.reason ? UNAVAILABLE_REASON[comparison.reason as keyof typeof UNAVAILABLE_REASON] : null;
    return <span data-line-cmp="projection-only" title={why ?? undefined}>{one(median)}</span>;
  }
  const tone = comparisonTone(comparison);
  // Display rounding policy (lib/odds/prop-line-view.mjs): signed from the full-precision difference (+0.0 / −0.0 keep the direction).
  const diff = signedDifference(comparison!.differenceExact ?? comparison!.difference ?? null);
  return (
    <span data-line-cmp={comparison!.direction} className="inline-flex flex-col leading-tight">
      <span>{one(median)}</span>
      <span style={{ color: TONE_TOKEN[tone], fontSize: 12 }}>
        {diff.text} vs {one(comparison!.line)}
        <span className="sr-only"> ({comparison!.direction === "ABOVE" ? "Over: projection above the line" : comparison!.direction === "BELOW" ? "Under: projection below the line" : "Neutral: projection equals the line"})</span>
      </span>
      <span style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>{comparison!.book} · {et(comparison!.capturedAt)}</span>
    </span>
  );
}

export function LineComparisonLegend({ display = PRIVATE_DISPLAY }: { display?: { public: boolean } }) {
  if (!display.public) return null;
  return (
    <ul data-line-cmp-legend="" className="m-0 pl-5 text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
      <li><span style={{ color: TONE_TOKEN.above }}>■</span> {COMPARISON_LEGEND.above}</li>
      <li><span style={{ color: TONE_TOKEN.below }}>■</span> {COMPARISON_LEGEND.below}</li>
      <li><span style={{ color: TONE_TOKEN.neutral }}>■</span> {COMPARISON_LEGEND.neutral}</li>
      <li>{COMPARISON_LEGEND.caveat}</li>
    </ul>
  );
}

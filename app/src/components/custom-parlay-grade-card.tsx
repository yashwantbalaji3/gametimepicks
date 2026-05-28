/**
 * Custom-parlay grade display.
 *
 * Renders the A/B/C/D/F grade chip + score/100 + top positives and
 * warnings for a user-built custom slip. Informational copy is
 * baked in: "Custom grade is informational and not officially tracked."
 *
 * Factor breakdown is collapsed by default — most users don't need
 * to see it, but it's there for power-users + transparency.
 *
 * Honest behavior:
 *   - Never claims a probability.
 *   - Empty leg pool shows the neutral C grade with a clear "pick
 *     legs to see a grade" message.
 *   - No banned copy. The underlying `gradeCustomParlay` helper
 *     enforces this with a test; the display layer just renders
 *     whatever the helper returns.
 */

import { useMemo, useState } from "react";

import {
  gradeCustomParlay,
  type CustomParlayGrade,
} from "@/lib/custom-parlay-grade";
import type { OptimizerLeg } from "@/lib/parlay-optimizer";

interface Props {
  legs: ReadonlyArray<OptimizerLeg>;
  /** When set, prepends to the card header. Useful when the same
   *  component is embedded in different surfaces (e.g. "Custom
   *  Generator" vs "Manual Builder"). */
  context?: string;
}

const _GRADE_TONE: Record<CustomParlayGrade["grade"], { fg: string; bg: string; border: string }> = {
  A: { fg: "var(--vault-success)", bg: "var(--vault-success-dim)", border: "rgba(80, 180, 120, 0.40)" },
  B: { fg: "var(--vault-gold-bright)", bg: "var(--vault-gold-dim)", border: "rgba(240, 199, 94, 0.40)" },
  C: { fg: "var(--vault-text)", bg: "rgba(120, 120, 120, 0.10)", border: "var(--vault-rule)" },
  D: { fg: "var(--vault-warn)", bg: "var(--vault-warn-dim)", border: "rgba(220, 150, 60, 0.45)" },
  F: { fg: "var(--vault-danger)", bg: "var(--vault-danger-dim)", border: "rgba(240, 138, 138, 0.45)" },
};

export default function CustomParlayGradeCard({ legs, context }: Props) {
  const grade = useMemo(() => gradeCustomParlay(legs), [legs]);
  const [showFactors, setShowFactors] = useState(false);
  const tone = _GRADE_TONE[grade.grade];

  return (
    <section
      aria-label="Custom parlay grade"
      className="rounded-[8px] p-3 sm:p-4 flex flex-col gap-3"
      style={{
        background: "rgba(7,11,26,0.40)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5 min-w-0">
          {context && (
            <span
              className="font-mono uppercase tracking-[0.18em]"
              style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
            >
              {context}
            </span>
          )}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className="font-mono uppercase tracking-[0.16em]"
              style={{ color: "var(--vault-gold)", fontSize: 11 }}
            >
              Custom slip grade
            </span>
            <span
              className="text-[11px] font-mono uppercase tracking-[0.14em]"
              style={{ color: "var(--vault-text-faint)" }}
            >
              · informational · not officially tracked
            </span>
          </div>
        </div>
        <div
          className="font-display inline-flex items-center gap-2 px-3 py-1 rounded-full shrink-0"
          style={{
            color: tone.fg,
            background: tone.bg,
            border: `1px solid ${tone.border}`,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          <span style={{ fontSize: 22, lineHeight: 1 }}>{grade.grade}</span>
          <span style={{ fontSize: 12, color: "var(--vault-text-mute)" }}>
            · {grade.score}/100
          </span>
        </div>
      </header>

      <p
        className="text-[13px] leading-snug"
        style={{ color: "var(--vault-text)" }}
      >
        {grade.label}.
      </p>

      {(grade.positives.length > 0 || grade.warnings.length > 0) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {grade.positives.length > 0 && (
            <ul
              aria-label="Slip positives"
              className="flex flex-col gap-1 list-none m-0 p-0"
            >
              {grade.positives.map((p) => (
                <li
                  key={p}
                  className="text-[12px] leading-snug flex items-start gap-1.5"
                  style={{ color: "var(--vault-text-mute)" }}
                >
                  <span
                    aria-hidden
                    style={{
                      color: "var(--vault-success)",
                      fontSize: 11,
                      lineHeight: 1.4,
                    }}
                  >
                    +
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
          {grade.warnings.length > 0 && (
            <ul
              aria-label="Slip warnings"
              className="flex flex-col gap-1 list-none m-0 p-0"
            >
              {grade.warnings.map((w) => (
                <li
                  key={w}
                  className="text-[12px] leading-snug flex items-start gap-1.5"
                  style={{ color: "var(--vault-text-mute)" }}
                >
                  <span
                    aria-hidden
                    style={{
                      color: "var(--vault-warn)",
                      fontSize: 11,
                      lineHeight: 1.4,
                    }}
                  >
                    !
                  </span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowFactors((v) => !v)}
        aria-expanded={showFactors}
        aria-controls="custom-grade-factors"
        className="self-start font-mono uppercase tracking-[0.14em] px-2.5 py-1 rounded-[4px]"
        style={{
          color: "var(--vault-text-faint)",
          border: "1px solid var(--vault-rule)",
          background: "transparent",
          fontSize: 9,
          cursor: "pointer",
        }}
      >
        {showFactors ? "▾ Hide factor breakdown" : "▸ Show factor breakdown"}
      </button>

      {showFactors && (
        <dl
          id="custom-grade-factors"
          className="grid grid-cols-2 sm:grid-cols-4 gap-2 m-0"
          aria-label="Per-factor scores"
        >
          {(
            [
              ["Leg quality", grade.factors.legQuality],
              ["Independence", grade.factors.correlation],
              ["Market mix", grade.factors.diversity],
              ["Market stability", grade.factors.marketStability],
              ["Recent form", grade.factors.recentFormCoverage],
              ["Odds risk", grade.factors.oddsRisk],
              ["DNP risk", grade.factors.dnpRisk],
            ] as ReadonlyArray<[string, number]>
          ).map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt
                className="font-mono uppercase tracking-[0.12em]"
                style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
              >
                {label}
              </dt>
              <dd
                className="font-mono"
                style={{
                  color: "var(--vault-text)",
                  fontSize: 12,
                  margin: 0,
                }}
              >
                {Math.round(value * 100)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

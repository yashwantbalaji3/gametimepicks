/**
 * SportsCoverageGrid — honest, badged cards showing what each sport offers.
 *
 * Pure presentation over the `sports-coverage` registry (the single source
 * of truth). Server-safe (just <Link>s). Each card shows a coverage badge
 * (Projections + Parlays / Schedule only / Coming soon), a one-line blurb,
 * and real in-app links. "Coming soon" sports render dimmed with no links,
 * so nothing implies coverage that doesn't exist.
 */
import Link from "next/link";

import {
  COVERAGE_BADGE,
  type SportCoverage,
} from "@/lib/sports-coverage";

export default function SportsCoverageGrid({
  sports,
  columns = 3,
}: {
  sports: ReadonlyArray<SportCoverage>;
  /** Max columns at the lg breakpoint (1–3). Mobile is always 1, sm is 2. */
  columns?: 1 | 2 | 3;
}) {
  const lgCols = columns === 1 ? "" : columns === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3";
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${lgCols} gap-2.5`}>
      {sports.map((s) => {
        const badge = COVERAGE_BADGE[s.level];
        const dim = s.level === "coming-soon";
        return (
          <div
            key={s.key}
            className="flex flex-col gap-1.5 rounded-[8px] p-3.5"
            style={{
              background: "var(--gtp-card)",
              border: "1px solid var(--vault-border)",
              opacity: dim ? 0.72 : 1,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="font-display"
                title={s.longLabel}
                style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 600 }}
              >
                {s.label}
              </span>
              <span
                className="font-mono uppercase tracking-[0.1em] px-2 py-0.5 rounded-[4px] shrink-0"
                style={{ color: badge.tone, border: `1px solid ${badge.tone}`, fontSize: 9, lineHeight: 1.3 }}
              >
                {badge.label}
              </span>
            </div>
            <span
              className="text-[11.5px] leading-snug flex-1"
              style={{ color: "var(--vault-text-mute)" }}
            >
              {s.blurb}
            </span>
            {s.links.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
                {s.links.map((l) => (
                  <Link
                    key={`${l.href}-${l.label}`}
                    href={l.href}
                    className="font-mono uppercase tracking-[0.1em]"
                    style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
                  >
                    {l.label} →
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

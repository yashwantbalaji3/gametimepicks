/**
 * HomeSportsCoverage — compact, honest sports list for the Home sidebar.
 *
 * A dense one-row-per-sport view over the shared `sports-coverage` registry
 * (single source of truth). Each row shows the sport + a coverage badge.
 * Rows for covered sports link to their real surface; "coming-soon" sports
 * (MLS/EPL) render dimmed with NO link — nothing implies coverage that
 * doesn't exist. The fuller card grid lives on /events.
 *
 * Server-safe (just <Link>s). No data/pipeline access — pure registry.
 */
import Link from "next/link";

import { SPORTS_COVERAGE, COVERAGE_BADGE } from "@/lib/sports-coverage";

export default function HomeSportsCoverage() {
  return (
    <ul className="flex flex-col">
      {SPORTS_COVERAGE.map((s, i) => {
        const badge = COVERAGE_BADGE[s.level];
        const primary = s.links[0];
        const dim = s.level === "coming-soon";
        const inner = (
          <>
            <span
              className="font-display"
              style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}
            >
              {s.label}
            </span>
            <span
              className="ml-auto font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-[4px] shrink-0"
              style={{ color: badge.tone, border: `1px solid ${badge.tone}`, fontSize: 10, lineHeight: 1.3 }}
            >
              {badge.label}
            </span>
            {primary && (
              <span aria-hidden style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
                →
              </span>
            )}
          </>
        );
        const rowClass = "flex items-center gap-2 px-3.5 py-2";
        const rowStyle = {
          borderTop: i === 0 ? "none" : "1px solid var(--vault-rule)",
          opacity: dim ? 0.62 : 1,
        } as const;
        return (
          <li key={s.key}>
            {primary ? (
              <Link
                href={primary.href}
                title={`${s.longLabel} — ${badge.label}`}
                className={rowClass}
                style={rowStyle}
              >
                {inner}
              </Link>
            ) : (
              <div className={rowClass} style={rowStyle} title={`${s.longLabel} — ${badge.label}`}>
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

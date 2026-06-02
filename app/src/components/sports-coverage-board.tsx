"use client";

/**
 * SportsCoverageBoard — the mobile-first Sports coverage surface.
 *
 * Leads /events with: a one-line coverage summary, tappable category
 * filters (All / Picks available / Schedule only / Coming soon), and big
 * tap-friendly cards. Each card shows the coverage badge, a one-line
 * blurb, and — for schedule-only leagues we surface directly — the next
 * event + an attributed source line. CTAs link to the real surface; a
 * "coming soon" league shows a dimmed pill and links nowhere.
 *
 * Honesty: pure presentation over the `sports-coverage` registry + a
 * server-computed `extras` map (next event / source). No fabricated data.
 */
import { useState } from "react";
import Link from "next/link";

import {
  COVERAGE_BADGE,
  type SportCoverage,
  type SportCoverageLevel,
} from "@/lib/sports-coverage";

/** Server-computed extras for leagues whose schedule we surface directly. */
export interface CoverageExtra {
  nextEvent?: { dateLabel: string; timeLabel?: string; name: string };
  source?: { name: string; retrievedAt: string };
}

type FilterKey = "all" | "picks" | "schedule" | "coming-soon";

const FILTERS: ReadonlyArray<{
  key: FilterKey;
  label: string;
  match: (l: SportCoverageLevel) => boolean;
}> = [
  { key: "all", label: "All", match: () => true },
  { key: "picks", label: "Picks available", match: (l) => l === "full" || l === "projections" },
  { key: "schedule", label: "Schedule only", match: (l) => l === "schedule" },
  { key: "coming-soon", label: "Coming soon", match: (l) => l === "coming-soon" },
];

export default function SportsCoverageBoard({
  sports,
  extras,
}: {
  sports: ReadonlyArray<SportCoverage>;
  extras: Record<string, CoverageExtra>;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const picks = sports.filter((s) => s.level === "full" || s.level === "projections").length;
  const schedule = sports.filter((s) => s.level === "schedule").length;
  const coming = sports.filter((s) => s.level === "coming-soon").length;

  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const shown = sports.filter((s) => active.match(s.level));

  return (
    <section aria-label="Sports coverage" className="flex flex-col gap-3">
      {/* Summary */}
      <p className="text-[12.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
        <strong style={{ color: "var(--vault-text)", fontWeight: 600 }}>{picks}</strong> with
        projections &amp; parlays ·{" "}
        <strong style={{ color: "var(--vault-text)", fontWeight: 600 }}>{schedule}</strong>{" "}
        schedule-only ·{" "}
        <strong style={{ color: "var(--vault-text)", fontWeight: 600 }}>{coming}</strong> coming soon
      </p>

      {/* Category filters — horizontally scrollable on narrow screens */}
      <div
        role="tablist"
        aria-label="Filter sports by coverage"
        className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5"
      >
        {FILTERS.map((f) => {
          const on = f.key === filter;
          const n =
            f.key === "all"
              ? sports.length
              : f.key === "picks"
                ? picks
                : f.key === "schedule"
                  ? schedule
                  : coming;
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setFilter(f.key)}
              className="shrink-0 font-mono uppercase tracking-[0.1em] px-3 py-2 rounded-full whitespace-nowrap"
              style={{
                color: on ? "var(--vault-bg)" : "var(--vault-text-mute)",
                background: on ? "var(--vault-gold-bright)" : "var(--gtp-card-sunken)",
                border: `1px solid ${on ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`,
                fontSize: 10,
                fontWeight: on ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {f.label} {n}
            </button>
          );
        })}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {shown.map((s) => (
          <CoverageCard key={s.key} sport={s} extra={extras[s.key]} />
        ))}
      </div>
    </section>
  );
}

function CoverageCard({ sport, extra }: { sport: SportCoverage; extra?: CoverageExtra }) {
  const badge = COVERAGE_BADGE[sport.level];
  const dim = sport.level === "coming-soon";
  const next = sport.level === "schedule" ? extra?.nextEvent : undefined;
  const source = sport.level === "schedule" ? extra?.source : undefined;
  return (
    <div
      className="flex flex-col gap-2 rounded-[10px] p-4"
      style={{
        background: "var(--gtp-card)",
        border: "1px solid var(--vault-border)",
        opacity: dim ? 0.72 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="font-display"
          title={sport.longLabel}
          style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 600, lineHeight: 1.1 }}
        >
          {sport.label}
        </span>
        <span
          className="font-mono uppercase tracking-[0.1em] px-2 py-0.5 rounded-[4px] shrink-0"
          style={{ color: badge.tone, border: `1px solid ${badge.tone}`, fontSize: 9, lineHeight: 1.3 }}
        >
          {badge.label}
        </span>
      </div>

      <span className="text-[12px] leading-snug flex-1" style={{ color: "var(--vault-text-mute)" }}>
        {sport.blurb}
      </span>

      {next && (
        <div
          className="rounded-[6px] px-2.5 py-2 flex flex-col gap-0.5"
          style={{ background: "var(--gtp-card-sunken)", border: "1px solid var(--vault-rule)" }}
        >
          <span
            className="font-mono uppercase tracking-[0.14em]"
            style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}
          >
            Next
          </span>
          <span className="text-[12px] leading-snug" style={{ color: "var(--vault-text)" }}>
            {next.name}
          </span>
          <span className="text-[11px]" style={{ color: "var(--vault-text-mute)" }}>
            {next.dateLabel}
            {next.timeLabel ? ` · ${next.timeLabel}` : ""}
          </span>
        </div>
      )}

      {source && (
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
          {source.name} · snapshot {source.retrievedAt.slice(0, 10)}
        </span>
      )}

      {sport.links.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {sport.links.map((l) => (
            <Link
              key={`${l.href}-${l.label}`}
              href={l.href}
              className="font-mono uppercase tracking-[0.1em] px-3 py-1.5 rounded-full"
              style={{
                color: "var(--vault-gold-bright)",
                border: "1px solid var(--vault-gold-bright)",
                fontSize: 10,
              }}
            >
              {l.label} →
            </Link>
          ))}
        </div>
      ) : (
        <span
          className="self-start font-mono uppercase tracking-[0.1em] px-3 py-1.5 rounded-full"
          style={{ color: "var(--vault-text-faint)", border: "1px solid var(--vault-rule)", fontSize: 10 }}
        >
          Coming soon
        </span>
      )}
    </div>
  );
}

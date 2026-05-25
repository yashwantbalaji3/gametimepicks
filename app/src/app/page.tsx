/**
 * Homepage — parlay-first, lab-style.
 *
 * The homepage IS the Parlay Lab. We render the same
 * `ParlayLabBuilder` component used on /parlay-lab so the
 * experience is consistent (sport / team / player searchable
 * dropdowns, three risk-level cards, clickable legs that pop
 * recent form).
 *
 * Layout:
 *   1. Compact hero (one line).
 *   2. <ParlayLabBuilder /> — the main module. Renders best slips
 *      immediately without requiring any filter.
 *   3. Honest stats strip (decisive-only, no ROI).
 *   4. Pointer tiles to Projections + Parlay Lab.
 *
 * Honesty preserved:
 *   - Only real snapshots/graded files render here.
 *   - Empty risk cards explain why honestly.
 *   - High-variance slips are labeled.
 */
import Link from "next/link";

import { getLifetimeSummary } from "@/lib/data";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";
import {
  getSuggestedParlaysForDate,
  getOptimizerSnapshotForDate,
  getLatestOptimizerSnapshot,
} from "@/lib/data-parlays";
import { loadCalibrationTable } from "@/lib/confidence-calibration";
import { formatPercent } from "@/lib/format";

import ParlayLabBuilder from "@/components/parlay-lab-builder";
import NewsletterSignup from "@/components/newsletter-signup";
import SectionHeader from "@/components/section-header";

import { currentEtDate } from "@/lib/freshness";

export default function HomePage() {
  const today = currentEtDate();
  const lifetime = getLifetimeSummary();
  const mlbLifetime = getMlbLifetimeSummary();
  const calibrationTable = loadCalibrationTable();

  // Pick a parlay payload for the lab. Prefer today; otherwise the
  // walk-back helper finds the latest non-empty snapshot.
  const suggested = getSuggestedParlaysForDate(today);
  const optimizerForDate =
    getOptimizerSnapshotForDate(today) ||
    (suggested ? getOptimizerSnapshotForDate(suggested.date) : null) ||
    getLatestOptimizerSnapshot()?.payload ||
    null;

  // Lifetime stats strip (honest, decisive-only)
  const combinedDecisive =
    (lifetime?.decisive ?? 0) + (mlbLifetime?.decisive ?? 0);
  const combinedWins = (lifetime?.wins ?? 0) + (mlbLifetime?.wins ?? 0);
  const combinedHitRate =
    combinedDecisive > 0 ? combinedWins / combinedDecisive : null;

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-10 md:py-14 overflow-x-hidden">
      {/* 1 — Compact hero */}
      <section className="reveal" aria-label="Hero">
        <div className="flex flex-col gap-2 max-w-3xl">
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)", fontSize: 11 }}
          >
            Today · Suggested parlays
          </span>
          <h1
            className="font-display tracking-tight gtp-text-gradient-gold"
            style={{
              fontSize: "clamp(28px, 6vw, 44px)",
              lineHeight: 1.05,
              letterSpacing: "-0.01em",
            }}
          >
            Today&apos;s best suggested parlays.
          </h1>
          <p
            className="text-[14px] sm:text-[15px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)", maxWidth: 640 }}
          >
            Pick a sport, team, or player — or use the model&apos;s top slips below. No locks. High-variance slips are labeled. Every leg is tappable for recent form.
          </p>
        </div>
      </section>

      {/* 2 — Parlay Lab interface (same component as /parlay-lab) */}
      <div className="mt-6">
        {suggested ? (
          <ParlayLabBuilder
            slips={suggested.slips}
            date={suggested.date}
            source={suggested.source}
            isFallback={suggested.isFallback}
            calibrationTable={calibrationTable}
            optimizerPayload={optimizerForDate}
          />
        ) : optimizerForDate && optimizerForDate.totalSlips > 0 ? (
          <ParlayLabBuilder
            slips={[]}
            date={optimizerForDate.date}
            source="snapshot"
            isFallback={true}
            calibrationTable={calibrationTable}
            optimizerPayload={optimizerForDate}
          />
        ) : (
          <NoParlaysEmptyState />
        )}
      </div>

      {/* 3 — Tracked-results stats strip */}
      <section className="mt-10 reveal" aria-label="Tracked results strip">
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-[8px]"
          style={{
            background: "rgba(7,11,26,0.55)",
            border: "1px solid var(--vault-border)",
          }}
        >
          <StatTile
            label="Tracked hit rate"
            value={
              combinedHitRate != null
                ? formatPercent(combinedHitRate)
                : "—"
            }
            sub={
              combinedDecisive > 0
                ? `${combinedWins}–${combinedDecisive - combinedWins} on ${combinedDecisive}`
                : "no settled data"
            }
          />
          <StatTile
            label="NBA"
            value={
              lifetime?.hitRate != null
                ? formatPercent(lifetime.hitRate)
                : "—"
            }
            sub={
              lifetime
                ? `${lifetime.wins}–${lifetime.losses} on ${lifetime.decisive}`
                : "pending"
            }
          />
          <StatTile
            label="MLB"
            value={
              mlbLifetime?.hitRate != null
                ? formatPercent(mlbLifetime.hitRate)
                : "—"
            }
            sub={
              mlbLifetime
                ? `${mlbLifetime.wins}–${mlbLifetime.losses} on ${mlbLifetime.decisive}`
                : "pending"
            }
          />
          <Link
            href="/results"
            className="flex flex-col gap-1 min-w-0 vault-glow-hover"
            style={{ textDecoration: "none" }}
          >
            <span
              className="font-mono uppercase tracking-[0.16em]"
              style={{ color: "var(--vault-gold)", fontSize: 9 }}
            >
              See full tracking
            </span>
            <span
              className="font-display"
              style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}
            >
              Open Results →
            </span>
            <span
              className="font-mono"
              style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
            >
              Parlays graded after games
            </span>
          </Link>
        </div>
        <p
          className="mt-2 text-[11px] leading-relaxed"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Decisive single-leg projections only on this strip. Pushes excluded. Parlay-slip results live on{" "}
          <Link href="/results" style={{ color: "var(--vault-gold)" }}>
            Results
          </Link>
          .
        </p>
      </section>

      {/* 4 — Deeper surfaces */}
      <section className="mt-10 reveal" aria-label="Deeper surfaces">
        <SectionHeader eyebrow="Go deeper" title="Research or track" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DeeperTile
            href="/results"
            eyebrow="Results"
            title="Did the suggested parlays hit?"
            body="Every saved slip is graded after games finish. Pushes and pending slips are excluded from hit rate."
            cta="See tracked results"
          />
          <DeeperTile
            href="/projections"
            eyebrow="Projections"
            title="Every projection, by game"
            body="Game cards, player accordions, per-prop edges — the data the suggestions are built on."
            cta="Open projections"
          />
        </div>
      </section>

      {/* 5 — Newsletter */}
      <section className="mt-12 reveal">
        <NewsletterSignup variant="full" />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span
        className="font-mono uppercase tracking-[0.16em] truncate"
        style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
      >
        {label}
      </span>
      <span
        className="font-display tabular truncate"
        style={{
          color: "var(--vault-text)",
          fontSize: 18,
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span
        className="font-mono truncate"
        style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
      >
        {sub}
      </span>
    </div>
  );
}

function DeeperTile({
  href,
  eyebrow,
  title,
  body,
  cta,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="gtp-premium-tile px-4 py-4 flex flex-col gap-2 vault-glow-hover"
      style={{ textDecoration: "none" }}
    >
      <span
        className="font-mono uppercase tracking-[0.18em]"
        style={{ color: "var(--vault-gold)", fontSize: 10 }}
      >
        {eyebrow}
      </span>
      <h3
        className="font-display tracking-tight"
        style={{ color: "var(--vault-text)", fontSize: 17, lineHeight: 1.25 }}
      >
        {title}
      </h3>
      <p
        className="text-[12.5px] leading-snug"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {body}
      </p>
      <span
        className="mt-2 font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
      >
        {cta} →
      </span>
    </Link>
  );
}

function NoParlaysEmptyState() {
  return (
    <section
      className="rounded-[8px] p-6 flex flex-col gap-3"
      style={{
        background: "rgba(7,11,26,0.55)",
        border: "1px dashed var(--vault-border)",
      }}
      aria-label="No suggested parlays available"
    >
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-gold)", fontSize: 11 }}
      >
        No suggested parlays yet
      </span>
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 560 }}
      >
        We only show slips that were saved before games started. The next pregame snapshot lands when tonight&apos;s lines and projections are ready. In the meantime, jump into{" "}
        <Link href="/projections" style={{ color: "var(--vault-gold)" }}>
          projections
        </Link>{" "}
        for individual prop research.
      </p>
    </section>
  );
}

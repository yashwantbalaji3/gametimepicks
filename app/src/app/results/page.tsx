/**
 * /results — parlay-first track record.
 *
 * The product centers on suggested parlays. This page answers the
 * single question that matters: did the model-suggested parlays hit?
 *
 * Layout (post-era-reset):
 *   1. Hero + subcopy (mentions the fresh tracking era).
 *   2. Fresh-era status block — "Public parlay tracking starts
 *      2026-05-27". Replaces the old DateStatusHeader that was
 *      surfacing the pre-era settled-slate counts.
 *   3. Daily projection-level audit banner (intact — distinct from
 *      parlay tracking; tracks per-prop accuracy).
 *   4. Lifetime / by-profile / by-sport summary tiles (era-filtered
 *      so pre-era numbers never reach the UI).
 *   5. Date sections (newest first, era-filtered) with every graded
 *      slip. Renders an empty state until a post-era slate settles.
 *   6. Pointer to the projection-level audit pages (secondary).
 *
 * Honesty contract:
 *   - Hit rates only count decisive slips (win + loss).
 *   - Pushes excluded from denominator.
 *   - Pending slips excluded from denominator.
 *   - Empty pool → empty state. Never fabricates a slip.
 *   - Pre-era data is filtered out at the loader (`parlay-results.ts`
 *     applies `public-parlay-era.ts`). Files stay on disk as
 *     internal/dev archive; the UI never reads them.
 */
import Link from "next/link";

import {
  getOptimizerSummary,
  getOptimizerGradedDates,
  getOptimizerGradedForDate,
  sortGradedSlipsForDisplay,
} from "@/lib/parlay-results";
import { PUBLIC_PARLAY_RESULTS_START_DATE } from "@/lib/public-parlay-era";
import { optimizerSlipToParlaySlip } from "@/lib/parlay-optimizer";
import { loadCalibrationTable } from "@/lib/confidence-calibration";

import ParlayResultsSummary from "@/components/parlay-results-summary";
import ParlayResultsDateSectionV2 from "@/components/parlay-results-date-section-v2";
import DailyAuditBanner from "@/components/daily-audit-banner";
import { getLatestDailyAudit, getDailyAuditPolicy } from "@/lib/data-daily-audit";

export const metadata = {
  title: "Suggested parlay results · GameTime Picks",
  description:
    "Every saved model slip is graded after games finish. Pending slips are excluded from hit rate.",
};

export default function ResultsPage() {
  const summary = getOptimizerSummary();
  // PR #117: small honest banner above the lifetime summary, only
  // rendered when an audit JSON has been generated for at least one
  // settled slate. Never fabricates a row.
  const latestAudit = getLatestDailyAudit();
  // PR #118: confirming-days policy. Banner shows a single status
  // line when the file exists; renders nothing otherwise. Never moves
  // the model on its own — that's the next PR.
  const auditPolicy = getDailyAuditPolicy();
  const dates = getOptimizerGradedDates();
  const calibrationTable = loadCalibrationTable();

  // For each date, load the graded payload and prepare display slips.
  const dateSections = dates.map((date) => {
    const payload = getOptimizerGradedForDate(date);
    if (!payload) return { date, slips: [], totals: null };
    const unique = payload.uniqueSlips ?? [];
    const sorted = sortGradedSlipsForDisplay(unique);
    // Convert each OptimizerSlip → ParlaySlip for the ticket card.
    //
    // PR #111: the graded payload ships with `riskProfile: null` on
    // every uniqueSlip — the lane is encoded in the slipId
    // (`opt_<date>_<lane>_<hash>`). The V2 results section sub-groups
    // missed slips by lane, so we derive `riskProfile` from the slipId
    // here. Falls back to the value already on the slip when present.
    const deriveLane = (s: { slipId?: string; riskProfile?: unknown }) => {
      if (s.riskProfile && typeof s.riskProfile === "string") {
        return s.riskProfile;
      }
      const id = s.slipId ?? "";
      const m = id.match(/^opt_\d{4}-\d{2}-\d{2}_([a-z_]+?)(?:_[a-f0-9]{6,}|_(?:nba|mlb|multi|all)_)/);
      if (m) {
        const lane = m[1].replace(/_(?:nba|mlb|multi|all)$/, "");
        if (lane === "conservative" || lane === "balanced" || lane === "aggressive" || lane === "star_power") {
          return lane;
        }
      }
      return null;
    };
    const displaySlips = sorted.map((s) => {
      const ps = optimizerSlipToParlaySlip(s, date);
      return {
        ...ps,
        riskProfile: (deriveLane(s) ?? ps.riskProfile) as typeof ps.riskProfile,
        status: ((s as unknown as { status?: string }).status ?? "pending") as
          | "pending"
          | "win"
          | "loss"
          | "push"
          | "void",
      };
    });
    const totals = {
      wins: unique.filter((s) => (s as unknown as { status?: string }).status === "win").length,
      losses: unique.filter((s) => (s as unknown as { status?: string }).status === "loss").length,
      pushes: unique.filter((s) => (s as unknown as { status?: string }).status === "push").length,
      pending: unique.filter((s) => (s as unknown as { status?: string }).status === "pending").length,
    };
    return { date, slips: displaySlips, totals };
  });

  return (
    // PR `feature/professional-design-system` (2026-05-28) — reverted
    // the .gtp-canvas wrapper. The hybrid cream surface looked
    // washed out next to the dark shell; the refined-dark theme
    // reads better for dense parlay data. Cards inherit
    // `--gtp-card-dark` for elevated charcoal.
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-10 overflow-x-hidden">
      <header className="flex flex-col gap-2.5 max-w-3xl">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          // PR #5 — eyebrow uses text-mute (deeper slate on canvas =
          // ~6.4:1) instead of gold (~3.7:1 on cream) so it clears
          // AA. Same change applied to the fresh-era card eyebrow
          // and the empty-state eyebrow below.
          style={{ color: "var(--vault-text-mute)", fontSize: 12, lineHeight: 1.2 }}
        >
          Tracked · suggested parlays
        </span>
        <h1
          className="font-display tracking-tight"
          style={{
            color: "var(--vault-text)",
            fontSize: "clamp(28px, 6vw, 44px)",
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            fontWeight: 600,
          }}
        >
          Suggested parlay results.
        </h1>
        <p
          className="text-[14px] sm:text-[15px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)", maxWidth: 680 }}
        >
          Public parlay tracking starts {PUBLIC_PARLAY_RESULTS_START_DATE}.
          Every saved model slip is graded after games finish. Pending
          slips are excluded from the hit rate. Pushes do not count toward
          wins or losses.
        </p>
      </header>

      <div className="mt-6">
        <FreshEraStatusBlock hasAnyDateSection={dateSections.length > 0} />
      </div>

      {latestAudit && (
        <div className="mt-4">
          <DailyAuditBanner audit={latestAudit} policy={auditPolicy} />
        </div>
      )}

      <div className="mt-6">
        <ParlayResultsSummary summary={summary} />
      </div>

      <div className="mt-8 flex flex-col gap-6">
        {dateSections.length === 0 ? (
          <EmptyState />
        ) : (
          dateSections.map((section) => (
            <ParlayResultsDateSectionV2
              key={section.date}
              date={section.date}
              slips={section.slips}
              totals={section.totals}
              calibrationTable={calibrationTable}
            />
          ))
        )}
      </div>

      <section
        className="mt-10 rounded-[8px] p-4"
        style={{
          background: "var(--gtp-card)",
          border: "1px solid var(--vault-rule)",
        }}
        aria-label="Projection-level audit pointer"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span
              className="font-mono uppercase tracking-[0.16em]"
              style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
            >
              Want projection-level accuracy?
            </span>
            <span
              className="font-display"
              style={{ color: "var(--vault-text)", fontSize: 15, lineHeight: 1.3 }}
            >
              Per-prop hit rate on every settled lean is on the legacy
              audit pages.
            </span>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link
              href="/results/nba"
              className="font-mono uppercase tracking-[0.12em] px-3.5 py-2 rounded-full"
              style={{
                color: "var(--vault-gold-bright)",
                border: "1px solid var(--vault-gold-bright)",
                fontSize: 12,
                lineHeight: 1.1,
              }}
            >
              NBA audit →
            </Link>
            <Link
              href="/results/mlb"
              className="font-mono uppercase tracking-[0.12em] px-3.5 py-2 rounded-full"
              style={{
                color: "var(--vault-gold-bright)",
                border: "1px solid var(--vault-gold-bright)",
                fontSize: 12,
                lineHeight: 1.1,
              }}
            >
              MLB audit →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Fresh-era status block. Replaces the prior DateStatusHeader at the
 * top of /results so the page no longer surfaces the pre-era settled
 * slate as if it were tracked public history. Compact, honest, and
 * adapts copy based on whether any post-era date has been graded.
 */
function FreshEraStatusBlock({ hasAnyDateSection }: { hasAnyDateSection: boolean }) {
  return (
    // PR #5 — fresh-era card: bumped eyebrow + chip typography out of
    // the 10px floor, lifted padding for a more prominent state.
    <section
      aria-label="Public parlay tracking era"
      className="rounded-[10px] p-5 sm:p-6 flex flex-col gap-2.5"
      style={{
        background: "var(--gtp-card)",
        border: "1px solid var(--gtp-card-border)",
        boxShadow: "var(--gtp-card-shadow)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <span
            className="font-mono uppercase tracking-[0.16em]"
            style={{ color: "var(--vault-text-mute)", fontSize: 12, lineHeight: 1.2 }}
          >
            Public parlay tracking era
          </span>
          <span
            className="font-display tracking-tight"
            style={{
              color: "var(--vault-text)",
              fontSize: "clamp(20px, 3.5vw, 26px)",
              fontWeight: 600,
              lineHeight: 1.15,
            }}
          >
            Fresh tracking era · starts {PUBLIC_PARLAY_RESULTS_START_DATE}
          </span>
        </div>
        <span
          className="font-mono uppercase tracking-[0.12em] px-3 py-1.5 rounded-full shrink-0"
          style={{
            color: "var(--vault-success)",
            border: "1px solid var(--vault-success)",
            background: "var(--vault-success-dim)",
            fontSize: 11,
            lineHeight: 1.1,
          }}
        >
          New era
        </span>
      </div>
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 680 }}
      >
        {hasAnyDateSection
          ? `Tracking suggested parlays publicly from ${PUBLIC_PARLAY_RESULTS_START_DATE} forward. Older slips are excluded from the official public hit rate.`
          : `Today's suggested slips are live and will appear here after settlement. Older slips are excluded from the official public hit rate.`}
      </p>
    </section>
  );
}

function EmptyState() {
  return (
    <section
      className="rounded-[10px] p-6 flex flex-col gap-3"
      style={{
        background: "var(--gtp-card)",
        border: "1px dashed var(--gtp-card-border-strong)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-text-mute)", fontSize: 12, lineHeight: 1.2 }}
      >
        No settled public parlay results yet
      </span>
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 600 }}
      >
        Public parlay tracking starts {PUBLIC_PARLAY_RESULTS_START_DATE}.
        As soon as a slate from this era finishes and the grader runs,
        results will appear here.
      </p>
    </section>
  );
}

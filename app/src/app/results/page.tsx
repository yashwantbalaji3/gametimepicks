/**
 * /results — parlay-first track record.
 *
 * The product centers on suggested parlays. This page answers the
 * single question that matters: did the model-suggested parlays hit?
 *
 * Layout:
 *   1. Hero + subcopy
 *   2. Summary tiles (lifetime, by profile, by sport)
 *   3. Date sections (newest first) with every graded slip
 *   4. Pointer to the projection-level audit (secondary)
 *
 * Honesty contract:
 *   - Hit rates only count decisive slips (win + loss).
 *   - Pushes excluded from denominator.
 *   - Pending slips excluded from denominator.
 *   - Empty pool → empty state. Never fabricates a slip.
 */
import Link from "next/link";

import {
  getOptimizerSummary,
  getOptimizerGradedDates,
  getOptimizerGradedForDate,
  sortGradedSlipsForDisplay,
} from "@/lib/parlay-results";
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
    <div className="vault-page-shell px-4 sm:px-8 py-10 md:py-14 overflow-x-hidden">
      <header className="flex flex-col gap-2 max-w-3xl">
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)", fontSize: 11 }}
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
          style={{ color: "var(--vault-text-mute)", maxWidth: 640 }}
        >
          Every saved model slip is graded after games finish. Pending
          slips are excluded from the hit rate. Pushes do not count toward
          wins or losses.
        </p>
      </header>

      {latestAudit && (
        <div className="mt-6">
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
          background: "rgba(7,11,26,0.4)",
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
              style={{ color: "var(--vault-text)", fontSize: 14 }}
            >
              Per-prop hit rate on every settled lean is on the legacy
              audit pages.
            </span>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link
              href="/results/nba"
              className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-full"
              style={{
                color: "var(--vault-gold-bright)",
                border: "1px solid var(--vault-gold-bright)",
                fontSize: 10,
              }}
            >
              NBA audit →
            </Link>
            <Link
              href="/results/mlb"
              className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-full"
              style={{
                color: "var(--vault-gold-bright)",
                border: "1px solid var(--vault-gold-bright)",
                fontSize: 10,
              }}
            >
              MLB audit →
            </Link>
            <Link
              href="/results/parlays"
              className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-full"
              style={{
                color: "var(--vault-text-mute)",
                border: "1px solid var(--vault-rule)",
                fontSize: 10,
              }}
            >
              Legacy parlay history
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function EmptyState() {
  return (
    <section
      className="rounded-[8px] p-6 flex flex-col gap-3"
      style={{
        background: "rgba(7,11,26,0.55)",
        border: "1px dashed var(--vault-border)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-gold)", fontSize: 11 }}
      >
        No tracked slips yet
      </span>
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 560 }}
      >
        We only count slips that were saved before games started and
        graded after settlement. As soon as tonight&apos;s slate finishes
        and the grader runs, results will appear here.
      </p>
    </section>
  );
}

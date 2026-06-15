import Link from "next/link";

import NeonCornerBracket from "@/components/neon-corner-bracket";
import ResultsSportTabs from "@/components/results-sport-tabs";
import ParlayTicketCard from "@/components/parlay-ticket-card";
import {
  getAvailableSnapshotDates,
  getAvailableGradedDates,
  getGradedForDate,
  getParlaySummary,
  getSnapshotForDate,
} from "@/lib/data-parlays";

export const metadata = {
  title: "Saved slip history · GameTime Picks",
  description:
    "Candidate parlay slips saved before games and graded after settlement. Educational analytics — not betting advice.",
};

/**
 * /results/parlays — honest saved-slip history.
 *
 *   - If at least one date has been graded, show the lifetime summary
 *     (computed by `pipeline.grade_parlays`) plus a slip-by-slip
 *     breakdown from the most recent graded date.
 *   - If a snapshot exists but hasn't been graded yet, show its
 *     candidate slips with status "pending final stats."
 *   - If neither exists, render a clean empty state. We do NOT claim
 *     any parlay hit rate, ever, until persisted slips have been
 *     graded from real postgame stats.
 *
 * Pushes excluded from the slip-level hit rate (mirrors the player
 * audit policy). Pending slips never count as losses.
 */
export default function ResultsParlaysPage() {
  const summary = getParlaySummary();
  const gradedDates = getAvailableGradedDates();
  const snapshotDates = getAvailableSnapshotDates();
  const latestGradedDate = gradedDates[0] ?? null;
  const latestSnapshotDate = snapshotDates[0] ?? null;
  const latestGraded = latestGradedDate ? getGradedForDate(latestGradedDate) : null;
  const pendingSnapshot =
    latestSnapshotDate && latestSnapshotDate !== latestGradedDate
      ? getSnapshotForDate(latestSnapshotDate)
      : null;

  const lifetime = summary?.lifetime;
  const hasGradedHistory =
    !!lifetime && (lifetime.decisive ?? 0) > 0 && lifetime.hitRate !== null;

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-8 sm:py-12">
      <section className="reveal vault-data-orbit neon-corner-bracket gtp-line-scan relative overflow-hidden -mx-4 sm:-mx-6 px-4 sm:px-6 pt-6 pb-4">
        <NeonCornerBracket />
        <div className="flex items-center gap-2 mb-3">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{
              background: hasGradedHistory
                ? "var(--vault-gold-bright)"
                : "var(--vault-text-faint)",
              boxShadow: hasGradedHistory
                ? "0 0 8px rgba(242, 54, 69, 0.5)"
                : "none",
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)", fontSize: 10 }}
          >
            Saved slip history · slips saved before games · graded after settlement
          </span>
        </div>

        {hasGradedHistory ? (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <h1
              className="font-display font-semibold tracking-tightest leading-[0.95]"
              style={{
                color: "var(--vault-gold-bright)",
                fontSize: "clamp(48px, 10vw, 96px)",
                textShadow:
                  "0 0 24px rgba(242, 54, 69, 0.45), 0 0 8px rgba(242, 54, 69, 0.55)",
              }}
            >
              {((lifetime!.hitRate as number) * 100).toFixed(1)}%
            </h1>
            <span
              className="font-display tracking-tight"
              style={{
                color: "var(--vault-text)",
                fontSize: "clamp(18px, 2.6vw, 22px)",
              }}
            >
              Saved-slip hit rate · {lifetime!.wins}–{lifetime!.losses}
              {lifetime!.pushes > 0 ? `–${lifetime!.pushes}P` : ""} on{" "}
              <span style={{ color: "var(--vault-gold-bright)" }}>
                {lifetime!.decisive}
              </span>{" "}
              graded slips
            </span>
          </div>
        ) : (
          <h1
            className="font-display font-semibold tracking-tightest leading-tight"
            style={{
              color: "var(--vault-text)",
              fontSize: "clamp(40px, 7vw, 64px)",
            }}
          >
            Saved slip history starts here.
          </h1>
        )}

        <p
          className="mt-4 text-[14px] leading-relaxed max-w-2xl"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {hasGradedHistory ? (
            <>
              Every slip above was saved <strong>before games started</strong>{" "}
              and graded against real final box scores. Pushes excluded from
              the denominator; pending slips never count as losses.
              Educational analytics — not betting advice.
            </>
          ) : (
            <>
              We only track parlay candidates that were saved <strong>before</strong>{" "}
              the first game tipped off — never after. Until at least one
              snapshot is graded, this page intentionally shows no hit rate.
              History starts the day the first saved snapshot settles.
            </>
          )}
        </p>
      </section>

      <ResultsSportTabs activeSport="overview" nbaHasData mlbHasData />

      {/* If a snapshot exists for today/yesterday but it hasn't been
          graded yet, surface it. */}
      {pendingSnapshot && (
        <section
          className="mt-8 rounded-[6px] px-4 py-4"
          style={{
            background: "rgba(26, 16, 11, 0.45)",
            border: "1px solid var(--vault-border)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: "var(--vault-warn)",
                boxShadow: "0 0 6px rgba(242, 54, 69, 0.55)",
              }}
            />
            <span
              className="font-mono uppercase tracking-[0.18em]"
              style={{ color: "var(--vault-warn)", fontSize: 10 }}
            >
              Saved before games · awaiting final stats
            </span>
          </div>
          <h2
            className="font-display font-semibold tracking-tight"
            style={{ color: "var(--vault-text)", fontSize: 22, lineHeight: 1.2 }}
          >
            {pendingSnapshot.date} · {pendingSnapshot.slipsCount} candidate slip
            {pendingSnapshot.slipsCount === 1 ? "" : "s"}
          </h2>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingSnapshot.slips.slice(0, 6).map((slip) => (
              <ParlayTicketCard
                key={slip.slipId}
                slip={slip}
                savedPregame
              />
            ))}
          </div>
        </section>
      )}

      {/* Latest graded slate — slip-by-slip breakdown */}
      {latestGraded && (
        <section className="mt-10">
          <div className="flex items-center gap-3 mb-4">
            <span
              className="font-mono text-[10px] uppercase tracking-[0.18em] shrink-0"
              style={{ color: "var(--vault-gold)" }}
            >
              {latestGraded.date} · latest graded slate
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--vault-rule)" }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {latestGraded.slips.map((slip) => (
              <ParlayTicketCard key={slip.slipId} slip={slip} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state — no snapshots at all */}
      {!pendingSnapshot && !latestGraded && (
        <section
          className="mt-10 rounded-[8px] px-5 py-5"
          style={{
            background: "rgba(26, 16, 11,0.55)",
            border: "1px solid var(--vault-border)",
          }}
        >
          <div
            className="font-mono uppercase tracking-[0.16em]"
            style={{ color: "var(--vault-gold)", fontSize: 10 }}
          >
            No saved slips yet
          </div>
          <p
            className="mt-2 text-[13.5px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)" }}
          >
            Your first saved-slip results will appear here after the next
            snapshot is captured before tipoff and graded after final box
            scores land. We refuse to backfill historical slips.
          </p>
          <Link
            href="/parlay-lab"
            className="mt-4 inline-flex font-mono uppercase tracking-[0.16em]"
            style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
          >
            Open Parlay Lab →
          </Link>
        </section>
      )}

      {/* By-date list once enough graded dates exist */}
      {summary && summary.byDate.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center gap-3 mb-4">
            <span
              className="font-mono text-[10px] uppercase tracking-[0.18em] shrink-0"
              style={{ color: "var(--vault-gold)" }}
            >
              By date · {summary.byDate.length} slate
              {summary.byDate.length === 1 ? "" : "s"} saved
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--vault-rule)" }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {summary.byDate.map((d) => (
              <div
                key={d.date}
                className="rounded-[5px] px-3 py-2.5"
                style={{
                  background: "rgba(26, 16, 11,0.55)",
                  border: "1px solid var(--vault-border)",
                }}
              >
                <div
                  className="font-mono uppercase tracking-[0.16em]"
                  style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
                >
                  {d.date.slice(5)}
                </div>
                <div
                  className="mt-1 font-display tabular tracking-tight"
                  style={{ color: "var(--vault-text)", fontSize: 16 }}
                >
                  {d.wins}–{d.losses}
                  {d.pushes > 0 ? `–${d.pushes}P` : ""}
                </div>
                {d.pending > 0 && (
                  <div
                    className="font-mono"
                    style={{ color: "var(--vault-warn)", fontSize: 10 }}
                  >
                    {d.pending} pending
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <footer
        className="mt-12 pt-6 text-center font-mono text-[10px] tracking-[0.18em] uppercase"
        style={{
          color: "var(--vault-text-faint)",
          borderTop: "1px solid var(--vault-rule)",
        }}
      >
        slips saved before games only · pushes excluded · pending excluded · educational use only
      </footer>
    </div>
  );
}

// Slip + leg rendering is now centralized in
// app/src/components/parlay-ticket-card.tsx (PR C — sportsbook-receipt
// styling shared by /parlay-lab and /results/parlays).

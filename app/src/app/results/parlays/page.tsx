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
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/results/parlays/", {
  title: "Saved slip history · GameTime Picks",
  description:
    "Candidate parlay slips saved before games and graded after settlement. Educational analytics — not betting advice.",
});

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
  /* Overnight 10-28 (W5): the hero led with the lifetime rate as the H1 ("17.7%") beside a "Settled · Oct 15" chip,
     while the newest graded slate was Sep 22 — a closed history reading as a live number. The page is now named by
     what it is; the rate follows with its sports, its date span, its slate count and its last graded slate. */
  const slateDates = (summary?.byDate ?? []).map((d) => d.date).sort();
  const firstSlate = slateDates[0] ?? null;
  const lastSlate = slateDates.at(-1) ?? null;
  const SPORT_NAME: Record<string, string> = { mlb: "MLB", nba: "NBA", nfl: "NFL", epl: "Premier League", ufc: "UFC", multi: "mixed-sport" };
  const sports = hasGradedHistory
    ? [...new Set(gradedDates.flatMap((d) => getGradedForDate(d)?.sportsIncluded ?? []))].map((x) => SPORT_NAME[x] ?? x)
    : [];

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
                ? "0 0 8px color-mix(in srgb, var(--vault-accent) 50%, transparent)"
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

        <h1
          className="font-display font-semibold tracking-tight leading-tight m-0"
          style={{
            color: "var(--vault-text)",
            fontSize: hasGradedHistory ? "clamp(28px, 4.6vw, 40px)" : "clamp(40px, 7vw, 64px)",
          }}
        >
          {hasGradedHistory ? "Saved slip history" : "Saved slip history starts here."}
        </h1>

        {hasGradedHistory ? (
          <div className="mt-3 flex flex-col gap-1" data-parlays-scope>
            <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
              {sports.length ? `${new Intl.ListFormat("en", { type: "conjunction" }).format(sports)} slips · ` : ""}
              {firstSlate && lastSlate ? `${firstSlate} → ${lastSlate} · ` : ""}
              {slateDates.length} slate{slateDates.length === 1 ? "" : "s"}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-display font-semibold" style={{ color: "var(--vault-gold-bright)", fontSize: "clamp(28px, 5vw, 40px)" }}>
                {((lifetime!.hitRate as number) * 100).toFixed(1)}%
              </span>
              <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(15px, 2.2vw, 18px)" }}>
                of {lifetime!.decisive.toLocaleString("en-US")} graded slips · {lifetime!.wins.toLocaleString("en-US")}–{lifetime!.losses.toLocaleString("en-US")}
                {lifetime!.pushes > 0 ? `–${lifetime!.pushes}P` : ""}
              </span>
            </div>
            {latestGradedDate ? (
              <span className="text-[13px]" style={{ color: "var(--vault-warn)" }} data-parlays-last-graded>
                Last graded slate: {latestGradedDate}.{" "}
                {pendingSnapshot
                  ? `A newer saved slate (${pendingSnapshot.date}) is awaiting final stats and is not counted.`
                  : "No newer saved slip has been graded, so this is a closed history, not a live record."}
              </span>
            ) : null}
          </div>
        ) : null}

        <p
          className="mt-4 text-[14px] leading-relaxed max-w-2xl"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {hasGradedHistory ? (
            <>
              Every slip here was saved <strong>before games started</strong>{" "}
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
            background: "color-mix(in srgb, var(--vault-scrim-base) 45%, transparent)",
            border: "1px solid var(--vault-border)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: "var(--vault-warn)",
                boxShadow: "0 0 6px color-mix(in srgb, var(--vault-accent) 55%, transparent)",
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
            background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
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
            href="/build#suggested-cards"
            className="mt-4 inline-flex font-mono uppercase tracking-[0.16em]"
            style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
          >
            Open Parlay Center →
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
                  background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
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

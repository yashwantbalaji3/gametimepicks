import Link from "next/link";
import {
  getMlbAvailableScheduleDates,
  getMlbBoardForDate,
} from "@/lib/data-mlb";
import MlbBoardBody from "@/components/mlb/mlb-board-body";
import MlbSectionTabs from "@/components/mlb/mlb-section-tabs";

/**
 * Generate static params for every MLB date that has data on disk
 * (board OR schedule). Required for static export — Next.js must
 * pre-render each /mlb/board/<date> route at build time.
 */
export function generateStaticParams() {
  // Union of schedule dates + on-disk board dates so a date that has
  // a schedule but no board file still resolves (renders schedule-only).
  const sched = new Set(getMlbAvailableScheduleDates());
  return Array.from(sched).map((date) => ({ date }));
}

export function generateMetadata({ params }: { params: { date: string } }) {
  return {
    title: `MLB board · ${params.date} · GameTime Picks`,
    description: `MLB player-prop board for ${params.date}. Educational analytics.`,
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function MlbBoardForDatePage({
  params,
}: {
  params: { date: string };
}) {
  const date = params.date;

  // Defensive: validate shape. The static-params list above already
  // limits this in production, but keep the runtime fallback honest.
  if (!ISO_DATE.test(date)) {
    return <DateNotFound date={date} />;
  }

  const board = getMlbBoardForDate(date);
  // The getMlbBoardForDate loader returns an empty shell when no
  // file exists. Distinguish that from a real (schedule-only or live)
  // record by checking whether the schedule lookup yields anything OR
  // whether the empty shell has its sentinel scheduleSource value.
  const hasAnyData =
    (board.games?.length ?? 0) > 0 ||
    (board.leans?.length ?? 0) > 0 ||
    board.scheduleSource !== "unavailable";

  if (!hasAnyData) {
    return <DateNotFound date={date} />;
  }

  return <MlbBoardBody date={date} />;
}

function DateNotFound({ date }: { date: string }) {
  const dates = getMlbAvailableScheduleDates();
  const nearest =
    dates.find((d) => d >= date) ?? dates[dates.length - 1] ?? null;
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <MlbSectionTabs />
      </div>
      <section className="reveal">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-warn)", fontSize: 11 }}
        >
          MLB board · date unavailable
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          No MLB data for {date}.
        </h1>
        <p
          className="mt-3 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          The MLB schedule and board files for this date are not on disk.
          The next refresh will pull the rolling window when the slate posts.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/mlb/board"
            className="vault-glow-hover rounded-[3px]"
            style={{
              padding: "10px 14px",
              border: "1px solid rgba(212, 175, 55, 0.30)",
              background: "rgba(212, 175, 55, 0.06)",
              color: "var(--vault-gold-bright)",
              textDecoration: "none",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Latest available slate →
          </Link>
          {nearest && nearest !== date && (
            <Link
              href={`/mlb/board/${nearest}`}
              className="vault-glow-hover rounded-[3px]"
              style={{
                padding: "10px 14px",
                border: "1px solid var(--vault-border)",
                background: "rgba(7, 11, 26, 0.45)",
                color: "var(--vault-text-mute)",
                textDecoration: "none",
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Nearest date · {nearest} →
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

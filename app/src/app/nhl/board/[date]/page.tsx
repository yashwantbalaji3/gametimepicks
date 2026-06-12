import Link from "next/link";
import {
  getAvailableNhlScheduleDates,
  getNhlScheduleForDate,
} from "@/lib/data-nhl";
import NhlBoardBody from "@/components/nhl/nhl-board-body";
import NhlSectionTabs from "@/components/nhl/nhl-section-tabs";

export function generateStaticParams() {
  return getAvailableNhlScheduleDates().map((date) => ({ date }));
}

export function generateMetadata({ params }: { params: { date: string } }) {
  return {
    title: `NHL Model Board · ${params.date} · GameTime Picks`,
    description: `NHL slate for ${params.date}. Schedule loaded; lines pending.`,
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function NhlBoardForDatePage({
  params,
}: {
  params: { date: string };
}) {
  const date = params.date;
  if (!ISO_DATE.test(date)) return <DateNotFound date={date} />;

  const schedule = getNhlScheduleForDate(date);
  if (schedule.scheduleSource === "unavailable") {
    return <DateNotFound date={date} />;
  }
  return <NhlBoardBody date={date} />;
}

function DateNotFound({ date }: { date: string }) {
  const dates = getAvailableNhlScheduleDates();
  const nearest =
    dates.find((d) => d >= date) ?? dates[dates.length - 1] ?? null;
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <NhlSectionTabs />
      </div>
      <section className="reveal">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-warn)", fontSize: 11 }}
        >
          NHL board · date unavailable
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          No NHL data for {date}.
        </h1>
        <p
          className="mt-3 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          The NHL schedule for this date is not on disk. The next refresh
          will pull the rolling window when the slate posts.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/nhl/board"
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
              href={`/nhl/board/${nearest}`}
              className="vault-glow-hover rounded-[3px]"
              style={{
                padding: "10px 14px",
                border: "1px solid var(--vault-border)",
                background: "rgba(26, 16, 11, 0.45)",
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

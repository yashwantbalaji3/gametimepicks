import Link from "next/link";
import NhlSectionTabs from "@/components/nhl/nhl-section-tabs";
import { activeNhlDate, getNhlScheduleForDate } from "@/lib/data-nhl";

export const metadata = {
  title: "NHL Model Board · GameTime Picks",
  description:
    "NHL player-prop model board — pending paid odds + per-player log wiring.",
};

const DEFAULT_DATE = "2026-05-18";

export default function NhlBoardPage() {
  const date = activeNhlDate() ?? DEFAULT_DATE;
  const schedule = getNhlScheduleForDate(date);
  const games = schedule.games ?? [];

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
          NHL Model Board · warming up
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          NHL projections land here once odds + logs are wired.
        </h1>
        <p
          className="mt-3 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Schedule is live from the free NHL public API. The model
          board itself is pending paid Odds API coverage of NHL player
          markets (shots on goal, points, goalie saves) and ingestion
          of recent skater + goalie game logs from the same free NHL
          API. We will not surface NHL projections before the data
          supports them.
        </p>
      </section>

      <section className="mt-8 gtp-aurora-halo">
        <div className="gtp-status-board p-5 sm:p-6" style={{ borderRadius: 8 }}>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block w-2 h-2 rounded-full"
              style={{
                background: "var(--vault-warn)",
                boxShadow: "0 0 10px rgba(212, 175, 55, 0.5)",
              }}
            />
            <span
              className="font-mono uppercase tracking-[0.16em]"
              style={{ color: "var(--vault-warn)", fontSize: 10 }}
            >
              warming up · pending
            </span>
          </div>
          <h2
            className="mt-3 font-display font-semibold tracking-tight"
            style={{ color: "var(--vault-text)", fontSize: 20, lineHeight: 1.15 }}
          >
            NHL Model Board · {date}
          </h2>

          <div className="mt-5">
            <div
              className="font-mono uppercase tracking-[0.14em] mb-2"
              style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
            >
              Planned MVP markets
            </div>
            <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
              {[
                "shots on goal · stable",
                "goalie saves · stable",
                "points · moderate variance",
                "assists · moderate variance",
                "goals · routed to Power Board",
              ].map((it) => (
                <li
                  key={it}
                  className="gtp-source-chip"
                  style={{ color: "var(--vault-text-mute)" }}
                >
                  {it}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6">
            <div
              className="font-mono uppercase tracking-[0.14em] mb-2"
              style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
            >
              Schedule loaded · {games.length}{" "}
              {games.length === 1 ? "game" : "games"}
            </div>
            {games.length === 0 ? (
              <div
                className="rounded-[6px] px-4 py-4 text-[12px]"
                style={{
                  background: "rgba(7, 11, 26, 0.5)",
                  border: "1px solid var(--vault-border)",
                  color: "var(--vault-text-mute)",
                }}
              >
                No NHL games on the active date.
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
                {games.map((g) => (
                  <li
                    key={String(g.gameId)}
                    className="text-[12px] font-mono"
                    style={{ color: "var(--vault-text-mute)" }}
                  >
                    {g.awayTeamAbbr ?? "?"} @ {g.homeTeamAbbr ?? "?"}{" "}
                    <span style={{ color: "var(--vault-text-faint)" }}>
                      · {g.gameDate ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section
        className="mt-8 text-[12px]"
        style={{ color: "var(--vault-text-faint)" }}
      >
        <Link href="/nhl" style={{ color: "var(--vault-gold-bright)" }}>
          ← back to NHL overview
        </Link>
      </section>
    </div>
  );
}

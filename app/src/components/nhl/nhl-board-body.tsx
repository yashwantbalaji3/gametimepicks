import Link from "next/link";
import NhlSectionTabs from "@/components/nhl/nhl-section-tabs";
import { getNhlScheduleForDate } from "@/lib/data-nhl";

/**
 * Shared NHL Board body used by:
 *   - /nhl/board                  (active date)
 *   - /nhl/board/<YYYY-MM-DD>     (date deep-link)
 *
 * Renders honestly:
 *   - games > 0 → schedule + "lines pending" framing.
 *   - games === 0 → off-day shell.
 *   - never invents projections (no paid odds wired yet).
 */
function formatTipoffEt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    });
  } catch {
    return "—";
  }
}

export default function NhlBoardBody({ date }: { date: string }) {
  const schedule = getNhlScheduleForDate(date);
  const games = schedule.games ?? [];
  const hasGames = games.length > 0;
  const scheduleLoaded = schedule.scheduleSource !== "unavailable";

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
          NHL Model Board · {date}
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          {hasGames
            ? "Lines pending · projections coming soon."
            : "Off-day — no NHL games scheduled."}
        </h1>
        <p
          className="mt-3 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Schedule is live from the free NHL public API. The model board
          itself is pending paid Odds API coverage of NHL player markets
          (shots on goal, points, goalie saves) and ingestion of recent
          skater + goalie game logs. We will not surface NHL projections
          before the data supports them.
        </p>
      </section>

      <section className="mt-8 gtp-aurora-halo">
        <div
          className="gtp-status-board p-5 sm:p-6"
          style={{ borderRadius: 8 }}
        >
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
              {hasGames ? "warming up · pending" : "off-day"}
            </span>
          </div>
          <h2
            className="mt-3 font-display font-semibold tracking-tight"
            style={{ color: "var(--vault-text)", fontSize: 20, lineHeight: 1.15 }}
          >
            NHL slate · {date}
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
            {!scheduleLoaded ? (
              <div
                className="rounded-[6px] px-4 py-4 text-[12px]"
                style={{
                  background: "rgba(7, 11, 26, 0.5)",
                  border: "1px solid var(--vault-border)",
                  color: "var(--vault-text-mute)",
                }}
              >
                Schedule file for this date is not on disk. Try the{" "}
                <Link href="/nhl" style={{ color: "var(--vault-gold-bright)" }}>
                  NHL overview
                </Link>{" "}
                for the next available slate.
              </div>
            ) : games.length === 0 ? (
              <div
                className="rounded-[6px] px-4 py-4 text-[12px]"
                style={{
                  background: "rgba(7, 11, 26, 0.5)",
                  border: "1px solid var(--vault-border)",
                  color: "var(--vault-text-mute)",
                }}
              >
                No NHL games on this date.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {games.map((g) => (
                  <div
                    key={String(g.gameId)}
                    className="flex items-center justify-between gap-3 rounded-[3px]"
                    style={{
                      padding: "10px 14px",
                      border: "1px solid var(--vault-border)",
                      background: "rgba(7, 11, 26, 0.45)",
                    }}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span
                        style={{
                          color: "var(--vault-text)",
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {g.awayTeamAbbr ?? "?"} @ {g.homeTeamAbbr ?? "?"}
                      </span>
                      <span
                        style={{
                          color: "var(--vault-text-faint)",
                          fontSize: 11,
                        }}
                      >
                        {g.gameType === 3 ? "Playoffs" : "Regular season"}
                        {g.venue ? ` · ${g.venue}` : ""}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span
                        className="font-mono"
                        style={{ color: "var(--vault-gold-bright)", fontSize: 12 }}
                      >
                        {formatTipoffEt(g.gameDate)}
                      </span>
                      <span
                        className="font-mono uppercase tracking-[0.14em]"
                        style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
                      >
                        lines pending
                      </span>
                    </div>
                  </div>
                ))}
              </div>
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

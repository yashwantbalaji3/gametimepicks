import Link from "next/link";
import IplSectionTabs from "@/components/ipl/ipl-section-tabs";
import { getIplScheduleForDate } from "@/lib/data-ipl";

/**
 * Shared IPL Board body used by:
 *   - /ipl/board                  (active date)
 *   - /ipl/board/<YYYY-MM-DD>     (date deep-link)
 *
 * Renders honestly:
 *   - matches > 0 → schedule with "stats provider pending" framing.
 *   - matches === 0 → off-day shell.
 *   - never invents player projections (paid stats provider not yet wired).
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

export default function IplBoardBody({ date }: { date: string }) {
  const schedule = getIplScheduleForDate(date);
  const games = schedule.games ?? [];
  const hasGames = games.length > 0;
  const scheduleLoaded = schedule.scheduleSource !== "unavailable";

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <IplSectionTabs />
      </div>

      <section className="reveal">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-warn)", fontSize: 11 }}
        >
          IPL Model Board · {date}
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          {hasGames
            ? "Lines pending · projections coming soon."
            : "Off-day — no IPL matches scheduled."}
        </h1>
        <p
          className="mt-3 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Schedule is live from the free ESPN public cricket scoreboard.
          ESPN&apos;s free endpoints expose team-level innings but not
          the per-batsman / per-bowler stats we need to project player
          markets. Until a stable per-player source is wired and odds
          API coverage of batter runs / bowler wickets is confirmed, the
          model board stays pending.
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
              {hasGames
                ? "warming up · pending stats provider"
                : "off-day"}
            </span>
          </div>
          <h2
            className="mt-3 font-display font-semibold tracking-tight"
            style={{ color: "var(--vault-text)", fontSize: 20, lineHeight: 1.15 }}
          >
            IPL slate · {date}
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
                "batter runs · stable",
                "bowler wickets · stable",
                "batter fours · moderate variance",
                "batter sixes · routed to Power Board",
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
              {games.length === 1 ? "match" : "matches"}
            </div>
            {!scheduleLoaded ? (
              <div
                className="rounded-[6px] px-4 py-4 text-[12px]"
                style={{
                  background: "rgba(26, 16, 11, 0.5)",
                  border: "1px solid var(--vault-border)",
                  color: "var(--vault-text-mute)",
                }}
              >
                Schedule file for this date is not on disk. Try the{" "}
                <Link href="/ipl" style={{ color: "var(--vault-gold-bright)" }}>
                  IPL overview
                </Link>{" "}
                for the next available slate.
              </div>
            ) : games.length === 0 ? (
              <div
                className="rounded-[6px] px-4 py-4 text-[12px]"
                style={{
                  background: "rgba(26, 16, 11, 0.5)",
                  border: "1px solid var(--vault-border)",
                  color: "var(--vault-text-mute)",
                }}
              >
                No IPL matches on this date.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {games.map((g) => (
                  <div
                    key={String(g.matchId)}
                    className="flex items-center justify-between gap-3 rounded-[3px]"
                    style={{
                      padding: "10px 14px",
                      border: "1px solid var(--vault-border)",
                      background: "rgba(26, 16, 11, 0.45)",
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
                        {g.shortName ??
                          `${g.awayTeamAbbr ?? "?"} v ${g.homeTeamAbbr ?? "?"}`}
                      </span>
                      <span
                        style={{
                          color: "var(--vault-text-faint)",
                          fontSize: 11,
                        }}
                      >
                        {g.venue ?? "IPL"}
                        {g.status ? ` · ${g.status}` : ""}
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
                        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
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
        <Link href="/ipl" style={{ color: "var(--vault-gold-bright)" }}>
          ← back to IPL overview
        </Link>
      </section>
    </div>
  );
}

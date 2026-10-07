/**
 * TODAY'S GAMES — every sport's games on the reader's ET day, as facts (founder T1, 2026-10-07).
 *
 * Presentational only: it renders the `buildTodaysGames` result the page derived from each sport's
 * schedule owner. Two facts sit side by side and never merge: the game exists (time, or a final from
 * the capture), and whether GameTimePicks published a forecast for it. NBA and Ligue 1 games appear
 * even with no forecast.
 *
 * ⚠ STATIC PAGE, SO NO PRESENT-TENSE CLAIMS. The page is built once and read for hours, so a row says
 * only what stays true (`staticStatusText`): its start time, or a capture's Final / Postponed. It never
 * says "Live" or "Started"; the Live hub owns that, on the reader's clock.
 */
import Link from "next/link";
import { staticStatusText, TODAY_SPORTS, TODAY_SPORT_LABEL } from "@/lib/today/todays-games.mjs";

type Row = {
  eventId: string; sport: string; startUtc: string | null; providerStatus?: string | null;
  away?: string | null; home?: string | null; title?: string | null; boutCount?: number | null;
  href: string; hasForecast: boolean; settled?: boolean; forecastText: string; group: string;
};
type Day = { today: string; eventsToday: number; rows: Row[]; unproven: string[] };

const MONO = "var(--font-mono)";
const SOCCER = new Set(["epl", "ligue-1"]);
/* Above this many games a sport's block starts collapsed, so a 13-game NFL Sunday cannot bury the page. */
const OPEN_MAX = 6;

function GameRow({ r }: { r: Row }) {
  const name = r.title
    ? `${r.title}${r.boutCount ? ` · ${r.boutCount} bouts` : ""}`
    : SOCCER.has(r.sport)
      ? `${r.home ?? "TBD"} v ${r.away ?? "TBD"}` // soccer convention: home club first
      : `${r.away ?? "TBD"} @ ${r.home ?? "TBD"}`;
  const status = staticStatusText(r);
  return (
    <li>
      <Link
        href={r.href}
        aria-label={`${name}. ${status}. ${r.forecastText}.`}
        className="vault-glow-hover flex items-center justify-between gap-3 rounded-[10px] px-3 py-2.5"
        style={{ border: "1px solid var(--vault-border)", textDecoration: "none", minHeight: 44 }}
      >
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 13 }}>{name}</span>
          <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{status}</span>
        </span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.06em] whitespace-nowrap"
          style={{
            fontSize: 9,
            color: r.hasForecast ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
            background: r.hasForecast ? "var(--vault-gold-dim)" : "var(--vault-wash)",
          }}
        >
          {r.hasForecast ? "Forecast" : "No forecast"}
        </span>
      </Link>
    </li>
  );
}

export default function TodaysGames({ day }: { day: Day }) {
  const sports = TODAY_SPORTS.filter((s) => day.rows.some((r) => r.sport === s));
  if (sports.length === 0) return null;
  return (
    <section id="todays-games" aria-labelledby="todays-games-h" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id="todays-games-h" style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--vault-text)", margin: 0 }}>
          Today&apos;s games
        </h2>
        <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)" }}>
          {day.eventsToday} game{day.eventsToday === 1 ? "" : "s"} · times in ET · NFL and MLB live scores on <Link href="/live/" style={{ color: "var(--vault-gold)" }}>Live</Link>
        </span>
      </div>
      {sports.map((s) => {
        const rows = day.rows.filter((r) => r.sport === s);
        const label = (TODAY_SPORT_LABEL as Record<string, string>)[s] ?? s.toUpperCase();
        return (
          <details key={s} open={rows.length <= OPEN_MAX} className="flex flex-col gap-2">
            <summary style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--vault-text-mute)", cursor: "pointer", minHeight: 32 }}>
              {label} · {rows.length}
            </summary>
            <ul className="grid gap-2 mt-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", listStyle: "none", padding: 0, margin: 0 }}>
              {rows.map((r) => <GameRow key={r.eventId} r={r} />)}
            </ul>
          </details>
        );
      })}
      {day.unproven.length > 0 ? (
        <p style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", margin: 0 }}>
          {day.unproven.map((s) => (TODAY_SPORT_LABEL as Record<string, string>)[s] ?? s).join(", ")}: games appear here once the matchday is published.
        </p>
      ) : null}
    </section>
  );
}

/**
 * TodayGames — the lead of /today (W4 · 2026-10-28): every game TODAY, once, in three plain groups — started, upcoming,
 * final — each row linking to its game page with its official forecast or the honest state of it.
 *
 * Presentation only. The rows are the cross-sport games table's own rows (components/games-experience-table-rows.ts,
 * built from lib/simulate/day-view), so the status and forecast state are exactly what the table and the game pages
 * say; this component never decides a state. A published number is printed verbatim from the row; a game without one
 * says "pending" (and when its sport publishes) or "no official forecast" — never a number made up to fill the space.
 * The row's own note is not printed: several are pipeline notes ("Official scheduled game (MLB StatsAPI) …"); the game
 * page carries the detail.
 */
import Link from "next/link";
import type { ShownRow } from "@/components/games-experience-table-wire";

/** When a sport's official forecast publishes, in the words its own rows use (games-experience-table-rows.ts notes). */
const PUBLISHES: Record<string, string> = {
  nba: "publishes on game day, before tip-off",
  mlb: "publishes on game day, late morning ET",
};
const publishesFor = (sport: string) => PUBLISHES[sport] ?? "publishes before the start";

type Group = { key: string; title: string; rows: ShownRow[] };

/** Groups by the row's own status words: "Scheduled" → upcoming; "Final…" → final; anything else has started. */
export function groupTodayGames(rows: readonly ShownRow[]): Group[] {
  const upcoming = rows.filter((r) => r.status === "Scheduled");
  const final = rows.filter((r) => r.status.startsWith("Final"));
  const started = rows.filter((r) => r.status !== "Scheduled" && !r.status.startsWith("Final"));
  return [
    { key: "started", title: "Started", rows: started },
    { key: "upcoming", title: "Upcoming", rows: upcoming },
    { key: "final", title: "Final today", rows: final },
  ].filter((g) => g.rows.length > 0);
}

/** The forecast cell in plain words — from the row's forecast state and published read only. */
export function forecastText(r: ShownRow): string {
  if (r.forecast === "Published" || r.forecast === "Frozen") {
    const when = r.forecast === "Frozen" ? "frozen" : "can update until the start";
    if (r.read) return `${r.read} · official forecast, ${when}`;
    return r.note && r.sport === "ufc" ? `${r.note.replace(/\.$/, "")} · official forecast` : `Official forecast published · ${when}`;
  }
  if (r.forecast === "Pending") return `Forecast pending · ${publishesFor(r.sport)}`;
  if (r.forecast === "Unavailable") return "No official forecast for this game";
  return String(r.forecast);
}

function Row({ r }: { r: ShownRow }) {
  const has = r.forecast === "Published" || r.forecast === "Frozen";
  return (
    <li className="flex flex-col gap-0.5 py-2" style={{ borderTop: "1px solid var(--vault-rule)" }}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="tabular-nums" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, minWidth: 72 }}>{r.time}</span>
        <span style={{ color: "var(--vault-text-faint)", fontSize: 12 }}>{r.sportLabel}</span>
        <Link href={r.eventHref} className="font-semibold no-underline" style={{ color: "var(--vault-text)", fontSize: 14, minHeight: 44, display: "inline-flex", alignItems: "center" }}>
          {r.matchup} →
        </Link>
        {r.resultHref ? (
          <Link href={r.resultHref} className="no-underline" style={{ color: "var(--vault-success)", fontSize: 12.5, minHeight: 44, display: "inline-flex", alignItems: "center" }}>Result →</Link>
        ) : null}
      </div>
      <span style={{ color: has ? "var(--vault-text)" : "var(--vault-text-mute)", fontSize: 13 }}>{forecastText(r)}</span>
    </li>
  );
}

export default function TodayGames({ rows, dayLabel, asOf, next }: {
  /** Today's rows (ET day), in start order. */
  rows: ShownRow[];
  /** e.g. "Wednesday, October 28". */
  dayLabel: string;
  /** e.g. "Oct 28, 12:20 AM ET" — when these statuses were read (the page is built, not live). */
  asOf: string;
  /** On a day with no games: the next day that has games, so the page still answers "what's next?". */
  next?: { dayLabel: string; rows: ShownRow[] } | null;
}) {
  const groups = groupTodayGames(rows);
  return (
    <section id="today-games" aria-labelledby="today-games-h" className="flex flex-col gap-3" style={{ scrollMarginTop: 72 }}>
      <div className="flex flex-col gap-0.5">
        <h2 id="today-games-h" className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 20, fontWeight: 800 }}>
          Today&rsquo;s games
        </h2>
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>
          {dayLabel} · {rows.length} {rows.length === 1 ? "game" : "games"} · status as of {asOf}. Open a game for its full forecast.
        </p>
      </div>
      {groups.length === 0 ? (
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 13.5 }}>No games are scheduled today.</p>
      ) : null}
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col">
          <h3 className="m-0 font-display" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{g.title} · {g.rows.length}</h3>
          <ul className="m-0 list-none p-0">
            {g.rows.map((r) => <Row key={`${r.sport}-${r.eventHref}-${r.matchup}-${r.time}`} r={r} />)}
          </ul>
        </div>
      ))}
      {groups.length === 0 && next && next.rows.length > 0 ? (
        <div className="flex flex-col">
          <h3 className="m-0 font-display" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>Next up · {next.dayLabel}</h3>
          <ul className="m-0 list-none p-0">
            {next.rows.map((r) => <Row key={`${r.sport}-${r.eventHref}-${r.matchup}-${r.time}`} r={r} />)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

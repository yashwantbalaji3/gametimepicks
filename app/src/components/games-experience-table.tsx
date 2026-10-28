"use client";
/**
 * GamesTable — every event across sports in one table (gap 3, 2026-10-23), on /today.
 *
 * Rows are built on the server (games-experience-table-rows.ts) from the cross-sport day selector and arrive packed
 * (games-experience-table-wire.ts); this component only filters (sport, date, forecast state) and sorts. The full list
 * renders on the server, so the table reads without scripts. Below 720px each row stacks as a card with its column
 * names. A probability appears only where the row carries one, verbatim; nothing is computed here.
 *
 * WEIGHT (follow-up, 2026-10-23): the rows are inlined twice (server HTML + the serialized props), so the cells carry
 * no per-row class or data attribute — the styles hang off element and column position (CSS below), and the stacked
 * mobile labels come from `nth-child` content instead of a `data-l` on every cell.
 */
import { useMemo, useState } from "react";

import { FORECAST_STATES, SPORT_LABEL, unpackGamesTable, type ForecastState, type PackedGamesTable, type ShownRow } from "./games-experience-table-wire";

type SortKey = "time" | "sport" | "forecast";
const FORECAST_ORDER: Record<ForecastState, number> = { Frozen: 0, Published: 1, "Degraded inputs": 2, Pending: 3, Unavailable: 4 };
const COLUMNS = ["Time (ET)", "Matchup", "Sport", "Status", "Official Forecast", "Links"] as const;

const dayLabel = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));

export default function GamesTable({ table, today, dates, asOf }: { table: PackedGamesTable; today: string; dates: string[]; asOf: string }) {
  const rows = useMemo(() => unpackGamesTable(table).map((r, i) => ({ ...r, key: i })), [table]);
  const [sport, setSport] = useState("all");
  const [date, setDate] = useState("upcoming");
  const [state, setState] = useState("all");
  const [sort, setSort] = useState<SortKey>("time");

  const sports = useMemo(() => [...new Set(rows.map((r) => r.sport))].sort((a, b) => (SPORT_LABEL[a] ?? a).localeCompare(SPORT_LABEL[b] ?? b)), [rows]);
  const shown = useMemo(() => {
    const out = rows.filter((r) =>
      (sport === "all" || r.sport === sport) &&
      (date === "all" || (date === "upcoming" ? r.date >= today : r.date === date)) &&
      (state === "all" || r.forecast === state));
    const t = (r: ShownRow) => r.startUtc ?? r.date;
    return [...out].sort((a, b) =>
      sort === "sport" ? a.sportLabel.localeCompare(b.sportLabel) || t(a).localeCompare(t(b))
        : sort === "forecast" ? FORECAST_ORDER[a.forecast] - FORECAST_ORDER[b.forecast] || t(a).localeCompare(t(b))
          : t(a).localeCompare(t(b)) || a.matchup.localeCompare(b.matchup));
  }, [rows, sport, date, state, sort, today]);

  const SortButton = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <button type="button" className="gt-sort" aria-pressed={sort === k} onClick={() => setSort(k)}>
      {children}{sort === k ? " ↓" : ""}
    </button>
  );

  return (
    <div className="gt">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="gt-controls">
        <label className="gt-field"><span>Sport</span>
          <select value={sport} onChange={(e) => setSport(e.target.value)}>
            <option value="all">All sports</option>
            {sports.map((k) => <option key={k} value={k}>{SPORT_LABEL[k] ?? k}</option>)}
          </select>
        </label>
        <label className="gt-field"><span>Date</span>
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            <option value="upcoming">{dayLabel(today)} and later</option>
            <option value="all">All listed dates</option>
            {dates.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
          </select>
        </label>
        <label className="gt-field"><span>Official Forecast</span>
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="all">Any</option>
            {FORECAST_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="gt-field"><span>Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="time">Start time</option>
            <option value="sport">Sport</option>
            <option value="forecast">Official Forecast</option>
          </select>
        </label>
      </div>
      <p className="gt-count" aria-live="polite">{shown.length} of {rows.length} events · status as of {asOf}</p>
      {shown.length ? (
        <table className="gt-table">
          <thead>
            <tr>
              <th scope="col"><SortButton k="time">{COLUMNS[0]}</SortButton></th>
              <th scope="col">{COLUMNS[1]}</th>
              <th scope="col"><SortButton k="sport">{COLUMNS[2]}</SortButton></th>
              <th scope="col">{COLUMNS[3]}</th>
              <th scope="col"><SortButton k="forecast">{COLUMNS[4]}</SortButton></th>
              <th scope="col">{COLUMNS[5]}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key}>
                <td><small>{dayLabel(r.date)}</small>{r.time}</td>
                <th scope="row">{r.matchup}</th>
                <td>{r.sportLabel}</td>
                <td>{r.status}</td>
                <td>
                  {/* "on" = an Official Forecast exists for this event (published or frozen). */}
                  <b className={r.forecast === "Published" || r.forecast === "Frozen" ? "on" : undefined}>{r.forecast}</b>
                  {r.read ? <span>{r.read}</span> : null}
                  {r.note ? <small>{r.note}</small> : null}
                </td>
                <td>
                  <a href={r.eventHref}>Event</a>
                  {r.resultHref ? <a href={r.resultHref}>Result</a> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="gt-empty">No events match these filters.</p>
      )}
    </div>
  );
}

const CSS = `
.gt-controls{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
.gt-field{display:flex;flex-direction:column;gap:4px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--vault-text-faint);flex:1 1 150px;max-width:240px}
.gt-field select{min-height:44px;padding:0 10px;border-radius:10px;border:1px solid var(--vault-rule);background:var(--vault-panel);color:var(--vault-text);font-size:14px;text-transform:none;letter-spacing:0}
.gt-count{margin:10px 0 0;font-size:12px;color:var(--vault-text-mute)}
.gt-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
.gt-table th,.gt-table td{padding:8px;border-top:1px solid var(--vault-border);text-align:left;vertical-align:top}
.gt-table thead th{border-top:0;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--vault-text-faint);font-weight:500;white-space:nowrap}
.gt-table tbody th{font-weight:600;color:var(--vault-text)}
.gt-sort{background:none;border:0;padding:0;min-height:32px;font:inherit;letter-spacing:inherit;text-transform:inherit;color:inherit;cursor:pointer}
.gt-sort[aria-pressed=true]{color:var(--vault-gold-bright)}
.gt-table td small{display:block;margin-top:3px;font-size:11.5px;line-height:1.45;color:var(--vault-text-faint)}
.gt-table td:first-child small{margin:0 0 1px;font-size:11px}
.gt-table td b{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid var(--vault-rule);color:var(--vault-text-mute)}
.gt-table td b.on{border-color:var(--vault-gold);color:var(--vault-gold-bright)}
.gt-table td b+span{display:block;margin-top:4px;font-family:var(--font-mono,monospace);font-size:12.5px;color:var(--vault-text)}
.gt-table td:last-child{white-space:nowrap}
.gt-table td:last-child a{display:inline-flex;align-items:center;min-height:44px;margin-right:12px;color:var(--vault-gold-bright)}
.gt-empty{margin:10px 0 0;font-size:13px;color:var(--vault-text-mute)}
@media (max-width:719px){
  .gt-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  .gt-table,.gt-table tbody{display:block}
  .gt-table tr{display:grid;grid-template-columns:1fr;gap:2px;padding:10px 0;border-top:1px solid var(--vault-border)}
  .gt-table th,.gt-table td{display:block;border:0;padding:2px 0}
  .gt-table tbody td::before{display:block;font-size:10px;font-weight:400;letter-spacing:.08em;text-transform:uppercase;color:var(--vault-text-faint)}
  ${COLUMNS.map((c, i) => (i === 1 ? "" : `.gt-table tbody td:nth-child(${i + 1})::before{content:"${c}"}`)).join("")}
  .gt-table tbody th{font-size:15px}
}
`;

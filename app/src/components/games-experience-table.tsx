"use client";
/**
 * GamesTable — every event across sports in one table (gap 3, 2026-10-23), on /today.
 *
 * Rows are built on the server (games-experience-table-rows.ts) from the cross-sport day selector; this component only
 * filters (sport, date, forecast state) and sorts. The full list renders on the server, so the table reads without
 * scripts. Below 720px each row stacks as a card with its column names. A probability appears only where the row
 * carries one, verbatim; nothing is computed here.
 */
import { useMemo, useState } from "react";
import Link from "next/link";

import type { ForecastState, GamesTableRow } from "./games-experience-table-rows";

type SortKey = "time" | "sport" | "forecast";
const FORECAST_ORDER: Record<ForecastState, number> = { Frozen: 0, Published: 1, Pending: 2, Unavailable: 3 };

const dayLabel = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));

export default function GamesTable({ rows, today, dates, asOf }: { rows: GamesTableRow[]; today: string; dates: string[]; asOf: string }) {
  const [sport, setSport] = useState("all");
  const [date, setDate] = useState("upcoming");
  const [state, setState] = useState("all");
  const [sort, setSort] = useState<SortKey>("time");

  const sports = useMemo(() => [...new Map(rows.map((r) => [r.sport, r.sportLabel])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const shown = useMemo(() => {
    const out = rows.filter((r) =>
      (sport === "all" || r.sport === sport) &&
      (date === "all" || (date === "upcoming" ? r.date >= today : r.date === date)) &&
      (state === "all" || r.forecast === state));
    const t = (r: GamesTableRow) => r.startUtc ?? r.date;
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
            {sports.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
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
            {(["Published", "Frozen", "Pending", "Unavailable"] as const).map((s) => <option key={s} value={s}>{s}</option>)}
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
              <th scope="col"><SortButton k="time">Time (ET)</SortButton></th>
              <th scope="col">Matchup</th>
              <th scope="col"><SortButton k="sport">Sport</SortButton></th>
              <th scope="col">Status</th>
              <th scope="col"><SortButton k="forecast">Official Forecast</SortButton></th>
              <th scope="col">Links</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.id}|${r.date}`}>
                <td data-l="Time (ET)"><span className="gt-day">{dayLabel(r.date)}</span> {r.time}</td>
                <th scope="row" data-l="Matchup">{r.matchup}</th>
                <td data-l="Sport">{r.sportLabel}</td>
                <td data-l="Status">{r.status}</td>
                <td data-l="Official Forecast">
                  <span className={`gt-state gt-${r.forecast.toLowerCase()}`}>{r.forecast}</span>
                  {r.read ? <span className="gt-read">{r.read}</span> : null}
                  {r.note ? <span className="gt-note">{r.note}</span> : null}
                </td>
                <td data-l="Links" className="gt-links">
                  <Link href={r.eventHref} prefetch={false}>Event</Link>
                  {r.resultHref ? <Link href={r.resultHref} prefetch={false}>Result</Link> : null}
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
.gt-day{display:block;font-size:11px;color:var(--vault-text-faint)}
.gt-state{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid var(--vault-rule);color:var(--vault-text-mute)}
.gt-published,.gt-frozen{border-color:var(--vault-gold);color:var(--vault-gold-bright)}
.gt-read{display:block;margin-top:4px;font-family:var(--font-mono,monospace);font-size:12.5px;color:var(--vault-text)}
.gt-note{display:block;margin-top:3px;font-size:11.5px;line-height:1.45;color:var(--vault-text-faint)}
.gt-links{white-space:nowrap}
.gt-links a{display:inline-flex;align-items:center;min-height:44px;margin-right:12px;color:var(--vault-gold-bright)}
.gt-empty{margin:10px 0 0;font-size:13px;color:var(--vault-text-mute)}
@media (max-width:719px){
  .gt-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  .gt-table,.gt-table tbody{display:block}
  .gt-table tr{display:grid;grid-template-columns:1fr;gap:2px;padding:10px 0;border-top:1px solid var(--vault-border)}
  .gt-table th,.gt-table td{display:block;border:0;padding:2px 0}
  .gt-table td[data-l]::before{content:attr(data-l);display:block;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--vault-text-faint)}
  .gt-table tbody th{font-size:15px}
}
`;

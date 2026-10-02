"use client";
/**
 * Session 5 · B7 — the drill-down under a season-to-date family record: the owner's own graded rows, loaded on
 * demand from the published week file (/data/nfl/reconciliation/<key>.json). Nothing is re-graded or copied
 * into the page; opening a week fetches that week once.
 */
import { useState } from "react";

import { nflFamilyRows } from "@/lib/results/v2/nfl-family-record.mjs";

type Row = { matchup: string | null; name: string | null; team: string | null; low: number | null; median: number | null; high: number | null; actual: number | null; outcome: string };
const WORD: Record<string, string> = { HIT: "Hit", MISS: "Miss", VOID: "Void — did not play / no result", PUSH: "Push" };

function WeekRows({ familyId, weekKey, label }: { familyId: string; weekKey: string; label: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = async () => {
    if (rows || failed) return;
    try {
      const res = await fetch(`/data/nfl/reconciliation/${weekKey}.json`);
      if (!res.ok) throw new Error(String(res.status));
      setRows(nflFamilyRows(await res.json(), familyId) as Row[]);
    } catch { setFailed(true); }
  };
  return (
    <details onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) void load(); }}>
      <summary className="k m" style={{ cursor: "pointer", minHeight: 32 }}>{label}</summary>
      {failed ? <p className="note">This week&rsquo;s rows could not be loaded.</p> : null}
      {rows ? (
        rows.length ? (
          <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 3 }}>
            {rows.map((r, i) => (
              <li key={i} className="k" style={{ fontSize: 12 }}>
                {r.name ? `${r.name}${r.team ? ` (${r.team})` : ""} · ` : ""}{r.matchup}
                {r.low != null && r.high != null ? ` · range ${r.low}–${r.high}` : r.median != null && r.low == null ? ` · chance ${(r.median * 100).toFixed(0)}%` : ""}
                {r.actual != null ? ` · actual ${r.actual}` : ""} — {WORD[r.outcome] ?? r.outcome}
              </li>
            ))}
          </ul>
        ) : <p className="note">No graded rows for this prediction in this week.</p>
      ) : null}
    </details>
  );
}

export default function NflFamilyDrilldown({ familyId, weeks }: { familyId: string; weeks: { key: string; label: string; checks: number }[] }) {
  return (
    <details>
      <summary className="k m" style={{ cursor: "pointer", minHeight: 32 }}>Every graded row</summary>
      <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
        {weeks.map((w) => <WeekRows key={w.key} familyId={familyId} weekKey={w.key} label={`${w.label} · ${w.checks} decided`} />)}
      </div>
    </details>
  );
}

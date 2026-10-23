"use client";
/**
 * The searchable list behind the /players/<sport>/ and /teams/<sport>/ index pages (gap 6, 2026-10-23).
 *
 * Rows arrive as compact tuples built at build time from the research projection index — the same registry that
 * generates every detail page, so each link is a page this export serves. The whole list renders on the server
 * (readable and crawlable with scripts off); the browser only narrows it by name and by group (team).
 */
import { useMemo, useState } from "react";

/** [slug, label, group | null, note | null] */
export type DirectoryRow = [string, string, string | null, string | null];

export default function EntityDirectory({ base, rows, noun, groupLabel }: { base: string; rows: DirectoryRow[]; noun: string; groupLabel: string | null }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const groups = useMemo(() => [...new Set(rows.map((r) => r[2]).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b)), [rows]);
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => (!group || r[2] === group) && (!needle || r[1].toLowerCase().includes(needle) || (r[2] ?? "").toLowerCase().includes(needle)));

  return (
    <div className="gtp-dir">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="gtp-dir-controls" role="search">
        <label className="gtp-dir-field">
          <span>Search {noun}</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name" autoComplete="off" />
        </label>
        {groupLabel && groups.length > 1 ? (
          <label className="gtp-dir-field">
            <span>{groupLabel}</span>
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">All</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      <p className="gtp-dir-count" aria-live="polite">
        Showing {shown.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")} {noun}
      </p>
      {shown.length ? (
        <ul className="gtp-dir-list">
          {shown.map((r) => (
            <li key={r[0]}>
              {/* Bare markup on purpose: ~760 rows are inlined in the HTML, so each class attribute costs ~0.8KB a word. */}
              <a href={`${base}${r[0]}/`}>{r[1]}{r[2] || r[3] ? <small>{[r[2], r[3]].filter(Boolean).join(" · ")}</small> : null}</a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="gtp-dir-empty">No {noun} match that search.</p>
      )}
    </div>
  );
}

const CSS = `
.gtp-dir-controls{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
.gtp-dir-field{display:flex;flex-direction:column;gap:4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--vault-text-faint);flex:1 1 200px;max-width:360px}
.gtp-dir-field input,.gtp-dir-field select{min-height:44px;padding:0 12px;border-radius:10px;border:1px solid var(--vault-rule);background:var(--vault-panel);color:var(--vault-text);font-size:15px;text-transform:none;letter-spacing:0;width:100%}
.gtp-dir-count{margin:10px 0 0;font-size:12px;color:var(--vault-text-mute)}
.gtp-dir-list{list-style:none;margin:8px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px}
.gtp-dir-list a{display:flex;flex-direction:column;justify-content:center;min-height:44px;padding:6px 12px;border:1px solid var(--vault-rule);border-radius:10px;text-decoration:none;color:var(--vault-text);background:var(--vault-panel)}
.gtp-dir-list a:hover,.gtp-dir-list a:focus-visible{border-color:var(--vault-gold)}
.gtp-dir-list a{font-size:14px;font-weight:600;overflow-wrap:anywhere}
.gtp-dir-list small{display:block;font-size:11.5px;font-weight:400;color:var(--vault-text-mute)}
.gtp-dir-empty{margin:10px 0 0;font-size:13px;color:var(--vault-text-mute)}
`;

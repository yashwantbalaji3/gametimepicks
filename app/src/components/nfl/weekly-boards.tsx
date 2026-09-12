"use client";
/**
 * NFL WEEKLY TOP BOARDS — filterable (P251 · F5).
 *
 * Five tables, forty-five rows, and no control of any kind: on the day NFL was the lead sport the
 * hub carried zero buttons and zero selects, while /mlb carried thirty-two buttons and eight
 * filters over a comparable amount of data. A reader looking for one team's players had to scan
 * every table by eye.
 *
 * The chips filter the ROWS THAT WERE PUBLISHED — they never re-rank and never reach past the top
 * N the ranking owner chose. A board whose rows all fall outside the filter says so, rather than
 * disappearing and leaving a reader unsure whether it exists.
 */
import { useMemo, useState } from "react";
import Link from "next/link";

import PlayerAvatar from "@/components/player-avatar";
import { SEARCH_PLAYERS, SEARCH_PLAYERS_LABEL } from "@/lib/ui/search-labels";
import FollowToggle from "@/components/follow/follow-toggle";

export interface BoardRow {
  playerId: string;
  name: string;
  team: string;
  opponent: string;
  kickoffUtc: string;
  providerEventId: string;
  value: number;
  median?: number;
  p10?: number;
  p90?: number;
}
export interface Board {
  id: string;
  title: string;
  state: string;
  reason?: string;
  rows?: BoardRow[];
}

const espnAthleteId = (playerId: string) => Number(String(playerId).replace(/^nfl-athlete-/, "")) || null;

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full px-2.5 py-1 shrink-0 transition-colors"
      style={{
        background: on ? "var(--vault-gold-dim)" : "transparent",
        border: `1px solid ${on ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`,
        color: on ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
        fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", minHeight: 28,
      }}>
      {children}
    </button>
  );
}

/* Formatted here rather than passed in: a function cannot cross the server/client boundary, and a
   kickoff time is presentation, so it belongs on the side that presents it. */
const etKickoff = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    .format(new Date(iso));

export default function NflWeeklyBoards({ boards, teamNames = {} }: { boards: Board[]; teamNames?: Record<string, string> }) {
  /* The follow store keys on a club's own published NAME, which is what every artifact and the
     search index already agree on. The boards carry abbreviations, so the page passes the
     abbreviation→name map the forecast artifact publishes rather than a second identity space
     being invented here. */
  const fullName = (abbr: string) => teamNames[abbr] ?? abbr;
  const [team, setTeam] = useState<string>("All");
  const [q, setQ] = useState("");

  /** Every club that appears anywhere on the published boards — never a hardcoded league list. */
  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const b of boards) for (const r of b.rows ?? []) set.add(r.team);
    return [...set].sort();
  }, [boards]);

  const query = q.trim().toLowerCase();
  const matches = (r: BoardRow) =>
    (team === "All" || r.team === team) &&
    (query === "" || r.name.toLowerCase().includes(query));

  const filtered = boards.map((b) => ({ board: b, rows: (b.rows ?? []).filter(matches) }));
  const totalShown = filtered.reduce((n, f) => n + f.rows.length, 0);
  const totalRows = boards.reduce((n, b) => n + (b.rows?.length ?? 0), 0);
  const narrowed = team !== "All" || query !== "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          <Chip on={team === "All"} onClick={() => setTeam("All")}>All teams</Chip>
          {teams.map((t) => (
            <span key={t} className="inline-flex items-center gap-0.5 shrink-0">
              <Chip on={team === t} onClick={() => setTeam(t)}>{t}</Chip>
              {/* P251-F9: follow from where a reader is already looking at their club. The star
                  changes what /today shows them first; it never changes a number here. */}
              <FollowToggle team={fullName(t)} size={13} />
            </span>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={SEARCH_PLAYERS}
          aria-label={SEARCH_PLAYERS_LABEL}
          className="font-mono"
          style={{ minHeight: 32, padding: "0 10px", borderRadius: 8, fontSize: 12, border: "1px solid var(--vault-rule)", background: "transparent", color: "var(--vault-text)", minWidth: 150 }}
        />
        {narrowed ? (
          <span className="font-mono" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
            {totalShown} of {totalRows} published rows
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-5">
        {filtered.map(({ board: b, rows }) =>
          (b.state === "PUBLISHED" || b.state === "ESTIMATE") && (b.rows?.length ?? 0) > 0 ? (
            <div key={b.id}>
              <h3 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: "var(--vault-text)" }}>{b.title}</h3>
              {rows.length === 0 ? (
                /* A board with no matching row still says so. Vanishing would leave a reader
                   unsure whether the board exists at all — the same reason an empty period
                   still prints its zero everywhere else on this site. */
                <p style={{ margin: 0, fontSize: 11.5, color: "var(--vault-text-faint)" }}>
                  No {team === "All" ? "matching" : team} player is in this board&rsquo;s published rows.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                    <thead>
                      <tr>
                        {["#", "Player", "Game", "Kickoff (ET)", b.id === "top_td" ? "TD chance" : "Median", ...(b.id === "top_td" ? [] : ["Range (10th–90th)"]), ""].map((h, i) => (
                          <th key={`${h}-${i}`} scope="col" style={{ textAlign: "left", padding: "6px 9px", fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        /* The rank is the row's place in the PUBLISHED board, not in the filtered
                           view — filtering must never renumber a ranking it did not produce. */
                        const rank = (b.rows ?? []).indexOf(r) + 1;
                        return (
                          <tr key={`${r.playerId}-${r.team}`}>
                            <td className="font-mono" style={{ padding: "7px 9px", borderTop: "1px solid var(--vault-border)", fontSize: 11, color: "var(--vault-text-faint)" }}>{rank}</td>
                            <td style={{ padding: "7px 9px", borderTop: "1px solid var(--vault-border)", fontSize: 13 }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                {b.id === "top_td" ? <PlayerAvatar playerId={espnAthleteId(r.playerId)} playerName={r.name} team={r.team} sport="nfl" size="sm" /> : null}
                                <span>{r.name} <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{r.team}</span></span>
                              </span>
                            </td>
                            <td className="font-mono" style={{ padding: "7px 9px", borderTop: "1px solid var(--vault-border)", fontSize: 11.5, color: "var(--vault-text-mute)" }}>{r.team} vs {r.opponent}</td>
                            <td className="font-mono" style={{ padding: "7px 9px", borderTop: "1px solid var(--vault-border)", fontSize: 11, color: "var(--vault-text-mute)", whiteSpace: "nowrap" }}>{etKickoff(r.kickoffUtc)}</td>
                            <td className="font-mono" style={{ padding: "7px 9px", borderTop: "1px solid var(--vault-border)", fontSize: 13, fontWeight: 700, color: "var(--gtp-bank-heat)" }}>
                              {b.id === "top_td" ? `${(r.value * 100).toFixed(1)}%` : r.median}
                            </td>
                            {b.id === "top_td" ? null : (
                              <td className="font-mono" style={{ padding: "7px 9px", borderTop: "1px solid var(--vault-border)", fontSize: 11.5, color: "var(--vault-text-faint)" }}>{r.p10}–{r.p90}</td>
                            )}
                            <td style={{ padding: "7px 9px", borderTop: "1px solid var(--vault-border)", whiteSpace: "nowrap" }}>
                              <Link href={`/nfl/game/${r.providerEventId}/`} className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: 10, color: "var(--vault-gold-bright)" }}>Game →</Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p key={b.id} style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)", maxWidth: 760, border: "1px dashed var(--vault-rule)", borderRadius: 10, padding: "8px 12px" }}>
              <strong style={{ color: "var(--vault-text-mute)" }}>{b.title}:</strong> not published — {b.reason}
            </p>
          ),
        )}
      </div>
    </div>
  );
}

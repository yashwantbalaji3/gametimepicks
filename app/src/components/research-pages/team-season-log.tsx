"use client";
/**
 * Team season game log (v1.3). One season at a time, chosen with a native select (keyboard and screen-reader
 * operable, 44px). Rows come verbatim from the team projection; nothing is computed here but the filter.
 *
 * A game that is not final in the committed data is never shown as a result. Whether it reads "Scheduled" or
 * "No final recorded" depends on the READER's clock, so that word is decided after mount — the static HTML says
 * "Not final" for everyone and cannot age into a lie.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { formatGameDate, isUpcoming } from "@/lib/research-pages/format.mjs";
import type { TeamRow, TeamSeason } from "@/lib/research-pages/projection-store";
import { EntityLink, MONO, ResultBadge } from "./research-primitives";

interface Props {
  teamName: string;
  seasons: TeamSeason[];
  defaultSeason: string | null;
  games: TeamRow[];
  labels: Record<string, { name: string; abbreviation: string | null }>;
  teamHrefs: Record<string, string>;
  gameHrefs: Record<string, string>;
  supportsResults: boolean;
}

const cell: React.CSSProperties = { padding: "8px 10px", fontSize: 13, borderTop: "1px solid var(--vault-rule)", verticalAlign: "top" };
const head: React.CSSProperties = { padding: "6px 10px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)", textAlign: "left", fontWeight: 600 };

export default function TeamSeasonLog({ teamName, seasons, defaultSeason, games, labels, teamHrefs, gameHrefs, supportsResults }: Props) {
  const [season, setSeason] = useState(defaultSeason ?? seasons[0]?.id ?? "");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  const rows = useMemo(() => games.filter((g) => g[2] === season), [games, season]);
  const selected = seasons.find((s) => s.id === season) ?? null;

  const status = (g: TeamRow) => {
    if (g[8]) return null;
    if (g[5] === "F") return supportsResults ? "Final — score not recorded" : "Played — result not available";
    if (now === null) return "Not final";
    return isUpcoming(g[1], now) ? "Scheduled" : "No final recorded";
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <label htmlFor="team-season" style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>Season</label>
        <select
          id="team-season"
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          style={{ minHeight: 44, minWidth: 120, background: "var(--vault-panel)", color: "var(--vault-text)", border: "1px solid var(--vault-border)", borderRadius: 8, padding: "0 10px", fontSize: 14 }}
        >
          {seasons.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        {selected ? (
          <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-mute)" }}>
            {selected.games} game{selected.games === 1 ? "" : "s"} listed
            {selected.record ? ` · ${selected.record.w}–${selected.record.l}${selected.record.t ? `–${selected.record.t}` : ""} in ${selected.record.finals} recorded final${selected.record.finals === 1 ? "" : "s"}` : ""}
          </span>
        ) : null}
      </div>
      <div data-scroll-x style={{ overflowX: "auto" }} role="region" aria-label={`${teamName} ${selected?.label ?? ""} games`} tabIndex={0}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
          <caption className="sr-only">{teamName} games, {selected?.label ?? ""} season, newest first</caption>
          <thead>
            <tr>
              <th scope="col" style={head}>Date</th>
              <th scope="col" style={head}>Opponent</th>
              <th scope="col" style={head}>{supportsResults ? "Result" : "Status"}</th>
              <th scope="col" style={head}><span className="sr-only">Game page</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => {
              const opp = g[4] ? labels[g[4]] : null;
              const href = gameHrefs[g[0]];
              const st = status(g);
              return (
                <tr key={g[0]}>
                  <td style={{ ...cell, whiteSpace: "nowrap", fontFamily: MONO, fontSize: 12 }}>{formatGameDate(g[1])}</td>
                  <td style={cell}>
                    <span style={{ color: "var(--vault-text-faint)", fontFamily: MONO, fontSize: 11 }}>{g[3] === "H" ? "vs" : g[3] === "A" ? "@" : "vs (neutral)"}</span>{" "}
                    <EntityLink href={g[4] ? teamHrefs[g[4]] : null}>{opp?.name ?? "Opponent not recorded"}</EntityLink>
                  </td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>
                    {g[8] ? (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontVariantNumeric: "tabular-nums" }}>
                        <ResultBadge code={g[8]} /> {g[6]}–{g[7]}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--vault-text-mute)" }} suppressHydrationWarning>{st}</span>
                    )}
                  </td>
                  <td style={{ ...cell, textAlign: "right" }}>
                    {href ? <Link href={href} style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-gold-bright)", display: "inline-flex", minHeight: 32, alignItems: "center" }}>Game →</Link> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

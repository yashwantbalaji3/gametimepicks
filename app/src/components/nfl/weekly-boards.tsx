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

import PredictionBoard from "@/components/prediction/prediction-board";
import { presentWeeklyBoard } from "@/lib/prediction-presentation/nfl";
import type { PredictionPresentation } from "@/lib/prediction-presentation/contract";
import { SEARCH_PLAYERS, SEARCH_PLAYERS_LABEL } from "@/lib/ui/search-labels";
import FollowToggle from "@/components/follow/follow-toggle";
import type { FollowRef } from "@/lib/follow/follow-store";

export interface BoardRow {
  playerId: string;
  name: string;
  team: string;
  opponent: string;
  kickoffUtc: string;
  providerEventId: string;
  participation: string;
  value: number;
  median?: number;
  p10?: number;
  p90?: number;
  probability?: number;
  /** The builder's own pricing state. Read, never inferred — see the prediction contract. */
  pricingState?: string;
  /*
   * A REAL CAPTURED MARKET, when the owner published one for this row. Declared here so the hub's
   * pass-through is type-visible rather than accidental — the two routes diverged once already
   * because this field existed in the artifact and in the week route, and nowhere in between.
   */
  market?: { line?: number; overOdds?: number; underOdds?: number; yesOdds?: number; sportsbook: string; capturedAt: string };
}
export interface Board {
  id: string;
  /** The market family key the presentation contract keys on. */
  family: string;
  title: string;
  state: string;
  reason?: string;
  caveat?: string;
  rows?: BoardRow[];
}

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

export default function NflWeeklyBoards({ boards, generatedAt, model, teamNames = {}, teamRefs = {} }: {
  boards: Board[];
  /** The board stamp, and the model that produced it. Crosses the boundary ONCE for all 45 rows,
   *  rather than being repeated inside every presentation the server would otherwise serialise. */
  generatedAt: string;
  model?: { id?: string; version?: number | string } | null;
  teamNames?: Record<string, string>;
  /** abbreviation → canonical team ref, resolved on the server. An abbreviation absent here gets no star. */
  teamRefs?: Record<string, FollowRef>;
}) {
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

  const filtered = boards.map((b) => ({
    board: b,
    rows: (b.rows ?? []).filter(matches),
    /** Published order, so a filtered view still prints the ranking the owner produced. */
    published: (b.rows ?? []).map((r) => r.playerId),
  }));
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
              {/* P251-F9 → v1.1.2: follow from where a reader is already looking at their club — now by
                  canonical ESPN team id, not by display name. The star changes what /today shows first;
                  it never changes a number here. Compact, because this is a dense chip row. */}
              <FollowToggle entity={teamRefs[t] ?? null} variant="compact" size={13} />
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
        {filtered.map(({ board: b, rows, published }) =>
          (b.state === "PUBLISHED" || b.state === "ESTIMATE") && (b.rows?.length ?? 0) > 0 ? (
            <div key={b.id}>
              <h3 style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "var(--vault-text)" }}>{b.title}</h3>
              {/* An ESTIMATE family carries real numbers WITH the bar it failed, once per board. */}
              {b.state === "ESTIMATE" && b.caveat ? (
                <p style={{ margin: "0 0 6px", fontSize: 11, lineHeight: 1.5, color: "var(--vault-text-mute)", maxWidth: 720 }}>
                  Estimate — {b.caveat}
                </p>
              ) : null}
              {rows.length === 0 ? (
                /* A board with no matching row still says so. Vanishing would leave a reader
                   unsure whether the board exists at all — the same reason an empty period
                   still prints its zero everywhere else on this site. */
                <p style={{ margin: 0, fontSize: 11.5, color: "var(--vault-text-faint)" }}>
                  No {team === "All" ? "matching" : team} player is in this board&rsquo;s published rows.
                </p>
              ) : (
                <PredictionBoard
                  predictions={presentWeeklyBoard({ generatedAt, model }, { ...b, rows })}
                  gameHref={(p) => `/nfl/game/${p.game.providerEventId}/`}
                  /* The rank is the row's place in the PUBLISHED board, not in the filtered view —
                     filtering must never renumber a ranking it did not produce. */
                  rankOf={(p: PredictionPresentation) => published.indexOf(p.player.playerId) + 1}
                />
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

/**
 * /nba/projections view (preregistration §13 amendment A, founder decision 2026-10-20). Server component.
 *
 * Renders ONLY the lane snapshot it is handed (the page passes loadCurrentLane's result — null when either switch is
 * off or the slate is past). Every number is copied from that snapshot by boardRows; the client island filters and
 * re-sorts only. Each view carries the UNVALIDATED EXPERIMENTAL SIMULATION notice, the freeze times and the receipt
 * hashes; the combos carry their draw label. Nothing here reads a file.
 */
import React from "react";
import Link from "next/link";
import type { Snapshot } from "@/components/nba/experimental-lane";
import ProjectionBoard from "@/components/nba/projection-board";
import { COMBO_STATS, LANE, PROJECTION_BOARD_STATS, COMBO_LABEL } from "@/lib/sports/nba/experimental-public-lane.mjs";
import { boardOptions, boardRows, statGroups } from "@/lib/sports/nba/projection-board-ops.mjs";

const et = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " ET";
const slateLabel = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));
const MUTE = { color: "var(--vault-text-mute)" };

export default function NbaProjectionsView({ lane }: { lane: Snapshot | null }) {
  const live = lane && lane.games.length > 0 ? lane : null;
  const stats = PROJECTION_BOARD_STATS.map(([k, l]) => [k, l] as const);
  const rows = live ? boardRows(live, PROJECTION_BOARD_STATS) : [];
  const { matchups, teams } = boardOptions(live);
  const groups = statGroups(PROJECTION_BOARD_STATS, COMBO_STATS.map(([k]) => k));
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-4 min-w-0">
      <p className="m-0 text-[13px]"><Link href="/nba/" className="underline" style={{ color: "var(--vault-text)" }}>← NBA hub</Link></p>
      <h1 className="m-0 font-display text-[22px] font-bold" style={{ color: "var(--vault-text)" }}>NBA player projections{live?.date ? ` · ${slateLabel(live.date)} slate` : ""}</h1>
      <div className="rounded-lg p-3" style={{ border: "2px solid var(--vault-gold-bright)", background: "var(--vault-panel)" }} role="note">
        <p className="m-0 font-display text-[13px] font-extrabold tracking-wide" style={{ color: "var(--vault-gold-bright)" }}>{LANE.label}</p>
        <p className="m-0 mt-1 text-[12.5px] leading-relaxed" style={MUTE}>
          Frozen pregame model medians, published as experimental analytics — not validated and not a betting
          recommendation. These models have not yet met their preregistered regular-season checks, and nothing here counts
          toward them. Each figure was frozen before tip-off and is shown exactly as frozen.
        </p>
      </div>
      {live ? (
        <>
          <ul className="m-0 pl-5 text-[12px] leading-relaxed" style={MUTE} aria-label="Freeze times and receipts">
            {live.games.map((g) => (
              <li key={g.providerEventId}>
                {g.away.name} at {g.home.name}: tip-off {et(g.tipUtc)} · frozen {et(g.frozenAt)} · receipt {g.receipt.modelVersion} · {g.receipt.payloadSha256.slice(0, 12)}
              </li>
            ))}
          </ul>
          <p className="m-0 text-[12px] leading-relaxed" style={MUTE}>
            Source: {live.games[0].players.source}. PRA, P+R and P+A: {COMBO_LABEL} — the median of each simulated
            game&rsquo;s sum, so it need not equal the sum of the separate medians. Players with at least 10 expected
            minutes who are not ruled out. The default order is expected minutes; a column sort is the reader&rsquo;s own.
          </p>
          <ProjectionBoard rows={rows} stats={stats} groups={groups} matchups={matchups} teams={teams} />
          <ul className="m-0 pl-5 text-[12px] leading-relaxed" style={MUTE}>
            {Object.entries(live.withheld).map(([k, v]) => <li key={k}>{v}</li>)}
          </ul>
        </>
      ) : (
        <p className="m-0 text-[13.5px] leading-relaxed" style={MUTE} role="status">
          No current experimental projections. This board shows only the current slate&rsquo;s frozen pregame output and
          is empty between slates. The <Link href="/nba/" className="underline" style={{ color: "var(--vault-text)" }}>NBA hub</Link> has
          the schedule and official finals.
        </p>
      )}
    </div>
  );
}

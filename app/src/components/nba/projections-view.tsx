/**
 * /nba/projections view (preregistration §13 amendment A, founder decision 2026-10-20). Server component.
 *
 * Renders ONLY the lane snapshot it is handed (the default page passes loadCurrentLane's result — null when either
 * switch is off or the slate is past; a dated page passes that date's committed snapshot). Every number is copied from
 * that snapshot by boardRows; the client island filters and re-sorts only. Each view carries the UNVALIDATED
 * EXPERIMENTAL SIMULATION notice, the freeze times and the receipt hashes; the combos carry their draw label. Nothing
 * here reads a file.
 *
 * Follow-up to PR 1163 (dates, game links, game status): a past slate is labelled as a past frozen slate, never as
 * current; each GAME (not each row — page weight) carries one read-only status label and at most one link to a page
 * that exists in the same build; the date links name committed snapshot dates only, bounded in number.
 */
import React from "react";
import Link from "next/link";
import type { Snapshot } from "@/components/nba/experimental-lane";
import type { BoardGame, SlateRole } from "@/components/nba/projection-board-context";
import ProjectionBoard from "@/components/nba/projection-board";
import GameStatusOnClock from "@/components/nba/projection-game-status";
import { COMBO_STATS, LANE, PROJECTION_BOARD_STATS, COMBO_LABEL } from "@/lib/sports/nba/experimental-public-lane.mjs";
import { boardOptions, boardRows, statGroups, GAME_STATUS_LABEL, slateHref, slateNav } from "@/lib/sports/nba/projection-board-ops.mjs";

const et = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " ET";
const slateLabel = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));
const MUTE = { color: "var(--vault-text-mute)" };
const TEXT = { color: "var(--vault-text)" };

/* One status word and at most one link per game, no inline styles (they inherit the list's colour) — the markup is
   emitted twice (HTML + RSC), so every byte here counts per game. A build-time "Upcoming" goes to the reader's-clock
   label (it may become "Started" after tip-off); every other status is fixed text from the committed record. */
function GameStatus({ g }: { g: BoardGame }) {
  return (
    <>
      {" · "}<strong>{g.status === "upcoming" ? <GameStatusOnClock t={g.tipUtc} /> : GAME_STATUS_LABEL[g.status]}</strong>
      {g.link ? <>{" · "}<a href={g.link.href} className="underline">{g.link.label}</a></> : null}
    </>
  );
}

/** Committed slate dates only (slateNav): the newest few plus this slate's neighbours — bounded, never invented. */
function SlateDates({ dates, date, dated }: { dates: string[]; date: string | null; dated: boolean }) {
  const nav = slateNav(dates, dated ? date : null, 5);
  if (nav.total === 0) return null;
  return (
    <nav className="m-0 text-[12.5px] leading-relaxed" style={MUTE} aria-label="Slate dates">
      Frozen slates by date:{" "}
      {dated ? <><a href="/nba/projections/" className="underline">current slate</a> · </> : null}
      {nav.recent.map((d, i) => (
        <React.Fragment key={d}>{i ? " · " : ""}{dated && d === date ? <strong aria-current="page">{slateLabel(d)}</strong> : <a href={slateHref(d)} className="underline">{slateLabel(d)}</a>}</React.Fragment>
      ))}
      {nav.prev && !nav.recent.includes(nav.prev) ? <> · <a href={slateHref(nav.prev)} className="underline">earlier: {slateLabel(nav.prev)}</a></> : null}
      {nav.next && !nav.recent.includes(nav.next) ? <> · <a href={slateHref(nav.next)} className="underline">later: {slateLabel(nav.next)}</a></> : null}
    </nav>
  );
}

export default function NbaProjectionsView({ lane, role = "current", date = null, games = [], dates = [], dated = false }: {
  lane: Snapshot | null;
  /** "past" = a slate before the build's ET date: labelled as a past frozen slate, never as current. */
  role?: SlateRole;
  /** The slate the page is about (a dated page's own date, even when it has no snapshot). */
  date?: string | null;
  /** Per-game status + link (projection-board-context boardGames). */
  games?: BoardGame[];
  /** Every committed snapshot date, for the date links. */
  dates?: string[];
  /** true on /nba/projections/[date]/. */
  dated?: boolean;
}) {
  const live = lane && lane.games.length > 0 ? lane : null;
  const past = role === "past";
  const slate = date ?? live?.date ?? null;
  const meta = new Map(games.map((g) => [g.id, g]));
  const stats = PROJECTION_BOARD_STATS.map(([k, l]) => [k, l] as const);
  const rows = live ? boardRows(live, PROJECTION_BOARD_STATS) : [];
  const { matchups, teams } = boardOptions(live);
  const groups = statGroups(PROJECTION_BOARD_STATS, COMBO_STATS.map(([k]) => k));
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-4 min-w-0">
      <p className="m-0 text-[13px]"><Link href="/nba/" className="underline" style={TEXT}>← NBA hub</Link></p>
      <h1 className="m-0 font-display text-[22px] font-bold" style={TEXT}>NBA player projections{slate && (live || dated) ? ` · ${slateLabel(slate)} slate` : ""}{past ? " (past)" : ""}</h1>
      {past ? (
        <p className="m-0 rounded-md p-2 text-[13px] font-semibold" role="note" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)" }}>
          Past frozen slate{slate ? ` · ${slateLabel(slate)}` : ""}. This is not the current slate: each figure is the pregame median frozen
          before that day&rsquo;s tip-offs, shown exactly as frozen and never updated after a game.{" "}
          <a href="/nba/projections/" className="underline">Current slate</a>
        </p>
      ) : null}
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
                {meta.has(g.providerEventId) ? <GameStatus g={meta.get(g.providerEventId)!} /> : null}
              </li>
            ))}
          </ul>
          <p className="m-0 text-[12px] leading-relaxed" style={MUTE}>
            Source: {live.games[0].players.source}. PRA, P+R and P+A: {COMBO_LABEL} — the median of each simulated
            game&rsquo;s sum, so it need not equal the sum of the separate medians. Players with at least 10 expected
            minutes who are not ruled out. The default order is expected minutes; a column sort is the reader&rsquo;s own.
            {games.length ? " Game status is read-only, from the schedule and finals record (Started: tipped off, no final recorded yet); it never changes a frozen figure." : ""}
          </p>
          <ProjectionBoard rows={rows} stats={stats} groups={groups} matchups={matchups} teams={teams} />
          <ul className="m-0 pl-5 text-[12px] leading-relaxed" style={MUTE}>
            {Object.entries(live.withheld).map(([k, v]) => <li key={k}>{v}</li>)}
          </ul>
        </>
      ) : dated ? (
        <p className="m-0 text-[13.5px] leading-relaxed" style={MUTE} role="status">
          No frozen experimental projections are committed for {slate ? slateLabel(slate) : "this date"}, so nothing is shown
          for it. The <Link href="/nba/" className="underline" style={TEXT}>NBA hub</Link> has the schedule and official finals.
        </p>
      ) : (
        <p className="m-0 text-[13.5px] leading-relaxed" style={MUTE} role="status">
          No current experimental projections. This board shows only the current slate&rsquo;s frozen pregame output and
          is empty between slates. The <Link href="/nba/" className="underline" style={TEXT}>NBA hub</Link> has
          the schedule and official finals.
        </p>
      )}
      <SlateDates dates={dates} date={slate} dated={dated} />
    </div>
  );
}

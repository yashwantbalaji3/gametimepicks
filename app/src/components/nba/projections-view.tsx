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
 *
 * Overnight sprint 2026-10-23 (competitor gaps 1, 4, 6; founder vocabulary):
 *   - one concise note replaces the experimental banner (PREDICTED_NOTE); titles say Predicted Player Statistics;
 *   - between slates (no lane, ctx.today) the page lists today's scheduled games — matchup, tip-off, status — says the
 *     Official Forecast is not yet available, and links the newest frozen board; never a zero, never an invented figure;
 *   - postgame (ctx.actuals) each player's Actual from the final box score sits beside the frozen Official Forecast;
 *     a game without a usable final box score says why, once, in its line;
 *   - the slate dates are tap-sized chips at the top of the page, not a line under a 250-row table; the per-game
 *     freeze/receipt list is one tap away (<details>) and the method note sits under the board, so the filters lead.
 *
 * Public-readiness pass (founder mandate 2026-10-24): consumer language first. Headings say Predicted Player
 * Statistics, Official Forecast and Forecast vs. Actual; model ids, receipts, engine notes and the withheld list live in
 * one "Model details" disclosure (each model id once, not once per game). Game chips (island) carry each game's status
 * and its actual state; a finished slate without verified actuals says "awaiting final box scores" explicitly.
 *
 * Founder decision 2026-10-23 (behind its switch): each game's line in that list also carries the Elo rating's
 * game-winner probability from the shared accessor, with the accuracy disclosure once — the page hands in `eloCtx`
 * (this view still reads no file).
 */
import React from "react";
import Link from "next/link";
import type { Snapshot } from "@/components/nba/experimental-lane";
import type { BoardGame, BoardToday, SlateRole } from "@/components/nba/projection-board-context";
import type { BoardActuals, GameActualState } from "@/lib/sports/nba/projection-board-actuals";
import ProjectionBoard, { type BoardGameNav } from "@/components/nba/projection-board";
import GameStatusOnClock from "@/components/nba/projection-game-status";
import { COMBO_STATS, PROJECTION_BOARD_STATS, COMBO_LABEL } from "@/lib/sports/nba/experimental-public-lane.mjs";
import { EloAccuracyDisclosure, EloWinProbability, type EloCtx } from "@/components/nba/elo-win-probability";

const ELO_OFF: EloCtx = { enabled: false, disclosure: "" };
import { boardOptions, boardRows, packBoard, statGroups, GAME_STATUS_LABEL, slateHref, slateNav } from "@/lib/sports/nba/projection-board-ops.mjs";

const et = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " ET";
const slateLabel = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));
const dayLabel = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));
const tipEt = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " ET";
const MUTE = { color: "var(--vault-text-mute)" };
const CHIP = "inline-flex items-center min-h-[44px] rounded-full px-3 no-underline";
const CHIP_STYLE = { border: "1px solid var(--vault-border)", color: "var(--vault-text)" };

/** The one disclosure for these pages (release owner decision 2026-10-23; the same literal as the UI session's registry
    constant NBA_MODEL_PERFORMANCE_NOTE — switch to the import once both have merged). */
export const PREDICTED_NOTE = "NBA forecasts are graded after every game; a public Model Performance record for NBA has not been published yet.";
/** Why a FINAL game shows no actuals — once per game, in its line. */
const ACTUAL_UNAVAILABLE: Partial<Record<GameActualState, string>> = {
  "no-boxscore": "Actual: Unavailable (final box score not yet recorded)",
  "under-review": "Actual: Unavailable (final under review)",
  "points-disagree": "Actual: Unavailable (box score under review)",
};
/** The lane's own list of rostered players it could not project (PR 1230; optional — absent = not recorded). */
type LaneUnavailable = { providerAthleteId: string; name: string | null; position?: string | null; reason: string };
const laneUnavailable = (g: Snapshot["games"][number], side: "away" | "home"): LaneUnavailable[] | undefined =>
  (g.players as unknown as { unavailable?: Record<string, LaneUnavailable[]> }).unavailable?.[side];
/** Did this slate's publisher record who had no projection? */
const coverageRecorded = (lane: Snapshot) => lane.games.some((g) => laneUnavailable(g, "away") !== undefined || laneUnavailable(g, "home") !== undefined);

/**
 * Every player without a projection, with his team as the board names it: the lane's listed players (their reason
 * code, position and, after a verified final, the actuals) and, from the final box score, anyone else who played
 * ("P" — played, no projection). No forecast value is ever attached.
 */
function noProjectionRows(lane: Snapshot, a: BoardActuals | null) {
  const played = new Map((a?.unprojected ?? []).map((u) => [`${u.game}:${u.id}`, u]));
  const out: { name: string; game: string; team: string; teamName: string; code: string; pos: string | null; actual: (number | string | null)[] | null }[] = [];
  for (const g of lane.games) {
    for (const side of ["away", "home"] as const) {
      const t = g[side];
      for (const e of laneUnavailable(g, side) ?? []) {
        const key = `${g.providerEventId}:${e.providerAthleteId}`;
        out.push({ name: e.name ?? "", game: g.providerEventId, team: t.abbr ?? "", teamName: t.name ?? t.abbr ?? "", code: e.reason, pos: e.position ?? null, actual: played.get(key)?.actual ?? null });
        played.delete(key);
      }
    }
  }
  const byId = new Map(lane.games.map((g) => [g.providerEventId, g]));
  for (const u of played.values()) {
    const t = byId.get(u.game)![u.side];
    out.push({ name: u.name, game: u.game, team: t.abbr ?? "", teamName: t.name ?? t.abbr ?? "", code: "P", pos: null, actual: u.actual });
  }
  return out;
}
/** The same state, short, on a game chip. A recorded game needs no note; a game still to finish reads "awaiting final". */
const ACTUAL_CHIP: Partial<Record<GameActualState, string>> = {
  "no-final": "awaiting final",
  "no-boxscore": "box score pending",
  "under-review": "final under review",
  "points-disagree": "box score under review",
};
const TEXT = { color: "var(--vault-text)" };

/* One status word and at most one link per game, no inline styles (they inherit the list's colour) — the markup is
   emitted twice (HTML + RSC), so every byte here counts per game. A build-time "Upcoming" goes to the reader's-clock
   label (it may become "Started" after tip-off); every other status is fixed text from the committed record. */
function GameStatus({ g, actual }: { g: BoardGame; actual?: string }) {
  return (
    <>
      {" · "}<strong>{g.status === "upcoming" ? <GameStatusOnClock t={g.tipUtc} /> : GAME_STATUS_LABEL[g.status]}</strong>
      {actual ? ` · ${actual}` : null}
      {g.link ? <>{" · "}<a href={g.link.href} className="underline">{g.link.label}</a></> : null}
    </>
  );
}

/** Committed slate dates only (slateNav): the newest few plus this slate's neighbours — bounded, never invented. Tap-sized
    chips at the top of the page, so a phone reader finds them without scrolling past the board. */
function SlateDates({ dates, date, dated }: { dates: string[]; date: string | null; dated: boolean }) {
  const nav = slateNav(dates, dated ? date : null, 5);
  if (nav.total === 0) return null;
  const chip = (d: string, text: string) => <a key={d} href={slateHref(d)} className={CHIP} style={CHIP_STYLE}>{text}</a>;
  return (
    <nav className="m-0 flex flex-wrap items-center gap-2 text-[13px]" style={MUTE} aria-label="Slate dates">
      <span>Dates:</span>
      {dated ? <a href="/nba/projections/" className={CHIP} style={CHIP_STYLE}>Today&rsquo;s board</a> : null}
      {nav.recent.map((d) => (dated && d === date
        ? <span key={d} className={CHIP} style={{ ...CHIP_STYLE, borderColor: "var(--vault-gold-bright)" }}><strong aria-current="page">{slateLabel(d)}</strong></span>
        : chip(d, slateLabel(d))))}
      {nav.prev && !nav.recent.includes(nav.prev) ? chip(nav.prev, `earlier: ${slateLabel(nav.prev)}`) : null}
      {nav.next && !nav.recent.includes(nav.next) ? chip(nav.next, `later: ${slateLabel(nav.next)}`) : null}
    </nav>
  );
}

/** Between slates: today's scheduled games (schedule facts only) and the newest frozen board. No figure is shown. */
function TodaySlate({ today }: { today: BoardToday }) {
  const { games, latest } = today;
  const anyUpcoming = games.some((g) => g.status === "upcoming");
  return (
    <section className="flex flex-col gap-3" aria-labelledby="nba-today-h">
      <h2 id="nba-today-h" className="m-0 font-display text-[17px] font-bold" style={TEXT}>
        Today · {dayLabel(today.date)}{games.length ? ` · ${games.length} game${games.length === 1 ? "" : "s"}` : ""}
      </h2>
      <p className="m-0 text-[13.5px] leading-relaxed" style={TEXT} role="status">
        {!today.scheduled
          ? "Today's schedule is Unavailable in this build, and no Official Forecast is published for today yet."
          : games.length === 0
            ? `The schedule lists no NBA games for ${dayLabel(today.date)}.`
            : anyUpcoming
              ? "Official Forecast publishes before tip-off: not yet available."
              : "Official Forecast: Unavailable for this slate."}
      </p>
      {latest ? (
        <p className="m-0">
          <a href={slateHref(latest)} className={`${CHIP} font-semibold`} style={{ ...CHIP_STYLE, borderColor: "var(--vault-gold-bright)" }}>
            Latest Official Forecast · {dayLabel(latest)} →
          </a>
        </p>
      ) : null}
      {games.length ? (
        <ul className="m-0 pl-5 text-[13px] leading-relaxed" style={MUTE} aria-label={`Scheduled games, ${dayLabel(today.date)}`}>
          {games.map((g) => (
            <li key={g.id}>
              <span style={TEXT}>{g.away} at {g.home}</span> · {tipEt(g.tipUtc)} ·{" "}
              <strong>{g.status === "upcoming" ? <GameStatusOnClock t={g.tipUtc} /> : GAME_STATUS_LABEL[g.status]}</strong>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="m-0 text-[12px] leading-relaxed" style={MUTE}>
        Schedule and status from the committed NBA schedule and finals record. <Link href="/nba/" className="underline" style={TEXT}>NBA hub</Link>
      </p>
    </section>
  );
}

export default function NbaProjectionsView({ lane, role = "current", date = null, games = [], dates = [], dated = false, today = null, actuals = null, eloCtx = ELO_OFF }: {
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
  /** Between slates: today's schedule + the newest frozen board (projection-board-context). */
  today?: BoardToday | null;
  /** Postgame actuals for this slate's games (projection-board-actuals). */
  actuals?: BoardActuals | null;
  /** The Elo game-winner probability context (elo-win-probability-context.mjs), loaded by the page. */
  eloCtx?: EloCtx;
}) {
  const live = lane && lane.games.length > 0 ? lane : null;
  const past = role === "past";
  const slate = date ?? live?.date ?? null;
  const meta = new Map(games.map((g) => [g.id, g]));
  const stats = PROJECTION_BOARD_STATS.map(([k, l]) => [k, l] as const);
  const rows = live ? boardRows(live, PROJECTION_BOARD_STATS) : [];
  const { matchups, teams } = boardOptions(live);
  const groups = statGroups(PROJECTION_BOARD_STATS, COMBO_STATS.map(([k]) => k));
  // Postgame mode only when at least one game's actuals are recorded; otherwise the board is exactly the pregame one.
  const post = live && actuals && Object.values(actuals.games).includes("recorded") ? actuals : null;
  const stateOf = (id: string) => actuals?.games[id];
  // A game whose actuals are due (it tipped off, or the slate is past) but not shown says why on its chip.
  const due = (id: string) => past || (meta.get(id)?.status ?? "upcoming") !== "upcoming";
  const awaiting = new Set(live ? live.games.map((g) => g.providerEventId).filter((id) => stateOf(id) === "no-final") : []);
  const nav: BoardGameNav[] = live
    ? live.games.map((g) => {
        const st = stateOf(g.providerEventId);
        const note = st && st !== "recorded" && due(g.providerEventId) ? ACTUAL_CHIP[st] : undefined;
        return [g.providerEventId, `${g.away.abbr ?? g.away.name} @ ${g.home.abbr ?? g.home.name}`, meta.get(g.providerEventId)?.status ?? "upcoming", meta.get(g.providerEventId)?.tipUtc ?? g.tipUtc, ...(note ? [note] : [])] as BoardGameNav;
      })
    : [];
  const pendingActuals = live && !post && live.games.some((g) => due(g.providerEventId) && stateOf(g.providerEventId) !== "recorded");
  const models = live ? [...new Set(live.games.map((g) => g.receipt.modelVersion))] : [];
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-4 min-w-0">
      <p className="m-0 text-[13px]"><Link href="/nba/" className="underline" style={TEXT}>← NBA hub</Link></p>
      <h1 className="m-0 font-display text-[22px] font-bold" style={TEXT}>NBA Predicted Player Statistics{slate && (live || dated) ? ` · ${dayLabel(slate)}` : ""}</h1>
      <p className="m-0 text-[12.5px] leading-relaxed" style={MUTE} role="note">{PREDICTED_NOTE}</p>
      <SlateDates dates={dates} date={slate} dated={dated} />
      {past ? (
        <p className="m-0 rounded-md p-2 text-[13px] font-semibold" role="note" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)" }}>
          Past slate{slate ? ` · ${dayLabel(slate)}` : ""}. Every Official Forecast figure here was frozen before that day&rsquo;s
          tip-offs and is shown exactly as frozen, never updated after a game.{" "}
          <a href="/nba/projections/" className="underline">Today&rsquo;s board</a>
        </p>
      ) : null}
      {live ? (
        <>
          {post ? (
            <section className="flex flex-col gap-2" aria-labelledby="nba-fva-h">
              <h2 id="nba-fva-h" className="m-0 font-display text-[17px] font-bold" style={TEXT}>Forecast vs. Actual</h2>
              <p className="m-0 rounded-md p-2 text-[12.5px] leading-relaxed" role="note" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)" }}>
                <strong>Forecast</strong>: the Official Forecast, frozen before tip-off and never changed. <strong>Actual</strong>: the
                final box score (ESPN), after the official final. A dash means did not play &mdash; never a zero.
              </p>
            </section>
          ) : pendingActuals ? (
            <p className="m-0 rounded-md p-2 text-[12.5px] leading-relaxed" role="status" style={{ border: "1px dashed var(--vault-border)", color: "var(--vault-text)" }}>
              <strong>Forecast vs. Actual: awaiting final box scores.</strong> Each player&rsquo;s actual figures appear beside the
              frozen Official Forecast once that game&rsquo;s official final and box score are recorded.
            </p>
          ) : null}
          <p className="m-0 text-[12px] leading-relaxed" style={MUTE}>
            {coverageRecorded(live)
              ? "Every rostered player without a projection is listed as \u201cProjection unavailable\u201d with the reason the Official Forecast recorded; Out players are not listed."
              : `Coverage list not recorded for this slate.${post ? " Players who played without a projection are listed from the final box score." : ""}`}
          </p>
          <ProjectionBoard board={packBoard(rows, post ? post.rows : null, post ? awaiting : null, noProjectionRows(live, post))} stats={stats} groups={groups} matchups={matchups} teams={teams} games={nav} defaultGroup={post ? "core" : undefined} />
          {/* Model ids, receipts, engine notes and the withheld list: one tap away, each model id once. */}
          <details className="text-[12px]" style={MUTE}>
            <summary className="cursor-pointer min-h-[44px] py-3 underline decoration-dotted" style={TEXT}>
              Model details · freeze times, receipts and method · {live.games.length} game{live.games.length === 1 ? "" : "s"}
            </summary>
            <div className="flex flex-col gap-2 pb-2">
              <p className="m-0 leading-relaxed">
                Model: {models.join(", ")}. Source: {live.games[0].players.source}. PRA, P+R and P+A: {COMBO_LABEL} — the median of
                each simulated game&rsquo;s sum, so it need not equal the sum of the separate medians. Players with at least 10
                expected minutes who are not ruled out. The default order is expected minutes; a column sort is the reader&rsquo;s own.
                {games.length ? " Game status is read-only, from the schedule and finals record (Started: tipped off, no final recorded yet); it never changes a frozen figure." : ""}
                {post ? <> Forecast vs. Actual: PRA, P+R and P+A actuals add up the actual points, rebounds and assists; &ldquo;awaiting final&rdquo; means the game has no official final yet; &ldquo;Played, no projection&rdquo; and &ldquo;Projection unavailable&rdquo; mark players without an Official Forecast projection &mdash; their actuals are shown, no forecast is invented. Forecast and Actual are compared per player only.</> : null}
              </p>
              <ul className="m-0 pl-5 leading-relaxed" aria-label="Freeze times and receipts">
                {live.games.map((g) => (
                  <li key={g.providerEventId}>
                    {g.away.name} at {g.home.name}: tip-off {et(g.tipUtc)} · frozen {et(g.frozenAt)} · receipt {g.receipt.payloadSha256.slice(0, 12)}
                    <EloWinProbability game={g} ctx={eloCtx} className="block" />
                    {meta.has(g.providerEventId) ? <GameStatus g={meta.get(g.providerEventId)!} actual={actuals ? ACTUAL_UNAVAILABLE[actuals.games[g.providerEventId]] : undefined} /> : null}
                  </li>
                ))}
              </ul>
              <EloAccuracyDisclosure games={live.games} ctx={eloCtx} className="m-0 leading-relaxed" />
              <ul className="m-0 pl-5 leading-relaxed">
                {Object.entries(live.withheld).map(([k, v]) => <li key={k}>{v}</li>)}
              </ul>
            </div>
          </details>
        </>
      ) : today ? (
        <TodaySlate today={today} />
      ) : dated ? (
        <p className="m-0 text-[13.5px] leading-relaxed" style={MUTE} role="status">
          No Official Forecast is committed for {slate ? slateLabel(slate) : "this date"}, so no Predicted Player Statistics
          are shown for it. The <Link href="/nba/" className="underline" style={TEXT}>NBA hub</Link> has the schedule and official finals.
        </p>
      ) : (
        <p className="m-0 text-[13.5px] leading-relaxed" style={MUTE} role="status">
          Predicted Player Statistics: Unavailable. The <Link href="/nba/" className="underline" style={TEXT}>NBA hub</Link> has
          the schedule and official finals.
        </p>
      )}
    </div>
  );
}

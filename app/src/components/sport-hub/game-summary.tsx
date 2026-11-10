import type React from "react";
import Link from "next/link";
import TeamLogo from "@/components/team-logo";
import GameCard, { type GameCardModel } from "@/components/game/game-card";
import { orderRows, isInProgress, hubStatusDisplay, hubCounts, drawableSplit, type HubGameRow, type HubParticipant, type HubRead } from "@/lib/sport-hub/contract";

/**
 * The first thing on every sport page: what is on, what we think, and where to read it.
 *
 * TWO PRESENTATIONS, ONE INFORMATION PRIORITY. A table below `md`, squeezed, is the thing this
 * replaces — nested horizontal scrolling inside a page that also scrolls sideways. Mobile gets rows
 * as cards with the same order of importance; desktop gets the table. Neither hides a column.
 *
 * THE ACTION IS A LINK, not a row click. A whole-row handler cannot be tabbed to, cannot be opened
 * in a new tab, and swallows anything nested inside it. Each row's matchup IS the link, so keyboard
 * and middle-click both do what they should.
 */

/*
 * WEIGHT (2026-10-13): this card renders once per event on every hub, and a static export ships its markup
 * twice (server HTML + RSC flight). The repeated declarations live as classes in globals.css (.gtp-ev*,
 * .gtp-c-*), byte-for-byte what was inlined here — /epl had gone over its ceiling on one published
 * matchweek. Only per-instance values (a bar width) stay inline.
 */
const READ_TONE: Record<HubRead["kind"], { label: string; cls: string }> = {
  MODEL_FORECAST: { label: "model forecast", cls: "gtp-c-text" },
  MODEL_PICK: { label: "model pick", cls: "gtp-c-text" },
  MARKET_PRICE: { label: "market price", cls: "gtp-c-mute" },
  BASELINE_ONLY: { label: "baseline only", cls: "gtp-c-mute" },
};

const pct = (p: number) => `${Math.round(p * 100)}%`;

/** The owner's own outcome probabilities as one bar. Rendered only from drawableSplit — never a derived complement. */
function SplitBar({ split, favored, sides }: { split: Array<{ label: string; p: number }>; favored?: string; sides: string[] }) {
  return (
    <div>
      {/* Colour, opacity and the 2px gap come from .gtp-ev-bar (favoured segment: data-fav); the width is the owner's number. */}
      <div className="gtp-ev-bar flex h-1.5 w-full overflow-hidden rounded-full" aria-hidden>
        {split.map((s, i) => (
          <span key={`${s.label}-${i}`} data-fav={s.label === favored ? "" : undefined} style={{ width: `${Math.round(s.p * 10000) / 100}%` }} />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between gap-2 text-[12px] tabular-nums gtp-c-mute">
        {split.map((s, i) => (
          <span key={`${s.label}-${i}`} className={s.label === favored ? "gtp-ev-fav" : undefined}>
            {/* Sides sit directly above, in the same order, so a side's share prints as a number; an
                outcome that is not a side (a draw) keeps its word. */}
            {sides.includes(s.label) ? <span className="sr-only">{s.label} </span> : `${s.label} `}{pct(s.p)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * THE SHARED GAME CARD (2026-11-09): a hub row becomes ONE GameCardModel — the same model Home and Today render — and the
 * hub draws it as a card (.gtp-ev) or, on a schedule-only hub, a one-line row (.gtp-cr). A model read is the headline and
 * is tagged MODEL PROJECTION; a market price is shown muted and labelled as the market's (never tagged as ours).
 */
export function hubRowModel(r: HubGameRow, unitLabel: string): GameCardModel {
  const tone = r.read ? READ_TONE[r.read.kind] : null;
  const isModel = r.read?.kind === "MODEL_FORECAST" || r.read?.kind === "MODEL_PICK";
  const favored = isModel ? r.read?.favored : undefined;
  const favoredIsSide = Boolean(favored && r.participants?.some((p) => p.name === favored));
  const split = isModel ? drawableSplit(r.read) : null;
  const hasSides = Array.isArray(r.participants) && r.participants.length === 2;
  const live = r.reportState !== "NONE" && r.reportHref;
  return {
    id: String(r.id), startLabel: r.startLabel, statusLabel: hubStatusDisplay(r.status), matchup: r.matchup, separator: r.separator ?? "vs",
    sides: hasSides ? r.participants!.map((p) => ({ name: p.name, logo: p.logoTeam && p.logoSport ? { team: p.logoTeam, sport: p.logoSport } : null, favoured: favoredIsSide && p.name === favored, dim: favoredIsSide && p.name !== favored })) : null,
    facts: r.read ? [{ state: isModel ? "official" : null, text: r.read.label, sub: `${tone!.label}${r.read.detail ? ` · ${r.read.detail}` : ""}`, headline: isModel }] : [],
    visual: split ? <SplitBar split={split} favored={favored} sides={(r.participants ?? []).map((p) => p.name)} /> : null,
    actions: live ? [{ href: r.reportHref!, label: r.reportState === "ARCHIVE" ? "View archived report" : "Open report", primary: true, srLabel: `for ${r.matchup}` }] : [],
    noRead: `No supported read for this ${unitLabel.toLowerCase().replace(/s$/, "")}`,
    noAction: r.reportNote ?? "No report",
  };
}

function EventCard({ row: r, unitLabel, extra = null }: { row: HubGameRow; unitLabel: string; extra?: React.ReactNode }) {
  return <GameCard model={hubRowModel(r, unitLabel)} extra={extra} />;
}

/*
 * SESSION 11 — THE COMPACT ROW, FOR A SCHEDULE-ONLY HUB: the same facts in one line per game (now the shared card's
 * row density, .gtp-cr — one class per element, the weight rule that row was built for).
 */
function CompactRow({ row: r }: { row: HubGameRow }) {
  return <GameCard model={hubRowModel(r, "games")} density="row" />;
}

export default function GameSummary({
  rows, unitLabel, emptyReason, emptyCounts, emptyLink, compact = false, extras,
}: {
  rows: HubGameRow[]; unitLabel: string; emptyReason?: string; emptyCounts?: string; emptyLink?: { href: string; label: string }; compact?: boolean;
  /** Vehicle N: one extra control per row id beside the row's action (a hub's "Add to slip") — absent rows get nothing. */
  extras?: ReadonlyMap<string, React.ReactNode>;
}) {
  const ordered = orderRows(rows);
  const counts = hubCounts(rows);
  const live = ordered.filter(isInProgress);
  const upcoming = ordered.filter((r) => !r.started);
  const played = ordered.filter((r) => r.started && !isInProgress(r));

  /*
   * AN EMPTY PERIOD STILL COUNTS TO ZERO.
   *
   * This returned the reason alone and no counts, so a hub with nothing scheduled printed no numbers
   * at all — and a reader could not tell "we looked and there are none" from "this section did not
   * render". EPL hit it the moment its matchweek rolled past. Zero is an answer; it is printed.
   */
  if (ordered.length === 0) {
    return (
      <div>
        <p className="m-0 mb-2 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
          {emptyCounts ?? "0 scheduled · 0 with a report · 0 with a supported read"}
        </p>
        <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          {emptyReason ?? `No ${unitLabel.toLowerCase()} are scheduled for this period.`}
        </p>
        {emptyLink ? (
          <p className="m-0 mt-2 text-[13px]">
            <Link href={emptyLink.href} style={{ color: "var(--vault-gold)" }}>{emptyLink.label} →</Link>
          </p>
        ) : null}
      </div>
    );
  }

  /*
   * PHASE A (2026-09-29): ONE EVENT CARD, EVERY SPORT, EVERY WIDTH. The desktop table read as a spreadsheet —
   * no crests, the forecast a mono cell among four. Each event is now a card in the Live Hub's language:
   * who is playing (crest or initials), when, its lifecycle, the GameTimePicks read as the headline, and one
   * action. The information and its honesty rules are unchanged: the read's KIND is always printed, a market
   * price never takes the forecast's weight, and an event with no report says why instead of linking.
   */
  const Rows = ({ list, heading }: { list: HubGameRow[]; heading?: string }) => (
    <>
      {heading ? (
        <h3 className="mt-6 mb-2 text-[13px] font-semibold" style={{ color: "var(--vault-text-mute)" }}>{heading}</h3>
      ) : null}
      {compact ? (
        <ul className="m-0 p-0 list-none">{list.map((r) => <CompactRow key={r.id} row={r} />)}</ul>
      ) : (
        <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.map((r) => <EventCard key={r.id} row={r} unitLabel={unitLabel} extra={extras?.get(String(r.id)) ?? null} />)}
        </ul>
      )}
    </>
  );

  return (
    <div>
      {/* Counts a reader can check against the rows below. Scheduled and reportable are different
          numbers and are printed as different numbers. */}
      <p className="m-0 mb-3 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
        {counts.scheduled} scheduled · {counts.withReport} with a report · {counts.withRead} with a supported read
        {counts.started ? ` · ${counts.started} started or final` : ""}
      </p>
      {/* Founder UX decision 2026-10-08: games in play lead the list (the live strip above updates them in real time). */}
      {/* "at last update": the status is the schedule owner's at the page's last data refresh — a game may have ended
          since. The Live now strip above reads the live feed for the current state. */}
      {live.length ? <Rows list={live} heading="In progress at last update" /> : null}
      {upcoming.length ? <Rows list={upcoming} heading={live.length ? "Upcoming" : undefined} /> : null}
      {played.length ? <Rows list={played} heading="Started or final" /> : null}
    </div>
  );
}

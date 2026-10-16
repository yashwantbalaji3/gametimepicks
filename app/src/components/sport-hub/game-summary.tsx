import Link from "next/link";
import TeamLogo from "@/components/team-logo";
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

function Action({ row }: { row: HubGameRow }) {
  if (row.reportState === "NONE" || !row.reportHref) {
    return <span className="text-[12px] gtp-c-mute">{row.reportNote ?? "No report"}</span>;
  }
  return (
    <Link href={row.reportHref} className="vault-press gtp-ev-cta inline-flex items-center gap-1 rounded-full px-4 text-[13px] font-semibold no-underline">
      {row.reportState === "ARCHIVE" ? "View record" : "Open report"} <span aria-hidden>→</span>
      <span className="sr-only"> for {row.matchup}</span>
    </Link>
  );
}

/*
 * S1 (2026-09-30): THE MATCHUP IS THE CARD. The first version stacked both sides as 24px crests beside
 * abbreviations with the separator on a line of its own, so sixteen NFL games read as a list of
 * three-letter codes. Each side is now a column — a real crest (or initials), the name allowed to wrap
 * rather than truncate — facing the other across the separator, and the side the MODEL favours is the
 * brighter one. A market price never marks a favourite (HubRead.favored is model-only by contract).
 */
function Side({ p, favored, dim }: { p: HubParticipant; favored: boolean; dim: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      {p.logoTeam && p.logoSport
        ? <TeamLogo team={p.logoTeam} sport={p.logoSport} size="lg" highlight={favored} ariaLabel="" />
        : (
          <span aria-hidden className="inline-flex items-center justify-center rounded-full shrink-0 text-[15px] font-semibold"
            style={{ width: 52, height: 52, background: "var(--vault-wash-soft)", border: `1px solid ${favored ? "var(--vault-accent)" : "var(--vault-border)"}`, color: "var(--vault-text)" }}>
            {initials(p.name)}
          </span>
        )}
      <span className={`line-clamp-2 break-words text-[15px] font-semibold leading-tight ${dim ? "gtp-c-mute" : "gtp-c-text"}`}>
        {p.name}
      </span>
      {favored ? <span className="sr-only">(model favourite)</span> : null}
    </div>
  );
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

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

function EventCard({ row: r, unitLabel }: { row: HubGameRow; unitLabel: string }) {
  const hasSides = Array.isArray(r.participants) && r.participants.length === 2;
  const tone = r.read ? READ_TONE[r.read.kind] : null;
  const isModel = r.read?.kind === "MODEL_FORECAST" || r.read?.kind === "MODEL_PICK";
  const favored = isModel ? r.read?.favored : undefined;
  const favoredIsSide = Boolean(favored && r.participants?.some((p) => p.name === favored));
  const split = isModel ? drawableSplit(r.read) : null;
  return (
    <li className="gtp-ev rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium gtp-c-mute">{r.startLabel}</span>
        <span className="gtp-ev-status rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]">{hubStatusDisplay(r.status)}</span>
      </div>
      {hasSides ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2" aria-label={r.matchup}>
          <Side p={r.participants![0]} favored={favoredIsSide && r.participants![0].name === favored} dim={favoredIsSide && r.participants![0].name !== favored} />
          <span className="pt-5 text-[12px] font-medium gtp-c-mute">{r.separator ?? "vs"}</span>
          <Side p={r.participants![1]} favored={favoredIsSide && r.participants![1].name === favored} dim={favoredIsSide && r.participants![1].name !== favored} />
        </div>
      ) : (
        <div className="text-[16px] font-semibold gtp-c-text">{r.matchup}</div>
      )}
      <div className="gtp-ev-read rounded-xl px-3.5 py-3">
        {r.read ? (
          <>
            {/* A model read is the card's headline; a market price is shown, muted, and labelled as the market's. */}
            <div className={`${isModel ? "text-[18px] font-bold leading-snug" : "text-[14px]"} ${tone!.cls}`}>{r.read.label}</div>
            <div className="mt-0.5 text-[12px] gtp-c-mute">{tone!.label}{r.read.detail ? ` · ${r.read.detail}` : ""}</div>
            {split ? <div className="mt-3"><SplitBar split={split} favored={favored} sides={(r.participants ?? []).map((p) => p.name)} /></div> : null}
          </>
        ) : (
          <div className="text-[13px] gtp-c-mute">No supported read for this {unitLabel.toLowerCase().replace(/s$/, "")}</div>
        )}
      </div>
      <div className="mt-auto"><Action row={r} /></div>
    </li>
  );
}

/*
 * SESSION 11 — THE COMPACT ROW, FOR A SCHEDULE-ONLY HUB. The NBA hub lists every game in a ten-day window and
 * publishes no read, so each ~4KB card (two crests, an empty read box, a note) repeated "No supported read" on
 * every game and put /nba over its 200KB evidence budget at 32 games (≈100 once the regular season starts).
 * The same facts — when, who, lifecycle, the final or why there is no report — in one line per game. Every
 * game is still listed; a read, if one ever exists, is still printed with its kind.
 */
function CompactRow({ row: r }: { row: HubGameRow }) {
  const tone = r.read ? READ_TONE[r.read.kind] : null;
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-[13px]" style={{ borderBottom: "1px solid var(--vault-rule)" }}>
      <span className="text-[12px]" style={{ color: "var(--vault-text-mute)", minWidth: 150 }}>{r.startLabel}</span>
      {/* GTP-15: each side's crest, small and decorative (alt="" — the matchup text names both teams). */}
      <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: "var(--vault-text)" }}>
        {(r.participants ?? []).slice(0, 1).map((p) => p.logoTeam && p.logoSport ? <TeamLogo key={p.name} team={p.logoTeam} sport={p.logoSport} size="sm" ariaLabel="" /> : null)}
        {r.matchup}
        {(r.participants ?? []).slice(1, 2).map((p) => p.logoTeam && p.logoSport ? <TeamLogo key={p.name} team={p.logoTeam} sport={p.logoSport} size="sm" ariaLabel="" /> : null)}
      </span>
      <span className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-mute)" }}>{hubStatusDisplay(r.status)}</span>
      {r.read ? <span className={tone!.cls}>{r.read.label} <span className="gtp-c-mute">· {tone!.label}</span></span> : null}
      <span className="text-[12px]"><Action row={r} /></span>
    </li>
  );
}

export default function GameSummary({
  rows, unitLabel, emptyReason, emptyCounts, emptyLink, compact = false,
}: { rows: HubGameRow[]; unitLabel: string; emptyReason?: string; emptyCounts?: string; emptyLink?: { href: string; label: string }; compact?: boolean }) {
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
          {list.map((r) => <EventCard key={r.id} row={r} unitLabel={unitLabel} />)}
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

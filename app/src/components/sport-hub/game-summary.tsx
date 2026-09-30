import Link from "next/link";
import TeamLogo from "@/components/team-logo";
import { orderRows, hubCounts, drawableSplit, type HubGameRow, type HubParticipant, type HubRead } from "@/lib/sport-hub/contract";

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

const READ_TONE: Record<HubRead["kind"], { label: string; color: string }> = {
  MODEL_FORECAST: { label: "model forecast", color: "var(--vault-text)" },
  MODEL_PICK: { label: "model pick", color: "var(--vault-text)" },
  MARKET_PRICE: { label: "market price", color: "var(--vault-text-mute)" },
  BASELINE_ONLY: { label: "baseline only", color: "var(--vault-text-mute)" },
};

function Action({ row }: { row: HubGameRow }) {
  if (row.reportState === "NONE" || !row.reportHref) {
    return <span className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{row.reportNote ?? "No report"}</span>;
  }
  return (
    <Link href={row.reportHref} className="vault-press inline-flex items-center gap-1 rounded-full px-4 text-[13px] font-semibold no-underline" style={{ minHeight: 44, color: "var(--vault-text)", border: "1px solid var(--vault-border-strong)" }}>
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
        ? <TeamLogo team={p.logoTeam} sport={p.logoSport} size="lg" highlight={favored} ariaLabel={`${p.name} logo`} />
        : (
          <span aria-hidden className="inline-flex items-center justify-center rounded-full shrink-0 text-[15px] font-semibold"
            style={{ width: 52, height: 52, background: "var(--vault-wash-soft)", border: `1px solid ${favored ? "var(--vault-accent)" : "var(--vault-border)"}`, color: "var(--vault-text)" }}>
            {initials(p.name)}
          </span>
        )}
      <span className="line-clamp-2 break-words text-[15px] font-semibold leading-tight"
        style={{ color: dim ? "var(--vault-text-mute)" : "var(--vault-text)" }}>
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
      <div className="flex h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--vault-wash-soft)" }} aria-hidden>
        {split.map((s, i) => (
          <span key={`${s.label}-${i}`} style={{
            width: `${Math.round(s.p * 10000) / 100}%`,
            background: s.label === favored ? "var(--vault-accent)" : "var(--vault-text-faint)",
            opacity: s.label === favored ? 1 : 0.45,
            marginLeft: i ? 2 : 0,
          }} />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between gap-2 text-[12px] tabular-nums" style={{ color: "var(--vault-text-mute)" }}>
        {split.map((s, i) => (
          <span key={`${s.label}-${i}`} style={s.label === favored ? { color: "var(--vault-text)", fontWeight: 600 } : undefined}>
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
    <li className="rounded-2xl p-4 sm:p-5 flex flex-col gap-4" style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-border)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium" style={{ color: "var(--vault-text-mute)" }}>{r.startLabel}</span>
        <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-mute)", border: "1px solid var(--vault-border)" }}>{r.status}</span>
      </div>
      {hasSides ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2" aria-label={r.matchup}>
          <Side p={r.participants![0]} favored={favoredIsSide && r.participants![0].name === favored} dim={favoredIsSide && r.participants![0].name !== favored} />
          <span className="pt-5 text-[12px] font-medium" style={{ color: "var(--vault-text-mute)" }}>{r.separator ?? "vs"}</span>
          <Side p={r.participants![1]} favored={favoredIsSide && r.participants![1].name === favored} dim={favoredIsSide && r.participants![1].name !== favored} />
        </div>
      ) : (
        <div className="text-[16px] font-semibold" style={{ color: "var(--vault-text)" }}>{r.matchup}</div>
      )}
      <div className="rounded-xl px-3.5 py-3" style={{ background: "var(--vault-wash-faint)" }}>
        {r.read ? (
          <>
            {/* A model read is the card's headline; a market price is shown, muted, and labelled as the market's. */}
            <div className={isModel ? "text-[18px] font-bold leading-snug" : "text-[14px]"} style={{ color: tone!.color }}>{r.read.label}</div>
            <div className="mt-0.5 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{tone!.label}{r.read.detail ? ` · ${r.read.detail}` : ""}</div>
            {split ? <div className="mt-3"><SplitBar split={split} favored={favored} sides={(r.participants ?? []).map((p) => p.name)} /></div> : null}
          </>
        ) : (
          <div className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No supported read for this {unitLabel.toLowerCase().replace(/s$/, "")}</div>
        )}
      </div>
      <div className="mt-auto"><Action row={r} /></div>
    </li>
  );
}

export default function GameSummary({
  rows, unitLabel, emptyReason, emptyCounts, emptyLink,
}: { rows: HubGameRow[]; unitLabel: string; emptyReason?: string; emptyCounts?: string; emptyLink?: { href: string; label: string } }) {
  const ordered = orderRows(rows);
  const counts = hubCounts(rows);
  const upcoming = ordered.filter((r) => !r.started);
  const played = ordered.filter((r) => r.started);

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
      <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {list.map((r) => <EventCard key={r.id} row={r} unitLabel={unitLabel} />)}
      </ul>
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
      {upcoming.length ? <Rows list={upcoming} /> : null}
      {played.length ? <Rows list={played} heading="Started or final" /> : null}
    </div>
  );
}

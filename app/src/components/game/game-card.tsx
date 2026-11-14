/**
 * THE SHARED GAME CARD (founder acceptance 2026-11-09: "shared game-card component is the next UX deliverable").
 *
 * ONE component for a game wherever it is listed — Home, Today and the sport hubs — fed by ONE model. Two densities
 * of the same information, in the same order of importance (when → who → what the figure IS → where to go):
 *   card  the sport hubs' event card (.gtp-ev*): sides facing each other, a read box, one primary action
 *   row   one line per game (.gtp-cr*): Home's lane rows, Today's list and the schedule-only hub list
 * Every fact carries its GameStateTag (MODEL PROJECTION · SIMULATION hypothetical · LIVE SCORE · FINAL settled), so a
 * card never leaves a reader to guess whether a number is the forecast, a simulation, a live score or the result.
 * Pure presentation: every string arrives from the owner's adapter; this file decides no state and computes no figure.
 * Classes live in globals.css (one class per element — the hubs' page-weight rule).
 */
import React from "react";
import Link from "next/link";
import TeamLogo from "@/components/team-logo";
import GameStateTag, { type GameState } from "@/components/game/game-state-tag";

export type GameCardSide = { name: string; logo?: { team: string; sport: string } | null; favoured?: boolean; dim?: boolean };
export type GameCardFact = { state: GameState | null; text: string; sub?: string | null; headline?: boolean; aside?: React.ReactNode };
export type GameCardAction = { href: string; label: string; primary?: boolean; srLabel?: string; tone?: "result"; ariaLabel?: string; data?: Record<string, string>; after?: React.ReactNode };
export type GameCardModel = {
  id: string;
  startLabel: string;
  /** "Upcoming", "Final", "Postponed", a sport label on Today — printed as given */
  statusLabel?: string | null;
  /** Today: the sport name beside the time */
  kicker?: string | null;
  matchup: string;
  sides?: GameCardSide[] | null;
  separator?: string | null;
  facts: GameCardFact[];
  /** the read box's extra visual (a split bar) — card density only */
  visual?: React.ReactNode;
  actions: GameCardAction[];
  /** shown in place of the facts when there are none */
  noRead?: string | null;
  /** shown in place of the actions when there are none (why there is no report) */
  noAction?: string | null;
  /** compact: the element id other surfaces deep-link to (NBA: hubLaneAnchor's `nba-exp-<id>`) */
  anchorId?: string;
  /** compact: a status node instead of the label (NBA: the reader's-clock status for an upcoming game) */
  statusNode?: React.ReactNode;
  /** compact: a block after the facts (NBA: the model-vs-line summary when its switch is on) */
  afterFacts?: React.ReactNode;
};

function Side({ s }: { s: GameCardSide }) {
  return (
    <div className="gtp-ev-side flex min-w-0 flex-col items-center gap-2 text-center">
      {s.logo ? <TeamLogo team={s.logo.team} sport={s.logo.sport as never} size="lg" highlight={s.favoured} ariaLabel="" /> : (
        <span aria-hidden className="inline-flex items-center justify-center rounded-full shrink-0 text-[15px] font-semibold"
          style={{ width: 52, height: 52, background: "var(--vault-wash-soft)", border: `1px solid ${s.favoured ? "var(--vault-accent)" : "var(--vault-border)"}`, color: "var(--vault-text)" }}>
          {s.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
        </span>
      )}
      <span className={`line-clamp-2 break-words text-[15px] font-semibold leading-tight ${s.dim ? "gtp-c-mute" : "gtp-c-text"}`}>{s.name}</span>
      {s.favoured ? <span className="sr-only">(model favourite)</span> : null}
    </div>
  );
}

function Act({ a }: { a: GameCardAction }) {
  return a.primary ? (
    <Link href={a.href} className="vault-press gtp-ev-cta inline-flex items-center gap-1 rounded-full px-4 text-[13px] font-semibold no-underline">
      {a.label} <span aria-hidden>→</span>{a.srLabel ? <span className="sr-only"> {a.srLabel}</span> : null}
    </Link>
  ) : (
    <Link href={a.href} className={`gtp-gc-link${a.tone === "result" ? " is-result" : ""}`}>{a.label} →{a.srLabel ? <span className="sr-only"> {a.srLabel}</span> : null}</Link>
  );
}

/** Both names are abbreviations (NFL "BUF", NBA "OKC"): on a phone the crest and the name sit on one line (globals.css). */
export const shortSides = (sides: GameCardSide[]) => sides.every((x) => { const n = x.name.trim().length; return n > 0 && n <= 4; });

const Fact = ({ f }: { f: GameCardFact }) => <>{f.state ? <><GameStateTag state={f.state} />{" "}</> : null}{f.text}{f.aside ? <> · {f.aside}</> : null}</>;

export default function GameCard({ model: m, density = "card", extra = null }: { model: GameCardModel; density?: "card" | "row" | "compact"; extra?: React.ReactNode }) {
  if (density === "compact") {
    /* COMPACT CARD — the dense hub grid (NBA: up to 15 a night inside the /nba page-weight budget). One class per element
       (.nbx-* in globals.css), crests at 24px, the tagged facts, ONE link to the game and the page's own extras. */
    return (
      <li id={m.anchorId} className="nbx-card">
        <p className="nbx-top"><span>{m.startLabel}</span><span className="nbx-chip">{m.statusNode ?? m.statusLabel}</span></p>
        {m.sides?.length === 2 ? (
          <h3 className="nbx-match">
            {m.sides[0].logo ? <TeamLogo team={m.sides[0].logo.team} sport={m.sides[0].logo.sport as never} size="sm" highlight={m.sides[0].favoured} ariaLabel="" /> : <span />}
            <b data-on={m.sides[0].favoured ? "" : undefined}>{m.sides[0].name}</b><i>{m.separator ?? "@"}</i><b data-on={m.sides[1].favoured ? "" : undefined}>{m.sides[1].name}</b>
            {m.sides[1].logo ? <TeamLogo team={m.sides[1].logo.team} sport={m.sides[1].logo.sport as never} size="sm" highlight={m.sides[1].favoured} ariaLabel="" /> : <span />}
          </h3>
        ) : <h3 className="nbx-match">{m.matchup}</h3>}
        {m.facts.length ? <div className="nbx-read">{m.facts.map((f, i) => (f.headline ? <strong key={i}><Fact f={f} /></strong> : <p key={i}><Fact f={f} /></p>))}</div> : null}
        {m.afterFacts ?? null}
        {m.actions.length || extra ? (
          <p className="nbx-acts">
            {m.actions.map((a) => <React.Fragment key={a.href}><Link href={a.href} prefetch={false} aria-label={a.ariaLabel} {...(a.data ?? {})}>{a.label} →</Link>{a.after ?? null}</React.Fragment>)}
            {extra}
          </p>
        ) : null}
      </li>
    );
  }
  if (density === "row") {
    return (
      <li className="gtp-cr" data-game-card="row">
        <span className="gtp-cr-t">{m.startLabel}{m.kicker ? ` · ${m.kicker}` : ""}</span>
        <span className="gtp-cr-m">
          {m.sides?.[0]?.logo ? <TeamLogo team={m.sides[0].logo.team} sport={m.sides[0].logo.sport as never} size="sm" ariaLabel="" /> : null}
          {m.actions[0] && !m.actions[0].tone ? <Link href={m.actions[0].href} className="gtp-gc-m">{m.matchup} →</Link> : m.matchup}
          {m.sides?.[1]?.logo ? <TeamLogo team={m.sides[1].logo.team} sport={m.sides[1].logo.sport as never} size="sm" ariaLabel="" /> : null}
        </span>
        {m.statusLabel ? <span className="gtp-cr-s">{m.statusLabel}</span> : null}
        {m.facts.length ? m.facts.map((f, i) => <span key={i} className="gtp-gc-fact"><Fact f={f} />{f.sub ? <span className="gtp-c-mute"> · {f.sub}</span> : null}</span>)
          : m.noRead ? <span className="gtp-c-mute">{m.noRead}</span> : null}
        {m.actions.slice(m.actions[0] && !m.actions[0].tone ? 1 : 0).map((a) => <span key={a.href} className="gtp-cr-a"><Act a={a} /></span>)}
        {/* no link at all: say why (the hubs' "not modelled — no tracked history", "No report"), as the compact row always did */}
        {m.actions.length === 0 && m.noAction ? <span className="gtp-cr-a gtp-c-mute">{m.noAction}</span> : null}
        {extra}
      </li>
    );
  }
  const head = m.facts.find((f) => f.headline) ?? m.facts[0] ?? null;
  return (
    <li className="gtp-ev rounded-2xl p-4 sm:p-5 flex flex-col gap-4" data-game-card="card" data-game-id={m.id}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium gtp-c-mute">{m.startLabel}</span>
        {m.statusLabel ? <span className="gtp-ev-status rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]">{m.statusLabel}</span> : null}
      </div>
      {m.sides?.length === 2 ? (
        <div className="gtp-ev-sides grid grid-cols-[1fr_auto_1fr] items-start gap-2" data-short={shortSides(m.sides) ? "" : undefined} aria-label={m.matchup}>
          <Side s={m.sides[0]} />
          <span className="pt-5 text-[12px] font-medium gtp-c-mute">{m.separator ?? "vs"}</span>
          <Side s={m.sides[1]} />
        </div>
      ) : (
        <div className="text-[16px] font-semibold gtp-c-text">{m.matchup}</div>
      )}
      <div className="gtp-ev-read rounded-xl px-3.5 py-3">
        {head ? (
          <>
            {head.state ? <div className="mb-1"><GameStateTag state={head.state} /></div> : null}
            <div className={head.headline ? "text-[18px] font-bold leading-snug gtp-c-text" : "text-[14px] gtp-c-mute"}>{head.text}</div>
            {head.sub ? <div className="mt-0.5 text-[12px] gtp-c-mute">{head.sub}</div> : null}
            {m.visual ? <div className="mt-3">{m.visual}</div> : null}
            {m.facts.filter((f) => f !== head).map((f, i) => <div key={i} className="mt-2 text-[13px] gtp-c-mute"><Fact f={f} /></div>)}
          </>
        ) : <div className="text-[13px] gtp-c-mute">{m.noRead ?? "No supported read for this game"}</div>}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {m.actions.length ? m.actions.map((a) => <Act key={a.href} a={a} />) : <span className="text-[12px] gtp-c-mute">{m.noAction ?? "No report"}</span>}
        {extra}
      </div>
    </li>
  );
}

/**
 * ONE READER FOR A SPORT'S PUBLISHED RISK LADDER — shape shared, claim never.
 *
 * /build renders MLB's ladder through RiskLadderBoard, a component built around a mature stream:
 * swap pools, a settled ledger, a returns figure, bettor tiers. UFC and EPL have none of those, and
 * borrowing it would dress a young lane in a maturity it has not earned — an empty record slot reads
 * as a measured zero rather than an absent one.
 *
 * THE THING THIS EXISTS TO PREVENT. The three ladders do not choose their sides the same way, and
 * the difference is not cosmetic. UFC selects on ITS MODEL, because that model passed its
 * preregistered bar. EPL and MLB select on PRICE, because theirs did not — EPL's has never been
 * scored against a no-vig line at all, and would currently pick Hull City to beat Manchester United.
 * A shared component that wrote its own sentence would eventually render one sport's cards under
 * another's claim, and the honest and dishonest versions look identical on the page.
 *
 * So the sentence is not written here. Each ladder builder states how it selected, on the artifact,
 * and this reader carries it through. A ladder that does not say is refused rather than narrated.
 */
import fs from "node:fs";
import path from "node:path";

import { RISK_ORDER } from "../prefs/bettor-tiers.mjs";
import { substituteOffer } from "./risk-substitute.mjs";

export interface SportLabLeg {
  eventId: string;
  /** The named participant, where the sport has one. Null for a team market like a draw. */
  player: string | null;
  team: string | null;
  matchup?: string | null;
  opponent?: string | null;
  market: string;
  marketLabel: string;
  side: string;
  odds: number;
  /** The fighter's portrait, carried on the leg so a surface never re-joins a name to find a face. */
  photoUrl?: string | null;
}

export interface SportLabCard {
  tier: string;
  slipId: string;
  combinedAmerican: number;
  legs: SportLabLeg[];
  /** Null, never 0-0 — a zeroed record reads as a measured result rather than an absent one. */
  tierRecord: null;
}

export interface SportLabLadder {
  sport: string;
  date: string;
  generatedAt: string;
  cards: SportLabCard[];
  skipped: Array<{ tier: string; reason: string }>;
  /** How this sport chose the side on every leg. Read from the artifact, never composed here. */
  selection: string;
  moneyClass: string;
  /** Named event, where the sport has one (a fight card does; a football slate does not). */
  eventName: string | null;
}

/** One band that produced nothing, and the card a reader is pointed at instead. */
export interface BandSubstitute {
  /** The band that came up empty. */
  band: string;
  /** The band whose card is offered in its place. */
  offered: string;
  slipId: string | null;
  /** Reader-facing. States the DIRECTION of the swap, because that is the whole content of it. */
  note: string;
}

/*
 * A BAND THAT CAME UP EMPTY GETS A LABELLED SUBSTITUTE — NOT A WIDENED THRESHOLD.
 *
 * `low` is -200 to +100, so a two-leg card has to combine to 2.00 decimal or shorter: both legs at
 * roughly -242 or shorter. No slate reaches that at the leg-quality bar, and the honest reading is
 * that a genuinely low-risk PARLAY mostly does not exist. Moving the boundary to make one appear
 * would relabel a medium card as low, which is the one thing that must never happen: the band IS
 * the risk statement.
 *
 * The tier grid already settled this shape for MLB bankroll tiers, and the rule is reused verbatim
 * rather than re-derived: offer the CALMEST card on the board, never the next rung up. A reader
 * handed a fallback should land on the mildest thing available instead of being walked up the
 * ladder. That means a substitute is sometimes calmer than the band asked for and sometimes longer,
 * so the note is DERIVED from the actual comparison — a hardcoded "this is riskier" would be a lie
 * half the time, and a wrong risk direction is worse than no substitute at all.
 */
export function deriveBandSubstitutes(ladder: SportLabLadder): BandSubstitute[] {
  /*
   * P196 · Release B2: the selection rule, the direction derivation and the wording now live in
   * risk-substitute.mjs — ONE owner shared with the /build tier grid. This function keeps only
   * what is local: reading this ladder's cards/skips and threading each skip's MEASURED cause
   * (the prices the slate actually reached) into the note.
   */
  const order = RISK_ORDER as readonly string[];
  const byBand = new Map(ladder.cards.map((c) => [c.tier, c]));
  const available = ladder.cards.map((c) => c.tier);
  return ladder.skipped
    .map((s) => {
      const offer = substituteOffer({ riskOrder: order, availableBands: available, emptyBand: s.tier, measuredCause: s.reason ?? null });
      if (!offer) return null;
      return {
        band: offer.band,
        offered: offer.offered,
        slipId: (byBand.get(offer.offered) as { slipId?: string } | undefined)?.slipId ?? null,
        note: offer.note,
      };
    })
    .filter((x): x is BandSubstitute => x !== null);
}

/** ET, never a UTC slice — a ladder published at 21:00 ET must not read as tomorrow's. */
const etToday = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

const DIRS: Record<string, string> = {
  mlb: "risk-ladder",
  ufc: "risk-ladder-ufc",
  epl: "risk-ladder-epl",
  // P201: the NFL lane publishes (or types its refusal) since the settler gained gradeNflLeg.
  nfl: "risk-ladder-nfl",
};

/**
 * Read one sport's published ladder for a given slate day.
 *
 * REFUSES A LADDER FOR A DIFFERENT DAY. Ladders are dated by the day of their FIXTURES, which is
 * frequently not the day the run happened — EPL's night-before slot fires on Friday for Saturday,
 * and UFC's ran on a Tuesday for a Saturday card. Serving one regardless is how a set of cards came
 * to carry three different dates at once: written 08-18, fighting 08-22, published as 08-21.
 *
 * REFUSES A LADDER THAT DOES NOT SAY HOW IT SELECTED. There is no default, because every available
 * default is a claim about a model, and the wrong one is worse than silence.
 */
export function loadSportLabLadder(sport: string, slateDay: string | null): SportLabLadder | null {
  const dir = DIRS[sport];
  if (!dir || !slateDay) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/parlays", dir, "latest.json"), "utf8"));
    if (raw?.date !== slateDay) return null;
    if (raw?.state && raw.state !== "PUBLISHED") return null;
    if (typeof raw?.selection !== "string" || !raw.selection.trim()) return null;
    if (!Array.isArray(raw.cards) || raw.cards.length === 0) return null;
    return {
      sport,
      date: raw.date,
      generatedAt: raw.generatedAt,
      cards: raw.cards,
      skipped: raw.skipped ?? [],
      selection: raw.selection,
      moneyClass: raw.moneyClass ?? "NON_MONEY",
      eventName: raw.event?.name ?? null,
    };
  } catch {
    return null;
  }
}

/** American odds as a reader writes them. */
export const fmtAmerican = (n: number) => `${n > 0 ? "+" : ""}${n}`;

/** What a leg says on the page, in the sport's own terms. */
export function legLabel(l: SportLabLeg): string {
  if (l.player) return l.opponent ? `${l.player} to beat ${l.opponent}` : l.player;
  if (l.side === "draw" && l.matchup) return `${l.matchup} — draw`;
  return `${l.team ?? l.matchup ?? "—"} — ${l.marketLabel.toLowerCase()}`;
}

/**
 * The lane's CURRENT ladder, whatever day it is dated for.
 *
 * loadSportLabLadder refuses a ladder whose date does not match the day asked for — which is right
 * on a sport hub, where showing another card's prices under today's heading is the defect it exists
 * to prevent. A dedicated product page is asking a different question: "what is this lane's current
 * ladder", not "what is today's". So it reads the date off the artifact and then goes back through
 * the same loader, keeping every other refusal (unpublished, no selection, no cards) intact.
 */
export function loadCurrentSportLabLadder(sport: string, todayEt: string = etToday()): SportLabLadder | null {
  const dir = DIRS[sport];
  if (!dir) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/parlays", dir, "latest.json"), "utf8"));
    const date = typeof raw?.date === "string" ? raw.date : null;
    /*
     * "CURRENT" MEANS TODAY OR LATER. IT NEVER MEANS "THE MOST RECENT FILE".
     *
     * This accepted whatever date the artifact carried, and on 2026-08-23 that made /cards/ufc show
     * the 2026-08-22 card — fought the previous night — under the heading "Today's ladder", with
     * prices captured before it started. The card date was printed beside it, which is exactly the
     * kind of correct detail that does not rescue a wrong heading.
     *
     * Relaxing the day match was right for a product page: a ladder legitimately runs ahead of
     * today, and EPL's now rolls to the next servable slate, which this week is six days out.
     * Running BEHIND is a different thing entirely, and it is the freshness defect this repo has
     * already had in several shapes. Ahead is a product; behind is stale.
     */
    if (!date || date < todayEt) return null;
    return loadSportLabLadder(sport, date);
  } catch {
    return null;
  }
}

/**
 * How a ladder's own day should be named where it is shown.
 *
 * The caption was the literal string "Today's ladder" at both call sites, which was true when every
 * ladder was for today and false the moment one legitimately ran ahead. A caption that cannot be
 * wrong is worth more than one that is usually right.
 */
export function ladderDayLabel(date: string, todayEt: string = etToday()): string {
  if (date === todayEt) return "Today's ladder";
  const t = Date.parse(`${todayEt}T00:00:00Z`), d = Date.parse(`${date}T00:00:00Z`);
  if (Number.isFinite(t) && Number.isFinite(d) && Math.round((d - t) / 86_400_000) === 1) return "Tomorrow's ladder";
  const named = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" })
    .format(new Date(`${date}T12:00:00Z`));
  return `Ladder for ${named}`;
}

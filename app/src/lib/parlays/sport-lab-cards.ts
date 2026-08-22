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

const DIRS: Record<string, string> = {
  mlb: "risk-ladder",
  ufc: "risk-ladder-ufc",
  epl: "risk-ladder-epl",
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
export function loadCurrentSportLabLadder(sport: string): SportLabLadder | null {
  const dir = DIRS[sport];
  if (!dir) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/parlays", dir, "latest.json"), "utf8"));
    return loadSportLabLadder(sport, typeof raw?.date === "string" ? raw.date : null);
  } catch {
    return null;
  }
}

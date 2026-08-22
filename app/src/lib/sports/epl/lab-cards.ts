/**
 * THE EPL LAB CARDS — one reader for the published risk ladder.
 *
 * The lane went live and its cards reached no page. /build renders MLB's ladder through
 * RiskLadderBoard, a component built around a mature stream — swap pools, a settled ledger, a
 * returns record, bettor tiers. EPL has none of those, and borrowing that component would dress this lane in
 * a maturity it has not earned: an empty record slot reads as a measured zero, and a swap pool
 * implies alternatives that were considered.
 *
 * So this is a deliberately small reader for a deliberately small surface. It exposes what the
 * ladder actually published and the bands it could not fill, and nothing else.
 *
 * THE ONE THING A READER MUST NOT CONFLATE. /epl is full of model output. These cards are NOT model
 * output — the side on each leg is the MARKET'S own favourite at its posted price, because the EPL
 * model has cleared no bar and has never been scored against a no-vig line. `selection` says so, in
 * the loader rather than at the call site, so a page cannot render the cards without it.
 */
import fs from "node:fs";
import path from "node:path";

export interface EplLabLeg {
  eventId: string;
  matchup: string;
  team: string | null;
  side: string;
  market: string;
  marketLabel: string;
  odds: number;
  kickoffUtc: string;
}

export interface EplLabCard {
  tier: string;
  slipId: string;
  combinedAmerican: number;
  legs: EplLabLeg[];
  /** Null, never 0-0 — this stream has settled nothing and a zero would read as a measured result. */
  tierRecord: null;
}

export interface EplLabLadder {
  date: string;
  generatedAt: string;
  cards: EplLabCard[];
  skipped: Array<{ tier: string; reason: string }>;
  pricedFixtures: number;
  /** How the side on every leg was chosen. Carried WITH the cards so it cannot be dropped. */
  selection: string;
  moneyClass: string;
}

const ARTIFACT = "public/data/parlays/risk-ladder-epl/latest.json";

/**
 * Read the published ladder for a given slate day.
 *
 * REFUSES A LADDER FOR A DIFFERENT DAY. The ladder is built for the day of its FIXTURES, which is
 * frequently not the day the run happened — the night-before slot fires on Friday to serve Saturday.
 * Returning it regardless would put Saturday's cards under a Friday heading, which is a real ladder
 * wearing the wrong date and worse than showing nothing.
 */
export function loadEplLabLadder(slateDay: string | null): EplLabLadder | null {
  if (!slateDay) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), ARTIFACT), "utf8"));
    if (raw?.state !== "PUBLISHED" || raw.date !== slateDay) return null;
    return {
      date: raw.date,
      generatedAt: raw.generatedAt,
      cards: raw.cards ?? [],
      skipped: raw.skipped ?? [],
      pricedFixtures: raw.pricedFixtures ?? 0,
      selection: "the market's own favourite at its posted price — not this model's read",
      moneyClass: raw.moneyClass ?? "NON_MONEY",
    };
  } catch {
    return null;
  }
}

/** American odds as a reader writes them. */
export const fmtAmerican = (n: number) => `${n > 0 ? "+" : ""}${n}`;

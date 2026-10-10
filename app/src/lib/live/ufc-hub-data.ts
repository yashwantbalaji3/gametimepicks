/**
 * /live UFC — server-side roster (UFC-001). NODE ONLY; never imported by a client component.
 *
 * The static half of the UFC tab: for TODAY's card (ET), everything knowable at build time — the
 * bouts in the card's own order (main event first), both fighters with their ESPN athlete ids and
 * portraits, the frozen pregame pick and its win chance, and the canonical settlement row when the
 * graded ledger has produced one. The moving half (state, round, clock, provider final) arrives at
 * read time from ONE batch gateway call and is joined by the ESPN bout id.
 *
 * ⚠ THE PREGAME PICK IS READ, NEVER RECOMPUTED. It is `card-latest.json`'s `prediction.winner`
 *   exactly as published — the same values the pre-card snapshot of record froze (pinned by a test
 *   against `snapshot-202610091844.json`). The internal snapshot itself is never read here: it is
 *   INTERNAL_RESEARCH and carries the market price, which this public page does not publish.
 *
 * ⚠ THE SETTLEMENT IS THE LEDGER'S, NEVER THE FEED'S. A bout is settled here only when the public
 *   graded record (`ufc/graded-picks.json`, built from the append-only graded ledger) carries a row
 *   under the bout's canonical key — the key the snapshot capture itself mints from this card
 *   (`boutKey(slateDate, red.name, blue.name)`) — AND that row's pick is this card's pick, exactly.
 *   Anything else is no settlement, so the bout waits in "awaiting official result".
 *
 * ⚠ THE ROSTER MAKES NO CLAIM ABOUT THE PRESENT. No "live" or "started" field exists on it.
 */
import fs from "node:fs";
import path from "node:path";

import { currentEtDate } from "@/lib/freshness";
import { boutPositionLabel } from "@/lib/sports/ufc/bout";
import { boutKey } from "@/lib/sports/ufc/model-vs-market.mjs";
import { predictedWinnerAthleteId } from "./adapters/ufc-tracked.mjs";

export interface UfcRosterFighter {
  /** ESPN athlete id — the identity the live feed states for each competitor. */
  athleteId: string | null;
  name: string;
  record: string | null;
  photoUrl: string | null;
}

export interface UfcRosterPregame {
  pickName: string;
  /** Resolved by exact equality against this bout's own two names; null if neither matched. */
  pickAthleteId: string | null;
  opponentName: string | null;
  /** The model's published win chance for the pick, 0–1, exactly as the card states it. */
  winChance: number;
  modelId: string | null;
  /** When the card carrying this pick was generated (UTC ISO). */
  publishedAt: string | null;
}

export interface UfcRosterSettlement {
  winnerName: string | null;
  /** True/false only when the ledger graded the pick; null for a settled bout with no graded outcome. */
  hit: boolean | null;
  /** The graded record's own generation instant. */
  asOf: string | null;
}

export interface UfcRosterBout {
  /** ESPN competition id — the join key to the live envelope's eventId. */
  boutId: string;
  canonicalBoutKey: string;
  href: string;
  position: string;
  startUtc: string | null;
  weightClass: string | null;
  scheduledRounds: number | null;
  titleFight: boolean;
  red: UfcRosterFighter;
  blue: UfcRosterFighter;
  pregame: UfcRosterPregame | null;
  unmodelledReason: string | null;
  settlement: UfcRosterSettlement | null;
}

export interface UfcHubRoster {
  /** The ET date the roster is for — the card's slate date, which is today's at build time. */
  etDate: string;
  eventName: string | null;
  providerEventId: string | null;
  startUtc: string | null;
  bouts: UfcRosterBout[];
  /** True when a card artifact exists at all, whatever its date. */
  cardPresent: boolean;
}

const str = (x: unknown): string | null => (typeof x === "string" && x.length ? x : null);
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

function fighter(c: any): UfcRosterFighter {
  return {
    athleteId: c?.athleteId != null && c.athleteId !== "" ? String(c.athleteId) : null,
    name: String(c?.name ?? ""),
    record: str(c?.record),
    photoUrl: str(c?.photoUrl),
  };
}

/**
 * The settlement rows of the public graded record, keyed by canonical bout key. Fight-winner rows only.
 */
function settlementIndex(graded: any): Map<string, any> {
  const out = new Map<string, any>();
  for (const p of graded?.picks ?? []) {
    if (p?.market !== "Fight winner" || typeof p?.eventId !== "string") continue;
    out.set(p.eventId, p);
  }
  return out;
}

/**
 * Pure: the roster for one card on one ET date. A card for any other date yields NO bouts — a tab
 * onto another day's card would be a claim about tonight that the page cannot keep.
 */
export function buildUfcRosterFrom({ card, graded, etDate }: { card: any; graded: any; etDate: string }): UfcHubRoster {
  const slateDate = str(card?.event?.slateDate);
  const base: UfcHubRoster = {
    etDate,
    eventName: str(card?.event?.name),
    providerEventId: str(card?.event?.providerEventId),
    startUtc: str(card?.event?.startUtc),
    bouts: [],
    cardPresent: Boolean(card),
  };
  if (!card || slateDate !== etDate) return base;

  const settled = settlementIndex(graded);
  const gradedAsOf = str(graded?.generatedAt);
  const all: any[] = Array.isArray(card?.bouts) ? card.bouts : [];

  all.forEach((b, i) => {
    if (b?.boutId === undefined || b?.boutId === null || b.boutId === "") return; // unjoinable ⇒ no card
    const red = fighter(b.red);
    const blue = fighter(b.blue);
    const w = b?.prediction?.winner;
    const winChance = num(w?.probability);
    const pickName = str(w?.name);
    const pregame: UfcRosterPregame | null = !b?.unmodelledReason && pickName && winChance !== null
      ? {
        pickName,
        pickAthleteId: predictedWinnerAthleteId(b),
        opponentName: pickName === red.name ? blue.name : pickName === blue.name ? red.name : null,
        winChance,
        modelId: str(card?.model?.id),
        publishedAt: str(card?.generatedAt),
      }
      : null;

    const key = boutKey(slateDate, red.name, blue.name);
    const row = settled.get(key);
    /* The ledger row must be about THIS pick, exactly — otherwise it is no settlement of ours. */
    const settlement: UfcRosterSettlement | null = row && pregame && row.predicted === pregame.pickName
      ? {
        winnerName: row.actual === red.name || row.actual === blue.name ? row.actual : null,
        hit: typeof row.hit === "boolean" ? row.hit : null,
        asOf: gradedAsOf,
      }
      : null;

    base.bouts.push({
      boutId: String(b.boutId),
      canonicalBoutKey: key,
      href: `/ufc/bout/${String(b.boutId)}/`,
      position: boutPositionLabel(i, all.length),
      startUtc: str(b?.startUtc),
      weightClass: str(b?.weightClass),
      scheduledRounds: num(b?.scheduledRounds),
      titleFight: b?.titleFight === true,
      red,
      blue,
      pregame,
      unmodelledReason: str(b?.unmodelledReason),
      settlement,
    });
  });
  return base;
}

const readJson = (rel: string) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", rel), "utf8"));
  } catch {
    return null;
  }
};

/** Today's UFC roster. `nowIso` is injectable so tests pin a date. */
export function buildUfcHubRoster(nowIso?: string): UfcHubRoster {
  const etDate = currentEtDate(nowIso ? new Date(nowIso) : undefined);
  return buildUfcRosterFrom({
    card: readJson("ufc/card-latest.json"),
    graded: readJson("ufc/graded-picks.json"),
    etDate,
  });
}

/**
 * THE PRODUCT-DAY AUTHORITY — one provider-neutral answer per sport per ET day (Program 201 · A1).
 *
 * Public surfaces had each grown their own way of answering "what does this sport have today?":
 * the homepage read four artifacts inline, /today counted the MLB board, hubs counted their own
 * files, and an empty array meant whatever the surface decided it meant. This module is the one
 * owner of that answer. Each sport adapter reads the sport's CANONICAL artifacts (never a provider,
 * never the network) and returns the same typed shape; states are DECLARED, never inferred from an
 * empty list by the consumer.
 *
 * States (distinct by contract — the charter forbids collapsing them):
 *   LIVE          — events on today's slate with the sport's product artifacts current
 *   EVENT_UPCOMING— no event today, but a dated slate is published ahead (UFC cards, EPL matchdays)
 *   NO_EVENTS     — in season, no events on this ET day, sources current
 *   OFF_SEASON    — the sport's own calendar says out of season
 *   SOURCE_STALE  — the newest artifact is older than the sport's freshness bar
 *   BLOCKED       — a named gate holds the sport's product closed (reason carried)
 *   INCIDENT      — the artifact exists but is unreadable/contradictory (reason carried)
 *
 * Adapters may only read committed artifacts through lane-owned loaders where a lane has one
 * (EPL's closeout guard is the precedent). Money is never read here; this is slate truth only.
 */
import fs from "node:fs";
import path from "node:path";

import { activeMlbDate, getMlbBoardForDate } from "@/lib/data-mlb";
import { loadEplForecasts } from "@/lib/sports/epl/forecast-view";

export const PRODUCT_DAY_SCHEMA_VERSION = 1;

export type ProductDayState =
  | "LIVE" | "EVENT_UPCOMING" | "NO_EVENTS" | "OFF_SEASON" | "SOURCE_STALE" | "BLOCKED" | "INCIDENT";

export interface ProductDay {
  schemaVersion: number;
  sport: "mlb" | "epl" | "ufc" | "nfl";
  /** The ET product date this answer is FOR (the presented slate day). */
  productDate: string;
  state: ProductDayState;
  /** Events on the product date (0 when the state explains why). */
  events: number;
  /** Events the sport's own product layer can act on (modelled/predicted/simulated). */
  eligible: number;
  /** ISO stamp of the newest canonical artifact consulted. */
  sourceStamp: string | null;
  /** The next dated thing this sport will do, when the artifact names one. */
  nextEventUtc: string | null;
  /** One plain-English line a surface may render verbatim. */
  note: string;
  /** Present only for BLOCKED / INCIDENT / SOURCE_STALE — the typed reason. */
  reason: string | null;
}

const readJson = (root: string, ...seg: string[]) => {
  try { return JSON.parse(fs.readFileSync(path.join(root, ...seg), "utf8")); } catch { return null; }
};

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const etDay = (iso: string | number | Date) => ET_DAY.format(new Date(iso));

function day(sport: ProductDay["sport"], partial: Omit<ProductDay, "schemaVersion" | "sport">): ProductDay {
  return { schemaVersion: PRODUCT_DAY_SCHEMA_VERSION, sport, ...partial };
}

/** MLB — the board loader is the canonical slate owner (same one /today and Home already use). */
function mlbDay(dataRoot: string, today: string): ProductDay {
  const date = activeMlbDate() ?? today;
  const board = getMlbBoardForDate(date);
  const games = board.summary?.scheduledGames ?? 0;
  const leans = board.summary?.leans ?? 0;
  const stamp = (board as { generatedAt?: string }).generatedAt ?? null;
  if (!board || games === 0) {
    return day("mlb", {
      productDate: date, state: "NO_EVENTS", events: 0, eligible: 0,
      sourceStamp: stamp, nextEventUtc: null,
      note: "No MLB games on the presented slate.", reason: null,
    });
  }
  const stale = date < today;
  // `eligible` is an EVENT count by contract; the leans figure is market-level and rides the note.
  return day("mlb", {
    productDate: date, state: stale ? "SOURCE_STALE" : "LIVE", events: games, eligible: games,
    sourceStamp: stamp, nextEventUtc: null,
    note: `${games} games · ${leans} model leans`,
    reason: stale ? `newest board is for ${date}; today's has not generated yet` : null,
  });
}

/** EPL — through the lane's own loader; only CURRENT_PRE_EVENT rows are today's product. */
function eplDay(_dataRoot: string, today: string): ProductDay {
  const set = loadEplForecasts();
  if (!set) {
    return day("epl", {
      productDate: today, state: "INCIDENT", events: 0, eligible: 0, sourceStamp: null,
      nextEventUtc: null, note: "The EPL forecast artifact could not be read.",
      reason: "forecasts/latest.json unreadable — a fault on our side, not an empty slate",
    });
  }
  const current = set.rows.filter((r) => r.state === "CURRENT_PRE_EVENT");
  const nextKick = current.map((r) => r.kickoffUtc).filter(Boolean).sort()[0] ?? null;
  const kickDay = nextKick ? etDay(nextKick) : null;
  if (current.length === 0) {
    return day("epl", {
      productDate: today, state: "NO_EVENTS", events: 0, eligible: 0,
      sourceStamp: set.generatedAt ?? null, nextEventUtc: null,
      note: "No Premier League fixture carries a current pre-event forecast.", reason: null,
    });
  }
  return day("epl", {
    productDate: kickDay ?? today,
    state: kickDay === today ? "LIVE" : "EVENT_UPCOMING",
    events: current.length, eligible: current.length,
    sourceStamp: set.generatedAt ?? null, nextEventUtc: nextKick,
    note: `${current.length} match forecast${current.length === 1 ? "" : "s"}${current[0]?.matchweek ? ` · matchweek ${current[0].matchweek}` : ""}`,
    reason: null,
  });
}

/** UFC — cards, not daily slates: a predicted future card is EVENT_UPCOMING, not a quiet day. */
function ufcDay(dataRoot: string, today: string): ProductDay {
  const card = readJson(dataRoot, "ufc", "card-latest.json");
  if (!card) {
    return day("ufc", {
      productDate: today, state: "INCIDENT", events: 0, eligible: 0, sourceStamp: null,
      nextEventUtc: null, note: "The UFC card artifact could not be read.",
      reason: "ufc/card-latest.json unreadable",
    });
  }
  const bouts: Array<{ prediction?: unknown }> = card.bouts ?? [];
  const predicted = bouts.filter((b) => b.prediction).length;
  const slateDate: string | null = card.event?.slateDate ?? null;
  const startUtc: string | null = card.event?.startTimeUtc ?? null;
  if (!slateDate || slateDate < today) {
    return day("ufc", {
      productDate: slateDate ?? today, state: "NO_EVENTS", events: 0, eligible: 0,
      sourceStamp: card.generatedAt ?? null, nextEventUtc: null,
      note: slateDate ? `The newest card (${slateDate}) has passed; the archive holds its record.` : "No upcoming card is published.",
      reason: null,
    });
  }
  return day("ufc", {
    productDate: slateDate,
    state: slateDate === today ? "LIVE" : "EVENT_UPCOMING",
    events: bouts.length, eligible: predicted,
    sourceStamp: card.generatedAt ?? null, nextEventUtc: startUtc,
    note: predicted > 0 ? `${predicted} of ${bouts.length} bouts predicted · card ${slateDate}` : `card ${slateDate} published without a model read`,
    reason: null,
  });
}

/** NFL — the index owns the next window (P177: derived from its own nextKickoffUtc, never a literal). */
function nflDay(dataRoot: string, today: string): ProductDay {
  const index = readJson(dataRoot, "nfl", "index.json");
  const sims = readJson(dataRoot, "nfl", "game-simulations", "latest.json");
  if (!index) {
    return day("nfl", {
      productDate: today, state: "INCIDENT", events: 0, eligible: 0, sourceStamp: null,
      nextEventUtc: null, note: "The NFL index could not be read.", reason: "nfl/index.json unreadable",
    });
  }
  const games: unknown[] = sims?.games ?? [];
  const nextKick: string | null = index.nextKickoffUtc ?? null;
  const kickDay = nextKick ? etDay(nextKick) : null;
  /*
   * P202: a PAST kickoff is not upcoming. The index's nextKickoffUtc goes stale the moment the
   * last slate kicks off (it refreshes on the schedule cadence), and simulations for a played
   * slate are history, not product. Before this check the homepage read those stale sims as a
   * live NFL day — the drift this owner exists to end. Intentional difference, documented.
   */
  const windowPassed = kickDay != null && kickDay < today;
  if (games.length === 0 || windowPassed) {
    return day("nfl", {
      productDate: today, state: nextKick && !windowPassed ? "EVENT_UPCOMING" : "NO_EVENTS", events: 0, eligible: 0,
      sourceStamp: sims?.generatedAt ?? index.generatedAt ?? null, nextEventUtc: windowPassed ? null : nextKick,
      note: windowPassed
        ? `The last simulated slate (${kickDay}) has been played; the next window is not scheduled yet.`
        : nextKick ? `No simulated slate yet; next kickoff ${kickDay}.` : "No NFL slate is published.",
      reason: null,
    });
  }
  return day("nfl", {
    productDate: kickDay ?? today,
    state: kickDay === today ? "LIVE" : "EVENT_UPCOMING",
    events: games.length, eligible: games.length,
    sourceStamp: sims?.generatedAt ?? index.generatedAt ?? null, nextEventUtc: nextKick,
    note: `${games.length} games simulated · next kickoff ${kickDay ?? "unscheduled"}`,
    reason: null,
  });
}

/** Every registered sport's product day, in activation order. `today` defaults to the real ET day. */
export function buildProductDays(dataRoot: string, opts?: { today?: string }): ProductDay[] {
  const today = opts?.today ?? etDay(Date.now());
  return [mlbDay(dataRoot, today), eplDay(dataRoot, today), ufcDay(dataRoot, today), nflDay(dataRoot, today)];
}

export function productDayFor(sport: ProductDay["sport"], dataRoot: string, opts?: { today?: string }): ProductDay {
  const found = buildProductDays(dataRoot, opts).find((d) => d.sport === sport);
  if (!found) throw new Error(`unregistered sport ${sport}`);
  return found;
}

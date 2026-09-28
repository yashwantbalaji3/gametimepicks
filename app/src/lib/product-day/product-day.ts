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
  /*
   * P250: the REGULAR-SEASON lane is the live NFL product. The index is the one canonical NFL state
   * (its own note says a surface that computes its own is a defect), and it counts upcoming
   * forecasts-of-record; the retired preseason game-simulations lane below is consulted only when no
   * regular-season forecast exists (its last artifact froze at 2026-08-29, and reading it first is
   * what kept the homepage describing a played preseason slate while 16 Week-1 forecasts were live).
   * Today's board stays TODAY-ONLY: a future-week forecast never counts as today's events — it is
   * named in the note as week discovery instead.
   */
  const forecastsUpcoming = Number(index.counts?.forecastsUpcoming ?? 0);
  const forecastsTotal = Number(index.counts?.forecastsTotal ?? 0);
  const nextForecast: string | null = index.nextForecastUtc ?? index.nextKickoffUtc ?? null;
  const nextForecastDay = nextForecast ? etDay(nextForecast) : null;
  /*
   * P250-W1: the regular-season lane owns the answer whenever ANY regular-season forecast exists —
   * not only while the next kickoff is still ahead. Gating on a future next-forecast meant the
   * morning after any kickoff passed (or any index-staleness across an ET midnight), this fell
   * through to the retired preseason lane and resurrected "The last simulated slate (2026-08-29)
   * has been played" in the middle of a live NFL week. A played week is a regular-season state
   * with a regular-season sentence; the preseason archive speaks only when NO regular-season
   * forecast exists at all (true offseason).
   */
  if (forecastsTotal > 0 || forecastsUpcoming > 0) {
    const weekly = readJson(dataRoot, "nfl", "weekly-boards", "latest.json");
    const week: number | null = typeof weekly?.period?.week === "number" ? weekly.period.week : null;
    const weekLabel = week != null ? `Week ${week}` : "this week";
    const events: Array<{ kickoffUtc?: string }> = Array.isArray(index.events) ? index.events : [];
    const todaysEvents = events.filter((e) => typeof e?.kickoffUtc === "string" && etDay(e.kickoffUtc) === today).length;
    if (todaysEvents > 0) {
      return day("nfl", {
        productDate: today, state: "LIVE", events: todaysEvents, eligible: todaysEvents,
        sourceStamp: index.generatedAt ?? null, nextEventUtc: nextForecast,
        note: `${todaysEvents} game forecast${todaysEvents === 1 ? "" : "s"} today · ${weekLabel}: ${forecastsUpcoming || forecastsTotal} published`,
        reason: null,
      });
    }
    if (forecastsUpcoming > 0 && nextForecastDay != null && nextForecastDay > today) {
      /* UFC's precedent: an EVENT_UPCOMING day counts the upcoming WINDOW's events (productDate
         names the future day), and the note keeps today honest. Consumers rendering "today" must
         key off the state, not the count — the note is the today-safe sentence. */
      return day("nfl", {
        productDate: nextForecastDay, state: "EVENT_UPCOMING", events: forecastsUpcoming, eligible: forecastsUpcoming,
        sourceStamp: index.generatedAt ?? null, nextEventUtc: nextForecast,
        note: `No NFL games today · ${weekLabel}: ${forecastsUpcoming} game forecasts published · next kickoff ${nextForecastDay}${typeof index.nextForecastMatchup === "string" ? ` (${index.nextForecastMatchup})` : ""}`,
        reason: null,
      });
    }
    /* The week has kicked off (or fully settled) and the next window has not published yet — a
       quiet regular-season day, described in regular-season words. Never the preseason archive. */
    return day("nfl", {
      productDate: today, state: "NO_EVENTS", events: 0, eligible: 0,
      sourceStamp: index.generatedAt ?? null, nextEventUtc: nextForecastDay != null && nextForecastDay > today ? nextForecast : null,
      note: `No NFL games today · ${weekLabel}'s played games are in the record; the next window appears when its forecasts publish.`,
      reason: null,
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
   *
   * P224: that guard could not fire in the case it most needed to. It asked whether the ANCHOR was
   * in the past, so a NULL anchor read as "not passed" — and null is exactly what the index
   * published between a settled slate and the next forecast one. On 2026-09-01 this rendered
   * "1 games simulated · next kickoff unscheduled" for CHI @ TEN, played and settled three days
   * earlier, while NE @ SEA sat scheduled in the capture. A detector that goes blind precisely when
   * its subject appears is not a detector.
   *
   * The simulated slate states its OWN date, so staleness is decidable without the anchor: sims for
   * a day before today are history whatever the index says about what comes next.
   */
  const simSlateDay: string | null = typeof sims?.date === "string" ? sims.date : null;
  const simsArePast = simSlateDay != null && simSlateDay < today;
  const windowPassed = (kickDay != null && kickDay < today) || simsArePast;
  if (games.length === 0 || windowPassed) {
    return day("nfl", {
      productDate: today, state: nextKick && !windowPassed ? "EVENT_UPCOMING" : "NO_EVENTS", events: 0, eligible: 0,
      sourceStamp: sims?.generatedAt ?? index.generatedAt ?? null,
      /* A played slate has nothing actionable, but the next real game is still named — a quiet
         window should say what is next, not go blank. */
      nextEventUtc: nextKick,
      note: windowPassed
        ? nextKick
          /* The passed slate AND the real next game — the old copy said "not scheduled yet" even
             when the schedule named one, because it only ever looked at a stale anchor. */
          ? `The last simulated slate (${simSlateDay ?? kickDay}) has been played; next kickoff ${etDay(nextKick)}.`
          : `The last simulated slate (${simSlateDay ?? kickDay}) has been played; the next window is not scheduled yet.`
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

/* ──────────────────────────────── TODAY, ACROSS SPORTS ────────────────────────────────
 *
 * "NO GAMES TODAY" IS A CLAIM ABOUT THE WHOLE DAY, SO IT NEEDS EVERY SPORT'S SCHEDULE.
 *
 * On 2026-09-28 the homepage said "No games today" while Philadelphia @ Chicago kicked off at
 * 8:15 PM ET: the banner asked only whether MLB had games (0 — the day after the regular season)
 * or whether top picks existed. The product days above already knew NFL was LIVE with one event;
 * nothing summed them. And `ProductDay.events` is not a today-count for every sport — EPL counts
 * forecast rows for a whole matchweek, UFC/NFL count an upcoming window under EVENT_UPCOMING, and
 * the NFL/EPL adapters count FORECASTS, so a scheduled game with no forecast would vanish.
 *
 * So today is counted from each sport's existing SCHEDULE owner — never a new source — and a
 * forecast only ever adds to it:
 *   NFL  nfl/schedule/latest.json (the capture nfl/index.json is built from) ∪ indexed forecasts
 *   EPL  the newest soccer/epl/fixtures capture ∪ forecast rows (shared eventId)
 *   MLB  mlb/schedule/<today>.json, and the board's own count when the board is today's
 *   UFC  the published card, when its ET slate date is today
 * Dates are ET days, the site's established anchor.
 */
export interface TodayItem { id: string; startUtc: string | null | undefined; status?: string | null }
export interface SportToday {
  sport: ProductDay["sport"];
  today: string;
  /** Scheduled events whose ET start date is today — with or without a forecast. */
  eventsToday: number;
  /** Of those, how many carry a GameTimePicks forecast. Never more than eventsToday. */
  forecastsToday: number;
  /** Whether this sport's schedule evidence for today exists. Zero events is only a fact when known. */
  known: boolean;
}
export interface CrossSportToday {
  today: string;
  eventsToday: number;
  forecastsToday: number;
  /** Sports with at least one event today, in activation order. */
  sportsWithEvents: ProductDay["sport"][];
  bySport: SportToday[];
  /**
   * EVENTS: at least one sport has an event today. NO_EVENTS: every sport's schedule is known and
   * empty — the only state that may say "No games today". UNKNOWN: nothing found, but some sport's
   * schedule for today is not loaded, so absence proves nothing (the 2026-08-17 morning lesson).
   */
  state: "EVENTS" | "NO_EVENTS" | "UNKNOWN";
  headline: string;
}

const NOT_PLAYED = /POSTPONED|CANCEL/i;

/** Pure. Union of scheduled and forecast items by id, counted on the ET day `today`. */
export function sportTodayFrom(sport: ProductDay["sport"], today: string, scheduled: TodayItem[], forecasts: TodayItem[], known = true): SportToday {
  const onToday = (x: TodayItem) => typeof x?.startUtc === "string" && !Number.isNaN(Date.parse(x.startUtc)) && etDay(x.startUtc) === today && !NOT_PLAYED.test(x.status ?? "");
  const events = new Set<string>();
  for (const x of scheduled) if (onToday(x)) events.add(x.id);
  const forecast = new Set<string>();
  for (const x of forecasts) if (onToday(x)) { forecast.add(x.id); events.add(x.id); }
  return { sport, today, eventsToday: events.size, forecastsToday: forecast.size, known: known || events.size > 0 };
}

/** Pure. The global daily state from every sport's today-count. */
export function crossSportToday(today: string, bySport: SportToday[]): CrossSportToday {
  const own = bySport.filter((s) => s.today === today);
  const eventsToday = own.reduce((n, s) => n + s.eventsToday, 0);
  const forecastsToday = own.reduce((n, s) => n + Math.min(s.forecastsToday, s.eventsToday), 0);
  const allKnown = own.length > 0 && own.every((s) => s.known);
  const state = eventsToday > 0 ? "EVENTS" : allKnown ? "NO_EVENTS" : "UNKNOWN";
  return {
    today, eventsToday, forecastsToday,
    sportsWithEvents: own.filter((s) => s.eventsToday > 0).map((s) => s.sport),
    bySport: own,
    state,
    headline: state === "EVENTS" ? `${eventsToday} event${eventsToday === 1 ? "" : "s"} today`
      : state === "NO_EVENTS" ? "No games today" : "Today's schedule is still loading",
  };
}

function newestCapture(dir: string, prefix: string): unknown {
  try {
    const f = fs.readdirSync(dir).filter((x) => x.startsWith(prefix) && x.endsWith(".json")).sort().at(-1);
    return f ? JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) : null;
  } catch { return null; }
}

/** Every sport's today-count from its committed schedule owner. `today` defaults to the real ET day. */
export function buildSportToday(dataRoot: string, opts?: { today?: string; days?: ProductDay[] }): SportToday[] {
  const today = opts?.today ?? etDay(Date.now());
  const days = opts?.days ?? buildProductDays(dataRoot, { today });
  const of = (s: ProductDay["sport"]) => days.find((d) => d.sport === s);

  // NFL — schedule capture ∪ the index's forecasts-of-record.
  const nflSchedule = readJson(dataRoot, "nfl", "schedule", "latest.json");
  const nflIndex = readJson(dataRoot, "nfl", "index.json");
  // Known when the capture's forward window covers today (it is taken daily, windowDays ahead).
  const capDay = typeof nflSchedule?.generatedAt === "string" ? etDay(nflSchedule.generatedAt) : null;
  const windowEnd = capDay ? etDay(Date.parse(`${capDay}T12:00:00Z`) + Number(nflSchedule?.windowDays ?? 7) * 86_400_000) : null;
  const nfl = sportTodayFrom("nfl", today,
    (nflSchedule?.rows ?? []).map((r: { providerEventId: string; dateUtc: string; statusRaw?: string }) => ({ id: String(r.providerEventId), startUtc: r.dateUtc, status: r.statusRaw })),
    (nflIndex?.events ?? []).map((e: { providerEventId: string; kickoffUtc: string }) => ({ id: String(e.providerEventId), startUtc: e.kickoffUtc })),
    Array.isArray(nflSchedule?.rows) && capDay != null && windowEnd != null && capDay <= today && today <= windowEnd);

  // EPL — the newest fixtures capture ∪ forecast rows.
  const fixtures = newestCapture(path.join(dataRoot, "soccer", "epl", "fixtures"), "capture-") as { rows?: Array<{ eventId: string; kickoffIso: string; lifecycle?: string }> } | null;
  const eplSet = loadEplForecasts();
  const epl = sportTodayFrom("epl", today,
    (fixtures?.rows ?? []).map((r) => ({ id: r.eventId, startUtc: r.kickoffIso, status: r.lifecycle })),
    (eplSet?.rows ?? []).map((r) => ({ id: r.eventId, startUtc: r.kickoffUtc })),
    Array.isArray(fixtures?.rows) && fixtures!.rows!.length > 0); // the capture is the whole season's fixture list

  // MLB — the committed schedule for today; the board's count when the board is today's.
  const mlbSchedule = readJson(dataRoot, "mlb", "schedule", `${today}.json`);
  const scheduled = sportTodayFrom("mlb", today,
    (mlbSchedule?.games ?? []).map((g: { gameId: string; commenceTime: string }) => ({ id: String(g.gameId), startUtc: g.commenceTime })), [],
    Array.isArray(mlbSchedule?.games));
  const mlbBoard = of("mlb");
  const boardToday = mlbBoard && mlbBoard.productDate === today ? mlbBoard.events : 0;
  const mlbEvents = Math.max(scheduled.eventsToday, boardToday);
  const mlb: SportToday = {
    sport: "mlb", today, eventsToday: mlbEvents,
    forecastsToday: mlbBoard && mlbBoard.productDate === today ? Math.min(mlbBoard.eligible, mlbEvents) : 0,
    known: scheduled.known || (mlbBoard?.productDate === today && mlbBoard.state !== "INCIDENT"),
  };

  // UFC — the card, when it is today's.
  const ufcDayNow = of("ufc");
  // UFC runs on cards: a readable card that is not today's means no UFC today.
  const ufcKnown = !!ufcDayNow && ufcDayNow.state !== "INCIDENT";
  const ufc: SportToday = ufcDayNow && ufcDayNow.productDate === today && (ufcDayNow.state === "LIVE" || ufcDayNow.state === "EVENT_UPCOMING")
    ? { sport: "ufc", today, eventsToday: ufcDayNow.events, forecastsToday: Math.min(ufcDayNow.eligible, ufcDayNow.events), known: true }
    : { sport: "ufc", today, eventsToday: 0, forecastsToday: 0, known: ufcKnown };

  return [mlb, epl, ufc, nfl];
}

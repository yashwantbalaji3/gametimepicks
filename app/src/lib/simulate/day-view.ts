/**
 * SIMULATION DAY VIEW (P209 · Release A) — the ONE selector behind /simulate.
 *
 * Answers, for one ET product date: which registered sports have events, what state each event is
 * honestly in, and what the one primary action is. Every row derives from the sport's own
 * canonical owner (MLB board/power + game details, EPL forecast rows, the UFC card artifact, NFL
 * simulate-eligibility, the four-sport upcoming schedule adapter) — this module ADDS no
 * eligibility logic of its own and fails closed to the least-claiming state.
 *
 * THE COUNT RULE (charter 2A): totals are sums over the same rows the page renders, and the ready
 * count is a filter over each event's OWN state — `events.length` can never masquerade as
 * readiness by construction, because readiness is a per-row state match.
 *
 * Server-only (fs via the owners it calls).
 */
import { currentEtDate } from "@/lib/freshness";
import { getMlbBoardForDate, getMlbPowerForDate, getMlbAvailableScheduleDates } from "@/lib/data-mlb";
import { mlbTeamLogoUrl } from "@/lib/player-headshots";
import { buildAllGameDetails } from "@/lib/game-detail";
import { loadEplForecasts, reportableRows, eplMatchHref, type EplForecastRow } from "@/lib/sports/epl/forecast-view";
import { nflSimulateEligibility } from "@/lib/sports/nfl/simulate-eligibility";
import { allUpcoming } from "@/lib/sports/upcoming/adapters.mjs";
import { getSportIdentity } from "@/lib/sport-identity";
import fs from "node:fs";
import path from "node:path";

/** The charter's navigation-state matrix, verbatim. Unknown owners fail closed to SCHEDULE_ONLY. */
export type SimEventState =
  | "SIMULATION_READY"
  | "ARTIFACT_READY"
  | "BASELINE_ONLY"
  | "MODEL_ONLY_NO_MARKET"
  | "NO_PLAY"
  | "SCHEDULE_ONLY"
  | "SOURCE_STALE"
  /**
   * The slate published, but THIS event was not in it — its first pitch had already passed when the
   * slate was generated, so no pre-event artifact exists and none can honestly be made now.
   *
   * Added 2026-08-27, when the day's generation chain silently received no scheduled events and the
   * recovery ran at 14:11 ET with one of seven games already in the second inning. Readiness here
   * was a SLATE-level fact — `leans > 0` — so every game on the day inherited ARTIFACT_READY,
   * including the one with no artifact at all, and it advertised four market families it had never
   * priced. Coverage is a property of an event, not of the day it belongs to.
   */
  | "MISSED_COVERAGE"
  | "SETTLED";

export type SimSport = "mlb" | "epl" | "ufc" | "nfl" | "nba";

export interface SimDayEvent {
  readonly sport: SimSport;
  readonly id: string;
  readonly matchup: string;
  readonly away: { name: string; logo: string | null } | null;
  readonly home: { name: string; logo: string | null } | null;
  readonly startUtc: string | null;
  readonly startLabel: string;
  readonly venue: string | null;
  readonly state: SimEventState;
  /** Plain-language reason rendered with non-ready states — a disabled action is never silent. */
  readonly stateReason: string | null;
  /** Market families genuinely available for this event (display only). */
  readonly markets: readonly string[];
  readonly href: string;
  readonly actionLabel: string;
}

export interface SportDaySection {
  readonly sport: SimSport;
  readonly label: string;
  readonly icon: string;
  /** Sport-level state for THIS date when it has no events (absence is typed, never blank). */
  readonly emptyState: "OFF_SEASON" | "NO_CURRENT_EVENT" | "SCHEDULE_ONLY" | null;
  readonly note: string | null;
  readonly events: readonly SimDayEvent[];
}

export interface SimulateDayView {
  readonly date: string;
  readonly isToday: boolean;
  readonly today: string;
  readonly prevDate: string | null;
  readonly nextDate: string | null;
  readonly availableDates: readonly string[];
  readonly sections: readonly SportDaySection[];
  readonly totals: { events: number; ready: number; settled: number };
}

/** The action vocabulary of the state matrix — never a bare Open/View/Enter (charter 2B). */
export const STATE_ACTION: Record<SimEventState, string> = {
  SIMULATION_READY: "View Simulation",
  ARTIFACT_READY: "Review artifact & limits",
  BASELINE_ONLY: "View baseline report",
  MODEL_ONLY_NO_MARKET: "View model report",
  NO_PLAY: "Why no play",
  SCHEDULE_ONLY: "View event details",
  SOURCE_STALE: "View status",
  MISSED_COVERAGE: "Why this game is missing",
  SETTLED: "View result",
};

/** Ready = the event's own state says a model artifact is presentable (charter's readiness contract). */
export const READY_STATES: readonly SimEventState[] = ["SIMULATION_READY", "MODEL_ONLY_NO_MARKET", "BASELINE_ONLY"];

/** ET calendar day of an ISO instant (date-only format — immune to the Intl hour-24 trap). */
export function etDayOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

const etTime = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)) + " ET";

const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The bounded selection window: 14 days back, 21 forward. History beyond it lives on /results. */
export const WINDOW_BACK = 14;
export const WINDOW_FORWARD = 21;

function readJson<T>(rel: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", rel), "utf8")) as T;
  } catch {
    return null;
  }
}

interface UfcCard {
  event?: { name?: string; date?: string; startUtc?: string } | null;
  state?: string;
  bouts?: Array<{
    boutId?: string; startUtc?: string | null;
    red?: { name?: string; photoUrl?: string | null } | null;
    blue?: { name?: string; photoUrl?: string | null } | null;
    prediction?: { winner?: { name?: string; probability?: number } | null } | null;
  }>;
}

interface UpcomingEvent {
  canonicalEventId?: string; providerEventId?: string; scheduledStartUtc?: string; status?: string;
  /** The schedule contract's shape: an OBJECT keyed home/away (id = abbreviation). */
  competitors?: { home?: { id?: string; name?: string }; away?: { id?: string; name?: string } };
  venue?: string | null;
}
interface UpcomingSection { sport: string; events?: UpcomingEvent[] }

/* ── per-sport composers ────────────────────────────────────────────────────────────────────── */

function mlbSection(date: string, today: string): SportDaySection {
  const power = getMlbPowerForDate(date);
  const games = power.games ?? [];
  const board = getMlbBoardForDate(date);
  const leans = board.summary?.leans ?? 0;
  // Game-detail joins exist only for the current window; absence fails closed, never errors.
  const details = date >= today ? buildAllGameDetails() : [];
  const detailByPk = new Map(details.filter((d) => d.sport === "mlb").map((d) => [String(d.matchId), d]));
  /*
   * PER-EVENT COVERAGE. The board stamps each game it refused on the pre-event boundary; without
   * consulting it, `leans > 0` below hands every game on the day the same readiness, which is how a
   * game with no artifact came to be labelled ARTIFACT_READY and to advertise four market families
   * nobody had priced. Keyed by gamePk, because a doubleheader is two games with one team-pair.
   */
  const missedPks = new Set(
    (board.games ?? [])
      .filter((g) => (g as { startedBeforeGeneration?: boolean }).startedBeforeGeneration === true)
      .map((g) => String(g.gamePk ?? "")),
  );
  const events: SimDayEvent[] = games.map((g) => {
    const pk = String(g.gamePk ?? "");
    const detail = detailByPk.get(pk);
    const settled = date < today;
    const simReady = !settled && detail?.gameLabSimulation?.status === "ready";
    const missed = !settled && pk !== "" && missedPks.has(pk);
    const state: SimEventState = settled
      ? "SETTLED"
      : missed
        ? "MISSED_COVERAGE"
        : simReady
          ? "SIMULATION_READY"
          : leans > 0
            ? "ARTIFACT_READY"
            : "SCHEDULE_ONLY";
    const href = settled
      ? "/results"
      : detail ? `/games/mlb/${detail.slug}` : "/mlb";
    return {
      sport: "mlb", id: `mlb:${pk || `${g.awayTeamAbbr}-${g.homeTeamAbbr}`}`,
      matchup: `${g.awayTeamAbbr ?? "?"} @ ${g.homeTeamAbbr ?? "?"}`,
      away: { name: g.awayTeamAbbr ?? "?", logo: mlbTeamLogoUrl(g.awayTeamId) ?? null },
      home: { name: g.homeTeamAbbr ?? "?", logo: mlbTeamLogoUrl(g.homeTeamId) ?? null },
      startUtc: g.gameDate ?? null,
      startLabel: g.gameDate ? etTime(g.gameDate) : "TBD",
      venue: g.venue ?? null,
      state,
      stateReason:
        state === "MISSED_COVERAGE"
          ? "This game had already started when today's slate was generated, so there is no pregame forecast for it. It still counts as one of the day's scheduled games."
          : state === "SCHEDULE_ONLY"
            ? "The board for this slate has no model leans yet — check back closer to game time."
            : state === "SETTLED"
              ? "This game is final; the record lives on Results."
              /*
               * ARTIFACT_READY WAS SILENT (P233 · A). The board carries model leans for this game
               * but the full-game simulation has not been generated yet — a real, ordinary state
               * that a reader met as a label with no explanation, on a card whose action says
               * "Review artifact & limits". Every other non-ready state says what it is; this one
               * simply had not been given its sentence.
               */
              : state === "ARTIFACT_READY"
                ? "Model leans are published for this game; the 10,000-run full-game simulation has not been generated yet. Market reads are available now, the simulated report follows."
                : null,
      // A refused game claims no market families. It listed all four before, which is a stronger
      // falsehood than the silent readiness that came with it.
      markets: state === "MISSED_COVERAGE" ? [] : state === "ARTIFACT_READY" || simReady ? ["Moneyline", "Run line", "Total", ...(board.propsAvailable ? ["Player props"] : [])] : [],
      href,
      actionLabel: STATE_ACTION[state],
    };
  });
  return {
    sport: "mlb", label: "MLB", icon: getSportIdentity("mlb").icon,
    emptyState: events.length ? null : "NO_CURRENT_EVENT",
    note: events.length ? null : "No MLB games on this date.",
    events: events.sort((a, b) => String(a.startUtc ?? "").localeCompare(String(b.startUtc ?? ""))),
  };
}

function eplSection(date: string, today: string): SportDaySection {
  const set = loadEplForecasts();
  const rows: EplForecastRow[] = set ? reportableRows(set) : [];
  const onDate = rows.filter((r) => etDayOf(r.kickoffUtc) === date);
  const events: SimDayEvent[] = onDate.map((r) => {
    const settled = date < today || Date.parse(r.kickoffUtc) < Date.now() - 3 * 3600_000;
    const hasProbs = r.probs != null;
    const state: SimEventState = settled ? "SETTLED" : hasProbs ? "SIMULATION_READY" : "ARTIFACT_READY";
    const href = r.slug ? eplMatchHref(r.slug) : "/epl";
    return {
      sport: "epl", id: `epl:${r.eventId}`,
      matchup: r.matchup,
      away: r.awayClub ? { name: r.awayClub, logo: null } : null,
      home: r.homeClub ? { name: r.homeClub, logo: null } : null,
      startUtc: r.kickoffUtc, startLabel: etTime(r.kickoffUtc), venue: null,
      state,
      stateReason: state === "ARTIFACT_READY" ? (r.unavailableReason ?? "This fixture has not qualified for a published forecast.") : state === "SETTLED" ? "Kicked off or final — the report shows the graded outcome." : null,
      markets: hasProbs ? ["Win/Draw/Win", "Total goals"] : [],
      href,
      actionLabel: STATE_ACTION[state],
    };
  });
  // Beyond the forecast window the schedule adapter still knows the fixture list.
  if (events.length === 0) {
    const up = (allUpcoming({ nowIso: new Date().toISOString() }) as UpcomingSection[]).find((s) => s.sport === "epl");
    for (const e of up?.events ?? []) {
      if (etDayOf(e.scheduledStartUtc) !== date) continue;
      const home = e.competitors?.home?.name ?? "?";
      const away = e.competitors?.away?.name ?? "?";
      events.push({
        sport: "epl", id: `epl:${e.canonicalEventId ?? e.providerEventId}`,
        matchup: `${home} vs ${away}`, away: { name: away, logo: null }, home: { name: home, logo: null },
        startUtc: e.scheduledStartUtc ?? null, startLabel: e.scheduledStartUtc ? etTime(e.scheduledStartUtc) : "TBD",
        venue: e.venue ?? null, state: "SCHEDULE_ONLY",
        stateReason: "Scheduled fixture — the forecast window has not reached it yet.",
        markets: [], href: "/epl", actionLabel: STATE_ACTION.SCHEDULE_ONLY,
      });
    }
  }
  return {
    sport: "epl", label: "Premier League", icon: getSportIdentity("world_cup").icon,
    emptyState: events.length ? null : "NO_CURRENT_EVENT",
    note: events.length ? null : "No Premier League fixtures on this date.",
    events: events.sort((a, b) => String(a.startUtc ?? "").localeCompare(String(b.startUtc ?? ""))),
  };
}

function ufcSection(date: string, today: string): SportDaySection {
  const card = readJson<UfcCard>("ufc/card-latest.json");
  const events: SimDayEvent[] = [];
  const cardDay = etDayOf(card?.event?.startUtc ?? card?.event?.date ?? card?.bouts?.[0]?.startUtc ?? null);
  if (card && cardDay === date) {
    const bouts = card.bouts ?? [];
    const predicted = bouts.filter((b) => b.prediction?.winner?.probability != null).length;
    const head = bouts[0];
    const settled = date < today;
    const state: SimEventState = settled ? "SETTLED" : predicted > 0 ? "SIMULATION_READY" : "SCHEDULE_ONLY";
    events.push({
      sport: "ufc", id: `ufc:${card.event?.name ?? cardDay}`,
      matchup: card.event?.name ?? `UFC card · ${bouts.length} bouts`,
      away: head?.red?.name ? { name: head.red.name, logo: head.red.photoUrl ?? null } : null,
      home: head?.blue?.name ? { name: head.blue.name, logo: head.blue.photoUrl ?? null } : null,
      startUtc: card.event?.startUtc ?? head?.startUtc ?? null,
      startLabel: head?.startUtc ? etTime(head.startUtc) : "Card",
      venue: null,
      state,
      stateReason: settled ? "This card is complete — settled bouts live on Results." : predicted === 0 ? "No bout on this card has enough fighter history to model — the schedule is shown without a read." : null,
      markets: predicted > 0 ? ["Fight winner"] : [],
      href: settled ? "/results/picks/ufc" : "/ufc",
      actionLabel: settled ? STATE_ACTION.SETTLED : predicted > 0 ? `View ${predicted} of ${bouts.length} bout reads` : STATE_ACTION.SCHEDULE_ONLY,
    });
  } else {
    const up = (allUpcoming({ nowIso: new Date().toISOString() }) as UpcomingSection[]).find((s) => s.sport === "ufc");
    for (const e of up?.events ?? []) {
      if (etDayOf(e.scheduledStartUtc) !== date) continue;
      events.push({
        sport: "ufc", id: `ufc:${e.canonicalEventId ?? e.providerEventId}`,
        matchup: [e.competitors?.away?.name, e.competitors?.home?.name].filter(Boolean).join(" vs ") || "UFC event",
        away: null, home: null,
        startUtc: e.scheduledStartUtc ?? null, startLabel: e.scheduledStartUtc ? etTime(e.scheduledStartUtc) : "TBD",
        venue: e.venue ?? null, state: "SCHEDULE_ONLY",
        stateReason: "Scheduled event — the modelled card is published closer to fight night.",
        markets: [], href: "/ufc", actionLabel: STATE_ACTION.SCHEDULE_ONLY,
      });
    }
  }
  return {
    sport: "ufc", label: "UFC", icon: getSportIdentity("ufc").icon,
    emptyState: events.length ? null : "NO_CURRENT_EVENT",
    note: events.length ? null : "No UFC card on this date.",
    events,
  };
}

function nflSection(date: string, today: string): SportDaySection {
  const elig = nflSimulateEligibility();
  const events: SimDayEvent[] = [];
  for (const e of elig.events ?? []) {
    if (etDayOf(e.kickoffUtc) !== date) continue;
    const settled = date < today || e.lifecycle === "STARTED";
    const state: SimEventState = settled
      ? "SETTLED"
      : e.simulationReady ? (e.hasMarket ? "SIMULATION_READY" : "MODEL_ONLY_NO_MARKET")
      : "BASELINE_ONLY";
    events.push({
      sport: "nfl", id: `nfl:${e.providerEventId}`,
      matchup: e.matchup,
      away: { name: e.away.abbr, logo: null }, home: { name: e.home.abbr, logo: null },
      startUtc: e.kickoffUtc, startLabel: etTime(e.kickoffUtc), venue: e.venue,
      state,
      stateReason: settled ? "Kicked off or final — the report shows the frozen forecast and result." : state === "BASELINE_ONLY" ? e.readinessReason : state === "MODEL_ONLY_NO_MARKET" ? "Model distribution published; no market price is attached to this event." : null,
      markets: e.hasMarket ? ["Moneyline", "Total"] : [],
      href: `/nfl/game/${e.providerEventId}`,
      actionLabel: STATE_ACTION[state],
    });
  }
  if (events.length === 0) {
    const up = (allUpcoming({ nowIso: new Date().toISOString() }) as UpcomingSection[]).find((s) => s.sport === "nfl");
    for (const e of up?.events ?? []) {
      if (etDayOf(e.scheduledStartUtc) !== date) continue;
      const home = e.competitors?.home?.id ?? "?";
      const away = e.competitors?.away?.id ?? "?";
      events.push({
        sport: "nfl", id: `nfl:${e.canonicalEventId ?? e.providerEventId}`,
        matchup: `${away} @ ${home}`, away: { name: away, logo: null }, home: { name: home, logo: null },
        startUtc: e.scheduledStartUtc ?? null, startLabel: e.scheduledStartUtc ? etTime(e.scheduledStartUtc) : "TBD",
        venue: e.venue ?? null, state: "SCHEDULE_ONLY",
        stateReason: "Scheduled game — simulations for this slate are not published yet.",
        markets: [], href: "/nfl", actionLabel: STATE_ACTION.SCHEDULE_ONLY,
      });
    }
  }
  return {
    sport: "nfl", label: "NFL", icon: getSportIdentity("nfl").icon,
    emptyState: events.length ? null : "NO_CURRENT_EVENT",
    note: events.length ? null : "No NFL games on this date.",
    events: events.sort((a, b) => String(a.startUtc ?? "").localeCompare(String(b.startUtc ?? ""))),
  };
}

function nbaSection(date: string): SportDaySection {
  const up = (allUpcoming({ nowIso: new Date().toISOString() }) as UpcomingSection[]).find((s) => s.sport === "nba");
  const events: SimDayEvent[] = [];
  for (const e of up?.events ?? []) {
    if (etDayOf(e.scheduledStartUtc) !== date) continue;
    const home = e.competitors?.home?.name ?? "?";
    const away = e.competitors?.away?.name ?? "?";
    events.push({
      sport: "nba", id: `nba:${e.canonicalEventId ?? e.providerEventId}`,
      matchup: `${away} @ ${home}`, away: { name: away, logo: null }, home: { name: home, logo: null },
      startUtc: e.scheduledStartUtc ?? null, startLabel: e.scheduledStartUtc ? etTime(e.scheduledStartUtc) : "TBD",
      venue: e.venue ?? null, state: "SCHEDULE_ONLY",
      stateReason: "NBA is schedule-only — no simulation is published, by design.",
      markets: [], href: "/sports", actionLabel: STATE_ACTION.SCHEDULE_ONLY,
    });
  }
  return {
    sport: "nba", label: "NBA", icon: getSportIdentity("nba").icon,
    emptyState: events.length ? null : "OFF_SEASON",
    note: events.length ? "Schedule only — no NBA model is published." : "Off-season · schedules return with the new season.",
    events,
  };
}

/* ── the view ───────────────────────────────────────────────────────────────────────────────── */

/** Every date in the bounded window that any registered sport has an event on (plus today, always). */
export function availableSimulateDates(opts?: { today?: string }): string[] {
  const today = opts?.today ?? currentEtDate();
  const lo = addDays(today, -WINDOW_BACK);
  const hi = addDays(today, WINDOW_FORWARD);
  const dates = new Set<string>([today]);
  const add = (d: string | null) => { if (d && d >= lo && d <= hi) dates.add(d); };
  for (const d of getMlbAvailableScheduleDates()) add(d);
  const set = loadEplForecasts();
  for (const r of set ? reportableRows(set) : []) add(etDayOf(r.kickoffUtc));
  for (const e of nflSimulateEligibility().events ?? []) add(etDayOf(e.kickoffUtc));
  const card = readJson<UfcCard>("ufc/card-latest.json");
  add(etDayOf(card?.event?.startUtc ?? card?.event?.date ?? card?.bouts?.[0]?.startUtc ?? null));
  for (const s of allUpcoming({ nowIso: new Date().toISOString() }) as UpcomingSection[]) {
    for (const e of s.events ?? []) add(etDayOf(e.scheduledStartUtc));
  }
  return [...dates].sort();
}

export function buildSimulateDay(date?: string, opts?: { today?: string }): SimulateDayView {
  const today = opts?.today ?? currentEtDate();
  const d = date ?? today;
  const availableDates = availableSimulateDates({ today });
  const idx = availableDates.indexOf(d);
  const sections = [mlbSection(d, today), eplSection(d, today), ufcSection(d, today), nflSection(d, today), nbaSection(d)];
  const all = sections.flatMap((s) => s.events);
  return {
    date: d,
    isToday: d === today,
    today,
    prevDate: idx > 0 ? availableDates[idx - 1] : null,
    nextDate: idx >= 0 && idx < availableDates.length - 1 ? availableDates[idx + 1] : null,
    availableDates,
    sections,
    totals: {
      events: all.length,
      ready: all.filter((e) => (READY_STATES as readonly string[]).includes(e.state)).length,
      settled: all.filter((e) => e.state === "SETTLED").length,
    },
  };
}

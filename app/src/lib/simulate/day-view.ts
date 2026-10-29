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
import { etDayLabel } from "@/lib/et-stamp.mjs";
import { currentEtDate } from "@/lib/freshness";
import { teamLogoUrlFor } from "@/lib/teams/load-team-marks";
import { getMlbBoardForDate, getMlbPowerForDate, getMlbAvailableScheduleDates, getMlbStatsapiScheduleForDate } from "@/lib/data-mlb";
import { mlbTeamLogoUrl } from "@/lib/player-headshots";
import { buildAllGameDetails } from "@/lib/game-detail";
import { loadEplForecasts, reportableRows, eplMatchHref, type EplForecastRow } from "@/lib/sports/epl/forecast-view";
import { nflSimulateEligibility } from "@/lib/sports/nfl/simulate-eligibility";
import { effectiveLifecycle } from "@/lib/sports/nfl/effective-lifecycle.mjs";
import { postStartState, startedAt, POST_START_PHRASE } from "@/lib/simulate/lifecycle-state.mjs";
import { allUpcoming, nbaUpcoming, ufcUpcoming } from "@/lib/sports/upcoming/adapters.mjs";
import { getSportIdentity } from "@/lib/sport-identity";
import fs from "node:fs";
import { PUBLIC_TERMS, availabilityLine } from "@/lib/public-registry";
import { hubLaneAnchor } from "@/lib/sports/nba/projection-board-ops.mjs";
import { nbaForecastVsActualView } from "@/lib/results/nba-level-a-readers";
import { nbaTheaterPublicEnabled } from "@/lib/simulation-theater/nba/feature-manifest.mjs";
import { settledVerdictText } from "@/components/nba/expired-simulation.mjs";
import { settledSimulationParams } from "@/components/nba/settled-simulation-data";
import { settledMlbGames } from "@/lib/mlb/settled-games-data";
import { allowsRunCountClaim } from "@/lib/game-simulations/validate";
import { loadEplForecastArchive } from "@/lib/sports/epl/forecast-view";
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
  /* #808 · after the start. SETTLED only from the sport's canonical settlement record; a game that has
     kicked off without a recorded final is STARTED; a final not yet graded is AWAITING_SETTLEMENT.
     The rule lives in lib/simulate/lifecycle-state.mjs. */
  | "STARTED"
  | "AWAITING_SETTLEMENT"
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
  /**
   * MLB only (overnight 10-28): the official snapshot's state, in the one reader's words
   * (lib/mlb/full-game/forecast-state.mjs → forecastEventBadge). Before the start `badge` replaces the lifecycle
   * label (a degraded/unavailable snapshot is never "Simulation ready"); after it, `note` adds a non-ready state.
   */
  readonly forecastBadge?: { readonly badge: string | null; readonly tone: "ok" | "warn" | "mute" | null; readonly note: string | null } | null;
  /**
   * Batch 1 #5 (2026-10-29): the chip's words when they differ from the state's default. "Simulation ready" is a
   * run-count claim; an event whose model is closed-form (EPL's exact Poisson grid, the UFC fight model) records no
   * run count and reads "Model report ready" instead (readyStateLabel). Null/absent = the state's own label.
   */
  readonly stateLabel?: string | null;
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
  /** Per-state counts; `awaiting` = AWAITING_SETTLEMENT, `started` = STARTED (lifecycle-state.mjs). */
  readonly totals: { events: number; ready: number; settled: number; awaiting: number; started: number };
}

/** The chip for a SIMULATION_READY event whose model records no run count (closed-form). */
export const MODEL_REPORT_READY_LABEL = "Model report ready";

/**
 * Batch 1 #5: SIMULATION_READY may wear "Simulation ready" only when a simulation with a run count exists —
 * the same gate every "N-run" phrase passes (allowsRunCountClaim, lib/game-simulations/validate). A closed-form
 * model (no runs) is relabelled and its action names a model report; every other state is unchanged.
 */
export function readyStateLabel(state: SimEventState, runCount: number | null | undefined): { stateLabel: string | null; actionLabel: string } {
  if (state === "SIMULATION_READY" && !allowsRunCountClaim({ runCount: runCount ?? null })) {
    return { stateLabel: MODEL_REPORT_READY_LABEL, actionLabel: STATE_ACTION.MODEL_ONLY_NO_MARKET };
  }
  return { stateLabel: null, actionLabel: STATE_ACTION[state] };
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
  STARTED: "View pregame report",
  AWAITING_SETTLEMENT: "View pregame report",
  SETTLED: "View result",
};

/**
 * Ready = the event's own state says a model artifact is presentable (charter's readiness contract).
 * Defined in a filesystem-free module and re-exported here, so a client component can ask the
 * question without pulling `node:fs` into the browser bundle. One definition, two entry points.
 */
import { READY_STATES } from "./ready-states.mjs";
import { forecastEventBadge, mlbForecastStateForGame } from "../mlb/full-game/forecast-state.mjs";
import { pinnedBuildEtDate } from "./build-today.mjs";

/** One "today" per build for the date window (params and selector agree across midnight ET); live clock elsewhere. */
const simulateToday = (): string => pinnedBuildEtDate({ fallback: () => currentEtDate() });
export { READY_STATES };

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

/* #808 · the canonical records each sport already publishes, read once per call. A missing file is an
   empty set: nothing is claimed settled or final without its record. */
function readJsonl<T>(rel: string): T[] {
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "data", rel), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);
  } catch {
    return [];
  }
}
/** MLB: a game is settled when the graded game-prediction ledger (the Saved/Results owner) grades it. */
const mlbSettledPks = () => new Set(readJsonl<{ gamePk?: number | string }>("mlb/results/game-predictions-graded.jsonl").map((r) => String(r.gamePk ?? "")).filter(Boolean));
/** EPL: a fixture is settled when the graded-forecast ledger grades it (same eventId as the forecast row). */
const eplSettledIds = () => new Set(readJsonl<{ eventId?: string }>("soccer/epl/results/graded-forecasts.jsonl").map((r) => String(r.eventId ?? "")).filter(Boolean));
/** NFL: a final is a STATUS_FINAL row in the results capture; settlement is the lifecycle owner's SETTLED. */
const nflFinalIds = () => new Set((readJson<{ rows?: Array<{ providerEventId?: string; statusRaw?: string }> }>("nfl/results/latest.json")?.rows ?? [])
  .filter((r) => /^STATUS_FINAL/.test(r.statusRaw ?? "")).map((r) => String(r.providerEventId ?? "")));
/** UFC: bouts with a recorded winner on a date mean the card's results are in. There is no populated
    settled record for UFC, so a finished card reads "Final · grading pending", never "Settled". */
type UfcResultRow = { eventName?: string; eventDate?: string; fighterA?: string; fighterB?: string; winner?: string | null; loser?: string | null; resultStatus?: string; method?: string | null; round?: number | null; time?: string | null };
/* Batch 1 #5: the committed file's array is `results` (it read `rows`, which does not exist, so this set was always
   empty and no UFC card ever read final). */
const ufcResultRows = (): UfcResultRow[] => readJson<{ results?: UfcResultRow[] }>("ufc/results-latest.json")?.results ?? [];
const ufcResultDates = () => new Set(ufcResultRows().filter((r) => r.winner).map((r) => String(r.eventDate ?? "")));
/** UFC graded fight-winner picks (the /results/picks/ufc record), by card name. */
const ufcGradedByCard = () => {
  const m = new Map<string, { hits: number; counted: number }>();
  for (const p of readJson<{ picks?: Array<{ eventName?: string; hit?: boolean | null }> }>("ufc/graded-picks.json")?.picks ?? []) {
    if (!p.eventName || typeof p.hit !== "boolean") continue;
    const c = m.get(p.eventName) ?? { hits: 0, counted: 0 };
    c.counted += 1; if (p.hit) c.hits += 1;
    m.set(p.eventName, c);
  }
  return m;
};
/** EPL final scores from the graded-forecast ledger (FULL_TIME rows only), by eventId. */
const eplFinals = () => new Map(readJsonl<{ eventId?: string; status?: string; actual?: { homeGoalsFT?: number; awayGoalsFT?: number } }>("soccer/epl/results/graded-forecasts.jsonl")
  .filter((r) => r.status === "FULL_TIME" && Number.isFinite(r.actual?.homeGoalsFT) && Number.isFinite(r.actual?.awayGoalsFT))
  .map((r) => [String(r.eventId ?? ""), { home: r.actual!.homeGoalsFT as number, away: r.actual!.awayGoalsFT as number }]));
/** NFL forecast run counts (model.simulations), by providerEventId — the same number the game page prints. */
const nflRunCounts = () => new Map((readJson<{ forecasts?: Array<{ providerEventId?: string; model?: { simulations?: number } }> }>("nfl/forecasts/latest.json")?.forecasts ?? [])
  .map((f) => [String(f.providerEventId ?? ""), f.model?.simulations ?? null]));

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
  competitors?: { home?: { id?: string; name?: string }; away?: { id?: string; name?: string }; red?: { id?: string; name?: string }; blue?: { id?: string; name?: string } };
  venue?: string | null;
  /** UFC bouts: "<card name> · <weight class>" (adapters.mjs). */
  context?: string | null;
}
interface UpcomingSection { sport: string; coverage?: string; events?: UpcomingEvent[] }

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
  const gradedPks = mlbSettledPks();
  // Audit 2026-10-28 F02: a settled game opens its own settled page (/games/mlb/<slug>/) when the record holds it.
  const settledSlugByPk = new Map(settledMlbGames(today).map((s) => [s.gamePk, s.slug]));
  /* The official prediction snapshot for this date — the authority on each game's forecast state. */
  const predictions = readJson<{ predictions?: Array<Record<string, unknown>> }>(`mlb/predictions/${date}.json`);
  const nowMs = Date.now();
  const events: SimDayEvent[] = games.map((g) => {
    const pk = String(g.gamePk ?? "");
    const detail = detailByPk.get(pk);
    // #808: settled from the graded ledger, never from the date; a past date only means it started.
    const post = postStartState({ started: date < today || startedAt(g.gameDate, nowMs), final: false, settled: pk !== "" && gradedPks.has(pk) });
    const settled = post === "SETTLED";
    const simReady = !post && detail?.gameLabSimulation?.status === "ready";
    const missed = !post && pk !== "" && missedPks.has(pk);
    const state: SimEventState = post
      ? post
      : missed
        ? "MISSED_COVERAGE"
        : simReady
          ? "SIMULATION_READY"
          : leans > 0
            ? "ARTIFACT_READY"
            : "SCHEDULE_ONLY";
    /*
     * P242 — a ready game opens its REPORT, directly. The `?play=1` presentation hand-off was
     * retired with the recording experience; the full dashboard renders on arrival.
     */
    const settledSlug = settledSlugByPk.get(pk);
    const href = settled
      ? settledSlug ? `/games/mlb/${settledSlug}/` : "/results/mlb/"
      : detail
        ? `/games/mlb/${detail.slug}/`
        : post ? "/results" : "/mlb";
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
            : post
              ? POST_START_PHRASE[post]
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
      ...readyStateLabel(state, simReady && detail?.gameLabSimulation?.allowsRunCountClaim ? detail.gameLabSimulation.runCount : null),
      forecastBadge: (() => {
        const f = mlbForecastStateForGame(predictions, pk);
        return f ? forecastEventBadge(f, !!post) : null;
      })(),
    };
  });
  /*
   * P240 · beyond the board's day-of horizon the free StatsAPI population still knows the slate.
   * The board and every model artifact are generated ON game day; before this fallback a future
   * date with a committed 15-game population rendered "No MLB games on this date", which is a
   * falsehood, not an empty state. These rows prove SCHEDULED and nothing more — the capture is
   * schedule-only, so the state is pinned SCHEDULE_ONLY and no market family is claimed. Only a
   * FUTURE day may use it: a past day with no board has no pregame artifact to point at, and its
   * record question belongs to /results.
   */
  if (events.length === 0 && date >= today) {
    // date === today covers the pre-publication morning (P241 · A10): the board generates
    // ~11:30-13:30 ET, and before it lands the day's committed population must still render —
    // "No MLB games on this date" was false eleven times over on the audit morning.
    const statsapi = getMlbStatsapiScheduleForDate(date);
    for (const g of statsapi?.games ?? []) {
      events.push({
        sport: "mlb", id: `mlb:${g.gamePk}`,
        matchup: `${g.away?.name ?? "?"} @ ${g.home?.name ?? "?"}`,
        away: { name: g.away?.name ?? "?", logo: mlbTeamLogoUrl(g.away?.id ?? undefined) ?? null },
        home: { name: g.home?.name ?? "?", logo: mlbTeamLogoUrl(g.home?.id ?? undefined) ?? null },
        startUtc: g.gameDate ?? null,
        startLabel: g.gameDate ? etTime(g.gameDate) : "TBD",
        venue: g.venue ?? null,
        state: "SCHEDULE_ONLY",
        stateReason: date === today
          ? "Official scheduled game (MLB StatsAPI). Today's board, simulations and predictions are generated late morning ET, after probable pitchers and markets exist — check back shortly."
          : "Official scheduled game (MLB StatsAPI). Forecasts are generated on game day, after probable pitchers and markets exist — the board, simulations and predictions for this slate arrive that morning.",
        markets: [], href: "/mlb", actionLabel: STATE_ACTION.SCHEDULE_ONLY,
      });
    }
  }
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
  const graded = eplSettledIds();
  /*
   * Batch 1 #5 (2026-10-29): `latest.json` carries CURRENT pre-event rows only, so once a matchday was played its
   * fixtures left it and /simulate/d/2026-10-24 read "No Premier League fixtures on this date" beside four graded
   * matches. A fixture that has started or been graded is read from the forecast archive — the same rows the
   * /epl/match/<slug>/ pages are exported from (generateStaticParams), so every such row links to a page that exists.
   * Current rows win on a shared slug.
   */
  const nowMs = Date.now();
  const seen = new Set(rows.map((r) => r.slug));
  const archived = loadEplForecastArchive().filter((r) => !seen.has(r.slug) && (graded.has(r.eventId) || date < today || startedAt(r.kickoffUtc, nowMs)));
  const onDate = [...rows, ...archived].filter((r) => etDayOf(r.kickoffUtc) === date);
  const finals = eplFinals();
  const events: SimDayEvent[] = onDate.map((r) => {
    // #808: settled only when the graded-forecast ledger grades this fixture — not "3 hours after kickoff".
    const post = postStartState({ started: date < today || startedAt(r.kickoffUtc, nowMs), final: false, settled: graded.has(r.eventId) });
    const hasProbs = r.probs != null;
    const state: SimEventState = post ?? (hasProbs ? "SIMULATION_READY" : "ARTIFACT_READY");
    /* P234 · C — a fixture with a published forecast opens its presentation on arrival. eplMatchHref
       already ends in a slash, so the query attaches without tripping the trailingSlash redirect. */
    const href = r.slug ? eplMatchHref(r.slug) : "/epl";
    /* The final score comes only from the graded ledger (FULL_TIME), never from a feed or a guess. */
    const fin = finals.get(r.eventId);
    const homeName = r.homeClub ?? r.matchup.split(" v ")[0];
    const awayName = r.awayClub ?? r.matchup.split(" v ")[1] ?? "?";
    const score = post && fin ? `Final: ${homeName} ${fin.home} – ${fin.away} ${awayName}. ` : "";
    return {
      sport: "epl", id: `epl:${r.eventId}`,
      matchup: r.matchup,
      away: r.awayClub ? { name: r.awayClub, logo: null } : null,
      home: r.homeClub ? { name: r.homeClub, logo: null } : null,
      startUtc: r.kickoffUtc, startLabel: etTime(r.kickoffUtc), venue: null,
      state,
      stateReason: state === "ARTIFACT_READY" ? (r.unavailableReason ?? "This fixture has not qualified for a published forecast.") : post ? `${score}${POST_START_PHRASE[post]}` : null,
      markets: hasProbs ? ["Win/Draw/Win", "Total goals"] : [],
      href,
      /* Closed-form: the exact Poisson grid is computed, not sampled — no run count, so never "Simulation ready". */
      ...readyStateLabel(state, null),
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
    /* Batch 1 #5: the card starts at its EARLIEST start — the prelims — not the main event's walkout. Oct 31 read
       "8:00 PM ET" (bouts[0], the main event) while the card's event start and its prelims are 5:00 PM ET. */
    const cardStart = ufcEarliestStart(card);
    // #808: a finished card with recorded results is final; UFC publishes no settled record, so never "Settled".
    const post = postStartState({ started: date < today || startedAt(cardStart, Date.now()), final: ufcResultDates().has(cardDay ?? ""), settled: false });
    const state: SimEventState = post ?? (predicted > 0 ? "SIMULATION_READY" : "SCHEDULE_ONLY");
    events.push({
      sport: "ufc", id: `ufc:${card.event?.name ?? cardDay}`,
      matchup: card.event?.name ?? `UFC card · ${bouts.length} bouts`,
      away: head?.red?.name ? { name: head.red.name, logo: head.red.photoUrl ?? null } : null,
      home: head?.blue?.name ? { name: head.blue.name, logo: head.blue.photoUrl ?? null } : null,
      startUtc: cardStart,
      startLabel: cardStart ? etTime(cardStart) : "Card",
      venue: null,
      state,
      /* Closed-form fight model: no run count, so the ready chip reads "Model report ready" (readyStateLabel). */
      stateLabel: readyStateLabel(state, null).stateLabel,
      stateReason: post ? POST_START_PHRASE[post] : predicted === 0 ? "No bout on this card has enough fighter history to model — the schedule is shown without a read." : null,
      markets: predicted > 0 ? ["Fight winner"] : [],
      href: post ? "/results/picks/ufc" : "/ufc",
      actionLabel: post ? STATE_ACTION[post] : predicted > 0 ? `View ${predicted} of ${bouts.length} bout reads` : STATE_ACTION.SCHEDULE_ONLY,
    });
  } else if (ufcResultRows().some((r) => r.eventDate === date && r.winner)) {
    events.push(...ufcSettledCards(date));
  } else {
    /*
     * GTP-09 (2026-10-14): the schedule's UFC events are BOUTS keyed red/blue, and this read them as home/away — so
     * every bout rendered as an anonymous "UFC event" row, one per bout. And each promised "the modelled card is
     * published closer to fight night", which is not true of a card we do not model (Dana White's Contender
     * Series). Bouts are grouped into their card, the card is named, the card's name (which carries its headliners) is shown, and
     * the row says only what is true: schedule only, no forecast for this card.
     */
    const up = ufcUpcoming({ nowIso: new Date().toISOString(), displayCap: Infinity }) as UpcomingSection;
    const cards = new Map<string, UpcomingEvent[]>();
    for (const e of up?.events ?? []) {
      if (etDayOf(e.scheduledStartUtc) !== date) continue;
      const name = (e.context ?? "").split(" · ")[0] || "UFC card";
      cards.set(name, [...(cards.get(name) ?? []), e]);
    }
    for (const [name, bouts] of cards) {
      const first = [...bouts].sort((a, b) => String(a.scheduledStartUtc ?? "").localeCompare(String(b.scheduledStartUtc ?? "")))[0];
      /* The card's own name carries its headliners ("… Buckley vs. Malott"); the capture's bout order is not
         documented as main-event-first, so no single bout is singled out by position. */
      events.push({
        sport: "ufc", id: `ufc:${name}:${date}`,
        matchup: name,
        away: null, home: null,
        startUtc: first.scheduledStartUtc ?? null, startLabel: first.scheduledStartUtc ? etTime(first.scheduledStartUtc) : "TBD",
        venue: first.venue ?? null, state: "SCHEDULE_ONLY",
        stateReason: `Schedule only — ${bouts.length} bout${bouts.length === 1 ? "" : "s"} listed; no GameTime forecast is published for this card.`,
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

/** The earliest start a card publishes: its event start or any bout's, whichever is first (prelims open the card). */
export function ufcEarliestStart(card: Pick<UfcCard, "event" | "bouts"> | null | undefined): string | null {
  const starts = [card?.event?.startUtc, ...(card?.bouts ?? []).map((b) => b.startUtc)]
    .filter((x): x is string => typeof x === "string" && Number.isFinite(Date.parse(x)));
  return starts.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}

/**
 * Batch 1 #5 (2026-10-29): a PAST card. `card-latest.json` holds only the next card, so a played card vanished from
 * its own date — /simulate/d/2026-10-24 read "No UFC card on this date" the week after UFC 333. Its rows come from the
 * committed results record (ufc/results-latest.json: winner, method, round) and the graded fight-winner picks
 * (ufc/graded-picks.json, the /results/picks/ufc record). A card with graded picks is SETTLED; a card with results
 * but no published picks was not modelled here and says so (schedule-only, like an NBA game outside the lane).
 *
 * HOOK (ufcSettledBoutHref): settled UFC bout pages are being added on branch claude/b1-ufc-bouts. Until they exist
 * on main, a settled card opens the graded-picks record — the only exported page that holds its results.
 */
export const ufcSettledBoutHref = (_eventName: string): string | null => null; // TODO(b1-ufc-bouts): link the settled card/bout page once exported
function ufcSettledCards(date: string): SimDayEvent[] {
  const graded = ufcGradedByCard();
  const byCard = new Map<string, UfcResultRow[]>();
  for (const r of ufcResultRows()) {
    if (r.eventDate !== date || !r.eventName) continue;
    byCard.set(r.eventName, [...(byCard.get(r.eventName) ?? []), r]);
  }
  return [...byCard.entries()].map(([name, rows]): SimDayEvent => {
    const g = graded.get(name) ?? null;
    const decided = rows.filter((r) => r.winner).length;
    /* The card's own name carries its headliners ("UFC 333: Volkanovski vs. Evloev"); the headline result is the bout
       whose two surnames both appear in it. No positional guess: without that match no single bout is named. */
    const title = name.split(":").slice(1).join(":").toLowerCase();
    const surname = (n?: string | null) => String(n ?? "").trim().split(/\s+/).pop()?.toLowerCase() ?? "";
    const main = title ? rows.find((r) => r.winner && r.loser && title.includes(surname(r.winner)) && title.includes(surname(r.loser))) : undefined;
    const method = main?.method ? ({ ko_tko: "KO/TKO", submission: "submission", decision: "decision" } as Record<string, string>)[main.method] ?? null : null;
    const mainLine = main ? `${main.winner} def. ${main.loser}${method ? ` (${method}${main.round ? `, R${main.round}` : ""}${main.time ? ` ${main.time}` : ""})` : ""}. ` : "";
    const resultLine = `Final: ${mainLine}${decided} of ${rows.length} bout${rows.length === 1 ? "" : "s"} decided.`;
    /* The one lifecycle rule: graded picks settle the card; a card we published nothing for stays schedule-only. */
    const state: SimEventState = !g ? "SCHEDULE_ONLY" : postStartState({ started: true, final: decided > 0, settled: true }) ?? "STARTED";
    return {
      sport: "ufc", id: `ufc:${name}:${date}`,
      matchup: name, away: null, home: null,
      startUtc: null, startLabel: "Card", venue: null,
      state,
      stateReason: g
        ? `${resultLine} Fight-winner picks graded: ${g.hits} of ${g.counted} correct.`
        : `${resultLine} No GameTime forecast was published for this card.`,
      markets: g ? ["Fight winner"] : [],
      href: ufcSettledBoutHref(name) ?? (g ? "/results/picks/ufc" : "/ufc"),
      actionLabel: STATE_ACTION[state],
    };
  });
}

function nflSection(date: string, today: string): SportDaySection {
  /* P252: see simulate-lobby — the render site supplies the clock. */
  const nowIso = new Date().toISOString();
  const elig = nflSimulateEligibility(nowIso);
  const finals = nflFinalIds();
  const nflRuns = nflRunCounts();
  const events: SimDayEvent[] = [];
  /* UXJ-05: a GRADED game is not lobby-eligible ("graded games belong in results", simulate-eligibility.ts), so a
     past date read "No NFL games on this date" beside a game that was played and graded — SEA @ DEN, Thu Oct 15.
     MLB lists its settled games as "View result" cards pointing at Results; NFL now does the same. They join the
     one loop below so the lifecycle rule (postStartState) still decides their state. */
  const eligibleIds = new Set((elig.events ?? []).map((e) => String(e.providerEventId)));
  const venueOf = new Map((readJson<{ rows?: Array<{ providerEventId?: string; venue?: string }> }>("nfl/schedule/latest.json")?.rows ?? [])
    .map((r) => [String(r.providerEventId ?? ""), r.venue ?? null]));
  const graded = (readJson<{ events?: Array<{ providerEventId: string; matchup: string; kickoffUtc: string; lifecycle?: string; home: { abbr: string; name: string }; away: { abbr: string; name: string } }> }>("nfl/index.json")?.events ?? [])
    .filter((e) => e.lifecycle === "SETTLED" && !eligibleIds.has(String(e.providerEventId)))
    .map((e) => ({
      providerEventId: e.providerEventId, matchup: e.matchup, kickoffUtc: e.kickoffUtc, lifecycle: e.lifecycle as string,
      home: e.home, away: e.away, venue: venueOf.get(String(e.providerEventId)) ?? null,
      simulationReady: false, hasMarket: false, readinessReason: "",
    }));
  for (const e of [...(elig.events ?? []), ...graded]) {
    if (etDayOf(e.kickoffUtc) !== date) continue;
    /* #808: this read "settled = date < today || lifecycle === STARTED" — a game that had merely kicked off
       was labelled Settled (PHI @ CHI, 2026-09-28, second quarter). The lifecycle owner decides: SETTLED
       only from its SETTLED stamp; a STATUS_FINAL result without it is "Final · grading pending". */
    const lc = effectiveLifecycle({ lifecycle: e.lifecycle, kickoffUtc: e.kickoffUtc }, nowIso);
    const post = postStartState({ started: date < today || lc !== "UPCOMING", final: finals.has(String(e.providerEventId)), settled: lc === "SETTLED" });
    const settled = post != null;
    const state: SimEventState = post
      ? post
      : e.simulationReady ? (e.hasMarket ? "SIMULATION_READY" : "MODEL_ONLY_NO_MARKET")
      : "BASELINE_ONLY";
    events.push({
      sport: "nfl", id: `nfl:${e.providerEventId}`,
      matchup: e.matchup,
      away: { name: e.away.abbr, logo: null }, home: { name: e.home.abbr, logo: null },
      startUtc: e.kickoffUtc, startLabel: etTime(e.kickoffUtc), venue: e.venue,
      state,
      stateReason: post ? POST_START_PHRASE[post] : state === "BASELINE_ONLY" ? e.readinessReason : state === "MODEL_ONLY_NO_MARKET" ? "Model distribution published; no market price is attached to this event." : null,
      markets: e.hasMarket ? ["Moneyline", "Total"] : [],
      /* A settled game's action is "View result": the graded outcome lives on the NFL results record. */
      href: post === "SETTLED" ? "/results/nfl/" : `/nfl/game/${e.providerEventId}/`,
      /* The forecast records its simulation count (model.simulations, 10,000) — the run-count gate decides the chip. */
      ...readyStateLabel(state, nflRuns.get(String(e.providerEventId)) ?? null),
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
  /* P250 · 1B: an empty NFL day names the next real kickoff (from the eligibility owner's own
     events) instead of a bare "no games" that reads like no simulation capability exists. */
  const nextDay = (elig.events ?? [])
    .map((e) => etDayOf(e.kickoffUtc))
    .filter((d): d is string => d != null && d > date)
    .sort()[0] ?? null;
  return {
    sport: "nfl", label: "NFL", icon: getSportIdentity("nfl").icon,
    emptyState: events.length ? null : "NO_CURRENT_EVENT",
    note: events.length ? null : nextDay && nextDay > date
      ? `No NFL games on this date — next kickoff ${etDayLabel(nextDay) ?? nextDay}.`
      : "No NFL games on this date.",
    events: events.sort((a, b) => String(a.startUtc ?? "").localeCompare(String(b.startUtc ?? ""))),
  };
}

/**
 * GTP-11 — every captured NBA event, uncapped. The /sports list caps NBA at twelve rows; reading that
 * capped list here meant /simulate's date list stopped at Oct 16 and skipped opening night. On TODAY the
 * window opens a day back so a game that has already tipped stays on its own date instead of vanishing.
 */
function nbaCapturedEvents(date: string, today: string): UpcomingSection | undefined {
  /* Review fix: for today AND past dates in the window the read opens before the date itself (callers filter by ET
     day), so a date whose games have tipped still lists them instead of reading "No NBA games on this date". */
  const since = date <= today ? new Date(Date.parse(`${date}T00:00:00Z`) - 12 * 3_600_000).toISOString() : new Date().toISOString();
  return nbaUpcoming({ nowIso: since, displayCap: Infinity }) as UpcomingSection;
}

/*
 * F09 (audit 2026-10-23, founder directive public readiness): NBA has an Official Forecast and a Game Simulation per
 * game on each slate, so a row says WHICH case it is — published (the slate's frozen public lane snapshot carries the
 * game), not published yet for this slate (it publishes before tip-off), or none published for a past slate. Never
 * "schedule-only by design": the public registry (lib/public-registry.ts) says NBA supports both features.
 */
function nbaLaneIds(date: string): Set<string> | null {
  const doc = readJson<{ date?: string; games?: Array<{ providerEventId?: string }> }>(`nba/experimental-public/${date}.json`);
  return doc && doc.date === date && Array.isArray(doc.games) ? new Set(doc.games.map((g) => String(g.providerEventId ?? ""))) : null;
}

/*
 * Overnight W7 2026-10-28 (audit B NEW-1: /simulate/d/2026-10-26 went from 10 NBA games to 0 the next day). The schedule
 * capture holds today onward only, so a played slate vanished from its own date. A PAST date's rows come from the
 * committed records instead: the date's lane file (the games the Official Forecast covered), the finals record (every
 * played game) and any capture row still present. Each row says what the OFFICIAL RECORD says
 * (lib/results/nba-forecast-vs-actual.mjs — the /results/nba record: side won / lost, pending, held), never recomputed,
 * and opens the game's settled page when one is built (components/nba/settled-simulation-data.ts), else that day's
 * frozen board. Today and later dates are unchanged.
 */
type NbaRecordRow = { providerEventId: string; state: string; side: string | null; final: { away: number; home: number } | null };
let nbaRecordMemo: Map<string, NbaRecordRow> | null = null;
const nbaRecord = () => (nbaRecordMemo ??= new Map((nbaForecastVsActualView().games as NbaRecordRow[]).map((g) => [String(g.providerEventId), g])));
type NbaFinalRow = { providerEventId?: string; dateEt?: string; dateUtc?: string; ftAway?: number; ftHome?: number; home?: { tricode?: string; name?: string }; away?: { tricode?: string; name?: string } };
/** Every season's write-once finals record (finals-<season>.json), read once. */
let nbaFinalsMemo: NbaFinalRow[] | null = null;
const nbaFinalsAll = (): NbaFinalRow[] => {
  if (nbaFinalsMemo) return nbaFinalsMemo;
  let files: string[] = [];
  try { files = fs.readdirSync(path.join(process.cwd(), "public", "data", "nba", "results")).filter((f) => /^finals-\d{4}-\d{2}\.json$/.test(f)); } catch { files = []; }
  return (nbaFinalsMemo = files.flatMap((f) => readJson<{ finals?: NbaFinalRow[] }>(`nba/results/${f}`)?.finals ?? []));
};
const nbaFinalsOn = (date: string): NbaFinalRow[] => nbaFinalsAll().filter((r) => r.dateEt === date);
type NbaLaneDoc = { date?: string; games?: Array<{ providerEventId?: string; tipUtc?: string; away?: { abbr?: string | null; name?: string | null }; home?: { abbr?: string | null; name?: string | null }; elo?: { favoured?: string | null; state?: string } }> };

/** ET dates the finals record holds a game on (every season file). */
const nbaPlayedDates = (): string[] => [...new Set(nbaFinalsAll().map((r) => String(r.dateEt ?? "")).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];

function nbaPastEvents(date: string, today: string, captured: UpcomingEvent[]): SimDayEvent[] {
  const laneDoc = readJson<NbaLaneDoc>(`nba/experimental-public/${date}.json`);
  const laneGames = laneDoc?.date === date ? laneDoc.games ?? [] : [];
  const settledBuilt = new Set(nbaTheaterPublicEnabled() ? settledSimulationParams(today) : []);
  const rows = new Map<string, { away: string; home: string; awayCode: string; homeCode: string; startUtc: string | null; venue: string | null; favoured: string | null; inLane: boolean }>();
  for (const f of nbaFinalsOn(date)) {
    const id = String(f.providerEventId ?? "");
    if (id) rows.set(id, { away: f.away?.name ?? f.away?.tricode ?? "?", home: f.home?.name ?? f.home?.tricode ?? "?", awayCode: f.away?.tricode ?? "?", homeCode: f.home?.tricode ?? "?", startUtc: f.dateUtc ?? null, venue: null, favoured: null, inLane: false });
  }
  for (const e of captured) {
    const id = String(e.providerEventId ?? "");
    if (!id || etDayOf(e.scheduledStartUtc) !== date) continue;
    const prev = rows.get(id);
    rows.set(id, { away: e.competitors?.away?.name ?? prev?.away ?? "?", home: e.competitors?.home?.name ?? prev?.home ?? "?", awayCode: prev?.awayCode ?? e.competitors?.away?.id ?? "?", homeCode: prev?.homeCode ?? e.competitors?.home?.id ?? "?", startUtc: e.scheduledStartUtc ?? prev?.startUtc ?? null, venue: e.venue ?? null, favoured: null, inLane: false });
  }
  for (const g of laneGames) {
    const id = String(g.providerEventId ?? "");
    if (!id) continue;
    const prev = rows.get(id);
    const fav = g.elo?.state === "FAVOURED" ? (g.elo.favoured === g.home?.abbr ? g.home?.name : g.elo.favoured === g.away?.abbr ? g.away?.name : null) ?? null : null;
    // the lane's own codes (the ones the official record and /results/nba print)
    rows.set(id, { away: g.away?.name ?? prev?.away ?? "?", home: g.home?.name ?? prev?.home ?? "?", awayCode: g.away?.abbr ?? prev?.awayCode ?? "?", homeCode: g.home?.abbr ?? prev?.homeCode ?? "?", startUtc: g.tipUtc ?? prev?.startUtc ?? null, venue: prev?.venue ?? null, favoured: fav, inLane: true });
  }
  const finals = new Map(nbaFinalsOn(date).map((f) => [String(f.providerEventId), f]));
  return [...rows.entries()].map(([id, r]): SimDayEvent => {
    const rec = r.inLane ? nbaRecord().get(id) ?? null : null;
    const f = rec?.final ? { away: rec.final.away, home: rec.final.home } : finals.has(id) ? { away: finals.get(id)!.ftAway, home: finals.get(id)!.ftHome } : null;
    const score = f && Number.isFinite(f.away) && Number.isFinite(f.home) ? `Final: ${r.awayCode} ${f.away} – ${f.home} ${r.homeCode}.` : null;
    /* A past date's game has started. The official record decides the rest through the one lifecycle rule
       (postStartState): a final the record graded (won/lost, or a final it does not compare) → settled; a held game,
       or a final the record has not graded → final, grading pending; no final → started. */
    const state: SimEventState = !r.inLane ? "SCHEDULE_ONLY"
      : postStartState({ started: true, final: rec?.state === "HELD" || f !== null, settled: !!rec?.final && rec.state !== "HELD" }) ?? "STARTED";
    const reason = !r.inLane
      ? `${score ? `${score} ` : ""}No ${PUBLIC_TERMS.OFFICIAL_FORECAST} was published for this game.`
      : `${score ? `${score} ` : ""}${settledVerdictText(rec?.state ?? "", r.favoured)}`;
    return {
      sport: "nba", id: `nba:${id}`,
      matchup: `${r.away} @ ${r.home}`, away: { name: r.away, logo: null }, home: { name: r.home, logo: null },
      startUtc: r.startUtc, startLabel: r.startUtc ? etTime(r.startUtc) : "TBD", venue: r.venue, state, stateReason: reason, markets: [],
      href: !r.inLane ? "/nba" : settledBuilt.has(id) ? `/nba/simulation/${id}/` : `/nba/projections/${date}/`,
      actionLabel: !r.inLane ? STATE_ACTION.SCHEDULE_ONLY : settledBuilt.has(id) ? STATE_ACTION[state] : `View the ${PUBLIC_TERMS.OFFICIAL_FORECAST}`,
    };
  }).sort((a, b) => String(a.startUtc ?? "").localeCompare(String(b.startUtc ?? "")) || a.id.localeCompare(b.id));
}

function nbaSection(date: string, today: string): SportDaySection {
  const up = nbaCapturedEvents(date, today);
  const events: SimDayEvent[] = date < today ? nbaPastEvents(date, today, up?.events ?? []) : [];
  const lane = nbaLaneIds(date);
  for (const e of date < today ? [] : up?.events ?? []) {
    if (etDayOf(e.scheduledStartUtc) !== date) continue;
    const home = e.competitors?.home?.name ?? "?";
    const away = e.competitors?.away?.name ?? "?";
    const published = !!lane?.has(String(e.providerEventId));
    events.push({
      sport: "nba", id: `nba:${e.canonicalEventId ?? e.providerEventId}`,
      matchup: `${away} @ ${home}`, away: { name: away, logo: null }, home: { name: home, logo: null },
      startUtc: e.scheduledStartUtc ?? null, startLabel: e.scheduledStartUtc ? etTime(e.scheduledStartUtc) : "TBD",
      venue: e.venue ?? null, state: "SCHEDULE_ONLY",
      stateReason: published
        ? `${PUBLIC_TERMS.OFFICIAL_FORECAST} published — favoured side and player medians, with a ${PUBLIC_TERMS.GAME_SIMULATION} on the game's card.`
        : date >= today ? availabilityLine("nba", "officialForecast") : `No ${PUBLIC_TERMS.OFFICIAL_FORECAST} was published for this game.`,
      /* UXJ-03: the NBA hub carries this schedule and its final scores; "/sports" was the generic sports index, so
         "View event details" opened a page with no event on it. Every other sport's schedule-only card opens its hub.
         A published game opens its own card there (hubLaneAnchor). */
      markets: [], href: published ? hubLaneAnchor(String(e.providerEventId)) : "/nba", actionLabel: published ? `View the ${PUBLIC_TERMS.OFFICIAL_FORECAST}` : STATE_ACTION.SCHEDULE_ONLY,
    });
  }
  /* GTP-11: "Off-season" only when there is no captured schedule at all. In preseason, a date with no
     game names the next one instead. */
  const nextDay = (up?.events ?? [])
    .map((e) => etDayOf(e.scheduledStartUtc))
    .filter((d): d is string => d != null && d > date)
    .sort()[0] ?? null;
  const offSeason = !(up?.events ?? []).length && up?.coverage !== "SCHEDULE_ONLY";
  return {
    sport: "nba", label: "NBA", icon: getSportIdentity("nba").icon,
    emptyState: events.length ? null : offSeason ? "OFF_SEASON" : "NO_CURRENT_EVENT",
    note: events.length
      ? lane ? `${PUBLIC_TERMS.OFFICIAL_FORECAST} published for ${events.filter((x) => x.actionLabel !== STATE_ACTION.SCHEDULE_ONLY).length} of ${events.length} games.` : date >= today ? `${PUBLIC_TERMS.OFFICIAL_FORECAST} and ${PUBLIC_TERMS.GAME_SIMULATION}s publish before tip-off.` : `No ${PUBLIC_TERMS.OFFICIAL_FORECAST} was published for this date.`
      : offSeason
        ? "Off-season · schedules return with the new season."
        : nextDay ? `No NBA games on this date — next game ${etDayLabel(nextDay) ?? nextDay}.` : "No NBA games on this date.",
    events,
  };
}

/* ── the view ───────────────────────────────────────────────────────────────────────────────── */

/** Every date in the bounded window that any registered sport has an event on (plus today, always). */
export function availableSimulateDates(opts?: { today?: string }): string[] {
  const today = opts?.today ?? simulateToday();
  const lo = addDays(today, -WINDOW_BACK);
  const hi = addDays(today, WINDOW_FORWARD);
  const dates = new Set<string>([today]);
  const add = (d: string | null) => { if (d && d >= lo && d <= hi) dates.add(d); };
  for (const d of getMlbAvailableScheduleDates()) add(d);
  const set = loadEplForecasts();
  for (const r of set ? reportableRows(set) : []) add(etDayOf(r.kickoffUtc));
  // Batch 1 #5: played fixtures and cards stay selectable on their own dates (archive / results record, before today).
  for (const r of loadEplForecastArchive()) { const d = etDayOf(r.kickoffUtc); if (d && d < today) add(d); }
  for (const r of ufcResultRows()) if (r.winner && r.eventDate && r.eventDate < today) add(r.eventDate);
  for (const e of nflSimulateEligibility().events ?? []) add(etDayOf(e.kickoffUtc));
  const card = readJson<UfcCard>("ufc/card-latest.json");
  add(etDayOf(card?.event?.startUtc ?? card?.event?.date ?? card?.bouts?.[0]?.startUtc ?? null));
  for (const s of allUpcoming({ nowIso: new Date().toISOString() }) as UpcomingSection[]) {
    if (s.sport === "nba" || s.sport === "ufc") continue; // capped for display — read uncapped below (GTP-09/11)
    for (const e of s.events ?? []) add(etDayOf(e.scheduledStartUtc));
  }
  for (const e of nbaCapturedEvents(today, today)?.events ?? []) add(etDayOf(e.scheduledStartUtc));
  // W7: played NBA dates stay selectable after the capture drops them (the finals record, ET dates before today)
  for (const d of nbaPlayedDates()) if (d < today) add(d);
  for (const e of (ufcUpcoming({ nowIso: new Date().toISOString(), displayCap: Infinity }) as UpcomingSection).events ?? []) add(etDayOf(e.scheduledStartUtc));
  return [...dates].sort();
}

/**
 * How many of the day's events are SIMULATION_READY right now — the one number behind any "N
 * simulation-ready" claim. P1-E (2026-09-29): Home's hero counted ready artifacts dated today from its
 * own selector, which has no start instants, so after PHI @ ATL's first pitch it still said "4
 * simulation-ready" while this view (and /simulate) said 3 ready and 1 kicked off.
 */
export function simulationReadyCount(day: SimulateDayView): number {
  return day.sections.reduce((n, s) => n + s.events.filter((e) => e.state === "SIMULATION_READY").length, 0);
}

export function buildSimulateDay(date?: string, opts?: { today?: string }): SimulateDayView {
  const today = opts?.today ?? simulateToday();
  const d = date ?? today;
  const availableDates = availableSimulateDates({ today });
  const idx = availableDates.indexOf(d);
  const sections = [mlbSection(d, today), eplSection(d, today), ufcSection(d, today), nflSection(d, today), nbaSection(d, today)]
    /*
     * FILL THE CRESTS THAT THE BRANCHES ABOVE LEAVE NULL.
     *
     * The row component already draws two team marks — but only when a `logo` URL is present, and
     * the NFL, EPL and several archive branches set it to null. An audit of the built export found
     * these day views among 103 team-bearing pages rendering no imagery at all, which is not a
     * missing component so much as a field nobody filled.
     *
     * Filling here rather than in five separate branches keeps one rule: a name that resolves gets
     * its crest, a name that does not keeps null and the row renders as it always did. A UFC row's
     * `logo` is a fighter PHOTO, not a club crest, so an already-set value is never overwritten.
     */
    .map((section) => ({
      ...section,
      events: section.events.map((e) => ({
        ...e,
        away: e.away ? { ...e.away, logo: e.away.logo ?? teamLogoUrlFor(e.away.name) } : null,
        home: e.home ? { ...e.home, logo: e.home.logo ?? teamLogoUrlFor(e.home.name) } : null,
      })),
    }));
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
      awaiting: all.filter((e) => e.state === "AWAITING_SETTLEMENT").length,
      started: all.filter((e) => e.state === "STARTED").length,
    },
  };
}

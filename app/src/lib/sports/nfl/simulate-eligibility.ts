/**
 * THE ONE canonical NFL eligible-event set for the Simulate lobby (Program 178 · Release A).
 *
 * The founder's observation was that `/simulate` offered Today, MLB, NBA, NHL and UFC while live
 * NFL simulations existed only behind `/nfl`. Discovery was the defect — the artifacts were real.
 *
 * Every NFL number the lobby renders (the sport card's game count, its ready count, the filter chip
 * count, the Today aggregate, and the cards themselves) is derived from this one function. That is
 * the point: the previous shape let each of those be computed at its own call site, which is how a
 * card can say "3 games" above a list showing two.
 *
 * ELIGIBILITY, in one place:
 *   - the event must carry a SIMULATION. A schedule row alone can never promote NFL onto the lobby;
 *     an entry with a kickoff and no distribution is not something a reader can simulate.
 *   - SETTLED events leave. A graded game belongs in results, not on a board of games to simulate —
 *     the same rule the UFC settled-card gate and the MLB started-game exclusion already apply.
 *   - STARTED events stay, LOCKED, but only while they are plausibly the current slate. Staleness is
 *     judged by comparing the kickoff against the INDEX'S OWN `generatedAt`, never against a live
 *     clock: this site is a static export, so a build-time `Date.now()` freezes into the HTML and
 *     silently becomes a lie. Two artifact-owned timestamps compared to each other cannot rot.
 *
 * Pure apart from reading committed public artifacts, and it fabricates nothing: no index, no rows,
 * and the caller can tell that apart from "an index that lists no eligible games".
 */
import fs from "node:fs";
import path from "node:path";

/**
 * How long after kickoff a started-but-unsettled game may still count as the current slate.
 * Football-shaped: a game runs about three and a half hours, so anything six hours past kickoff is
 * either final or a data problem — and in both cases it is not a game a reader can still simulate.
 */
export const STARTED_GRACE_HOURS = 6;

/**
 * ARTIFACT_READY vs SIMULATION_READY — the distinction Program 179 exists to enforce.
 *
 * A committed, deterministic, reproducible artifact is ARTIFACT_READY. It earns the green
 * SIMULATION READY badge only when event-specific inputs measurably move its distribution. On
 * 2026-08-14 all ten NFL games rendered 19-18 inside a 1.7pp win spread while every card showed the
 * green badge: the artifacts were real, and the impression they created was not.
 */
export type NflReadiness =
  /** Event-specific inputs are applied and measurably move this game's distribution. */
  | "SIMULATION_READY"
  /** A real, reproducible artifact built from a shared prior — no event-specific signal applied. */
  | "BASELINE_ONLY";

export type NflEligibilityState =
  /** The index is readable and at least one event carries a simulation. */
  | "ACTIVE"
  /** The index is readable and no event carries an eligible simulation. */
  | "NO_ACTIVE_SLATE"
  /** The index could not be read. NOT the same answer as "no games" — an outage, stated as one. */
  | "ARTIFACT_UNAVAILABLE";

export interface NflEligibleEvent {
  providerEventId: string;
  canonicalEventId: string;
  matchup: string;
  kickoffUtc: string;
  home: { abbr: string; name: string };
  away: { abbr: string; name: string };
  lifecycle: "UPCOMING" | "STARTED";
  locked: boolean;
  /** Canonical output state (EXPERIMENTAL_LEAN, PUBLIC_EXPERIMENTAL, STARTED…), consumed verbatim. */
  state: string;
  projectedScore: { home: number; away: number };
  winProbability: { home: number; away: number };
  total: { median: number; p10: number; p90: number };
  hasMarket: boolean;
  venue: string | null;
  /** How many player rows the Vault published for this event (0 when none). */
  playerCandidates: number;
  /**
   * The canonical link to this game's report, read from the simulation artifact's OWN slug.
   * Recomputing it from the kickoff date drifts: every game in one artifact shares the artifact's
   * date, so a Saturday kickoff exports under the Friday artifact date.
   */
  reportHref: string;
  readiness: NflReadiness;
  /** True only for SIMULATION_READY. This is what drives the green badge. */
  simulationReady: boolean;
  /** Why, in the words a reader needs. Always populated. */
  readinessReason: string;
}

export interface NflSimulateEligibility {
  state: NflEligibilityState;
  /** Reader-facing explanation of the state, always populated. */
  note: string;
  events: NflEligibleEvent[];
  /**
   * Events classified SIMULATION_READY. This USED to equal `events.length` by construction, which
   * is precisely what let a slate of ten shared-prior forecasts report itself as ten ready
   * simulations. It is now a count of a classification, and can legitimately be zero.
   */
  readyCount: number;
  /** The artifact stamp these were derived from, for freshness display. */
  indexGeneratedAt: string | null;
}

type IndexEvent = {
  providerEventId: string; canonicalEventId: string; matchup: string; kickoffUtc: string;
  lifecycle: string; locked: boolean; state: string;
  home: { abbr: string; name: string }; away: { abbr: string; name: string };
  projectedScore?: { home: number; away: number } | null;
  winProbability?: { home: number; away: number } | null;
  total?: { median: number; p10: number; p90: number } | null;
  hasMarket?: boolean;
};

type Forecast = {
  providerEventId: string;
  teamSignal?: { state: string; note?: string } | null;
};

const readJson = <T,>(rel: string): T | null => {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data", rel), "utf8")) as T; } catch { return null; }
};

/**
 * Decide eligibility for one index event against one artifact stamp. Exported so the metamorphic
 * tests can drive it directly with synthetic events rather than writing files.
 */
export function isEligibleForLobby(e: IndexEvent, indexGeneratedAt: string): boolean {
  if (!e?.projectedScore || !e?.winProbability || !e?.total) return false;  // schedule-only never promotes
  if (e.lifecycle === "SETTLED") return false;                              // graded games belong in results
  if (e.lifecycle === "STARTED") {
    const kickoff = Date.parse(e.kickoffUtc);
    const stamp = Date.parse(indexGeneratedAt);
    if (!Number.isFinite(kickoff) || !Number.isFinite(stamp)) return false;
    return stamp - kickoff <= STARTED_GRACE_HOURS * 3_600_000;
  }
  return e.lifecycle === "UPCOMING";
}

/**
 * Classify one event's readiness from the signal state its own forecast recorded. A missing signal
 * block is treated as BASELINE_ONLY: an artifact that cannot say whether event-specific inputs were
 * applied has not earned the badge, and defaulting the other way is how the badge got detached from
 * the evidence in the first place.
 */
function readinessOf(signal: { state: string; note?: string } | null): { readiness: NflReadiness; simulationReady: boolean; readinessReason: string } {
  if (signal?.state === "APPLIED") {
    return {
      readiness: "SIMULATION_READY",
      simulationReady: true,
      readinessReason: "Event-specific team evidence is applied to this game's distribution.",
    };
  }
  return {
    readiness: "BASELINE_ONLY",
    simulationReady: false,
    readinessReason:
      signal?.note ??
      "This is a real, reproducible simulation built from league-wide preseason context only — no measured signal separates these two teams, so it is a baseline rather than a game-specific read.",
  };
}

/** Build the eligible set from the committed artifacts. */
export function nflSimulateEligibility(): NflSimulateEligibility {
  const index = readJson<{ generatedAt: string; events: IndexEvent[] }>("nfl/index.json");
  if (!index || !Array.isArray(index.events)) {
    return {
      state: "ARTIFACT_UNAVAILABLE",
      note: "The NFL index could not be read, so no NFL slate can be shown. This is a data outage, not an empty slate — the two are different answers.",
      events: [],
      readyCount: 0,
      indexGeneratedAt: null,
    };
  }

  const schedule = readJson<{ rows: Array<{ providerEventId: string; venue: string }> }>("nfl/schedule/latest.json");
  const venueById = new Map((schedule?.rows ?? []).map((r) => [r.providerEventId, r.venue]));

  // The forecast artifact carries the per-event signal state the significance gate wrote. Readiness
  // is read from THERE, never inferred from the index having an entry for the game.
  const forecasts = readJson<{ forecasts: Forecast[] }>("nfl/forecasts/latest.json");
  const signalById = new Map((forecasts?.forecasts ?? []).map((f) => [f.providerEventId, f.teamSignal ?? null]));

  const simArtifact = readJson<{ date?: string; games?: Array<{ gameId?: string; slug?: string }> }>("nfl/game-simulations/latest.json");
  const slugByEvent = new Map((simArtifact?.games ?? []).map((g) => [String(g.gameId ?? "").replace(/^nfl-/, ""), String(g.slug ?? "")]));

  const vault = readJson<{ selections?: Array<{ providerEventId: string }>; watchlist?: Array<{ providerEventId: string }> }>("nfl/end-zone-vault/latest.json");
  const playerCounts = new Map<string, number>();
  for (const c of [...(vault?.selections ?? []), ...(vault?.watchlist ?? [])]) {
    playerCounts.set(c.providerEventId, (playerCounts.get(c.providerEventId) ?? 0) + 1);
  }

  const events: NflEligibleEvent[] = index.events
    .filter((e) => isEligibleForLobby(e, index.generatedAt))
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc))
    .map((e) => ({
      providerEventId: e.providerEventId,
      canonicalEventId: e.canonicalEventId,
      matchup: e.matchup,
      kickoffUtc: e.kickoffUtc,
      home: e.home,
      away: e.away,
      lifecycle: e.lifecycle as "UPCOMING" | "STARTED",
      locked: Boolean(e.locked),
      state: e.state,
      projectedScore: e.projectedScore!,
      winProbability: e.winProbability!,
      total: e.total!,
      hasMarket: Boolean(e.hasMarket),
      venue: venueById.get(e.providerEventId) ?? null,
      playerCandidates: playerCounts.get(e.providerEventId) ?? 0,
      reportHref: slugByEvent.get(e.providerEventId)
        ? `/games/nfl/${slugByEvent.get(e.providerEventId)}`
        : `/nfl/game/${e.providerEventId}`,
      ...readinessOf(signalById.get(e.providerEventId) ?? null),
    }));

  return {
    state: events.length > 0 ? "ACTIVE" : "NO_ACTIVE_SLATE",
    note: events.length > 0
      ? `${events.length} NFL game${events.length === 1 ? "" : "s"} carry a deterministic simulation from the current window; ${events.filter((e) => e.simulationReady).length} of them apply event-specific team evidence.`
      : "The NFL index is readable and lists no game with a current simulation — a real empty slate, not an outage.",
    events,
    readyCount: events.filter((e) => e.simulationReady).length,
    indexGeneratedAt: index.generatedAt,
  };
}

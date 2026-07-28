/**
 * MLB adapter — turns StatsAPI schedule rows and provider market events into canonical
 * `EventIdentity` objects.
 *
 * EVERY baseball assumption lives here and nowhere else. `event-identity.ts` must stay importable by
 * a UFC or soccer adapter without inheriting `gamePk`, "home/away", or an ET slate boundary. The
 * Sprint 041 defect happened because a sport-specific assumption ("a team plays once per date") lived
 * in a place nothing marked as sport-specific; the file boundary here is the structural fix for that.
 *
 * The doubleheader resolution mirrors `pipeline/mlb/generate_mlb_board.py::_resolve_team_ctx`
 * deliberately: nearest scheduled start rather than exact match, because StatsAPI and the odds
 * provider disagree by up to a minute in practice (2026-07-28 first pitch: 17:40:00Z vs 17:41:00Z).
 * An equality join fails on precisely the game it most needs to resolve.
 */
import {
  deriveEventId,
  type EventIdentity,
  type EventParticipant,
  type EventStatus,
  type ProviderRef,
} from "./event-identity";

export const MLB_SPORT = "mlb";
export const MLB_LEAGUE = "MLB";
export const STATSAPI_PROVIDER = "statsapi";
export const ODDS_PROVIDER = "odds-api";

/** A StatsAPI schedule row, reduced to what identity needs. */
export interface MlbScheduleRow {
  readonly gamePk: number | string;
  readonly gameDate: string | null;
  readonly homeTeamName: string | null;
  readonly awayTeamName: string | null;
  readonly homeTeamAbbr?: string | null;
  readonly awayTeamAbbr?: string | null;
  readonly homeTeamId?: number | string | null;
  readonly awayTeamId?: number | string | null;
  readonly status?: string | null;
}

/** A provider market event, reduced to what identity needs. */
export interface MlbMarketEvent {
  readonly gameId: string;
  readonly homeTeam: string | null;
  readonly awayTeam: string | null;
  readonly commenceTime: string | null;
}

/** StatsAPI status strings vary; map conservatively and default to `unknown` rather than guessing. */
function mapStatus(raw: string | null | undefined): EventStatus {
  const s = (raw ?? "").toLowerCase();
  if (!s) return "unknown";
  if (s.includes("final") || s.includes("completed") || s.includes("game over")) return "final";
  if (s.includes("in progress") || s.includes("live") || s.includes("delayed start")) return "in_progress";
  if (s.includes("postponed") || s.includes("suspended")) return "postponed";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("scheduled") || s.includes("pre-game") || s.includes("warmup")) return "scheduled";
  return "unknown";
}

const epoch = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/**
 * Build canonical identities from a StatsAPI schedule.
 *
 * One identity per scheduled game — including each half of a doubleheader, which is the whole point.
 */
export function identitiesFromSchedule(
  rows: readonly MlbScheduleRow[],
  resolvedAt: string,
): EventIdentity[] {
  const out: EventIdentity[] = [];

  for (const row of rows) {
    if (!row.homeTeamName || !row.awayTeamName) continue; // never fabricate a participant

    const participants: EventParticipant[] = [
      {
        role: "home",
        name: row.homeTeamName,
        abbreviation: row.homeTeamAbbr ?? null,
        ...(row.homeTeamId != null ? { providerIds: { [STATSAPI_PROVIDER]: String(row.homeTeamId) } } : {}),
      },
      {
        role: "away",
        name: row.awayTeamName,
        abbreviation: row.awayTeamAbbr ?? null,
        ...(row.awayTeamId != null ? { providerIds: { [STATSAPI_PROVIDER]: String(row.awayTeamId) } } : {}),
      },
    ];

    const scheduledStart = row.gameDate ?? null;
    const providerIds: ProviderRef[] = [
      { provider: STATSAPI_PROVIDER, id: String(row.gamePk), kind: "game" },
    ];

    out.push({
      eventId: deriveEventId({
        sport: MLB_SPORT,
        league: MLB_LEAGUE,
        participants,
        scheduledStart,
      }),
      sport: MLB_SPORT,
      league: MLB_LEAGUE,
      participants,
      scheduledStart,
      status: mapStatus(row.status),
      providerIds,
      provenance: {
        source: "mlb-adapter/statsapi-schedule",
        resolvedAt,
        method: "one identity per StatsAPI gamePk; start time to the minute distinguishes doubleheaders",
      },
    });
  }

  return out;
}

/**
 * Attach a provider market event to the identity it belongs to.
 *
 * Returns the matched identity, or null when no candidate exists. Never guesses: a market event whose
 * teams are unknown to the schedule returns null so the caller can record an unresolved reference
 * rather than silently binding it to something plausible.
 */
export function matchMarketEvent(
  identities: readonly EventIdentity[],
  event: MlbMarketEvent,
): EventIdentity | null {
  if (!event.homeTeam || !event.awayTeam) return null;

  const home = event.homeTeam.toLowerCase();
  const away = event.awayTeam.toLowerCase();
  const candidates = identities.filter((id) => {
    const names = id.participants.map((p) => p.name.toLowerCase());
    return names.includes(home) && names.includes(away);
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Doubleheader (or a replayed fixture). Disambiguate by nearest scheduled start.
  const target = epoch(event.commenceTime);
  if (target == null) {
    // No time to match on. Pick the earliest so the choice is deterministic across runs rather than
    // dependent on input order — an arbitrary-but-stable answer beats an arbitrary-and-unstable one.
    return [...candidates].sort(
      (a, b) => (epoch(a.scheduledStart) ?? Infinity) - (epoch(b.scheduledStart) ?? Infinity),
    )[0];
  }

  return [...candidates].sort((a, b) => {
    const da = Math.abs((epoch(a.scheduledStart) ?? Infinity) - target);
    const db = Math.abs((epoch(b.scheduledStart) ?? Infinity) - target);
    return da - db;
  })[0];
}

/**
 * Enrich identities with the odds-provider aliases that matched them.
 *
 * Returns both the enriched identities and the market events that matched nothing, so a caller can
 * fail loudly on unresolved references instead of dropping them — the silent-drop behaviour is what
 * made the Sprint 041 orphan invisible.
 */
export function attachMarketAliases(
  identities: readonly EventIdentity[],
  events: readonly MlbMarketEvent[],
): { identities: EventIdentity[]; unmatched: MlbMarketEvent[] } {
  const aliasesByEvent = new Map<string, ProviderRef[]>();
  const unmatched: MlbMarketEvent[] = [];

  for (const ev of events) {
    const match = matchMarketEvent(identities, ev);
    if (!match) {
      unmatched.push(ev);
      continue;
    }
    const refs = aliasesByEvent.get(match.eventId) ?? [];
    refs.push({ provider: ODDS_PROVIDER, id: ev.gameId, kind: "event" });
    aliasesByEvent.set(match.eventId, refs);
  }

  const enriched = identities.map((id) => {
    const extra = aliasesByEvent.get(id.eventId);
    if (!extra || extra.length === 0) return id;
    return { ...id, providerIds: [...id.providerIds, ...extra] };
  });

  return { identities: enriched, unmatched };
}

/** Look up an identity by a provider alias — the read path every consumer should use. */
export function findByProviderRef(
  identities: readonly EventIdentity[],
  provider: string,
  id: string,
): EventIdentity | null {
  const hits = identities.filter((e) =>
    (e.providerIds ?? []).some((r) => r.provider === provider && r.id === id),
  );
  // More than one hit is a collision; the caller should have run validation. Return null rather than
  // picking, so an unvalidated collision cannot silently resolve to an arbitrary event.
  return hits.length === 1 ? hits[0] : null;
}

/**
 * NBA adapter — turns NBA schedule rows and odds events into canonical `EventIdentity` objects.
 *
 * WHAT THIS REPLACES
 * The NBA board's odds→game join is by team FULL NAME (`generate_daily_board.py`). That is the same
 * anti-pattern that produced the UFC rematch collision and the MLB doubleheader collision: a display
 * string used as a primary key. It also cannot survive the spellings the real artifacts contain —
 * boards say "NY"/"SA", manual overrides say "NYK"/"SAS", and three disjoint game-id namespaces run
 * through the corpus (nba_api 10-digit, ESPN 9-digit, and synthetic `manual-…` ids).
 *
 * `identity-contract.ts` already answers "is this the same team / player / game?" — 30 canonical
 * tricodes, an alias map, `parseNbaComGameId`, crosswalks, reschedule lineage. It was written and
 * never wired. This file is the wiring: it maps that contract onto the sport-independent
 * `EventIdentity` / `SportAdapter` seams so NBA joins the same identity machinery MLB uses, rather
 * than a parallel one that will drift.
 *
 * EVERY basketball assumption lives here. `event-identity.ts` must stay importable by a soccer or
 * UFC adapter without inheriting tricodes or an ET slate boundary.
 *
 * FAIL CLOSED, ALWAYS. A team spelling that does not resolve, a matchup that resolves to more than
 * one game, an alias claimed by two events — each returns a refusal, never a best guess. NBA plays
 * no doubleheaders, so two identities for the same matchup on the same date is a data defect, and
 * "pick the nearest start" (correct for MLB) would silently paper over it here.
 *
 * NBA IS HISTORICAL_ONLY. Nothing in this file projects, scores, or settles. `readiness` states that
 * and `settleMarkets` refuses rather than returning an empty list — a silent drop is the defect that
 * left 192 soccer legs permanently pending.
 */
import {
  buildAliasIndex,
  deriveEventId,
  type AliasIndex,
  type EventIdentity,
  type EventParticipant,
  type EventStatus,
  type IdentityViolation,
  type ProviderRef,
} from "../identity/event-identity";
import type { SettledMarket, SportAdapter, SportMarket } from "../identity/sport-adapter";
import {
  canonicalTeamId,
  detectGameIdProvider,
  parseNbaComGameId,
  type NbaIdProvider,
  type NbaTricode,
} from "./identity-contract";

export const NBA_SPORT = "nba";
export const NBA_LEAGUE = "NBA";

/** A schedule row, reduced to what identity needs. Shapes every NBA source can be reduced to. */
export interface NbaScheduleRow {
  readonly gameId: string;
  /** Slate date, YYYY-MM-DD (ET). Required — it is what scopes the identity when no instant exists. */
  readonly date: string;
  readonly homeTeam: string | null;
  readonly awayTeam: string | null;
  /** ISO 8601 tip-off INSTANT, when the board recorded one. Display text ("8:30 PM ET") is not one. */
  readonly tipoffIso?: string | null;
  readonly status?: string | null;
}

/** An odds-provider event, reduced to what identity needs. */
export interface NbaOddsEvent {
  readonly eventId: string;
  readonly homeTeam: string | null;
  readonly awayTeam: string | null;
  readonly commenceTime?: string | null;
  /** Slate date, when the feed scopes events by date rather than by instant. */
  readonly date?: string | null;
}

/** Why a row could not become an identity. Recorded, never silently dropped. */
export type NbaIdentityRefusalCode =
  | "UNRESOLVED_TEAM"
  | "SAME_TEAM_BOTH_SIDES"
  | "MISSING_DATE"
  | "MISSING_GAME_ID"
  | "AMBIGUOUS_MATCHUP"
  | "NO_CANDIDATE";

export interface NbaIdentityRefusal {
  readonly code: NbaIdentityRefusalCode;
  readonly subject: string;
  readonly message: string;
}

const ODDS_PROVIDER = "odds-api";

/** Provider key namespaces, so a 9-digit ESPN id and a 10-digit NBA.com id can never compare equal. */
const PROVIDER_KEY: Readonly<Record<NbaIdProvider, string>> = {
  nba_api: "nba-stats",
  espn: "espn",
  odds_api: ODDS_PROVIDER,
  manual: "manual-override",
  unknown: "unknown-provider",
};

/** NBA status strings vary by source; map conservatively and default to `unknown` over guessing. */
export function mapStatus(raw: string | null | undefined): EventStatus {
  const s = (raw ?? "").toLowerCase();
  if (!s) return "unknown";
  if (s.includes("final") || s.includes("completed")) return "final";
  if (s.includes("in progress") || s.includes("live") || s.includes("halftime")) return "in_progress";
  if (s.includes("postpon") || s.includes("suspend") || s.includes("reschedul")) return "postponed";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("scheduled") || s.includes("pre-game")) return "scheduled";
  return "unknown";
}

/**
 * The `scheduledStart` value the event id is derived from.
 *
 * An instant when the board recorded one — that is minute granularity, which separates a game from
 * any same-day repeat. The DATE otherwise, which is day granularity and is the honest ceiling for
 * the historical corpus: those boards stored tip-off as display text and no instant can be
 * reconstructed from it. The identity's own `scheduledStart` still reports null in that case, so a
 * consumer can tell a dated id from a timed one rather than assuming the id implies an instant.
 */
function idAnchor(row: { tipoffIso?: string | null; date: string }): string {
  const t = row.tipoffIso;
  return t && Number.isFinite(Date.parse(t)) && t.includes("T") ? t : row.date;
}

function participantsOf(home: NbaTricode, away: NbaTricode): EventParticipant[] {
  // The canonical tricode is the participant NAME, not a display name. Identity must not depend on
  // which of "NY" / "NYK" / "New York Knicks" a given source happened to write.
  return [
    { role: "home", name: home, abbreviation: home },
    { role: "away", name: away, abbreviation: away },
  ];
}

/**
 * Build canonical identities from NBA schedule rows.
 *
 * Returns identities AND refusals. A caller that only wants the happy path can ignore the refusals,
 * but it has to ignore them deliberately — which is the difference between this and a filter.
 */
export function identitiesFromSchedule(
  rows: readonly NbaScheduleRow[],
  resolvedAt: string,
): { identities: EventIdentity[]; refusals: NbaIdentityRefusal[]; slateDates: Map<string, string> } {
  const identities: EventIdentity[] = [];
  const refusals: NbaIdentityRefusal[] = [];
  // eventId -> the ET SLATE date the schedule assigned it. Carried separately because it is not
  // recoverable from the identity: a 20:30 ET tip-off is the next UTC day, so slicing an instant
  // (or the id's `when` segment) yields the wrong slate for most of an NBA evening.
  const slateDates = new Map<string, string>();

  for (const row of rows) {
    const subject = row.gameId || `${row.awayTeam ?? "?"}@${row.homeTeam ?? "?"} ${row.date ?? "?"}`;
    if (!row.gameId) {
      refusals.push({
        code: "MISSING_GAME_ID",
        subject,
        message: "schedule row has no provider game id — nothing to record as an alias",
      });
      continue;
    }
    if (!row.date) {
      refusals.push({
        code: "MISSING_DATE",
        subject,
        message: `game ${row.gameId} has no slate date — its identity would not be scoped to a day`,
      });
      continue;
    }
    const home = canonicalTeamId(row.homeTeam);
    const away = canonicalTeamId(row.awayTeam);
    if (!home || !away) {
      refusals.push({
        code: "UNRESOLVED_TEAM",
        subject,
        message: `game ${row.gameId} has a team spelling outside the 30-tricode contract (home ${JSON.stringify(row.homeTeam)}, away ${JSON.stringify(row.awayTeam)})`,
      });
      continue;
    }
    if (home === away) {
      refusals.push({
        code: "SAME_TEAM_BOTH_SIDES",
        subject,
        message: `game ${row.gameId} resolves both sides to ${home} — a team cannot play itself`,
      });
      continue;
    }

    const provider = detectGameIdProvider(row.gameId);
    const decoded = parseNbaComGameId(row.gameId);
    const participants = participantsOf(home, away);
    const providerIds: ProviderRef[] = [
      { provider: PROVIDER_KEY[provider], id: row.gameId, kind: "game" },
    ];

    const eventId = deriveEventId({
      sport: NBA_SPORT,
      league: NBA_LEAGUE,
      participants,
      scheduledStart: idAnchor(row),
    });
    slateDates.set(eventId, row.date);

    identities.push({
      eventId,
      sport: NBA_SPORT,
      league: NBA_LEAGUE,
      participants,
      // Never the date dressed up as an instant. Null here means "we cannot prove when this
      // started", which is exactly the state 54 historical boards are in.
      scheduledStart: row.tipoffIso ?? null,
      status: mapStatus(row.status),
      providerIds,
      provenance: {
        source: `nba-adapter/${provider}-schedule`,
        resolvedAt,
        method: `canonical tricodes + slate date${row.tipoffIso ? " + ISO tip-off instant" : " (no tip-off instant recorded)"}${decoded.valid ? `; NBA.com id decodes to ${decoded.seasonType} ${decoded.seasonStartYear}` : ""}`,
      },
    });
  }

  return { identities, refusals, slateDates };
}

/** The identities for a slate plus everything needed to join into them. */
export interface NbaIdentityIndex {
  readonly identities: readonly EventIdentity[];
  readonly refusals: readonly NbaIdentityRefusal[];
  /** eventId → ET slate date. Not derivable from the identity; see `identitiesFromSchedule`. */
  readonly slateDates: ReadonlyMap<string, string>;
  /** Collision-refusing index over every provider game id, across all three namespaces. */
  readonly byGameId: AliasIndex<EventIdentity>;
}

export function buildNbaIdentityIndex(
  rows: readonly NbaScheduleRow[],
  resolvedAt: string,
): NbaIdentityIndex {
  const { identities, refusals, slateDates } = identitiesFromSchedule(rows, resolvedAt);
  return { identities, refusals, slateDates, byGameId: buildGameIdIndex(identities) };
}

/**
 * Match an odds event to the one identity it belongs to.
 *
 * Tricode pair + slate date. NOT team full name, which is what the board does today and what cannot
 * reconcile "New York Knicks" with a board that wrote "NY".
 *
 * Returns null on zero candidates AND on more than one. The second case matters: MLB's adapter
 * disambiguates a multi-candidate match by nearest scheduled start because doubleheaders are real
 * there. NBA has none, so two identities for one matchup on one date is a defect in the schedule,
 * and resolving it by proximity would hand a market to an arbitrary half of a broken pair.
 */
export function matchOddsEvent(
  index: NbaIdentityIndex,
  event: NbaOddsEvent,
): { identity: EventIdentity | null; refusal: NbaIdentityRefusal | null } {
  const subject = event.eventId || `${event.awayTeam ?? "?"}@${event.homeTeam ?? "?"}`;
  const home = canonicalTeamId(event.homeTeam);
  const away = canonicalTeamId(event.awayTeam);
  if (!home || !away || home === away) {
    return {
      identity: null,
      refusal: {
        code: "UNRESOLVED_TEAM",
        subject,
        message: `odds event ${subject} does not resolve to two distinct canonical tricodes (home ${JSON.stringify(event.homeTeam)}, away ${JSON.stringify(event.awayTeam)})`,
      },
    };
  }

  const matchup = index.identities.filter((id) => {
    const names = new Set(id.participants.map((p) => p.name));
    return names.has(home) && names.has(away);
  });

  // Narrowing, in order of how much the event actually tells us. A UTC commence time is NOT sliced
  // into a slate date: an 8:30 PM ET tip-off is the next UTC day, and that off-by-one would attach
  // most of an NBA evening to the wrong slate.
  let candidates = matchup;
  if (event.date) {
    candidates = matchup.filter((id) => index.slateDates.get(id.eventId) === event.date);
  } else if (event.commenceTime && matchup.length > 1) {
    const exact = matchup.filter((id) => id.scheduledStart === event.commenceTime);
    if (exact.length === 1) candidates = exact;
  }

  if (candidates.length === 0) {
    return {
      identity: null,
      refusal: {
        code: "NO_CANDIDATE",
        subject,
        message: `odds event ${subject} (${away}@${home}${event.date ? ` on ${event.date}` : ""}) matches no known game`,
      },
    };
  }
  if (candidates.length > 1) {
    return {
      identity: null,
      refusal: {
        code: "AMBIGUOUS_MATCHUP",
        subject,
        message: `odds event ${subject} matches ${candidates.length} games (${candidates.map((c) => c.eventId).join(", ")}) — NBA plays no doubleheaders, so this is a schedule defect, not a tie to break`,
      },
    };
  }
  return { identity: candidates[0], refusal: null };
}

/**
 * Attach odds-provider aliases to the identities they matched.
 *
 * Returns the enriched identities and every event that matched nothing or too much, so a caller can
 * fail loudly rather than dropping them — the silent drop is what made the Sprint 041 orphan invisible.
 */
export function attachOddsAliases(
  index: NbaIdentityIndex,
  events: readonly NbaOddsEvent[],
): { identities: EventIdentity[]; refusals: NbaIdentityRefusal[] } {
  const aliasesByEvent = new Map<string, ProviderRef[]>();
  const refusals: NbaIdentityRefusal[] = [];

  for (const event of events) {
    const { identity, refusal } = matchOddsEvent(index, event);
    if (!identity || refusal) {
      if (refusal) refusals.push(refusal);
      continue;
    }
    const refs = aliasesByEvent.get(identity.eventId) ?? [];
    refs.push({ provider: ODDS_PROVIDER, id: event.eventId, kind: "event" });
    aliasesByEvent.set(identity.eventId, refs);
  }

  const enriched = index.identities.map((id) => {
    const extra = aliasesByEvent.get(id.eventId);
    return extra && extra.length ? { ...id, providerIds: [...id.providerIds, ...extra] } : id;
  });
  return { identities: enriched, refusals };
}

/**
 * A collision-refusing index over every provider game id, across all three namespaces.
 *
 * Keys are namespaced (`espn:401859967`, `nba-stats:0042500206`) so ids from different systems can
 * never collide by numeric accident. `buildAliasIndex` blocks BOTH sides of any many-to-one mapping
 * (Sprint 043), so a corrupted crosswalk returns null — visibly missing — instead of another game.
 */
export function buildGameIdIndex(
  identities: readonly EventIdentity[],
): AliasIndex<EventIdentity> {
  const pairs = identities.flatMap((identity) =>
    identity.providerIds.map(
      (ref) => [`${ref.provider}:${ref.id}`, identity] as const,
    ),
  );
  return buildAliasIndex<EventIdentity>(pairs, (e) => e.eventId);
}

/** Resolve a raw provider game id through the index. Null when unknown OR ambiguous. */
export function resolveByGameId(
  index: AliasIndex<EventIdentity>,
  rawGameId: string | null | undefined,
  provider?: NbaIdProvider,
): EventIdentity | null {
  if (!rawGameId) return null;
  const ns = PROVIDER_KEY[provider ?? detectGameIdProvider(rawGameId)];
  return index.resolve(`${ns}:${rawGameId}`);
}

/** Sport-specific structural checks, on top of the universal identity invariants. */
export function validateNbaEvent(event: EventIdentity): IdentityViolation[] {
  const violations: IdentityViolation[] = [];
  if (event.participants.length !== 2) {
    violations.push({
      code: "MALFORMED_IDENTITY",
      message: `NBA event ${event.eventId} has ${event.participants.length} participants — a game has exactly two`,
      subjects: [event.eventId],
    });
    return violations;
  }
  const codes = event.participants.map((p) => canonicalTeamId(p.name));
  if (codes.some((c) => c === null)) {
    violations.push({
      code: "MALFORMED_IDENTITY",
      message: `NBA event ${event.eventId} carries a participant outside the 30-tricode contract`,
      subjects: [event.eventId],
    });
  } else if (codes[0] === codes[1]) {
    violations.push({
      code: "MALFORMED_IDENTITY",
      message: `NBA event ${event.eventId} lists ${codes[0]} on both sides`,
      subjects: [event.eventId],
    });
  }
  return violations;
}

/**
 * The adapter.
 *
 * `getEvents` and `getMarkets` return empty because there is no live NBA source — the season ended
 * 2026-06-13 and stats.nba.com times out from CI. Empty is the correct answer; a cached guess is not.
 */
export const NBA_ADAPTER: SportAdapter = {
  sport: NBA_SPORT,
  league: NBA_LEAGUE,
  readiness: "HISTORICAL_ONLY",
  readinessEvidence:
    "54 boards and 4,592 settled rows exist (3,635 decisive), but 0 boards are research-eligible, no lineage gate has ever run for NBA settlement, and the historical model is below coin-flip with publicApproved:false. See docs/NBA_RESEARCH_ADAPTER_READINESS.md.",

  getEvents(): readonly EventIdentity[] {
    return [];
  },

  resolveIdentity(ref: ProviderRef, known: readonly EventIdentity[]): EventIdentity | null {
    const hits = known.filter((e) =>
      (e.providerIds ?? []).some((r) => r.provider === ref.provider && r.id === ref.id),
    );
    // More than one hit is a collision. Return null rather than picking, so an unvalidated collision
    // cannot silently resolve to an arbitrary event.
    return hits.length === 1 ? hits[0] : null;
  },

  getMarkets(): readonly SportMarket[] {
    return [];
  },

  settleMarkets(markets: readonly SportMarket[]): readonly SettledMarket[] {
    // NOT an empty list. Settlement for NBA runs in Python, through the lineage gate in
    // `pipeline/nba/settle_results.py`; answering "[]" here would read as "nothing to settle" and
    // reproduce the soccer failure where 192 legs were dropped instead of recorded.
    return markets.map((m) => ({
      eventId: m.eventId,
      market: m.market,
      selection: m.selection,
      result: "ungradeable" as const,
      basis:
        "NBA settlement is not implemented in TypeScript. The single implementation is pipeline/nba/settle_results.py, which grades from an official box score behind the settlement-lineage gate.",
      source: "none",
    }));
  },

  validateEvent(event: EventIdentity): readonly IdentityViolation[] {
    return validateNbaEvent(event);
  },
};

/**
 * EPL identity adapter — soccer's implementation of the canonical `EventIdentity` seam.
 *
 * Every soccer assumption lives here. `lib/identity/event-identity.ts` stays importable by any sport
 * and learns nothing about clubs, kickoffs or competitions from this file — the same boundary that
 * keeps the MLB adapter's `gamePk` out of the universal layer.
 *
 * TWO THINGS MAKE A FIXTURE DISTINCT, AND BOTH ARE REQUIRED
 *   competition   Arsenal v Chelsea in the league and in a cup are different events. The league is
 *                 part of the id, so a future cup adapter cannot collide with this one.
 *   kickoff       Clubs meet twice a season, and a postponed fixture is replayed at a third time.
 *                 `deriveEventId` truncates to the MINUTE, which separates all of them.
 *
 * A provider's fixture id is an ALIAS on the identity, never the identity. That inversion is what
 * makes a bad join expressible — the World Cup era keyed team projections on an API-Football numeric
 * fixture id and player props on an Odds API hex event id, then joined them by fixture NAME.
 */
import {
  buildAliasIndex,
  deriveEventId,
  type AliasIndex,
  type EventIdentity,
  type EventParticipant,
  type EventStatus,
  type ProviderRef,
} from "@/lib/identity/event-identity";
import { assertClubTableSound, buildEplClubIndex, type EplClub, type EplClubIndex } from "./epl-clubs";
import { mapFixtureLifecycle, type FixtureLifecycleState } from "./epl-lifecycle";

export const SOCCER_SPORT = "soccer";
export const EPL_LEAGUE = "EPL";
export const EPL_COMPETITION = "epl";
export const ODDS_PROVIDER = "odds-api";

/** A fixture as a provider describes it, reduced to what identity needs. */
export interface EplFixtureInput {
  readonly homeClub: string | null;
  readonly awayClub: string | null;
  /** Kickoff in UTC, ISO 8601. Null makes the fixture unidentifiable, not "today". */
  readonly kickoffIso: string | null;
  readonly status?: string | null;
  readonly providerRefs?: readonly ProviderRef[];
  /** Competition slug. Defaults to `epl`; a cup fixture must state its own and gets its own id space. */
  readonly competition?: string;
}

export type EplIdentityRejectionCode =
  | "UNRESOLVED_CLUB"
  | "MISSING_KICKOFF"
  | "UNPARSEABLE_KICKOFF"
  | "SAME_CLUB_BOTH_SIDES";

export interface EplIdentityRejection {
  readonly code: EplIdentityRejectionCode;
  readonly message: string;
  readonly input: EplFixtureInput;
}

/** Lifecycle is the settlement-side state; `EventStatus` is the coarse universal one. Both are kept. */
const EVENT_STATUS_BY_LIFECYCLE: Record<FixtureLifecycleState, EventStatus> = {
  SCHEDULED: "scheduled",
  FINAL_FT: "final",
  FINAL_AET: "final",
  FINAL_PEN: "final",
  POSTPONED: "postponed",
  ABANDONED: "cancelled",
  REPLAYED: "scheduled",
  UNKNOWN: "unknown",
};

/**
 * Resolve one fixture into a canonical identity.
 *
 * Returns a rejection rather than a partial identity. A fixture whose club the table cannot name is
 * a fixture we cannot join anything to; emitting it with the provider's raw spelling would make the
 * unresolved state look resolved everywhere downstream.
 */
export function identityFromFixture(
  input: EplFixtureInput,
  resolvedAt: string,
  index: EplClubIndex = buildEplClubIndex(),
): { identity: EventIdentity } | { rejection: EplIdentityRejection } {
  assertClubTableSound(index);

  const home = index.resolve(input.homeClub);
  const away = index.resolve(input.awayClub);
  const unresolved = [
    ...(home ? [] : [input.homeClub ?? "(missing)"]),
    ...(away ? [] : [input.awayClub ?? "(missing)"]),
  ];
  if (unresolved.length > 0) {
    return {
      rejection: {
        code: "UNRESOLVED_CLUB",
        message: `club spelling not in the EPL naming index: ${unresolved.join(", ")}`,
        input,
      },
    };
  }
  if (home!.canonical === away!.canonical) {
    return {
      rejection: {
        code: "SAME_CLUB_BOTH_SIDES",
        message: `both sides resolved to ${home!.canonical} — a fixture needs two clubs`,
        input,
      },
    };
  }
  if (!input.kickoffIso) {
    return {
      rejection: { code: "MISSING_KICKOFF", message: "kickoff is required to identify a fixture", input },
    };
  }
  if (!Number.isFinite(Date.parse(input.kickoffIso))) {
    return {
      rejection: {
        code: "UNPARSEABLE_KICKOFF",
        message: `kickoff "${input.kickoffIso}" is not a parseable ISO 8601 instant`,
        input,
      },
    };
  }

  const competition = input.competition ?? EPL_COMPETITION;
  const participants: EventParticipant[] = [
    { role: "home", name: home!.canonical, abbreviation: home!.abbr },
    { role: "away", name: away!.canonical, abbreviation: away!.abbr },
  ];
  const lifecycle = mapFixtureLifecycle(input.status);

  return {
    identity: {
      eventId: deriveEventId({
        sport: SOCCER_SPORT,
        league: competition,
        participants,
        scheduledStart: input.kickoffIso,
      }),
      sport: SOCCER_SPORT,
      league: competition === EPL_COMPETITION ? EPL_LEAGUE : competition,
      participants,
      scheduledStart: input.kickoffIso,
      status: EVENT_STATUS_BY_LIFECYCLE[lifecycle],
      providerIds: [...(input.providerRefs ?? [])],
      provenance: {
        source: "epl-adapter/fixture-list",
        resolvedAt,
        method:
          "clubs resolved through the EPL naming index (ambiguous alias refuses); id scoped by competition and kickoff to the minute",
      },
    },
  };
}

/** Resolve a fixture list, keeping rejections instead of dropping them. */
export function identitiesFromFixtures(
  rows: readonly EplFixtureInput[],
  resolvedAt: string,
  index: EplClubIndex = buildEplClubIndex(),
): { identities: EventIdentity[]; rejections: EplIdentityRejection[] } {
  const identities: EventIdentity[] = [];
  const rejections: EplIdentityRejection[] = [];
  for (const row of rows) {
    const out = identityFromFixture(row, resolvedAt, index);
    if ("identity" in out) identities.push(out.identity);
    else rejections.push(out.rejection);
  }
  return { identities, rejections };
}

/**
 * Index provider refs to canonical event ids.
 *
 * This IS the injective case `buildAliasIndex.resolve` is written for: one provider fixture id names
 * one event, in both directions. A ref claimed by two events, or an event claimed through a ref
 * another event also claims, resolves to null — visibly missing beats another fixture's market shown
 * as this fixture's.
 */
export function buildEplProviderIndex(identities: readonly EventIdentity[]): AliasIndex<string> {
  const pairs: [string, string][] = [];
  for (const id of identities) {
    for (const ref of id.providerIds ?? []) pairs.push([providerKey(ref), id.eventId]);
  }
  return buildAliasIndex(pairs);
}

export const providerKey = (ref: ProviderRef): string => `${ref.provider}:${ref.id}`;

/** The read path for "which event is this provider row about?". Null on unknown or ambiguous. */
export function resolveEplEventId(
  index: AliasIndex<string>,
  ref: ProviderRef,
): string | null {
  return index.resolve(providerKey(ref));
}

/** Convenience for surfaces: the club records behind an identity, in home/away order. */
export function clubsOf(
  identity: EventIdentity,
  index: EplClubIndex = buildEplClubIndex(),
): { home: EplClub | null; away: EplClub | null } {
  const find = (role: "home" | "away") =>
    index.resolve(identity.participants.find((p) => p.role === role)?.name ?? null);
  return { home: find("home"), away: find("away") };
}

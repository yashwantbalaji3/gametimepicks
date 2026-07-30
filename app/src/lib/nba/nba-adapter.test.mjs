/**
 * NBA adapter guards.
 *
 * The positive cases are cheap. What this file is for is the refusals: every way a join can be
 * wrong, asserted individually, so a future change that makes NBA joins "work" by relaxing one of
 * them fails here rather than shipping a market attached to the wrong game.
 *
 * Run: npx tsx --test src/lib/nba/nba-adapter.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  NBA_ADAPTER,
  attachOddsAliases,
  buildGameIdIndex,
  buildNbaIdentityIndex,
  identitiesFromSchedule,
  matchOddsEvent,
  resolveByGameId,
  validateNbaEvent,
} from "./nba-adapter.ts";
import { validateIdentities } from "../identity/event-identity.ts";

const AT = "2026-10-21T12:00:00Z";

const SCHEDULE = [
  {
    gameId: "401859967",
    date: "2026-10-21",
    homeTeam: "SA",
    awayTeam: "NY",
    tipoffIso: "2026-10-22T00:30Z",
    status: "Scheduled",
  },
  {
    gameId: "0022600123",
    date: "2026-10-21",
    homeTeam: "Boston Celtics",
    awayTeam: "MIA",
    status: "Scheduled",
  },
];

const ids = (rows = SCHEDULE) => identitiesFromSchedule(rows, AT);
const index = (rows = SCHEDULE) => buildNbaIdentityIndex(rows, AT);

test("divergent team spellings resolve to the same canonical identity", () => {
  const espn = ids([SCHEDULE[0]]).identities[0];
  const manual = ids([
    { ...SCHEDULE[0], gameId: "manual-2026-10-21-SAS-NYK", homeTeam: "SAS", awayTeam: "NYK" },
  ]).identities[0];
  // "SA"/"NY" (board) and "SAS"/"NYK" (manual override) are the same two franchises. A string
  // comparison of the raw abbreviations would say otherwise — that is the join this replaces.
  assert.equal(espn.eventId, manual.eventId);
  assert.deepEqual(
    espn.participants.map((p) => p.name).sort(),
    ["NYK", "SAS"],
  );
});

test("full team names never enter the identity", () => {
  const [, celtics] = ids().identities;
  assert.deepEqual(celtics.participants.map((p) => p.name).sort(), ["BOS", "MIA"]);
});

test("an identity built without an instant reports scheduledStart null, never the date", () => {
  const [withInstant, withoutInstant] = ids().identities;
  assert.equal(withInstant.scheduledStart, "2026-10-22T00:30Z");
  assert.equal(withoutInstant.scheduledStart, null);
  assert.match(withoutInstant.provenance.method, /no tip-off instant recorded/);
});

test("the event id is scoped to the day even without an instant", () => {
  const a = ids([SCHEDULE[1]]).identities[0];
  const b = ids([{ ...SCHEDULE[1], date: "2026-11-04", gameId: "0022600456" }]).identities[0];
  assert.notEqual(a.eventId, b.eventId, "same matchup on two dates must be two events");
});

test("game-id namespaces are crosswalked without colliding", () => {
  const index = buildGameIdIndex(ids().identities);
  assert.ok(index.isInjective);
  assert.equal(resolveByGameId(index, "401859967").participants[0].name, "SAS");
  assert.equal(resolveByGameId(index, "0022600123").participants[0].name, "BOS");
  assert.equal(resolveByGameId(index, "manual-nope"), null);
  assert.equal(resolveByGameId(index, null), null);
});

test("a numerically identical id in two namespaces stays distinct", () => {
  // Contrived on purpose: the real hazard is an unnamespaced index where a 9-digit ESPN id and some
  // other source's id compare equal. Namespacing makes that unrepresentable rather than unlikely.
  const built = ids([
    SCHEDULE[0],
    { ...SCHEDULE[1], gameId: "401859967", date: "2026-10-21" },
  ]);
  const index = buildGameIdIndex(built.identities);
  assert.equal(index.isInjective, false, "same raw id in one namespace is a collision");
  assert.equal(resolveByGameId(index, "401859967"), null, "collision resolves to null, not a guess");
});

test("odds events join by tricode pair, not by full name", () => {
  const { identities } = ids();
  const { identity, refusal } = matchOddsEvent(index(), {
    eventId: "odds-1",
    homeTeam: "San Antonio Spurs",
    awayTeam: "New York Knicks",
    commenceTime: "2026-10-22T00:30:00Z",
    date: "2026-10-21",
  });
  assert.equal(refusal, null);
  assert.equal(identity.eventId, identities[0].eventId);
});

test("an odds event for a team outside the contract is refused", () => {
  const { identity, refusal } = matchOddsEvent(index(), {
    eventId: "odds-2",
    homeTeam: "Seattle SuperSonics",
    awayTeam: "NY",
    date: "2026-10-21",
  });
  assert.equal(identity, null);
  assert.equal(refusal.code, "UNRESOLVED_TEAM");
});

test("an odds event matching no game is refused rather than attached to the nearest one", () => {
  const { identity, refusal } = matchOddsEvent(index(), {
    eventId: "odds-3",
    homeTeam: "DEN",
    awayTeam: "PHX",
    date: "2026-10-21",
  });
  assert.equal(identity, null);
  assert.equal(refusal.code, "NO_CANDIDATE");
});

test("two identities for one matchup on one date refuse instead of picking", () => {
  // MLB resolves this by nearest start because doubleheaders are real. NBA plays none, so this is a
  // schedule defect and choosing a side would hand a market to an arbitrary half of a broken pair.
  const duplicated = index([
    SCHEDULE[0],
    { ...SCHEDULE[0], gameId: "0042600206", tipoffIso: "2026-10-22T01:00Z" },
  ]);
  const { identity, refusal } = matchOddsEvent(duplicated, {
    eventId: "odds-4",
    homeTeam: "SAS",
    awayTeam: "NYK",
    date: "2026-10-21",
  });
  assert.equal(identity, null);
  assert.equal(refusal.code, "AMBIGUOUS_MATCHUP");
});

test("unmatched odds events are returned, never dropped", () => {
  const { identities, refusals } = attachOddsAliases(index(), [
    { eventId: "odds-1", homeTeam: "SAS", awayTeam: "NYK", date: "2026-10-21" },
    { eventId: "odds-x", homeTeam: "DEN", awayTeam: "PHX", date: "2026-10-21" },
  ]);
  assert.equal(refusals.length, 1);
  assert.equal(refusals[0].subject, "odds-x");
  assert.ok(identities[0].providerIds.some((r) => r.provider === "odds-api" && r.id === "odds-1"));
});

test("schedule rows that cannot be identified are refused with a reason", () => {
  const { identities, refusals } = ids([
    { gameId: "", date: "2026-10-21", homeTeam: "SA", awayTeam: "NY" },
    { gameId: "1", date: "", homeTeam: "SA", awayTeam: "NY" },
    { gameId: "2", date: "2026-10-21", homeTeam: "Seattle SuperSonics", awayTeam: "NY" },
    { gameId: "3", date: "2026-10-21", homeTeam: "NY", awayTeam: "New York Knicks" },
  ]);
  assert.equal(identities.length, 0);
  assert.deepEqual(refusals.map((r) => r.code), [
    "MISSING_GAME_ID",
    "MISSING_DATE",
    "UNRESOLVED_TEAM",
    "SAME_TEAM_BOTH_SIDES",
  ]);
});

test("built identities satisfy the universal invariants", () => {
  assert.deepEqual(validateIdentities(ids().identities), []);
  for (const identity of ids().identities) assert.deepEqual(validateNbaEvent(identity), []);
});

test("a malformed identity is reported by the sport-specific validator", () => {
  const [identity] = ids().identities;
  assert.equal(
    validateNbaEvent({ ...identity, participants: [identity.participants[0]] })[0].code,
    "MALFORMED_IDENTITY",
  );
  assert.equal(
    validateNbaEvent({
      ...identity,
      participants: [identity.participants[0], { ...identity.participants[0], role: "away" }],
    })[0].code,
    "MALFORMED_IDENTITY",
  );
});

test("the adapter claims HISTORICAL_ONLY and produces nothing forward-looking", () => {
  assert.equal(NBA_ADAPTER.readiness, "HISTORICAL_ONLY");
  assert.deepEqual(NBA_ADAPTER.getEvents("2026-10-21"), []);
  assert.deepEqual(NBA_ADAPTER.getMarkets([]), []);
});

test("settlement refuses visibly instead of returning an empty list", () => {
  const settled = NBA_ADAPTER.settleMarkets(
    [
      {
        eventId: "e1",
        market: "moneyline",
        selection: "SAS",
        provenance: { capturedAt: AT, eventStart: "2026-10-22T00:30Z" },
      },
    ],
    null,
  );
  assert.equal(settled.length, 1, "a market handed in must come back accounted for");
  assert.equal(settled[0].result, "ungradeable");
  assert.match(settled[0].basis, /pipeline\/nba\/settle_results\.py/);
});

test("provider-ref resolution returns null on a collision rather than picking", () => {
  const { identities } = ids();
  const collided = identities.map((e) => ({
    ...e,
    providerIds: [{ provider: "espn", id: "401859967", kind: "game" }],
  }));
  assert.equal(NBA_ADAPTER.resolveIdentity({ provider: "espn", id: "401859967" }, collided), null);
  assert.equal(
    NBA_ADAPTER.resolveIdentity({ provider: "espn", id: "401859967" }, [identities[0]]).eventId,
    identities[0].eventId,
  );
});

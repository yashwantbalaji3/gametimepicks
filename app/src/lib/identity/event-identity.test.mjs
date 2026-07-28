/**
 * Sprint 042 — EventIdentity contract and validation.
 *
 * The 2026-07-28 CLE @ CIN doubleheader is used as the regression case throughout, because it is the
 * real failure this layer exists to make impossible: two provider events collapsed onto one StatsAPI
 * gamePk, one simulation orphaned, one game's markets joined to another game's model output.
 *
 * The universal layer must catch that WITHOUT knowing anything about baseball.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  deriveEventId,
  validateIdentities,
  validateEventScopedRecords,
  assertPublishable,
  buildAliasIndex,
} from "./event-identity.ts";
import {
  identitiesFromSchedule,
  matchMarketEvent,
  attachMarketAliases,
  findByProviderRef,
} from "./mlb-adapter.ts";

const AT = "2026-07-28T12:00:00.000Z";

/** The real 2026-07-28 doubleheader, as StatsAPI returns it. */
const DOUBLEHEADER = [
  {
    gamePk: 824490,
    gameDate: "2026-07-28T17:40:00Z",
    homeTeamName: "Cincinnati Reds",
    awayTeamName: "Cleveland Guardians",
    homeTeamAbbr: "CIN",
    awayTeamAbbr: "CLE",
    status: "Scheduled",
  },
  {
    gamePk: 824489,
    gameDate: "2026-07-28T23:10:00Z",
    homeTeamName: "Cincinnati Reds",
    awayTeamName: "Cleveland Guardians",
    homeTeamAbbr: "CIN",
    awayTeamAbbr: "CLE",
    status: "Scheduled",
  },
];

/** The two provider market events, including the real 1-minute skew on game 1. */
const MARKET_EVENTS = [
  { gameId: "979a29c09433f74c9cf81057e852ddf2", homeTeam: "Cincinnati Reds", awayTeam: "Cleveland Guardians", commenceTime: "2026-07-28T17:41:00Z" },
  { gameId: "c869940458363d7a", homeTeam: "Cincinnati Reds", awayTeam: "Cleveland Guardians", commenceTime: "2026-07-28T23:10:00Z" },
];

// ── the id itself ──────────────────────────────────────────────────────────

test("a doubleheader produces two distinct event ids", () => {
  const [a, b] = DOUBLEHEADER.map((g) =>
    deriveEventId({
      sport: "mlb",
      league: "MLB",
      participants: [{ name: g.homeTeamName }, { name: g.awayTeamName }],
      scheduledStart: g.gameDate,
    }),
  );
  assert.notEqual(a, b, "start time to the minute must separate the two halves");
});

test("the id is stable regardless of participant order", () => {
  const base = { sport: "mlb", league: "MLB", scheduledStart: "2026-07-28T17:40:00Z" };
  const one = deriveEventId({ ...base, participants: [{ name: "Cincinnati Reds" }, { name: "Cleveland Guardians" }] });
  const two = deriveEventId({ ...base, participants: [{ name: "Cleveland Guardians" }, { name: "Cincinnati Reds" }] });
  assert.equal(one, two, "two adapters describing one event must agree");
});

test("an unscheduled event still gets a stable id rather than a crash", () => {
  const id = deriveEventId({ sport: "ufc", participants: [{ name: "A Fighter" }, { name: "B Fighter" }], scheduledStart: null });
  assert.match(id, /unscheduled/);
  assert.match(id, /^ufc:/, "sport must lead the id");
});

test("the id carries no baseball vocabulary — other sports slot in unchanged", () => {
  const ufc = deriveEventId({ sport: "ufc", league: "UFC 300", participants: [{ name: "Alex Pereira" }, { name: "Jamahal Hill" }], scheduledStart: "2026-04-13T02:00:00Z" });
  const soccer = deriveEventId({ sport: "soccer", league: "EPL", participants: [{ name: "Arsenal" }, { name: "Chelsea" }], scheduledStart: "2026-08-01T14:00:00Z" });
  for (const id of [ufc, soccer]) {
    assert.doesNotMatch(id, /gamepk|inning|pitcher|batter/i, `${id} must contain no baseball concepts`);
  }
});

// ── invariants 1 and 2 ─────────────────────────────────────────────────────

test("INVARIANT · a provider id claimed by two events is a collision", () => {
  const ids = identitiesFromSchedule(DOUBLEHEADER, AT);
  // Force the Sprint 041 defect: both events aliased to the SAME statsapi id.
  const corrupted = ids.map((e) => ({ ...e, providerIds: [{ provider: "statsapi", id: "824489", kind: "game" }] }));
  const violations = validateIdentities(corrupted);
  const collision = violations.find((v) => v.code === "PROVIDER_ID_COLLISION");
  assert.ok(collision, "the exact Sprint 041 shape must be reported");
  assert.match(collision.message, /statsapi:824489/);
  assert.match(collision.message, /2 events/);
});

test("INVARIANT · the correctly-resolved doubleheader produces no violations", () => {
  const ids = identitiesFromSchedule(DOUBLEHEADER, AT);
  assert.equal(ids.length, 2, "both halves must exist as separate identities");
  assert.deepEqual(validateIdentities(ids), [], "a correct set must be clean");
});

test("INVARIANT · duplicate eventIds are rejected", () => {
  const ids = identitiesFromSchedule(DOUBLEHEADER, AT);
  const dupe = [ids[0], { ...ids[1], eventId: ids[0].eventId }];
  const v = validateIdentities(dupe);
  assert.ok(v.some((x) => x.code === "DUPLICATE_EVENT_ID"));
});

test("malformed identities are reported, not silently dropped", () => {
  const v = validateIdentities([
    { eventId: "", sport: "mlb", league: null, participants: [], scheduledStart: null, status: "unknown", providerIds: [], provenance: { source: "t", resolvedAt: AT, method: "t" } },
  ]);
  assert.ok(v.some((x) => x.code === "MALFORMED_IDENTITY"));
});

// ── invariants 3-6 ─────────────────────────────────────────────────────────

test("INVARIANT · a market resolving to two events is ambiguous", () => {
  const ids = identitiesFromSchedule(DOUBLEHEADER, AT);
  const corrupted = ids.map((e) => ({ ...e, providerIds: [{ provider: "odds-api", id: "shared", kind: "event" }] }));
  const v = validateEventScopedRecords({
    identities: corrupted,
    markets: [{ ref: "market:shared", providerRef: { provider: "odds-api", id: "shared" } }],
  });
  assert.ok(v.some((x) => x.code === "AMBIGUOUS_REFERENCE"));
});

test("INVARIANT · a market pointing at nothing is unresolved, not ignored", () => {
  const ids = identitiesFromSchedule(DOUBLEHEADER, AT);
  const v = validateEventScopedRecords({
    identities: ids,
    markets: [{ ref: "market:ghost", providerRef: { provider: "odds-api", id: "does-not-exist" } }],
  });
  assert.ok(v.some((x) => x.code === "UNRESOLVED_REFERENCE"));
});

test("INVARIANT · an orphaned simulation is detected — the Sprint 041 symptom", () => {
  const { identities } = attachMarketAliases(identitiesFromSchedule(DOUBLEHEADER, AT), [MARKET_EVENTS[1]]);
  const early = identities.find((e) => e.scheduledStart === "2026-07-28T17:40:00Z");
  const late = identities.find((e) => e.scheduledStart === "2026-07-28T23:10:00Z");

  const v = validateEventScopedRecords({
    identities,
    markets: [{ ref: "market:late", eventId: late.eventId }],
    // A simulation exists for the EARLY game, but no market reaches it. This is 824490 exactly.
    simulations: [{ ref: "sim:824490", eventId: early.eventId }, { ref: "sim:824489", eventId: late.eventId }],
  });
  const orphan = v.find((x) => x.code === "ORPHANED_SIMULATION");
  assert.ok(orphan, "an unreachable simulation must be reported");
  assert.match(orphan.message, /sim:824490/);
});

test("a fully consistent set produces no violations at all", () => {
  const { identities, unmatched } = attachMarketAliases(identitiesFromSchedule(DOUBLEHEADER, AT), MARKET_EVENTS);
  assert.equal(unmatched.length, 0, "both market events must match");
  const markets = identities.map((e) => ({ ref: `market:${e.eventId}`, eventId: e.eventId }));
  const sims = identities.map((e) => ({ ref: `sim:${e.eventId}`, eventId: e.eventId }));
  assert.deepEqual(validateIdentities(identities), []);
  assert.deepEqual(validateEventScopedRecords({ identities, markets, simulations: sims, settlements: markets }), []);
});

// ── invariant 7 — the publication gate ─────────────────────────────────────

test("INVARIANT · publication throws on any violation", () => {
  assert.doesNotThrow(() => assertPublishable([]));
  assert.throws(
    () => assertPublishable([{ code: "PROVIDER_ID_COLLISION", message: "statsapi:824489 maps to 2 events", subjects: [] }]),
    /refusing to publish[\s\S]*PROVIDER_ID_COLLISION/,
  );
});

// ── the MLB adapter ────────────────────────────────────────────────────────

test("ADAPTER · the real 1-minute skew still resolves to the right game", () => {
  const ids = identitiesFromSchedule(DOUBLEHEADER, AT);
  // StatsAPI says 17:40:00Z; the provider says 17:41:00Z. Equality matching fails here.
  const early = matchMarketEvent(ids, MARKET_EVENTS[0]);
  const late = matchMarketEvent(ids, MARKET_EVENTS[1]);
  assert.equal(early.scheduledStart, "2026-07-28T17:40:00Z");
  assert.equal(late.scheduledStart, "2026-07-28T23:10:00Z");
  assert.notEqual(early.eventId, late.eventId, "Game 1 and Game 2 must not collapse");
});

test("ADAPTER · aliases attach without collapsing, and lookup round-trips", () => {
  const { identities } = attachMarketAliases(identitiesFromSchedule(DOUBLEHEADER, AT), MARKET_EVENTS);
  assert.deepEqual(validateIdentities(identities), [], "attaching aliases must not create a collision");

  const found = findByProviderRef(identities, "odds-api", MARKET_EVENTS[0].gameId);
  assert.ok(found, "the provider alias must resolve");
  assert.equal(found.scheduledStart, "2026-07-28T17:40:00Z", "and to the EARLY game");
  assert.ok(findByProviderRef(identities, "statsapi", "824490"), "the statsapi alias must resolve too");
});

test("ADAPTER · lookup refuses to guess when a collision exists", () => {
  const ids = identitiesFromSchedule(DOUBLEHEADER, AT).map((e) => ({
    ...e,
    providerIds: [{ provider: "statsapi", id: "824489", kind: "game" }],
  }));
  assert.equal(
    findByProviderRef(ids, "statsapi", "824489"),
    null,
    "an ambiguous alias must return null rather than an arbitrary event",
  );
});

test("ADAPTER · an unknown market event is returned as unmatched, never bound to a guess", () => {
  const ids = identitiesFromSchedule(DOUBLEHEADER, AT);
  const { unmatched } = attachMarketAliases(ids, [
    { gameId: "x", homeTeam: "Nonexistent Club", awayTeam: "Another Club", commenceTime: "2026-07-28T17:41:00Z" },
  ]);
  assert.equal(unmatched.length, 1, "no plausible-looking silent bind");
  assert.equal(matchMarketEvent(ids, { gameId: "y", homeTeam: null, awayTeam: null, commenceTime: null }), null);
});

test("ADAPTER · single-game dates behave exactly as before", () => {
  const single = [{ gamePk: 824500, gameDate: "2026-07-28T22:41:00Z", homeTeamName: "Detroit Tigers", awayTeamName: "Baltimore Orioles", homeTeamAbbr: "DET", awayTeamAbbr: "BAL", status: "Scheduled" }];
  const ids = identitiesFromSchedule(single, AT);
  assert.equal(ids.length, 1);
  for (const skew of ["2026-07-28T22:41:00Z", "2026-07-28T22:35:00Z", null]) {
    const m = matchMarketEvent(ids, { gameId: "z", homeTeam: "Detroit Tigers", awayTeam: "Baltimore Orioles", commenceTime: skew });
    assert.equal(m?.providerIds[0].id, "824500", `single game must resolve with skew ${skew}`);
  }
});

test("ADAPTER · a game missing a participant is skipped, never fabricated", () => {
  const ids = identitiesFromSchedule([{ gamePk: 1, gameDate: "2026-07-28T17:40:00Z", homeTeamName: null, awayTeamName: "Cleveland Guardians" }], AT);
  assert.equal(ids.length, 0);
});

test("ADAPTER · provenance records HOW identity was resolved", () => {
  // The Sprint 041 defect was invisible partly because nothing recorded the resolution method.
  const [id] = identitiesFromSchedule(DOUBLEHEADER, AT);
  assert.match(id.provenance.method, /doubleheader/i, "the method must name the hazard it handles");
  assert.equal(id.provenance.resolvedAt, AT);
  assert.match(id.provenance.source, /statsapi/);
});

// ── the universal layer must stay universal ────────────────────────────────

test("event-identity.ts imports nothing sport-specific", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/identity/event-identity.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  assert.doesNotMatch(code, /from\s+["'].*\/mlb\//, "must not import from lib/mlb");
  assert.doesNotMatch(code, /gamePk|statsapi|inning|pitcher|batter|runLine/i, "must carry no baseball vocabulary");
  assert.doesNotMatch(code, /America\/New_York/, "must not bake in an ET slate boundary");
});

test("baseball assumptions live in the adapter, and the adapter owns them all", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/identity/mlb-adapter.ts"), "utf8");
  assert.match(src, /gamePk/, "gamePk belongs here");
  assert.match(src, /STATSAPI_PROVIDER/, "the StatsAPI alias key belongs here");
  // And the adapter must not re-implement validation — that would let the two drift apart.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /function\s+validate/i, "validation stays in the universal layer");
});

// ── SPRINT 043 · alias index (the read-path guard) ─────────────────────────────

test("buildAliasIndex resolves a clean one-to-one mapping", () => {
  const idx = buildAliasIndex([["prov-early", 824490], ["prov-late", 824489]]);
  assert.equal(idx.resolve("prov-early"), 824490);
  assert.equal(idx.resolve("prov-late"), 824489);
  assert.equal(idx.isInjective, true);
  assert.deepEqual(idx.collidedTargets, []);
});

test("buildAliasIndex refuses BOTH aliases of the real 2026-07-28 collision", () => {
  // Two provider events, one gamePk. The old Map handed each of them the same simulation.
  const idx = buildAliasIndex([
    ["979a29c09433f74c", 824489],
    ["c869940458363d7a", 824489],
  ]);
  assert.equal(idx.isInjective, false);
  assert.deepEqual(idx.collidedTargets, ["824489"]);
  assert.equal(idx.resolve("979a29c09433f74c"), null, "a collided alias must not resolve");
  assert.equal(idx.resolve("c869940458363d7a"), null, "neither side may resolve — we cannot tell which is which");
});

test("buildAliasIndex refuses an alias claiming two targets", () => {
  const idx = buildAliasIndex([["prov-early", 824489], ["prov-early", 824490]]);
  assert.deepEqual(idx.ambiguousAliases, ["prov-early"]);
  assert.equal(idx.resolve("prov-early"), null);
});

test("buildAliasIndex tolerates duplicate identical pairs", () => {
  // Multiple leans per game is normal and must not read as a collision.
  const idx = buildAliasIndex([["prov-early", 824490], ["prov-early", 824490], ["prov-late", 824489]]);
  assert.equal(idx.isInjective, true);
  assert.equal(idx.resolve("prov-early"), 824490);
});

test("buildAliasIndex isolates the collision from the rest of the slate", () => {
  const idx = buildAliasIndex([
    ["prov-a", 824489], ["prov-b", 824489],       // the doubleheader collision
    ["prov-c", 824500], ["prov-d", 824501],       // 13 other games that day were fine
  ]);
  assert.equal(idx.resolve("prov-a"), null);
  assert.equal(idx.resolve("prov-c"), 824500, "an unaffected game must still resolve");
  assert.equal(idx.resolve("prov-d"), 824501);
});

test("buildAliasIndex returns null for unknown and empty aliases", () => {
  const idx = buildAliasIndex([["prov-a", 1]]);
  assert.equal(idx.resolve("nope"), null);
  assert.equal(idx.resolve(""), null);
});

/**
 * EPL identity — the two defects that must not carry forward from the World Cup era:
 *   1. a fixture keyed by its participants alone (clubs meet twice a season, plus replays)
 *   2. an ambiguous club alias resolving to "the best match" instead of to nothing
 *
 * Run: npx tsx --test src/lib/soccer/epl-identity.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  assertClubTableSound,
  assertSeasonMembership,
  buildEplClubIndex,
  normalizeClubToken,
  EPL_CLUB_ALIASES,
} from "./epl-clubs.ts";
import {
  buildEplProviderIndex,
  clubsOf,
  identitiesFromFixtures,
  identityFromFixture,
  resolveEplEventId,
} from "./epl-identity.ts";
import { validateIdentities } from "../identity/event-identity.ts";

const AT = "2026-07-30T00:00:00Z";
const idOf = (out) => {
  assert.ok("identity" in out, `expected an identity, got ${JSON.stringify(out)}`);
  return out.identity;
};

// ── the repeated-club-pair case ────────────────────────────────────────────────

test("the same club pair at two kickoffs derives two distinct eventIds", () => {
  const first = idOf(
    identityFromFixture({ homeClub: "Arsenal", awayClub: "Chelsea", kickoffIso: "2026-08-22T14:00:00Z" }, AT),
  );
  const reverse = idOf(
    identityFromFixture({ homeClub: "Chelsea", awayClub: "Arsenal", kickoffIso: "2027-01-16T15:00:00Z" }, AT),
  );

  assert.notEqual(first.eventId, reverse.eventId, "home and away meetings must not collapse onto one id");
  assert.equal(validateIdentities([first, reverse]).length, 0);
});

test("a replayed fixture at a new kickoff is a new event, and the original keeps its own id", () => {
  const original = idOf(
    identityFromFixture(
      { homeClub: "Everton", awayClub: "Brighton", kickoffIso: "2026-08-23T13:00:00Z", status: "postponed" },
      AT,
    ),
  );
  const replay = idOf(
    identityFromFixture(
      { homeClub: "Everton", awayClub: "Brighton", kickoffIso: "2026-09-09T18:45:00Z", status: "replayed" },
      AT,
    ),
  );

  assert.notEqual(original.eventId, replay.eventId);
  assert.equal(original.status, "postponed");
  assert.equal(validateIdentities([original, replay]).length, 0);
});

test("kickoff distinguishes to the MINUTE, not to the date", () => {
  const a = idOf(identityFromFixture({ homeClub: "Fulham", awayClub: "Burnley", kickoffIso: "2026-08-22T12:30:00Z" }, AT));
  const b = idOf(identityFromFixture({ homeClub: "Fulham", awayClub: "Burnley", kickoffIso: "2026-08-22T17:30:00Z" }, AT));
  assert.notEqual(a.eventId, b.eventId);
});

test("argument order does not change the id, but competition does", () => {
  const league = idOf(
    identityFromFixture({ homeClub: "Arsenal", awayClub: "Chelsea", kickoffIso: "2026-08-22T14:00:00Z" }, AT),
  );
  const swapped = idOf(
    identityFromFixture({ homeClub: "Chelsea", awayClub: "Arsenal", kickoffIso: "2026-08-22T14:00:00Z" }, AT),
  );
  const cup = idOf(
    identityFromFixture(
      { homeClub: "Arsenal", awayClub: "Chelsea", kickoffIso: "2026-08-22T14:00:00Z", competition: "fa-cup" },
      AT,
    ),
  );

  assert.equal(league.eventId, swapped.eventId, "participants are sorted — order must not matter");
  assert.notEqual(league.eventId, cup.eventId, "a cup meeting must not collide with the league fixture");
  assert.match(league.eventId, /^soccer:epl:/);
});

// ── club naming ────────────────────────────────────────────────────────────────

test("provider spellings resolve to one canonical club", () => {
  const index = buildEplClubIndex();
  for (const [spelling, canonical] of [
    ["Wolves", "Wolverhampton Wanderers"],
    ["Wolverhampton Wanderers", "Wolverhampton Wanderers"],
    ["Brighton", "Brighton & Hove Albion"],
    ["Brighton and Hove Albion", "Brighton & Hove Albion"],
    ["Man Utd", "Manchester United"],
    ["Manchester Utd", "Manchester United"],
    ["AFC Bournemouth", "Bournemouth"],
    ["Bournemouth", "Bournemouth"],
    ["Spurs", "Tottenham Hotspur"],
    ["Nott'm Forest", "Nottingham Forest"],
  ]) {
    assert.equal(index.resolve(spelling)?.canonical, canonical, `"${spelling}"`);
  }
});

test("the shipped alias table is sound and its aliases are unique", () => {
  const index = buildEplClubIndex();
  assert.equal(index.isSound, true, `collisions: ${JSON.stringify(index.collisions)}`);
  assert.doesNotThrow(() => assertClubTableSound(index));

  const abbrs = EPL_CLUB_ALIASES.map((c) => c.abbr);
  assert.equal(new Set(abbrs).size, abbrs.length, "abbreviations must be unique");
  const canonicals = EPL_CLUB_ALIASES.map((c) => c.canonical);
  assert.equal(new Set(canonicals).size, canonicals.length, "canonical names must be unique");
});

test("bare ambiguous words are absent from the table, so no provider spelling can smuggle one in", () => {
  const index = buildEplClubIndex();
  for (const bare of ["United", "City", "Albion", "Wanderers", "Town"]) {
    assert.equal(index.resolve(bare), null, `"${bare}" must not resolve to any club`);
  }
});

test("an alias claimed by two clubs refuses BOTH sides — and blocks the whole table", () => {
  const colliding = [
    { canonical: "Manchester United", abbr: "MUN", aliases: ["Manchester United", "United"] },
    { canonical: "Newcastle United", abbr: "NEW", aliases: ["Newcastle United", "United"] },
  ];
  const index = buildEplClubIndex(colliding);

  assert.equal(index.resolve("United"), null, "the ambiguous alias resolves to neither club");
  assert.equal(index.isSound, false);
  assert.deepEqual(index.collisions, [
    { alias: "united", claimants: ["Manchester United", "Newcastle United"] },
  ]);

  // Both claimants are named in the refusal, and the table does not ingest at all.
  assert.throws(() => assertClubTableSound(index), /Manchester United, Newcastle United/);
  assert.throws(
    () => identityFromFixture({ homeClub: "Manchester United", awayClub: "Newcastle United", kickoffIso: "2026-08-22T14:00:00Z" }, AT, index),
    /ambiguous/i,
  );
});

test("normalizeClubToken strips the affixes providers add inconsistently", () => {
  assert.equal(normalizeClubToken("AFC Bournemouth"), normalizeClubToken("Bournemouth"));
  assert.equal(normalizeClubToken("Arsenal FC"), normalizeClubToken("arsenal"));
  assert.equal(normalizeClubToken("Brighton & Hove Albion"), normalizeClubToken("Brighton and Hove Albion"));
  assert.equal(normalizeClubToken(null), "");
});

// ── fail-closed resolution ─────────────────────────────────────────────────────

test("an unknown club spelling is rejected, not written through raw", () => {
  const out = identityFromFixture({ homeClub: "Real Madrid", awayClub: "Arsenal", kickoffIso: "2026-08-22T14:00:00Z" }, AT);
  assert.ok("rejection" in out);
  assert.equal(out.rejection.code, "UNRESOLVED_CLUB");
  assert.match(out.rejection.message, /Real Madrid/);
});

test("a fixture without a parseable kickoff cannot be identified", () => {
  for (const [kickoff, code] of [
    [null, "MISSING_KICKOFF"],
    ["Saturday 3pm", "UNPARSEABLE_KICKOFF"],
  ]) {
    const out = identityFromFixture({ homeClub: "Arsenal", awayClub: "Chelsea", kickoffIso: kickoff }, AT);
    assert.ok("rejection" in out);
    assert.equal(out.rejection.code, code);
  }
});

test("a fixture whose sides resolve to the same club is refused", () => {
  const out = identityFromFixture({ homeClub: "Spurs", awayClub: "Tottenham", kickoffIso: "2026-08-22T14:00:00Z" }, AT);
  assert.ok("rejection" in out);
  assert.equal(out.rejection.code, "SAME_CLUB_BOTH_SIDES");
});

test("identitiesFromFixtures keeps rejections instead of dropping them", () => {
  const { identities, rejections } = identitiesFromFixtures(
    [
      { homeClub: "Arsenal", awayClub: "Chelsea", kickoffIso: "2026-08-22T14:00:00Z" },
      { homeClub: "Barcelona", awayClub: "Chelsea", kickoffIso: "2026-08-22T14:00:00Z" },
    ],
    AT,
  );
  assert.equal(identities.length, 1);
  assert.equal(rejections.length, 1, "a dropped row would make the artifact look complete");
});

// ── provider aliases ───────────────────────────────────────────────────────────

test("a provider ref claimed by two fixtures resolves to neither", () => {
  const shared = { provider: "odds-api", id: "dup-1", kind: "event" };
  const { identities } = identitiesFromFixtures(
    [
      { homeClub: "Arsenal", awayClub: "Chelsea", kickoffIso: "2026-08-22T14:00:00Z", providerRefs: [shared] },
      { homeClub: "Everton", awayClub: "Fulham", kickoffIso: "2026-08-22T14:00:00Z", providerRefs: [shared] },
    ],
    AT,
  );

  const index = buildEplProviderIndex(identities);
  assert.equal(index.isInjective, false);
  assert.equal(resolveEplEventId(index, shared), null, "an ambiguous alias must not resolve to either fixture");
  assert.equal(validateIdentities(identities).some((v) => v.code === "PROVIDER_ID_COLLISION"), true);
});

test("a clean provider index resolves each ref to its own fixture", () => {
  const { identities } = identitiesFromFixtures(
    [
      { homeClub: "Arsenal", awayClub: "Chelsea", kickoffIso: "2026-08-22T14:00:00Z", providerRefs: [{ provider: "odds-api", id: "a1" }] },
      { homeClub: "Everton", awayClub: "Fulham", kickoffIso: "2026-08-22T14:00:00Z", providerRefs: [{ provider: "odds-api", id: "a2" }] },
    ],
    AT,
  );
  const index = buildEplProviderIndex(identities);
  assert.equal(index.isInjective, true);
  assert.equal(resolveEplEventId(index, { provider: "odds-api", id: "a1" }), identities[0].eventId);
  assert.equal(resolveEplEventId(index, { provider: "odds-api", id: "nope" }), null);
});

test("clubsOf reads the canonical club records back off an identity", () => {
  const identity = idOf(
    identityFromFixture({ homeClub: "Wolves", awayClub: "Spurs", kickoffIso: "2026-08-22T14:00:00Z" }, AT),
  );
  const { home, away } = clubsOf(identity);
  assert.equal(home.abbr, "WOL");
  assert.equal(away.abbr, "TOT");
});

// ── season membership ──────────────────────────────────────────────────────────

test("season membership comes from the fixture list and demands exactly 20 distinct clubs", () => {
  const twenty = EPL_CLUB_ALIASES.slice(0, 20).map((c) => c.canonical);
  assert.equal(assertSeasonMembership(twenty).clubs.length, 20);

  assert.throws(() => assertSeasonMembership(twenty.slice(0, 19)), /resolved 19 distinct clubs/);
  assert.throws(() => assertSeasonMembership([...twenty, "Real Madrid"]), /unresolved spellings: Real Madrid/);
});

/**
 * DATA PLATFORM CORE CONTRACT (v1.2 · D1204/D1205): schemas, ids, aliases, precedence, missingness,
 * deterministic serialization. Every input is a literal.
 *
 * Run: npx tsx --test src/lib/data-platform/core.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRecord, normalizeInstant, refKey, FORBIDDEN_OWNER_FIELDS } from "./contract.mjs";
import { mlbTeamId, mlbPlayerId, mlbGameId, nflTeamId, nflPlayerId, eplShippedGameId, ufcPlayerId, seasonId, isCanonicalId } from "./ids.mjs";
import { mlbTeamRef, nflTeamRef, nflPlayerRef } from "../follow/follow-schema.mjs";
import { buildAliasIndex, RESOLUTION } from "./aliases.mjs";
import { buildAliasIndex as identityAliasIndex } from "../identity/event-identity.ts";
import { createMerger, createLabelPicker } from "./merge.mjs";
import { validateStats, sourceValue, STAT_FAMILIES } from "./stat-dictionary.mjs";
import { stableStringify, toJsonl, compareIds } from "./stable-json.mjs";
import { gameRecord, teamRecord, playerRecord, alias } from "./records.mjs";

const team = (over = {}) => ({ ...teamRecord("MLB", "mlb-team-147", { name: "New York Yankees", abbreviation: "NYY" }, [alias("mlb_statsapi", "team", "147")]), ...over });
const game = (over = {}) => ({ ...gameRecord("MLB", "746656", { seasonKey: "2024", seasonPhase: "REGULAR", officialDate: "2024-04-13", homeTeamId: "mlb-team-114", awayTeamId: "mlb-team-147", statusClass: "FINAL" }, [alias("mlb_statsapi", "game", "746656")]), ...over });

// ── schemas ─────────────────────────────────────────────────────────────────────────────────────────
test("C1 valid records are accepted", () => {
  assert.deepEqual(validateRecord("team", team()), []);
  assert.deepEqual(validateRecord("game", game()), []);
  assert.deepEqual(validateRecord("player", playerRecord("NFL", "nfl-athlete-4429795", { name: "Jahmyr Gibbs" }, [alias("espn", "player", "4429795")])), []);
});

test("C2 malformed records are rejected with a reason", () => {
  assert.match(validateRecord("game", game({ startUtc: "2024-04-13 19:10" })).join(), /not a UTC instant/);
  assert.match(validateRecord("game", game({ statusClass: "LIVE" })).join(), /statusClass/);
  assert.match(validateRecord("game", game({ officialDate: null, startUtc: null })).join(), /neither startUtc nor officialDate/);
  assert.match(validateRecord("team", team({ providerAliases: [] })).join(), /no provider alias/);
  assert.match(validateRecord("team", team({ providerAliases: [{ provider: "mlb_statsapi", entityType: "team", id: 147 }] })).join(), /STRING/);
  assert.match(validateRecord("team", team({ extra: 1 })).join(), /unexpected keys: extra/);
  const { venue, ...noVenue } = game();
  assert.match(validateRecord("game", noVenue).join(), /missing keys: venue/);
});

test("C3 a future schemaVersion is refused, never coerced", () => {
  const errs = validateRecord("game", game({ schemaVersion: 2 }));
  assert.equal(errs.length, 1);
  assert.match(errs[0], /schemaVersion 2 is not supported by this v1 reader/);
});

test("C4 owner boundaries are structural: forecast, live, settlement and personal fields are refused", () => {
  for (const f of ["forecast", "probability", "liveState", "settled", "gradedAt", "followed", "saved", "observedAt"]) {
    assert.ok(FORBIDDEN_OWNER_FIELDS.includes(f), f);
    assert.match(validateRecord("game", game({ [f]: null })).join(), /owned by another owner/, `${f} must be refused on a GameRecord`);
  }
});

test("C5 time: one spelling per instant; a date or a zone-less string is never promoted to an instant", () => {
  assert.equal(normalizeInstant("2026-08-21T19:00Z"), "2026-08-21T19:00:00Z");
  assert.equal(normalizeInstant("2026-08-21T20:00:00+01:00"), "2026-08-21T19:00:00Z");
  assert.equal(normalizeInstant("2026-08-21"), null);
  assert.equal(normalizeInstant("2026-08-21T19:00:00"), null);
  assert.equal(normalizeInstant("8:30 PM ET"), null);
});

// ── ids ─────────────────────────────────────────────────────────────────────────────────────────────
test("I1 shipped ids come from the Follow owner's own builders — byte-identical", () => {
  assert.equal(mlbTeamId(147), mlbTeamRef(147).id);
  assert.equal(mlbTeamId("147"), "mlb-team-147");
  assert.equal(nflTeamId("28"), nflTeamRef("28").id);
  assert.equal(nflTeamId(28), "nfl-team-28");
  assert.equal(nflPlayerId("nfl-athlete-4429795"), nflPlayerRef("nfl-athlete-4429795").id);
  assert.equal(nflPlayerId("4429795"), "nfl-athlete-4429795", "a bare ESPN id gains the shipped prefix, never a new one");
  assert.equal(mlbGameId(746656), "746656");
  assert.equal(eplShippedGameId("soccer:epl:arsenal-v-coventry-city:20260821t1900"), "soccer:epl:arsenal-v-coventry-city:20260821t1900");
});

test("I2 names, abbreviations and sequences never become ids", () => {
  for (const v of ["New York Yankees", "NYY", "WSH", "WAS", "", null, undefined, "12a", -5, 1.5]) {
    assert.equal(mlbTeamId(v), null, String(v));
    assert.equal(nflTeamId(v), null, String(v));
    assert.equal(mlbPlayerId(v), null, String(v));
    assert.equal(ufcPlayerId(v), null, String(v));
  }
  assert.equal(nflPlayerId("Jahmyr Gibbs"), null);
  assert.equal(eplShippedGameId("Arsenal v Coventry City 2026-08-21"), null);
  assert.equal(isCanonicalId("MLB", "team", "team-1"), false);
  assert.equal(isCanonicalId("NFL", "player", "nfl-athlete-gibbs"), false);
});

test("I3 season ids are deterministic conventions, not labels", () => {
  assert.equal(seasonId("MLB", "2025"), "MLB-2025");
  assert.equal(seasonId("EPL", "2025-26"), "EPL-2025-26");
  assert.equal(seasonId("EPL", "2025"), null);
  assert.equal(seasonId("NFL", "twenty-five"), null);
  assert.equal(refKey("MLB", "game", "746656"), "MLB:game:746656");
});

// ── aliases ─────────────────────────────────────────────────────────────────────────────────────────
const p = (id, aliases, sportId = "NFL") => ({ sportId, id, providerAliases: aliases });

test("A1 exact resolution, explicit UNKNOWN, sport-scoped keys", () => {
  const idx = buildAliasIndex([p("nfl-team-28", [alias("espn", "team", "28"), alias("nflverse", "team", "WAS")]), p("epl-team-28", [alias("espn", "team", "28")], "EPL")]);
  assert.deepEqual(idx.resolve("NFL", "espn", "team", "28"), { status: RESOLUTION.RESOLVED, id: "nfl-team-28" });
  assert.deepEqual(idx.resolve("NFL", "espn", "team", 28), { status: RESOLUTION.RESOLVED, id: "nfl-team-28" }, "numeric ids are strings at the boundary");
  assert.deepEqual(idx.resolve("EPL", "espn", "team", "28"), { status: RESOLUTION.RESOLVED, id: "epl-team-28" }, "ESPN team ids are league-scoped");
  assert.deepEqual(idx.resolve("NFL", "nflverse", "team", "WSH"), { status: RESOLUTION.UNKNOWN }, "an abbreviation is not the nflverse alias");
  assert.deepEqual(idx.resolve("NFL", "espn", "team", "Washington Commanders"), { status: RESOLUTION.UNKNOWN }, "no name path exists");
  assert.equal(idx.collisions.length, 0);
});

test("A2 a collision resolves to NOBODY and is reported (never last-write-wins)", () => {
  const idx = buildAliasIndex([p("401", [alias("espn", "game", "231027024")]), p("402", [alias("espn", "game", "231027024")])]);
  assert.deepEqual(idx.resolve("NFL", "espn", "game", "231027024"), { status: RESOLUTION.AMBIGUOUS, candidates: ["401", "402"] });
  assert.equal(idx.collisions.length, 1);
  assert.equal(idx.rows().length, 0, "a collided alias never reaches the reverse index");
});

test("A3 one entity may not hold two ids from one provider namespace — except a declared lineage namespace", () => {
  const merged = buildAliasIndex([p("nfl-athlete-1", [alias("nflverse", "player", "00-001"), alias("nflverse", "player", "00-002")])]);
  assert.equal(merged.sameProviderDuplicates.length, 1, "two gsis ids on one athlete = two people merged");
  const lineage = buildAliasIndex([p("soccer:epl:aston-villa-v-fulham:20261031t2000", [alias("gametime_epl_event", "game", "soccer:epl:aston-villa-v-fulham:20261031t1500"), alias("gametime_epl_event", "game", "soccer:epl:aston-villa-v-fulham:20261101t1400")], "EPL")]);
  assert.equal(lineage.sameProviderDuplicates.length, 0, "a fixture moved twice legitimately has two superseded ids");
});

test("A4 every alias round-trips to its own entity", () => {
  const idx = buildAliasIndex([p("nfl-team-28", [alias("espn", "team", "28"), alias("nflverse", "team", "WAS")]), p("nfl-team-14", [alias("espn", "team", "14"), alias("nflverse", "team", "LA")])]);
  const rt = idx.roundTrip();
  assert.equal(rt.checked, 4);
  assert.deepEqual(rt.failures, []);
});

test("A5 cross-agreement with the identity layer's alias index (Sprint 043): both refuse the same ambiguous alias", () => {
  const pairs = [["espn:231027024", "401"], ["espn:231027024", "402"], ["espn:401872932", "403"]];
  const theirs = identityAliasIndex(pairs);
  const ours = buildAliasIndex(pairs.map(([a, id]) => p(id, [alias("espn", "game", a.slice(5))])));
  for (const [a] of pairs) {
    const t = theirs.resolve(a);
    const o = ours.resolve("NFL", "espn", "game", a.slice(5));
    assert.equal(t === null, o.status !== RESOLUTION.RESOLVED, `agreement on ${a}`);
    if (t !== null) assert.equal(t, o.id);
  }
});

// ── precedence ──────────────────────────────────────────────────────────────────────────────────────
test("M1 field precedence is a table, independent of arrival order, and conflicts are receipted", () => {
  const run = (order) => {
    const m = createMerger({ kind: "game", sportId: "MLB", fields: ["startUtc", "homeTeamId"], defaultPrecedence: ["hist", "sched", "board"], precedence: { startUtc: ["sched", "board"] } });
    const adds = { hist: ["x", "hist", { homeTeamId: "mlb-team-1" }], sched: ["x", "sched", { startUtc: "2026-09-22T17:05:00Z", homeTeamId: "mlb-team-1" }], board: ["x", "board", { startUtc: "2026-05-23T17:35:00Z", homeTeamId: "mlb-team-2" }] };
    for (const k of order) m.add(...adds[k]);
    return m.finalize();
  };
  const a = run(["hist", "sched", "board"]), b = run(["board", "sched", "hist"]);
  assert.deepEqual(a.records[0].fields, { startUtc: "2026-09-22T17:05:00Z", homeTeamId: "mlb-team-1" });
  assert.equal(stableStringify(a), stableStringify(b), "arrival order must not matter");
  assert.deepEqual(a.conflicts.map((c) => c.field).sort(), ["homeTeamId", "startUtc"]);
  assert.throws(() => createMerger({ kind: "g", sportId: "MLB", fields: [], defaultPrecedence: ["a"], precedence: {} }).add("x", "unranked", {}), /no precedence rank/);
});

test("M2 labels: latest observation wins, variants are kept, labels never identify", () => {
  const l = createLabelPicker(["sched", "hist"]);
  l.add("mlb-team-133", "Oakland Athletics", "2023-04-01", "hist");
  l.add("mlb-team-133", "Athletics", "2026-09-01", "sched");
  assert.equal(l.pick("mlb-team-133"), "Athletics");
  assert.deepEqual(l.variants("mlb-team-133"), ["Athletics", "Oakland Athletics"]);
});

// ── missingness ─────────────────────────────────────────────────────────────────────────────────────
test("S1 missing is not zero: absent/null/empty stay null; a recorded 0 stays 0", () => {
  assert.equal(sourceValue(undefined), null);
  assert.equal(sourceValue(null), null);
  assert.equal(sourceValue(""), null);
  assert.equal(sourceValue(0), 0);
  assert.equal(sourceValue(4.0), 4, "StatsAPI integral floats are integers, not rounding");
  assert.equal(sourceValue(1.5), 1.5, "a non-integral count is returned as-is for validation to refuse");
  // an ESPN kicker line: listed, no rushing block ⇒ null, never 0
  const kicker = Object.fromEntries(STAT_FAMILIES["nfl.espn-player-lines"].stats.map((s) => [s.key, sourceValue({ name: "Cairo Santos" }[s.sourceField])]));
  assert.ok(Object.values(kicker).every((v) => v === null));
  assert.deepEqual(validateStats("nfl.espn-player-lines", kicker), []);
});

test("S2 stat domains are family-specific: yards may be negative, counts may not; undeclared keys are refused", () => {
  const base = Object.fromEntries(STAT_FAMILIES["nfl.espn-player-lines"].stats.map((s) => [s.key, null]));
  assert.deepEqual(validateStats("nfl.espn-player-lines", { ...base, rushingYards: -4 }), []);
  assert.match(validateStats("nfl.espn-player-lines", { ...base, receptions: -1 }).join(), /below 0/);
  assert.match(validateStats("nfl.espn-player-lines", { ...base, receptions: 1.5 }).join(), /not an integer/);
  assert.match(validateStats("nfl.espn-player-lines", { ...base, epa: 0.2 }).join(), /undeclared/);
  const { receptions, ...missingKey } = base;
  assert.match(validateStats("nfl.espn-player-lines", missingKey).join(), /missing declared key receptions/);
  assert.match(validateStats("ufc.bout-result", { won: "yes", boutHadWinner: true }).join(), /not boolean/);
});

// ── serialization ───────────────────────────────────────────────────────────────────────────────────
test("D1 canonical serialization ignores key order, refuses undefined and non-finite numbers", () => {
  assert.equal(stableStringify({ b: 1, a: { d: 2, c: 3 } }), stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  assert.throws(() => stableStringify({ a: undefined }), /explicit null/);
  assert.throws(() => stableStringify({ a: NaN }), /non-finite/);
  assert.equal(toJsonl([]), "");
  assert.deepEqual(["10", "9", "100", "a"].sort(compareIds), ["9", "10", "100", "a"]);
});

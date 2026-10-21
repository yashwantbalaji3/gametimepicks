/**
 * NBA prop-price adapter on TEST FIXTURES (documented response shape). Run from app/:
 *   npx tsx --test src/lib/sports/odds/nba-props/parse.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseNbaPropResponses, priceIdentityKey } from "./parse.mjs";
import { resolvePlayer, REVIEWED_PLAYER_ALIASES, IDENTITY_METHOD } from "./player-identity.mjs";
import { REFUSAL, COVERAGE_STATE, PRICE_RECORD_SCHEMA, NBA_PROP_FAMILIES, POINTS_FIRST_SCOPE } from "./contract.mjs";
import { SCHEDULE, rosterFor, EVENT_1, EVENT_2, ok, FETCHED_AT, FIXTURE_LABEL } from "./__fixtures__/event-odds.fixture.mjs";

const ctx = (o = {}) => ({ schedule: SCHEDULE, rosterFor, ...o });
const reasons = (res, level) => res.refusals.filter((r) => !level || r.level === level).map((r) => r.reason);
const find = (res, athlete, family, book) => res.records.find((r) => r.providerAthleteId === athlete && r.family === family && r.book === book);

test("fixture is labelled and the family order is points first", () => {
  assert.match(FIXTURE_LABEL, /TEST FIXTURE/);
  assert.equal(NBA_PROP_FAMILIES[0].marketKey, "player_points");
  assert.deepEqual(POINTS_FIRST_SCOPE, ["player_points"]);
});

test("parser: documented event-odds shape → normalised two-way records with ESPN event + athlete ids", () => {
  const res = parseNbaPropResponses([ok(EVENT_1)], ctx());
  const r = find(res, "9100001", "pts", "draftkings");
  assert.deepEqual(
    { schema: r.schema, provider: r.provider, eventId: r.eventId, providerEventId: r.providerEventId, family: r.family, providerMarketKey: r.providerMarketKey, line: r.line, over: r.overAmerican, under: r.underAmerican, capturedAt: r.capturedAt, fetchedAt: r.fetchedAt, method: r.identityMethod },
    { schema: PRICE_RECORD_SCHEMA, provider: "the-odds-api", eventId: "900000001", providerEventId: EVENT_1.id, family: "pts", providerMarketKey: "player_points", line: 24.5, over: -115, under: -105, capturedAt: "2026-10-22T21:55:00.000Z", fetchedAt: FETCHED_AT, method: IDENTITY_METHOD.EXACT_NAME },
  );
  assert.deepEqual(r.raw, { oddsEventId: EVENT_1.id, bookmakerKey: "draftkings", marketKey: "player_points", description: "Fixture Guard One", commenceTime: EVENT_1.commence_time });
  assert.match(r.recordId, /^npp_[0-9a-f]{8}$/);
  assert.ok(find(res, "9100003", "reb", "draftkings"), "rebounds parse too");
  assert.equal(find(res, "9100006", "pts", "draftkings").line, 12.5, "diacritics and periods fold to one name");
  assert.equal(find(res, "9100001", "pts", "fanduel").overAmerican, -112);
});

test("operator allowlist: an offshore book is refused by key and never produces a record", () => {
  const res = parseNbaPropResponses([ok(EVENT_1)], ctx());
  assert.ok(!res.records.some((r) => r.book === "bovada"));
  assert.deepEqual(res.coverage.books.refusedNotEligible, ["bovada"]);
  assert.ok(reasons(res, "book").includes(REFUSAL.BOOK_NOT_ELIGIBLE));
});

test("a family no official model covers (rebAst) is refused, not recorded", () => {
  const res = parseNbaPropResponses([ok(EVENT_1)], ctx());
  assert.ok(!res.records.some((r) => r.family === "rebAst"));
  assert.ok(reasons(res, "market").includes(REFUSAL.FAMILY_NOT_MODELLED));
});

test("scope: a points-only plan refuses every other market", () => {
  const res = parseNbaPropResponses([ok(EVENT_1)], ctx({ marketKeys: POINTS_FIRST_SCOPE }));
  assert.ok(res.records.every((r) => r.family === "pts"));
  assert.ok(reasons(res, "market").includes(REFUSAL.MARKET_NOT_IN_SCOPE));
});

test("identity: two roster players with one name → PLAYER_AMBIGUOUS; a stranger → PLAYER_UNRESOLVED; neither is guessed", () => {
  const res = parseNbaPropResponses([ok(EVENT_1)], ctx());
  const pr = res.refusals.filter((r) => r.level === "player");
  assert.ok(pr.some((r) => r.providerName === "Fixture Twin" && r.reason === REFUSAL.PLAYER_AMBIGUOUS));
  assert.ok(pr.some((r) => r.providerName === "Unknown Person" && r.reason === REFUSAL.PLAYER_UNRESOLVED));
  assert.ok(!res.records.some((r) => r.playerName === "Fixture Twin" || r.playerName === "Unknown Person"));
});

test("identity: the reviewed alias table wins, but an alias to a player not in this event refuses; conflicting aliases refuse", () => {
  const roster = rosterFor("900000001");
  const alias = (providerName, providerAthleteId) => ({ providerName, providerAthleteId, reviewedBy: "test", reviewedAt: "2026-10-21", note: "TEST FIXTURE" });
  assert.equal(REVIEWED_PLAYER_ALIASES.length, 0, "ships empty — entries only after a human reviews a real capture");
  const a = resolvePlayer("F. Guard One", roster, { aliases: [alias("F. Guard One", "9100001")] });
  assert.deepEqual([a.state, a.providerAthleteId, a.method], ["RESOLVED", "9100001", IDENTITY_METHOD.ALIAS]);
  assert.equal(resolvePlayer("Fixture Twin", roster, { aliases: [alias("Fixture Twin", "9100004")] }).providerAthleteId, "9100004", "a reviewed alias can settle a name collision");
  assert.equal(resolvePlayer("Traded Guy", roster, { aliases: [alias("Traded Guy", "9200001")] }).reason, REFUSAL.PLAYER_UNRESOLVED);
  assert.equal(resolvePlayer("Two Ways", roster, { aliases: [alias("Two Ways", "9100001"), alias("Two Ways", "9100002")] }).reason, REFUSAL.PLAYER_AMBIGUOUS);
  assert.equal(resolvePlayer("Guard One", roster).reason, REFUSAL.PLAYER_UNRESOLVED, "no surname / partial match");
});

test("outcome refusals: one-sided, stale, decimal format, multiple main lines, provider timestamp from the future", () => {
  const res = parseNbaPropResponses([ok(EVENT_1), ok(EVENT_2)], ctx());
  const out = reasons(res, "outcome");
  for (const r of [REFUSAL.ONE_SIDED, REFUSAL.PRICE_STALE, REFUSAL.PRICE_FORMAT, REFUSAL.MULTIPLE_MAIN_LINES, REFUSAL.PRICE_FROM_FUTURE]) assert.ok(out.includes(r), r);
  assert.equal(res.records.filter((r) => r.eventId === "900000002").length, 0, "event 2 yields nothing usable");
});

test("price after tip, implausible pair, missing timestamp and non Over/Under outcomes are refused", () => {
  const ev = structuredClone(EVENT_1);
  ev.bookmakers = [{ key: "draftkings", title: "DraftKings", markets: [
    { key: "player_points", last_update: "2026-10-22T23:31:00Z", outcomes: [{ name: "Over", description: "Fixture Guard One", price: -110, point: 24.5 }, { name: "Under", description: "Fixture Guard One", price: -110, point: 24.5 }] },
    { key: "player_rebounds", last_update: "2026-10-22T21:00:00Z", outcomes: [{ name: "Over", description: "Fixture Guard One", price: 300, point: 4.5 }, { name: "Under", description: "Fixture Guard One", price: 300, point: 4.5 }] },
    { key: "player_assists", outcomes: [{ name: "Over", description: "Fixture Guard One", price: -110, point: 4.5 }, { name: "Under", description: "Fixture Guard One", price: -110, point: 4.5 }] },
    { key: "player_threes", last_update: "2026-10-22T21:00:00Z", outcomes: [{ name: "Yes", description: "Fixture Guard One", price: -110, point: 1.5 }] },
  ] }];
  const res = parseNbaPropResponses([ok(ev, "2026-10-22T23:32:00.000Z")], ctx());
  assert.deepEqual(res.records, []);
  const out = reasons(res, "outcome");
  for (const r of [REFUSAL.PRICE_AFTER_START, REFUSAL.PRICE_IMPLAUSIBLE, REFUSAL.NO_PROVIDER_TIMESTAMP, REFUSAL.NOT_TWO_WAY]) assert.ok(out.includes(r), r);
});

test("duplicates: identical copies fold into one record (counted); conflicting copies refuse every copy", () => {
  const again = parseNbaPropResponses([ok(EVENT_1), ok(EVENT_1)], ctx());
  const once = parseNbaPropResponses([ok(EVENT_1)], ctx());
  assert.equal(again.records.length, once.records.length);
  assert.equal(again.coverage.duplicatesFolded, once.records.length);
  assert.equal(new Set(again.records.map(priceIdentityKey)).size, again.records.length);

  const moved = structuredClone(EVENT_1);
  moved.bookmakers[0].markets[0].outcomes[0].price = -125; // Fixture Guard One Over at DraftKings disagrees
  moved.bookmakers[0].markets[0].outcomes[1].price = 105;
  const res = parseNbaPropResponses([ok(EVENT_1), ok(moved)], ctx());
  assert.equal(find(res, "9100001", "pts", "draftkings"), undefined, "a conflict keeps neither copy");
  assert.ok(find(res, "9100001", "pts", "fanduel"), "other books are untouched");
  assert.ok(reasons(res, "duplicate").includes(REFUSAL.DUPLICATE_CONFLICT));
  assert.equal(res.coverage.duplicateConflicts, 1);
});

test("event identity: unmatched, swapped home/away and lineage violation are refused before any price is read", () => {
  const unknown = { ...EVENT_1, id: "fx-unknown", home_team: "Chicago Bulls" };
  const swapped = { ...EVENT_1, id: "fx-swapped", home_team: EVENT_1.away_team, away_team: EVENT_1.home_team };
  const res = parseNbaPropResponses([ok(unknown), ok(swapped)], ctx());
  assert.deepEqual(res.records, []);
  assert.deepEqual(reasons(res, "event").sort(), [REFUSAL.EVENT_ORIENTATION_SWAPPED, REFUSAL.EVENT_UNMATCHED].sort());
  const lin = parseNbaPropResponses([ok(EVENT_1)], ctx({ lineage: { [EVENT_1.id]: "900000099" } }));
  assert.deepEqual(reasons(lin, "event"), [REFUSAL.EVENT_LINEAGE_VIOLATION]);
});

test("coverage report: events / players / books matched vs refused, with reasons, and an OK state", () => {
  const res = parseNbaPropResponses([ok(EVENT_1), ok(EVENT_2)], ctx());
  const c = res.coverage;
  assert.equal(c.state, COVERAGE_STATE.OK);
  assert.deepEqual([c.events.input, c.events.matched], [2, 2]);
  assert.deepEqual(c.books.seen, ["betmgm", "bovada", "draftkings", "fanduel"]);
  assert.deepEqual(c.books.withRecords, ["draftkings", "fanduel"]);
  assert.ok(c.players.seen > c.players.matched);
  assert.ok(c.players.refused.some((p) => p.reason === REFUSAL.PLAYER_AMBIGUOUS));
  assert.equal(c.records, res.records.length);
  assert.deepEqual(c.families.pts.books, ["draftkings", "fanduel"]);
  const total = Object.values(c.refusalsByReason).reduce((a, b) => a + b, 0);
  assert.equal(total, res.refusals.length, "every refusal is counted by reason");
});

test("coverage states: provider failure, no responses, insufficient coverage (one book)", () => {
  const failed = parseNbaPropResponses([{ status: 429, body: null, fetchedAt: FETCHED_AT }, { status: 500, body: null, fetchedAt: FETCHED_AT }], ctx());
  assert.equal(failed.coverage.state, COVERAGE_STATE.PROVIDER_FAILURE);
  assert.deepEqual(failed.coverage.responses.failed.map((f) => f.class), ["RATE_OR_CREDIT_LIMITED", "PROVIDER_INCIDENT"]);
  assert.equal(parseNbaPropResponses([], ctx()).coverage.state, COVERAGE_STATE.NO_RESPONSES);
  const oneBook = structuredClone(EVENT_1);
  oneBook.bookmakers = oneBook.bookmakers.filter((b) => b.key === "draftkings");
  const thin = parseNbaPropResponses([ok(oneBook)], ctx());
  assert.equal(thin.coverage.state, COVERAGE_STATE.INSUFFICIENT_COVERAGE);
  assert.match(thin.coverage.stateReason, /at least 2/);
  const wrong = parseNbaPropResponses([ok({ ...EVENT_1, sport_key: "basketball_wnba" })], ctx());
  assert.deepEqual(reasons(wrong), [REFUSAL.WRONG_SPORT]);
  const bad = parseNbaPropResponses([ok({ id: "x" })], ctx());
  assert.deepEqual(reasons(bad), [REFUSAL.RESPONSE_SHAPE_INVALID]);
});

test("determinism: same inputs → byte-identical output", () => {
  const a = JSON.stringify(parseNbaPropResponses([ok(EVENT_1), ok(EVENT_2)], ctx()));
  const b = JSON.stringify(parseNbaPropResponses([ok(EVENT_1), ok(EVENT_2)], ctx()));
  assert.equal(a, b);
});

/**
 * SAVED FORECASTS — integrity and edge cases (P324). A saved record is an immutable snapshot settled ONLY from the
 * canonical ledgers; every rule here is pure, so the daily rollover cannot rot it.
 * Run: npx tsx --test src/lib/saved/saved-integrity.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { SAVED_MAX, SAVED_SCHEMA_VERSION, parseStore, remove, saveCardOf, saveEligibility, savedAfterStart, serializeStore, snapshotFromCard, upsert } from "./saved-schema.mjs";
import { resolveResult } from "./results.mjs";

const status = { id: "mlb_moneyline", family: "Winner calls", state: "WATCH", headline: "h", detail: "d", n: 600, source: "s" };
const freshness = { state: "FRESH", updatedAt: "2026-09-15T12:00:00Z", label: "Updated", ageHours: 1 };
const mlbCard = (over = {}) => ({
  id: "mlb-824872", sport: "mlb", href: "/games/mlb/tb-vs-atl-2026-09-15/", lifecycle: "PREGAME", startUtc: "2026-09-15T23:10:00Z", startLabel: "Tue 7:10 PM ET",
  context: null, away: { name: "Tampa Bay Rays", code: "TB", favoured: false }, home: { name: "Atlanta Braves", code: "ATL", favoured: true },
  forecast: { label: "Winner", value: "ATL 58%", sub: "Projected TB 3–4 ATL" }, signal: { kind: "SIM_STRENGTH", label: "LEAN", probability: 0.58 },
  why: "ATL came out ahead.", risks: ["Not validated to out-predict the sportsbook market."], status, freshness, result: null,
  settlement: { kind: "mlb-game", gamePk: 824872, family: "Winner" }, ...over,
});
const at = (savedAt, card = mlbCard()) => snapshotFromCard(saveCardOf(card), { savedAt, sourceRoute: "/" });

test("duplicate saves and re-saves: one record per event, the FIRST snapshot stands even when the forecast has moved", () => {
  const first = at("2026-09-15T13:00:00Z");
  let items = upsert([], first);
  items = upsert(items, first);
  items = upsert(items, at("2026-09-15T15:00:00Z", mlbCard({ forecast: { label: "Winner", value: "ATL 64%", sub: null }, status: { ...status, state: "PAUSED" } })));
  assert.equal(items.length, 1);
  assert.equal(items[0].value, "ATL 58%", "a later model number never rewrites what was saved");
  assert.equal(items[0].modelState, "WATCH", "a later pause never rewrites the state as saved");
  assert.equal(items[0].savedAt, "2026-09-15T13:00:00Z");
});

test("identity cannot collide across sports: the id carries the sport, so equal provider ids stay distinct", () => {
  const nfl = { ...mlbCard(), id: "nfl-824872", sport: "nfl", settlement: { kind: "nfl-event", providerEventId: "824872", family: "Winner" } };
  const items = upsert(upsert([], at("2026-09-15T13:00:00Z")), snapshotFromCard(saveCardOf(nfl), { savedAt: "2026-09-15T13:01:00Z", sourceRoute: "/" }));
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((i) => i.id).sort(), ["mlb-824872", "nfl-824872"]);
});

test("the lean save card carries no pipeline sentence, and the snapshot is built from it alone", () => {
  const lean = saveCardOf(mlbCard());
  assert.ok(!("why" in lean) && !("risks" in lean), "why/risks never reach the client payload");
  assert.equal(lean.status.family, "Winner calls");
  const s = at("2026-09-15T13:00:00Z");
  assert.equal(s.modelFamily, "Winner calls");
  assert.equal(s.signal, "Simulation strength: lean");
});

test("pending → final → void: the ledger row decides, and a missing ledger never grades", () => {
  const s = at("2026-09-15T13:00:00Z");
  assert.equal(resolveResult(s, {}, "2026-09-15T20:00:00Z").state, "UPCOMING");
  assert.equal(resolveResult(s, {}, "2026-09-16T01:00:00Z").state, "PENDING", "started with no ledger row is pending, never a loss");
  assert.equal(resolveResult(s, { mlbGames: [] }, "2026-09-16T04:00:00Z").state, "PENDING");
  const hit = resolveResult(s, { mlbGames: [{ gamePk: 824872, market: "moneyline", outcome: "WIN", actual: { awayRuns: 3, homeRuns: 5 }, gradedAt: "2026-09-16T05:00:00Z" }] }, "2026-09-16T06:00:00Z");
  assert.deepEqual(hit, { state: "FINAL", outcome: "HIT", actual: "3–5", gradedAt: "2026-09-16T05:00:00Z" });
  const push = resolveResult(s, { mlbGames: [{ gamePk: 824872, market: "moneyline", outcome: "PUSH", actual: { awayRuns: 4, homeRuns: 4 } }] }, "2026-09-16T06:00:00Z");
  assert.equal(push.outcome, "VOID", "a push or a postponement is void, not a miss");
  const other = resolveResult(s, { mlbGames: [{ gamePk: 824872, market: "total", outcome: "LOSS" }] }, "2026-09-16T06:00:00Z");
  assert.equal(other.state, "PENDING", "a winner save is never graded from a total row");
});

test("a market paused after the save: the snapshot keeps the call as saved and still settles from its own market row", () => {
  const s = at("2026-09-15T13:00:00Z");
  const laterPausedRow = { gamePk: 824872, market: "moneyline", outcome: "LOSS", actual: { awayRuns: 6, homeRuns: 2 } };
  assert.equal(resolveResult(s, { mlbGames: [laterPausedRow] }, "2026-09-16T06:00:00Z").outcome, "MISS");
  assert.equal(s.value, "ATL 58%");
});

test("timezone boundaries: start and save instants compare in UTC, and an after-start save is marked, not disguised", () => {
  const s = at("2026-09-16T00:30:00Z"); // 8:30 PM ET on the 15th, after a 7:10 PM ET first pitch
  assert.equal(savedAfterStart(s), true);
  assert.equal(savedAfterStart(at("2026-09-15T22:00:00Z")), false);
  assert.deepEqual(saveEligibility(mlbCard(), "2026-09-15T23:10:00Z"), { ok: false, reason: "STARTED" }, "the first pitch instant itself is started");
  assert.equal(saveEligibility(mlbCard(), "2026-09-15T23:09:59Z").ok, true);
  assert.equal(saveEligibility(mlbCard({ startUtc: null, lifecycle: "STARTED" }), "2026-09-15T12:00:00Z").ok, false, "a started lifecycle refuses even without a start instant");
});

test("stale schema, corrupt payloads and foreign items are dropped, never guessed; the cap holds", () => {
  assert.deepEqual(parseStore(""), []);
  assert.deepEqual(parseStore("{not json"), []);
  assert.deepEqual(parseStore(JSON.stringify({ version: SAVED_SCHEMA_VERSION + 1, items: [at("2026-09-15T13:00:00Z")] })), [], "an unknown version is refused, not migrated by guesswork");
  assert.deepEqual(parseStore(JSON.stringify({ version: SAVED_SCHEMA_VERSION, items: [{ id: "x" }, null, 42, "y"] })), []);
  const good = at("2026-09-15T13:00:00Z");
  const mixed = parseStore(JSON.stringify({ version: SAVED_SCHEMA_VERSION, items: [good, { ...good, settlement: { kind: "nope" } }, { ...good, id: "" }] }));
  assert.equal(mixed.length, 1, "a malformed sibling never takes the good record down with it");
  const many = Array.from({ length: SAVED_MAX + 10 }, (_, i) => ({ ...good, id: `mlb-${i}` }));
  assert.equal(parseStore(serializeStore(many)).length, SAVED_MAX);
});

test("remove and clear: removing one leaves the rest untouched; a second removal is a no-op", () => {
  const a = at("2026-09-15T13:00:00Z");
  const b = { ...a, id: "mlb-1", settlement: { kind: "mlb-game", gamePk: 1, family: "Winner" } };
  let items = upsert(upsert([], a), b);
  items = remove(items, "mlb-1");
  assert.deepEqual(items.map((i) => i.id), ["mlb-824872"]);
  assert.deepEqual(remove(items, "mlb-1"), items);
  assert.deepEqual(remove(items, "mlb-824872"), []);
});

test("UFC and EPL settlement keys fail closed when the ledger names a different bout or fixture", () => {
  const ufc = { startUtc: "2026-09-19T02:00:00Z", settlement: { kind: "ufc-bout", date: "2026-09-19", red: "Red Fighter", blue: "Blue Fighter" } };
  const ledgers = { ufc: [{ market: "Fight winner", eventId: "2026-09-19:other one|blue fighter", hit: true }, { market: "Fight winner", eventId: "2026-09-12:red fighter|blue fighter", hit: false }] };
  assert.equal(resolveResult(ufc, ledgers, "2026-09-20T00:00:00Z").state, "PENDING", "same names on another date, or one name only, never settle");
  const epl = { startUtc: "2026-09-20T14:00:00Z", settlement: { kind: "epl-event", eventId: "ev-9", family: "Match result" } };
  assert.equal(resolveResult(epl, { epl: [{ eventId: "ev-8", market: "Match result", hit: true }] }, "2026-09-21T00:00:00Z").state, "PENDING");
  assert.equal(resolveResult(epl, { epl: [{ eventId: "ev-9", market: "Match result", hit: null, actual: "postponed" }] }, "2026-09-21T00:00:00Z").outcome, "VOID");
});

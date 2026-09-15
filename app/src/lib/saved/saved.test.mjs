/**
 * P310 — saved forecasts: a versioned, capped, browser-local store of IMMUTABLE snapshots; a settlement join that
 * reads only the canonical ledgers and fails closed; a route that is registered, noindexed and reachable; and the
 * ledgers it fetches surviving the export prune.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SAVED_MAX, SAVED_SCHEMA_VERSION, parseStore, serializeStore, upsert, remove, snapshotFromCard, isSavedForecast } from "./saved-schema.mjs";
import { resolveResult, parseLedger, LEDGER_URLS } from "./results.mjs";

const card = (over = {}) => ({
  id: "mlb-1", sport: "mlb", href: "/games/mlb/x/", lifecycle: "PREGAME", startUtc: "2026-09-15T23:10:00Z", startLabel: "Tue 7:10 PM ET", context: "Over 8.5 · 58%",
  away: { name: "Angels", code: "LAA", favoured: false }, home: { name: "Giants", code: "SF", favoured: true },
  forecast: { label: "Winner", value: "SF 61%", sub: "Projected LAA 3–4 SF" }, signal: { kind: "SIM_STRENGTH", label: "STRONG SIMULATION", probability: 0.61 },
  why: null, risks: [], status: { id: "mlb_moneyline", family: "Winner calls", state: "WATCH", headline: "", detail: "", n: 605, source: "" },
  freshness: { state: "FRESH", updatedAt: "2026-09-15T12:00:00Z", label: "Updated", ageHours: 1 }, result: null,
  settlement: { kind: "mlb-game", gamePk: 1, family: "Winner" }, ...over,
});
const NOW = "2026-09-15T20:00:00Z";
const snap = (over = {}) => snapshotFromCard(card(over), { savedAt: NOW, sourceRoute: "/" });

test("a snapshot carries the forecast, the model state and the artifact stamp as saved; a second save never rewrites it", () => {
  const s = snap();
  assert.ok(isSavedForecast(s));
  assert.equal(s.schemaVersion, SAVED_SCHEMA_VERSION);
  assert.equal(s.matchup, "Angels @ Giants");
  assert.equal(s.modelState, "WATCH");
  assert.equal(s.updatedAt, "2026-09-15T12:00:00Z");
  assert.match(s.signal, /Simulation strength: strong simulation/);
  let items = upsert([], s);
  const changed = snap({ forecast: { label: "Winner", value: "SF 70%", sub: null }, status: { ...card().status, state: "PAUSED" } });
  items = upsert(items, changed);
  assert.equal(items.length, 1, "one save per event");
  assert.equal(items[0].value, "SF 61%", "the ORIGINAL snapshot stands");
  assert.equal(items[0].modelState, "WATCH");
  assert.equal(snap({ sport: "epl" }).matchup, "Angels v Giants");
  assert.equal(snap({ sport: "ufc" }).matchup, "Angels vs Giants");
});

test("the store round-trips, migrates by refusing unknown versions and malformed items, and stays capped", () => {
  const items = Array.from({ length: SAVED_MAX + 5 }, (_, i) => snap({ id: `mlb-${i}` }));
  const round = parseStore(serializeStore(items));
  assert.equal(round.length, SAVED_MAX);
  assert.deepEqual(parseStore(null), []);
  assert.deepEqual(parseStore("not json"), []);
  assert.deepEqual(parseStore(JSON.stringify({ version: 99, items: [snap()] })), [], "an unknown version is refused, not guessed");
  assert.deepEqual(parseStore(JSON.stringify({ version: 1, items: [{ id: "x" }, snap()] })).map((i) => i.id), ["mlb-1"], "a malformed item is dropped");
  assert.equal(remove([snap(), snap({ id: "mlb-2" })], "mlb-1").length, 1);
  assert.equal(upsert([], { ...snap(), settlement: { kind: "bogus" } }).length, 0, "no settlement key, no save");
});

test("results join only the canonical ledgers and fail closed: no row is upcoming or pending, a push is void", () => {
  const s = snap();
  assert.equal(resolveResult(s, {}, "2026-09-15T20:00:00Z").state, "UPCOMING");
  assert.equal(resolveResult(s, {}, "2026-09-16T05:00:00Z").state, "PENDING");
  const win = resolveResult(s, { mlbGames: [{ gamePk: 1, market: "moneyline", outcome: "WIN", actual: { awayRuns: 3, homeRuns: 5 }, gradedAt: "g" }] }, NOW);
  assert.deepEqual(win, { state: "FINAL", outcome: "HIT", actual: "3–5", gradedAt: "g" });
  assert.equal(resolveResult(s, { mlbGames: [{ gamePk: 1, market: "moneyline", outcome: "PUSH", actual: null }] }, NOW).outcome, "VOID");
  assert.equal(resolveResult(s, { mlbGames: [{ gamePk: 1, market: "total", outcome: "LOSS" }] }, NOW).state, "UPCOMING", "a different market's row is not this forecast's result");
  const nfl = snap({ sport: "nfl", settlement: { kind: "nfl-event", providerEventId: "9", family: "Winner" } });
  assert.equal(resolveResult(nfl, { nfl: [{ eventId: "nfl-9", market: "Winner", hit: false, actual: "AWAY", when: "2026-09-14" }] }, NOW).outcome, "MISS");
  assert.equal(resolveResult(nfl, { nfl: [{ eventId: "nfl-9", market: "Winner", hit: null }] }, NOW).outcome, "VOID");
  const epl = snap({ sport: "epl", settlement: { kind: "epl-event", eventId: "soccer:epl:a-v-b:2026", family: "Match result" } });
  assert.equal(resolveResult(epl, { epl: [{ eventId: "soccer:epl:a-v-b:2026", market: "Match result", hit: true, actual: "home win (2-1)" }] }, NOW).actual, "home win (2-1)");
  const ufc = snap({ sport: "ufc", settlement: { kind: "ufc-bout", date: "2026-09-12", red: "Brandon Moreno", blue: "Joseph Morales" } });
  assert.equal(resolveResult(ufc, { ufc: [{ eventId: "2026-09-12:brandon moreno|joseph morales", market: "Fight winner", hit: true, actual: "Brandon Moreno" }] }, NOW).outcome, "HIT");
  assert.equal(resolveResult(ufc, { ufc: [{ eventId: "2026-09-13:brandon moreno|joseph morales", market: "Fight winner", hit: true }] }, NOW).state, "UPCOMING", "another date's bout is not this one");
});

test("ledgers parse defensively", () => {
  assert.equal(parseLedger("mlbGames", '{"a":1}\n\n{"a":2}\n').length, 2);
  assert.deepEqual(parseLedger("nfl", "{}"), []);
  assert.deepEqual(parseLedger("nfl", "broken"), []);
  for (const u of Object.values(LEDGER_URLS)) assert.match(u, /^\/data\//, "every ledger is a served /data path");
});

test("SOURCE PIN · /saved is registered, noindexed, reachable, and the card offers the save control", () => {
  const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  assert.match(src("src/app/saved/page.tsx"), /robots: \{ index: false/, "personal, never indexed");
  assert.match(src("src/lib/navigation.ts"), /href: "\/saved", label: "Saved Forecasts", shortLabel: "Saved"/);
  assert.match(src("src/lib/public-route-inventory.test.mjs"), /"\/saved",/);
  assert.match(src("scripts/audit-accessibility.mjs"), /"saved",/);
  assert.match(src("e2e/accessibility.spec.ts"), /"\/saved\/"/);
  assert.match(src("src/components/command-center/prediction-card.tsx"), /<SaveForecastButton card=\{card\} \/>/);
  assert.match(src("src/components/saved/save-forecast-button.tsx"), /aria-pressed=\{saved\}/, "the control states its own state");
  assert.match(src("src/components/saved/saved-list.tsx"), /LEDGER_URLS/, "the page fetches the ledgers by their literal paths so the prune keeps them");
});

test("BUILT · the ledgers the saved page fetches survive the export prune", () => {
  const out = path.join(process.cwd(), "out");
  if (!fs.existsSync(path.join(out, "saved", "index.html"))) return;
  for (const u of Object.values(LEDGER_URLS)) assert.ok(fs.existsSync(path.join(out, u.replace(/^\//, ""))), `${u} was pruned from the export — the saved page would show every result as pending`);
});

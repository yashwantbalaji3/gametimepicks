import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FEATURED_FAMILY_STATES, FEATURED_LIMIT, featuredForecasts, eligibleForecastCount, measurementStateOf } from "./featured-forecasts.mjs";

const APP = path.resolve(new URL("../../..", import.meta.url).pathname);
const LP = path.join(APP, "public/data/nfl/live-props");
const artifacts = () => fs.readdirSync(LP).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(LP, f), "utf8")));

const row = (o) => ({
  predictionId: o.predictionId ?? `e:${o.playerId}:${o.family}`,
  playerId: o.playerId, name: o.name ?? o.playerId, team: o.team ?? "SEA",
  family: o.family, familyState: o.familyState ?? "PUBLISHED",
  frozen: { projection: { median: o.median ?? null, p10: null, p90: null, probability: o.probability ?? null }, market: { line: o.line ?? null } },
  live: { statValue: o.statValue === undefined ? null : o.statValue, observedAt: o.observedAt ?? null },
});

test("at most five rows, ever", () => {
  const many = Array.from({ length: 40 }, (_, i) => row({ playerId: `p${i}`, family: "player_rush_yds", median: 10, line: 9 }));
  assert.equal(featuredForecasts({ rows: many, phase: "IN_PROGRESS" }).length, FEATURED_LIMIT);
  assert.equal(FEATURED_LIMIT, 5);
  /* And on the real slate — 493 eligible rows exist across it; a card must never render them. */
  for (const a of artifacts()) assert.ok(featuredForecasts(a).length <= 5, `${a.matchup} rendered more than five`);
});

test("🔴 the five do NOT change when live play does", () => {
  /*
   * The product claim is that a prediction is frozen before kickoff and then watched. If the
   * membership re-ranked on live activity, a featured pregame prediction could vanish once the game
   * started — "featured forecasts" would mean "whatever is happening most".
   */
  const base = [
    row({ playerId: "a", family: "player_rush_yds", median: 10, line: 9 }),
    row({ playerId: "b", family: "player_reception_yds", median: 40, line: 38 }),
    row({ playerId: "c", family: "player_receptions", median: 4, line: 3.5 }),
    row({ playerId: "d", family: "anytime_td", probability: 0.4 }),
    row({ playerId: "e", family: "player_rush_yds", median: 55, line: 50 }),
    row({ playerId: "f", family: "player_rush_yds", median: 60, line: 58 }),
  ];
  const pre = featuredForecasts({ rows: base, phase: "PRE" }).map((f) => f.predictionId);

  /* The same slate, mid-game: the LAST row explodes and an early one stays untouched. */
  const live = base.map((r) => (r.playerId === "f" ? { ...r, live: { statValue: 400, observedAt: "t" } } : r));
  const mid = featuredForecasts({ rows: live, phase: "IN_PROGRESS" }).map((f) => f.predictionId);
  assert.deepEqual(mid, pre, "a big live number must not pull a row into the featured set");

  /* And at FINAL, still the same five. */
  const fin = featuredForecasts({ rows: live, phase: "FINAL" }).map((f) => f.predictionId);
  assert.deepEqual(fin, pre, "membership must survive PRE → LIVE → FINAL unchanged");
  assert.equal(pre.includes("e:f:player_rush_yds"), false, "the exploding row was never featured and must stay out");
});

test("selection reads no live field at all", () => {
  /* Structural: the selector cannot consider what it never touches. */
  const src = fs.readFileSync(path.join(APP, "src/lib/live/featured-forecasts.mjs"), "utf8");
  const fn = src.slice(src.indexOf("export function featuredForecasts"), src.indexOf("export function eligibleForecastCount"));
  for (const live of ["statValue", "observedAt", ".live", "liveValue"]) {
    assert.equal(fn.includes(live), false, `the selector must not read ${live}`);
  }
});

test("only explicitly cleared families, and never by substring", () => {
  const rows = [
    row({ playerId: "ok", family: "player_rush_yds", familyState: "PUBLISHED", median: 1, line: 1 }),
    row({ playerId: "est", family: "player_pass_yds", familyState: "ESTIMATE", median: 1, line: 1 }),
    row({ playerId: "wh", family: "player_pass_int", familyState: "WITHHELD", median: 1, line: 1 }),
    row({ playerId: "sneaky", family: "player_rush_yds", familyState: "NOT_PUBLISHED", median: 1, line: 1 }),
    row({ playerId: "unk", family: "player_rush_yds", familyState: "AVAILABLE_SOMETHING", median: 1, line: 1 }),
  ];
  const got = featuredForecasts({ rows, phase: "PRE" }).map((f) => f.playerId);
  assert.deepEqual(got, ["ok"], "a state must be cleared by name, not by containing a hopeful word");
  /* "NOT_PUBLISHED" contains "PUBLISHED": a substring test would admit it. */
  assert.equal(FEATURED_FAMILY_STATES.has("NOT_PUBLISHED"), false);
  /* An inherited key is not an allowlisted family: `"constructor" in FAMILY_KIND` is true. */
  const proto = featuredForecasts({ rows: [row({ playerId: "proto", family: "constructor", familyState: "PUBLISHED", median: 1, line: 1 })], phase: "PRE" });
  assert.equal(proto.length, 0, "a prototype key must not pass the family allowlist");
  const s = fs.readFileSync(path.join(APP, "src/lib/live/featured-forecasts.mjs"), "utf8");
  assert.equal(/familyState.*\.includes\(|includes\(.*familyState/.test(s), false, "no substring matching on state");
});

test("🔴 a missing measurement is not a zero, and a measured zero is not missing", () => {
  const missing = row({ playerId: "m", family: "player_rush_yds", median: 10, line: 9 });
  const zero = row({ playerId: "z", family: "player_rush_yds", median: 10, line: 9, statValue: 0, observedAt: "t" });
  const [fm, fz] = featuredForecasts({ rows: [missing, zero], phase: "IN_PROGRESS" });
  assert.equal(fm.liveValue, null);
  assert.equal(fm.measurementState, "AWAITING_FIRST_MEASUREMENT");
  assert.equal(fz.liveValue, 0, "an observed zero is a measurement and must survive as 0");
  assert.equal(fz.measurementState, "MEASURED");
  assert.notEqual(fm.measurementState, fz.measurementState);
  /* Before kickoff neither is awaiting anything — the game has not started. */
  assert.equal(measurementStateOf(missing, "PRE"), "NOT_STARTED");
});

test("volume and probability families state different things, and neither borrows the price", () => {
  const rows = [
    row({ playerId: "v", family: "player_reception_yds", median: 107.5, line: 92.5 }),
    row({ playerId: "t", family: "anytime_td", probability: 0.627 }),
  ];
  const [v, t] = featuredForecasts({ rows, phase: "PRE" });
  assert.equal(v.kind, "VOLUME");
  assert.equal(v.modelValue, 107.5);
  assert.equal(v.modelProbability, null, "a volume family has no probability");
  assert.equal(t.kind, "PROBABILITY");
  assert.equal(t.modelProbability, 0.627);
  assert.equal(t.modelValue, null, "a touchdown has no yardage value to put on a rail");
  const s = fs.readFileSync(path.join(APP, "src/lib/live/featured-forecasts.mjs"), "utf8");
  for (const price of ["yesOdds", "overOdds", "underOdds"]) {
    assert.equal(s.includes(price), false, `${price} is a bookmaker price and must never become a model claim`);
  }
});

test("five rows are five faces where the slate allows it", () => {
  for (const a of artifacts()) {
    const f = featuredForecasts(a);
    if (f.length < 5) continue;
    const players = new Set(f.map((x) => x.playerId));
    assert.equal(players.size, 5, `${a.matchup}: five rows should be five distinct players, got ${players.size}`);
  }
});

test("it is deterministic, and the count it reports is the real one", () => {
  for (const a of artifacts()) {
    const a1 = featuredForecasts(a).map((f) => f.predictionId);
    const a2 = featuredForecasts(a).map((f) => f.predictionId);
    assert.deepEqual(a1, a2);
    const total = eligibleForecastCount(a);
    assert.ok(total >= a1.length, `${a.matchup}: "view all ${total}" must not understate the five shown`);
    assert.ok(total > 5, `${a.matchup}: the real slate should have more than five eligible (got ${total})`);
  }
});

test("the frozen halves come from the artifact's own capture", () => {
  /* Projection, line and live value in one row all came out of the same capture, so they cannot
     skew against each other — which a second client-side join back to the board would allow. */
  const a = artifacts()[0];
  const f = featuredForecasts(a);
  const byId = new Map(a.rows.map((r) => [r.predictionId, r]));
  for (const x of f) {
    const r = byId.get(x.predictionId);
    assert.ok(r, "every featured row must trace to a real artifact row");
    assert.equal(x.line, r.frozen?.market?.line ?? null);
    if (x.kind === "VOLUME") assert.equal(x.modelValue, r.frozen?.projection?.median ?? null);
    assert.equal(x.playerId, r.playerId);
  }
});

test("⚠ a probability that was frozen BEFORE the producer carried it stays null, and renders honestly", () => {
  /*
   * The producer freezes a row once and carries that record forward — `frozen = previous?.frozen`
   * — which is the whole point of the word. So adding `probability` to the frozen projection only
   * reaches rows frozen for the FIRST time after the change; every row already frozen on
   * 2026-09-27 keeps its original record, without one.
   *
   * Backfilling would mean re-freezing from a newer board, which the producer deliberately refuses
   * (it counts those refusals). So the UI must render a touchdown row whose pregame claim is
   * genuinely absent, rather than assuming one is always there.
   */
  const frozenBefore = {
    predictionId: "e:p:anytime_td", playerId: "p", name: "P", team: "SEA",
    family: "anytime_td", familyState: "PUBLISHED",
    frozen: { projection: { median: null, p10: null, p90: null }, market: { yesOdds: 100 } },
    live: { statValue: 1, observedAt: "t" },
  };
  const [f] = featuredForecasts({ rows: [frozenBefore], phase: "IN_PROGRESS" });
  assert.equal(f.kind, "PROBABILITY");
  assert.equal(f.modelProbability, null, "an absent pregame probability must stay absent");
  assert.equal(f.modelValue, null, "and must never be filled from the yardage slot");
  assert.equal(f.liveValue, 1, "while the factual touchdown still reports");
  assert.equal(f.measurementState, "MEASURED");
});

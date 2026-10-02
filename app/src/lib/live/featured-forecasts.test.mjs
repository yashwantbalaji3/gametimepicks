import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FEATURED_FAMILY_STATES, FEATURED_LIMIT, FEATURED_FAMILY_ORDER, FEED, GAME_PHASE, LIVE_STALE_AFTER_MS,
  featuredForecasts, eligibleForecastCount, measurementStateOf, trackForecast, statusFor, railLandmarks,
} from "./featured-forecasts.mjs";
import { RESULT_RAIL_STATES } from "./tracked-prediction.mjs";

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

test("⚠ a touchdown frozen WITHOUT a model probability is never featured, and still reports its fact", () => {
  /*
   * The producer freezes a row once and carries that record forward — `frozen = previous?.frozen` —
   * so every touchdown row frozen on 2026-09-27 has no probability. It must not be backfilled from a
   * board or from anything a bookmaker priced, and it must not be FEATURED without the claim: a
   * featured row promises the reader a pregame number. It stays in View All, where its factual
   * touchdown state still renders.
   */
  const frozenBefore = {
    predictionId: "e:p:anytime_td", playerId: "p", name: "P", team: "SEA",
    family: "anytime_td", familyState: "PUBLISHED",
    frozen: { projection: { median: null, p10: null, p90: null }, market: { sportsbook: "draftkings" } },
    live: { statValue: 1, observedAt: "t" },
  };
  assert.equal(featuredForecasts({ rows: [frozenBefore], phase: "IN_PROGRESS" }).length, 0, "no frozen probability, no featured TD");
  assert.equal(eligibleForecastCount({ rows: [frozenBefore] }), 1, "but it is still a legitimate forecast for View All");
  const f = { predictionId: "e:p:anytime_td", playerId: "p", kind: "PROBABILITY", family: "anytime_td", modelProbability: null, modelValue: null, modelLow: null, modelHigh: null, line: null, frozenAt: "2026-09-27T14:42:05Z" };
  const t = trackForecast(f, { gamePhase: GAME_PHASE.LIVE, liveRow: frozenBefore, feed: FEED.OK });
  assert.equal(t.status, "Touchdown scored", "the factual touchdown still reports");
  assert.equal(t.landmarks, null, "and a touchdown never gets a yardage rail");
});

/* ──────────────────────────────  V2B · family diversity  ────────────────────────────── */

/* Board order puts running backs first — the order that starved receptions and touchdowns in V2A. */
const rb = (id, rush, rec, recs, td) => [
  row({ playerId: id, family: "player_rush_yds", median: rush, line: rush - 3 }),
  row({ playerId: id, family: "player_reception_yds", median: rec, line: rec - 2 }),
  row({ playerId: id, family: "player_receptions", median: recs, line: recs - 0.5 }),
  row({ playerId: id, family: "anytime_td", probability: td }),
];

test("🔴 pass 1 features one row per family, in the fixed order, from different players", () => {
  const rows = [...rb("rb1", 70, 20, 3, 0.55), ...rb("rb2", 60, 15, 2, 0.48), ...rb("rb3", 50, 12, 2, 0.4), ...rb("rb4", 40, 10, 1, 0.3), ...rb("rb5", 30, 8, 1, 0.2)];
  const f = featuredForecasts({ rows, phase: "PRE" });
  assert.deepEqual(f.slice(0, 4).map((x) => x.family), [...FEATURED_FAMILY_ORDER], "receiving → rushing → receptions → TD");
  assert.equal(new Set(f.map((x) => x.playerId)).size, 5, "five rows, five faces");
  assert.deepEqual(f.map((x) => x.playerId), ["rb1", "rb2", "rb3", "rb4", "rb5"], "each family's EARLIEST eligible row with a new face, then board order");
  /* V2A would have featured five rushing rows here. */
  assert.ok(f.some((x) => x.family === "anytime_td") && f.some((x) => x.family === "player_receptions"));
});

test("pass 3: a second market for a shown player only when fewer than five unique players exist", () => {
  const two = [...rb("a", 70, 20, 3, 0.5), ...rb("b", 60, 15, 2, 0.4)];
  const f = featuredForecasts({ rows: two, phase: "PRE" });
  assert.equal(f.length, 5, "a short slate still fills five");
  assert.equal(new Set(f.map((x) => x.playerId)).size, 2);
  /* Never a repeat while a new face is available: */
  const three = [...two, row({ playerId: "c", family: "player_rush_yds", median: 5, line: 4.5 })];
  const g = featuredForecasts({ rows: three, phase: "PRE" });
  assert.ok(g.some((x) => x.playerId === "c"), "an unused player outranks a second market");
  assert.equal(featuredForecasts({ rows: [...three].reverse(), phase: "PRE" }).length, 5);
});

test("the membership ignores market gap, price and interval width — only frozen order and family", () => {
  const base = [...rb("x", 70, 20, 3, 0.5), ...rb("y", 60, 15, 2, 0.4)];
  const pick = (rows) => featuredForecasts({ rows, phase: "PRE" }).map((f) => f.predictionId);
  const before = pick(base);
  /* Make y's lines wildly "juicier" and its intervals narrower: nothing may move. */
  const juicier = base.map((r) => (r.playerId === "y" ? { ...r, frozen: { ...r.frozen, market: { line: 0.5, sportsbook: "x" }, projection: { ...r.frozen.projection, p10: 1, p90: 1.1 } } } : r));
  assert.deepEqual(pick(juicier), before);
});

test("every featured touchdown on the real slate carries a frozen model probability", () => {
  /* Holds for any slate: a featured TD row without a frozen claim is a defect whatever the data. */
  let featured = 0;
  for (const a of artifacts()) {
    const byId = new Map(a.rows.map((r) => [r.predictionId, r]));
    for (const f of featuredForecasts(a)) {
      featured += 1;
      if (f.family !== "anytime_td") continue;
      assert.equal(typeof byId.get(f.predictionId)?.frozen?.projection?.probability, "number", `${f.predictionId}`);
    }
  }
  assert.ok(featured > 0 || artifacts().length === 0, "anti-vacuity: the real artifacts produced featured rows");
});

/* ──────────────────────────────  V2B · tracking + words  ────────────────────────────── */

const VOL = { predictionId: "e:v:player_reception_yds", playerId: "v", kind: "VOLUME", family: "player_reception_yds", modelValue: 107.5, modelLow: 58, modelHigh: 168, modelProbability: null, line: 92.5, frozenAt: "2026-09-27T14:42:05Z" };
const TD = { predictionId: "e:t:anytime_td", playerId: "t", kind: "PROBABILITY", family: "anytime_td", modelValue: null, modelLow: null, modelHigh: null, modelProbability: 0.614, line: null, frozenAt: "2026-09-27T14:42:05Z" };
const NOW = Date.parse("2026-09-27T18:40:00Z");
const lr = (v, at = "2026-09-27T18:39:30Z", finalStat = null) => ({ live: { statValue: v, observedAt: at }, settlement: { state: "PENDING", finalStat } });

test("the state table — PRE, awaiting, measured zero, below / at / above, stale, unavailable, TD, final", () => {
  const T = (f, ctx) => trackForecast(f, { nowMs: NOW, ...ctx });
  assert.equal(T(VOL, { gamePhase: "PRE" }).status, "Starts at kickoff");
  assert.equal(T(VOL, { gamePhase: "PRE" }).liveValue, null, "PRE never shows a live number, not even 0");
  assert.equal(T(VOL, { gamePhase: "LIVE", feed: FEED.OK, liveRow: lr(null) }).status, "Awaiting first measurement");
  const zero = T(VOL, { gamePhase: "LIVE", feed: FEED.OK, liveRow: lr(0) });
  assert.equal(zero.liveValue, 0, "a measured zero is a 0");
  assert.equal(zero.status, "Currently below line");
  assert.equal(T(VOL, { gamePhase: "LIVE", feed: FEED.OK, liveRow: lr(63) }).status, "Currently below line");
  assert.equal(T({ ...VOL, line: 5 }, { gamePhase: "LIVE", feed: FEED.OK, liveRow: lr(5) }).status, "Currently at line");
  assert.equal(T(VOL, { gamePhase: "LIVE", feed: FEED.OK, liveRow: lr(112) }).status, "Currently above line");
  const stale = T(VOL, { gamePhase: "LIVE", feed: FEED.OK, liveRow: lr(88, new Date(NOW - LIVE_STALE_AFTER_MS - 60_000).toISOString()) });
  assert.equal(stale.stale, true);
  assert.equal(stale.status, "Last known · below line", "stale data is labelled, never shown as current");
  assert.equal(stale.liveValue, 88, "and the last known value is kept, not blanked");
  assert.equal(T(VOL, { gamePhase: "LIVE", feed: FEED.UNAVAILABLE }).status, "Live tracking temporarily unavailable");
  assert.equal(T(TD, { gamePhase: "LIVE", feed: FEED.OK, liveRow: lr(0) }).status, "No TD yet");
  assert.equal(T(TD, { gamePhase: "LIVE", feed: FEED.OK, liveRow: lr(1) }).status, "Touchdown scored");
  const fin = T(VOL, { gamePhase: "FINAL", feed: FEED.OK, liveRow: lr(96, "2026-09-27T20:31:00Z", 96) });
  assert.equal(fin.status, "Final · grading pending");
  assert.equal(fin.finalStat, 96);
  assert.equal(T(TD, { gamePhase: "FINAL", feed: FEED.OK, liveRow: lr(1, "t", 1) }).status, "Final · touchdown scored · grading pending");
});

test("🔴 'No TD yet' needs evidence: no record read, or no row for the player, is not a no", () => {
  assert.equal(trackForecast(TD, { gamePhase: "LIVE", feed: FEED.NOT_ASKED }).status, "Awaiting first measurement");
  assert.equal(trackForecast(TD, { gamePhase: "LIVE", feed: FEED.OK, liveRow: null }).status, "Awaiting first measurement");
});

test("🔴 no input reaches an outcome word or a result rail state", () => {
  const banned = /\b(?:hit|miss|win|won|loss|lost|cashed|failed)\b/i;
  const phases = ["PRE", "LIVE", "FINAL"];
  const feeds = [FEED.OK, FEED.UNAVAILABLE, FEED.NOT_ASKED];
  const values = [null, 0, 1, 5, 92.5, 400];
  const ats = [null, "2026-09-27T18:39:30Z", "2026-09-27T17:00:00Z", "garbage"];
  let n = 0;
  for (const f of [VOL, TD, { ...VOL, line: null }]) for (const gamePhase of phases) for (const feed of feeds) for (const v of values) for (const at of ats) {
    for (const hasRow of [true, false]) {
      const t = trackForecast(f, { gamePhase, feed, liveRow: hasRow ? lr(v, at, v) : null, observedAt: at, nowMs: NOW });
      assert.doesNotMatch(t.status, banned, `${gamePhase}/${feed}/${v}/${at}: "${t.status}"`);
      assert.equal(RESULT_RAIL_STATES.includes(t.rail), false, `${gamePhase}/${feed}/${v}: rail ${t.rail}`);
      n += 1;
    }
  }
  assert.ok(n > 1000, `anti-vacuity: ${n} combinations`);
  /* And statusFor directly, with the rail forced to a result state, still says nothing about money. */
  for (const rail of RESULT_RAIL_STATES) assert.doesNotMatch(statusFor({ rail, binary: false, gamePhase: "LIVE", feed: FEED.OK, value: 5, line: 4.5, stale: false }), banned);
});

test("🔴 LINE and GTP are landmarks: a live value moves the dot, never the scale", () => {
  const a = railLandmarks({ line: 92.5, gtp: 107.5, high: 168, live: 10 });
  const b = railLandmarks({ line: 92.5, gtp: 107.5, high: 168, live: 150 });
  const c = railLandmarks({ line: 92.5, gtp: 107.5, high: 168, live: 900 });
  assert.equal(a.line, b.line); assert.equal(b.line, c.line);
  assert.equal(a.gtp, b.gtp); assert.equal(b.gtp, c.gtp);
  assert.ok(a.live < b.live, "the live dot moves");
  assert.equal(c.live, 100); assert.equal(c.liveOverflow, true, "past the frozen scale it clamps and says so");
  assert.ok(a.line < a.gtp, "line 92.5 sits left of GTP 107.5");
  assert.equal(railLandmarks({ line: null, gtp: null, high: null, live: 5 }), null, "no frozen number, no rail");
  assert.equal(railLandmarks({ line: 5, gtp: 6, high: null, live: null }).live, null, "no measurement, no dot — never a dot at 0");
});

/* ──────────────────────────────  V2B.1 · canonical settlement  ────────────────────────────── */

/* The producer's own settlement shape: it writes the frozen line beside the result (live-prop-state.mjs `settle`). */
const settledRow = (settlement, v = 96, line = 92.5) => ({ live: { statValue: v, observedAt: "2026-09-27T22:40:00Z" }, settlement: { finalStat: v, line, ...settlement } });

test("🔴 an outcome appears only when the row's settlement is CANONICAL, in the owner's words", () => {
  const T = (row, gamePhase = "FINAL") => trackForecast(VOL, { gamePhase, feed: FEED.OK, liveRow: row });
  /* PROVISIONAL, even with a written result: still pending. */
  assert.equal(T(settledRow({ finality: "PROVISIONAL", state: "SETTLED", forecastResult: "WIN", lineResult: "OVER" })).status, "Final · grading pending");
  assert.equal(T(settledRow({ state: "SETTLED", forecastResult: "WIN", lineResult: "OVER" })).status, "Final · grading pending", "no finality stamp is not canonical");
  /* CANONICAL: the owner's words, verbatim. */
  const c = T(settledRow({ finality: "CANONICAL", state: "SETTLED", forecastResult: "WIN", lineResult: "OVER" }));
  assert.equal(c.status, "Settled · forecast WIN · line OVER");
  assert.deepEqual(c.settlement, { state: "SETTLED", forecastResult: "WIN", lineResult: "OVER", finalStat: 96 });
  assert.equal(T(settledRow({ finality: "CANONICAL", state: "NO_MEASUREMENT" }, null)).status, "Settled · no measurement", "no measurement is never a loss");
  /* A canonical row seen while the card still thinks the game is live is not rendered as settled. */
  assert.equal(T(settledRow({ finality: "CANONICAL", state: "SETTLED", forecastResult: "WIN", lineResult: "OVER" }), "LIVE").settlement, null);
});

test("🔴 the browser never derives the outcome — the owner's result wins over finalStat vs line", () => {
  /* The owner says LOSS/UNDER although 96 > 92.5 — e.g. a published result a later correction disagrees
     with. The card must show what the owner wrote, not what it could compute. */
  const t = trackForecast(VOL, { gamePhase: "FINAL", feed: FEED.OK, liveRow: settledRow({ finality: "CANONICAL", state: "SETTLED", forecastResult: "LOSS", lineResult: "UNDER" }) });
  assert.equal(t.status, "Settled · forecast LOSS · line UNDER");
});

test("a touchdown is a line result, never a forecast win; unknown vocabulary is dropped, not mapped", () => {
  const td = trackForecast(TD, { gamePhase: "FINAL", feed: FEED.OK, liveRow: settledRow({ finality: "CANONICAL", state: "SETTLED", forecastResult: "NOT_APPLICABLE", lineResult: "YES" }, 1) });
  assert.equal(td.status, "Settled · forecast not applicable · line YES");
  assert.doesNotMatch(td.status, /\b(?:WIN|HIT)\b/, "touchdown scored is not a forecast win");
  /* A value outside the owner's vocabulary is not guessed at. */
  const odd = trackForecast(VOL, { gamePhase: "FINAL", feed: FEED.OK, liveRow: settledRow({ finality: "CANONICAL", state: "SETTLED", forecastResult: "HIT", lineResult: "CASHED" }) });
  assert.equal(odd.status, "Settled", "HIT is not the owner's word and CASHED is no line result — both dropped");
  assert.doesNotMatch(odd.status, /HIT|CASHED/);
});

/* ──────────────────────────────  lifecycle → phase  ────────────────────────────── */

test("🔴 unknown is not live: every lifecycle state maps explicitly, and nothing unrecognised becomes LIVE", async () => {
  const { LIFECYCLE_STATES } = await import("./lifecycle.mjs");
  const { gamePhaseForLifecycle } = await import("./featured-forecasts.mjs");
  const want = { PRE: "PRE", LIVE: "LIVE", DELAYED: "LIVE", FINAL_PENDING_SETTLEMENT: "FINAL", SETTLED: "FINAL", POSTPONED: "NOT_PLAYED", CANCELLED: "NOT_PLAYED", UNKNOWN: "UNKNOWN" };
  assert.deepEqual([...LIFECYCLE_STATES].sort(), Object.keys(want).sort(), "the table covers the lifecycle owner's whole vocabulary — a new state must be mapped on purpose");
  for (const s of LIFECYCLE_STATES) assert.equal(gamePhaseForLifecycle(s), want[s], s);
  for (const odd of ["", "IN_PROGRESS", "constructor", "live"]) assert.equal(gamePhaseForLifecycle(odd), "UNKNOWN", `"${odd}" must not be read as live`);
  /* And the tracker makes no live claim for an unknown or unplayed game. */
  const u = trackForecast(VOL, { gamePhase: "UNKNOWN", feed: FEED.UNAVAILABLE, nowMs: NOW });
  assert.equal(u.status, "Game status unavailable");
  assert.equal(u.liveValue, null);
  assert.equal(trackForecast(VOL, { gamePhase: "NOT_PLAYED", feed: FEED.OK, liveRow: lr(40) }).liveValue, null, "no live number for a postponed game");
});

/* ──────────────────────────────  V2D · card freshness  ────────────────────────────── */

test("🔴 card freshness is honest: fresh, last-known, unavailable — and nothing without a reader clock", async () => {
  const { cardFreshness } = await import("./featured-forecasts.mjs");
  const at = "2026-09-27T18:39:18Z";
  assert.deepEqual(cardFreshness({ gamePhase: "LIVE", feed: FEED.OK, observedAt: at, nowMs: Date.parse("2026-09-27T18:40:00Z") }), { kind: "FRESH", text: "Live measurements · Updated 42s ago" });
  assert.deepEqual(cardFreshness({ gamePhase: "LIVE", feed: FEED.OK, observedAt: at, nowMs: Date.parse("2026-09-27T18:42:18Z") }), { kind: "STALE", text: "Last known state · Updated 3m ago" });
  assert.deepEqual(cardFreshness({ gamePhase: "LIVE", feed: FEED.UNAVAILABLE, observedAt: null, nowMs: 1 }), { kind: "UNAVAILABLE", text: "Live tracking temporarily unavailable" });
  /* ⚠ Hydration: the server render (and the first client render) has no reader clock → nothing is said. */
  assert.equal(cardFreshness({ gamePhase: "LIVE", feed: FEED.OK, observedAt: at, nowMs: null }), null);
  for (const gamePhase of ["PRE", "UNKNOWN", "NOT_PLAYED", "FINAL"]) {
    assert.equal(cardFreshness({ gamePhase, feed: FEED.OK, observedAt: at, nowMs: Date.parse(at) }), null, `${gamePhase} makes no live-freshness claim`);
  }
  assert.equal(cardFreshness({ gamePhase: "LIVE", feed: FEED.NOT_ASKED, observedAt: null, nowMs: 1 }), null, "not yet asked is not unavailable");
  assert.equal(cardFreshness({ gamePhase: "LIVE", feed: FEED.OK, observedAt: "garbage", nowMs: 1 }), null, "an unparseable stamp is not 'just now'");
});

/* ───────────────  Session 6 · "no TD" at FINAL needs a measurement taken AT the final  ─────────────── */

test("🔴 FINAL anytime-TD: no read says nothing; a mid-game read says only what it saw; only a final read says 'no TD recorded'", () => {
  const T = (liveRow, feed = FEED.OK) => trackForecast(TD, { gamePhase: "FINAL", feed, liveRow, nowMs: NOW }).status;
  // No producer file (the dispatch-only free capture never ran): nothing was measured.
  assert.equal(T(null, FEED.UNAVAILABLE), "Final · touchdown not measured · grading pending");
  assert.equal(T(null, FEED.OK), "Final · touchdown not measured · grading pending");
  // PIT @ CLE 2026-10-01: the file froze in Q2 with TD 0 for players ESPN's final credits with a TD.
  const q2 = { live: { phase: "IN_PROGRESS", statValue: 0, observedAt: "2026-10-02T00:57:06Z" }, settlement: { state: "PENDING", finalStat: null } };
  assert.equal(T(q2), "Final · no TD at last measurement · grading pending");
  assert.doesNotMatch(T(q2), /no TD recorded/, "a Q2 zero must never be presented as the game's record");
  // A read taken at the final, or an owner-written final stat, does support the claim.
  assert.equal(T({ live: { phase: "FINAL", statValue: 0, observedAt: "2026-10-02T03:31:00Z" }, settlement: { state: "PENDING", finalStat: null } }), "Final · no TD recorded · grading pending");
  assert.equal(T(lr(0, "2026-10-02T03:31:00Z", 0)), "Final · no TD recorded · grading pending");
  // A touchdown seen at any read is a fact.
  assert.equal(T({ ...q2, live: { ...q2.live, statValue: 1 } }), "Final · touchdown scored · grading pending");
});

test("🔴 the rendered TD row's final words come from tdFinal — a missing read never renders 'No TD recorded'", async () => {
  const React = (await import("react")).default;
  globalThis.React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: Row } = await import("../../components/live/featured-forecast-row.tsx");
  const f = { ...TD, playerName: "Jaylen Warren", team: "PIT", label: "Anytime TD", portraitUrl: null };
  const html = (liveRow) => renderToStaticMarkup(React.createElement(Row, { f, t: trackForecast(TD, { gamePhase: "FINAL", feed: FEED.UNAVAILABLE, liveRow, nowMs: NOW }), final: true }));
  const none = html(null);
  assert.match(none, />Not measured</);
  assert.doesNotMatch(none, /No TD recorded/);
  const q2 = html({ live: { phase: "IN_PROGRESS", statValue: 0, observedAt: "2026-10-02T00:57:06Z" }, settlement: { state: "PENDING", finalStat: null } });
  assert.match(q2, />No TD at last measurement</);
  assert.match(html(lr(0, "2026-10-02T03:31:00Z", 0)), />No TD recorded</);
});

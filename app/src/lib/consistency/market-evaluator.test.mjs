/**
 * The one over/under evaluator. Run: npx tsx --test src/lib/consistency/market-evaluator.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { LEAN, LEAN_RULE, WITHHELD, decimalFromAmerican, evaluateMarket, lineProbabilities } from "./market-evaluator.mjs";
import { nbaOfficialSnapshot, nflOfficialSnapshot } from "./official-snapshot.mjs";
import { normCdf } from "../v2-candidate-gates.ts";
import { NBA_ID, NFL_ID, nbaArtifact, nflBoard, nflReceipt, receiptsOf } from "./__fixtures__/synthetic.mjs";

const snap = nflOfficialSnapshot(NFL_ID, { receipts: receiptsOf(nflReceipt()), playerBoard: { doc: nflBoard() } });
const NOW = "2026-11-01T17:10:00Z";
const CAP = "2026-11-01T16:00:00Z";
const base = { snapshot: snap, playerId: "nfl-athlete-100", family: "player_reception_yds", book: "dk", capturedAt: CAP, now: NOW };
const close = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test("push is exact for empirical and bernoulli distributions", () => {
  const emp = { kind: "empirical", support: [{ value: 9, probability: 0.2 }, { value: 10, probability: 0.5 }, { value: 11, probability: 0.3 }] };
  assert.deepEqual(lineProbabilities(emp, 10), { pOver: 0.3, pUnder: 0.2, pPush: 0.5, method: "empirical-exact" });
  const r = lineProbabilities(emp, 10.5);
  close(r.pOver, 0.3); close(r.pUnder, 0.7); assert.equal(r.pPush, 0);
  assert.deepEqual(lineProbabilities({ kind: "bernoulli", p: 0.31 }, 0.5), { pOver: 0.31, pUnder: 0.69, pPush: 0, method: "bernoulli-exact" });
  const yesAtOne = lineProbabilities({ kind: "bernoulli", p: 0.31 }, 1);
  assert.equal(yesAtOne.pPush, 0.31);
  assert.equal(yesAtOne.pOver, 0);
});

test("continuity rule on integer-support continuous distributions", () => {
  const n = { kind: "normal", mean: 10, sd: 2 };
  const whole = lineProbabilities(n, 10);
  close(whole.pPush, normCdf(0.25) - normCdf(-0.25));
  close(whole.pOver, 1 - normCdf(0.25));
  close(whole.pUnder, normCdf(-0.25));
  close(whole.pOver + whole.pUnder + whole.pPush, 1);
  const half = lineProbabilities(n, 10.5);
  assert.equal(half.pPush, 0);
  close(half.pOver, whole.pOver, 1e-12);
  const cont = lineProbabilities(n, 10, { support: "continuous" });
  assert.equal(cont.pPush, 0);
  close(cont.pOver, 0.5, 1e-7);
  // quantiles: exact at a stored point, monotone, mass sums to 1
  const q = { kind: "quantiles", points: [{ q: 0.1, v: 2 }, { q: 0.5, v: 5 }, { q: 0.9, v: 9 }], lowerBound: 0 };
  close(lineProbabilities(q, 4.5).pUnder, 0.1 + 0.4 * (2.5 / 3));
  const lines = [0.5, 1.5, 3, 5.5, 8, 9.5, 12, 30];
  let prev = 1;
  for (const l of lines) { const r = lineProbabilities(q, l); close(r.pOver + r.pUnder + r.pPush, 1, 1e-12); assert.ok(r.pOver <= prev + 1e-15); prev = r.pOver; }
});

test("no-vig, edge and EV are exact and price-aware", () => {
  const e = evaluateMarket({ ...base, line: 47.5, overAmerican: -110, underAmerican: -110 });
  close(e.implied.rawOver, 110 / 210); close(e.implied.noVigOver, 0.5); close(e.implied.noVigUnder, 0.5);
  close(e.edge.over, e.decisive.over - 0.5);
  close(e.ev.over, e.pOver * (decimalFromAmerican(-110) - 1) - e.pUnder);
  const f = evaluateMarket({ ...base, line: 47.5, overAmerican: -150, underAmerican: 130 });
  const ro = 150 / 250; const ru = 100 / 230;
  close(f.implied.noVigOver, ro / (ro + ru)); close(f.implied.noVigUnder, ru / (ro + ru));
  assert.equal(decimalFromAmerican(130), 2.3);
});

test("identical inputs never give a different lean (deterministic, order-free)", () => {
  const inputs = [];
  for (const line of [30.5, 40.5, 47.5, 55.5, 70.5]) for (const [o, u] of [[-110, -110], [-140, 120], [125, -145], [-250, 200]]) inputs.push({ ...base, line, overAmerican: o, underAmerican: u });
  const first = inputs.map((i) => evaluateMarket(i));
  const second = inputs.slice().reverse().map((i) => evaluateMarket(i)).reverse();
  assert.deepEqual(second, first);
  for (const e of first) {
    if (e.lean === LEAN.OVER) { assert.ok(e.ev.over >= LEAN_RULE.minEv && e.edge.over >= LEAN_RULE.minEdge); }
    if (e.lean === LEAN.UNDER) { assert.ok(e.ev.under >= LEAN_RULE.minEv && e.edge.under >= LEAN_RULE.minEdge); }
  }
});

test("projection below the line with a juiced UNDER price is not forced to UNDER", () => {
  // median 47.5 < line 50.5, but the book prices the under at -400 (implied 80%): the model's ~55% under is no value.
  const e = evaluateMarket({ ...base, line: 50.5, overAmerican: 300, underAmerican: -400 });
  assert.ok(e.projection.median < 50.5);
  assert.ok(e.pUnder > e.pOver, "the model does favour the under…");
  assert.notEqual(e.lean, LEAN.UNDER, "…but the price does not support it");
  assert.equal(e.lean, e.ev.over >= LEAN_RULE.minEv && e.edge.over >= LEAN_RULE.minEdge ? LEAN.OVER : LEAN.NONE);
});

test("stale, future, post-lock and one-sided prices force NONE with a reason", () => {
  const ok = { ...base, line: 30.5, overAmerican: -110, underAmerican: -110 };
  assert.notEqual(evaluateMarket(ok).lean, LEAN.NONE, "fixture leans when the price is fresh");
  const stale = evaluateMarket({ ...ok, capturedAt: "2026-10-31T01:00:00Z" });
  assert.equal(stale.lean, LEAN.NONE); assert.ok(stale.withheldReasons.includes(WITHHELD.PRICE_STALE));
  const future = evaluateMarket({ ...ok, capturedAt: "2026-11-01T17:20:00Z" });
  assert.equal(future.lean, LEAN.NONE); assert.ok(future.withheldReasons.includes(WITHHELD.PRICE_FROM_FUTURE));
  const afterLock = evaluateMarket({ ...ok, now: "2026-11-01T18:01:00Z", capturedAt: "2026-11-01T18:00:30Z" });
  assert.equal(afterLock.lean, LEAN.NONE); assert.ok(afterLock.withheldReasons.includes(WITHHELD.EVALUATED_AFTER_LOCK)); assert.ok(afterLock.withheldReasons.includes(WITHHELD.PRICE_AFTER_LOCK));
  const oneSided = evaluateMarket({ ...ok, underAmerican: null });
  assert.equal(oneSided.lean, LEAN.NONE); assert.ok(oneSided.withheldReasons.includes(WITHHELD.ONE_SIDED_PRICE));
  const noTime = evaluateMarket({ ...ok, capturedAt: null });
  assert.equal(noTime.lean, LEAN.NONE); assert.ok(noTime.withheldReasons.includes(WITHHELD.NO_CAPTURE_TIME));
  const silly = evaluateMarket({ ...ok, overAmerican: 200, underAmerican: 200 });
  assert.equal(silly.lean, LEAN.NONE); assert.ok(silly.withheldReasons.includes(WITHHELD.PRICE_IMPLAUSIBLE));
  const noClock = evaluateMarket({ ...ok, now: undefined });
  assert.equal(noClock.lean, LEAN.NONE); assert.ok(noClock.withheldReasons.includes(WITHHELD.NO_EVALUATION_TIME));
});

test("qualification never changes the lean, only whether it is qualified", () => {
  const est = evaluateMarket({ ...base, playerId: "nfl-athlete-200", family: "player_pass_yds", line: 200.5, overAmerican: -110, underAmerican: -110 });
  assert.ok(est.withheldReasons.includes(WITHHELD.FAMILY_NOT_PUBLISHED));
  assert.equal(est.eligibility.qualified, false);
  assert.equal(est.eligibility.blocking.length, 0);
  assert.notEqual(est.lean, LEAN.NONE, "the model view stays visible");
});

test("subjects resolve by id only; a name, an unknown family or a missing line are reasons", () => {
  const byName = evaluateMarket({ ...base, playerId: "Alex Same", line: 40.5, overAmerican: -110, underAmerican: -110 });
  assert.deepEqual(byName.withheldReasons.slice(0, 1), [WITHHELD.SUBJECT_NOT_IN_SNAPSHOT]);
  assert.equal(byName.pOver, null);
  assert.ok(evaluateMarket({ ...base, family: "player_rush_yds", line: 40.5 }).withheldReasons.includes(WITHHELD.FAMILY_NOT_IN_SNAPSHOT));
  assert.ok(evaluateMarket({ ...base, line: null }).withheldReasons.includes(WITHHELD.NO_LINE));
  assert.ok(evaluateMarket({ ...base, snapshot: null, line: 1 }).withheldReasons.includes(WITHHELD.NO_SNAPSHOT));
});

test("game markets: total, team total and spread from the official game distribution", () => {
  const tot = evaluateMarket({ ...base, playerId: null, family: "game_total", line: 44.5, overAmerican: -110, underAmerican: -110 });
  close(tot.pOver, 1 - normCdf((44.5 - 44.2) / 13.3));
  const spreadHome = evaluateMarket({ ...base, playerId: null, team: "HOM", family: "spread", line: -2.5, overAmerican: -110, underAmerican: -110 });
  close(spreadHome.pOver, 1 - normCdf((2.5 - 3.4) / 13));
  const spreadAway = evaluateMarket({ ...base, playerId: null, team: "AWY", family: "spread", line: 2.5, overAmerican: -110, underAmerican: -110 });
  close(spreadAway.pOver, spreadHome.pUnder, 1e-12);
  const tt = evaluateMarket({ ...base, playerId: null, team: "home", family: "team_total", line: 23.5, overAmerican: -110, underAmerican: -110 });
  assert.equal(tt.identity.subjectId, "HOM");
});

test("NBA: private snapshots evaluate but are never qualified; empirical totals are exact", () => {
  const s = nbaOfficialSnapshot(NBA_ID, nbaArtifact());
  const e = evaluateMarket({ snapshot: s, family: "game_total", line: 221, overAmerican: -110, underAmerican: -110, capturedAt: "2026-11-01T11:00:00Z", now: "2026-11-01T12:30:00Z" });
  assert.equal(e.pPush, 0.2);
  assert.ok(e.withheldReasons.includes(WITHHELD.PUBLICATION_PRIVATE));
  assert.equal(e.eligibility.qualified, false);
  assert.equal(e.eligibility.publication, "PRIVATE");
});

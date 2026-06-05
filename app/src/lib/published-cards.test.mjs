/**
 * Tests for published-cards selection (`published-cards.ts`).
 * Locks: single-sport vs mixed selection, All = deduped union of displayed
 * children (All ⊇ every child), no duplicate slips, no fabrication.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  selectPublishedSections,
  countPublishedSections,
  availablePublishedViews,
} from "./published-cards.ts";

let _id = 0;
function mk(sport, n = 2) {
  // a slip whose legs are all `sport` (single) — distinct ids each call
  const id = `slip${_id++}`;
  const legs = Array.from({ length: n }, () => {
    _id++;
    return { sport, playerId: _id, playerName: `P${_id}`, market: `m${_id}`, gameId: `g${_id}` };
  });
  return { slipId: id, legs };
}
function mkMixed() {
  const id = `mix${_id++}`;
  _id++; const a = { sport: "mlb", playerId: _id, playerName: `M${_id}`, market: `mm${_id}`, gameId: `mg${_id}` };
  _id++; const b = { sport: "nba", playerId: _id, playerName: `N${_id}`, market: `nm${_id}`, gameId: "NBA_GAME" };
  return { slipId: id, legs: [a, b] };
}

// publicRiskSections-shaped fixture: plenty of mlb, some nba, several mixed.
function fixture() {
  const sec = () => ({
    mlb: [mk("mlb"), mk("mlb"), mk("mlb"), mk("mlb"), mk("mlb"), mk("mlb")],
    nba: [mk("nba"), mk("nba")],
    multi: [mkMixed(), mkMixed(), mkMixed(), mkMixed()],
    all: [], // helper derives 'all' as the union — stored all is ignored
  });
  return { low: sec(), medium: sec(), high: sec(), longshot: sec() };
}

const RISKS = ["low", "medium", "high", "longshot"];
function slipKeyOf(s) {
  return (s.legs || []).map((l) => `${l.playerId}|${l.market}|${l.gameId}`).sort().join(";");
}
function noDupes(sections) {
  for (const r of RISKS) {
    const keys = (sections[r] || []).map(slipKeyOf);
    assert.equal(new Set(keys).size, keys.length, `no duplicate slips in ${r}`);
  }
}

test("single-sport view returns only that sport, disciplined + no dupes", () => {
  const psr = fixture();
  const mlb = selectPublishedSections(psr, "mlb");
  noDupes(mlb);
  // every leg is mlb
  for (const r of RISKS) for (const s of mlb[r]) assert.ok(s.legs.every((l) => l.sport === "mlb"));
  // deeper publishing: with 6 mlb/section and caps low5/med5/high3/longshot2 → 15 total
  assert.equal(countPublishedSections(mlb), 5 + 5 + 3 + 2);
});

test("mixed view returns mixed slips even though they share an NBA game", () => {
  const psr = fixture();
  const mixed = selectPublishedSections(psr, "multi");
  noDupes(mixed);
  const total = countPublishedSections(mixed);
  assert.ok(total >= 10, `mixed should publish a healthy set, got ${total}`);
  // every mixed slip really spans two sports
  for (const r of RISKS) for (const s of mixed[r]) {
    const sports = new Set(s.legs.map((l) => l.sport));
    assert.ok(sports.size > 1, "mixed slip spans >1 sport");
  }
});

test("All = deduped union of displayed children; All ⊇ every child", () => {
  const psr = fixture();
  const all = selectPublishedSections(psr, "all");
  const mlb = selectPublishedSections(psr, "mlb");
  const nba = selectPublishedSections(psr, "nba");
  const multi = selectPublishedSections(psr, "multi");
  noDupes(all);
  for (const r of RISKS) {
    const allKeys = new Set(all[r].map(slipKeyOf));
    for (const child of [mlb, nba, multi]) {
      for (const s of child[r]) {
        assert.ok(allKeys.has(slipKeyOf(s)), `All[${r}] must contain every displayed child slip`);
      }
    }
  }
  // All count == union size of children (no fabrication beyond the union)
  const unionKeys = new Set();
  for (const r of RISKS) for (const child of [mlb, nba, multi]) for (const s of child[r]) unionKeys.add(slipKeyOf(s));
  const allCount = RISKS.reduce((n, r) => n + all[r].length, 0);
  assert.equal(allCount, unionKeys.size);
});

test("availablePublishedViews counts each view; all ≥ each child", () => {
  const counts = availablePublishedViews(fixture());
  assert.ok(counts.mlb > 0 && counts.nba > 0 && counts.multi > 0);
  assert.ok(counts.all >= counts.mlb && counts.all >= counts.nba && counts.all >= counts.multi);
});

test("no fabrication: empty / null sections → empty output", () => {
  assert.equal(countPublishedSections(selectPublishedSections(null, "all")), 0);
  assert.equal(countPublishedSections(selectPublishedSections({}, "mlb")), 0);
  const onlyNba = { low: { nba: [mk("nba")], mlb: [], multi: [], all: [] } };
  assert.equal(countPublishedSections(selectPublishedSections(onlyNba, "mlb")), 0);
  assert.equal(countPublishedSections(selectPublishedSections(onlyNba, "nba")), 1);
});

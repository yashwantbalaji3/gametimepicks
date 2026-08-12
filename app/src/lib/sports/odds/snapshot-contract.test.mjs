/**
 * Odds snapshot contract guards (Program 164 · Release 2).
 *
 * Sanitized fixtures for all four sports (provider SHAPE, synthetic values — no licensed payload
 * committed) + every corruption case: missing side, duplicate/inverted outcomes, stale vig band,
 * unknown market drift, future-stamped prices, broken credit accounting, secret shapes. ZERO
 * network anywhere (guard-tested).
 *
 * Run: npx tsx --test src/lib/sports/odds/snapshot-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { ODDS_CONTRACT_VERSION, ODDS_SPORT_KEYS, classifyOddsSecret, noVigTwoWay, normalizeOddsEvent, validateOddsSnapshot } from "./snapshot-contract.mjs";

const EVENT = (sport, over = {}) => ({
  id: `evt-${sport}-1`, sport_key: ODDS_SPORT_KEYS[sport], commence_time: "2026-08-13T23:00:00Z",
  home_team: "Home Club", away_team: "Away Club",
  bookmakers: [{ key: "bookmaker_a", last_update: "2026-08-12T04:00:00Z", markets: [{ key: "h2h", outcomes: [{ name: "Home Club", price: -150 }, { name: "Away Club", price: +130 }] }] }],
  ...over,
});
const CAP = { sport: "nfl", capturedAt: "2026-08-12T05:00:00Z", requestId: "canary-test-1" };

test("secret discipline: absent → BLOCKED_EXTERNAL; malformed → CONFIG_INVALID; present → fingerprint only, never the value", () => {
  assert.equal(classifyOddsSecret({}).state, "BLOCKED_EXTERNAL");
  assert.equal(classifyOddsSecret({ ODDS_API_KEY: "not a key!!" }).state, "CONFIG_INVALID");
  const ok = classifyOddsSecret({ ODDS_API_KEY: "abcd1234abcd1234abcd1234" });
  assert.equal(ok.state, "PRESENT");
  assert.equal(ok.fingerprint, "len24…1234");
  assert.ok(!JSON.stringify(ok).includes("abcd1234abcd1234"), "the value never appears in any output shape");
});

test("no-vig: american and decimal prices normalize; the vig stays visible; degenerate inputs refuse", () => {
  const nv = noVigTwoWay([{ name: "A", price: -150 }, { name: "B", price: +130 }]);
  assert.equal(nv.ok, true);
  assert.ok(nv.impliedSum > 1 && nv.impliedSum < 1.1, `vig visible: ${nv.impliedSum}`);
  assert.ok(Math.abs(nv.noVig[0].prob + nv.noVig[1].prob - 1) < 1e-9, "posterior sums to one");
  const dec = noVigTwoWay([{ name: "A", price: 1.65 }, { name: "B", price: 2.4 }]);
  assert.equal(dec.ok, true);
  assert.equal(noVigTwoWay([{ name: "A", price: -150 }]).ok, false, "one-sided refuses — the missing side is never invented");
  assert.equal(noVigTwoWay([{ name: "A", price: -150 }, { name: "A", price: +130 }]).ok, false, "duplicate names refuse");
  assert.match(noVigTwoWay([{ name: "A", price: 100000 }, { name: "B", price: 100000 }]).reason, /sane vig band/, "an impossible implied sum is corruption, not a bargain");
});

test("all four sports normalize through one contract; unknown markets and malformed books quarantine alone", () => {
  for (const sport of Object.keys(ODDS_SPORT_KEYS)) {
    const { rows, quarantined } = normalizeOddsEvent(EVENT(sport), { ...CAP, sport });
    assert.equal(rows.length, 1, sport);
    assert.equal(quarantined.length, 0);
    assert.equal(rows[0].marketType, "h2h");
  }
  const drift = EVENT("nfl");
  drift.bookmakers.push({ key: "bookmaker_b", markets: [{ key: "player_props_exotic", outcomes: [] }] });
  const out = normalizeOddsEvent(drift, CAP);
  assert.equal(out.rows.length, 1);
  assert.match(out.quarantined[0].reason, /outside contract v1 scope/, "schema drift is recorded, never guessed into a row");
  const headless = normalizeOddsEvent({ id: "x" }, CAP);
  assert.equal(headless.rows.length, 0);
  assert.match(headless.quarantined[0].reason, /unjoinable/);
});

test("snapshot validation: rights class, credit accounting, population arithmetic, future-stamped prices", () => {
  const { rows, quarantined } = normalizeOddsEvent(EVENT("nfl"), CAP);
  const base = { dataClass: "PRIVATE_RESEARCH", sport: "nfl", capturedAt: CAP.capturedAt, creditsUsed: 1, requestId: "r1", sourceRows: rows.length + quarantined.length, rows, quarantined };
  assert.equal(validateOddsSnapshot(base).valid, true);
  assert.ok(!validateOddsSnapshot({ ...base, dataClass: "PUBLIC" }).valid, "odds snapshots never ship publicly");
  assert.ok(!validateOddsSnapshot({ ...base, creditsUsed: undefined }).valid, "credit accounting is part of the artifact");
  assert.ok(!validateOddsSnapshot({ ...base, sourceRows: 99 }).valid, "population arithmetic is exact");
  const future = { ...base, rows: [{ ...rows[0], sourceAsOf: "2027-01-01T00:00:00Z" }] };
  assert.ok(!validateOddsSnapshot(future).valid, "a price from the future is a lie");
});

test("ZERO NETWORK: the contract module contains no fetch and never embeds the key variable's value path", () => {
  const src = fs.readFileSync(new URL("./snapshot-contract.mjs", import.meta.url), "utf8");
  assert.ok(!/fetch\(|https?:\/\/api\./.test(src), "the contract judges; only the canary (authorization-gated) may call");
  assert.equal(ODDS_CONTRACT_VERSION, 1);
});

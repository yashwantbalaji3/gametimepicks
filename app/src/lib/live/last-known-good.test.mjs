/**
 * §9 — A PROVIDER FAILURE MUST NEVER MOVE A GAME BACKWARDS.
 *
 * Reproduced first, and only half of the filed defect reproduces: a refused feed with no envelope
 * yields UNKNOWN, never PRE (fixed in #705). What DOES reproduce is the information loss — a 503
 * mid-game rendered "Status unknown" and dropped BUF 21 - DET 17 / Q3 08:42, because
 * `derivePresentationState` is memoryless. The existing reason code names the gap:
 * `FEED_REFUSED_NO_PRIOR_STATE`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { CARRY, FEED_STATE, carryLastKnownGood, noticeFor } from "./last-known-good.mjs";
import { derivePresentationState } from "./lifecycle.mjs";

const ASOF = "2026-09-27T21:00:00Z";
const STALE_AFTER = 120_000;

const env = (state, extra = {}) => ({ state, observedAt: "2026-09-27T20:58:00Z", ...extra });
const LIVE = env("LIVE", { period: 3, clock: "08:42", away: { abbr: "BUF", score: 21 }, home: { abbr: "DET", score: 17 } });
const carry = (args) => carryLastKnownGood({ asOf: ASOF, staleAfterMs: STALE_AFTER, ...args });

test("the filed PRE regression does NOT reproduce — stating that rather than implying a fix", () => {
  const p = derivePresentationState({ envelope: null, feedState: "REFUSED" });
  assert.equal(p.state, "UNKNOWN");
  assert.notEqual(p.state, "PRE", "a refused feed already never reads as Starting Soon");
});

test("🔴 a 503 mid-game keeps the score and the clock, with a notice and an age", () => {
  const r = carry({ current: null, lastGood: LIVE, feedState: FEED_STATE.UNAVAILABLE });
  assert.equal(r.decision, CARRY.CARRIED);
  assert.equal(r.envelope.state, "LIVE", "the game did not stop being live because we could not read it");
  assert.equal(r.envelope.away.score, 21);
  assert.equal(r.envelope.home.score, 17);
  assert.equal(r.envelope.clock, "08:42");
  assert.equal(r.notice.kind, "FEED_UNAVAILABLE");
  assert.match(r.notice.detail, /2m ago/);
  assert.equal(r.retryAvailable, true);
});

test("⚠ the carried envelope is returned VERBATIM — nothing advances a clock or a score", () => {
  /* §9: "Do not invent continued clock/stat movement while stale." An interpolated clock would be a
     fabricated observation. */
  const r = carry({ current: null, lastGood: LIVE, feedState: FEED_STATE.UNAVAILABLE });
  assert.equal(r.envelope, LIVE, "the same object, not a copy with a moved clock");
  const src = fs.readFileSync(new URL("./last-known-good.mjs", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of [/\bperiod\s*\+/, /\bscore\s*\+/, /clock\s*=/, /setInterval/, /Date\.now\(\)/]) {
    assert.doesNotMatch(code, forbidden, `the carry must contain no clock/stat arithmetic: ${forbidden}`);
  }
});

test("EXHAUSTIVE: no started state is ever replaced by a not-started one", () => {
  /* The invariant §9 actually asks for, over every pair rather than over an example. */
  const started = ["LIVE", "DELAYED", "FINAL"];
  const notStarted = ["PRE", "UNKNOWN"];
  for (const prior of started) {
    for (const fresh of notStarted) {
      for (const feedState of Object.values(FEED_STATE)) {
        const r = carry({ current: env(fresh), lastGood: env(prior), feedState });
        assert.equal(r.envelope.state, prior, `${prior} + fresh ${fresh} (${feedState}) regressed to ${r.envelope.state}`);
        assert.notEqual(r.envelope.state, "PRE");
      }
    }
  }
});

test("EXHAUSTIVE: a real forward transition is never blocked", () => {
  /* The other half. A guard that froze a game at LIVE forever would be its own defect. */
  const forward = [["PRE", "LIVE"], ["LIVE", "FINAL"], ["DELAYED", "LIVE"], ["LIVE", "DELAYED"], ["PRE", "POSTPONED"], ["LIVE", "FINAL"]];
  for (const [prior, fresh] of forward) {
    const r = carry({ current: env(fresh), lastGood: env(prior), feedState: FEED_STATE.OK });
    assert.equal(r.decision, CARRY.FRESH, `${prior} → ${fresh} was blocked`);
    assert.equal(r.envelope.state, fresh);
  }
});

test("a provider answering 200 with an earlier state is named for what it is", () => {
  /*
   * ⚠ MY OWN BUG, AND IT MISDIRECTED. `null` was in the not-started set, so a plain 503 reported
   * "Live feed returned an earlier state" — pointing an operator at the provider during a transport
   * outage. A failed read and a self-contradicting provider are different subsystems.
   */
  const regressed = carry({ current: env("PRE"), lastGood: LIVE, feedState: FEED_STATE.OK });
  assert.equal(regressed.notice.kind, "PROVIDER_REGRESSED");

  const outage = carry({ current: null, lastGood: LIVE, feedState: FEED_STATE.UNAVAILABLE });
  assert.equal(outage.notice.kind, "FEED_UNAVAILABLE", "a transport failure must not accuse the provider");
  assert.notEqual(outage.notice.kind, regressed.notice.kind);
});

test("nothing prior means NOTHING_KNOWN — never an invented PRE", () => {
  const r = carry({ current: null, lastGood: null, feedState: FEED_STATE.UNAVAILABLE });
  assert.equal(r.decision, CARRY.NOTHING_KNOWN);
  assert.equal(r.envelope, null);
  assert.equal(r.notice.kind, "FEED_UNAVAILABLE");
});

test("an unknown observation age SAYS SO rather than claiming 0m", () => {
  const r = carry({ current: null, lastGood: { state: "LIVE" }, feedState: FEED_STATE.UNAVAILABLE });
  assert.equal(r.ageMs, null);
  assert.match(r.notice.detail, /time unknown/i);
  assert.doesNotMatch(r.notice.detail, /0s ago|0m ago/, '"0m ago" is a confident claim about a timestamp we could not read');
});

test("staleAfterMs is required — staleness has no safe default", () => {
  assert.throws(() => carryLastKnownGood({ current: null, lastGood: LIVE, feedState: FEED_STATE.UNAVAILABLE, asOf: ASOF }),
    /staleAfterMs is required/);
});

test("ACROSS SPORTS: the rule is about states, so one envelope shape serves all three", () => {
  /* §9 asks for NFL 503, MLB provider failure and UFC provider failure. The carry is sport-neutral by
     construction — it reads `state` and a timestamp and nothing sport-specific — so the three cases
     are the same case, and proving it on three differently-shaped envelopes says so honestly. */
  const nfl = env("LIVE", { period: 3, clock: "08:42", away: { abbr: "BUF", score: 21 }, home: { abbr: "DET", score: 17 } });
  const mlb = env("LIVE", { inning: 7, half: "top", away: { abbr: "NYM", score: 2 }, home: { abbr: "ATL", score: 4 } });
  const ufc = env("LIVE", { round: 2, bout: "main", fighters: ["A", "B"] });
  for (const [sport, e] of [["nfl", nfl], ["mlb", mlb], ["ufc", ufc]]) {
    const r = carry({ current: null, lastGood: e, feedState: FEED_STATE.UNAVAILABLE });
    assert.equal(r.decision, CARRY.CARRIED, sport);
    assert.equal(r.envelope, e, `${sport}: carried verbatim`);
    assert.equal(r.notice.kind, "FEED_UNAVAILABLE", sport);
  }
});

test("noticeFor covers every feed state, and OK has nothing to say", () => {
  for (const fs of [FEED_STATE.UNAVAILABLE, FEED_STATE.STALE, FEED_STATE.NOT_ASKED]) {
    const n = noticeFor({ feedState: fs, ageMs: 60_000 });
    assert.ok(n?.headline, `${fs} has no headline`);
  }
  assert.equal(noticeFor({ feedState: FEED_STATE.OK, ageMs: 0 }), null, "a healthy feed needs no notice");
});

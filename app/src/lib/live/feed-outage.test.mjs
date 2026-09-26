/**
 * §9: A PROVIDER FAILURE MUST NEVER TURN KNOWN LIVE OR FINAL STATE BACK INTO SCHEDULED.
 *
 * 🔴 THE DEFECT. `derivePresentationState` returned `PRE` whenever there was no envelope, for two
 * very different reasons sharing one branch: live being OFF (honest — the page is a forecast page)
 * and a feed that was ASKED and REFUSED (not honest). On a first load during an outage the hub has
 * no envelope for any game, so a game that started two hours ago rendered "Scheduled".
 *
 * The mirror rule is already enforced on that page for the other direction — a static page may not
 * assert "live" either. "Status unknown" is the only honest answer when we asked and were refused.
 *
 * ⚠ WHAT WAS ALREADY RIGHT, and is pinned here so a later change cannot quietly lose it: once ONE
 * good read has landed, both hooks keep it and let it age. A later refusal never blanks what is
 * already known. The defect was only ever the no-prior-state case.
 *
 * Run: cd app && npx tsx --test src/lib/live/feed-outage.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { derivePresentationState } from "./lifecycle.mjs";

const APP = process.cwd();
const env = (state, extra = {}) => ({ state, competitors: { away: { score: 3 }, home: { score: 1 } }, ...extra });

test("🔴 §9 · a refused feed with no prior state is UNKNOWN, never PRE", () => {
  const out = derivePresentationState({ envelope: null, feedState: "REFUSED" });
  assert.equal(out.state, "UNKNOWN");
  assert.equal(out.label, "Status unknown");
  assert.equal(out.reason, "FEED_REFUSED_NO_PRIOR_STATE");
  assert.notEqual(out.state, "PRE", 'a game that started two hours ago must not read "Scheduled"');
  /* The forecast half is unaffected — an outage degrades Live, never the product. */
  assert.equal(out.showsFrozenForecast, true);
  assert.equal(out.pollingAllowed, true, "and we should keep trying");
});

test("live being OFF still reads as the schedule says — this is not the same situation", () => {
  for (const feedState of [undefined, "NOT_ASKED"]) {
    const out = derivePresentationState({ envelope: null, feedState });
    assert.equal(out.state, "PRE");
    assert.equal(out.reason, "NO_LIVE_STATE");
  }
});

test("🔴 §9 · a KNOWN state survives a refusal — the envelope outranks the outage", () => {
  /* The hooks keep the last good envelope, so this is the case that actually happens mid-session. */
  for (const [provider, expected] of [["LIVE", "LIVE"], ["FINAL", "FINAL_PENDING_SETTLEMENT"], ["DELAYED", "DELAYED"]]) {
    const out = derivePresentationState({ envelope: env(provider), feedState: "REFUSED" });
    assert.equal(out.state, expected, `${provider} regressed during an outage`);
  }
  /* And settlement still outranks everything. */
  assert.equal(derivePresentationState({ envelope: env("FINAL"), settlement: {}, feedState: "REFUSED" }).state, "SETTLED");
});

test("a postponed or cancelled game is not resurrected by an outage", () => {
  for (const s of ["POSTPONED", "CANCELLED"]) {
    assert.equal(derivePresentationState({ envelope: env(s), feedState: "REFUSED" }).state, s);
  }
});

test("🔴 the hooks keep the last good payload across a failure — asserted on the source", () => {
  /*
   * Behavioural proof would need a DOM and a fake fetch; the property is structural and small:
   * neither failure path may clear the state that holds what we already knew.
   */
  const slate = fs.readFileSync(path.join(APP, "src/components/live/use-live-slate.ts"), "utf8");
  const evt = fs.readFileSync(path.join(APP, "src/components/live/use-live-event.ts"), "utf8");
  for (const [name, src, setter] of [["slate", slate, "setByGamePk"], ["event", evt, "setEnvelope"]]) {
    const failure = src.slice(src.indexOf("} catch"), src.indexOf("} finally"));
    assert.equal(failure.includes(`${setter}(null)`), false, `${name} hook blanks its state on failure`);
    assert.equal(failure.includes(`${setter}({})`), false, `${name} hook blanks its state on failure`);
  }
  /* A typed refusal must not blank it either. */
  const refusal = slate.slice(slate.indexOf("if (isUnavailable(body))"), slate.indexOf("} else if"));
  assert.equal(refusal.includes("setByGamePk"), false, "a refusal must not clear the last good slate");
});

test("the hub tells the lifecycle function which situation it is in", () => {
  const hub = fs.readFileSync(path.join(APP, "src/components/live/live-hub.tsx"), "utf8");
  assert.match(hub, /feedState:\s*unavailable\s*\?\s*"REFUSED"\s*:\s*"NOT_ASKED"/,
    "the hub knows whether it was refused; the pure function cannot");
  /* ⚠ And the grouping must recompute when the feed fails, or the fix never reaches the screen. */
  const memoDeps = hub.slice(hub.indexOf("out[hubGroupFor("), hub.indexOf("out[hubGroupFor(") + 400);
  assert.match(memoDeps, /\[roster\.games, byGamePk, unavailable\]/,
    "a memo that ignores `unavailable` would keep rendering the pre-outage grouping");
});

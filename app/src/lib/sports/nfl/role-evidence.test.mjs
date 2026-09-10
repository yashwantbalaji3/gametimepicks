/**
 * Release A guards (Program 175): the role refusal is EVIDENCED per player, the sources' limits
 * are committed, and no path converts missing data into health, usage, or certainty.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const ev = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/nfl/role-evidence/latest.json"), "utf8"));
const src = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-role-evidence.mjs"), "utf8");

test("the artifact is event-bound, private, and reconciles", () => {
  assert.equal(ev.dataClass, "PRIVATE_RESEARCH");
  assert.equal(ev.accounting.exact, true);
  /* P244: the weekly window can open days before an actives source exists — the builder then
     writes an EMPTY, exactly-accounted artifact (eventsInWindow 0) rather than inventing roles.
     Zero events with exact accounting is that honest state; a non-empty artifact must classify. */
  if (ev.events.length === 0) {
    assert.equal(ev.accounting.eventsInWindow, 0, "an empty artifact must account for an empty window, not a dropped one");
    return;
  }
  for (const e of ev.events) {
    assert.ok(e.canonicalEventId && e.kickoffUtc && e.matchup);
    assert.equal(Object.keys(e.teams).length, 2, "both teams are classified");
    for (const t of Object.values(e.teams)) {
      assert.equal(t.accounting.exact, true, `${t.teamAbbr} population must reconcile`);
      const summed = Object.values(t.counts).reduce((a, b) => a + b, 0);
      assert.equal(summed, t.rosterSize, `${t.teamAbbr}: every rostered player gets exactly one state`);
    }
  }
});

test("EVERY player carries a state from the closed set AND the evidence that produced it", () => {
  for (const e of ev.events) {
    for (const t of Object.values(e.teams)) {
      for (const p of t.players) {
        assert.ok(ev.states.includes(p.state), `${p.name}: ${p.state} outside the closed set`);
        assert.ok(p.because && p.because.length > 15, `${p.name}: a state without its reason is an assertion, not evidence`);
        assert.ok(p.playerId.startsWith("nfl-athlete-"), "joined by durable provider id, never a display name");
      }
    }
  }
});

test("ABSENCE IS NOT HEALTH — no player reaches ACTIVE_EXPECTED without an actives source", () => {
  assert.equal(ev.sources.gameDayActives.status, "UNSUPPORTED");
  assert.equal(ev.sources.gameDayActives.id, null);
  for (const e of ev.events) {
    for (const t of Object.values(e.teams)) {
      assert.equal(t.counts.ACTIVE_EXPECTED ?? 0, 0, "ACTIVE_EXPECTED is unreachable while no actives source exists");
    }
  }
  assert.match(src, /absence from an injury report is not evidence of health/);
  assert.match(src, /a roster spot is not evidence of playing time/);
});

test("the source contract commits what each source CANNOT establish", () => {
  for (const [name, s] of Object.entries(ev.sources)) {
    assert.ok(s.cannotEstablish, `${name} must state its limit`);
  }
  assert.match(ev.sources.injuries.cannotEstablish, /silence is not a clean bill/);
  assert.match(ev.sources.rosters.cannotEstablish, /how much he plays/);
  assert.ok(ev.sources.snapScripting.status === "UNSUPPORTED");
});

test("NOT_YET_PUBLISHED names a real window; UNSUPPORTED means no source exists — different answers", () => {
  assert.match(ev.honesty.join(" "), /they are different answers/);
  for (const e of ev.events) {
    assert.ok(e.nextObservationWindow && e.nextObservationWindow.length > 20, `${e.matchup} must name when evidence could arrive`);
    assert.ok(e.verdictReason && e.verdictReason.length > 20);
  }
});

test("a stale source degrades every player to SOURCE_STALE rather than silently trusting it", () => {
  /*
   * REBASED 2026-09-10 (P254d) — and the old version was vacuous before it ever failed.
   *
   * It compared the FIRST textual "SOURCE_STALE" — a header comment, far above any code — against
   * the first "BLOCKING.test(status)". A comment precedes all code, so the ordering held by
   * construction and never inspected control flow. Worse, the first blocking check it found was
   * P251's bounded CARRY, which by design runs BEFORE the staleness branches: for that branch its own
   * message ("freshness is checked BEFORE any designation is trusted") was false while it passed. It
   * failed only when the hand-written regex gave way to the contract predicate and its anchor string
   * disappeared.
   *
   * The invariant, stated against CODE: on a degraded feed a designation is trusted only through
   * P251's bounded carry, which precedes staleness; every other designation is decided AFTER both
   * staleness branches, so a stale read degrades rather than trusts. Each anchor must occur exactly
   * once, so a comment can never satisfy it.
   */
  assert.match(src, /silence from a stale feed proves nothing/);
  const orderHolds = (text) => {
    const at = (needle) => { const i = text.indexOf(needle); return i >= 0 && text.indexOf(needle, i + 1) < 0 ? i : -1; };
    const carry = at("feedDegraded && isBlockingStatus(status)");
    const rosterStale = at("because = `roster capture is");
    const injuryStale = at("because = `injury feed is");
    const freshBlocking = at("else if (isBlockingStatus(status))");
    if ([carry, rosterStale, injuryStale, freshBlocking].some((i) => i < 0)) return false;
    return carry < rosterStale && rosterStale < injuryStale && injuryStale < freshBlocking;
  };
  assert.ok(orderHolds(src), "bounded carry → roster staleness → injury staleness → fresh designation, each anchor exactly once");
  // Mutation probe: a fresh-path designation trusted ahead of the staleness branches must be rejected.
  const mutated = "feedDegraded && isBlockingStatus(status)\nelse if (isBlockingStatus(status))\nbecause = `roster capture is\nbecause = `injury feed is";
  assert.equal(orderHolds(mutated), false, "trusting a designation before the staleness branches would be caught");
});

test("today's real verdict withholds player families for every event, with reasons", () => {
  for (const e of ev.events) {
    assert.equal(e.familyVerdict, "ROLE_UNCERTAIN");
    assert.match(e.verdictReason, /withheld rather than invented|no event-bound active evidence/);
  }
  assert.equal(ev.freshness.rosters, "FRESH", "the refusal is NOT because our own data is stale");
  assert.equal(ev.freshness.injuries, "FRESH");
});

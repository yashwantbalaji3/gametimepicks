import test from "node:test";
import assert from "node:assert/strict";
import { ufcFightdayWatch, DEFAULT_LEAD_HOURS } from "./fightday-watch.mjs";

const CARD = { event: { providerEventId: "600060772", startUtc: "2026-09-12T18:00Z", name: "Noche UFC: Silva vs. Delgado", boutCount: 13 } };

test("this morning, replayed: the card fights in five hours and the odds describe last week's event", () => {
  const w = ufcFightdayWatch({ card: CARD, oddsEventId: "600059993", nowIso: "2026-09-12T13:12:00Z", ranToday: false });
  assert.equal(w.state, "UNPRICED");
  assert.equal(w.shouldDispatch, true);
  assert.ok(Math.abs(w.hoursToFirstBout - 4.8) < 0.1, `${w.hoursToFirstBout}h`);
  assert.match(w.reason, /has not run today/);
  // The 10:53 UTC watchdog slot would have caught it two hours before a human did.
  assert.equal(ufcFightdayWatch({ card: CARD, oddsEventId: "600059993", nowIso: "2026-09-12T10:53:00Z", ranToday: false }).shouldDispatch, true);
});

test("a run that happened is not coverage — the artifact has to describe THIS card", () => {
  const w = ufcFightdayWatch({ card: CARD, oddsEventId: "600059993", nowIso: "2026-09-12T13:00:00Z", ranToday: true });
  assert.equal(w.state, "UNPRICED");
  assert.equal(w.shouldDispatch, true);
  assert.match(w.reason, /ran today, but the published odds still describe event 600059993/);
});

test("priced for this card: nothing to do", () => {
  const w = ufcFightdayWatch({ card: CARD, oddsEventId: "600060772", nowIso: "2026-09-12T13:00:00Z", ranToday: true });
  assert.equal(w.state, "PRICED");
  assert.equal(w.shouldDispatch, false);
});

test("too early is not a problem — prices are not due yet", () => {
  const w = ufcFightdayWatch({ card: CARD, oddsEventId: null, nowIso: "2026-09-11T18:00:00Z", ranToday: false });
  assert.equal(w.state, "TOO_EARLY");
  assert.equal(w.shouldDispatch, false);
  assert.ok(w.hoursToFirstBout > DEFAULT_LEAD_HOURS);
});

test("after the first bout it REFUSES: the feed serves in-play prices once a card is under way", () => {
  const late = ufcFightdayWatch({ card: CARD, oddsEventId: "600059993", nowIso: "2026-09-12T19:30:00Z", ranToday: true });
  assert.equal(late.state, "TOO_LATE");
  assert.equal(late.shouldDispatch, false, "capturing now would publish in-play numbers as the pre-fight market");
  assert.match(late.reason, /missed day, not a repairable one/);
  const done = ufcFightdayWatch({ card: CARD, oddsEventId: "600060772", nowIso: "2026-09-12T19:30:00Z", ranToday: true });
  assert.equal(done.state, "DONE");
  assert.equal(done.shouldDispatch, false);
});

test("no card, no claim", () => {
  for (const card of [null, {}, { event: {} }, { event: { providerEventId: "x" } }, { event: { providerEventId: "x", startUtc: "not-a-date" } }]) {
    const w = ufcFightdayWatch({ card, oddsEventId: null, nowIso: "2026-09-12T13:00:00Z", ranToday: false });
    assert.equal(w.state, "NO_CARD");
    assert.equal(w.shouldDispatch, false);
  }
});

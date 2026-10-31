import assert from "node:assert/strict";
import test from "node:test";

import { approvedCaption, nflWindow, quoteAgeFlags, slateWord } from "./approved-captions.mjs";
import { ccCaptionProblems, instant } from "./social-package.mjs";
import { resultsHeroCard, verifyGameDayCard } from "../../../scripts/social/game-day-cards.mjs";

const refs = [{ ref: "x" }];
test("today before 5 PM Eastern, across the clock change", () => {
  assert.equal(slateWord(instant("2026-10-31T19:00Z")), "today");
  assert.equal(slateWord(instant("2026-10-31T22:00Z")), "tonight");
  assert.equal(slateWord(instant("2026-11-01T21:59Z")), "today");
  assert.equal(slateWord(instant("2026-11-01T22:00Z")), "tonight");
});
test("NFL windows use Eastern time after the change", () => {
  assert.deepEqual(["2026-11-01T18:00Z", "2026-11-01T21:25Z", "2026-11-02T01:20Z", "2026-11-03T01:15Z"].map((t) => nflWindow(instant(t))), ["early", "late", "prime", "mnf"]);
});
test("recap: approved format, no disclaimer, claims cover every digit, miss stated", () => {
  const p = { contentType: "RESULTS_RECAP", sport: "nba", date: "2026-10-30", firstStartUtc: "2026-10-31T19:00Z", snapshotRefs: refs, content: { correct: 5, missed: 1 } };
  const { caption, claims } = approvedCaption(p);
  assert.match(caption, /5 predicted winners correct\n❌ 1 prediction missed\n\n/);
  assert.match(caption, /\n\n#NBA$/);
  assert.doesNotMatch(caption, /betting advice/i);
  assert.deepEqual(ccCaptionProblems(caption, claims, { hasMiss: true }), []);
});
test("unknown type is refused", () => assert.throws(() => approvedCaption({ contentType: "X", firstStartUtc: "2026-10-31T19:00Z", snapshotRefs: refs })));
test("quote older than the limit is flagged; exactly at the limit is not", () => {
  const at = Date.parse("2026-10-31T12:00:00Z");
  const [a, b] = quoteAgeFlags([{ eventId: "1", quotedAt: "2026-10-31T05:59:00Z" }, { eventId: "2", quotedAt: "2026-10-31T06:00:00Z" }], at, 6);
  assert.equal(a.stale, true); assert.equal(b.stale, false);
});
test("ten-row hero card keeps every row and validates", () => {
  const games = Array.from({ length: 10 }, (_, i) => ({ eventId: String(i), matchup: "A @ B", away: "A", home: "B", final: { away: 90, home: 100 }, frozenSide: "B", outcome: "CORRECT" }));
  const c = resultsHeroCard({ recap: { games, correct: 10, missed: 0, graded: 10, gamesScheduled: 10, accuracy: "100.0%" }, chip: "NBA" });
  assert.match(c.html, /rc rx d/);
  assert.equal((c.html.match(/class="rxr /g) ?? []).length, 10);
  assert.deepEqual(verifyGameDayCard(c), []);
});

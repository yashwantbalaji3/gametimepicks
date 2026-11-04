import assert from "node:assert/strict";
import { test } from "node:test";

import { PURPOSE, lineJudgedAt, lineAgeExceptionOn } from "./nba-line-graphics-export.mjs";

const art = "2026-11-04T21:06:40Z";
test("9-hour cap, Nov 4 matchup snapshots only: judged 3 h before the post, never before the artifact", () => {
  assert.equal(lineAgeExceptionOn(PURPOSE.MATCHUP_SNAPSHOT, "2026-11-04"), true);
  assert.equal(lineJudgedAt(PURPOSE.MATCHUP_SNAPSHOT, "2026-11-04", "2026-11-05T02:30:00Z", art), "2026-11-04T23:30:00.000Z");
  assert.equal(lineJudgedAt(PURPOSE.MATCHUP_SNAPSHOT, "2026-11-04", "2026-11-04T23:00:00Z", art), "2026-11-04T21:06:40.000Z");
});
test("off for every other purpose and date", () => {
  for (const [p, d] of [[PURPOSE.SOCIAL, "2026-11-04"], [PURPOSE.FOUNDER_REVIEW, "2026-11-04"], [PURPOSE.MATCHUP_SNAPSHOT, "2026-11-05"]]) {
    assert.equal(lineAgeExceptionOn(p, d), false);
    assert.equal(lineJudgedAt(p, d, "2026-11-05T02:30:00Z", art), "2026-11-05T02:30:00Z");
  }
});
test("a custom record with the exception off or a cap above 9 never widens past 9 h", () => {
  const rec = (o) => ({ nba: [{ etDate: "2026-11-04", markets: ["playerProps"], receiptRef: "r", snapshotLabel: "s", captionDisclosure: "c", approvedBy: "f", approvedAt: "2026-11-04", ...o }] });
  assert.equal(lineJudgedAt(PURPOSE.MATCHUP_SNAPSHOT, "2026-11-04", "2026-11-05T02:30:00Z", art, rec({ lineAgeExceptionApproved: false })), "2026-11-05T02:30:00Z");
  assert.equal(lineJudgedAt(PURPOSE.MATCHUP_SNAPSHOT, "2026-11-04", "2026-11-05T05:30:00Z", art, rec({ lineAgeExceptionApproved: true, lineAgeMaxHours: 24 })), "2026-11-05T02:30:00.000Z");
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { approvalMatchProblems, cleanEligibilityProblems, sameDisplayProblems, withoutBanner } from "./clean-export.mjs";

const pkg = { dedupeId: "d", contentSha256: "c", designVersion: "2", containsMarketData: false, contentType: "NBA_TONIGHT", images: [{ path: "a", sha256: "s" }], commandCenter: { captions: [{ id: "A", text: "hi" }] } };
const entry = { dedupeId: "d", contentSha256: "c", captionId: "A", caption: "hi", approvedAt: "t" };
test("eligibility refuses market data, pass and rush, and player cards under REVIEW", () => {
  assert.deepEqual(cleanEligibilityProblems(pkg), []);
  assert.ok(cleanEligibilityProblems({ ...pkg, containsMarketData: true }).length);
  assert.ok(cleanEligibilityProblems({ ...pkg, variant: "top5_rush_yds" }).length);
  assert.ok(cleanEligibilityProblems({ ...pkg, contentType: "NFL_PLAYER_STATS", content: { estimate: true } }).length);
  assert.ok(cleanEligibilityProblems({ ...pkg, contentType: "NBA_PLAYER_STATS", anomalyCheck: "REVIEW" }).length);
  assert.deepEqual(cleanEligibilityProblems({ ...pkg, contentType: "NBA_DAILY_TOP5", anomalyCheck: "REVIEW" }), []);
});
test("approval must match the content, the caption and the image on disk", () => {
  const ok = new Map([["a", "s"]]);
  assert.deepEqual(approvalMatchProblems(entry, pkg, ok), []);
  assert.ok(approvalMatchProblems({ ...entry, contentSha256: "x" }, pkg, ok).length);
  assert.ok(approvalMatchProblems({ ...entry, caption: "other" }, pkg, ok).length);
  assert.ok(approvalMatchProblems(entry, pkg, new Map([["a", "tampered"]])).length);
});
test("only the banner goes; a changed value is caught", () => {
  const html = `<div class="draft">REVIEW</div><span data-cell="a">1</span>Model projections`;
  const clean = withoutBanner(html);
  assert.deepEqual(sameDisplayProblems(html, clean, "Model projections"), []);
  assert.ok(sameDisplayProblems(html, clean.replace(">1<", ">2<"), "Model projections").length);
  assert.throws(() => withoutBanner("no banner"));
});

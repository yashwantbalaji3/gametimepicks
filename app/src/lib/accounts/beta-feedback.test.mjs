/** Session 9 · I6 — the feedback row: identity from the session, validated choices, path-only route. */
import test from "node:test";
import assert from "node:assert/strict";
import { buildFeedbackRow, cleanRoute } from "./beta-feedback.mjs";

test("a valid report builds exactly the beta_feedback columns, owned by the signed-in tester", () => {
  const r = buildFeedbackRow({ route: "/nfl/?x=1#y", kind: "wrong_data", severity: "major", sport: "nfl", product: "results", actual: "  score is wrong  ", expected: "" }, { userId: "u1" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.row, { user_id: "u1", route: "/nfl/", sport: "nfl", product: "results", kind: "wrong_data", severity: "major", actual: "score is wrong", expected: null });
});

test("refused: no session, empty text, unknown choices, oversized text", () => {
  assert.equal(buildFeedbackRow({ kind: "bug", actual: "x" }, {}).ok, false);
  assert.equal(buildFeedbackRow({ kind: "bug", actual: " " }, { userId: "u" }).ok, false);
  assert.equal(buildFeedbackRow({ kind: "rant", actual: "x" }, { userId: "u" }).ok, false);
  assert.equal(buildFeedbackRow({ kind: "bug", actual: "x", sport: "cricket" }, { userId: "u" }).ok, false);
  assert.equal(buildFeedbackRow({ kind: "bug", actual: "x".repeat(2001) }, { userId: "u" }).ok, false);
});

test("the route is a same-site path only — another site's URL or a query never travels", () => {
  assert.equal(cleanRoute("https://gametimepicks.example/bank-builder/?token=abc"), "/bank-builder/");
  assert.equal(cleanRoute("javascript:alert(1)"), "/");
  assert.equal(cleanRoute("/today#top"), "/today");
});

/**
 * The Command Center's side of the shared comparison: it reads the website's social feed row (`gtp-social-nba@1`
 * lineComparison) verbatim. Gated by default; a comparison only when the feed says COMPARED, social display is
 * permitted, the book is eligible and the event hasn't started; the colour is the site's `side`; anything else falls
 * back to projection-only and holds line-dependent graphics.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { comparisonView, REFUSAL } from "../recap/odds-comparison.mjs";

const NOW = "2026-10-29T20:00:00Z";
const lc = (o = {}) => ({ status: "COMPARED", line: 29.5, overPrice: -115, underPrice: -105, book: "draftkings", marketKey: "player_points", capturedAt: "2026-10-29T19:40:00Z", difference: 6.5, direction: "ABOVE", side: "OVER", freshness: "FRESH", ...o });
const base = { feedContract: "gtp-social-nba@1", socialDisplayPermitted: true, player: { name: "Example Player", team: "SA" }, family: "pts", projection: 36, lineComparison: lc(), eligibleBooks: ["draftkings", "fanduel"], now: NOW, startUtc: "2026-10-30T00:00:00Z", enabled: true };

test("odds comparison: off unless enabled, and off unless social display is permitted (D3)", () => {
  assert.ok(comparisonView({ ...base, enabled: undefined }).reasons.includes(REFUSAL.GATED));
  const r = comparisonView({ ...base, socialDisplayPermitted: undefined });
  assert.equal(r.mode, "projection-only");
  assert.ok(r.reasons.includes(REFUSAL.NOT_PERMITTED));
  assert.equal(r.view.line, undefined, "no line is shown");
});

test("odds comparison: a COMPARED row shows the site's side and difference verbatim", () => {
  const r = comparisonView(base);
  assert.equal(r.mode, "comparison");
  assert.deepEqual([r.view.side, r.view.style, r.view.difference, r.view.line], ["OVER", "over", 6.5, 29.5]);
  const under = comparisonView({ ...base, projection: 24, lineComparison: lc({ difference: -5.5, direction: "BELOW", side: "UNDER" }) });
  assert.deepEqual([under.view.side, under.view.style], ["UNDER", "under"]);
  const even = comparisonView({ ...base, projection: 29.5, lineComparison: lc({ difference: 0, direction: "EQUAL", side: "NEUTRAL" }) });
  assert.equal(even.view.style, "neutral");
  assert.match(r.view.disclaimer, /not a pick/);
});

test("odds comparison: works without prices or book (the default under the provider terms)", () => {
  const r = comparisonView({ ...base, lineComparison: lc({ overPrice: undefined, underPrice: undefined, book: undefined }) });
  assert.equal(r.mode, "comparison");
  assert.deepEqual([r.view.side, r.view.difference, r.view.line, r.view.book, r.view.overPrice, r.view.bookNote], ["OVER", 6.5, 29.5, null, null, null]);
});

test("odds comparison: today's feed (every row NOT_AUTHORIZED) and every unsafe input fall back to projection-only", () => {
  const cases = {
    "LINE_NOT_COMPARED:NOT_AUTHORIZED": { lineComparison: { status: "NOT_AUTHORIZED" } },
    "LINE_NOT_COMPARED:UNAVAILABLE:STALE": { lineComparison: { status: "UNAVAILABLE", reason: "STALE" } },
    "LINE_NOT_COMPARED:NONE": { lineComparison: null },
    [REFUSAL.OPERATOR]: { lineComparison: lc({ book: "bovada" }) },
    [REFUSAL.INCOMPLETE]: { lineComparison: lc({ side: undefined }) },
    [REFUSAL.AFTER_START]: { startUtc: "2026-10-29T19:00:00Z" },
    [REFUSAL.FEED_UNKNOWN]: { feedContract: "something@9" },
  };
  for (const [reason, patch] of Object.entries(cases)) {
    const r = comparisonView({ ...base, ...patch });
    assert.equal(r.mode, "projection-only", reason);
    assert.ok(r.reasons.includes(reason), `${reason}: ${r.reasons.join(", ")}`);
    assert.equal(r.lineDependentHeld, true);
    assert.equal(r.view.projection, 36, "the projection itself is still shown");
  }
});

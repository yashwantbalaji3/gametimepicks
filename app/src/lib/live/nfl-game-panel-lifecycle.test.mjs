/**
 * NFL game-page live panel · lifecycle copy (2026-10-05, before MNF ATL @ NO).
 *
 *  1. The clock is printed once. ESPN's NFL label already carries it ("7:27 - 1st"), and the panel appended
 *     it again ("7:27 - 1st · 7:27"). The hub was fixed for this on 2026-09-27; the panel was not.
 *  2. A graded game reads as graded. The page never passed a settlement to the panel, so the panel said
 *     "Final score reported · grading pending" forever, beside a page that said SETTLED.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { derivePresentationState } from "./lifecycle.mjs";

const { periodParts } = await import("../../components/live/live-primitives.tsx");

const strip = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const page = strip(fs.readFileSync(path.join(process.cwd(), "src/app/nfl/game/[eventId]/page.tsx"), "utf8"));
const panel = strip(fs.readFileSync(path.join(process.cwd(), "src/components/live/live-panel.tsx"), "utf8"));

test("🔴 the NFL clock is printed once when ESPN's label already states it", () => {
  const env = { period: { number: 1, label: "7:27 - 1st", clock: "7:27" } };
  assert.deepEqual(periodParts(env), ["7:27 - 1st"]);
  assert.equal(periodParts(env).join(" · ").split("7:27").length - 1, 1, "7:27 appears exactly once");
});

test("a label without the clock still gets it; absent parts stay absent", () => {
  assert.deepEqual(periodParts({ period: { label: "1st", clock: "7:27" } }), ["1st", "7:27"]);
  assert.deepEqual(periodParts({ period: { label: "Top 5th", clock: null } }), ["Top 5th"], "MLB has no clock");
  assert.deepEqual(periodParts({ period: { label: null, clock: "2:00" } }), ["2:00"]);
  assert.deepEqual(periodParts({}), []);
  assert.deepEqual(periodParts(null), []);
});

test("an NFL-shaped settlement makes the panel SETTLED; no settlement keeps the honest gap state", () => {
  const env = { state: "FINAL" };
  assert.equal(derivePresentationState({ envelope: env, settlement: { actual: { home: 27, away: 24 }, gradedAt: null } }).state, "SETTLED");
  assert.equal(derivePresentationState({ envelope: env, settlement: null }).state, "FINAL_PENDING_SETTLEMENT");
  assert.equal(
    derivePresentationState({ envelope: { state: "POSTPONED" }, settlement: { actual: { home: 0, away: 0 }, gradedAt: null } }).state,
    "POSTPONED",
    "a postponed game never reads as settled",
  );
});

test("🔴 the page passes a settlement only when the page itself says SETTLED and the graded record has the final", () => {
  assert.match(page, /settlement=\{liveSettlement\}/);
  assert.match(page, /const reconciledFinal = lifecycle === "SETTLED" \? reconciledFinalFor\(params\.eventId\) : null;/);
  assert.match(page, /g\?\.state === "FINAL" \? g\.final : null/, "a PENDING reconciliation row never grades the panel");
});

test("the panel says graded only in SETTLED, and 'reviewed' only when a review is shown", () => {
  assert.match(panel, /life\.state === "SETTLED" && \(\s*<p[^>]*>\s*Final · graded against the frozen forecast/);
  assert.match(panel, /life\.state === "FINAL_PENDING_SETTLEMENT" && \(\s*<p[^>]*>\s*Final score reported · grading pending/);
  assert.match(panel, /title=\{life\.showsPostgameReview && review \?/);
});

test("PIT @ CLE (401872964) — settled on the index, FINAL on the graded record — would now read as graded", () => {
  const root = path.join(process.cwd(), "public/data/nfl");
  let idx, rec;
  try {
    idx = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8"));
    rec = JSON.parse(fs.readFileSync(path.join(root, "reconciliation/2-04.json"), "utf8"));
  } catch { return; }
  const ev = (idx.events ?? []).find((e) => e.providerEventId === "401872964");
  const row = (rec.games ?? []).find((g) => g.providerEventId === "401872964");
  if (!ev || !row) return; // the week rolled; the source guards above still hold
  assert.equal(ev.lifecycle, "SETTLED");
  assert.equal(row.state, "FINAL");
  assert.ok(Number.isFinite(row.final?.home) && Number.isFinite(row.final?.away));
});

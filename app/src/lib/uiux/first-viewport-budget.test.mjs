/**
 * FIRST-VIEWPORT COPY BUDGETS (P213 · Release A) — the founder's 2026-08-26 screenshot, made a
 * guard. The homepage hero is a launchpad: one short headline, three actions, one derived status
 * row. The badge stack and explanatory paragraph must never return, and the page's total rendered
 * copy only shrinks. Evaluated on BUILT output (rendered truth), not source strings.
 *
 * Buildless CI lane: these skip when no export exists (assert-when-built convention).
 *
 * Run: npx tsx --test src/lib/uiux/first-viewport-budget.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const hasBuild = fs.existsSync(path.join(OUT, "index.html"));

const rendered = (rel) => {
  const h = fs.readFileSync(path.join(OUT, rel), "utf8")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<head[\s\S]*?<\/head>/g, " ");
  return h.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, "'").replace(/\s+/g, " ");
};
const words = (t) => (t.match(/[A-Za-z0-9'’%$+–—-]+/g) ?? []).length;

test("the screenshot's badge stack and manifesto paragraph never return to the homepage", () => {
  if (!hasBuild) return;
  const t = rendered("index.html");
  for (const banished of [
    "PUBLIC BETA · SIMULATION-POWERED ANALYTICS",
    "PAPER-ONLY · FREE · EDUCATIONAL",
    "DETERMINISTIC · SAME OUTPUT FOR EVERY USER",
    "is a simulation-first, paper-only sports model",
  ]) {
    assert.ok(!t.toLowerCase().includes(banished.toLowerCase()), `homepage must not re-grow: "${banished}"`);
  }
  assert.match(t, /Today.{0,3}s games, picks and results\./, "the launchpad headline leads");
});

test("the homepage total rendered copy only shrinks (frozen at the R-A measurement)", () => {
  if (!hasBuild) return;
  // Measured 2026-08-27: 1,432 pregame → 1,501 with games in progress (started-state chips add
  // real words) — a ceiling tighter than live variance flakes on a healthy slate (the P210
  // measurement trap). 1,600 holds: the banished-strings test above is the regrowth guard; this
  // ceiling catches gross creep. Shrink-only, evidence-updated.
  const CEILING = 1600;
  const w = words(rendered("index.html"));
  assert.ok(w <= CEILING, `homepage rendered words ${w} > frozen ceiling ${CEILING} — copy crept back`);
});

test("the hero's live-status row derives from owners — its figures are digits, not hand-typed prose", () => {
  if (!hasBuild) return;
  const t = rendered("index.html");
  assert.match(t, /\d+ sports? active/, "active-sports figure present");
  assert.match(t, /\d+ events today|no events today/, "events figure present");
  assert.match(t, /Settled through|See every settled result/, "the settled proof link anchors the row");
});

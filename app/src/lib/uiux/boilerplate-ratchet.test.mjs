/**
 * BOILERPLATE REPEAT RATCHET (P213 · Release B/C) — the same sentence must not repeat across hero,
 * card, section and footer. "paper-only" keeps its chrome owners (top strip's educational line,
 * footer brand line, footer legal sentence, nav where a product name needs it); section-level
 * repeats were cut route by route and these ceilings FREEZE the cut. Shrink-only: a release that
 * lowers a route's count moves its ceiling down with the measurement; nothing raises one silently.
 *
 * Ceilings = the 2026-08-27 post-cut measurement +2 headroom, because several surfaces render
 * state-conditional chips (started-game "preserved pregame reads" etc.) and a LIVE slate must not
 * flake the guard (the empty-slate/midnight measurement trap, P210). Evaluated on BUILT output.
 *
 * Run: npx tsx --test src/lib/uiux/boilerplate-ratchet.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const hasBuild = fs.existsSync(path.join(OUT, "index.html"));

// P213 R-G: ceilings live in the versioned public-content contract (ONE source — the /launch
// panel renders the same object this guard enforces).
import { PAPER_ONLY_CEILINGS } from "../launch/public-content-contract.mjs";

const rendered = (rel) => {
  const h = fs.readFileSync(path.join(OUT, rel), "utf8")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<head[\s\S]*?<\/head>/g, " ");
  return h.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, "'").replace(/\s+/g, " ").toLowerCase();
};
const count = (t, phrase) => t.split(phrase).length - 1;

test("'paper-only' repeats only ever shrink per route", () => {
  if (!hasBuild) return;
  const over = [];
  for (const [rel, ceiling] of Object.entries(PAPER_ONLY_CEILINGS)) {
    if (!fs.existsSync(path.join(OUT, rel))) continue; // a pruned/renamed route is the inventory guard's job
    const n = count(rendered(rel), "paper-only");
    if (n > ceiling) over.push(`${rel}: ${n} > ${ceiling}`);
  }
  assert.deepEqual(over, [], `boilerplate crept back:\n  ${over.join("\n  ")}`);
});

test("the chrome owners survive — trimming repeats must never delete the truth's home", () => {
  if (!hasBuild) return;
  const t = rendered("index.html");
  assert.ok(count(t, "paper-only") >= 2, "the footer's brand line and legal sentence both say paper-only");
  assert.ok(t.includes("not betting advice"), "the not-betting-advice owner is present");
  assert.ok(t.includes("educational and research use only"), "the approved legal sentence is intact");
});

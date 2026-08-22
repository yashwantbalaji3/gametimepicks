/**
 * EVERY PUBLISHED PLAYER MARKET MUST REACH A READER.
 *
 * Run: npx tsx --test src/lib/sports/epl/published-markets-rendered.test.mjs
 *
 * shots_on_goal_over_0_5 cleared its own preregistered bars, was computed for every player on every
 * run, was written into the artifact — 59 of 59 players carried a figure — and was rendered on no
 * page at all. A market that passes its test and then cannot be read is indistinguishable from one
 * that was never built, and nothing in the suite noticed, because every guard asked whether the
 * ARTIFACT was right.
 *
 * This asks the other question: does the built export actually show it?
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const ART = path.join(APP, "public/data/soccer/epl/player-projections/latest.json");
const projections = fs.existsSync(ART) ? JSON.parse(fs.readFileSync(ART, "utf8")) : null;

/** Rendered text of every built per-fixture report. Empty when the export has not been built. */
function reportText() {
  const dir = path.join(APP, "out/epl/match");
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir)
    .map((d) => path.join(dir, d, "index.html"))
    .filter((p) => fs.existsSync(p))
    .map((p) => fs.readFileSync(p, "utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

/** How each published market must appear to a reader. A market with no entry here fails loudly. */
const RENDERED_AS = {
  anytime_goalscorer: /To score/i,
  shots_on_goal_over_0_5: /shot on target/i,
};

test("every market on the artifact has a declared rendering", () => {
  if (!projections) return;
  for (const m of projections.markets ?? []) {
    assert.ok(RENDERED_AS[m.id], `market ${m.id} is published but this guard does not know how it should appear — add it, or stop publishing it`);
  }
});

test("BUILT EXPORT · every published market is visible on a report page", () => {
  const pages = reportText();
  if (!pages?.length || !projections) return;   // export not built in this run
  for (const m of projections.markets ?? []) {
    const pattern = RENDERED_AS[m.id];
    const shown = pages.filter((t) => pattern.test(t)).length;
    assert.ok(shown > 0, `${m.id} is published for every fixture and appears on NO report page`);
  }
});

test("a REJECTED market must NOT appear — a failed bar is not a hidden product", () => {
  const pages = reportText();
  if (!pages?.length || !projections) return;
  // shots_over_0_5, assists and cards were measured under the same protocol and REJECTED. Their
  // absence is the finding; rendering them anyway would publish what the bars refused.
  const rejected = (projections.rejectedMarkets ?? []).map((r) => r.id);
  for (const id of rejected) {
    if (id === "assists_over_0_5") {
      for (const t of pages) assert.doesNotMatch(t, /\bTo assist\b/i, "a rejected market must not be rendered");
    }
    if (id === "cards_over_0_5") {
      for (const t of pages) assert.doesNotMatch(t, /\bTo be booked\b/i, "a rejected market must not be rendered");
    }
  }
  assert.ok(rejected.length > 0, "the artifact records which markets failed their bars — that record is the point");
});

test("an absent figure renders as an em dash, never as zero", () => {
  const src = fs.readFileSync(path.join(APP, "src/app/epl/match/[slug]/page.tsx"), "utf8");
  // A player the model has no figure for has not been given a 0% chance of hitting the target.
  assert.match(src, /shotsOnGoalOver05 === "number" \? pct\(p\.shotsOnGoalOver05\) : "—"/);
  // And the column itself is derived from the data rather than assumed, so a run that publishes no
  // shots model shows no empty column.
  assert.match(src, /const anySog = playerRows\.some/);
});

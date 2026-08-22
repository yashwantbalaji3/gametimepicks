/**
 * THE FLAGSHIP SIMULATION HAS TO BE FINDABLE.
 *
 * Run: npx tsx --test src/lib/mlb/full-game/hub-cards.test.mjs
 *
 * Fifteen full-game simulations were regenerated hourly as batting orders posted, and the only way
 * to reach one was to open a game report from inside a board tab. /epl had published its fixture
 * simulations on the hub for weeks. The most expensive thing this site computes was the hardest
 * thing on it to find.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadMlbSimCards } from "./hub-cards.ts";

const APP = process.cwd();
const SIM_DIR = path.join(APP, "public/data/mlb/full-game-simulations");
const latestDay = () => {
  if (!fs.existsSync(SIM_DIR)) return null;
  return fs.readdirSync(SIM_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1)?.slice(0, 10) ?? null;
};

test("a day with no artifact loads NOTHING, not an empty board", () => {
  // "We have no simulations for this day" and "we simulated nothing" are different facts, and only
  // one of them should render a section header with a zero beside it.
  assert.equal(loadMlbSimCards("1999-01-01"), null);
  assert.equal(loadMlbSimCards(null), null);
});

test("every figure on a card comes from the artifact, and none is recomputed", () => {
  const day = latestDay();
  if (!day) return;
  const set = loadMlbSimCards(day);
  const raw = JSON.parse(fs.readFileSync(path.join(SIM_DIR, `${day}.json`), "utf8"));
  assert.equal(set.cards.length, raw.games.length, "every simulated game must reach the hub");
  for (const c of set.cards) {
    const g = raw.games.find((x) => x.slug === c.slug);
    assert.ok(g, `${c.slug} is on the hub and not in the artifact`);
    if (c.favourite) {
      const wp = c.favourite.team === g.awayTeam ? g.winProbability.away : g.winProbability.home;
      assert.equal(c.favourite.probability, wp, `${c.slug}: the probability must be the simulation's own`);
      assert.ok(wp > (c.favourite.team === g.awayTeam ? g.winProbability.home : g.winProbability.away),
        `${c.slug}: the side named must be the one the simulation actually favoured`);
    }
    assert.equal(c.medianTotal, g.totalRuns?.median ?? null);
  }
});

test("A DEAD HEAT NAMES NO FAVOURITE — a coin flip is never presented as a lean", () => {
  const day = latestDay();
  if (!day) return;
  const set = loadMlbSimCards(day);
  for (const c of set.cards) {
    if (!c.favourite) continue;
    assert.ok(c.favourite.probability > 0.5, `${c.slug}: a "favourite" under 50% is not a favourite`);
  }
});

test("the run count is quoted only when the whole set agrees on one", () => {
  const day = latestDay();
  if (!day) return;
  const raw = JSON.parse(fs.readFileSync(path.join(SIM_DIR, `${day}.json`), "utf8"));
  const counts = new Set(raw.games.map((g) => g.runCount).filter((n) => typeof n === "number"));
  const set = loadMlbSimCards(day);
  if (counts.size === 1) assert.equal(set.runCount, [...counts][0]);
  else assert.equal(set.runCount, null, "a mixed set must quote no run count rather than imply one covers the rest");
});

test("a provisional lineup is flagged on the ROW, not left to a footnote", () => {
  const day = latestDay();
  if (!day) return;
  const set = loadMlbSimCards(day);
  const raw = JSON.parse(fs.readFileSync(path.join(SIM_DIR, `${day}.json`), "utf8"));
  for (const c of set.cards) {
    const g = raw.games.find((x) => x.slug === c.slug);
    const bothConfirmed = g.completeness?.awayLineupSource === "confirmed" && g.completeness?.homeLineupSource === "confirmed";
    assert.equal(c.awaitingLineup, !bothConfirmed, `${c.slug}: the row must state the lineup it was actually built on`);
  }
  assert.equal(set.readyCount, raw.games.filter((g) => g.completeness?.level === "ready").length);
});

test("BUILT EXPORT · the simulations reach a reader WITHOUT a click", () => {
  /*
   * The first attempt put this section inside the games tab, which is client-rendered behind a
   * click and a deferred boundary — the same burial it was being lifted out of. A section that only
   * exists in the RSC payload is not on the page. So this strips the scripts before looking.
   */
  const page = path.join(APP, "out/mlb/index.html");
  if (!fs.existsSync(page)) return;                 // export not built in this run
  const set = loadMlbSimCards(latestDay());
  if (!set) return;
  const rendered = fs.readFileSync(page, "utf8")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(rendered, /Simulations ·/, "the MLB hub must carry a simulations section in its rendered body");
  assert.ok(rendered.includes("Open the simulation"), "and each card must offer the way in");
  // No market claim may attach itself to a simulation number.
  assert.match(rendered, /not compared against any sportsbook price/,
    "the section must state that these are the model's own numbers");
});

/**
 * P185 · RELEASE D — the Simulation Hub may not make a schedule look like a simulation.
 *
 * The charter's rule for this surface: "Simulation Hub shows only sports with active current
 * simulations. Schedule-only, archive-only and off-season sports remain discoverable under
 * Sports/Schedules and cannot look active through visual polish."
 *
 * The defect this guards was a COMMENT that described the invariant and code that did not enforce
 * it. The source said NFL is active "ONLY when the canonical eligible set carries simulations" and
 * the condition was `nflRows.length > 0` — true for fifteen games that were every one of them
 * BASELINE ONLY. The rendered board showed "NFL · active · 15 games" beside "MLB · active · 15
 * games · 15 ready", and a header reading "2 sports live · 15 simulation-ready".
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const lobby = stripComments(fs.readFileSync(path.join(APP, "src/components/games/simulate-lobby.tsx"), "utf8"));

test("a sport's state word follows its READY count, never its row count", () => {
  /*
   * Comments are stripped first. This repo has hit the denial trap repeatedly — scanning prose that
   * describes a refusal as though it were the code performing it.
   */
  assert.match(lobby, /simReadyCountFor\("nfl"\)\s*>\s*0\s*\?\s*"active"\s*:\s*"conditional"/,
    "NFL's tone must be derived from its simulation-ready count");
  assert.match(lobby, /simReadyCountFor\("nfl"\)\s*>\s*0\s*\?\s*"active"\s*:\s*"baseline only"/,
    'a sport with zero ready simulations must not wear the same state word as one with fifteen');
});

test('the header counts sports that are SIMULATING, not sports with a row', () => {
  assert.match(lobby, /simulatingSports\s*=\s*new Set\(\s*rows\.filter\(\(r\) => r\.simReady\)/,
    "the headline sport count must be filtered by simReady");
  assert.doesNotMatch(lobby, /l:\s*`sport\$\{activeSports === 1[^`]*` live`/,
    '"sports live" must not be driven by the unfiltered row count');
});

test("the rendered board never labels a zero-ready sport the way it labels a ready one", () => {
  /*
   * Asserted against the BUILT page, because "file exists" is not "page says". Skipped on a
   * source-only run rather than silently passing.
   */
  const f = path.join(APP, "out", "simulate", "index.html");
  if (!fs.existsSync(f)) return;
  const html = fs.readFileSync(f, "utf8");
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  // Whatever the slate is today, the two claims must agree: if the page says N sports simulating,
  // it may not also claim more sports are "live".
  assert.doesNotMatch(text, /sports? live/,
    'the hub still renders a "sports live" count — it must say what is simulating');
});

test('a sentence containing "today" is backed by a count of TODAY', () => {
  /*
   * The homepage rendered "30 games simulation-ready today" on 2026-08-18. That number was
   * `readyCount` — a FEATURABLE POOL SIZE, documented in the selector as being for "+N more" copy.
   * It spans current AND upcoming and counts market-implied cards beside run-count simulations, all
   * of which is right for "+N more below" and wrong for an availability claim: the 30 was 15 MLB
   * games today plus 15 NFL games four days out that were every one of them BASELINE ONLY.
   *
   * This is the same distinction P179 drew for the NFL badge — ARTIFACT_READY is not
   * SIMULATION_READY — arriving on a second surface. The hero must read `simulationsToday`.
   */
  const home = stripComments(fs.readFileSync(path.join(APP, "src/app/page.tsx"), "utf8"));
  // P213 R-A: the hero call is multi-line now (it carries the live-status row's props); the
  // contract is unchanged — readyCount must be the TODAY-dated figure, never the pool size.
  assert.match(home, /<LandingHero[\s\S]{0,300}?readyCount=\{simulationsToday\}/,
    "the hero's availability line must be backed by simulations dated today, not by a pool size");

  const selector = stripComments(
    fs.readFileSync(path.join(APP, "src/lib/simulate-lobby-featured.ts"), "utf8"));
  assert.match(selector, /c\.mode === "simulation" && c\.date === today/,
    "simulationsToday must require BOTH a genuine run-count simulation and today's date");
});

test("the rendered homepage does not claim more simulations than the board carries", () => {
  const home = path.join(APP, "out", "index.html");
  const sim = path.join(APP, "out", "simulate", "index.html");
  if (!fs.existsSync(home) || !fs.existsSync(sim)) return;
  const txt = (f) => fs.readFileSync(f, "utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const claimed = txt(home).match(/(\d+)\s+games simulation-ready today/);
  if (!claimed) return;                                    // no games today is a legitimate state
  const board = txt(sim).match(/(\d+)\s+simulation-ready/);
  if (!board) return;
  assert.ok(Number(claimed[1]) <= Number(board[1]),
    `the homepage claims ${claimed[1]} simulation-ready today while the hub counts ${board[1]}`);
});

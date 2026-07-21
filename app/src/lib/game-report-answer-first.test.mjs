/**
 * ANSWER-FIRST GAME REPORT — the fast read leads, the dense detail collapses, the gate + money hold.
 *
 * The MLB simulation runner's done phase is now just [ "Simulation complete" header → the V2.5 report
 * (postReveal) → a paper-only disclaimer → post-reveal nav ]. The dense modules that used to be collapsed
 * inside the runner (full pick table, distributions, model-vs-market agreement, unavailable-module notes,
 * copy recap) now render as first-class SECTIONS of the primary V2.5 report
 * (`mlb-simulation-report-v2.tsx`), and the old dense dashboard is demoted into ONE collapsed
 * "Advanced simulation detail" block inside that report. This pins that structure — the fast answer-first
 * read stays above the single collapse, the collapse stays behind the Generate gate, sections render only
 * with real content (honest empty state otherwise), and money is untouched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|free money|can'?t lose|sure thing|risk-?free/i;
const stripSafeArea = (s) => s.replace(/safe-area[a-z-]*/gi, "");

const runner = read("src/components/game/game-simulation-runner.tsx");
const comp = read("src/components/game/answer-first-report.tsx");
const v2 = read("src/components/game/mlb-simulation-report-v2.tsx");

test("1 · the heavy sections now live as first-class sections inside the primary V2.5 report", () => {
  // The dense modules that used to be collapsed in the runner's done phase now render as numbered
  // sections in the V2.5 report — the runner just reveals {postReveal} (that report).
  for (const title of [
    'title="Player simulation board"', // the full pick table (was <PropTable>)
    'title="Outcome distributions"', // was <DistributionCard>
    'title="Market agreement"', // was <MarketAgreement>
    'title="Biggest model leads"', // the leans watchlist
  ]) {
    assert.ok(v2.includes(title), `${title} is a section in the V2.5 report`);
  }
  // The old dense dashboard is demoted into ONE collapsed block, inside the V2.5 report.
  assert.match(v2, /AdvancedDisclosure label="Advanced simulation detail"/, "old dashboard collapsed inside V2.5");
  // The runner no longer wraps report content in its own ExpandableReportSection disclosures.
  assert.doesNotMatch(runner, /ExpandableReportSection/, "the runner no longer renders its own collapsed disclosures");
});

test("2 · the fast answer-first read stays ABOVE the single collapsed 'Advanced simulation detail' block", () => {
  const collapsed = v2.indexOf('AdvancedDisclosure label="Advanced simulation detail"');
  assert.ok(collapsed > 0, "the collapsed advanced block exists in the V2.5 report");
  // The primary read — matchup summary, player board, biggest leads — renders before the collapse.
  for (const marker of ['id="mlbr-summary"', 'title="Player simulation board"', 'title="Biggest model leads"']) {
    const at = v2.indexOf(marker);
    assert.ok(at > 0 && at < collapsed, `${marker} renders before the collapsed advanced block`);
  }
});

test("3 · disclosures are closed by default and mobile-safe (native <details>, no forced open)", () => {
  assert.match(comp, /defaultOpen = false/, "closed by default");
  assert.match(comp, /\{\.\.\.\(defaultOpen \? \{ open: true \} : \{\}\)\}/, "open only when explicitly asked");
  assert.match(comp, /overflow-x-auto/, "wide content scrolls inside the disclosure body (no page overflow)");
  assert.match(comp, /minHeight: 44/, "summary is a comfortable tap target");
  assert.doesNotMatch(comp, /<details[^>]*\sopen[>\s]/, "the <details> is not hard-coded open");
});

test("4 · the report (and its collapse) stays behind the Generate gate — postReveal only in the done phase", () => {
  const done = runner.indexOf('phase === "done"');
  const postReveal = runner.indexOf("{postReveal ?");
  assert.ok(done > 0 && postReveal > done, "the V2.5 report (postReveal) is injected inside the done-phase branch");
  // The collapsed advanced detail lives inside that gated report, never as a pre-click sibling.
  assert.match(v2, /AdvancedDisclosure label="Advanced simulation detail"/);
});

test("5 · each heavy section renders only when it has content — honest empty state otherwise", () => {
  // Player board — gated on real picks, with an honest empty state.
  assert.match(v2, /boardPicks\.length > 0 \?/, "player board gated on real picks");
  assert.ok(v2.includes("No simulated player lines for this game yet."), "player board has an honest empty state");
  // Distributions — gated on real, non-empty artifact bins, with an honest empty state.
  assert.match(v2, /distEntries\.length > 0 \?/, "distributions gated on real bins");
  assert.ok(v2.includes("No outcome-distribution bins for this game's props yet."), "distributions have an honest empty state");
});

test("6 · no banned copy in the answer-first surfaces", () => {
  for (const src of [comp]) assert.doesNotMatch(stripSafeArea(src), BANNED);
});

test("7 · money md5 unchanged — a pure UX change", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});

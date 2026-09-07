/**
 * DIRECT MLB GAME-DETAIL REPORT (P242) — pins the product rule that an MLB game-detail page which has a
 * simulation renders the FULL unified report DIRECTLY: one click on an event lands on the dashboard.
 * The old ceremony (Generate card, locked pills, ≥10-second staged reveal) is retired by founder
 * decision and must not return. The ONE-unified-report structure survives: the dense report,
 * spotlight and tabs still reach the page only through the runner's postReveal slot — as report
 * composition, no longer as a click gate.
 *
 * These are real-timer-free SOURCE assertions on the three components + a couple of functional/money checks.
 *
 *   1. The runner carries NO reveal gate: no SIMULATION_MIN_DURATION_MS, no timers, no phase state.
 *   2. The runner renders `postReveal` directly (null-guarded only — never phase-gated).
 *   3. game-detail-page MLB-sim passes report + spotlight + tabs through postReveal and does NOT render
 *      <MlbGameLabReport / spotlight / <SportShell as duplicate siblings on that path.
 *   4. The MLB-sim matchup hero uses TeamMark with detail.homeLogo/detail.awayLogo and drops the
 *      "Top pick"/"Top prop" price quick-reads.
 *   5. The WC / non-sim path renders its report/spotlight/tabs directly.
 *   6. The dormant animation module keeps honest content (team logos, diamond, 8 stages; no "10,000"/"Monte Carlo").
 *   7. No fabricated soccer data in the animation (no scoreline/first-scorer/xG/corner-kick/yellow-card); reduced-motion guard exists.
 *   8. No banned copy in game-detail-page.tsx + game-simulation-runner.tsx + simulation-animation.tsx.
 *   9. Canonical money file (portfolio.json) md5 unchanged.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { SIMULATION_MIN_DURATION_MS } from "../components/game/simulation-animation.tsx";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const DETAIL_SRC = read("src/components/game/game-detail-page.tsx");
const RUNNER_SRC = read("src/components/game/game-simulation-runner.tsx");
const ANIM_SRC = read("src/components/game/simulation-animation.tsx");

// The house honest-language ban for the runner + animation (copy I fully control). `\bsafe\b` / `\block\b`
// are whole words — "block"/"unlock" stay fine.
const BANNED =
  /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|can'?t lose|sure thing|risk-?free|free money|easy money|Monte Carlo|live betting/i;
// game-detail-page.tsx also carries the PRE-EXISTING World Cup parlay tier taxonomy ("Safe / Balanced /
// Aggressive") — a proper-noun product tier, not hype prose. The established project convention (see
// game-lab-mlb-report.test.mjs / simulator-first-ux.test.mjs, which already scan this file) bans the hype
// words but NOT the bare "safe" tier label, so we use that same regex for the page scan.
const BANNED_PAGE =
  /\bguaranteed\b|\block\b|\bsafest\b|can'?t lose|sure thing|risk-?free|free money|easy money|Monte Carlo|live betting/i;

// ── 1 · the runner has NO reveal gate — the ceremony stays retired (P242) ─────────────────────────
test("the runner has no reveal gate: no min-duration constant, no timers, no phase state", () => {
  // The dormant animation module still exports the historical constant unchanged…
  assert.equal(SIMULATION_MIN_DURATION_MS, 10000);
  // …but the runner references NONE of the ceremony machinery.
  assert.doesNotMatch(RUNNER_SRC, /SIMULATION_MIN_DURATION_MS/, "no min-duration gate in the runner");
  assert.doesNotMatch(RUNNER_SRC, /setTimeout|setInterval/, "no timers of any kind in the runner");
  assert.doesNotMatch(RUNNER_SRC, /useState|setPhase|"revealing"|"idle"/, "no phase machine in the runner");
  assert.doesNotMatch(RUNNER_SRC, /Generate Simulation/, "no Generate CTA in the runner");
});

// ── 2 · postReveal renders DIRECTLY (null-guarded only, never phase-gated) ─────────────────────────
test("the runner renders postReveal directly — null-guarded, never phase-gated", () => {
  // postReveal is a declared prop.
  assert.match(RUNNER_SRC, /postReveal\?: React\.ReactNode/, "postReveal is an optional ReactNode prop");
  // It renders as part of the direct dashboard, guarded only against absence — no phase condition.
  assert.match(RUNNER_SRC, /postReveal \? <div[^>]*>\{postReveal\}<\/div> : null/, "postReveal is null-guarded only");
  assert.doesNotMatch(RUNNER_SRC, /phase === /, "no phase conditions anywhere in the runner");
});

// ── 3 · the MLB-sim path composes report+spotlight+tabs through postReveal, NOT as duplicate siblings ─
test("MLB-sim page composes report + spotlight + tabs through postReveal (one report, no duplicate siblings)", () => {
  assert.match(DETAIL_SRC, /const isMlbSim = SIMULATION_SPORTS\.has\(detail\.sport\) && !!detail\.gameLabSimulation/, "the simulation gate is defined (sport-agnostic since P183)");
  // The detail is handed to the runner via postReveal — the ONE unified report (rendered directly since
  // P242), not a competing tabbed dashboard; the market snapshot node is threaded into the V2.5 report (§10).
  assert.match(DETAIL_SRC, /marketSnapshotNode=\{gameCenter\}/, "market snapshot node threaded into the V2.5 report");
  assert.match(DETAIL_SRC, /postReveal=\{mlbGameFirstReport\}/, "the unified report detail goes into postReveal (gated)");
  // The runner returns EARLY for the MLB-sim path, so the sibling report/spotlight/tabs render below is
  // unreachable for it. Assert the MLB-sim branch does its own return before the default render.
  const isMlbSimIdx = DETAIL_SRC.indexOf("if (isMlbSim) {");
  const defaultReturnIdx = DETAIL_SRC.indexOf("\n  return (", isMlbSimIdx);
  assert.ok(isMlbSimIdx > 0, "the MLB-sim branch exists");
  assert.ok(defaultReturnIdx > isMlbSimIdx, "the MLB-sim branch returns before the default layout");
  // Inside the MLB-sim branch, the report/spotlight/tabs are NOT rendered as bare siblings — only via the
  // runner's postReveal. The branch body must not contain a standalone <MlbGameLabReport or <SportShell.
  const mlbBranch = DETAIL_SRC.slice(isMlbSimIdx, defaultReturnIdx);
  assert.ok(!/<MlbGameLabReport/.test(mlbBranch), "no always-visible <MlbGameLabReport in the MLB-sim branch");
  assert.ok(!/<SportShell/.test(mlbBranch), "no always-visible <SportShell in the MLB-sim branch");
  assert.ok(!mlbBranch.includes("{spotlight}") || mlbBranch.includes("postReveal={<>{gameCenter}{mlbReport}{spotlight}{tabsShell}</>}"), "spotlight only appears inside postReveal");
  // The runner is the whole experience on this path.
  assert.match(mlbBranch, /<GameSimulationRunner\s+view=\{sim\}/, "the runner drives the MLB-sim page");
});

// ── 4 · the MLB-sim matchup hero uses TeamMark + logos and DROPS the price quick-reads ─────────────
test("the MLB-sim matchup hero uses TeamMark with detail.homeLogo/detail.awayLogo and drops Top pick/Top prop", () => {
  const isMlbSimIdx = DETAIL_SRC.indexOf("if (isMlbSim) {");
  const defaultReturnIdx = DETAIL_SRC.indexOf("\n  return (", isMlbSimIdx);
  const mlbBranch = DETAIL_SRC.slice(isMlbSimIdx, defaultReturnIdx);
  // TeamMark with the real MLB logo URLs (away @ home).
  assert.match(mlbBranch, /<TeamMark name=\{detail\.awayTeam\} logoUrl=\{detail\.awayLogo\}/, "away TeamMark uses detail.awayLogo");
  assert.match(mlbBranch, /<TeamMark name=\{detail\.homeTeam\} logoUrl=\{detail\.homeLogo\}/, "home TeamMark uses detail.homeLogo");
  // A "Simulation Ready" badge is present, but NO posted-price quick reads.
  assert.match(mlbBranch, /Simulation Ready/, "the hero carries a Simulation Ready badge");
  assert.ok(!/Top pick ·/.test(mlbBranch), "the MLB-sim hero drops the 'Top pick' price quick-read");
  assert.ok(!/Top prop ·/.test(mlbBranch), "the MLB-sim hero drops the 'Top prop' price quick-read");
  // The runner is passed the logos so the animation can render team marks.
  assert.match(mlbBranch, /homeLogo=\{detail\.homeLogo\}/, "home logo threaded to the runner");
  assert.match(mlbBranch, /awayLogo=\{detail\.awayLogo\}/, "away logo threaded to the runner");
});

// ── 5 · the WC / non-sim path is UNCHANGED (world_cup still renders report/spotlight/tabs directly) ─
test("the WC / non-sim path is unchanged — world_cup renders its report + spotlight + tabs directly", () => {
  // The default return (reached for world_cup / MLB-without-sim / NBA / UFC) still renders the WC report,
  // the spotlight, and the tabs shell as direct siblings (NOT gated).
  const defaultReturnIdx = DETAIL_SRC.indexOf("\n  return (", DETAIL_SRC.indexOf("if (isMlbSim) {"));
  const defaultBlock = DETAIL_SRC.slice(defaultReturnIdx);
  assert.match(defaultBlock, /detail\.gameLabWc \? <div[^>]*><WcGameLabReport view=\{detail\.gameLabWc\}/, "WC report renders directly on the default path");
  assert.match(defaultBlock, /<div className="mb-5">\{spotlight\}<\/div>/, "the Model spotlight renders directly on the default path");
  assert.match(defaultBlock, /\{tabsShell\}/, "the price tabs render directly on the default path");
  // The default hero KEEPS the Top pick / Top prop quick-reads (unchanged for non-MLB-sim).
  assert.match(defaultBlock, /Top pick · /, "the default hero keeps the Top pick quick-read");
  assert.match(defaultBlock, /Top prop · /, "the default hero keeps the Top prop quick-read");
});

// ── 6 · the animation renders team logos + a diamond + 8 stages; 1,000-run gated; no 10,000/Monte Carlo ─
test("the animation renders team logos (TeamMark) + a diamond + 8 stages; run-count gated; no 10,000 / Monte Carlo", () => {
  // Team marks via the shared TeamMark component (logo → monogram fallback).
  assert.match(ANIM_SRC, /import TeamMark from "@\/components\/ui\/team-mark"/, "the animation imports TeamMark");
  assert.match(ANIM_SRC, /<TeamMark name=\{name\} logoUrl=\{logoUrl\}/, "team logos render via TeamMark (monogram fallback when null)");
  // The baseball diamond + 8-stage checklist survive.
  assert.match(ANIM_SRC, /diamond/i, "a diamond is drawn");
  assert.match(ANIM_SRC, /\bmound\b/i, "the mound is drawn");
  assert.match(ANIM_SRC, /home plate/i, "home plate is drawn");
  assert.match(ANIM_SRC, /SIMULATION_STAGES\.map/, "the 8-stage checklist maps the stage list");
  // Run-count claim gated; a real 1,000-run claim is allowed only behind allowsRunCountClaim — never a
  // fabricated 10,000-run claim, never a "Monte Carlo" method name.
  assert.match(ANIM_SRC, /view\.allowsRunCountClaim && view\.runCount != null/, "run-count copy gated on allowsRunCountClaim");
  // No fabricated 10,000-RUN claim (the bare 10000 constant is the 10s timer, not a run count — so key on
  // the run/runs/simulation context, mirroring simulation-animation.test.mjs).
  assert.doesNotMatch(ANIM_SRC, /10[,.]?000[\s-]?(?:run|runs|simulation)/i, "no fabricated 10,000-run claim");
  assert.doesNotMatch(ANIM_SRC, /monte[\s-]?carlo/i, "no Monte Carlo method-name claim");
});

// ── 7 · no fabricated soccer data in the animation; reduced-motion guard exists ────────────────────
test("no fabricated soccer data in the animation; a reduced-motion guard exists", () => {
  assert.ok(
    !/scoreline|first[\s_-]?scorer|firstScorer|\bxg\b|corner[\s_-]?kick|yellow[\s_-]?card|red[\s_-]?card|\bbookings\b/i.test(ANIM_SRC),
    "no fake scoreline / first-scorer / xG / corner-kicks / cards in the animation",
  );
  assert.match(ANIM_SRC, /@media \(prefers-reduced-motion: reduce\)/, "a CSS reduced-motion guard exists");
  // Reduced motion is handled purely in CSS — never a JS gate that would stop the stages advancing.
  assert.doesNotMatch(ANIM_SRC, /matchMedia|useReducedMotion/, "reduced motion is CSS-only, never a JS gate on the stages");
});

// ── 8 · no banned copy across the three touched components ─────────────────────────────────────────
test("no banned copy in game-detail-page + game-simulation-runner + simulation-animation", () => {
  assert.ok(!BANNED_PAGE.test(DETAIL_SRC), "no banned copy in game-detail-page.tsx (WC 'Safe' tier label excepted per project convention)");
  assert.ok(!BANNED.test(RUNNER_SRC), "no banned copy in game-simulation-runner.tsx");
  assert.ok(!BANNED.test(ANIM_SRC), "no banned copy in simulation-animation.tsx");
  // Whole-word sanity — "unlock"/"block" are allowed.
  assert.ok(!BANNED.test("this will unlock and block the flow"), "unlock/block are not banned");
  // The runner + animation carry NO 'safe' at all (I control every string there).
  assert.ok(!/\bsafe\b/i.test(RUNNER_SRC), "the runner never uses the word 'safe'");
  assert.ok(!/\bsafe\b/i.test(ANIM_SRC), "the animation never uses the word 'safe'");
});

// ── 9 · canonical money file untouched ─────────────────────────────────────────────────────────────
test("canonical money file (portfolio.json) md5 is unchanged", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json money file must be untouched");
});

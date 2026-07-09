/**
 * GATED MLB GAME-DETAIL + PREMIUM REVEAL — pins the product rule that an MLB game-detail page which has a
 * simulation shows a CLEAN matchup hero + the Generate card ONLY before the click, and gates the dense
 * model report, Model spotlight, posted prices, prop tables, distributions, and the price tabs BEHIND the
 * ≥10-second reveal (CONDITIONAL RENDER via postReveal in the done phase — absent from the pre-click DOM).
 *
 * These are real-timer-free SOURCE assertions on the three components + a couple of functional/money checks.
 *
 *   1. SIMULATION_MIN_DURATION_MS === 10000; the done phase is gated on the CONSTANT (no sub-10s literal).
 *   2. The runner renders `postReveal` ONLY in the done phase (guarded by `phase === "done"`), never idle/revealing.
 *   3. game-detail-page MLB-sim passes report + spotlight + tabs to postReveal and does NOT render
 *      <MlbGameLabReport / spotlight / <SportShell as always-visible siblings on that path.
 *   4. The MLB-sim matchup hero uses TeamMark with detail.homeLogo/detail.awayLogo and drops the
 *      "Top pick"/"Top prop" price quick-reads.
 *   5. The WC / non-sim path is unchanged (world_cup still renders its report/spotlight/tabs directly).
 *   6. The animation renders team logos (TeamMark) + a diamond + 8 stages; "1,000-run" only when allowed; no "10,000"/"Monte Carlo".
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

// ── 1 · the done phase is gated on the 10s constant, never a sub-10s numeric literal ──────────────
test("SIMULATION_MIN_DURATION_MS === 10000 and the done phase is gated on the constant (no sub-10s literal)", () => {
  assert.equal(SIMULATION_MIN_DURATION_MS, 10000);
  // Reuse simulation-animation.test.mjs's assertion style: every setTimeout that sets phase "done" must
  // use the constant as its delay, and NO numeric-literal timer may set the done phase.
  const doneTimerRe = /window\.setTimeout\(\s*\(\)\s*=>\s*\{[^}]*setPhase\("done"\)[^}]*\},\s*([A-Za-z0-9_.]+)\s*\)/g;
  const matches = [...RUNNER_SRC.matchAll(doneTimerRe)];
  assert.ok(matches.length >= 1, "expected a setTimeout that reveals the dashboard");
  for (const m of matches) {
    assert.equal(m[1], "SIMULATION_MIN_DURATION_MS", `done-phase timer delay must be the constant, got "${m[1]}"`);
  }
  assert.doesNotMatch(
    RUNNER_SRC,
    /window\.setTimeout\(\s*\(\)\s*=>\s*\{[^}]*setPhase\("done"\)[^}]*\},\s*\d+\s*\)/,
    "the done phase must NOT be set on a numeric (sub-10s) timer",
  );
});

// ── 2 · postReveal renders ONLY in the done phase (not idle / not revealing) ───────────────────────
test("the runner renders postReveal ONLY in the done phase", () => {
  // postReveal is a declared prop.
  assert.match(RUNNER_SRC, /postReveal\?: React\.ReactNode/, "postReveal is an optional ReactNode prop");
  // The ONLY render of `{postReveal}` is inside the `phase === "done"` block. We assert the postReveal
  // render appears AFTER the done gate and BEFORE the next phase check, and that no idle/revealing branch
  // references postReveal.
  const doneIdx = RUNNER_SRC.indexOf('phase === "done"');
  const postRevealIdx = RUNNER_SRC.indexOf("{postReveal}");
  assert.ok(doneIdx > 0, "a done-phase branch exists");
  assert.ok(postRevealIdx > doneIdx, "postReveal is rendered inside the done-phase block (after the done gate)");
  // It is conditionally rendered (postReveal ? ... : null) — not an always-on sibling.
  assert.match(RUNNER_SRC, /postReveal \? <div[^>]*>\{postReveal\}<\/div> : null/, "postReveal is conditionally rendered in done");
  // The idle branch must NOT reference postReveal (nothing gated leaks pre-click).
  const idleBlock = RUNNER_SRC.slice(RUNNER_SRC.indexOf('phase === "idle"'), RUNNER_SRC.indexOf('phase === "revealing"'));
  assert.ok(!idleBlock.includes("postReveal"), "the idle (pre-click) branch never renders postReveal");
  const revealingBlock = RUNNER_SRC.slice(RUNNER_SRC.indexOf('phase === "revealing"'), doneIdx);
  assert.ok(!revealingBlock.includes("postReveal"), "the revealing branch never renders postReveal");
});

// ── 3 · the MLB-sim path passes report+spotlight+tabs to postReveal, NOT as always-visible siblings ─
test("MLB-sim page gates report + spotlight + tabs behind the reveal via postReveal (not pre-click siblings)", () => {
  assert.match(DETAIL_SRC, /const isMlbSim = detail\.sport === "mlb" && !!detail\.gameLabSimulation/, "the MLB-sim gate is defined");
  // The gated detail is handed to the runner via postReveal — now the ONE unified report (mlbReportDetails),
  // not a competing tabbed dashboard; the market snapshot leads the runner via marketSnapshot.
  assert.match(DETAIL_SRC, /marketSnapshot=\{gameCenter\}/, "market snapshot threaded into the runner");
  assert.match(DETAIL_SRC, /postReveal=\{mlbReportDetails\}/, "the unified report detail goes into postReveal (gated)");
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

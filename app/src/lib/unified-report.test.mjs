/**
 * SINGLE UNIFIED SIMULATION REPORT (2026-07-09) — one report, not runner + competing tabs.
 *
 * The post-generate game report is now ONE spine: the runner owns header → market snapshot → simulator
 * output → main read → top leans → key takeaways → collapsed diagnostics, and the remaining detail is a
 * small stack of collapsed disclosures (NOT a `PostRevealTabs` dashboard). These checks pin: the market
 * snapshot leads the runner, the detail is the gated `mlbReportDetails` / `wcReport` postReveal, the
 * strongest lean is de-duplicated (Central read only, not repeated as takeaway cards), soccer stays
 * market-implied with NO run-count claim, MLB keeps its 10,000-run wording, details are collapsed, the
 * gate is intact, and `PostRevealTabs` no longer drives the game report.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|free money|can'?t lose|sure thing|risk-?free/i;
const stripSafeArea = (s) => s.replace(/safe-area[a-z-]*/gi, "");

const detailPage = read("src/components/game/game-detail-page.tsx");
const runner = read("src/components/game/game-simulation-runner.tsx");
const panels = read("src/components/game/game-dashboard-panels.tsx");

test("1 · the market snapshot leads the report (threaded into the runner as section 2)", () => {
  assert.match(detailPage, /marketSnapshot=\{gameCenter\}/, "MLB market snapshot goes into the runner");
  assert.match(runner, /marketSnapshot\?: React\.ReactNode/, "runner accepts a market snapshot");
  // It renders before the model output (priced-prop snapshot).
  const ms = runner.indexOf("gtp-market-snapshot");
  const model = runner.indexOf("<PricedPropSnapshot");
  assert.ok(ms > 0 && ms < model, "market snapshot renders before the simulator output");
});

test("2 · the report is ONE unified spine — no competing PostRevealTabs dashboard", () => {
  assert.match(detailPage, /postReveal=\{mlbReportDetails\}/, "MLB detail is the unified postReveal");
  assert.match(detailPage, /postReveal=\{wcReport\}/, "WC detail is the unified postReveal");
  assert.doesNotMatch(detailPage, /PostRevealTabs/, "game-detail no longer uses the tabbed dashboard");
  assert.doesNotMatch(detailPage, /mlbDashTabs|wcDashTabs/, "the old tab arrays are gone");
});

test("3 · remaining detail is a stack of COLLAPSED disclosures (not tabs)", () => {
  assert.match(detailPage, /mlbReportDetails = \([\s\S]*?ExpandableReportSection title="Player props by market"/, "player props collapsed");
  assert.match(detailPage, /mlbReportDetails = \([\s\S]*?ExpandableReportSection title="Advanced report"/, "advanced report collapsed");
  // WC now leads with SoccerSimulationReportV2; the OLD dashboard (FreeSim shell + Game Center) is demoted into
  // V2's collapsed "advanced" block — the primary flow is clean sections, not an odds dashboard.
  assert.match(detailPage, /wcAdvanced = \([\s\S]*?<MultiSportReportShell[\s\S]*?<WcGameCenter/, "old dashboard demoted into wcAdvanced");
  assert.match(detailPage, /wcReport = \(\s*<SoccerSimulationReportV2[\s\S]*?advanced=\{wcAdvanced\}/, "WC report is the V2 report with the dashboard collapsed inside it");
  assert.match(detailPage, /wcSecondary = \([\s\S]*?ExpandableReportSection title="Advanced report"/, "secondary WC detail stays collapsed");
});

test("4 · the strongest lean is de-duplicated — Central read is the single hero", () => {
  // MainTakeaways drops the strongest_lean + biggest_edge cards (they duplicated Central read).
  assert.match(runner, /filter\(\(t\) => t\.key !== "strongest_lean" && t\.key !== "biggest_edge"\)/, "takeaways drop the duplicated strongest-lean cards");
  // Central read still renders once as the single strongest lean.
  assert.match(runner, /Central read/, "Central read remains the one main-read hero");
});

test("5 · soccer stays market-implied (NO run-count claim); MLB keeps its 10,000-run wording", () => {
  assert.match(panels, /10,000-run/, "MLB methodology keeps the (dynamic) 10,000-run wording");
  assert.match(panels, /market-implied/i, "soccer labelled market-implied");
  assert.match(panels, /no run-based simulation engine for soccer|not.{0,25}sampled simulation/i, "soccer denies a run-based sim");
  // The WC unified report path (wcReport) makes no run-count claim in game-detail.
  const wcIdx = detailPage.indexOf("wcReport = (");
  const wcBlock = detailPage.slice(wcIdx, wcIdx + 1200);
  assert.doesNotMatch(wcBlock, /10,?000[- ]?run/i, "no 10,000-run claim in the WC unified report");
});

test("6 · the gate is intact — the unified detail is only in postReveal (done phase)", () => {
  // The runner renders postReveal only in the done phase (existing gate); game-detail hands the detail
  // via postReveal, never as a pre-click sibling.
  assert.match(runner, /phase === "done"[\s\S]*?\{postReveal \?/, "postReveal renders in the done phase");
  // Neither MLB report content nor WcGameCenter is rendered as a bare sibling in the sim branches.
  const mlbIdx = detailPage.indexOf("if (isMlbSim) {");
  const mlbEnd = detailPage.indexOf("\n  return (", mlbIdx);
  const mlbBranch = detailPage.slice(mlbIdx, mlbEnd);
  assert.ok(!/<MlbGameLabReport/.test(mlbBranch) && !/<MlbGameCenter/.test(mlbBranch), "no bare report/game-center sibling in the MLB-sim branch");
});

test("7 · no banned copy in the unified-report surfaces", () => {
  for (const src of [runner, panels]) assert.doesNotMatch(stripSafeArea(src), BANNED);
});

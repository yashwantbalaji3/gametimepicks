/**
 * SINGLE UNIFIED SIMULATION REPORT — one report, not runner + competing tabs.
 *
 * The post-generate game report is now ONE spine: the runner's done phase is just [ "Simulation complete"
 * header → the V2.5 report (postReveal) → a paper-only disclaimer → post-reveal nav ]. The primary V2.5
 * report (`mlb-simulation-report-v2.tsx`) owns the market snapshot (its §10), the player board, the biggest
 * model leads, agreement, and distributions, and the old dense dashboard is demoted into ONE collapsed
 * "Advanced simulation detail" block INSIDE that report. These checks pin: the market snapshot renders once
 * (in the V2.5 report, never a competing copy in the runner), the detail is the gated
 * `mlbReportDetails` / `wcReport` postReveal, the strongest lean is de-duplicated (the V2.5 report is the
 * single hero surface — the runner no longer renders competing CentralRead / MainTakeaways cards), soccer
 * stays market-implied with NO run-count claim, MLB keeps its 10,000-run wording, details are collapsed, the
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

test("1 · the market snapshot renders ONCE, inside the primary V2.5 report — not duplicated in the runner", () => {
  const v2 = read("src/components/game/mlb-simulation-report-v2.tsx");
  // The snapshot NODE is threaded into the V2.5 report (its §10), not rendered by the runner.
  assert.match(detailPage, /marketSnapshotNode=\{gameCenter\}/, "MLB market snapshot node goes into the V2.5 report");
  assert.match(v2, /gtp-market-snapshot/, "V2.5 renders the market snapshot (§10)");
  assert.doesNotMatch(runner, /gtp-market-snapshot/, "the runner no longer renders a competing market snapshot above the report");
  // The runner's done phase reveals the V2.5 report (postReveal) as the single PRIMARY report.
  const primary = runner.indexOf("PRIMARY REPORT");
  const postReveal = runner.indexOf("{postReveal ?");
  assert.ok(primary > 0 && postReveal > primary, "the V2.5 report is revealed as the single primary report");
  // The old dense dashboard is demoted into ONE collapsed 'Advanced simulation detail' block — now inside
  // the V2.5 report, not the runner.
  assert.match(v2, /AdvancedDisclosure label="Advanced simulation detail"/, "advanced detail collapsed inside the V2.5 report");
  assert.doesNotMatch(runner, /Advanced simulation detail/, "the runner no longer owns the collapsed advanced block");
});

test("2 · the report is ONE unified spine — no competing PostRevealTabs dashboard", () => {
  assert.match(detailPage, /postReveal=\{mlbGameFirstReport\}/, "MLB detail is the unified postReveal");
  assert.match(detailPage, /postReveal=\{wcReport\}/, "WC detail is the unified postReveal");
  assert.doesNotMatch(detailPage, /PostRevealTabs/, "game-detail no longer uses the tabbed dashboard");
  assert.doesNotMatch(detailPage, /mlbDashTabs|wcDashTabs/, "the old tab arrays are gone");
});

test("3 · remaining detail is a stack of COLLAPSED disclosures (not tabs)", () => {
  // MLB now leads with MlbSimulationReportV2; the old accordions are demoted into its collapsed `advanced` block.
  assert.match(detailPage, /mlbAdvanced = \([\s\S]*?ExpandableReportSection title="Player props by market"/, "player props collapsed in mlbAdvanced");
  assert.match(detailPage, /mlbAdvanced = \([\s\S]*?ExpandableReportSection title="Advanced report"/, "advanced report collapsed in mlbAdvanced");
  assert.match(detailPage, /mlbReportDetails = \(\s*<MlbSimulationReportV2[\s\S]*?advanced=\{mlbAdvanced\}/, "MLB report is the V2 report with the accordions collapsed inside");
  // WC now leads with SoccerSimulationReportV2; the OLD dashboard (FreeSim shell + Game Center) is demoted into
  // V2's collapsed "advanced" block — the primary flow is clean sections, not an odds dashboard.
  assert.match(detailPage, /wcAdvanced = \([\s\S]*?<MultiSportReportShell[\s\S]*?<WcGameCenter/, "old dashboard demoted into wcAdvanced");
  assert.match(detailPage, /wcReport = \(\s*<SoccerSimulationReportV2[\s\S]*?advanced=\{wcAdvanced\}/, "WC report is the V2 report with the dashboard collapsed inside it");
  assert.match(detailPage, /wcSecondary = \([\s\S]*?ExpandableReportSection title="Advanced report"/, "secondary WC detail stays collapsed");
});

test("4 · the strongest lean is de-duplicated — the V2.5 report is the single hero surface", () => {
  const v2 = read("src/components/game/mlb-simulation-report-v2.tsx");
  // The runner no longer renders its own competing takeaway cards / central-read block — the removed
  // MainTakeaways + CentralRead apparatus is gone, so nothing duplicates the strongest lean above the report.
  assert.doesNotMatch(runner, /<MainTakeaways/, "no competing MainTakeaways card grid in the runner");
  assert.doesNotMatch(runner, /<CentralRead/, "no competing CentralRead block in the runner");
  // The strongest lean surfaces once, in the V2.5 report's single 'Biggest model leads' watchlist.
  assert.ok(v2.includes("Biggest model leads"), "the V2.5 report owns the one strongest-lean surface");
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

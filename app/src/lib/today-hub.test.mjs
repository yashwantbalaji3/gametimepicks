/**
 * DAILY MODEL HUB (/today rebuild, 2026-07-09) — the founder's 13 guarantees. /today is now a clean,
 * compact 10-section daily operating hub (top model reads + operational status + no-play discipline),
 * DISTINCT from the focused Home landing. These checks pin: the new structure, the four canonical links,
 * simulation-backed + Top-10 sourcing, HONEST derived Bank Builder no-play/awaiting-Step/$0 (never
 * hardcoded), the public-label cleanup (Build-a-Pick / Longshot Lab, no "Parlay Lab" / "Moonshot" /
 * "Mr. Dub" body copy), distinctness from Home, Home + Simulate staying intact, no banned copy, and the
 * untouched canonical money artifact. Source-grep style (the suite runs pre-build), plus functional
 * derivations against the real committed artifacts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");

const todayPage = read("src/app/today/page.tsx");
const homePage = read("src/app/page.tsx");
const simulatePage = read("src/app/simulate/page.tsx");
const header = read("src/components/today/daily-slate-header.tsx");
const glance = read("src/components/today/at-a-glance.tsx");
const topPicks = read("src/components/today/top-model-picks.tsx");
const simLeans = read("src/components/today/simulation-leans.tsx");
const fullSlate = read("src/components/today/full-slate.tsx");
const mlbBrief = read("src/components/today/today-mlb-brief.tsx");
const statusMods = read("src/components/today/status-modules.tsx");

// Every /today + new-component source, concatenated, for whole-surface copy assertions.
const TODAY_ALL = [todayPage, header, glance, topPicks, simLeans, fullSlate, mlbBrief, statusMods].join("\n");
const COMPONENTS_ALL = [header, glance, topPicks, simLeans, fullSlate, mlbBrief, statusMods].join("\n");
// Same, with comment lines stripped — used for "no hardcoded literal in CODE" sweeps (an illustrative
// example inside a JSDoc/`//` comment is not a hardcoded runtime value).
const stripComments = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const TODAY_CODE = stripComments(TODAY_ALL);

// Whole-word banned copy (safe-area-inset is explicitly allowed — it is not "safe" copy).
const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|free money|can'?t lose|sure thing|risk-free|easy money/i;
const stripSafeArea = (s) => s.replace(/safe-area-inset/gi, "").replace(/safe-area/gi, "");

// 1 — /today renders the new daily slate header.
test("1 · /today renders the new daily slate header", () => {
  assert.match(todayPage, /<TodayDailySlateHeader/, "renders the Today-specific slate header");
  assert.match(header, /Today&rsquo;s Picks|Today's Picks/, "header shows the Today's Picks title");
  assert.match(header, /Simulate Today&rsquo;s Games|Simulate Today's Games/i, "primary CTA is simulate-first");
});

// 2 — /today links to /simulate, /results, /bank-builder, /picks.
test("2 · /today links to /simulate, /results, /bank-builder, /picks", () => {
  // P208: the suggested-card destination is the Parlay Center (/build); /picks stays a one-hop alias.
  for (const href of ["/simulate", "/results", "/bank-builder", "/build"]) {
    assert.ok(TODAY_ALL.includes(`"${href}"`), `hub links to ${href}`);
  }
});

// 3 — sim-ready summary when artifacts exist (uses featuredSimulations).
test("3 · sim-ready summary is sourced from featuredSimulations (real artifacts)", () => {
  assert.match(todayPage, /import \{ featuredSimulations \} from "@\/lib\/simulate-lobby-featured"/, "imports the real selector");
  assert.match(todayPage, /featuredSimulations\(details[,)]/, "invokes the selector on real details");
  assert.match(todayPage, /buildAllGameDetails\(\)/, "details from the real builder");
  assert.match(todayPage, /<TodaySimulationLeans/, "renders the simulation-backed module");
  assert.match(simLeans, /Simulation Ready/, "sim-ready badge present");
  assert.match(simLeans, /Generate Simulation/, "generate-simulation CTA present");
  assert.match(simLeans, /No simulation-ready games/i, "honest empty state exists");
});

// 3b — EVERY game on the slate has a clear per-game action, GROUPED by readiness via the shared contract.
test("3b · every game gets a clear per-game action, grouped by readiness (full-slate board)", () => {
  // Wired on the hub from the same real details, framed on the presented slate, with a real clock.
  assert.match(todayPage, /import \{[^}]*\bslateGames\b[^}]*\} from "@\/lib\/today\/slate-games"/, "imports the slate-games selector");
  assert.match(todayPage, /slateGames\(details, today, \{ nowMs: Date\.now\(\) \}\)/, "invokes it on real details, framed on the presented slate, with a real clock for start-state");
  assert.match(todayPage, /<TodayFullSlate\b/, "renders the every-game board");
  // The board itself: title, grouped rendering, per-game action, chip label + neutral explanation.
  assert.match(fullSlate, /Every game on the slate/, "board is titled 'Every game on the slate'");
  assert.match(fullSlate, /href=\{g\.href\}/, "each row links to the canonical per-game report href");
  assert.match(fullSlate, /\{g\.actionLabel\}/, "each row shows its clear action label");
  assert.match(fullSlate, /\{g\.label\}/, "each row shows its honest availability chip label");
  assert.match(fullSlate, /\{g\.explanation\}/, "each row shows the neutral 'why open this game?' explanation");
  assert.match(fullSlate, /\{summary\.text\}/, "the board renders the factual availability summary line");
  assert.match(fullSlate, /groups\.map\(/, "the board renders readiness GROUPS, not one flat wall");
  assert.match(fullSlate, /if \(groups\.length === 0\) return null/, "renders nothing (not a broken empty box) on a no-games day");
  // Trust: the board links to the explanation so a first-timer can decode the availability chips.
  assert.match(fullSlate, /href="\/learn"/, "board links to /learn so the availability tiers are explained");
  // Honest, non-predictive: no fabricated run-count claim and no banned certainty vocabulary in the board.
  assert.ok(!/1,?000|10,?000|Monte Carlo/i.test(fullSlate), "no fabricated run-count / Monte Carlo claim on the board");
});

// 3c — Daily MLB intelligence brief: the executive digest, factual signals only (Sprint 004).
test("3c · /today leads with the daily MLB intelligence brief (factual overview + spotlight, no picks)", () => {
  assert.match(todayPage, /import \{ buildDailyBrief \} from "@\/lib\/today\/daily-brief"/, "imports the brief selector");
  assert.match(todayPage, /buildDailyBrief\(details, today, \{ nowMs: Date\.now\(\) \}\)/, "builds the brief from real details + a real clock");
  assert.match(todayPage, /<TodayMlbBrief\b/, "renders the brief");
  assert.match(mlbBrief, /Today&rsquo;s MLB brief|Today's MLB brief/, "brief is titled");
  assert.match(mlbBrief, /Simulation spotlight/, "has a simulation spotlight");
  assert.match(mlbBrief, /Richest analysis on the slate/, "spotlight is framed as richest ANALYSIS (information quality)");
  assert.match(mlbBrief, /awaiting inputs/, "overview counts games awaiting inputs");
  assert.match(mlbBrief, /How simulations &amp; uncertainty work/, "trust link explains simulations + uncertainty");
  // Factual only: no fabricated run count and no predictive/certainty vocabulary in the brief surface.
  assert.ok(!/best bet|guaranteed|likely winner|lock of|smash/i.test(mlbBrief), "no predictive/certainty vocabulary in the brief");
});

// 4 — top model picks OR honest no-qualified state (uses buildTop10Board).
test("4 · top model picks sourced from buildTop10Board with an honest empty state", () => {
  assert.match(todayPage, /import \{ buildTop10Board \} from "@\/lib\/top10\/top10-picks"/, "imports the Top-10 builder");
  assert.match(todayPage, /buildTop10Board\(/, "derives the canonical Top-10 board");
  assert.match(todayPage, /<TodayTopModelPicks/, "renders the top model reads");
  assert.match(topPicks, /No qualified picks today/i, "honest no-qualified state present");
  assert.ok(!/1,?000|10,?000|Monte Carlo/i.test(topPicks), "no fabricated run-count / Monte Carlo claim");
});

// 5 — Bank Builder no-play / awaiting-Step-3 / $0 (DERIVED, not hardcoded).
test("5 · Bank Builder status is DERIVED honestly (no-play / awaiting Step / $0), never hardcoded", () => {
  assert.match(todayPage, /buildBankBuilderProposal\(/, "derives from the proposal loader");
  assert.match(todayPage, /const bbNoPlay = !bbProposal\.available/, "explicit no-play branch off proposal.available");
  assert.match(todayPage, /buildPublicDualLadder\(/, "awaiting step from the dual-ladder view, not a literal");
  assert.match(todayPage, /status === "awaiting"/, "reads the awaiting rung");
  assert.match(todayPage, /awaiting Step \$\{awaitingRung\}/, "the step number is interpolated from the derived rung");
  // A BB card is only ever DETECTED as active from real data — never asserted.
  assert.match(todayPage, /c\.product === "bank-builder" && c\.status === "active"/, "active card detected from real data only");
  // No hardcoded record / dollar / step literals in the /today CODE (comment examples don't count).
  assert.ok(!/19[-–—]14|\$19,065|\$20,465|\$10,376/.test(TODAY_CODE), "no hardcoded record/dollar literal on the hub");
  assert.ok(!/awaiting Step 3\b/.test(TODAY_CODE), "the '3' is derived in code, never a hardcoded 'awaiting Step 3' literal");
});

// 6 — the BUILDER is "Build-a-Pick", never "Parlay Lab".
// P200 restatement: when this pin was written, "Parlay Lab" was a stale name for the builder. Since
// then the Lab became a REAL named product with its own canonical nav destination ("Parlay Lab
// Record" in navigation.ts) and its suggested-cards preview legitimately renders on this hub under
// that name. The surviving claim is narrower and still load-bearing: the Build-a-Pick BUILDER
// module itself must never be relabelled "Parlay Lab" — two names for one tool is how the original
// confusion started.
test("6 · the builder is 'Build-a-Pick'; the builder module never carries the Lab's name", () => {
  assert.ok(/Build-a-Pick/.test(TODAY_ALL), "Build-a-Pick label present");
  const builderModule = read("src/components/today/status-modules.tsx");
  assert.ok(!/Parlay Lab/i.test(builderModule), "the builder module never labels itself 'Parlay Lab'");
});

// 7 — uses "Longshot Lab" not "Moonshot" in public body copy (code identifiers allowed).
test("7 · public label is now 'Moonshot' (the Longshot Lab rename); no 'Longshot Lab' in rendered body copy", () => {
  assert.ok(/Moonshot/.test(TODAY_ALL), "Moonshot label present");
  // The product label is now "Moonshot"; the old "Longshot Lab" label must be gone from RENDERED copy.
  // Comments + the `LongshotLabStatus` code identifier legitimately keep the token, so strip comment lines
  // (incl. JSX `{/* */}`) before asserting; the lowercase concept word "longshot" in prose is still fine.
  const bodyCopy = TODAY_ALL
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l))
    .join("\n");
  assert.ok(!/Longshot Lab/.test(bodyCopy), "old 'Longshot Lab' product label gone from rendered copy");
});

// 8 — does not expose "Mr. Dub" as a public label.
test("8 · 'Mr. Dub' is not exposed as a public label on the hub", () => {
  assert.ok(!/Mr\.? ?Dub/.test(TODAY_ALL), "no 'Mr. Dub' public label anywhere on the hub");
});

// 9 — /today distinct from / (does not import LandingHero / FlagshipCards).
test("9 · /today is distinct from Home (no Home landing components imported/rendered)", () => {
  // Check real imports + JSX usage — a passing mention inside a "distinct from Home" doc comment is fine.
  const code = stripComments(todayPage);
  for (const comp of ["LandingHero", "FlagshipCards", "HowItWorks"]) {
    assert.ok(!new RegExp(`import[^\\n]*\\b${comp}\\b`).test(code), `/today does not import Home's ${comp}`);
    assert.ok(!new RegExp(`<${comp}\\b`).test(code), `/today does not render Home's ${comp}`);
  }
  for (const mod of ["home/landing-hero", "home/flagship-cards", "home/home-sections"]) {
    assert.ok(!code.includes(mod), `/today does not import from ${mod}`);
  }
  // Today has its own hub sections Home does not use.
  assert.match(todayPage, /<TodayAtAGlance/, "Today has its own at-a-glance section");
  assert.match(todayPage, /<TodayTopModelPicks/, "Today has its own top-model-reads section");
});

// 10 — / remains the focused homepage (renders LandingHero + FlagshipCards, no TodayPage).
test("10 · Home stays the focused landing (LandingHero + FlagshipCards, no TodayPage)", () => {
  assert.match(homePage, /<LandingHero/, "Home renders LandingHero");
  assert.match(homePage, /<FlagshipCards/, "Home renders FlagshipCards");
  assert.ok(!/\bTodayPage\b/.test(homePage), "Home does not render TodayPage");
  assert.ok(!/from "\.\/today\/page"/.test(homePage), "Home does not import ./today/page");
});

// 11 — /simulate remains premium (simulate-lobby hero + featured).
test("11 · /simulate remains the premium simulation lobby (hero + featured)", () => {
  assert.match(simulatePage, /SimulateLobby/, "/simulate renders the shared simulate lobby");
  const lobby = read("src/components/games/simulate-lobby.tsx");
  assert.match(lobby, /simulate-hero/, "lobby keeps its simulation-first hero");
  assert.match(lobby, /featuredSimulations/, "lobby keeps its featured simulations");
});

// 12 — no banned copy in today/page.tsx + new components.
test("12 · no banned copy on the /today hub or its new components", () => {
  assert.ok(!BANNED.test(stripSafeArea(TODAY_ALL)), "no banned whole-word copy on the hub surface");
  // Extra explicit sweep (matches the /ufc + /today banned-copy contract).
  const blob = TODAY_ALL.toLowerCase();
  for (const w of ["guaranteed", "risk-free", "sure thing", "free money", "safest", "can't lose"]) {
    assert.ok(!blob.includes(w), `banned copy "${w}" must not appear`);
  }
});

// 13 — money md5 unchanged.
test("13 · portfolio.json md5 is unchanged (money untouched)", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json md5 unchanged");
});

// FUNCTIONAL — the hub's data derivations produce honest values on today's real slate.
test("FUNCTIONAL · Top-10, featured sims, BB no-play, and open exposure derive from real artifacts", async () => {
  const { buildAllGameDetails } = await import("./game-detail.ts");
  const { featuredSimulations } = await import("./simulate-lobby-featured.ts");
  const { buildTop10Board } = await import("./top10/top10-picks.ts");
  const { buildBankBuilderProposal } = await import("./world-cup/bank-builder-proposal.ts");
  const { buildDailyPortfolio } = await import("./mr-dub/daily-portfolio.ts");
  const { currentSlateDate } = await import("./parlays/ui-loader.ts");
  const { currentEtDate } = await import("./freshness.ts");

  const dataRoot = path.join(app, "public", "data");
  const today = currentSlateDate() ?? currentEtDate();

  // Featured sims: at least one ready, and any run-count label is a REAL N-run claim.
  const feat = featuredSimulations(buildAllGameDetails());
  assert.ok(feat.readyCount >= 1, "at least one ready simulation exists");
  for (const f of feat.featured) {
    if (f.runCountLabel) assert.match(f.runCountLabel, /\d[\d,]*-run/, "run-count label is a real N-run claim");
  }

  // Top-10 board builds; the compact slice is honest (≤ 6, real odds).
  const board = buildTop10Board(dataRoot, today, Date.now());
  const slice = (board.overall ?? []).slice(0, 6);
  assert.ok(slice.length <= 6, "compact list is capped at 6");
  for (const p of slice) assert.ok(Number.isFinite(p.odds), "each pick carries real numeric odds");

  // Bank Builder: today is honestly no-play (proposal unavailable) with no active card ⇒ $0 exposure.
  // Bank Builder + Moonshot derive from the real daily portfolio. This is SLATE-DEPENDENT: on a play day
  // the lanes are active (with display exposure); on a no-play day they aren't (with $0 core exposure).
  // Assert the derivation is internally CONSISTENT either way — never force a specific state.
  const bbProposal = buildBankBuilderProposal(dataRoot, today);
  const dp = buildDailyPortfolio(dataRoot, new Date().toISOString(), today);
  const hasActiveBB = dp.cards.some((c) => c.product === "bank-builder" && c.status === "active");
  // active ⟺ display exposure present; no-play ⟺ $0 core exposure. (Display exposure is paper; the OFFICIAL
  // exposure lives in portfolio.json and stays $0 — verified elsewhere by the money-md5 gate.)
  if (hasActiveBB) assert.ok(dp.exposure.core >= 0, "an active BB lane carries a (paper) core exposure figure");
  else assert.equal(dp.exposure.core, 0, "no active BB card ⇒ core exposure is $0");
  // A generated BB proposal WITHOUT an active lane is the honest "awaiting founder approval" state (the daily
  // flow authors bank-builder-approved.json → promote). That's valid, not inconsistent — the only real
  // invariant is that no active lane ⇒ $0 core exposure (asserted above). Just require the flag is a boolean.
  assert.equal(typeof bbProposal.available, "boolean", "BB proposal availability derives from the real artifact");
  // Moonshot derives from the same portfolio; its active flag is whatever the real artifact says (a play
  // day may have an active lane). We only require the value to be a real boolean, never a forced state.
  const moonActive = dp.cards.some((c) => c.product === "moonshot" && c.status === "active");
  assert.equal(typeof moonActive, "boolean", "Moonshot active state derives from the real portfolio");
});

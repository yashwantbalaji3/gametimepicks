/**
 * BANK BUILDER FLAGSHIP UI (2026-07-07, vertical-ladder overhaul). Pins the premium /bank-builder climb +
 * the SAFE 7-step track:
 *   • the flagship ladder is a VERTICAL climb (spine, crown, bottom→top, "you are here" active rung with
 *     the card legs attached) — not a horizontal rail; team flags + real kickoffs per leg;
 *   • the live ladder is 5-step; the 7-step is a PROMINENT but clearly-labelled PREVIEW (not live),
 *     derived from the pure policy, never a live claim under v1;
 *   • animation is CSS-only + reduced-motion-safe (reuses globals.css classes, no external lib);
 *   • no survival/value/aggressive/safest; seed exposure is $100; no rejected/stale card.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeSettledApprovedRoot } from "./__testsupport__/settled-ladder-root.mjs";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const climb = read("src/components/bank-builder/climb-hero.tsx");
const vlad = read("src/components/bank-builder/vertical-ladder-climb.tsx");
const preview = read("src/components/bank-builder/next-ladder-preview.tsx");
const bbPage = read("src/app/bank-builder/page.tsx");
const dp = read("src/lib/mr-dub/daily-portfolio.ts");

const BANNED = /\b(survival|aggressive|safest)\b/i;
const NO_RISK_MODE = (s) => !/Lane [AB][^\n]*·[^\n]*(Survival|Value|Aggressive|safest)/i.test(s);

test("ladder version constant: live is v1 (5-step); v2 is the owner-gated Plan-0007 flip, not live", async () => {
  const v = await import("./bank-builder/ladder-version.ts");
  assert.equal(v.BANK_BUILDER_LADDER_VERSION, "v1");
  assert.equal(v.bankBuilderLiveStepCount(), 5);
  assert.equal(v.BANK_BUILDER_V2_STEP_COUNT, 7);
  assert.equal(v.isSevenStepLive(), false);
});

test("the flagship ladder is a VERTICAL climb (spine, crown, bottom→top), not a horizontal rail", () => {
  // ClimbHero delegates each lane to the vertical component; the old horizontal RungLadder is gone.
  assert.match(climb, /import VerticalLadderClimb from "\.\/vertical-ladder-climb"/, "ClimbHero uses the vertical ladder");
  assert.match(climb, /<VerticalLadderClimb lane=\{laneA\}/, "renders Lane A vertically");
  assert.match(climb, /<VerticalLadderClimb lane=\{laneB\}/, "renders Lane B vertically");
  assert.ok(!/function RungLadder|overflow-x-auto/.test(climb), "no leftover horizontal rung rail in the hero");
  // The vertical component: a gradient spine + a crown at the top + rungs sorted descending (top=goal).
  assert.match(vlad, /gtp-progress-rail/, "uses the vertical gradient spine");
  assert.match(vlad, /🏆/, "crown marker at the top of the climb");
  assert.match(vlad, /\.sort\(\(a, b\) => b\.step - a\.step\)/, "rungs render top(goal)→bottom(base)");
  assert.match(vlad, /You are here/, "the active rung is marked 'you are here'");
});

test("the vertical ladder renders team flags + real kickoffs per leg (fallbacks, never fabricated)", () => {
  assert.match(vlad, /import FlagBadge from "@\/components\/flag-badge"/, "flags");
  // The player fallback must render a real PORTRAIT — not a flag, not the ⚽ chip. Pin that INVARIANT rather
  // than one legacy import path (Sprint 017 entity migration): this is STRICTER than the old check, because
  // it also fails if the portrait is dropped entirely, and it forces the portrait through the single
  // canonical entity system instead of any of the rival avatar implementations.
  assert.match(vlad, /import \{[^}]*PlayerPortrait[^}]*\} from "@\/components\/entity"/, "player fallback uses the canonical portrait");
  assert.match(vlad, /leg\.player[\s\S]{0,140}<PlayerPortrait/, "a leg WITH a player renders a portrait before any flag fallback");
  assert.match(vlad, /wcTeamCodeFromName/, "derives a flag code from the pick's team");
  assert.match(vlad, /function LegAvatar/, "per-leg avatar primitive");
  assert.match(vlad, /Kickoff \{leg\.kickoff\}/, "renders the leg kickoff");
  assert.match(vlad, /⚽/, "fail-closed chip when no flag resolves");
});

test("animation is CSS-only + reduced-motion-safe (reuses globals.css classes, no external lib)", () => {
  // Reuse the guarded keyframe classes — never a runtime animation dependency.
  assert.ok(/gtp-active-glow|climb-rung-pulse/.test(vlad), "active rung uses an existing guarded glow/pulse class");
  const css = read("src/app/globals.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?gtp-active-glow[\s\S]*?animation: none/, "gtp-active-glow is disabled under reduced-motion");
  assert.ok(!/framer-motion|gsap|lottie|animejs/.test(vlad), "no heavy animation library imported");
});

test("live ladder stays 5-step; NO 'Step N of 7' live claim under v1", () => {
  // The vertical component labels the live lane out of its real rung count (5 today), never a hardcoded 7.
  assert.match(vlad, /Step \$\{lane\.step\} of \$\{lane\.rungs\.length\}/, "step label derives from the live rung count");
  assert.ok(!/of 7\b/.test(vlad), "no 'of 7' in the live ladder component");
  assert.ok(!/Step \d+ of 7/.test(climb), "no live 'Step N of 7' claim in the hero");
});

test("the 7-step preview COMPONENT (kept for the future Plan-0007 migration, NOT rendered on the live page today) stays honest", () => {
  assert.match(preview, /bankBuilderV2StepPolicy/, "derived from the pure 7-step policy");
  assert.match(preview, /isSevenStepLive/, "reads the version flag (never hardcodes 'live')");
  assert.match(preview, /\[1, 2, 3, 4, 5, 6, 7\]/, "renders all 7 steps");
  assert.match(preview, /Next Ladder System/i, "prominent 'Next Ladder System' header");
  assert.match(preview, /Preview · not live/i, "explicit 'preview · not live'");
  assert.match(preview, /Settlement engine not yet activated/i, "states the engine is not activated");
  assert.match(preview, /Not settlement-implemented and not on the live product/i, "not on live");
  assert.match(preview, /Live product remains 5-step/i, "affirms the live product stays 5-step");
  assert.match(preview, /sort\(\(a, b\) => b\.step - a\.step\)/, "the preview is ALSO vertical (crown→base)");
  assert.ok(!BANNED.test(preview), "no survival/aggressive/safest");
});

test("no survival/value/aggressive/safest anywhere; affirmative no-play copy", () => {
  assert.ok(!BANNED.test(vlad) && !BANNED.test(climb), "no risk-mode words in the ladder components");
  assert.ok(NO_RISK_MODE(vlad) && NO_RISK_MODE(climb), "no 'Lane X · Survival/Value' chips");
  assert.match(vlad, /Model pass — holding for a stronger slate/, "affirmative no-play, not passive 'awaiting'");
});

test("SIMPLIFIED page (Option-1): vertical hero, BB-own seed exposure, NO separate 7-step block, no duplicate active card", () => {
  assert.match(bbPage, /<ClimbHero/, "the vertical climb hero leads the page");
  assert.match(bbPage, /openExposure=\{dailyPortfolio\.exposure\.core\}/, "BB-own seed exposure, not the portfolio total");
  assert.match(bbPage, /kickoff: l\.kickoffEt \?\? null/, "real kickoff plumbed to the ladder (fail-closed)");
  // Option-1 simplification: the confusing separate 7-step block is NOT rendered on the live page.
  assert.ok(!/<NextLadderPreview/.test(bbPage), "no separate 7-step 'Next Ladder System' block on the live page");
  // No duplicate 'active daily Bank Builder' — the proposal card shows ONLY when NO lane is active (the
  // ClimbHero already shows the active card + its expandable cleared history).
  assert.match(bbPage, /!dailyPortfolio\.cards\.some\(\(c\) => c\.product === "bank-builder" && c\.status === "active"/, "proposal card is gated on NO active lane");
  // The dense duplicate sections were removed.
  assert.ok(!/aria-label="Run plan"/.test(bbPage), "the duplicate 'Run plan' section is removed");
});

test("EXPANDABLE cleared-step history: real settled detail from the ledger, never fabricated", async () => {
  // The ladder rung type carries an optional cleared detail; the page reads it verbatim from ledger.json.
  assert.match(climb, /export interface ClimbClearedDetail/, "the cleared-step detail type exists");
  assert.match(climb, /cleared\?: ClimbClearedDetail \| null/, "a rung can carry its cleared detail");
  assert.match(bbPage, /function readClearedSteps/, "the page reads cleared steps from the settlement ledger");
  assert.match(bbPage, /ledger\.json/, "sourced from the append-only ledger (not fabricated)");
  assert.match(bbPage, /publicBankBuilderVisible/, "only publicly-visible cleared steps surface");
  // The vertical ladder renders an expandable <details> for a cleared rung.
  assert.match(vlad, /<details/, "cleared step is expandable (<details> accordion)");
  assert.match(vlad, /How Step \{rung\.step\} cleared/, "the expander labels the cleared step");
  assert.match(vlad, /rung\.cleared\.legs\.map/, "renders the actual settled legs");
  assert.match(vlad, /officialResult/, "shows the official final result per leg");
  // Functional: Lane A Step 1 cleared detail is the REAL July-6 result ($100 → $174.23, Spain+Belgium).
  const led = JSON.parse(fs.readFileSync(path.join(app, "public", "data", "mr-dub", "ledger.json"), "utf8"));
  const step1 = (led.events ?? []).find((e) => e.type === "lane_step_won" && e.laneId === "lane-a" && e.publicBankBuilderVisible && e.step === 1);
  assert.ok(step1, "the ledger has Lane A's public Step-1 win");
  assert.equal(step1.paperStake, 100, "actual stake $100");
  assert.equal(step1.paperReturn, 174.23, "actual return $174.23 (NOT a fabricated $200)");
  assert.deepEqual(step1.legs.map((l) => l.selection), ["Spain or Draw Double Chance", "Belgium or Draw Double Chance"], "the actual cleared legs");
  assert.ok(step1.legs.every((l) => l.officialResult), "each leg carries its official final");
});

test("'How to read this' is COLLAPSED by default (keeps the page simple)", () => {
  assert.match(climb, /<details[^>]*>[\s\S]*?How to read this/, "the how-to block is a collapsed <details>");
});

test("persisted leg kickoff (ET) plumbs through to the card leg", () => {
  assert.match(dp, /kickoffEt\?: string \| null/, "DailyPortfolioLeg carries kickoffEt");
  assert.match(dp, /kickoffEt: g\.kickoffEt \?\? null/, "fromPersisted maps it");
});

test("FUNCTIONAL: July-7 build → Lane A settled WON, $0 exposure, clearedSteps 2, approved legs preserved as history", async () => {
  // SAME-DAY SETTLEMENT: the operator-approved cycle-8 Step-2 card (Colombia or Draw + Argentina to win)
  // SETTLED WON at ~11pm ET on its own July-7 slate date. It must NOT re-surface as an active $100-at-risk
  // card — the seed is no longer at risk and the step is a cleared rung. It renders WON / $0 exposure /
  // clearedSteps 2, with its approved legs preserved as history (never dropped, never a rejected/stale card).
  // SLATE ADVANCED July-7 → July-8: the live daily-portfolio.json is now the July-8 no-play, so build the
  // July-7 view EXPLICITLY from the July-7 approved card + settled ladder. The settled-WON invariant is
  // unchanged (still reconstructed from canonical July-7 sources) — it is simply no longer the live file.
  const { buildPersistedDailyPortfolio } = await import("./daily-portfolio/accounting.ts");
  // The July-21 review restart pushed the settled July-7 cycle into the live ladder's priorLane; reconstruct the
  // pre-restart settled ladder so the same-day-SETTLED (WON, $0 exposure, clearedSteps 2) invariant is validated
  // against canonical July-7 sources (the live daily-portfolio.json has since advanced past July-7).
  const { tmp, dataRoot } = makeSettledApprovedRoot(path.join(app, "public", "data"));
  let p;
  try {
    p = buildPersistedDailyPortfolio(dataRoot, "2026-07-07T12:00:00Z", "2026-07-07", "2026-07-07T12:00:00Z", true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  assert.equal(p.products.bankBuilder.exposure, 0, "BB open exposure is $0 — the settled seed is no longer at risk");
  // No BB lane is active (Lane A settled WON), so a candidate/active card must not surface.
  assert.ok(!(p.lanes ?? []).some((c) => c.product === "bank-builder" && c.status === "active"), "no active BB card once Lane A settled");
  const a = (p.lanes ?? []).find((c) => c.product === "bank-builder" && c.lane === "A");
  assert.ok(a, "Lane A is still present as history");
  assert.equal(a.status, "won", "Lane A rendered WON (same-day settled), not active");
  assert.equal(a.step, 2, "Step 2");
  assert.equal(a.clearedSteps, 2, "Step 2 counts as a cleared rung");
  assert.deepEqual(a.legs.map((l) => l.selection), ["Colombia or Draw", "Argentina to win"], "approved legs preserved as history, not rejected Under 2.5 + Colombia ML");
  assert.ok(a.legs.every((l) => !/Under 2\.5|Spain or Draw|Belgium or Draw/i.test(l.selection)), "no rejected/stale July-6 legs");
  assert.ok(a.legs.every((l) => l.kickoffEt && String(l.kickoffEt).trim()), "every leg carries a real kickoff for the UI");
});

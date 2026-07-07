/**
 * BANK BUILDER FLAGSHIP UI (2026-07-07). Pins the premium /bank-builder overhaul + the SAFE 7-step track:
 *   • the flagship ClimbHero renders team flags / player fallbacks per leg (LegAvatar) + real kickoffs;
 *   • the live ladder is 5-step; the 7-step is a clearly-labelled PREVIEW (not live), derived from the pure
 *     policy — never a live claim;
 *   • the version constant is "v1" (live step count 5); flipping to v2 is Plan 0007's owner-gated final step;
 *   • no survival/value/aggressive/safest language anywhere on the flagship;
 *   • the persisted leg's kickoff (ET) plumbs through to the card leg (no fabrication).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const climb = read("src/components/bank-builder/climb-hero.tsx");
const preview = read("src/components/bank-builder/next-ladder-preview.tsx");
const bbPage = read("src/app/bank-builder/page.tsx");
const dp = read("src/lib/mr-dub/daily-portfolio.ts");

const BANNED = /\b(survival|aggressive|safest)\b/i; // "value" excluded (Top-10 filter tab is unrelated); check lane risk-mode words
const NO_RISK_MODE = (s) => !/Lane [AB][^\n]*·[^\n]*(Survival|Value|Aggressive|safest)/i.test(s);

test("ladder version constant: live is v1 (5-step); v2 is the owner-gated Plan-0007 flip, not live", async () => {
  const v = await import("./bank-builder/ladder-version.ts");
  assert.equal(v.BANK_BUILDER_LADDER_VERSION, "v1", "live version is v1");
  assert.equal(v.bankBuilderLiveStepCount(), 5, "v1 live step count is the implemented 5-step ladder");
  assert.equal(v.bankBuilderLiveStepCount("v2"), 7, "v2 would be 7 steps");
  assert.equal(v.BANK_BUILDER_V2_STEP_COUNT, 7, "the 7-step preview has 7 steps");
  assert.equal(v.isSevenStepLive(), false, "7-step is NOT live at v1");
  assert.equal(v.isSevenStepLive("v2"), true, "isSevenStepLive true only at v2");
});

test("ClimbHero renders a per-leg avatar (team flag / player fallback), not a bare text list", () => {
  assert.match(climb, /import FlagBadge from "@\/components\/flag-badge"/, "imports FlagBadge");
  assert.match(climb, /import PlayerAvatar from "@\/components\/ui\/player-avatar"/, "imports the player fallback");
  assert.match(climb, /wcTeamCodeFromName/, "derives a WC flag code from the team name");
  assert.match(climb, /function LegAvatar/, "has a LegAvatar primitive");
  assert.match(climb, /<LegAvatar leg=\{leg\}\s*\/>/, "the leg row leads with the avatar");
  // graceful fallbacks — a flag, a player portrait, then a ⚽ chip — never a broken/fabricated mark.
  assert.match(climb, /<FlagBadge/, "renders a flag");
  assert.match(climb, /<PlayerAvatar name=\{leg\.player\}/, "player fallback for prop legs");
});

test("ClimbHero shows the real kickoff and is a 5-step ladder (no 7-step live claim)", () => {
  assert.match(climb, /Kickoff \$\{leg\.kickoff\}/, "renders the leg kickoff when present");
  assert.match(climb, /Step \$\{lane\.step\} of 5/, "lane step label is out of 5 (live ladder)");
  assert.ok(!/of 7\b/.test(climb), "no 'of 7' on the live flagship hero");
  assert.match(climb, /climbs toward \$10K in 5 steps/, "explainer states the 5-step live ladder");
});

test("ClimbHero: no survival/value/aggressive/safest lane language; affirmative no-play copy", () => {
  assert.ok(!BANNED.test(climb), "no survival/aggressive/safest anywhere in the flagship hero");
  assert.ok(NO_RISK_MODE(climb), "no 'Lane X · Survival/Value' risk-mode chips");
  assert.match(climb, /Model pass — holding for a stronger slate/, "no-play reads as an intentional pass, not 'awaiting'/broken");
});

test("NextLadderPreview is a CLEARLY-LABELLED preview (never a live 7-step), derived from the pure policy", () => {
  assert.match(preview, /import \{ bankBuilderV2StepPolicy \} from "@\/lib\/methodology\/ladder-policy"/, "derives from the pure 7-step policy (no fabrication)");
  assert.match(preview, /\[1, 2, 3, 4, 5, 6, 7\]/, "shows all 7 preview steps");
  assert.match(preview, /Preview · not live/i, "explicit 'preview · not live' badge");
  assert.match(preview, /not settlement-implemented and not on the live product/i, "states it is not live/not settlement-implemented");
  assert.match(preview, /Plan 0007/, "points at the safe migration plan");
  assert.match(preview, /\/methodology/, "links to the full methodology preview");
  assert.ok(!BANNED.test(preview), "no survival/aggressive/safest in the preview");
});

test("the /bank-builder page renders the preview + keeps BB-specific seed exposure", () => {
  assert.match(bbPage, /<NextLadderPreview\s*\/>/, "the page renders the 7-step preview strip");
  assert.match(bbPage, /import NextLadderPreview from "@\/components\/bank-builder\/next-ladder-preview"/, "imports it");
  assert.match(bbPage, /openExposure=\{dailyPortfolio\.exposure\.core\}/, "hero shows BB-own seed exposure (not the portfolio total)");
});

test("the persisted leg kickoff (ET) plumbs through to the card leg — real data, never fabricated", () => {
  assert.match(dp, /kickoffEt\?: string \| null/, "DailyPortfolioLeg carries kickoffEt");
  assert.match(dp, /kickoffEt: g\.kickoffEt \?\? null/, "fromPersisted maps the real kickoffEt");
  assert.match(bbPage, /kickoff: l\.kickoffEt \?\? null/, "the page maps kickoffEt → ClimbLeg.kickoff (fail-closed)");
});

test("FUNCTIONAL: July-7 build → Lane A active Step 2 with flags-able legs + real kickoff; no rejected card", async () => {
  const { buildDailyPortfolio } = await import("./mr-dub/daily-portfolio.ts");
  const p = buildDailyPortfolio(path.join(app, "public", "data"), new Date("2026-07-07T12:00:00Z").toISOString(), "2026-07-07");
  assert.equal(p.exposure.core, 100, "BB open exposure is the $100 seed");
  const a = (p.cards ?? []).find((c) => c.product === "bank-builder" && c.lane === "A" && c.status === "active");
  assert.ok(a, "Lane A is active");
  assert.equal(a.step, 2, "Lane A is Step 2");
  const sels = a.legs.map((l) => l.selection);
  assert.deepEqual(sels, ["Colombia or Draw", "Argentina to win"], "the approved legs (not the rejected Under 2.5 + Colombia ML)");
  assert.ok(a.legs.every((l) => !/Under 2\.5/i.test(l.selection)), "no rejected Under 2.5 leg in the BB card");
  assert.ok(a.legs.every((l) => l.kickoffEt && String(l.kickoffEt).trim()), "every leg carries a real kickoff (ET) for the UI");
});

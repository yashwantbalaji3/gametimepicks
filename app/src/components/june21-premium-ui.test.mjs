/**
 * June-21 premium-UI rendering work — surviving surfaces only:
 *   B) The Dual Bank Builder active leg row is betting-slip style — matchup + selection + kickoff ET
 *      + settlement source — never a bare market line with no game.
 *   C) Moonshot active leg row shows matchup + selection + kickoff (enriched fields).
 *   E) The slate-status bar is a 3-way honest label (settled / in progress / pregame) — it no longer
 *      asserts "Pregame slate" when the slate's kickoffs have largely passed.
 *
 * The June-21 World Cup sections (homepage specials box, Egypt/NZ same-game module) are gone with the
 * 2026 World Cup closeout (world-cup-closeout.test.mjs): the live hub is a redirect stub and those
 * components were deleted. The settled-specials honesty they asserted lives on in the retired archive
 * (specials-tracker.test.mjs + the specials-ledger tests in cross-lane-correlation.test.mjs).
 *
 * Source-grep style (the suite runs pre-build), like the other component tests. No banned public copy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const MOON = read("src/components/bank-builder/moonshot-lane-card.tsx");
const SLATEBAR = read("src/components/slate-status-bar.tsx");

const BANNED = [/\block\b/i, /\bsafe(st)?\b/i, /guaranteed/i, /guarantee/i, /sure thing/i, /free money/i, /risk-free/i, /can't miss/i];
function assertNoBanned(label, src) {
  for (const b of BANNED) assert.ok(!b.test(src), `${label} must not contain banned copy ${b}`);
}

// ── B. (v1.7 UX P-1: the unmounted dual-ladder-board.tsx was deleted; its slip-row test went with it) ──

test("Moonshot: active leg row shows matchup + selection + kickoff ET (enriched)", () => {
  assert.match(MOON, /displaySelection/, "uses displaySelection");
  assert.match(MOON, /kickoffEt/, "shows kickoff ET");
  assert.match(MOON, /leg\.fixture/, "shows the fixture / matchup");
  assert.match(MOON, /slateLabel/, "shows the cross-slate slateLabel");
  assert.match(MOON, /High-volatility/, "keeps the high-volatility framing");
  assertNoBanned("moonshot card", MOON);
});

// ── E. Slate-freshness badge ─────────────────────────────────────────────────────────────────────
test("Slate-status bar: the day's status is CROSS-SPORT and client-hydrated — never a retired product's phase", () => {
  /*
   * REPOINTED 2026-09-28 (#794 PR 2). This test used to pin `loadWorldCupProjections` and the label
   * "Pregame slate" — i.e. it pinned the defect: with the World Cup retired there were no kickoffs, so
   * the chip read "Pregame slate" on every page, including during a live NFL game. What it protects is
   * the property: the day chip comes from the cross-sport owner (each sport's schedule), re-derives from
   * the real browser clock after hydration, and fabricates nothing.
   */
  const CHIPS = fs.readFileSync("src/components/slate-status-chips.tsx", "utf8");
  assert.match(CHIPS, /^"use client";/, "chips are a client component (real-clock re-derivation)");
  assert.match(CHIPS, /Date\.now\(\)/, "re-derives from the real clock after hydration");
  assert.match(CHIPS, /Games under way/, "a started day links to /live");
  assert.doesNotMatch(CHIPS, /Pregame slate/, "no global phase label that cannot see today's sports");
  assert.match(SLATEBAR, /crossSportToday\(/, "server bar reads the cross-sport day owner");
  assert.match(SLATEBAR, /buildSportToday\(/, "…from each sport's schedule");
  assert.doesNotMatch(SLATEBAR, /loadWorldCupProjections|currentSlateDate/, "no retired World Cup source, no single-product slate date");
  assert.match(SLATEBAR, /SlateStatusChips/, "renders the client chips");
  // P208 F3: the bankroll chips moved to their canonical owners; the strip carries date/status/
  // freshness only, so the bank-summary loader has no business here any more.
  assert.doesNotMatch(SLATEBAR, /loadPublicBankBuilderSummary/, "no bankroll figure in the global strip");
  assertNoBanned("slate status bar", SLATEBAR);
  assertNoBanned("slate status chips", CHIPS);
});

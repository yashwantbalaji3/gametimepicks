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
test("Slate-status bar: honest 3-way label (settled / in progress / pregame) — CLIENT-hydrated clock", () => {
  // The time judgement moved to the client chips so it tracks the REAL browser clock (the static
  // export's build clock froze the old server labels). Server bar loads the kickoffs; chips label them.
  const CHIPS = fs.readFileSync("src/components/slate-status-chips.tsx", "utf8");
  assert.match(CHIPS, /^"use client";/, "chips are a client component (real-clock re-derivation)");
  assert.match(CHIPS, /Slate settled/, "settled label kept");
  assert.match(CHIPS, /Slate in progress/, "in-progress label kept");
  assert.match(CHIPS, /Pregame slate/, "pregame label kept");
  assert.match(CHIPS, /Completed — awaiting settlement/, "completed label kept");
  assert.match(CHIPS, /Date\.now\(\)/, "re-derives from the real clock after hydration");
  // Server bar still loads the real kickoff data (never fabricated) and passes it down.
  assert.match(SLATEBAR, /slateKickoffsMs/, "server bar extracts the slate kickoffs");
  assert.match(SLATEBAR, /loadWorldCupProjections/, "reads the WC projections kickoffs");
  assert.match(SLATEBAR, /kickoffUtc/, "uses kickoffUtc times");
  assert.match(SLATEBAR, /SlateStatusChips/, "renders the client chips");
  // P208 F3: the bankroll chips moved to their canonical owners; the strip carries date/phase/
  // freshness only, so the bank-summary loader has no business here any more.
  assert.doesNotMatch(SLATEBAR, /loadPublicBankBuilderSummary/, "no bankroll figure in the global strip");
  assertNoBanned("slate status bar", SLATEBAR);
  assertNoBanned("slate status chips", CHIPS);
});

/**
 * June-21 premium-UI rendering work:
 *   A) World Cup Specials render per-leg HIT / MISS / PENDING markers + a card-level status pill,
 *      and the section header reads honestly once every card is settled.
 *   B) The Dual Bank Builder active leg row is betting-slip style — matchup + selection + kickoff ET
 *      + settlement source — never a bare market line with no game.
 *   C) Moonshot active leg row shows matchup + selection + kickoff (enriched fields).
 *   D) The Egypt vs New Zealand same-game section exists, is wired into /world-cup + /today, carries
 *      the no-combined-pricing note, and shows individual odds only (no fabricated SGP price).
 *   E) The slate-status bar is a 3-way honest label (settled / in progress / pregame) — it no longer
 *      asserts "Pregame slate" when the slate's kickoffs have largely passed.
 *
 * Source-grep style (the suite runs pre-build), like the other component tests. No banned public copy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const SPECIALS = read("src/components/world-cup/world-cup-specials-box.tsx");
const DUAL = read("src/components/bank-builder/dual-ladder-board.tsx");
const MOON = read("src/components/bank-builder/moonshot-lane-card.tsx");
const SAMEGAME = read("src/components/world-cup/egypt-nz-same-game.tsx");
const SLATEBAR = read("src/components/slate-status-bar.tsx");
const WC_PAGE = read("src/app/world-cup/page.tsx");
const TODAY_PAGE = read("src/app/today/page.tsx");

const BANNED = [/\block\b/i, /\bsafe(st)?\b/i, /guaranteed/i, /guarantee/i, /sure thing/i, /free money/i, /risk-free/i, /can't miss/i];
function assertNoBanned(label, src) {
  for (const b of BANNED) assert.ok(!b.test(src), `${label} must not contain banned copy ${b}`);
}

// ── A. World Cup Specials hit/miss/pending ───────────────────────────────────────────────────────
test("Specials: per-leg HIT / MISS / PENDING badge branches + settlementReason subtext", () => {
  // All three settlement statuses are handled for the per-leg badge.
  assert.match(SPECIALS, /settlementStatus/, "reads leg settlementStatus");
  assert.match(SPECIALS, /hit:\s*\{[^}]*label:\s*"Hit"/, "HIT branch");
  assert.match(SPECIALS, /miss:\s*\{[^}]*label:\s*"Miss"/, "MISS branch");
  assert.match(SPECIALS, /pending:\s*\{[^}]*label:\s*"Pending"/, "PENDING branch");
  // The settlement reason (e.g. "Belgium 0-0 Iran", "not started") is rendered as muted subtext.
  assert.match(SPECIALS, /leg\.settlementReason/, "renders the settlement reason subtext");
});

test("Specials: card-level WON / LOST / PENDING status pill + settled-card framing", () => {
  assert.match(SPECIALS, /card\.cardStatus/, "reads card-level cardStatus");
  assert.match(SPECIALS, /won:\s*\{[^}]*label:\s*"Won"/, "WON pill");
  assert.match(SPECIALS, /lost:\s*\{[^}]*label:\s*"Lost"/, "LOST pill");
  assert.match(SPECIALS, /pending:\s*\{[^}]*label:\s*"Pending"/, "PENDING pill");
  // Settled cards are framed as a reviewed result, not a pre-event longshot.
  assert.match(SPECIALS, /official result/i, "settled card carries an official-result note");
  assert.match(SPECIALS, /\(settled\)/, "all-settled header reads honestly, e.g. 'Specials — Jun 21 (settled)'");
  assertNoBanned("specials box", SPECIALS);
});

// ── B. Dual Bank Builder active leg detail ───────────────────────────────────────────────────────
test("Dual ladder: active leg row is betting-slip style (matchup + selection + kickoff + settlement)", () => {
  // Enriched, slip-style active row exists and renders the matchup + the selection (never a bare market).
  assert.match(DUAL, /function ActiveSlipLegRow/, "dedicated active slip leg row");
  assert.match(DUAL, /leg\.matchup/, "shows the matchup (e.g. Jordan vs Algeria)");
  assert.match(DUAL, /displaySelection/, "uses displaySelection (or a composed market+selection)");
  assert.match(DUAL, /leg\.kickoffEt/, "shows kickoff ET");
  assert.match(DUAL, /leg\.settlementSource/, "small settlement-supported note from settlementSource");
  assert.match(DUAL, /settlement-supported/, "settlement-supported wording");
  // Selection is composed from matchup + market + pick so a leg is NEVER a bare "Under 3.5".
  assert.match(DUAL, /const composed =/, "composes matchup — market: pick when no displaySelection");
  // Tasteful step badges: cross-slate + JUN date + the single approved-broader-criteria note.
  assert.match(DUAL, /Cross-slate/, "cross-slate badge");
  assert.match(DUAL, /Approved broader criteria/i, "approved-broader-criteria badge (one only)");
  // Flags via the shared FlagBadge, no external image hotlinks.
  assert.match(DUAL, /FlagBadge/, "uses the shared FlagBadge component");
  assert.ok(!/<img|https?:\/\//.test(DUAL.replace(/Mr\. Dub|mr-dub/g, "")), "no external image hotlinks");
  assertNoBanned("dual ladder board", DUAL);
});

// ── C. Moonshot leg detail ───────────────────────────────────────────────────────────────────────
test("Moonshot: active leg row shows matchup + selection + kickoff ET (enriched)", () => {
  assert.match(MOON, /displaySelection/, "uses displaySelection");
  assert.match(MOON, /kickoffEt/, "shows kickoff ET");
  assert.match(MOON, /leg\.fixture/, "shows the fixture / matchup");
  assert.match(MOON, /slateLabel/, "shows the cross-slate slateLabel");
  assert.match(MOON, /High-volatility/, "keeps the high-volatility framing");
  assertNoBanned("moonshot card", MOON);
});

// ── D. Egypt vs New Zealand same-game ideas ──────────────────────────────────────────────────────
test("Egypt/NZ same-game: section exists with the explicit no-combined-pricing note", () => {
  assert.match(SAMEGAME, /Egypt vs New Zealand — Same-Game Ideas/, "section title present");
  assert.match(
    SAMEGAME,
    /Same-game idea only — combined pricing requires sportsbook SGP pricing\./,
    "explicit no-combined-pricing note",
  );
  // Individual odds only — no fabricated combined / SGP price. We assert the component never computes
  // or renders a combined value: no `combinedOdds` identifier and no decimal-odds multiplication.
  assert.match(SAMEGAME, /individual/i, "labels odds as individual");
  assert.ok(!/combinedOdds|combinedAmerican|combinedDecimal/.test(SAMEGAME), "no combined-odds identifier");
  assert.ok(!/\.reduce\(.*\*|dec\(/.test(SAMEGAME), "no decimal-odds product (no fabricated SGP math)");
  // Kickoff-gated: archived banner when the match has started.
  assert.match(SAMEGAME, /This match has started — same-game ideas are archived for review/, "archived banner");
  assert.match(SAMEGAME, /Pre-event ideas/, "pre-event state");
  // Settlement-supported framing.
  assert.match(SAMEGAME, /settlement-supported · official 90-minute result/, "settlement-supported note");
  // No external image hotlinks (flags via FlagBadge).
  assert.match(SAMEGAME, /FlagBadge/, "flags via FlagBadge");
  assert.ok(!/<img|https?:\/\//.test(SAMEGAME), "no external image hotlinks");
  assertNoBanned("egypt-nz same-game", SAMEGAME);
});

test("Egypt/NZ same-game: wired into /world-cup and /today", () => {
  for (const [label, page] of [["world-cup", WC_PAGE], ["today", TODAY_PAGE]]) {
    assert.match(page, /import EgyptNzSameGame, \{ loadNzEgyptMarkets \} from "@\/components\/world-cup\/egypt-nz-same-game"/, `${label} imports the section + loader`);
    assert.match(page, /loadNzEgyptMarkets\(today\)/, `${label} loads the matchId-40 markets for the current slate`);
    assert.match(page, /<EgyptNzSameGame data=\{nzEgyptMarkets\}/, `${label} renders the section`);
  }
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
  // The product-header test contract is preserved.
  assert.match(SLATEBAR, /loadPublicBankBuilderSummary/, "still reads the real public bank summary");
  assertNoBanned("slate status bar", SLATEBAR);
  assertNoBanned("slate status chips", CHIPS);
});

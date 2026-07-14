/**
 * FEATURED SIMULATIONS (simulate-first lobby, 2026-07-08). Locks the honest behavior of the featured
 * strip added ABOVE the full games list: it features ONLY real `status === "ready"` artifacts, is capped
 * and deterministically ordered by strongest generated-pick edge, and gates any "N-run" claim on the
 * artifact. Also asserts (via source) that the lobby renders the hero, the real dashboard-module preview,
 * the preserved `<GamesExperience>` + MLB `simReady` line, and an honest zero-ready empty state — with no
 * banned copy anywhere in the component.
 *
 * Run: npx tsx --test app/src/lib/simulate-lobby-featured.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  featuredSimulations,
  runCountLabel,
  strongestEdgePct,
  FEATURED_CAP,
} from "./simulate-lobby-featured.ts";

const app = process.cwd();
const lobby = fs.readFileSync(path.join(app, "src/components/games/simulate-lobby.tsx"), "utf8");

/** Build a minimal ready-ish sim view for fixtures. */
function sim({ status = "ready", edges = [], runCount = null, allowsRunCountClaim = false, headline } = {}) {
  return {
    status,
    teams: { home: "HOME", away: "AWAY" },
    runCount,
    allowsRunCountClaim,
    generatedPicks: edges.map((e) => ({ edgePct: e })),
    simulationSummary: headline != null ? { headline } : null,
  };
}
/** Build a game-detail fixture. */
function detail(slug, s, sport = "mlb") {
  return { sport, slug, gameLabSimulation: s };
}

test("1 · featured selector picks ONLY ready details (stale/unavailable/error/missing are dropped)", () => {
  const details = [
    detail("a-vs-b", sim({ status: "ready", edges: [4] })),
    detail("c-vs-d", sim({ status: "stale", edges: [9] })),
    detail("e-vs-f", sim({ status: "unavailable", edges: [9] })),
    detail("g-vs-h", sim({ status: "error", edges: [9] })),
    { sport: "mlb", slug: "no-sim", gameLabSimulation: null },
    { sport: "mlb", slug: "no-field" },
  ];
  const { featured, readyCount } = featuredSimulations(details);
  assert.equal(readyCount, 1, "only the one ready game counts");
  assert.deepEqual(featured.map((f) => f.slug), ["a-vs-b"], "only the ready game is featured");
  // A ready game with a null teams block is also skipped (can't render a matchup honestly).
  const noTeams = featuredSimulations([{ sport: "mlb", slug: "x", gameLabSimulation: { ...sim({ status: "ready" }), teams: null } }]);
  assert.equal(noTeams.featured.length, 0, "ready-but-teamless is not featured");
});

test("2 · capped at ≤5 and ordered by strongest-pick edge desc, tie-break slug asc (deterministic)", () => {
  const details = [
    detail("g7", sim({ status: "ready", edges: [1] })),
    detail("g1", sim({ status: "ready", edges: [10, 2] })), // top edge 10
    detail("g2", sim({ status: "ready", edges: [10] })),    // top edge 10 → ties g1, slug g1 < g2
    detail("g3", sim({ status: "ready", edges: [8] })),
    detail("g4", sim({ status: "ready", edges: [6] })),
    detail("g5", sim({ status: "ready", edges: [5] })),
    detail("g6", sim({ status: "ready", edges: [3] })),
  ];
  const { featured, readyCount } = featuredSimulations(details);
  assert.equal(readyCount, 7, "all 7 ready games are counted");
  assert.equal(featured.length, FEATURED_CAP, "capped at the FEATURED_CAP (5)");
  assert.equal(FEATURED_CAP, 5, "the cap is 5");
  assert.deepEqual(
    featured.map((f) => f.slug),
    ["g1", "g2", "g3", "g4", "g5"],
    "edge-desc then slug-asc tie-break (g1 before g2 at edge 10); the two weakest (g6,g7) drop below the cap",
  );
  assert.deepEqual(featured.map((f) => f.topEdgePct), [10, 10, 8, 6, 5], "topEdgePct is the max edge per game");
  // Running twice yields the identical order (stable/deterministic).
  const again = featuredSimulations(details).featured.map((f) => f.slug);
  assert.deepEqual(again, featured.map((f) => f.slug), "same input ⇒ same order");
});

test("3 · run-count label gated on allowsRunCountClaim && runCount != null (both branches)", () => {
  // Allowed + positive integer runCount ⇒ a real "N-run" claim.
  assert.equal(runCountLabel({ allowsRunCountClaim: true, runCount: 2000 }), "2,000-run model simulation");
  // NOT allowed ⇒ null even if a count exists.
  assert.equal(runCountLabel({ allowsRunCountClaim: false, runCount: 2000 }), null);
  // Allowed but no count / non-positive / non-integer ⇒ null.
  assert.equal(runCountLabel({ allowsRunCountClaim: true, runCount: null }), null);
  assert.equal(runCountLabel({ allowsRunCountClaim: true, runCount: 0 }), null);
  assert.equal(runCountLabel({ allowsRunCountClaim: true, runCount: 1.5 }), null);
  // The selector threads the same gating onto the card.
  const gated = featuredSimulations([detail("g", sim({ status: "ready", edges: [3], runCount: 5000, allowsRunCountClaim: true }))]);
  assert.equal(gated.featured[0].runCountLabel, "5,000-run model simulation");
  const ungated = featuredSimulations([detail("g", sim({ status: "ready", edges: [3], runCount: 5000, allowsRunCountClaim: false }))]);
  assert.equal(ungated.featured[0].runCountLabel, null, "no fabricated N-run claim when not allowed");
  // strongestEdgePct helper: max over picks, 0 when none numeric.
  assert.equal(strongestEdgePct(sim({ edges: [2, 9, 4] })), 9);
  assert.equal(strongestEdgePct(sim({ edges: [] })), 0);
});

test("4 · source: the lobby renders a TRIMMED hero band (stable marker + concise honest contract + CTAs)", () => {
  // 2026-07-08 rebuild: the hero is trimmed to a concise sport-first front door — headline + one-line
  // honest contract + a scroll-to-games CTA + a How-It-Works link. The long 3-step / dashboard-pill
  // block moved to the game page (never buried the games), so it is deliberately gone from here.
  assert.match(lobby, /data-testid="simulate-hero"/, "the hero section is present");
  assert.match(lobby, /Simulate Today.{0,8}s Games/, "hero headline is simulation-first");
  assert.match(lobby, /precomputed · deterministic · same output for every user · paper-only/, "hero states the one-line deterministic + paper-only contract");
  assert.match(lobby, /href="#simulate-games"/, "hero has a scroll-to-games CTA");
  assert.match(lobby, /href="\/learn"/, "hero links to How It Works (/learn)");
  // The old long explainer block is gone (games are not buried under text).
  assert.ok(!/What the dashboard shows/.test(lobby), "the long dashboard-pill block was removed from the lobby");
});

test("5 · source: a prominent SPORT SELECTOR drives the games grid (sport-first front door)", () => {
  // The selector is mounted with the server-derived per-sport states + rows; it is the sport-first control.
  assert.match(lobby, /<SportSelector sports=\{sports\} rows=\{rows\} \/>/, "the sport selector is rendered with the real states + rows");
  assert.match(lobby, /id="simulate-games"/, "the games section carries the scroll anchor the hero CTA targets");
  // The states are DERIVED from the real per-sport rows, not hardcoded "active" everywhere.
  assert.match(lobby, /rowsBySport/, "per-sport states are derived from the real rows");
  assert.match(lobby, /simReadyCountFor/, "simulation-ready counts are derived from real simReady rows");
});

test("6 · source: the full games list (via SportSelector→GamesExperience) and MLB simReady line are intact", () => {
  // GamesExperience is now rendered INSIDE SportSelector (which filters rows by the chosen sport), so the
  // full game list is still present below the featured strip — just wrapped by the sport-first selector.
  const selector = fs.readFileSync(path.join(app, "src/components/games/sport-selector.tsx"), "utf8");
  assert.match(selector, /<GamesExperience games=\{filtered\} \/>/, "GamesExperience renders the (sport-filtered) rows");
  assert.match(lobby, /simReady: mlbDetail\?\.gameLabSimulation\?\.status === "ready"/, "the MLB simReady line is intact");
  assert.match(lobby, /title="Simulate Games"/, "the SectionHeader title is preserved");
  // The hero + featured sections come BEFORE the games grid.
  assert.ok(lobby.indexOf('data-testid="simulate-hero"') < lobby.indexOf('id="simulate-games"'), "hero is above the grid");
  assert.ok(lobby.indexOf('data-testid="simulate-featured"') < lobby.indexOf('id="simulate-games"'), "featured strip is above the grid");
});

test("7 · source: an honest zero-ready empty state branch exists (no fabricated cards)", () => {
  assert.match(lobby, /data-testid="simulate-featured-empty"/, "the empty-state branch is present");
  assert.match(lobby, /No simulations are ready for today.{0,8}s slate yet/, "honest empty-state copy");
  assert.match(lobby, /Pick any game below to see its model report/, "empty state points to the list");
  assert.match(lobby, /featured\.length === 0 \?/, "the render branches on zero featured");
  // Selector returns an empty result when nothing is ready (drives the empty branch).
  const none = featuredSimulations([detail("x", sim({ status: "unavailable" }))]);
  assert.deepEqual(none, { featured: [], readyCount: 0, allCurrent: false }, "no ready games ⇒ empty featured, zero count");
});

test("8 · no banned copy in simulate-lobby.tsx", () => {
  const banned = [
    /\bguaranteed\b/i,
    /\block\b/i,
    /\bsafe\b/i,
    /\bsafest\b/i,
    /can'?t lose/i,
    /\bsure thing\b/i,
    /risk[\s-]?free/i,
    /free money/i,
    /easy money/i,
    /Monte Carlo/i,
    /live betting/i,
  ];
  for (const re of banned) {
    assert.ok(!re.test(lobby), `simulate-lobby.tsx must not contain banned copy ${re}`);
  }
});

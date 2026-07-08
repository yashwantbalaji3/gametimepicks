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

test("4 · source: the lobby renders a hero band (stable marker + honest flow copy)", () => {
  assert.match(lobby, /data-testid="simulate-hero"/, "the hero section is present");
  assert.match(lobby, /Run a precomputed model simulation, then read the full dashboard/, "hero headline is simulation-first");
  assert.match(lobby, /precomputed and deterministic/i, "hero states the deterministic contract");
  assert.match(lobby, /paper-only/i, "hero keeps paper-only positioning");
});

test("5 · source: the 'what the dashboard shows' preview names the real modules", () => {
  for (const name of [
    "Priced prop snapshot",
    "Central read",
    "Main takeaways",
    "Biggest leans",
    "Player / prop table",
    "Distributions",
    "Current-slate market agreement",
    "Recap",
  ]) {
    assert.ok(lobby.includes(name), `the dashboard preview names "${name}"`);
  }
  assert.match(lobby, /What the dashboard shows/, "the preview block is labelled");
});

test("6 · source: the full games list (<GamesExperience games={rows} />) and MLB simReady line are intact", () => {
  assert.match(lobby, /<GamesExperience games=\{rows\} \/>/, "the full game list is preserved below the new sections");
  assert.match(lobby, /simReady: mlbDetail\?\.gameLabSimulation\?\.status === "ready"/, "the MLB simReady line is intact");
  assert.match(lobby, /title="Simulate Games"/, "the SectionHeader title is preserved");
  // The hero + featured sections come BEFORE the full list.
  assert.ok(lobby.indexOf('data-testid="simulate-hero"') < lobby.indexOf("<GamesExperience games={rows} />"), "hero is above the list");
  assert.ok(lobby.indexOf('data-testid="simulate-featured"') < lobby.indexOf("<GamesExperience games={rows} />"), "featured strip is above the list");
});

test("7 · source: an honest zero-ready empty state branch exists (no fabricated cards)", () => {
  assert.match(lobby, /data-testid="simulate-featured-empty"/, "the empty-state branch is present");
  assert.match(lobby, /No simulations are ready for today.{0,8}s slate yet/, "honest empty-state copy");
  assert.match(lobby, /Pick any game below to see its model report/, "empty state points to the list");
  assert.match(lobby, /featured\.length === 0 \?/, "the render branches on zero featured");
  // Selector returns an empty result when nothing is ready (drives the empty branch).
  const none = featuredSimulations([detail("x", sim({ status: "unavailable" }))]);
  assert.deepEqual(none, { featured: [], readyCount: 0 }, "no ready games ⇒ empty featured, zero count");
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

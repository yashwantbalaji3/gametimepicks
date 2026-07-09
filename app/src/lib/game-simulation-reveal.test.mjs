/**
 * PHASE 5 — "Generate Simulation" reveal, data + honesty tests.
 *
 * These pin the wiring that lets an MLB Game Lab page reveal its PRECOMPUTED, deterministic
 * simulation artifact:
 *   1. An MLB detail whose game is in the artifact carries `gameLabSimulation.status === "ready"`
 *      with its real generatedPicks (functional: through `buildAllGameDetails()`).
 *   2. The runner component exposes a "Generate Simulation" affordance when ready (source check).
 *   3. A missing artifact game → status "unavailable" copy, never a throw.
 *   4. NO per-user randomness: the view is the precomputed artifact and the component has no
 *      Math.random / fetch / write / fs.
 *   5. The generatedPicks the component shows are exactly the artifact's picks.
 *   6. No "N-run" claim is made unless runCount is a positive integer (gated on allowsRunCountClaim).
 *   7. Paper-only copy is present.
 *   8. No banned copy (guaranteed / lock / safe / safest / can't lose / live betting / Monte Carlo /
 *      free money) in the runner OR the view builder.
 *   9. The existing MLB Game Lab report is STILL rendered (game-detail-page references
 *      MlbGameLabReport + detail.gameLabMlb) and the sim runner is wired in beside it.
 *  10. Canonical money file is untouched (portfolio.json md5).
 *
 * Functional assertions call the real `buildAllGameDetails()` against the committed artifact for the
 * current slate (public/data/mlb/game-simulations/<slate>.json). Source assertions read the component/lib text.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

import { buildAllGameDetails } from "./game-detail.ts";
import {
  buildGameSimulationView,
  unavailableSimulationView,
} from "./game-simulations/game-lab-view.ts";
import { readGameSimulation } from "./game-simulations/read.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..", "..");
const APP_ROOT_DATA = path.join(APP_ROOT, "public", "data");

const RUNNER_SRC = fs.readFileSync(
  path.join(APP_ROOT, "src", "components", "game", "game-simulation-runner.tsx"),
  "utf8",
);
const VIEW_SRC = fs.readFileSync(
  path.join(APP_ROOT, "src", "lib", "game-simulations", "game-lab-view.ts"),
  "utf8",
);
const DETAIL_PAGE_SRC = fs.readFileSync(
  path.join(APP_ROOT, "src", "components", "game", "game-detail-page.tsx"),
  "utf8",
);

/** The MLB details that carry a real, ready simulation with at least one generated pick. */
function readyMlbDetails() {
  return buildAllGameDetails().filter(
    (d) => d.sport === "mlb" && d.gameLabSimulation && d.gameLabSimulation.status === "ready",
  );
}

// ── 1 · A ready artifact game exposes a ready sim view with its generatedPicks ──────────────────
test("an MLB detail whose game is in the artifact exposes gameLabSimulation.status === 'ready' with picks", () => {
  const ready = readyMlbDetails();
  assert.ok(ready.length >= 1, "expected at least one MLB detail with a ready simulation");
  const withPicks = ready.find((d) => d.gameLabSimulation.generatedPicks.length > 0);
  assert.ok(withPicks, "expected a ready MLB simulation carrying generatedPicks");
  const view = withPicks.gameLabSimulation;
  assert.equal(view.status, "ready");
  assert.ok(Array.isArray(view.generatedPicks) && view.generatedPicks.length > 0);
  // Provenance survived: every surfaced pick carries non-empty sourceFields + paperOnly true.
  for (const p of view.generatedPicks) {
    assert.ok(Array.isArray(p.sourceFields) && p.sourceFields.length > 0, "pick must keep its provenance");
    assert.equal(p.paperOnly, true, "pick must be paper-only");
  }
  // The view carries the honesty metadata the UI gates on.
  assert.ok(view.teams && view.teams.home && view.teams.away);
  assert.equal(typeof view.allowsRunCountClaim, "boolean");
});

// ── 2 · The runner renders a "Generate Simulation" affordance when ready ────────────────────────
test("GameSimulationRunner exposes a 'Generate Simulation' affordance", () => {
  assert.match(RUNNER_SRC, /Generate Simulation/, "runner must offer a 'Generate Simulation' button");
  // It is a real interactive control (a button with an onClick), not static text.
  assert.match(RUNNER_SRC, /<button/, "runner must render a button");
  assert.match(RUNNER_SRC, /onClick=\{start\}/, "the Generate button must trigger the reveal");
  assert.match(RUNNER_SRC, /"use client"/, "runner must be a client component");
});

// ── 3 · Missing artifact game → unavailable copy, no throw ───────────────────────────────────────
test("a missing artifact game yields an 'unavailable' view without throwing", () => {
  // Functional: a game that is NOT in the current slate's artifact must read as an honest "unavailable"
  // view, never a throw. (SLATE ADVANCED to 2026-07-08, whose artifact covers all 15 board games, so we
  // exercise the missing-game path through a synthetic gameId rather than a real board game.)
  const res = readGameSimulation(APP_ROOT_DATA, "mlb", "2026-07-08", "does-not-exist-game");
  assert.equal(res.status, "unavailable", "a game absent from the artifact reads as unavailable");
  const view = buildGameSimulationView(res);
  assert.equal(view.status, "unavailable");
  assert.equal(view.slug, null);
  assert.equal(view.generatedPicks.length, 0);

  // The builder helper never throws for a synthesized unavailable view either.
  const v = unavailableSimulationView("mlb", "2026-07-08", "nope", "game_not_in_artifact");
  assert.equal(v.status, "unavailable");
  assert.equal(v.slug, null);

  // The runner shows the calm "not yet available" copy for that status.
  assert.match(RUNNER_SRC, /Simulation not yet available for this game/);
});

// ── 4 · No per-user randomness / no fetch / no writes / no fs in the client component ────────────
test("the reveal is animation-only: no Math.random, fetch, fs, or writes in the runner or view", () => {
  for (const [label, src] of [["runner", RUNNER_SRC], ["view", VIEW_SRC]]) {
    assert.doesNotMatch(src, /Math\.random/, `${label} must not use Math.random (no per-user randomness)`);
    assert.doesNotMatch(src, /\bfetch\s*\(/, `${label} must not fetch`);
    assert.doesNotMatch(src, /require\(["']node:fs["']\)|from ["']node:fs["']|from ["']fs["']/, `${label} must not import fs`);
    assert.doesNotMatch(src, /writeFile|writeFileSync|localStorage|sessionStorage/, `${label} must not write`);
  }
  // The view is a pure JSON reshape of the SAME artifact for every caller — building it twice from the
  // same reader result is deep-equal (deterministic; no clock/randomness).
  const result = {
    status: "ready",
    sport: "mlb",
    date: "2026-07-07",
    gameId: "g1",
    game: {
      gameId: "g1",
      slug: "a-vs-b-2026-07-07",
      teams: { home: "B", away: "A" },
      status: "ready",
      simulationSummary: { headline: "x" },
      distributions: null,
      generatedPicks: [
        { id: "p1", sport: "mlb", gameId: "g1", market: "m", side: "over", line: 1.5, projection: 2, modelProbability: 0.6, marketProbability: 0.5, edgePct: 10, confidence: 0.7, riskTier: "core", reasonBullets: [], sourceFields: ["line"], paperOnly: true },
      ],
      unavailableModules: [],
      integrity: { sourceBoardHash: "h", artifactHash: "h" },
    },
    unavailableModules: [],
    reason: "ok",
    errors: [],
  };
  const meta = { modelVersion: "mlb-2026.07", simulationVersion: 1, runCount: 1000, generatedAt: "2026-07-08T05:00:00Z" };
  const a = buildGameSimulationView(result, meta);
  const b = buildGameSimulationView(result, meta);
  assert.deepEqual(a, b, "same inputs must produce a deep-equal view (deterministic)");
});

// ── 5 · The generatedPicks the view exposes are exactly the artifact's picks ────────────────────
test("the sim view's generatedPicks are the artifact's picks verbatim (read from disk)", () => {
  // Compare against the NEWEST game-simulations artifact — the same one buildAllGameDetails()/
  // readyMlbDetails() read from — derived from disk so this stays correct as the daily slate advances
  // (rather than pinning a single date that goes stale the next day).
  const simDir = path.join(APP_ROOT, "public", "data", "mlb", "game-simulations");
  const newest = fs
    .readdirSync(simDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .pop();
  const artifact = JSON.parse(fs.readFileSync(path.join(simDir, newest), "utf8"));
  const artByGameId = new Map(artifact.games.map((g) => [g.gameId, g]));
  const ready = readyMlbDetails().filter((d) => d.gameLabSimulation.generatedPicks.length > 0);
  assert.ok(ready.length >= 1);
  for (const d of ready) {
    const view = d.gameLabSimulation;
    const src = artByGameId.get(view.gameId);
    assert.ok(src, `artifact should contain game ${view.gameId}`);
    // Same count + same ids in the same order — the view does not add, drop, or reorder picks.
    assert.deepEqual(
      view.generatedPicks.map((p) => p.id),
      src.generatedPicks.map((p) => p.id),
      "view picks must equal the artifact picks",
    );
  }
});

// ── 6 · No "N-run" claim unless runCount is a positive integer ───────────────────────────────────
test("no run-count claim is made unless runCount is a positive integer", () => {
  // The runner only prints an N-run string behind the allowsRunCountClaim gate.
  // Every "-run simulation" template and every explicit run count is guarded.
  assert.match(RUNNER_SRC, /allowsRunCountClaim/, "runner must gate run-count copy on allowsRunCountClaim");
  // The builder computes allowsRunCountClaim via the single-source helper.
  assert.match(VIEW_SRC, /allowsRunCountClaim/, "view must compute allowsRunCountClaim");

  // Functional: a null runCount ⇒ allowsRunCountClaim false ⇒ no claim allowed.
  const base = {
    status: "ready", sport: "mlb", date: "d", gameId: "g", game: {
      gameId: "g", slug: "s", teams: { home: "H", away: "A" }, status: "ready",
      simulationSummary: {}, distributions: null, generatedPicks: [], unavailableModules: [],
      integrity: { sourceBoardHash: "h", artifactHash: "h" },
    }, unavailableModules: [], reason: "ok", errors: [],
  };
  const noRun = buildGameSimulationView(base, { modelVersion: "m", simulationVersion: 1, runCount: null, generatedAt: "t" });
  assert.equal(noRun.allowsRunCountClaim, false);
  const withRun = buildGameSimulationView(base, { modelVersion: "m", simulationVersion: 1, runCount: 1000, generatedAt: "t" });
  assert.equal(withRun.allowsRunCountClaim, true);
  const zeroRun = buildGameSimulationView(base, { modelVersion: "m", simulationVersion: 1, runCount: 0, generatedAt: "t" });
  assert.equal(zeroRun.allowsRunCountClaim, false, "0 runs is not a valid N-run claim");
});

// ── 7 · Paper-only copy present ──────────────────────────────────────────────────────────────────
test("the runner carries paper-only copy", () => {
  assert.match(RUNNER_SRC, /[Pp]aper-only/, "runner must state paper-only");
  assert.match(RUNNER_SRC, /not betting advice/i, "runner must state it is not betting advice");
});

// ── 8 · No banned copy anywhere in the runner or the view builder ────────────────────────────────
test("no banned copy (guaranteed / lock / safe / can't lose / live betting / Monte Carlo / free money)", () => {
  const banned = [
    /guaranteed/i,
    /\block\b/i,
    /\bsafe(st)?\b/i,
    /can['’]?t lose/i,
    /free money/i,
    /live betting/i,
    /monte[\s-]?carlo/i,
  ];
  for (const [label, src] of [["runner", RUNNER_SRC], ["view", VIEW_SRC]]) {
    for (const re of banned) {
      assert.doesNotMatch(src, re, `${label} must not contain banned copy ${re}`);
    }
  }
});

// ── 9 · The MLB Game Lab report is still built + the sim runner is wired (report now GATED behind the
//        reveal via postReveal, not a pre-click sibling) ───────────────────────────────────────────────
test("game-detail-page still builds MlbGameLabReport (gameLabMlb) and wires GameSimulationRunner (report gated behind the reveal)", () => {
  assert.match(DETAIL_PAGE_SRC, /import MlbGameLabReport from/, "must still import MlbGameLabReport");
  // The MLB report is still constructed from detail.gameLabMlb (now assigned to a `mlbReport` node that is
  // threaded into the runner's postReveal on the MLB-sim path, or rendered directly on the non-sim path).
  assert.match(DETAIL_PAGE_SRC, /const mlbReport = detail\.gameLabMlb \?[^\n]*<MlbGameLabReport view=\{detail\.gameLabMlb\}/, "must still build the MLB Game Lab report node");
  assert.match(DETAIL_PAGE_SRC, /import GameSimulationRunner from/, "must import the sim runner");
  // The runner is rendered with the sim view (bound to `sim = detail.gameLabSimulation!`) on the MLB-sim
  // path, and the gated report/spotlight/tabs are handed to it via postReveal (revealed only when done).
  assert.match(DETAIL_PAGE_SRC, /const isMlbSim = detail\.sport === "mlb" && !!detail\.gameLabSimulation/, "MLB-sim gate defined");
  assert.match(DETAIL_PAGE_SRC, /const sim = detail\.gameLabSimulation!/, "sim view bound from detail.gameLabSimulation");
  assert.match(DETAIL_PAGE_SRC, /<GameSimulationRunner\s+view=\{sim\}/, "must render the sim runner with the sim view");
  assert.match(DETAIL_PAGE_SRC, /postReveal=\{<>\{gameCenter\}\{mlbReport\}\{spotlight\}\{tabsShell\}<\/>\}/, "the Game Center + report + spotlight + tabs are gated behind the reveal via postReveal");
});

// Non-MLB details never carry a simulation view (null/undefined).
test("non-MLB details do not carry a simulation view", () => {
  const all = buildAllGameDetails();
  for (const d of all.filter((x) => x.sport !== "mlb")) {
    assert.ok(d.gameLabSimulation == null, `${d.sport} detail must not carry a sim view`);
  }
});

// ── 10 · Canonical money file untouched ──────────────────────────────────────────────────────────
test("canonical money file (portfolio.json) md5 is unchanged", () => {
  const buf = fs.readFileSync(path.join(APP_ROOT, "public", "data", "mr-dub", "portfolio.json"));
  const md5 = crypto.createHash("md5").update(buf).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json money file must be untouched");
});

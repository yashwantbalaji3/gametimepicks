/**
 * P308 — the inline simulation story's pure rules: reduced motion stops the clock and the growth, charts have their
 * sentence, the reveal never claims the browser is running a simulation, and the story is mounted inline (no dialog,
 * no portal, no capture frame) with the direct report always reachable.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { holdFor, revealDuration, describeBars, narrationFor, MAX_HOLD_MS } from "./story-controls.mjs";
import { buildMlbPresentation } from "./mlb.ts";

test("reduced motion: no auto-advance and no growth; otherwise the chapter's own hold, capped", () => {
  assert.equal(holdFor({ holdMs: 4000 }, { reduced: true }), null);
  assert.equal(holdFor({ holdMs: 4000 }), 4000);
  assert.equal(holdFor({ holdMs: 60000 }), MAX_HOLD_MS);
  assert.equal(holdFor({}), 5000);
  assert.equal(revealDuration({ reduced: true }), 0);
  assert.ok(revealDuration() > 0);
});

test("a chart is also a sentence: highlighted bars first, the same numbers", () => {
  const s = describeBars([{ label: "3", p: 0.1 }, { label: "8", p: 0.15, highlight: true }, { label: "9", p: 0.12 }], "runs");
  assert.match(s, /^8 runs: 15%, 9 runs: 12%, 3 runs: 10%\.$/);
  assert.equal(describeBars([]), "");
});

test("the reveal narrates READING an artifact; it never says the browser is running a simulation", () => {
  const lines = narrationFor({ provenance: { runCount: 10000 } });
  assert.ok(lines.some((l) => /from 10,000 simulated games/.test(l)), "a recorded run count is cited");
  assert.ok(lines.every((l) => !/running|computing|simulating now/i.test(l)));
  const none = narrationFor({ provenance: { runCount: null } });
  assert.ok(none.every((l) => !/\d/.test(l)), "no run count recorded ⇒ no number in the narration");
});

test("paused MLB calls survive into the presentation chapters", () => {
  const detail = {
    slug: "laa-vs-sf-2026-09-15", matchId: 1, homeTeam: "SF", awayTeam: "LAA", reconciled: { ok: true },
    fullGameSim: { status: "ready", homeTeam: "SF", awayTeam: "LAA", homeTeamName: "Giants", awayTeamName: "Angels", runCount: 10000, artifactHash: "h", winProbability: { home: 0.6, away: 0.4 }, totalRuns: { median: 9, mean: 9.1, p10: 5, p90: 13, distribution: [] }, finalScores: [], runLine: [] },
    fullGameSimMeta: { generatedAt: "2026-09-15T12:00:00Z" },
    gameLabSimulation: { allowsRunCountClaim: true },
    prediction: { artifactHash: "h", homeTeam: "SF", awayTeam: "LAA", predictedWinner: null, projectedScore: { away: 4, home: 5, label: "median" }, moneyline: null, total: { line: 8.5, pick: "UNAVAILABLE", overProbability: null, underProbability: null, pausedReason: "paused", unavailableReason: "Paused · its live record is below a coin flip" }, runLine: null, topPlayerPredictions: [], pausedReasons: { moneyline: "paused", runLine: "paused" }, market: null },
  };
  const m = buildMlbPresentation(detail);
  assert.ok(!("unavailable" in m), m.reason ?? "");
  const text = JSON.stringify(m.chapters);
  assert.match(text, /winner call is paused/i);
  assert.match(text, /"text":"paused"/, "the total and the run line say paused instead of quoting a probability");
  assert.doesNotMatch(text, /"p":0\.6/, "the paused win probability is not drawn as a bar");
});

test("SOURCE PIN · the story is inline (no dialog, no portal, no capture frame) and every report page mounts it beside a reachable report", () => {
  const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const story = src("src/components/simulate/simulation-story.tsx");
  assert.doesNotMatch(story, /role="dialog"|createPortal|data-capture-frame|autoplay/i);
  assert.match(story, /prefers-reduced-motion/);
  assert.match(story, /Skip to the report/);
  assert.match(story, /sr-only/, "every chart carries its sentence");
  assert.match(src("src/components/game/mlb-full-game-report.tsx"), /storySlot/, "MLB report renders the story under its hero");
  assert.match(src("src/components/game/game-detail-page.tsx"), /buildMlbPresentation\(detail\)/);
  assert.match(src("src/app/nfl/game/[eventId]/page.tsx"), /buildNflPresentation\(/);
  assert.match(src("src/app/epl/match/[slug]/page.tsx"), /buildEplPresentation\(/);
  assert.match(src("src/app/ufc/page.tsx"), /buildUfcPresentation\(/);
});

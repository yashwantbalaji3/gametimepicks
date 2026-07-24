/**
 * SIMULATION STORYTELLING GUARDS (Sprint 014 · Phase 4).
 *
 * The story layer is a FORMATTER over canonical fields. These tests pin the three properties that keep it
 * honest:
 *   1. every number it prints traces to a field on the artifact/decision it was handed,
 *   2. a missing input DROPS its beat rather than producing an estimate or a filler sentence,
 *   3. no banned market-comparison copy ever reaches a reader — asserted against the REAL slate, not just
 *      fixtures, so a regression in the generator is caught here too.
 *
 * Run: npx tsx --test src/lib/mlb/prediction/story.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildSimulationStory, withinOneRunShare, CLOSE_GAME_THRESHOLD } from "./story.ts";

/** Words that must never appear in public simulation copy (mirrors public-beta-safety.test.mjs). */
const BANNED = ["edge", "value", "lock", "profitable", "guaranteed", "best bet"];

const bin = (value, probability) => ({ value, label: String(value), count: 0, probability });

const GAME = {
  gamePk: 1,
  slug: "laa-vs-sf-2026-07-24",
  awayTeam: "LAA",
  homeTeam: "SF",
  status: "ready",
  runCount: 10000,
  winProbability: { away: 0.42, home: 0.58 },
  finalScores: [{ away: 3, home: 4, probability: 0.037 }],
  runDifferential: {
    mean: 0.4,
    median: 1,
    p10: -4,
    p90: 5,
    // Two range bins at the edges + exact bins in the middle. Only the exact bins may be counted.
    distribution: [
      { value: -6, label: "≤-6", count: 0, probability: 0.1 },
      bin(-2, 0.09),
      bin(-1, 0.12),
      bin(0, 0.0),
      bin(1, 0.19),
      bin(2, 0.11),
      { value: 6, label: "6+", count: 0, probability: 0.1 },
    ],
  },
  totalRuns: null,
  extraInningsProbability: 0.11,
  gameStory: [],
};

const PREDICTION = {
  topPlayerPredictions: [
    { player: "Logan Webb", pick: "UNDER", line: 5.5, marketLabel: "Strikeouts", simulationProbability: 0.84 },
  ],
};

test("every beat restates a canonical value — nothing is invented", () => {
  const beats = buildSimulationStory(GAME, PREDICTION);
  const by = (k) => beats.find((b) => b.kind === k)?.text;

  assert.equal(by("winner"), "SF wins 58% of simulations.", "58% is winProbability.home, SF is the favored side");
  assert.equal(by("outcome"), "Most common outcome: LAA 3 – SF 4 (370 / 10,000 simulations).", "0.037 × 10,000");
  // 0.12 + 0.0 + 0.19 = 31% — the EXACT bins only; the two 10% range bins are excluded.
  assert.equal(by("closeness"), "This matchup is relatively close: 31% of simulations finish within one run.");
  assert.equal(by("player"), "Biggest player factor: Logan Webb UNDER 5.5 Strikeouts — 8,400 / 10,000 simulations.");
});

test("range bins are never counted as an exact margin", () => {
  assert.ok(Math.abs(withinOneRunShare(GAME) - 0.31) < 1e-9);
  // A distribution made ONLY of range bins yields 0, not a guess drawn from their probabilities.
  const ranged = { ...GAME, runDifferential: { ...GAME.runDifferential, distribution: [{ value: -6, label: "≤-6", count: 0, probability: 0.5 }, { value: 6, label: "6+", count: 0, probability: 0.5 }] } };
  assert.equal(withinOneRunShare(ranged), 0);
  assert.equal(withinOneRunShare({ ...GAME, runDifferential: null }), null, "absent distribution → null, not 0");
});

test("a missing input DROPS its beat — never a placeholder or an estimate", () => {
  const noPlayer = buildSimulationStory(GAME, null);
  assert.ok(!noPlayer.some((b) => b.kind === "player"), "no prediction → no player beat");
  assert.equal(noPlayer.length, 3, "the other three still tell the story");

  const noScores = buildSimulationStory({ ...GAME, finalScores: [] }, PREDICTION);
  assert.ok(!noScores.some((b) => b.kind === "outcome"));

  const noWin = buildSimulationStory({ ...GAME, winProbability: null }, PREDICTION);
  assert.ok(!noWin.some((b) => b.kind === "winner"));

  const noDist = buildSimulationStory({ ...GAME, runDifferential: null }, PREDICTION);
  assert.ok(!noDist.some((b) => b.kind === "closeness"));

  // An unsimulated game tells NO story at all rather than a hedged one.
  assert.deepEqual(buildSimulationStory({ ...GAME, status: "unavailable" }, PREDICTION), []);
  assert.deepEqual(buildSimulationStory({ ...GAME, runCount: 0 }, PREDICTION), []);
});

test("frequency is omitted rather than divided by a zero/absent run count", () => {
  // runCount 0 short-circuits the whole story, so exercise the formatter through a degraded-but-present count.
  const beats = buildSimulationStory({ ...GAME, runCount: 1 }, PREDICTION);
  const outcome = beats.find((b) => b.kind === "outcome").text;
  assert.ok(outcome.includes("0 / 1 simulations"), "rounds honestly at tiny counts instead of hiding the count");
});

test("the 'relatively close' lead is a documented threshold, not a vibe", () => {
  const justUnder = { ...GAME, runDifferential: { ...GAME.runDifferential, distribution: [bin(-1, 0.1), bin(0, 0.0), bin(1, 0.15)] } };
  const text = buildSimulationStory(justUnder, null).find((b) => b.kind === "closeness").text;
  assert.ok(0.25 < CLOSE_GAME_THRESHOLD);
  assert.equal(text, "25% of simulations finish within one run.", "below the threshold → the bare fact, no adjective");
});

test("deterministic: same input, same story, stable order", () => {
  const a = buildSimulationStory(GAME, PREDICTION);
  const b = buildSimulationStory(GAME, PREDICTION);
  assert.deepEqual(a, b);
  assert.deepEqual(a.map((x) => x.kind), ["winner", "outcome", "closeness", "player"]);
});

test("no banned market-comparison copy — in the module OR in the real slate's stories", () => {
  const src = fs.readFileSync(new URL("./story.ts", import.meta.url), "utf8");
  // Scan the STATIC COPY the module can emit — its string/template literals, minus their `${…}` slots.
  // (Scanning raw source instead would flag the artifact's own `bin.value` field name, which no reader sees;
  // scanning literals is the tighter test — it is exactly the text that can reach a page.)
  const code = src.slice(src.indexOf("import "));
  const literals = (code.match(/`[^`]*`|"[^"]*"|'[^']*'/g) ?? []).map((s) => s.replace(/\$\{[^}]*\}/g, " "));
  assert.ok(literals.length > 5, "found the module's copy literals to scan");
  for (const w of BANNED) {
    const hit = literals.find((s) => new RegExp(`\\b${w}\\b`, "i").test(s));
    assert.ok(!hit, `story.ts must not emit the word "${w}" (found in ${hit})`);
  }

  // Against REAL data: the shipped artifact's own gameStory must be clean too.
  const dir = path.join(process.cwd(), "public", "data", "mlb", "full-game-simulations");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  assert.ok(files.length > 0, "there is at least one shipped simulation artifact to check");
  for (const f of files) {
    const artifact = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const g of artifact.games ?? []) {
      const story = buildSimulationStory(g, null).map((b) => b.text).concat(g.gameStory ?? []).join(" ");
      for (const w of BANNED) {
        assert.ok(!new RegExp(`\\b${w}\\b`, "i").test(story), `${f} ${g.slug}: story contains banned word "${w}"`);
      }
    }
  }
});

test("real slate: the story never prints a number the artifact does not carry", () => {
  const dir = path.join(process.cwd(), "public", "data", "mlb", "full-game-simulations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  let checked = 0;
  for (const f of files) {
    const artifact = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const g of artifact.games ?? []) {
      const beats = buildSimulationStory(g, null);
      if (g.status === "unavailable" || g.runCount <= 0) {
        assert.equal(beats.length, 0, `${g.slug}: an unsimulated game must tell no story`);
        continue;
      }
      const winner = beats.find((b) => b.kind === "winner");
      if (winner) {
        const pct = Math.round(Math.max(g.winProbability.away, g.winProbability.home) * 100);
        assert.ok(winner.text.includes(`${pct}%`), `${g.slug}: winner beat must quote the artifact's probability`);
      }
      const share = withinOneRunShare(g);
      if (share != null) assert.ok(share >= 0 && share <= 1, `${g.slug}: share must be a probability`);
      checked += 1;
    }
  }
  assert.ok(checked > 0, "exercised at least one real game");
});

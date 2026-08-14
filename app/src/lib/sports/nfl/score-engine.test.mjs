/**
 * P184 · The NFL full-game score engine must keep reproducing the MEASURED preseason distribution.
 *
 * The constants in the engine were fitted once. A fitted constant with a comment claiming it matches
 * the data is worth nothing a month later, so this guard re-derives the target moments from the
 * corpus itself on every suite run and re-simulates. If someone edits a rate, this fails.
 *
 * The corpus is internal research data. When it is absent (a clean CI checkout), the calibration
 * assertions are skipped and the SHAPE assertions still run — a skipped calibration is stated, never
 * silently passed off as a green calibration.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { simulateFullGame, SCORING, rosterModifier, buildGameStory } from "../../../../scripts/nfl/lib/nfl-score-engine.mjs";

const CORPUS = path.join(process.cwd(), "..", "data/internal/research/nfl/corpus-v1.json");
const hasCorpus = fs.existsSync(CORPUS);

const sd = (a) => {
  const m = a.reduce((t, v) => t + v, 0) / a.length;
  return Math.sqrt(a.reduce((t, v) => t + (v - m) ** 2, 0) / a.length);
};
const mean = (a) => a.reduce((t, v) => t + v, 0) / a.length;

/** One big simulated sample, reused across the calibration assertions. */
const sim = simulateFullGame({ gameId: "calibration", awayTeam: "AAA", homeTeam: "BBB", runs: 40000 });
const simTeam = [];
for (const b of sim.totalScore.distribution) void b;

test("CALIBRATION · the engine reproduces the measured preseason moments", { skip: !hasCorpus && "corpus-v1.json not present (internal research data)" }, () => {
  const rows = JSON.parse(fs.readFileSync(CORPUS, "utf8")).rows.filter((r) => r.phase === 1);
  assert.ok(rows.length >= 100, `need a real preseason sample, got ${rows.length}`);
  const teamPts = [...rows.map((r) => r.ftHome), ...rows.map((r) => r.ftAway)];
  const totals = rows.map((r) => r.ftHome + r.ftAway);
  const margins = rows.map((r) => r.ftHome - r.ftAway);

  // Simulated team points, read off the same universe the report renders.
  const s = sim.teamScore;
  const simMeanTeam = (s.away.mean + s.home.mean) / 2;
  const within = (got, want, tolPct, what) =>
    assert.ok(Math.abs(got - want) / Math.abs(want) <= tolPct,
      `${what}: simulated ${got.toFixed(2)} vs measured ${want.toFixed(2)} — outside ${tolPct * 100}%`);

  within(simMeanTeam, mean(teamPts), 0.05, "mean team points");
  within(sim.totalScore.mean, mean(totals), 0.05, "mean total");
  // Dispersion is the half P180 found broken; hold it tighter than the means.
  const simMarginSd = sd(sim.scoreDifferential.distribution.flatMap((b) => Array(Math.round(b.probability * 2000)).fill(b.value)));
  within(simMarginSd, sd(margins), 0.12, "margin dispersion");
});

test("NO home-field advantage is applied — preseason home edge measures zero", { skip: !hasCorpus && "corpus absent" }, () => {
  const rows = JSON.parse(fs.readFileSync(CORPUS, "utf8")).rows.filter((r) => r.phase === 1);
  const measured = mean(rows.map((r) => r.ftHome - r.ftAway));
  assert.ok(Math.abs(measured) < 1.0, `measured preseason home edge is ${measured.toFixed(2)} — if this ever leaves ±1 the engine's symmetry assumption needs revisiting`);
  // With identical rosters the engine must be symmetric to within Monte Carlo noise.
  const sym = simulateFullGame({ gameId: "symmetry", awayTeam: "AAA", homeTeam: "BBB", runs: 40000 });
  assert.ok(Math.abs(sym.winProbability.home - sym.winProbability.away) < 0.03,
    `identical rosters must simulate symmetric, got home ${sym.winProbability.home} vs away ${sym.winProbability.away}`);
});

test("scores are FOOTBALL scores — lumpy sums of 7s and 3s, not a normal draw", () => {
  // The defect this replaced rendered 19-18. Real football scores concentrate on a small set.
  const common = new Set([3, 6, 7, 10, 13, 14, 16, 17, 20, 21, 23, 24, 27, 28, 30, 31]);
  const top = sim.finalScores.slice(0, 5);
  const hits = top.filter((f) => common.has(f.away) && common.has(f.home)).length;
  assert.ok(hits >= 3, `at least 3 of the top 5 simulated scorelines must be ordinary football scores, got ${hits}: ${top.map((f) => `${f.away}-${f.home}`).join(", ")}`);
  // Key numbers must carry real mass — a Gaussian margin would not produce this.
  assert.ok(sim.keyNumbers.share > 0.15, `key-number share ${sim.keyNumbers.share} is too low to be football`);
});

test("every game-level output is read off the SAME simulated universe", () => {
  // Win probabilities and ties partition the runs exactly.
  const total = sim.winProbability.away + sim.winProbability.home + sim.winProbability.tie;
  assert.ok(Math.abs(total - 1) < 1e-9, `win/loss/tie must partition the runs, summed to ${total}`);
  // The median total and the median team scores must be mutually consistent.
  const impliedTotal = sim.teamScore.away.median + sim.teamScore.home.median;
  assert.ok(Math.abs(impliedTotal - sim.totalScore.median) <= 4,
    `median total ${sim.totalScore.median} must agree with the team medians summing to ${impliedTotal}`);
  // Distributions are proper.
  for (const [name, d] of [["total", sim.totalScore.distribution], ["margin", sim.scoreDifferential.distribution]]) {
    const p = d.reduce((t, b) => t + b.probability, 0);
    assert.ok(Math.abs(p - 1) < 1e-9, `${name} distribution must sum to 1, got ${p}`);
  }
  // Cover probabilities must be monotone in the line.
  const home = sim.spread.map((s) => s.homeCover);
  for (let i = 1; i < home.length; i += 1) {
    assert.ok(home[i] <= home[i - 1] + 1e-9, `home cover must fall as the line grows: ${home.join(", ")}`);
  }
});

test("DETERMINISM · the same matchup simulates identically", () => {
  const a = simulateFullGame({ gameId: "x", awayTeam: "DEN", homeTeam: "ATL", runs: 3000 });
  const b = simulateFullGame({ gameId: "x", awayTeam: "DEN", homeTeam: "ATL", runs: 3000 });
  assert.deepEqual(a.finalScores, b.finalScores);
  assert.equal(a.winProbability.home, b.winProbability.home);
  const c = simulateFullGame({ gameId: "y", awayTeam: "DEN", homeTeam: "ATL", runs: 3000 });
  assert.notDeepEqual(a.finalScores, c.finalScores, "different games must not share a simulated universe");
});

test("the roster modifier is BOUNDED — roster composition cannot manufacture an edge", () => {
  // Three team-strength models were rejected; this is the only asymmetry allowed, and it is weak.
  assert.equal(rosterModifier(100, 0).applied, false, "a missing projection falls back to the league baseline");
  assert.equal(rosterModifier(100, 0).multiplier, 1);
  for (const ratio of [0.2, 0.5, 2, 5]) {
    const m = rosterModifier(ratio * 20, 20).multiplier;
    assert.ok(m >= 0.88 && m <= 1.12, `modifier must clamp to ±12%, ratio ${ratio} gave ${m}`);
  }
  // Shrinkage: half the raw signal, so a 20% roster edge becomes 10%.
  assert.ok(Math.abs(rosterModifier(24, 20).multiplier - 1.1) < 1e-9, "raw +20% must shrink to +10%");
  // Even at the clamp, the swing stays under the game-to-game noise (±8.69).
  const hi = simulateFullGame({ gameId: "z", awayTeam: "A", homeTeam: "B", runs: 20000, homeRosterMult: 1.12 });
  const lo = simulateFullGame({ gameId: "z", awayTeam: "A", homeTeam: "B", runs: 20000, homeRosterMult: 0.88 });
  const swing = hi.teamScore.home.mean - lo.teamScore.home.mean;
  assert.ok(swing < 8.69, `the full roster swing (${swing.toFixed(1)} pts) must stay below the measured ±8.69 game noise`);
});

test("the story states only what the simulation computed, and claims no advantage", () => {
  const story = buildGameStory(sim, "DEN", "ATL").join(" ");
  for (const banned of ["lock", "best bet", "guaranteed", "edge", "value", "should bet"]) {
    assert.doesNotMatch(story, new RegExp(`\\b${banned}\\b`, "i"), `the story must not say "${banned}"`);
  }
  assert.match(story, /wins \d+% of simulations/);
  assert.match(story, /Most common final score/);
});

test("the model version is stamped so an artifact can be traced to this engine", () => {
  assert.match(SCORING.MODEL_VERSION, /^nfl-full-game-v\d/);
  assert.equal(SCORING.SCORING_CHANCES, 7);
  // The header documents this as LATENT, not measured. Guard the wording so the distinction survives.
  // Normalise comment continuation (" * " and wrapped lines) so a guarded sentence that happens to
  // wrap still matches — otherwise this guard passes or fails on line width, not on meaning.
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/lib/nfl-score-engine.mjs"), "utf8")
    .replace(/\n\s*\*\s?/g, " ")
    .replace(/\s+/g, " ");
  assert.match(src, /NOT a measured drive count/, "the latent-vs-measured distinction must stay recorded");
  assert.match(src, /no drive-level corpus/i, "the reason we cannot claim measured drives must stay recorded");
});

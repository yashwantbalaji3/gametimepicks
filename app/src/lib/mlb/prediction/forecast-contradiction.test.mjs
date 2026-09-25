/**
 * FORECAST CONTRADICTION GUARD (P2 · 2026-09-25).
 *
 * The founder opened an MLB game page and read two different GameTimePicks scores for one game:
 * the overview said "CHC 4 – 4 BOS" and the simulation read, three inches below it, said
 * "BOS 3 – CHC 4". Neither was stale and neither was a leaked default. The overview was rounding
 * the simulated MEAN (4.36 / 3.76) and calling the result a "Projected score", while the canonical
 * owner — `buildGamePredictionDecision` — publishes the MEDIAN and names it "Median simulation
 * score". Two statistics, one name, and a reader with no way to tell which number was the answer.
 *
 * These guards pin the three things that made it wrong, so none of them can come back quietly:
 *   1. the owner's methodology (the projected score IS the median, and it says so itself);
 *   2. that a rounded mean genuinely contradicts that median ON REAL SLATE DATA — without this the
 *      other guards could pass on a slate where the two happen to agree, which is exactly how a
 *      guard decays into a false reassurance;
 *   3. that no MLB surface re-derives a score of its own.
 *
 * Run: npx tsx --test src/lib/mlb/prediction/forecast-contradiction.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildGamePredictionDecision } from "./decision.ts";

const app = process.cwd();
const simDir = path.join(app, "public/data/mlb/full-game-simulations");

/** Every committed slate that actually carries simulations, newest first. */
const slates = () =>
  (fs.existsSync(simDir) ? fs.readdirSync(simDir) : [])
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse()
    .map((f) => JSON.parse(fs.readFileSync(path.join(simDir, f), "utf8")))
    .filter((a) => Array.isArray(a?.games));

const simulated = (a) => a.games.filter((g) => g && g.runs && g.winProbability && g.status !== "unavailable");

test("the canonical projected score IS the median, and it carries its own label", () => {
  const withGames = slates().filter((a) => simulated(a).length);
  assert.ok(withGames.length, "no committed MLB slate carries a simulation — this guard would be vacuous");
  let checked = 0;
  for (const a of withGames.slice(0, 3)) {
    for (const g of simulated(a)) {
      const d = buildGamePredictionDecision(g, []);
      if (!d.projectedScore) continue;
      checked += 1;
      assert.equal(d.projectedScore.away, g.runs.away.median, `${g.awayTeam}@${g.homeTeam}: away projected score must be the simulated median`);
      assert.equal(d.projectedScore.home, g.runs.home.median, `${g.awayTeam}@${g.homeTeam}: home projected score must be the simulated median`);
      assert.match(d.projectedScore.label, /median/i, "the projected score must name the statistic it is");
    }
  }
  assert.ok(checked >= 5, `only ${checked} games checked — too few to call this guard live`);
});

/*
 * ANTI-VACUITY. The guards above and below are only worth anything if a rounded mean would, in
 * fact, say something different from the median on a real slate. On 2026-09-25 it did so in 9 of
 * the 12 simulated games, manufactured a tie in 6, and disagreed about which side outscored the
 * other in 3. If this test ever goes quiet the defect class has changed shape and the other guards
 * need re-pointing, NOT deleting.
 */
test("a rounded mean really does contradict the median on real slate data", () => {
  let games = 0, differs = 0, ties = 0;
  for (const a of slates().slice(0, 3)) {
    for (const g of simulated(a)) {
      games += 1;
      const rA = Math.round(g.runs.away.mean), rH = Math.round(g.runs.home.mean);
      if (rA !== g.runs.away.median || rH !== g.runs.home.median) differs += 1;
      if (rA === rH && g.runs.away.median !== g.runs.home.median) ties += 1;
    }
  }
  assert.ok(games >= 5, `only ${games} simulated games available — guard is vacuous`);
  assert.ok(differs > 0,
    `a rounded mean matched the median in all ${games} games, so the contradiction guards below prove nothing here — re-point them rather than trusting this silence`);
  assert.ok(ties > 0,
    "no rounded-mean tie appeared in the sample — the specific '4 – 4' failure mode is unrepresented, so re-point the guard");
});

test("no MLB surface re-derives a score from a simulated mean", () => {
  /* The report is the page the founder was reading; the other three are every remaining surface
     that publishes an MLB score claim. A mean may be SHOWN — it may not be rounded into a score. */
  for (const rel of [
    "src/components/game/mlb-full-game-report.tsx",
    "src/lib/command-center/featured.ts",
    "src/lib/simulate/presentation/mlb.ts",
    "src/lib/top-reads.ts",
  ]) {
    const p = path.join(app, rel);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, "utf8");
    assert.ok(!/Math\.round\s*\([^)]*\.mean\b/.test(src),
      `${rel} rounds a simulated mean — a rounded mean is an expected value, never a score. Publish the mean to one decimal and read the score from buildGamePredictionDecision.`);
  }
});

test("the report's score row reads the owner's label instead of naming the statistic itself", () => {
  const src = fs.readFileSync(path.join(app, "src/components/game/mlb-full-game-report.tsx"), "utf8");
  assert.ok(/prediction\.projectedScore\.label/.test(src),
    "the head-to-head must render the canonical score under the OWNER's label, so a component can never rename the statistic");
  assert.ok(/label:\s*`Expected \$\{V\.scoreUnit\}`/.test(src),
    "the head-to-head verdict must publish the mean as an EXPECTED value, explicitly labelled");
});

/*
 * REPO-WIDE, because the four files above were the four that happened to exist on 2026-09-25 and a
 * guard pinned to today's file list decays the moment someone adds a fifth surface. The rule is a
 * property of the codebase, not of a list: nothing that renders may round a simulated mean.
 */
test("no surface anywhere rounds a simulated mean into a score", () => {
  const roots = ["src/components", "src/lib", "src/app"];
  const offenders = [];
  let scanned = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(e.name) || /\.test\./.test(e.name)) continue;
      scanned += 1;
      const src = fs.readFileSync(full, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
      if (/Math\.round\s*\([^)]*\.mean\b/.test(src)) offenders.push(path.relative(app, full));
    }
  };
  for (const r of roots) { const d = path.join(app, r); if (fs.existsSync(d)) walk(d); }
  assert.ok(scanned > 200, `only ${scanned} source files scanned — the walker is not reaching the tree`);
  assert.deepEqual(offenders, [],
    `these round a simulated mean: ${offenders.join(", ")}. A rounded mean is an expected value, not a score — publish it to one decimal, or read the score from its canonical owner.`);
});

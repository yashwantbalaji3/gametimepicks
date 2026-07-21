/**
 * SIMULATION DASHBOARD — the post-simulation reveal is one honest report, not an in-runner dashboard.
 *
 * The runner's `phase === "done"` block is now just [ "Simulation complete" header → the V2.5 report
 * (postReveal) → a paper-only disclaimer → post-reveal nav ]. The dense modules that used to render in the
 * runner (priced snapshot, central read, main takeaways, pick table, distributions, market agreement,
 * unavailable modules, recap) now live as first-class SECTIONS of the primary V2.5 report
 * (`mlb-simulation-report-v2.tsx`) — the player board, biggest model leads, agreement, distributions,
 * coverage. Public copy uses "gap"/"model gap"/"model lead", never a visible "edge" label.
 *
 * These tests are real-timer-free: the pure derivation helpers (humanizeMarket / deriveTakeaways /
 * marketAgreement / buildRecap / pricedPicks) are STILL exported from the runner .tsx and exercised on a
 * small fixture array; the rest are source assertions (V2.5 section markers, runner header + Phase-2
 * animation + idle button untouched, no banned copy) + the money md5.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  humanizeMarket,
  deriveTakeaways,
  marketAgreement,
  buildRecap,
  pricedPicks,
} from "../components/game/game-simulation-runner.tsx";

const app = process.cwd();
const RUNNER_SRC = fs.readFileSync(path.join(app, "src/components/game/game-simulation-runner.tsx"), "utf8");
const V2_SRC = fs.readFileSync(path.join(app, "src/components/game/mlb-simulation-report-v2.tsx"), "utf8");

// House honest-language ban. `\bsafe\b` / `\block\b` are whole words — "block"/"unlock" stay fine.
const BANNED =
  /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|can'?t lose|sure thing|risk-?free|free money|easy money|Monte Carlo|live betting/i;

// ── a small, deterministic fixture pick array (real SimGeneratedPick shape) ──────────────────────
const mk = (o) => ({
  id: o.id,
  sport: "mlb",
  gameId: "g1",
  market: o.market,
  player: o.player,
  team: o.team,
  line: o.line ?? null,
  side: o.side,
  projection: o.projection,
  modelProbability: o.modelProbability,
  marketProbability: o.marketProbability,
  edgePct: o.edgePct,
  confidence: o.confidence,
  riskTier: o.riskTier ?? "core",
  reasonBullets: o.reasonBullets ?? [],
  sourceFields: ["simulationSummary.projectedTotal"],
  paperOnly: true,
});

// edge-sorted like the artifact (generatedPicks[0] = strongest). Two share max confidence to test ties.
const PICKS = [
  mk({ id: "p1", player: "Aaron Judge", market: "batter_total_bases", side: "over", line: 1.5, projection: 1.9, modelProbability: 0.62, marketProbability: 0.5, edgePct: 12, confidence: 0.7 }),
  mk({ id: "p2", player: "Mookie Betts", market: "batter_hits", side: "over", line: 0.5, projection: 1.1, modelProbability: 0.7, marketProbability: 0.64, edgePct: 6, confidence: 0.8 }),
  mk({ id: "p3", team: "NYY", market: "team_total", side: "over", line: 4.5, projection: 4.9, modelProbability: 0.55, marketProbability: 0.52, edgePct: 3, confidence: 0.8 }),
  mk({ id: "p4", player: "Juan Soto", market: "batter_total_bases", side: "over", line: 1.5, projection: 1.7, modelProbability: 0.58, marketProbability: null, edgePct: 4, confidence: 0.6 }),
];

const VIEW = {
  status: "ready",
  sport: "mlb",
  date: "2026-07-08",
  gameId: "g1",
  slug: "nyy-vs-lad-2026-07-08",
  teams: { home: "LAD", away: "NYY" },
  modelVersion: "mlb-2026.07",
  simulationVersion: 3,
  runCount: 20000,
  allowsRunCountClaim: true,
  generatedAt: "2026-07-08T12:00:00Z",
  simulationSummary: { headline: "Bats favor the road side.", projectedTotal: 9.1 },
  generatedPicks: PICKS,
  distributions: null,
  unavailableModules: [],
  reason: "ok",
};

// ── 1 · humanizeMarket titleizes a raw key, deterministically ────────────────────────────────────
test("humanizeMarket('batter_total_bases') → 'Batter Total Bases' (deterministic)", () => {
  assert.equal(humanizeMarket("batter_total_bases"), "Batter Total Bases");
  assert.equal(humanizeMarket("batter_total_bases"), humanizeMarket("batter_total_bases"));
  assert.equal(humanizeMarket("moneyline"), "Moneyline");
  assert.equal(humanizeMarket(null), "—");
  assert.equal(humanizeMarket(""), "—");
});

// ── 2 · takeaways: strongest lean = max-edge pick; ties broken deterministically ─────────────────
test("deriveTakeaways: strongest lean picks the max-edge pick; ties are deterministic", () => {
  const t = deriveTakeaways(PICKS);
  const strongest = t.find((x) => x.key === "strongest_lean");
  assert.ok(strongest, "a strongest-lean takeaway exists");
  assert.match(strongest.from, /Aaron Judge/, "max edge (12%) is Judge");
  // A pure edge tie must resolve to the FIRST occurrence (index order), same output twice.
  const tie = [
    mk({ id: "a", player: "Zed", market: "batter_hits", side: "over", line: 0.5, projection: 1, modelProbability: 0.6, marketProbability: 0.5, edgePct: 9, confidence: 0.5 }),
    mk({ id: "b", player: "Abe", market: "batter_hits", side: "over", line: 0.5, projection: 1, modelProbability: 0.6, marketProbability: 0.5, edgePct: 9, confidence: 0.5 }),
  ];
  const s1 = deriveTakeaways(tie).find((x) => x.key === "strongest_lean");
  const s2 = deriveTakeaways(tie).find((x) => x.key === "strongest_lean");
  assert.match(s1.from, /Zed/, "edge tie → first occurrence wins");
  assert.deepEqual(s1, s2, "same input ⇒ same output");
});

// ── 3 · takeaways: highest confidence = max-confidence pick ──────────────────────────────────────
test("deriveTakeaways: highest confidence picks the max-confidence pick", () => {
  const t = deriveTakeaways(PICKS);
  const conf = t.find((x) => x.key === "highest_confidence");
  assert.ok(conf, "a highest-confidence takeaway exists");
  // p2 (Betts) and p3 (NYY) both have 0.8; first occurrence (Betts) wins deterministically.
  assert.match(conf.from, /Mookie Betts/, "max confidence 0.80 → first-occurrence Betts");
  assert.equal(conf.value, "80%");
});

// ── 4 · most-common market family = the mode; deterministic tie-break ────────────────────────────
test("deriveTakeaways: most-common market family = mode (deterministic)", () => {
  const t = deriveTakeaways(PICKS);
  const fam = t.find((x) => x.key === "common_market");
  assert.ok(fam, "a common-market takeaway exists");
  // "batter_total_bases" appears twice (p1, p4) → "Batter Total Bases".
  assert.equal(fam.value, "Batter Total Bases");
  // Deterministic: all-distinct families → first-seen family wins the mode.
  const distinct = [
    mk({ id: "x", market: "b_market", side: "over", line: 1, projection: 1, modelProbability: 0.5, marketProbability: 0.5, edgePct: 1, confidence: 0.5 }),
    mk({ id: "y", market: "a_market", side: "over", line: 1, projection: 1, modelProbability: 0.5, marketProbability: 0.5, edgePct: 1, confidence: 0.5 }),
  ];
  const famD = deriveTakeaways(distinct).find((x) => x.key === "common_market");
  assert.equal(famD.value, "B Market", "1-1 tie → first-seen family");
});

// ── 5 · marketAgreement: avg |model−market| over ONLY both-prob picks; count + widest correct ────
test("marketAgreement: avg gap over priced-only picks; count + widest gap correct", () => {
  const a = marketAgreement(PICKS);
  assert.ok(a, "agreement computed");
  // priced-with-both = p1(.12) p2(.06) p3(.03); p4 has null market → excluded.
  assert.equal(a.pricedCount, 3, "only picks with BOTH probs are counted");
  assert.ok(Math.abs(a.avgGap - 0.07) < 1e-9, `avg gap = (0.12+0.06+0.03)/3 = 0.07, got ${a.avgGap}`);
  assert.ok(Math.abs(a.widestGap - 0.12) < 1e-9, "widest gap = 0.12");
  assert.equal(a.widestPick.id, "p1", "widest gap belongs to Judge (p1)");
});

// ── 6 · marketAgreement tier thresholds map at the boundaries (aligned/moderate/stretched) ───────
test("marketAgreement tiers: ≤0.06 aligned, ≤0.12 moderate, else stretched (at boundaries)", () => {
  const at = (gap) => {
    // two identical picks with market=0 ⇒ |model−market| === model === gap exactly (no float drift
    // from a 0.5 offset), so avgGap === the literal gap and boundary comparisons are exact.
    const p = [
      mk({ id: "1", market: "m", side: "over", line: 1, projection: 1, modelProbability: gap, marketProbability: 0, edgePct: 1, confidence: 0.5 }),
      mk({ id: "2", market: "m", side: "over", line: 1, projection: 1, modelProbability: gap, marketProbability: 0, edgePct: 1, confidence: 0.5 }),
    ];
    return marketAgreement(p).tier;
  };
  assert.equal(at(0.06), "tightly aligned", "0.06 boundary → tightly aligned");
  assert.equal(at(0.061), "moderate", "just over 0.06 → moderate");
  assert.equal(at(0.12), "moderate", "0.12 boundary → moderate");
  assert.equal(at(0.13), "stretched", "over 0.12 → stretched");
});

// ── 7 · marketAgreement returns null when zero priced picks (module hidden) ──────────────────────
test("marketAgreement returns null when there are no priced picks", () => {
  assert.equal(marketAgreement([]), null, "empty ⇒ null");
  const unpriced = [mk({ id: "u", market: "m", side: "over", line: 1, projection: 1, modelProbability: 0.6, marketProbability: null, edgePct: 1, confidence: 0.5 })];
  assert.equal(marketAgreement(unpriced), null, "no market prob anywhere ⇒ null (module hidden)");
});

// ── 8 · buildRecap: matchup + strongest lean + pick count; run-count claim gated; NO banned copy ──
test("buildRecap: matchup + lean + pick count; run-count ONLY when allowed; no banned copy", () => {
  const withClaim = buildRecap(VIEW);
  assert.match(withClaim, /NYY @ LAD/, "matchup present");
  assert.match(withClaim, /Strongest lean: Aaron Judge/, "strongest lean present");
  assert.match(withClaim, /Generated picks: 4/, "pick count present");
  assert.match(withClaim, /20,000-run simulation/, "run-count claim present when allowsRunCountClaim");
  assert.match(withClaim, /Paper-only · deterministic · not betting advice/, "paper-only line present");
  assert.ok(!BANNED.test(withClaim), "recap carries no banned copy");

  // Same view but not allowed to claim a run count ⇒ NO "N-run" line.
  const noClaim = buildRecap({ ...VIEW, allowsRunCountClaim: false });
  assert.ok(!/-run simulation/.test(noClaim), "no run-count claim when allowsRunCountClaim is false");
  assert.match(noClaim, /NYY @ LAD/, "matchup still present");

  // Empty picks ⇒ honest no-lean line.
  const noLean = buildRecap({ ...VIEW, generatedPicks: [] });
  assert.match(noLean, /no qualified lean/, "honest no-lean recap");
});

// ── 9 · the single strongest-lean hero now lives in the V2.5 report: edge-ranked + honest no-lean ──
test("V2.5 surfaces the strongest lean from edge-ranked picks with an honest no-lean branch (not a score)", () => {
  // The board + watchlist are edge-ranked (strongest model-vs-market gap first) — same ordering the runner used.
  assert.match(V2_SRC, /const boardPicks = \[\.\.\.picks\]\.sort\(\(a, b\) => b\.edgePct - a\.edgePct\)/, "board is edge-ranked");
  assert.match(V2_SRC, /const watchlist = boardPicks\.filter\(\(p\) => p\.edgePct > 0\)\.slice\(0, 5\)/, "watchlist = top edge-ranked leans");
  // Honest no-lean branch when there is no positive model-vs-market gap.
  assert.ok(V2_SRC.includes("No positive model-vs-market gaps in this game's simulation."), "honest no-lean branch");
  // Framed as a prop read, never a predicted final score.
  assert.ok(V2_SRC.includes("A research board, not a bet slip."), "framed as a research board, not a bet slip");
  assert.ok(V2_SRC.includes("it does not produce a game score"), "explicitly not a game score");
});

// ── 10 · priced-only logic (pure) stays; the priced/agreement surface now lives in the V2.5 report ─
test("pricedPicks counts only marketProbability != null picks; V2.5 owns the priced/agreement surface", () => {
  const priced = pricedPicks(PICKS);
  assert.equal(priced.length, 3, "p4 (null market prob) is excluded from priced");
  assert.ok(priced.every((p) => p.marketProbability != null), "every priced pick carries a market prob");
  // The market-agreement section derives its priced set the same way (both probs finite) and shows an
  // honest empty state when there is nothing to compare.
  assert.match(V2_SRC, /const priced = picks\.filter\(\(p\) => Number\.isFinite\(p\.modelProbability\) && Number\.isFinite\(p\.marketProbability\)\)/, "V2.5 priced set = both-prob picks");
  assert.ok(V2_SRC.includes("No priced props to compare against the book for this game yet."), "honest empty state for zero priced picks");
});

// ── 11 · the full pick table now lives in the V2.5 player board — scrollable, honest empty state ───
test("V2.5 player board renders the full pick table (scrollable, honest empty state)", () => {
  assert.match(V2_SRC, /title="Player simulation board"/, "the player board section exists");
  assert.match(V2_SRC, /boardPicks\.map\(/, "every simulated line is rendered (no silent cap)");
  assert.match(V2_SRC, /overflow-x-auto/, "the board is horizontally scrollable on small screens");
  assert.ok(V2_SRC.includes("No simulated player lines for this game yet."), "honest empty state when there are no picks");
});

// ── 12 · the dashboard modules now render as V2.5 sections; runner keeps animation + gate + header ──
test("dashboard modules live in the V2.5 report; runner keeps the animation, idle button, and header", () => {
  for (const marker of [
    'title="Player simulation board"', // pick table (was PropTable)
    'title="Biggest model leads"', // leans (was GeneratedPickCard grid / MainTakeaways)
    'title="Market agreement"', // was MarketAgreement
    'title="Outcome distributions"', // was DistributionCard
    'title="Simulation coverage"', // coverage / what-is-not-shown (was UnavailableModules)
  ]) {
    assert.ok(V2_SRC.includes(marker), `V2.5 section present: ${marker}`);
  }
  // The runner's done-phase header stays (section 1) — the summary + explicit model-projection label.
  assert.match(RUNNER_SRC, /Model projection · not a final score/, "projected numbers labelled a model projection");
  // The runner reveals the V2.5 report as the single primary report in the done phase.
  assert.match(RUNNER_SRC, /\{postReveal \?/, "the V2.5 report is revealed as postReveal");
  // Phase-2 animation is still rendered for the animating phase — dispatched on the real view.sport, now
  // threading the optional team logos through (the `stage={stage}` prefix is unchanged; extra props follow).
  assert.match(RUNNER_SRC, /<SportSimulationAnimation sport=\{view\.sport\} view=\{view\} stage=\{stage\}/, "animation still renders for the animating phase");
  assert.match(RUNNER_SRC, /phase === "revealing"/, "the animating phase branch is intact");
  // The idle Generate button remains.
  assert.match(RUNNER_SRC, /Generate Simulation/, "idle Generate button label present");
  assert.match(RUNNER_SRC, /onClick=\{start\}/, "idle Generate button still wired to start()");
});

// ── 13 · NO banned copy anywhere in the runner source ────────────────────────────────────────────
test("NO banned copy anywhere in the runner source", () => {
  assert.ok(!BANNED.test(RUNNER_SRC), "no banned/hype/certainty copy in the runner");
  assert.ok(!/Monte Carlo/i.test(RUNNER_SRC), "no 'Monte Carlo'");
  assert.ok(!/10,?000/.test(RUNNER_SRC), "no hard-coded '10,000' claim");
});

// ── 14 · money md5 unchanged ─────────────────────────────────────────────────────────────────────
test("canonical money file (portfolio.json) md5 is unchanged", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json md5 unchanged");
});

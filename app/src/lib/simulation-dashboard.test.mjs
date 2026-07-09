/**
 * SIMULATION DASHBOARD (Phase 7) — the post-simulation reveal is now a full, HONEST dashboard.
 *
 * The `phase === "done"` block of `game-simulation-runner.tsx` renders 10 sections in order:
 *   1 Header (summary; projected numbers labelled a MODEL PROJECTION, never a final score)
 *   2 PricedPropSnapshot   3 CentralRead (a prop LEAN, not a score)   4 MainTakeaways
 *   5 Biggest leans (reused GeneratedPickCard grid, top-6)   6 PropTable   7 Distributions (reused)
 *   8 MarketAgreement (CURRENT-SLATE, not calibration)   9 UnavailableModules (reused)   10 RecapBlock
 *
 * These tests are real-timer-free: the pure derivation helpers (humanizeMarket / deriveTakeaways /
 * marketAgreement / buildRecap) are imported from the .tsx and exercised on a small fixture array; the
 * rest are source assertions (module markers, Phase-2 animation untouched, no banned copy) + the money md5.
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

// ── 9 · central read = generatedPicks[0]; empty picks → honest no-lean branch in source ───────────
test("CentralRead uses generatedPicks[0] and renders an honest no-lean branch when empty", () => {
  assert.match(RUNNER_SRC, /function CentralRead/, "CentralRead exists");
  assert.match(RUNNER_SRC, /const lean = view\.generatedPicks\[0\]/, "central read = the first (edge-sorted) pick");
  assert.match(RUNNER_SRC, /No qualified lean for this game/, "honest no-lean branch");
  // It is a prop read, not a score.
  assert.match(RUNNER_SRC, /A prop lean — not a predicted final score/, "framed as a prop lean, never a score");
});

// ── 10 · priced snapshot only counts marketProbability != null picks (logic + source) ────────────
test("PricedPropSnapshot / pricedPicks count only marketProbability != null picks", () => {
  const priced = pricedPicks(PICKS);
  assert.equal(priced.length, 3, "p4 (null market prob) is excluded from priced");
  assert.ok(priced.every((p) => p.marketProbability != null), "every priced pick carries a market prob");
  assert.match(RUNNER_SRC, /function PricedPropSnapshot/, "the snapshot component exists");
  assert.match(RUNNER_SRC, /No priced markets in this artifact/, "honest empty state for zero priced picks");
});

// ── 11 · prop table caps at top-N with an honest "showing top N of M" note when capped ───────────
test("PropTable caps at a top-N and notes 'showing top N of M' honestly when capped", () => {
  assert.match(RUNNER_SRC, /function PropTable/, "the table component exists");
  assert.match(RUNNER_SRC, /const PROP_TABLE_CAP = 12/, "a sensible cap constant");
  assert.match(RUNNER_SRC, /slice\(0, PROP_TABLE_CAP\)/, "rows are capped");
  assert.match(RUNNER_SRC, /Showing top \$\{PROP_TABLE_CAP\} of \$\{list\.length\} generated picks/, "honest 'showing top N of M' note when capped");
  assert.match(RUNNER_SRC, /overflowX: "auto"/, "the table is horizontally scrollable");
});

// ── 12 · source references all 10 module markers AND Phase-2 animation stays AND idle button stays ─
test("source references all 10 modules; Phase-2 animation + idle Generate button untouched", () => {
  for (const marker of [
    "PricedPropSnapshot",
    "CentralRead",
    "MainTakeaways",
    "PropTable",
    "MarketAgreement",
    "RecapBlock",
    // reused modules kept in the layout:
    "GeneratedPickCard",
    "DistributionCard",
    "UnavailableModules",
  ]) {
    assert.match(RUNNER_SRC, new RegExp(marker), `module marker present: ${marker}`);
  }
  // Header stays (section 1) — the summary + explicit model-projection label.
  assert.match(RUNNER_SRC, /Model projection · not a final score/, "projected numbers labelled a model projection");
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

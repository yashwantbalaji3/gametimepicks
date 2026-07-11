/**
 * WC → MultiSportGameReport adapter + FreeSim report UI honesty.
 *
 * Proves: the World Cup Game Lab view maps into a VALID market-implied report; it can never claim an
 * independent sim / 10k runs / EV / edge; win probabilities come through in [0,1]; every top lean
 * references an available market; and the game page + shell are wired to render the FreeSim spine with an
 * honest "Market-implied simulation" badge and NO 10,000-run soccer claim.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { wcGameLabViewToReport, WC_SOURCE_LABEL, WC_SIM_NOTE } from "./wc-adapter.ts";
import { validateMultiSportGameReport } from "./schema.ts";

const read = (p) => fs.readFileSync(p, "utf8");

/** A minimal but realistic WcGameLabView: a moneyline row (3 de-vigged outcomes), a supported total, an
 *  opposed BTTS. Mirrors the real artifact fields the adapter reads. */
const view = () => ({
  matchId: "wc-abc123",
  homeTeam: "Spain", awayTeam: "Belgium", homeCode: "ESP", awayCode: "BEL",
  venue: "Stadium", stage: "Quarterfinal", group: null, kickoffUtc: "2026-07-10T23:00:00Z",
  oddsOnly: true, marketCount: 3,
  rows: [
    {
      id: "r1", market: "moneyline_90", marketLabel: "Moneyline (90')", pick: "home", pickLabel: "Spain",
      line: null, americanOdds: -120, modelProbability: 0.55, marketProbability: 0.55, edgePct: 0.2,
      confidence: "Lean", settlementSupport: "regulation_90",
      outcomes: [
        { label: "Spain", modelProb: 0.55, marketProb: 0.55, americanOdds: -120 },
        { label: "Draw", modelProb: 0.25, marketProb: 0.25, americanOdds: 260 },
        { label: "Belgium", modelProb: 0.2, marketProb: 0.2, americanOdds: 320 },
      ],
      bankBuilderEligible: false, parlayEligible: true, riskTier: "Low", caveats: [], signal: "neutral",
    },
    {
      id: "r2", market: "match_total_goals", marketLabel: "Match total goals", pick: "under", pickLabel: "Under 2.5",
      line: 2.5, americanOdds: -110, modelProbability: 0.6, marketProbability: 0.52, edgePct: 8,
      confidence: "High", settlementSupport: "regulation_90",
      outcomes: [], bankBuilderEligible: true, parlayEligible: true, riskTier: "Low", caveats: [], signal: "supported",
    },
    {
      id: "r3", market: "btts", marketLabel: "Both teams to score", pick: "no", pickLabel: "No",
      line: null, americanOdds: 105, modelProbability: 0.5, marketProbability: 0.52, edgePct: -2,
      confidence: "Watchlist", settlementSupport: "regulation_90",
      outcomes: [], bankBuilderEligible: false, parlayEligible: true, riskTier: "Low", caveats: [], signal: "opposed",
    },
  ],
  biggestLeans: [], supported: [], neutral: [], opposed: [],
  whatModelLikes: ["Under 2.5 (Match total goals): 52% de-vigged · edge +8.0% at High confidence"],
  whatBreaksIt: ["Odds-only: this read is the de-vigged sportsbook price, NOT an independent stat model."],
  productMapping: [],
  unavailable: [{ label: "Scoreline distribution", reason: "x" }, { label: "xG / shots", reason: "y" }],
});

// supported = the total row (High + edge 8); the adapter reads view.supported for leans.
const withSupported = () => { const v = view(); v.supported = [v.rows[1]]; return v; };

test("1 · adapter builds a VALID market-implied report", () => {
  const r = wcGameLabViewToReport(withSupported(), { slateDate: "2026-07-10" });
  const v = validateMultiSportGameReport(r);
  assert.equal(v.valid, true, v.errors.join("; "));
  assert.equal(r.sport, "soccer");
  assert.equal(r.sourceMode, "market_implied_simulation");
  assert.equal(r.sourceLabel, "Market-implied simulation");
  assert.equal(WC_SOURCE_LABEL, "Market-implied simulation");
});

test("2 · the report NEVER claims independent sim / 10k runs / EV / edge", () => {
  const r = wcGameLabViewToReport(withSupported(), { slateDate: "2026-07-10" });
  assert.equal(r.publicClaims.canClaimIndependentSimulation, false);
  assert.equal(r.publicClaims.canClaimTenThousandRuns, false);
  assert.equal(r.publicClaims.canClaimPositiveEV, false);
  assert.equal(r.publicClaims.canClaimModelEdge, false);
  assert.equal(r.simulationOutput.runCount, undefined, "no run count on a market-implied soccer report");
  // The only mention of 10,000 is the honest DISCLAIMER that it is NOT a 10k-run model.
  assert.match(WC_SIM_NOTE, /not an independent 10,000-run soccer model/);
});

test("3 · win/draw/loss probabilities come through in [0,1]", () => {
  const r = wcGameLabViewToReport(withSupported(), { slateDate: "2026-07-10" });
  const wp = r.simulationOutput.winProbabilities ?? [];
  assert.equal(wp.length, 3, "moneyline outcomes → 3 win probabilities");
  for (const p of wp) assert.ok(p.probability >= 0 && p.probability <= 1, `${p.label} in [0,1]`);
  assert.ok(wp.some((p) => p.label === "Spain"));
});

test("4 · every top lean references an AVAILABLE market; supported total is a lean", () => {
  const r = wcGameLabViewToReport(withSupported(), { slateDate: "2026-07-10" });
  const marketKeys = new Set(r.marketSnapshot.markets.map((m) => m.key));
  assert.ok(r.topLeans.length >= 1);
  for (const l of r.topLeans) assert.ok(marketKeys.has(l.market), `lean market ${l.market} is in the snapshot`);
  assert.ok(r.topLeans.some((l) => l.market === "match_total_goals"));
});

test("5 · no supported markets ⇒ honest 'no strong lean' pass, still valid", () => {
  const r = wcGameLabViewToReport(view(), { slateDate: "2026-07-10" }); // supported=[]
  assert.equal(validateMultiSportGameReport(r).valid, true);
  assert.equal(r.topLeans.length, 0);
  assert.match(r.mainRead.label, /No strong lean/i);
  assert.equal(r.mainRead.paperOnly, true);
});

test("6 · unavailable markets travel to details.roadmap, never to leans", () => {
  const r = wcGameLabViewToReport(withSupported(), { slateDate: "2026-07-10" });
  assert.ok(r.details.unavailableMarkets.includes("xG / shots"));
  assert.ok(r.details.unavailableMarkets.includes("Scoreline distribution"));
  const leanMarkets = r.topLeans.map((l) => l.market);
  assert.ok(!leanMarkets.includes("xG / shots"));
});

test("7 · the game page is WIRED to render the FreeSim shell for World Cup", () => {
  const page = read("src/components/game/game-detail-page.tsx");
  assert.match(page, /import MultiSportReportShell/, "imports the shell");
  assert.match(page, /wcGameLabViewToReport/, "builds the WC report via the adapter");
  assert.match(page, /<MultiSportReportShell report=\{freeSimReport\}/, "renders the shell as primary WC content");
});

test("8 · the shell surfaces all six sections + an honest source badge, no 10k soccer claim", () => {
  const shell = read("src/components/game/multi-sport-report-shell.tsx");
  for (const s of ["Market Snapshot", "Simulation Output", "Main Read", "Top Leans", "Key Takeaways", "Expandable Details"]) {
    assert.match(shell, new RegExp(s), `shell renders "${s}"`);
  }
  assert.match(shell, /SourceModeBadge/, "renders a source-mode badge");
  assert.match(shell, /Paper-only/, "renders a paper-only disclaimer");
  // The badge shows the report's own honest source label (soccer ⇒ "Market-implied simulation"); the shell
  // never hardcodes a run count — it only shows one the report actually carries.
  assert.match(shell, /label=\{report\.sourceLabel\}/, "badge uses the report's honest source label");
  assert.match(shell, /runCount != null/, "run count shown only when present (never fabricated)");
});

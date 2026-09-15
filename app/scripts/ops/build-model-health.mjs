#!/usr/bin/env node
/**
 * MODEL HEALTH SCORECARD (P303) — every published model's LIVE record against its floor, one artifact.
 *
 *   node scripts/ops/build-model-health.mjs --now <ISO>
 *
 * Reads the graded ledgers each sport already writes and judges them with app/src/lib/ops/model-health.mjs:
 *   UFC fight winner          data/internal/research/ufc/model-vs-market/graded.jsonl   log loss vs a coin flip
 *   EPL match result          public/data/soccer/epl/results/graded-forecasts.jsonl     log loss vs even odds (1/3)
 *   Ligue 1 match result      public/data/soccer/ligue-1/results/graded.json            log loss vs even odds (1/3)
 *   MLB game picks            public/data/mlb/results/game-predictions-graded.jsonl     log loss vs a coin flip, per market
 *   NFL winner                public/data/nfl/reconciliation/*.json                      log loss vs a coin flip
 *   NFL 80% ranges            public/data/nfl/reconciliation/*.json                      coverage vs 0.8, per prediction
 *   NFL touchdown chances     public/data/nfl/reconciliation/*.json                      expected vs actual scorers
 *   NFL share-level forward   data/internal/research/nfl/replay/player-props-share-level-forward/receipt.json (its own states)
 *   EPL match-model forward   data/internal/research/epl/forward/receipt.json (P304 Elo-Poisson vs the split Poisson it replaced)
 * The market's figure is carried beside a family wherever the ledger records it, as context — never the floor.
 *
 * Writes app/public/data/admin/model-health.json (read by /ops; /ops is pruned from the public export). A BREACHED
 * or WATCH family prints a GitHub warning. Nothing here changes what publishes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { comparePairedLoss, judgeCoverage, judgeLevel, worstHealth, logLossOf, HEALTH_SEVERITY } from "../../src/lib/ops/model-health.mjs";
import { healthTransitions } from "../../src/lib/ops/health-changes.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const NOW = arg("--now");
if (!Number.isFinite(Date.parse(NOW ?? ""))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const readJsonl = (p) => { try { return fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)); } catch { return null; } };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r4 = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(4)));
const LN2 = Math.log(2);
const LN3 = Math.log(3);

const families = [];
const add = (f) => families.push(f);
const missing = (id, sport, label, source) => add({ id, sport, label, state: "INSUFFICIENT_SAMPLE", n: 0, judgement: null, context: null, source, note: "ledger not found" });

// ── UFC ───────────────────────────────────────────────────────────────────────────────────────────
{
  const source = "data/internal/research/ufc/model-vs-market/graded.jsonl";
  const rows = readJsonl(path.join(ROOT, source));
  if (!rows) missing("ufc_winner", "ufc", "UFC fight winner", source);
  else {
    const model = rows.map((r) => r.model?.logLoss).filter(Number.isFinite);
    const market = rows.filter((r) => Number.isFinite(r.model?.logLoss) && Number.isFinite(r.market?.logLoss));
    const judgement = comparePairedLoss(model.map((l) => l - LN2), { minN: 60 });
    add({ id: "ufc_winner", sport: "ufc", label: "UFC fight winner", baseline: "coin flip (log loss 0.6931)", state: judgement.state, n: judgement.n, judgement,
      context: { modelLogLoss: r4(mean(model)), marketLogLoss: r4(mean(market.map((r) => r.market.logLoss))), modelMinusMarket: r4(mean(market.map((r) => r.model.logLoss - r.market.logLoss))), pairedWithMarket: market.length }, source });
  }
}

// ── Soccer ────────────────────────────────────────────────────────────────────────────────────────
{
  const source = "app/public/data/soccer/epl/results/graded-forecasts.jsonl";
  const rows = readJsonl(path.join(ROOT, source));
  if (!rows) missing("epl_result", "epl", "EPL match result (home/draw/away)", source);
  else {
    const losses = rows.map((r) => r.scores?.logLoss).filter(Number.isFinite);
    const judgement = comparePairedLoss(losses.map((l) => l - LN3), { minN: 60 });
    const learning = readJson(path.join(ROOT, "data/internal/research/epl/learning/latest.json"));
    add({ id: "epl_result", sport: "epl", label: "EPL match result (home/draw/away)", baseline: "even odds (log loss 1.0986)", state: judgement.state, n: judgement.n, judgement,
      context: { modelLogLoss: r4(mean(losses)), market: learning?.comparison?.onPairedMatches ?? null, marketComparisonState: learning?.comparison?.state ?? null, stoppingRule: learning?.stoppingRule?.state ?? null }, source });
  }
}
{
  const source = "app/public/data/soccer/ligue-1/results/graded.json";
  const doc = readJson(path.join(ROOT, source));
  if (!doc) missing("ligue1_result", "ligue-1", "Ligue 1 match result (home/draw/away)", source);
  else {
    const losses = (doc.matches ?? []).map((m) => m.logLoss).filter(Number.isFinite);
    const judgement = comparePairedLoss(losses.map((l) => l - LN3), { minN: 60 });
    add({ id: "ligue1_result", sport: "ligue-1", label: "Ligue 1 match result (home/draw/away)", baseline: "even odds (log loss 1.0986)", state: judgement.state, n: judgement.n, judgement, context: { modelLogLoss: r4(mean(losses)) }, source });
  }
}

// ── MLB ───────────────────────────────────────────────────────────────────────────────────────────
{
  const source = "app/public/data/mlb/results/game-predictions-graded.jsonl";
  const rows = readJsonl(path.join(ROOT, source));
  if (!rows) missing("mlb_game_picks", "mlb", "MLB game picks", source);
  else {
    for (const market of [...new Set(rows.map((r) => r.market))].sort()) {
      const graded = rows.filter((r) => r.market === market && (r.outcome === "WIN" || r.outcome === "LOSS") && Number.isFinite(r.modelProbability));
      const lossOf = (p, r) => logLossOf(r.outcome === "WIN" ? p : 1 - p);
      const judgement = comparePairedLoss(graded.map((r) => lossOf(r.modelProbability, r) - LN2), { minN: 200 });
      const paired = graded.filter((r) => Number.isFinite(r.marketImpliedProbability));
      add({ id: `mlb_${market}`, sport: "mlb", label: `MLB ${market.replace(/_/g, " ")} picks`, baseline: "coin flip (log loss 0.6931)", state: judgement.state, n: judgement.n, judgement,
        context: { hitRate: r4(graded.filter((r) => r.outcome === "WIN").length / (graded.length || 1)), meanPickProbability: r4(mean(graded.map((r) => r.modelProbability))), modelMinusMarket: r4(mean(paired.map((r) => lossOf(r.modelProbability, r) - lossOf(r.marketImpliedProbability, r)))), pairedWithMarket: paired.length }, source });
    }
  }
}

// ── NFL (the public week reconciliations, every week so far) ─────────────────────────────────────
{
  const dir = path.join(APP, "public/data/nfl/reconciliation");
  const source = "app/public/data/nfl/reconciliation/<week>.json";
  const weeks = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d-\d{2}\.json$/.test(f)).sort().map((f) => readJson(path.join(dir, f))).filter(Boolean) : [];
  const final = weeks.flatMap((w) => w.games.filter((g) => g.state === "FINAL"));
  if (!weeks.length) missing("nfl_winner", "nfl", "NFL winner", source);
  else {
    const winnerRows = final.map((g) => ({ g, outcome: g.team.find((t) => t.prop === "winner")?.outcome })).filter((x) => x.outcome === "HIT" || x.outcome === "MISS");
    const judgement = comparePairedLoss(winnerRows.map(({ g, outcome }) => logLossOf(outcome === "HIT" ? g.published.pick.probability : 1 - g.published.pick.probability) - LN2), { minN: 48 });
    add({ id: "nfl_winner", sport: "nfl", label: "NFL winner", baseline: "coin flip (log loss 0.6931)", state: judgement.state, n: judgement.n, judgement,
      context: { hits: winnerRows.filter((x) => x.outcome === "HIT").length, expectedHits: r4(winnerRows.reduce((a, x) => a + x.g.published.pick.probability, 0)) }, source });

    const rangeProps = [
      ["total_range", "NFL total points 80% range", (g) => g.team.filter((t) => t.prop === "total_range")],
      ["margin_range", "NFL winning margin 80% range", (g) => g.team.filter((t) => t.prop === "margin_range")],
      ["player_receptions", "NFL receptions 80% range", (g) => g.players.filter((p) => p.prop === "player_receptions")],
      ["player_reception_yds", "NFL receiving yards 80% range", (g) => g.players.filter((p) => p.prop === "player_reception_yds")],
      ["player_rush_yds", "NFL rushing yards 80% range", (g) => g.players.filter((p) => p.prop === "player_rush_yds")],
      ["player_pass_yds", "NFL passing yards 80% range", (g) => g.players.filter((p) => p.prop === "player_pass_yds")],
    ];
    for (const [prop, label, rowsOf] of rangeProps) {
      const outcomes = final.flatMap(rowsOf).map((r) => r.outcome).filter((o) => o === "HIT" || o === "MISS");
      const judgement = judgeCoverage({ hits: outcomes.filter((o) => o === "HIT").length, n: outcomes.length, target: 0.8, minN: prop.endsWith("_range") ? 48 : 150 });
      add({ id: `nfl_${prop}`, sport: "nfl", label, baseline: "8 in 10 inside the published range", state: judgement.state, n: judgement.n, judgement, context: null, source });
    }

    const tds = final.flatMap((g) => g.touchdowns).filter((t) => t.outcome === "SCORED" || t.outcome === "DID_NOT_SCORE");
    const level = judgeLevel({ probabilities: tds.map((t) => t.probability), outcomes: tds.map((t) => (t.outcome === "SCORED" ? 1 : 0)), minN: 150 });
    add({ id: "nfl_anytime_td", sport: "nfl", label: "NFL touchdown chances", baseline: "expected scorers = actual scorers", state: level.state, n: level.n, judgement: level, context: null, source });
  }
}
{
  const source = "data/internal/research/nfl/replay/player-props-share-level-forward/receipt.json";
  const receipt = readJson(path.join(ROOT, source));
  const MAP = { ACCUMULATING: "INSUFFICIENT_SAMPLE", FORWARD_HOLDING: "HOLDING", FORWARD_BREACHED: "BREACHED" };
  for (const [market, fam] of Object.entries(receipt?.families ?? {})) {
    add({ id: `nfl_forward_${market}`, sport: "nfl", label: `NFL blind forward test · ${market.replace(/^player_/, "").replace(/_/g, " ")}`, baseline: "its preregistered forward bars",
      state: MAP[fam.state] ?? "INSUFFICIENT_SAMPLE", n: fam.n ?? 0, judgement: { receiptState: fam.state, bars: fam.bars ?? null, needed: fam.needed ?? null }, context: null, source,
      note: "Preregistered: a FORWARD_BREACHED family already falls back automatically on the public board." });
  }
}

{
  /* The EPL blind forward receipt (P304 adoption): the adopted Elo-Poisson against the model it replaced, paired per
     match. FORWARD_BREACHED already makes match-model.mjs publish the previous model; here it is only shown. */
  const source = "data/internal/research/epl/forward/receipt.json";
  const receipt = readJson(path.join(ROOT, source));
  if (!receipt) missing("epl_forward_match_model", "epl", "EPL blind forward test · match model vs the one it replaced", source);
  else {
    const state = receipt.state === "FORWARD_BREACHED" ? "BREACHED" : receipt.state === "FORWARD_HOLDING" ? (receipt.watch ? "WATCH" : "HOLDING") : "INSUFFICIENT_SAMPLE";
    add({ id: "epl_forward_match_model", sport: "epl", label: "EPL blind forward test · match model vs the one it replaced", baseline: `the previous model (${(receipt.controlModelIds ?? []).join(", ") || "split Poisson"}), paired per match`,
      state, n: receipt.n ?? 0, judgement: { receiptState: receipt.state, watch: receipt.watch ?? null, needed: receipt.needed ?? null, meanDiff: r4(receipt.meanDifference), lo95: r4(receipt.lo95), hi95: r4(receipt.hi95), modelLogLoss: r4(receipt.modelLogLoss), controlLogLoss: r4(receipt.controlLogLoss), modelId: receipt.modelId ?? null },
      context: null, source, note: "Preregistered: a FORWARD_BREACHED receipt already makes the previous model publish on the next matchweek build." });
  }
}

{
  /* P305-F: the EPL totals SHADOW — a research candidate beside the live model, never public. Shown so the founder can
     see the paired evidence accumulate; its states are its own and map to alarm levels only for the /ops chip. */
  const source = "data/internal/research/epl/forward-totals/receipt.json";
  const receipt = readJson(path.join(ROOT, source));
  if (receipt) {
    const state = receipt.state === "SHADOW_WORSE" ? "WATCH" : receipt.state === "SHADOW_BETTER" || receipt.state === "SHADOW_INCONCLUSIVE" ? "HOLDING" : "INSUFFICIENT_SAMPLE";
    add({ id: "epl_shadow_totals", sport: "epl", label: "EPL totals SHADOW (research, not public) · club-specific total vs live P304", baseline: "live P304 constant total, paired per match",
      state, n: receipt.n ?? 0, judgement: { receiptState: receipt.state, needed: receipt.needed ?? null, meanDiff: r4(receipt.pairedTotalLogLoss?.meanDifference), lo95: r4(receipt.pairedTotalLogLoss?.lo95), hi95: r4(receipt.pairedTotalLogLoss?.hi95), failedBars: receipt.failedBars ?? null, modelId: receipt.shadowModelId ?? null },
      context: null, source, note: "SHADOW: publishes nothing. SHADOW_BETTER is evidence for a founder adoption decision, never an adoption (the P305 blind receipt is REJECTED)." });
  }
}

// ── write ─────────────────────────────────────────────────────────────────────────────────────────
families.sort((a, b) => HEALTH_SEVERITY[b.state] - HEALTH_SEVERITY[a.state] || a.sport.localeCompare(b.sport) || a.id.localeCompare(b.id));
const outPath = path.join(APP, "public/data/admin/model-health.json");
const previous = readJson(outPath);
/* P311: every state transition against the artifact this run overwrites, carried for a window — the ONLY source a
   "what changed" surface may cite for model states. */
const changes = healthTransitions(previous, families, NOW);
const body = {
  schemaVersion: 1,
  artifact: "model-health",
  dataClass: "INTERNAL_OPS",
  generatedAt: NOW,
  worst: worstHealth(families.map((f) => f.state)),
  counts: Object.fromEntries(Object.keys(HEALTH_SEVERITY).map((s) => [s, families.filter((f) => f.state === s).length])),
  rules: {
    states: "INSUFFICIENT_SAMPLE: too few graded events for any verdict. HOLDING: at least as good as the baseline. WATCH: worse on the point estimate, but the 95% interval still includes no difference. BREACHED: worse with the whole 95% interval on the wrong side (log loss, event bootstrap), or |z| >= 2.58 (coverage, level).",
    action: "An alarm, not a demotion. Only preregistered forward receipts change what publishes automatically.",
  },
  families,
  changes,
};
const strip = (d) => (d ? JSON.stringify({ ...d, generatedAt: null }) : null);
if (strip(previous) === strip(body)) console.log("model health unchanged");
else {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(body, null, 1));
}
for (const f of families) {
  const j = f.judgement ?? {};
  const z = j.z != null ? ` (z ${j.z})` : "";
  const figure = j.meanDiff != null ? `mean vs baseline ${j.meanDiff > 0 ? "+" : ""}${j.meanDiff}${j.lo95 != null ? ` [${j.lo95}, ${j.hi95}]` : ""}` : j.rate != null ? `rate ${j.rate}${z}` : j.expected != null ? `expected ${j.expected} vs actual ${j.actual}${z}` : j.receiptState ?? "";
  console.log(`${f.state.padEnd(19)} ${f.label.padEnd(42)} n ${String(f.n).padEnd(5)} ${figure}`);
  if (process.env.GITHUB_ACTIONS && (f.state === "BREACHED" || f.state === "WATCH")) console.log(`::warning title=Model health ${f.state}::${f.label}: ${figure}${j.direction ? ` (${j.direction})` : ""}`);
}
console.log(`worst: ${body.worst} · ${Object.entries(body.counts).map(([k, v]) => `${k} ${v}`).join(" · ")}`);

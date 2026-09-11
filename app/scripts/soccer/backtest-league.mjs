#!/usr/bin/env node
/**
 * Walk-forward backtest of the live EPL model on one league, judged by the preregistered bars (P257 · Phase B).
 *
 *   node scripts/soccer/backtest-league.mjs --league laliga --now <ISO>
 *
 * Reads data/internal/research/soccer/<league>/corpus-football-data-v1.json and
 * data/internal/research/soccer/preregistration-league-expansion-v1.json; writes
 * data/internal/research/soccer/<league>/reports/walk-forward-v1.json. For --league epl it also runs the
 * H0 harness-parity check against the committed EPL baseline report. $0, network-free, deterministic.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { league } from "../../src/lib/sports/soccer/leagues.mjs";
import { walkForward, scoreBySeason } from "../../src/lib/sports/soccer/walk-forward.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const KEY = arg("--league"); const NOW = arg("--now");
if (!KEY || !Number.isFinite(Date.parse(NOW ?? ""))) { console.error("usage: --league <key> --now <ISO>"); process.exit(2); }
const L = league(KEY);
const dir = path.join(ROOT, "data/internal/research/soccer", L.key);
const prereg = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/soccer/preregistration-league-expansion-v1.json"), "utf8"));
const corpus = JSON.parse(fs.readFileSync(path.join(dir, "corpus-football-data-v1.json"), "utf8"));
const { warmup, development, holdout } = prereg.seasons;
const preds = walkForward(corpus.rows, { warmupSeason: warmup, scoreSeasons: [...development, holdout] });
const MODELS = ["empirical", "elo", "poisson", "uniform", "market"];
const scores = Object.fromEntries(MODELS.map((m) => [m, scoreBySeason(preds, m)]));
const S = (m, s) => scores[m].bySeason[s];

let parity = null;
if (L.key === "epl") {
  const ref = prereg.acceptanceBars.bars.find((b) => b.id === "H0_harness_parity").reference;
  const rows = [];
  for (const m of Object.keys(ref)) for (const [s, v] of Object.entries(ref[m])) rows.push({ model: m, season: s, reference: v, harness: S(m, s)?.logLoss ?? null, diff: S(m, s) ? Number((S(m, s).logLoss - v).toFixed(4)) : null });
  parity = { tolerance: 0.003, rows, pass: rows.every((r) => r.diff != null && Math.abs(r.diff) <= 0.003) };
}
const h = holdout;
const bars = [
  { id: "L1_skill", value: { poisson: S("poisson", h).logLoss, empirical: S("empirical", h).logLoss }, pass: S("poisson", h).logLoss <= S("empirical", h).logLoss - 0.005 },
  { id: "L2_calibration", value: { ece: S("poisson", h).ece }, pass: S("poisson", h).ece <= 0.03 },
  { id: "L3_development_consistency", value: Object.fromEntries(development.map((s) => [s, { poisson: S("poisson", s).logLoss, empirical: S("empirical", s).logLoss }])), pass: development.every((s) => S("poisson", s).logLoss <= S("empirical", s).logLoss - 0.005) },
];
const verdict = L.key === "epl" ? (parity.pass ? "CONTROL_PARITY_PASS" : "CONTROL_PARITY_FAIL — every league verdict is VOID") : (bars.every((b) => b.pass) ? "ACCEPTED_FOR_MODEL_ONLY_FORECASTS" : "REJECTED");
const report = {
  schemaVersion: 1, artifact: "soccer-league-walk-forward", dataClass: "PRIVATE_RESEARCH", league: L.key, leagueName: L.name,
  generatedAt: NOW, preregistration: "data/internal/research/soccer/preregistration-league-expansion-v1.json",
  population: { scored: preds.length, bySeason: Object.fromEntries([...development, holdout].map((s) => [s, S("poisson", s)?.n ?? 0])) },
  scores, parity, bars, verdict,
  reportedNotGating: {
    poissonMinusElo: Number((S("poisson", h).logLoss - S("elo", h).logLoss).toFixed(4)),
    poissonMinusMarket: S("market", h)?.n ? Number((S("poisson", h).logLoss - S("market", h).logLoss).toFixed(4)) : null,
  },
};
fs.mkdirSync(path.join(dir, "reports"), { recursive: true });
fs.writeFileSync(path.join(dir, "reports", "walk-forward-v1.json"), JSON.stringify(report, null, 1) + "\n");
const fmt = (m) => [...development, h].map((s) => `${s} ${S(m, s)?.logLoss ?? "—"}`).join(" · ");
console.log(`[backtest] ${L.name}: ${verdict}`);
for (const m of MODELS) console.log(`  ${m.padEnd(9)} ${fmt(m)}${m === "poisson" ? ` · holdout ECE ${S(m, h).ece}` : ""}`);
if (parity) for (const r of parity.rows.filter((x) => Math.abs(x.diff ?? 9) > 0.003)) console.log(`  PARITY MISS ${r.model} ${r.season}: harness ${r.harness} vs ${r.reference}`);
console.log(`  reported: poisson−elo ${report.reportedNotGating.poissonMinusElo} · poisson−market ${report.reportedNotGating.poissonMinusMarket}`);

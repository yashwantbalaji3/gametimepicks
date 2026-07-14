#!/usr/bin/env node
/**
 * Backtest the internal FIFA-Poisson soccer engine against FINISHED World Cup matches (official 90' scores).
 *
 * Leakage control: the engine's only learned-ish input is FIFA points, which are pre-tournament static ratings
 * — known before every match, fit from nothing in this dataset. The final score enters ONLY the evaluation
 * step. There are no parameters fit on the outcomes here.
 *
 * Reads (committed, read-only):
 *   - app/public/data/world-cup/settlement/official-scores-*.json  (finished matches, deduped by teams)
 *   - app/public/data/world-cup/team-strength/team-strength-latest.json
 * Writes (INTERNAL ONLY):
 *   - data/internal/world-cup/projection-engine/backtests/<date>.json
 *
 * Metrics: multiclass Brier + ranked-probability score (RPS) + top-pick accuracy, for the model vs two honest
 * baselines (uniform 1/3, and de-vig-free "always the FIFA favorite"). Small N is DISCLOSED, not hidden.
 *
 * Usage: node app/scripts/backtest-internal-soccer-projections.mjs --asOf 2026-07-14
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectMatch, brier1x2, rps1x2 } from "../src/lib/world-cup/internal-soccer-projection-engine.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const APP = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const asOf = getArg("--asOf", "2026-07-14");

const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

const tsRaw = JSON.parse(fs.readFileSync(path.join(APP, "public/data/world-cup/team-strength/team-strength-latest.json"), "utf8"));
const ratings = tsRaw.teams || tsRaw.ratings || Object.values(tsRaw).find(Array.isArray) || [];
const fifa = new Map(ratings.filter((t) => typeof t.fifaPoints === "number").map((t) => [norm(t.team), t.fifaPoints]));

// Collect unique finished matches (dedupe by team pair; skip malformed rows with no teams).
const settleDir = path.join(APP, "public/data/world-cup/settlement");
const load = (p) => { const j = JSON.parse(fs.readFileSync(p, "utf8")); return j.matches || j.scores || (Array.isArray(j) ? j : []); };
const byKey = new Map();
for (const file of fs.readdirSync(settleDir).filter((x) => x.startsWith("official-scores"))) {
  for (const m of load(path.join(settleDir, file))) {
    if (!m.home || !m.away || m.homeGoals == null || m.awayGoals == null) continue;
    byKey.set(norm(m.home) + "|" + norm(m.away), m);
  }
}

const results = [];
let modelBrier = 0, modelRps = 0, modelHits = 0;
let uniBrier = 0, uniRps = 0;
let favHits = 0, evaluable = 0;
const UNIFORM = { homeWin: 1 / 3, draw: 1 / 3, awayWin: 1 / 3 };

for (const m of byKey.values()) {
  const hf = fifa.get(norm(m.home));
  const af = fifa.get(norm(m.away));
  if (hf == null || af == null) continue;
  const actual = m.homeGoals > m.awayGoals ? "home" : m.homeGoals === m.awayGoals ? "draw" : "away";
  const p = projectMatch({ homeFifaPoints: hf, awayFifaPoints: af }).matchResult90; // pure FIFA — no market anchor
  const pick = p.homeWin >= p.draw && p.homeWin >= p.awayWin ? "home" : p.awayWin >= p.draw ? "away" : "draw";
  const fifaFav = hf >= af ? "home" : "away";
  const mB = brier1x2(p, actual), mR = rps1x2(p, actual);
  modelBrier += mB; modelRps += mR; if (pick === actual) modelHits++;
  uniBrier += brier1x2(UNIFORM, actual); uniRps += rps1x2(UNIFORM, actual);
  if (fifaFav === actual) favHits++;
  evaluable++;
  results.push({ home: m.home, away: m.away, score: `${m.homeGoals}-${m.awayGoals}`, actual, model: { homeWin: +p.homeWin.toFixed(3), draw: +p.draw.toFixed(3), awayWin: +p.awayWin.toFixed(3) }, pick, brier: +mB.toFixed(3) });
}

const n = evaluable || 1;
const summary = {
  sampleSize: evaluable,
  model: { meanBrier: +(modelBrier / n).toFixed(4), meanRps: +(modelRps / n / 2).toFixed(4), topPickAccuracy: +(modelHits / n).toFixed(3) },
  baselineUniform: { meanBrier: +(uniBrier / n).toFixed(4), meanRps: +(uniRps / n / 2).toFixed(4) },
  baselineFifaFavorite: { topPickAccuracy: +(favHits / n).toFixed(3) },
  beatsUniform: modelBrier / n < uniBrier / n,
};

const artifact = {
  version: "internal-soccer-projection-backtest-v1",
  asOf,
  public: false,
  internal: true,
  officialMoneyRecordAffected: false,
  webServed: false,
  engine: "bivariate_poisson_fifa_supremacy",
  leakageNote: "FIFA points are pre-tournament static ratings (no parameters fit on these outcomes). Final scores used only in evaluation. Any future learned parameter must be fit from strictly-earlier matches only.",
  backtestStatus: evaluable >= 40 ? "internal_only" : "insufficient_sample",
  sampleWarning: evaluable < 40 ? `N=${evaluable} finished matches in committed data (settlement covers knockout window only). This is NOT enough to validate — directional only. Real validation needs the 2022 WC set (64 matches) via API-Football (see PROVIDER_AND_MODELING_ROADMAP.md).` : null,
  summary,
  matches: results,
};

const outDir = path.join(REPO, "data/internal/world-cup/projection-engine/backtests");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `${asOf}.json`);
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
console.log(`✓ wrote ${path.relative(REPO, outPath)} — N=${evaluable}, status=${artifact.backtestStatus}`);
console.log(`  model:    Brier ${summary.model.meanBrier} · RPS ${summary.model.meanRps} · top-pick ${(summary.model.topPickAccuracy * 100).toFixed(0)}%`);
console.log(`  uniform:  Brier ${summary.baselineUniform.meanBrier} · RPS ${summary.baselineUniform.meanRps}`);
console.log(`  FIFA-fav top-pick ${(summary.baselineFifaFavorite.topPickAccuracy * 100).toFixed(0)}%  | beats uniform Brier: ${summary.beatsUniform}`);

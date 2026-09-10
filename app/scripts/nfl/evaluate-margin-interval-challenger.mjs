#!/usr/bin/env node
/**
 * Evaluate the preregistered margin-interval challenger against the incumbent on held-out 2025.
 * Preregistration: data/internal/research/nfl/reports/margin-interval-challenger-preregistration.json
 * (its sha256 is recorded in the report so the pairing is checkable). INFORMATIONAL: promotion runs
 * only through the 2026 walk-forward, per the frozen regular-season contract.
 *
 * Usage: node app/scripts/nfl/evaluate-margin-interval-challenger.mjs --now <iso> [--write]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { walkForwardObservations, fitNflV1 } from "../../src/lib/sports/nfl/model-v1.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now"); if (!NOW) { console.error("--now <iso> required"); process.exit(1); }
const PRE = path.join(ROOT, "data/internal/research/nfl/reports/margin-interval-challenger-preregistration.json");
const preRaw = fs.readFileSync(PRE, "utf8"); const pre = JSON.parse(preRaw);
const preSha = crypto.createHash("sha256").update(preRaw).digest("hex");

const rows = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/corpus-v1.json"), "utf8")).rows;
const fit = fitNflV1(rows.filter((r) => pre.split.train.includes(r.season)));
const a = fit.params.marginSlope, sigma = fit.params.sigmaMargin;
const all = walkForwardObservations(rows);
const train = all.filter((o) => pre.split.train.includes(o.season));
const test = all.filter((o) => o.season === pre.split.test);

const q = (xs, p) => { const s = [...xs].sort((x, y) => x - y); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const res = train.map((o) => o.margin - a * o.eloDiff);
const q10 = q(res, 0.10), q90 = q(res, 0.90);
const Z = 1.2815515655;
const inc = (o) => { const m = a * o.eloDiff; return [m - Z * sigma, m + Z * sigma]; };
const cha = (o) => { const m = a * o.eloDiff; return [m + q10, m + q90]; };
const cov = (obs, iv) => obs.filter((o) => { const [lo, hi] = iv(o); return o.margin >= lo && o.margin <= hi; }).length / (obs.length || 1);
const zOf = (c, n) => (c - 0.8) / Math.sqrt(0.8 * 0.2 / n);
const band = pre.bars.coverage80Band;
const verdict = (c) => (c < band[0] ? "BELOW_BAND" : c > band[1] ? "ABOVE_BAND" : "IN_BAND");
const mae = test.reduce((s, o) => s + Math.abs(o.margin - a * o.eloDiff), 0) / test.length;
/*
 * SLICES MUST BE PRE-GAME. The first cut sliced by the REALISED margin (|margin| >= 14) and read
 * "blowouts 51.5% vs close games 98.9%" as a dispersion defect. It is not: conditioning on the
 * outcome, even a perfectly calibrated interval centred near zero misses most large outcomes and
 * covers nearly all small ones. That slice is kept as DESCRIPTIVE ONLY. The calibration question
 * conditional on the matchup is asked with a quantity known before kickoff: the predicted |margin|.
 */
const blow = test.filter((o) => Math.abs(o.margin) >= 14), close = test.filter((o) => Math.abs(o.margin) < 14);
const byPred = [...test].sort((x, y) => Math.abs(a * x.eloDiff) - Math.abs(a * y.eloDiff));
const t1 = byPred.slice(0, Math.floor(byPred.length / 3)), t2 = byPred.slice(Math.floor(byPred.length / 3), Math.floor(2 * byPred.length / 3)), t3 = byPred.slice(Math.floor(2 * byPred.length / 3));
const tercile = (obs, iv) => ({ n: obs.length, predAbsMarginMax: Number(Math.abs(a * obs[obs.length - 1].eloDiff).toFixed(2)), coverage80: Number(cov(obs, iv).toFixed(4)), z: Number(zOf(cov(obs, iv), obs.length).toFixed(2)) });

const report = {
  schemaVersion: 1, artifact: "nfl-margin-interval-challenger-evaluation", dataClass: "INTERNAL_RESEARCH", generatedAt: NOW,
  preregistration: { file: path.relative(ROOT, PRE), sha256: preSha, frozenAt: pre.frozenAt },
  fit: { trainSeasons: pre.split.train, n: train.length, marginSlope: a, sigmaMargin: sigma, residualQ10: Number(q10.toFixed(3)), residualQ90: Number(q90.toFixed(3)), normalHalfWidth: Number((Z * sigma).toFixed(3)) },
  test: { season: pre.split.test, n: test.length, marginMAE: Number(mae.toFixed(3)) },
  incumbent: { coverage80: Number(cov(test, inc).toFixed(4)), z: Number(zOf(cov(test, inc), test.length).toFixed(2)), verdict: verdict(cov(test, inc)), descriptiveBlowoutCoverage: Number(cov(blow, inc).toFixed(4)), descriptiveCloseCoverage: Number(cov(close, inc).toFixed(4)) },
  challenger: { coverage80: Number(cov(test, cha).toFixed(4)), z: Number(zOf(cov(test, cha), test.length).toFixed(2)), verdict: verdict(cov(test, cha)), descriptiveBlowoutCoverage: Number(cov(blow, cha).toFixed(4)), descriptiveCloseCoverage: Number(cov(close, cha).toFixed(4)), maeDelta: 0 },
  slices: {
    preGameTerciles_byPredictedAbsMargin: {
      incumbent: [tercile(t1, inc), tercile(t2, inc), tercile(t3, inc)],
      challenger: [tercile(t1, cha), tercile(t2, cha), tercile(t3, cha)],
      note: "the valid conditional check — sliced on a quantity known before kickoff",
    },
    descriptiveOnly_outcomeConditioned: { blowouts_abs_margin_ge_14: blow.length, closer_games: close.length, warning: "conditions on the realised margin; low blowout / high close-game coverage is what a CALIBRATED interval produces — not a calibration test" },
  },
  status: "INFORMATIONAL — the 2025 retrospective cannot promote; the challenger runs in SHADOW through the 2026 walk-forward (>= 64 games, >= 4 weeks) per the frozen contract",
};
if (process.argv.includes("--write")) fs.writeFileSync(path.join(ROOT, "data/internal/research/nfl/reports/margin-interval-challenger-2025.json"), JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify(report, null, 1));

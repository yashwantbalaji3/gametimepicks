#!/usr/bin/env node
/**
 * Backtest soccer engine V2 (rating-Poisson + tournament form) vs V1 on the 2022 WC (64 matches).
 *
 * Leakage control (strict): matches are processed in DATE order; each team's form is computed from its 90-minute
 * results in matches STRICTLY BEFORE the current kickoff; the current result updates state only AFTER prediction.
 * V1 is recovered as V2 with formWeight=0 (asserted), so this is a clean superset comparison.
 *
 * Writes (INTERNAL ONLY): data/internal/world-cup/projection-engine/backtests/2022-wc-v2.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectMatch, brier1x2, rps1x2 } from "../src/lib/world-cup/internal-soccer-projection-engine.ts";
import { projectMatchV2 } from "../src/lib/world-cup/internal-soccer-projection-engine-v2.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const ref = (p) => JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/world-cup/reference", p), "utf8"));
const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const logLoss = (p, o) => -Math.log(clamp(o === "home" ? p.homeWin : o === "draw" ? p.draw : p.awayWin, 1e-9, 1));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

const fifa = new Map(Object.entries(ref("fifa-points-2022.json").points).map(([k, v]) => [norm(k), v]));
const matches = [...ref("wc-2022-results.json").matches].sort((a, b) => (a.date < b.date ? -1 : 1));

function runV2(formWeight) {
  const form = new Map(); // normName -> {goalsFor, goalsAgainst, matchesPlayed}
  const get = (t) => form.get(norm(t)) || { goalsFor: 0, goalsAgainst: 0, matchesPlayed: 0 };
  const rows = [];
  let coveredByForm = 0;
  for (const m of matches) {
    const hf = fifa.get(norm(m.home)), af = fifa.get(norm(m.away));
    const hg = m.ft && m.ft.home != null ? m.ft.home : m.homeGoals;
    const ag = m.ft && m.ft.away != null ? m.ft.away : m.awayGoals;
    if (hf == null || af == null || hg == null || ag == null) continue;
    const actual = hg > ag ? "home" : hg === ag ? "draw" : "away";
    const hForm = get(m.home), aForm = get(m.away);
    const proj = projectMatchV2({ homeFifaPoints: hf, awayFifaPoints: af, homeForm: hForm, awayForm: aForm, formWeight });
    if (proj.formApplied > 0) coveredByForm++;
    rows.push({ p: proj.matchResult90, actual, expTotal: proj.totalGoals.expected, actualTotal: hg + ag, formApplied: proj.formApplied });
    // update state AFTER prediction (strictly earlier only)
    form.set(norm(m.home), { goalsFor: hForm.goalsFor + hg, goalsAgainst: hForm.goalsAgainst + ag, matchesPlayed: hForm.matchesPlayed + 1 });
    form.set(norm(m.away), { goalsFor: aForm.goalsFor + ag, goalsAgainst: aForm.goalsAgainst + hg, matchesPlayed: aForm.matchesPlayed + 1 });
  }
  const n = rows.length;
  return {
    formWeight, n, coveredByForm,
    brier: +mean(rows.map((r) => brier1x2(r.p, r.actual))).toFixed(4),
    rps: +mean(rows.map((r) => rps1x2(r.p, r.actual) / 2)).toFixed(4),
    logLoss: +mean(rows.map((r) => logLoss(r.p, r.actual))).toFixed(4),
    topPick: +mean(rows.map((r) => { const pk = r.p.homeWin >= r.p.draw && r.p.homeWin >= r.p.awayWin ? "home" : r.p.awayWin >= r.p.draw ? "away" : "draw"; return pk === r.actual ? 1 : 0; })).toFixed(3),
    totalMAE: +mean(rows.map((r) => Math.abs(r.expTotal - r.actualTotal))).toFixed(3),
  };
}

// V1 recovered as V2 formWeight=0; also compute true-v1 to assert equivalence.
const v1ViaV2 = runV2(0);
// true v1 (pure engine) for the equivalence check
const trueV1 = (() => {
  const rows = [];
  for (const m of matches) {
    const hf = fifa.get(norm(m.home)), af = fifa.get(norm(m.away));
    const hg = m.ft && m.ft.home != null ? m.ft.home : m.homeGoals;
    const ag = m.ft && m.ft.away != null ? m.ft.away : m.awayGoals;
    if (hf == null || af == null || hg == null || ag == null) continue;
    const actual = hg > ag ? "home" : hg === ag ? "draw" : "away";
    rows.push({ p: projectMatch({ homeFifaPoints: hf, awayFifaPoints: af }).matchResult90, actual });
  }
  return { logLoss: +mean(rows.map((r) => logLoss(r.p, r.actual))).toFixed(4), brier: +mean(rows.map((r) => brier1x2(r.p, r.actual))).toFixed(4) };
})();
const equivalent = Math.abs(v1ViaV2.logLoss - trueV1.logLoss) < 1e-6 && Math.abs(v1ViaV2.brier - trueV1.brier) < 1e-6;

const weights = [0.25, 0.5, 0.75, 1.0];
const v2Runs = weights.map(runV2);
const bestV2 = [...v2Runs].sort((a, b) => a.logLoss - b.logLoss)[0];
const v2BeatsV1 = bestV2.logLoss < v1ViaV2.logLoss && bestV2.brier < v1ViaV2.brier;

const artifact = {
  version: "internal-soccer-projection-backtest-2022wc-v2-v1", asOf: "2026-07-14",
  public: false, internalOnly: true, webServed: false, officialMoneyRecordAffected: false,
  engine: "rating_poisson_with_form_v1",
  leakageNote: "Form computed from 90-min results in matches strictly earlier than each kickoff (date order); current result updates state only after prediction. Pre-tournament FIFA points. No 2026 data.",
  featureCoverage: `Form applies only when BOTH teams have >=1 prior match; group game 1 (16 matches) is pure FIFA. ${bestV2.coveredByForm}/${bestV2.n} matches got a non-zero form adjustment at formWeight ${bestV2.formWeight}.`,
  marketBaseline: { available: false, reason: "2022 closing odds not available free. See SOCCER_MARKET_BASELINE_BLOCKER.md." },
  v1: { logLoss: v1ViaV2.logLoss, brier: v1ViaV2.brier, rps: v1ViaV2.rps, topPick: v1ViaV2.topPick, totalMAE: v1ViaV2.totalMAE },
  v1EquivalenceCheck: { trueV1LogLoss: trueV1.logLoss, v2FormWeight0LogLoss: v1ViaV2.logLoss, equivalent },
  v2ByFormWeight: v2Runs,
  verdict: {
    v2BeatsV1, bestFormWeight: bestV2.formWeight,
    publicReady: false,
    note: "In-tournament form from 1–3 prior matches is a tiny, noisy signal. Report the honest v2-vs-v1 delta; do not adopt v2 as default unless it clearly beats v1 AND a market baseline later confirms it. Internal only.",
  },
};
const outDir = path.join(REPO, "data/internal/world-cup/projection-engine/backtests");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "2022-wc-v2.json"), JSON.stringify(artifact, null, 2));

console.log(`✓ V2 form backtest — N=${v1ViaV2.n} · v1==v2(fw0): ${equivalent}`);
console.log(`  V1        logLoss ${v1ViaV2.logLoss} · Brier ${v1ViaV2.brier} · top-pick ${(v1ViaV2.topPick * 100).toFixed(1)}% · totalMAE ${v1ViaV2.totalMAE}`);
for (const r of v2Runs) console.log(`  V2 fw${r.formWeight}  logLoss ${r.logLoss} · Brier ${r.brier} · top-pick ${(r.topPick * 100).toFixed(1)}% · totalMAE ${r.totalMAE} · formCovered ${r.coveredByForm}/${r.n}`);
console.log(`  v2 beats v1: ${v2BeatsV1} (best formWeight ${bestV2.formWeight}) | publicReady=false`);

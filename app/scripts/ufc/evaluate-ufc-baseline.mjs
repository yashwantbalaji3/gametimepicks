/**
 * UFC abstaining winner-baseline evaluation — chronological, leakage-free (Program 153 · Release A).
 * PRIVATE RESEARCH ARTIFACT.
 *
 * Baseline: fighter Elo (K=32, start 1500) updated ONLY from prior decisive bouts. No corner
 * advantage exists (corners are listing order, not venue), so the prediction is pure rating
 * difference. ABSTENTION IS FIRST-CLASS and mechanical:
 *   - debut/sparse: either fighter with < 3 prior decisive bouts in-corpus → ABSTAIN
 *   - inactivity: either fighter idle > 540 days at bout time → ABSTAIN
 *   - draw/no-contest bouts are never evaluated as decisive and never update ratings
 * Coverage (evaluated / eligible-population) is a headline metric, not a footnote. References:
 * coin 0.5 (must score ln 2) and the population red-rate prior.
 *
 * Run: node scripts/ufc/evaluate-ufc-baseline.mjs --now <ISO>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..", "data", "internal", "research", "ufc");

const argNow = process.argv.indexOf("--now");
if (argNow === -1 || !Number.isFinite(Date.parse(process.argv[argNow + 1] ?? ""))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const NOW = process.argv[argNow + 1];

const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "corpus-v1.json"), "utf8"));
const rows = corpus.rows;
const WARMUP_END = rows[Math.floor(rows.length / 3)].dateUtc; // first third of bouts is warm-up

const K = 32, START = 1500, SPARSE = 3, IDLE_DAYS = 540;
const elo = new Map(); const getE = (id) => elo.get(id) ?? START;
const hist = new Map(); const getH = (id) => hist.get(id) ?? { n: 0, last: null };
let redWins = 0, decis = 0;

const evald = [];
let abstained = 0, drawSkipped = 0;

for (const b of rows) {
  const inWarmup = b.dateUtc <= WARMUP_END;
  if (b.outcome === "DRAW_OR_NC") { if (!inWarmup) drawSkipped += 1; }
  else if (!inWarmup) {
    const hr = getH(b.red.id), hb = getH(b.blue.id);
    const t = Date.parse(b.dateUtc);
    const idle = (h) => h.last != null && (t - Date.parse(h.last)) / 86400000 > IDLE_DAYS;
    if (hr.n < SPARSE || hb.n < SPARSE || idle(hr) || idle(hb)) abstained += 1;
    else {
      const p = 1 / (1 + Math.pow(10, (getE(b.blue.id) - getE(b.red.id)) / 400));
      const y = b.outcome === "R" ? 1 : 0;
      const prior = decis ? redWins / decis : 0.5;
      evald.push({
        p, y, weightClass: b.weightClass,
        ll: -(y ? Math.log(Math.max(1e-12, p)) : Math.log(Math.max(1e-12, 1 - p))),
        brier: (p - y) ** 2,
        hit: (p >= 0.5 ? 1 : 0) === y ? 1 : 0,
        llPrior: -(y ? Math.log(Math.max(1e-12, prior)) : Math.log(Math.max(1e-12, 1 - prior))),
        llCoin: Math.log(2),
      });
    }
  }
  // Updates happen for every decisive bout regardless of evaluation membership.
  if (b.outcome !== "DRAW_OR_NC") {
    const exp = 1 / (1 + Math.pow(10, (getE(b.blue.id) - getE(b.red.id)) / 400));
    const y = b.outcome === "R" ? 1 : 0;
    elo.set(b.red.id, getE(b.red.id) + K * (y - exp));
    elo.set(b.blue.id, getE(b.blue.id) + K * ((1 - y) - (1 - exp)));
    redWins += y; decis += 1;
  }
  for (const [id] of [[b.red.id], [b.blue.id]]) {
    const h = getH(id); h.n += b.outcome !== "DRAW_OR_NC" ? 1 : 0; h.last = b.dateUtc; hist.set(id, h);
  }
}

const round = (x, d = 4) => Number(x.toFixed(d));
const agg = (l, k = "ll") => round(l.reduce((s, r) => s + r[k], 0) / l.length);
const eligible = evald.length + abstained;
const report = {
  schemaVersion: 1,
  artifact: "ufc-baseline-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  corpus: { file: "corpus-v1.json", totalFinalBouts: rows.length, warmupBoundary: WARMUP_END, eligibleDecisive: eligible, drawNcSkipped: drawSkipped },
  abstention: { rules: `either fighter <${SPARSE} prior decisive bouts OR idle >${IDLE_DAYS}d`, abstained, coverage: round(evald.length / eligible), note: "coverage is a headline metric — exclusions shape the denominator and are counted here" },
  baseline: { definition: `fighter Elo K=${K} start ${START}, decisive-only updates, no corner advantage (corners are listing order)`, evaluated: evald.length },
  metrics: {
    elo: { n: evald.length, logLoss: agg(evald, "ll"), brier: agg(evald, "brier"), accuracy: agg(evald, "hit") },
    redRatePrior: { logLoss: agg(evald, "llPrior") },
    coinAnchor: { logLoss: round(Math.log(2)), note: "exactly ln 2" },
  },
  byWeightClass: Object.fromEntries([...new Set(evald.map((r) => r.weightClass).filter(Boolean))].sort().map((wc) => {
    const l = evald.filter((r) => r.weightClass === wc);
    return [wc, l.length >= 20 ? { n: l.length, logLoss: agg(l, "ll"), accuracy: agg(l, "hit") } : { n: l.length, note: "sample too small to report" }];
  })),
  calibration: Array.from({ length: 10 }, (_, ix) => { const b = evald.filter((r) => Math.floor(r.p * 10) === ix || (ix === 9 && r.p === 1)); return { bin: `${ix * 10}-${ix * 10 + 10}%`, n: b.length, predicted: b.length ? round(b.reduce((s, r) => s + r.p, 0) / b.length) : null, observed: b.length ? round(b.reduce((s, r) => s + r.y, 0) / b.length) : null }; }),
  limitations: [
    "in-corpus history only — a veteran's pre-2023 record is invisible, so early sparse-history abstentions overshoot",
    "no reach/age/stance/method features; no rankings; no odds",
    "corner order carries no venue meaning; red-rate prior is a listing-order artifact, reported for honesty not signal",
  ],
  marketComparison: "unavailable — no authorized historical UFC odds capture exists",
};
fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "reports", "baseline-evaluation-v1.json"), JSON.stringify(report, null, 1));
console.log(`evaluated ${evald.length} / eligible ${eligible} (coverage ${report.abstention.coverage}), abstained ${abstained}, draw/NC skipped ${drawSkipped}`);
console.log(" elo:", JSON.stringify(report.metrics.elo), "| prior LL:", report.metrics.redRatePrior.logLoss);

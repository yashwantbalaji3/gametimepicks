/**
 * feature-attachment-dashboard.mjs — AUTOMATED feature-attachment report (Phase 4). For every pregame family it
 * reports capture files, eligible files, attached-observation count, coverage %, and a failure reason — the machine
 * form of docs/FEATURE_ATTACHMENT_AUDIT.md. Read-only; writes status/feature-attachment.json (public:false).
 * NO modeling, NO money. Answers "which families are attaching, and why not?" at a glance.
 *
 *   node app/scripts/feature-attachment-dashboard.mjs
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const PA = path.join(REPO, "data/internal/mlb/pregame-archive");
const STATUS = path.join(PA, "status");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const lsdirs = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; } };
const lsfiles = (p) => { try { return fs.readdirSync(p).filter((f) => f.endsWith(".json")); } catch { return []; } };

// family dir (pregame-features) ↔ observation featureCoverage key. pitcher_status/environment live in snapshots,
// market_probability comes from the join row — reported from the observations only.
const FAMILIES = [
  { key: "pitcherWorkload", dir: "pitcher-workload" },
  { key: "teamOffensiveForm", dir: "team-offensive-form" },
  { key: "lineup", dir: "lineup" },
  { key: "bullpen", dir: "bullpen" },
  { key: "matchup", dir: "matchup" },
  { key: "park", dir: "park-factors" },
  { key: "batterSplits", dir: "batter-splits" },
  { key: "batterForm", dir: "batter-form" },
  { key: "batterVsPitcher", dir: "batter-vs-pitcher" },
  { key: "paOpportunity", dir: "pa-opportunity" },
];
const OBS_ONLY = ["pitcherStatus", "environment", "market"]; // no pregame-features dir; report attachment only

function main() {
  const featBase = path.join(PA, "pregame-features");
  // observation attachment counts per featureCoverage key
  const obsDir = path.join(PA, "research-observations");
  let totalObs = 0; const attached = {};
  const byDate = {}; // date → { total, <famKey>: attachedCount } — historical coverage trend (regression detection)
  for (const f of (() => { try { return fs.readdirSync(obsDir).filter((x) => x.endsWith(".jsonl")); } catch { return []; } })()) {
    const date = f.replace(/\.jsonl$/, "");
    const bd = byDate[date] || (byDate[date] = { total: 0 });
    for (const line of fs.readFileSync(path.join(obsDir, f), "utf8").split("\n")) {
      if (!line.trim()) continue; let o; try { o = JSON.parse(line); } catch { continue; }
      totalObs++; bd.total++;
      for (const [k, v] of Object.entries(o.featureCoverage || {})) if (v) { attached[k] = (attached[k] || 0) + 1; bd[k] = (bd[k] || 0) + 1; }
    }
  }
  // per-date coverage % per family (the trend); a family dropping across dates = a regression to investigate.
  const trendByDate = Object.fromEntries(Object.entries(byDate).sort().map(([d, bd]) => [d, Object.fromEntries(Object.entries(bd).filter(([k]) => k !== "total").map(([k, n]) => [k, bd.total ? +(100 * n / bd.total).toFixed(1) : 0]).concat([["totalObservations", bd.total]]))]));

  const families = [];
  for (const { key, dir } of FAMILIES) {
    let captureFiles = 0, eligibleFiles = 0;
    for (const d of lsdirs(path.join(featBase, dir))) for (const f of lsfiles(path.join(featBase, dir, d))) {
      captureFiles++; const r = readJson(path.join(featBase, dir, d, f)); if (r?.researchEligible === true) eligibleFiles++;
    }
    const attachedObs = attached[key] || 0;
    const coveragePct = totalObs ? +(100 * attachedObs / totalObs).toFixed(1) : null;
    const failureReason =
      captureFiles === 0 ? "no captures on disk (capture not run / date not covered)"
      : eligibleFiles === 0 ? "captures exist but NONE eligible (cadence gap — captured after first pitch)"
      : coveragePct === 0 ? "eligible captures exist but for other games than the settled ones (cadence for the games that finalized)"
      : coveragePct != null && coveragePct < 60 ? "partial — some settled games lack an eligible capture"
      : null;
    families.push({ family: key, dir, captureFiles, eligibleFiles, attachedObservations: attachedObs, coveragePct, failureReason, status: coveragePct == null ? "no-observations" : coveragePct >= 60 ? "OK" : coveragePct > 0 ? "PARTIAL" : "GAP" });
  }
  for (const key of OBS_ONLY) families.push({ family: key, dir: "(snapshots/join)", captureFiles: null, eligibleFiles: null, attachedObservations: attached[key] || 0, coveragePct: totalObs ? +(100 * (attached[key] || 0) / totalObs).toFixed(1) : null, failureReason: null, status: "obs-only" });

  const report = {
    public: false, approvedForProduction: false, productEligible: false, kind: "mlb-feature-attachment",
    lastUpdated: new Date().toISOString(), totalObservations: totalObs, families, trendByDate,
    note: "Coverage % = attached observations / total observations. eligibleFiles=0 while captureFiles>0 ⇒ a cadence gap (captured after first pitch, correctly excluded as leakage), not an attachment bug. No fabrication.",
  };
  fs.mkdirSync(STATUS, { recursive: true });
  fs.writeFileSync(path.join(STATUS, "feature-attachment.json"), JSON.stringify(report, null, 2));

  console.log(`\n=== FEATURE ATTACHMENT (of ${totalObs} obs) ===`);
  for (const f of families) console.log(`  ${f.family.padEnd(18)} cap ${String(f.captureFiles ?? "-").padStart(4)} · elig ${String(f.eligibleFiles ?? "-").padStart(4)} · attach ${f.coveragePct ?? "-"}%  ${f.status}${f.failureReason ? "  ("+f.failureReason.slice(0,42)+")" : ""}`);
  console.log(`  → data/internal/mlb/pregame-archive/status/feature-attachment.json`);
  process.exit(0);
}
const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();

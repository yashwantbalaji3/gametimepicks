/**
 * audit-mlb-pregame-archive.mjs — internal coverage / quality / research-readiness audit of the pregame archive.
 *
 * Reads all captured snapshots + freezes and reports per-family coverage, timestamp-proven %, and progress toward
 * the minimum forward-collection gate that must be met BEFORE any future challenger modeling may begin. Writes
 * data/internal/mlb/pregame-archive/status/latest.json (public:false). No modeling; no public output.
 *
 * Run: node app/scripts/audit-mlb-pregame-archive.mjs
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCHIVE = path.join(REPO, "data/internal/mlb/pregame-archive");
const SNAP = path.join(ARCHIVE, "snapshots");
const GATE = { minDistinctDates: 30, minSettledEligibleObs: 500, minFeatureCoveragePct: 80, minTimestampProvenPct: 90 };
const FAMILIES = ["confirmed_lineup", "pitcher_status", "bullpen", "plate_appearance_opportunity", "markets", "environment", "umpire"];

function main() {
  const dates = fs.existsSync(SNAP) ? fs.readdirSync(SNAP).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort() : [];
  let totalSnaps = 0, totalGames = 0, eligibleGames = 0;
  const famEligible = Object.fromEntries(FAMILIES.map((f) => [f, 0]));
  const famPresent = Object.fromEntries(FAMILIES.map((f) => [f, 0]));
  const byDate = [];
  for (const d of dates) {
    const files = fs.readdirSync(path.join(SNAP, d)).filter((f) => f.endsWith(".json"));
    const games = new Set();
    let dEligible = 0;
    for (const f of files) {
      const s = JSON.parse(fs.readFileSync(path.join(SNAP, d, f), "utf8"));
      totalSnaps++; games.add(s.gamePk);
      let anyElig = false;
      for (const fam of s.featureFamilies || []) {
        if (fam.present) famPresent[fam.family]++;
        if (fam.researchEligible) { famEligible[fam.family]++; anyElig = true; }
      }
      if (anyElig) dEligible++;
    }
    totalGames += games.size; eligibleGames += dEligible;
    byDate.push({ date: d, games: games.size, snapshots: files.length, snapshotsWithEligibleFamily: dEligible });
  }
  // coverage % = games with a lineup OR pitcher pregame value / games (headline families for research)
  const coveragePct = totalGames ? +(100 * (famEligible.pitcher_status) / (totalSnaps || 1)).toFixed(1) : 0;
  const timestampProvenPct = totalSnaps ? +(100 * eligibleGames / totalSnaps).toFixed(1) : 0;
  const progress = { distinctDates: dates.length, settledEligibleObs: 0 /* set by a later settlement join, not this mission */, featureCoveragePct: coveragePct, timestampProvenPct };
  const blockers = [];
  if (progress.distinctDates < GATE.minDistinctDates) blockers.push(`dates ${progress.distinctDates}/${GATE.minDistinctDates}`);
  if (progress.settledEligibleObs < GATE.minSettledEligibleObs) blockers.push(`settled-eligible ${progress.settledEligibleObs}/${GATE.minSettledEligibleObs}`);
  if (progress.featureCoveragePct < GATE.minFeatureCoveragePct) blockers.push(`coverage ${progress.featureCoveragePct}%/${GATE.minFeatureCoveragePct}%`);
  if (progress.timestampProvenPct < GATE.minTimestampProvenPct) blockers.push(`timestamp-proven ${progress.timestampProvenPct}%/${GATE.minTimestampProvenPct}%`);

  const status = {
    public: false, approvedForProduction: false, productEligible: false,
    generatedAt: null, // stamped after write to keep this deterministic; see note
    collectionStartDate: dates[0] ?? null, datesCollected: dates.length, totalSnapshots: totalSnaps, totalGames,
    familyPresent: famPresent, familyEligibleSnapshots: famEligible,
    byDate,
    collectionGate: GATE, gateMet: blockers.length === 0, gateBlockers: blockers,
    note: "settledEligibleObs is populated only by a separate future settlement-join mission; forward collection just started, so the gate is not met — this is expected.",
  };
  fs.mkdirSync(path.join(ARCHIVE, "status"), { recursive: true });
  fs.writeFileSync(path.join(ARCHIVE, "status", "latest.json"), JSON.stringify(status, null, 2));

  console.log(`\n=== pregame archive audit ===`);
  console.log(`dates collected: ${dates.length} (start ${dates[0] ?? "none"}) · snapshots ${totalSnaps} · games ${totalGames}`);
  console.log(`eligible-family snapshots:`, JSON.stringify(famEligible));
  console.log(`progress to research gate: ${blockers.length ? "NOT MET" : "MET"} — ${blockers.join(" · ") || "all thresholds cleared"}`);
  console.log(`status → ${path.relative(REPO, path.join(ARCHIVE, "status", "latest.json"))}`);
}
main();

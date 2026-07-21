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
  const FREEZE = path.join(ARCHIVE, "freezes");
  let totalSnaps = 0, totalGames = 0, eligibleGames = 0, snapshotsBeforeFirstPitch = 0, postStartRejected = 0, totalFreezes = 0;
  const famEligible = Object.fromEntries(FAMILIES.map((f) => [f, 0]));
  const famPresent = Object.fromEntries(FAMILIES.map((f) => [f, 0]));
  // per-family GAME coverage = distinct games (across the whole archive) that ever had an eligible value for the family
  const famGamesCovered = Object.fromEntries(FAMILIES.map((f) => [f, new Set()]));
  const byDate = [];
  for (const d of dates) {
    const files = fs.readdirSync(path.join(SNAP, d)).filter((f) => f.endsWith(".json"));
    const games = new Set();
    let dEligible = 0, dPre = 0, dPost = 0;
    for (const f of files) {
      const s = JSON.parse(fs.readFileSync(path.join(SNAP, d, f), "utf8"));
      totalSnaps++; games.add(s.gamePk);
      if (s.startedAtCapture) { postStartRejected++; dPost++; } else { snapshotsBeforeFirstPitch++; dPre++; }
      let anyElig = false;
      for (const fam of s.featureFamilies || []) {
        if (fam.present) famPresent[fam.family]++;
        if (fam.researchEligible) { famEligible[fam.family]++; anyElig = true; famGamesCovered[fam.family].add(`${d}:${s.gamePk}`); }
      }
      if (anyElig) dEligible++;
    }
    const freezeCount = fs.existsSync(path.join(FREEZE, d)) ? fs.readdirSync(path.join(FREEZE, d)).filter((x) => x.endsWith(".json")).length : 0;
    totalFreezes += freezeCount;
    totalGames += games.size; eligibleGames += dEligible;
    byDate.push({ date: d, games: games.size, snapshots: files.length, snapshotsBeforeFirstPitch: dPre, postStartRejected: dPost, snapshotsWithEligibleFamily: dEligible, freezes: freezeCount });
  }
  // family coverage as % of all games that ever had an eligible value
  const familyGameCoveragePct = Object.fromEntries(FAMILIES.map((f) => [f, totalGames ? +(100 * famGamesCovered[f].size / totalGames).toFixed(1) : 0]));

  // ── market + player-prop snapshots (paid Odds API, internal). Read the COMMITTED manifests (the large
  // raw/normalized payloads persist via workflow artifacts + are gitignored). ──
  const MKT = path.join(ARCHIVE, "market-snapshots");
  const mkt = { marketSnapshotDates: [], marketSnapshots: 0, marketRecords: 0, marketRecordsEligible: 0, marketDeVigPaired: 0, marketCoverageByFamily: {} };
  const pp = { playerPropMarketSnapshots: 0, playerPropRecords: 0, playerPropRecordsEligible: 0, pairedCount: 0, overOnlyCount: 0, playerPropCoverageByMarket: {}, marketGamesCovered: new Set(), lastCaptureAt: null, creditsSpent: 0 };
  if (fs.existsSync(MKT)) {
    for (const d of fs.readdirSync(MKT).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort()) {
      mkt.marketSnapshotDates.push(d);
      for (const cap of fs.readdirSync(path.join(MKT, d))) {
        const man = path.join(MKT, d, cap, "manifest.json");
        if (!fs.existsSync(man)) continue;
        const m = JSON.parse(fs.readFileSync(man, "utf8"));
        if (m.kind === "mlb-pregame-player-prop-capture") {
          pp.playerPropMarketSnapshots++;
          pp.playerPropRecords += m.playerPropRecords || 0; pp.playerPropRecordsEligible += m.playerPropRecordsEligible || 0;
          pp.pairedCount += m.pairedCount || 0; pp.overOnlyCount += m.overOnlyCount || 0; pp.creditsSpent += m.creditsSpent || 0;
          for (const [k, v] of Object.entries(m.playerPropCoverageByMarket || {})) pp.playerPropCoverageByMarket[k] = (pp.playerPropCoverageByMarket[k] || 0) + v;
          if (m.playerPropCoverageByGame) pp.marketGamesCovered.add(`${d}:pp:${m.captureId}`);
          if (!pp.lastCaptureAt || (m.captureId && d >= (mkt.marketSnapshotDates[0] || d))) pp.lastCaptureAt = d;
        } else { // team markets
          mkt.marketSnapshots++;
          mkt.marketRecords += m.wrote || 0; mkt.marketRecordsEligible += m.eligible ?? m.wrote ?? 0;
        }
      }
    }
  }
  const marketDeVigCoveragePct = pp.playerPropRecords ? +(100 * pp.pairedCount / pp.playerPropRecords).toFixed(1) : 0;
  const marketCreditStatus = mkt.marketSnapshots > 0 ? "team-markets captured" : "not-captured (opt-in / credit-gated)";
  const playerPropCreditStatus = pp.playerPropMarketSnapshots > 0 ? "player-props captured" : "not-captured (opt-in / credit-gated)";
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
    collectionStartDate: dates[0] ?? null, datesCollected: dates.length, totalSnapshots: totalSnaps, totalGames,
    snapshotsBeforeFirstPitch, postStartRejected, totalFreezes, freezeCompletenessPct: totalGames ? +(100 * totalFreezes / totalGames).toFixed(1) : 0,
    familyPresent: famPresent, familyEligibleSnapshots: famEligible,
    coverageByFamilyPct: familyGameCoveragePct,
    lineupCoveragePct: familyGameCoveragePct.confirmed_lineup, umpireCoveragePct: familyGameCoveragePct.umpire, weatherCoveragePct: familyGameCoveragePct.environment,
    marketSnapshotDates: mkt.marketSnapshotDates, marketSnapshots: mkt.marketSnapshots, marketRecords: mkt.marketRecords,
    marketRecordsEligible: mkt.marketRecordsEligible, marketCreditStatus,
    playerPropMarketSnapshots: pp.playerPropMarketSnapshots, playerPropRecords: pp.playerPropRecords,
    playerPropRecordsEligible: pp.playerPropRecordsEligible, playerPropCoverageByMarket: pp.playerPropCoverageByMarket,
    playerPropCoverageByGame: pp.marketGamesCovered.size, overOnlyCount: pp.overOnlyCount, pairedCount: pp.pairedCount,
    deVigCoverage: marketDeVigCoveragePct, playerPropCreditsSpent: pp.creditsSpent, playerPropCreditStatus, playerPropLastCaptureAt: pp.lastCaptureAt,
    byDate,
    collectionGate: GATE, gateMet: blockers.length === 0, gateBlockers: blockers,
    note: "settledEligibleObs is populated only by a separate future settlement-join mission; forward collection just started, so the gate is not met — this is expected.",
  };
  fs.mkdirSync(path.join(ARCHIVE, "status"), { recursive: true });
  fs.writeFileSync(path.join(ARCHIVE, "status", "latest.json"), JSON.stringify(status, null, 2));

  console.log(`\n=== pregame archive daily status ===`);
  console.log(`dates collected: ${dates.length} (start ${dates[0] ?? "none"}) · snapshots ${totalSnaps} (pre-first-pitch ${snapshotsBeforeFirstPitch}, post-start rejected ${postStartRejected}) · games ${totalGames} · freezes ${totalFreezes} (${status.freezeCompletenessPct}%)`);
  console.log(`family game-coverage %: lineup ${status.lineupCoveragePct} · umpire ${status.umpireCoveragePct} · weather ${status.weatherCoveragePct} · pitcher ${familyGameCoveragePct.pitcher_status}`);
  console.log(`team markets: ${marketCreditStatus} · ${mkt.marketSnapshots} snapshots · ${mkt.marketRecords} records (${mkt.marketRecordsEligible} eligible)`);
  console.log(`player props: ${playerPropCreditStatus} · ${pp.playerPropMarketSnapshots} snapshots · ${pp.playerPropRecords} records (${pp.playerPropRecordsEligible} eligible) · paired ${pp.pairedCount} / over-only ${pp.overOnlyCount} · de-vig ${marketDeVigCoveragePct}% · credits ${pp.creditsSpent} · markets ${JSON.stringify(pp.playerPropCoverageByMarket)}`);
  console.log(`research gate: ${blockers.length ? "NOT MET" : "MET"} — ${blockers.join(" · ") || "all thresholds cleared"}`);
  console.log(`status → ${path.relative(REPO, path.join(ARCHIVE, "status", "latest.json"))}`);
}
main();

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
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

// ── Settlement-join aggregation (Phase 5): read the SEPARATE research-join artifacts (settlement-joins/<date>/
// <gamePk>.json) written by join-mlb-pregame-settlements.mjs. settled-eligible = a pregame-researchEligible market
// lean with a DECISIVE official outcome (win|loss). Pushes/pending/ambiguous/unsupported/ineligible are counted
// separately and NEVER toward the 500 gate. Contextual rows are research-linked, not graded, not counted. ──
function aggregateSettlementJoins() {
  const JOIN = path.join(ARCHIVE, "settlement-joins");
  const dates = fs.existsSync(JOIN) ? fs.readdirSync(JOIN).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort() : [];
  let gamesFinal = 0, gamesPending = 0, joinRows = 0, settledEligible = 0, push = 0, pending = 0, unavailable = 0, ambiguous = 0, unsupported = 0, ineligibleGraded = 0;
  const byFamily = {}, byMarket = {}, distinctPlayerMarket = new Set(), settledDates = new Set();
  for (const d of dates) {
    for (const f of fs.readdirSync(path.join(JOIN, d)).filter((x) => x.endsWith(".json"))) {
      const j = readJson(path.join(JOIN, d, f));
      if (!j) continue;
      if (j.gameFinalStatus?.isFinal) gamesFinal++; else gamesPending++;
      joinRows += j.marketRows?.length || 0;
      for (const r of j.marketRows || []) {
        const s = r.settlementStatus;
        if (r.countsAsSettledEligible) { settledEligible++; settledDates.add(d); byMarket[r.market] = (byMarket[r.market] || 0) + 1; distinctPlayerMarket.add(`${r.gamePk}|${r.playerId}|${r.market}|${r.selection}`); }
        else if (s === "push") push++;
        else if (s === "pending") pending++;
        else if (s === "unavailable") unavailable++;
        else if (s === "ambiguous") ambiguous++;
        else if (s === "unsupported") unsupported++;
        if (r.researchEligible !== true && (s === "win" || s === "loss")) ineligibleGraded++;
      }
      for (const c of j.contextualRows || []) if (c.outcomeStatus === "linked") byFamily[c.family] = (byFamily[c.family] || 0) + 1;
    }
  }
  return {
    settlementJoinDates: dates, settledEligibleDates: [...settledDates].sort(),
    gamesFinal, gamesPending, joinRows,
    settledEligibleRows: settledEligible, settledPushRows: push, marketPendingRows: pending,
    unavailableRows: unavailable, ambiguousRows: ambiguous, unsupportedRows: unsupported, ineligibleGradedRows: ineligibleGraded,
    distinctSettledPlayerMarkets: distinctPlayerMarket.size,
    joinCoverageByFamily: byFamily, joinCoverageByMarket: byMarket,
  };
}

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
  // ── settlement joins → real settled-eligible count feeds the gate (Phase 5) ──
  const joins = aggregateSettlementJoins();
  const marketDatesSet = new Set(mkt.marketSnapshotDates);
  // "earliest valid research date" from ACTUAL math (never a promise): the gate needs BOTH 30 distinct dates AND
  // 500 settled-eligible rows. Settled-eligible rows accrue ONLY from dates that have market capture AND final
  // games. Compute the binding constraint honestly from observed rates; if no settled row exists yet, the daily
  // settled rate is not yet measurable, so the settled-gate ETA is INDETERMINATE (stated, not fabricated).
  const settledDays = joins.settledEligibleDates.length;
  const avgSettledPerSettledDay = settledDays ? Math.round(joins.settledEligibleRows / settledDays) : 0;
  const datesToGate = Math.max(0, GATE.minDistinctDates - dates.length);
  const settledRowsRemaining = Math.max(0, GATE.minSettledEligibleObs - joins.settledEligibleRows);
  const settledGateEta = avgSettledPerSettledDay > 0
    ? `~${Math.ceil(settledRowsRemaining / avgSettledPerSettledDay)} market-settled days at the observed ${avgSettledPerSettledDay} settled-eligible rows/day`
    : "INDETERMINATE — 0 settled-eligible rows so far (markets must be captured pregame AND the games final); the daily settled rate is not yet measurable";
  const earliestValidResearchDate = {
    dateGate: `${dates.length}/${GATE.minDistinctDates} distinct dates · ~${datesToGate} more daily runs`,
    settledEligibleGate: `${joins.settledEligibleRows}/${GATE.minSettledEligibleObs} · ${settledGateEta}`,
    bindingConstraint: settledRowsRemaining > 0 && avgSettledPerSettledDay === 0 ? "settled-eligible rows (no market-capture date has final games yet)" : (datesToGate > 0 || settledRowsRemaining > 0 ? "whichever of dates / settled-eligible clears last" : "gate met"),
    note: "Not a promise — recomputed each run from observed collection. First settled-eligible rows accrue when the earliest market-capture date's games are final and re-joined.",
  };
  const progress = { distinctDates: dates.length, settledEligibleObs: joins.settledEligibleRows, featureCoveragePct: coveragePct, timestampProvenPct };
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
    settlementJoins: {
      settlementJoinDates: joins.settlementJoinDates, settledEligibleDates: joins.settledEligibleDates,
      gamesFinal: joins.gamesFinal, gamesPending: joins.gamesPending, joinRows: joins.joinRows,
      settledEligibleRows: joins.settledEligibleRows, settledPushRows: joins.settledPushRows, marketPendingRows: joins.marketPendingRows,
      unavailableRows: joins.unavailableRows, ambiguousRows: joins.ambiguousRows, unsupportedRows: joins.unsupportedRows, ineligibleGradedRows: joins.ineligibleGradedRows,
      distinctSettledPlayerMarkets: joins.distinctSettledPlayerMarkets,
      joinCoverageByFamily: joins.joinCoverageByFamily, joinCoverageByMarket: joins.joinCoverageByMarket,
      progressTo500: `${joins.settledEligibleRows}/${GATE.minSettledEligibleObs}`, earliestValidResearchDate,
    },
    collectionGate: GATE, gateMet: blockers.length === 0, gateBlockers: blockers,
    note: "settledEligibleObs is now populated by the settlement-join pipeline (join-mlb-pregame-settlements.mjs). Only pregame-researchEligible market leans with a DECISIVE official outcome (win|loss) count toward the 500-row gate; pushes/pending/ambiguous/unsupported/ineligible + contextual research rows never do. No modeling; official box scores only.",
  };
  fs.mkdirSync(path.join(ARCHIVE, "status"), { recursive: true });
  fs.writeFileSync(path.join(ARCHIVE, "status", "latest.json"), JSON.stringify(status, null, 2));

  console.log(`\n=== pregame archive daily status ===`);
  console.log(`dates collected: ${dates.length} (start ${dates[0] ?? "none"}) · snapshots ${totalSnaps} (pre-first-pitch ${snapshotsBeforeFirstPitch}, post-start rejected ${postStartRejected}) · games ${totalGames} · freezes ${totalFreezes} (${status.freezeCompletenessPct}%)`);
  console.log(`family game-coverage %: lineup ${status.lineupCoveragePct} · umpire ${status.umpireCoveragePct} · weather ${status.weatherCoveragePct} · pitcher ${familyGameCoveragePct.pitcher_status}`);
  console.log(`team markets: ${marketCreditStatus} · ${mkt.marketSnapshots} snapshots · ${mkt.marketRecords} records (${mkt.marketRecordsEligible} eligible)`);
  console.log(`player props: ${playerPropCreditStatus} · ${pp.playerPropMarketSnapshots} snapshots · ${pp.playerPropRecords} records (${pp.playerPropRecordsEligible} eligible) · paired ${pp.pairedCount} / over-only ${pp.overOnlyCount} · de-vig ${marketDeVigCoveragePct}% · credits ${pp.creditsSpent} · markets ${JSON.stringify(pp.playerPropCoverageByMarket)}`);
  console.log(`settlement joins: dates ${joins.settlementJoinDates.length} · games final ${joins.gamesFinal}/pending ${joins.gamesPending} · join rows ${joins.joinRows} · SETTLED-ELIGIBLE ${joins.settledEligibleRows} (push ${joins.settledPushRows}, pending ${joins.marketPendingRows}, ambiguous ${joins.ambiguousRows}, unavailable ${joins.unavailableRows}, unsupported ${joins.unsupportedRows}) · contextual-by-family ${JSON.stringify(joins.joinCoverageByFamily)}`);
  console.log(`progress to 500 settled-eligible: ${joins.settledEligibleRows}/${GATE.minSettledEligibleObs} · settled-gate ETA: ${earliestValidResearchDate.settledEligibleGate}`);
  console.log(`research gate: ${blockers.length ? "NOT MET" : "MET"} — ${blockers.join(" · ") || "all thresholds cleared"}`);
  console.log(`status → ${path.relative(REPO, path.join(ARCHIVE, "status", "latest.json"))}`);
}
main();

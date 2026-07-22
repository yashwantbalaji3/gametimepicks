/**
 * monitor-mlb-pregame-archive.mjs — INTERNAL daily monitor for the MLB pregame archive: latest-capture status +
 * a 7-day progress view + research-gate estimates. Reads committed manifests + snapshots (large raw/normalized
 * payloads are gitignored). No modeling; no public output. Writes data/internal/mlb/pregame-archive/status/monitor.json.
 *
 * Run: node app/scripts/monitor-mlb-pregame-archive.mjs
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCH = path.join(REPO, "data/internal/mlb/pregame-archive");
const SNAP = path.join(ARCH, "snapshots");
const MKT = path.join(ARCH, "market-snapshots");
const GATE = { minDistinctDates: 30, minSettledEligibleObs: 500 };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const dirs = (p) => (fs.existsSync(p) ? fs.readdirSync(p) : []);

// ── collect the market/prop capture manifests, newest-first ──
function manifests() {
  const out = [];
  for (const d of dirs(MKT).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort()) {
    for (const cap of dirs(path.join(MKT, d))) {
      const m = readJson(path.join(MKT, d, cap, "manifest.json"));
      if (m) out.push({ date: d, cap, ...m });
    }
  }
  return out;
}

function main() {
  const snapDates = dirs(SNAP).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  const mans = manifests();
  const teamMans = mans.filter((m) => m.kind === "mlb-pregame-market-capture");
  const propMans = mans.filter((m) => m.kind === "mlb-pregame-player-prop-capture");
  const latestTeam = teamMans[teamMans.length - 1] || null;
  const latestProp = propMans[propMans.length - 1] || null;

  // ── latest daily status ──
  const dailyStatus = {
    teamMarketCapture: latestTeam ? { status: "captured", date: latestTeam.date, records: latestTeam.wrote, eligible: latestTeam.eligible ?? latestTeam.wrote, creditsSpent: latestTeam.creditsUsedApprox ?? null, creditsRemaining: latestTeam.creditsRemaining ?? null, skippedStarted: latestTeam.skippedStarted ?? null } : { status: "not-captured (opt-in / credit-gated)" },
    playerPropCapture: latestProp ? {
      status: "captured", date: latestProp.date, mode: latestProp.mode,
      eventsCaptured: latestProp.eventsTargeted, eventsOnDate: latestProp.eventsOnDate, maxEvents: latestProp.maxEvents,
      marketsCaptured: Object.keys(latestProp.playerPropCoverageByMarket || {}),
      records: latestProp.playerPropRecords, eligibleRecords: latestProp.playerPropRecordsEligible,
      paired: latestProp.pairedCount, overOnly: latestProp.overOnlyCount, deVigCoveragePct: latestProp.deVigCoveragePct ?? null,
      estimatedCredits: latestProp.creditEstimate, actualCreditsSpent: latestProp.creditsSpent, creditsRemaining: latestProp.creditsRemaining,
      skippedGames: (latestProp.eventsOnDate ?? 0) - (latestProp.eventsTargeted ?? 0),
      providerUnavailable: latestProp.providerUnavailable || [], stoppedEarly: latestProp.stoppedEarly || null,
    } : { status: "not-captured (opt-in / credit-gated)" },
  };

  // ── 7-day progress view ──
  const last7 = snapDates.slice(-7);
  const marketDates = [...new Set(teamMans.map((m) => m.date))].sort();
  const propDates = [...new Set(propMans.map((m) => m.date))].sort();
  const propEligiblePerDate = {};
  for (const m of propMans) propEligiblePerDate[m.date] = (propEligiblePerDate[m.date] || 0) + (m.playerPropRecordsEligible || 0);
  const propDaysWithData = Object.keys(propEligiblePerDate).length;
  const avgEligibleRecordsPerDay = propDaysWithData ? Math.round(Object.values(propEligiblePerDate).reduce((a, b) => a + b, 0) / propDaysWithData) : 0;
  const daysToDateGate = Math.max(0, GATE.minDistinctDates - snapDates.length);

  const progress7d = {
    windowDates: last7,
    datesCollected: snapDates.length, marketDatesCollected: marketDates.length, playerPropDatesCollected: propDates.length,
    avgEligiblePlayerPropRecordsPerDay: avgEligibleRecordsPerDay,
    estimatedDaysTo30DateGate: daysToDateGate,
    pathTo500SettledEligibleRows: "settledEligibleObs=0 until a separate settlement-join mission runs; then each settled prop-lean that was captured pregame becomes 1 eligible row. At current per-day capture, a month of daily collection yields ample raw eligible records; the 500 SETTLED-eligible threshold is measurable only after the settlement join + official grading.",
  };

  // ── settlement-join progress: read the audit's status/latest.json (the settlement-join authority) so the
  // monitor's gate reflects real settled-eligible rows without duplicating the join-reading logic. ──
  const latest = readJson(path.join(ARCH, "status", "latest.json"));
  const sj = latest?.settlementJoins ?? null;
  const settledEligibleRows = sj?.settledEligibleRows ?? 0;
  const gateMet = snapDates.length >= GATE.minDistinctDates && settledEligibleRows >= GATE.minSettledEligibleObs;

  const report = {
    public: false, approvedForProduction: false, productEligible: false,
    kind: "mlb-pregame-archive-monitor", collectionStartDate: snapDates[0] ?? null,
    dailyStatus, progress7d,
    settlementJoins: sj ? { settlementJoinDates: sj.settlementJoinDates, gamesFinal: sj.gamesFinal, gamesPending: sj.gamesPending, joinRows: sj.joinRows, settledEligibleRows: sj.settledEligibleRows, marketPendingRows: sj.marketPendingRows, ambiguousRows: sj.ambiguousRows, unsupportedRows: sj.unsupportedRows, joinCoverageByMarket: sj.joinCoverageByMarket, earliestValidResearchDate: sj.earliestValidResearchDate } : { note: "run audit-mlb-pregame-archive.mjs first — no settlement-join status yet" },
    researchGate: { ...GATE, dates: `${snapDates.length}/${GATE.minDistinctDates}`, settledEligible: `${settledEligibleRows}/${GATE.minSettledEligibleObs}`, met: gateMet },
  };
  fs.mkdirSync(path.join(ARCH, "status"), { recursive: true });
  fs.writeFileSync(path.join(ARCH, "status", "monitor.json"), JSON.stringify(report, null, 2));

  // ── console ──
  console.log(`\n=== MLB pregame archive MONITOR ===`);
  console.log(`— DAILY STATUS —`);
  const t = dailyStatus.teamMarketCapture, p = dailyStatus.playerPropCapture;
  console.log(`team markets: ${t.status}${t.date ? ` (${t.date}) records ${t.records}/${t.eligible} eligible` : ""}`);
  if (p.status === "captured") {
    console.log(`player props: captured (${p.date}, ${p.mode}) events ${p.eventsCaptured}/${p.eventsOnDate} (cap ${p.maxEvents}) · records ${p.records} (${p.eligibleRecords} eligible) · paired ${p.paired}/over-only ${p.overOnly} · de-vig ${p.deVigCoveragePct}%`);
    console.log(`  est credits ${p.estimatedCredits} · actual spent ${p.actualCreditsSpent} · remaining ${p.creditsRemaining} · skipped(not-targeted) ${p.skippedGames} · provider_unavailable ${p.providerUnavailable.length}`);
  } else console.log(`player props: ${p.status}`);
  console.log(`— 7-DAY PROGRESS —`);
  console.log(`dates ${progress7d.datesCollected} (market ${progress7d.marketDatesCollected}, props ${progress7d.playerPropDatesCollected}) · avg eligible prop records/day ${avgEligibleRecordsPerDay} · days to 30-date gate ${daysToDateGate}`);
  console.log(`monitor → ${path.relative(REPO, path.join(ARCH, "status", "monitor.json"))}`);
}
main();

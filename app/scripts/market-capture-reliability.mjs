/**
 * market-capture-reliability.mjs — DAILY research-accumulation reliability monitor (Phase 3). For each slate date it
 * reports whether the day contributed to the warehouse or was a LOST research opportunity (a final slate that
 * produced no observations — because market capture didn't run, or ran too late for the games that finalized).
 *
 * Read-only over the internal warehouse; writes status/market-capture-reliability.json (public:false). NO modeling,
 * NO money. The goal: never silently repeat 2026-07-21 (final games, zero market capture).
 *
 *   node app/scripts/market-capture-reliability.mjs
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const PA = path.join(REPO, "data/internal/mlb/pregame-archive");
const STATUS = path.join(PA, "status");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const lsdirs = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; } };
const lsfiles = (p) => { try { return fs.readdirSync(p).filter((f) => !f.startsWith(".")); } catch { return []; } };

function main() {
  const joinBase = path.join(PA, "settlement-joins");
  const dates = lsdirs(joinBase).sort();
  const perDate = [];
  for (const d of dates) {
    let games = 0, finalGames = 0, marketRows = 0, settledEligible = 0, earliestStart = null;
    for (const f of lsfiles(path.join(joinBase, d))) {
      const j = readJson(path.join(joinBase, d, f));
      if (!j) continue;
      games++;
      if (j.gameFinalStatus?.isFinal) finalGames++;
      marketRows += j.counts?.marketRows || 0;
      settledEligible += j.counts?.marketSettledEligible || 0;
      if (j.eventStartTime && (!earliestStart || j.eventStartTime < earliestStart)) earliestStart = j.eventStartTime;
    }
    const marketSnapshots = lsfiles(path.join(PA, "market-snapshots", d)).length;
    let observations = 0; try { observations = fs.readFileSync(path.join(PA, "research-observations", `${d}.jsonl`), "utf8").split("\n").filter((l) => l.trim()).length; } catch { /* none */ }
    // cadence: the earliest feature capture on the date vs the earliest first pitch
    let earliestCapture = null;
    for (const fam of ["lineup", "pitcher-workload", "team-offensive-form", "bullpen"]) {
      for (const f of lsfiles(path.join(PA, "pregame-features", fam, d))) {
        const r = readJson(path.join(PA, "pregame-features", fam, d, f));
        if (r?.capturedAt && (!earliestCapture || r.capturedAt < earliestCapture)) earliestCapture = r.capturedAt;
      }
    }
    const cadenceGap = earliestCapture && earliestStart ? earliestCapture >= earliestStart : null; // captured after the first game already started
    const hasMarkets = marketSnapshots > 0 || marketRows > 0;
    const lostOpportunity = finalGames > 0 && observations === 0; // final slate that produced nothing
    perDate.push({
      date: d, games, finalGames, marketSnapshots, marketRows, settledEligibleRows: settledEligible, observationsCreated: observations,
      earliestFirstPitch: earliestStart, earliestCapture, cadenceGap, hasMarkets, lostOpportunity,
      reason: lostOpportunity ? (!hasMarkets ? "LOST: final games but no pregame market capture (enable/verify market capture)" : "LOST: final games + markets but 0 observations (captures landed after first pitch — cadence gap)")
        : finalGames === 0 ? "not yet final — pending" : "contributed observations",
    });
  }
  const lostDays = perDate.filter((x) => x.lostOpportunity);
  const report = {
    public: false, approvedForProduction: false, productEligible: false, kind: "mlb-market-capture-reliability",
    lastUpdated: new Date().toISOString(),
    datesTracked: perDate.length,
    datesWithMarkets: perDate.filter((x) => x.hasMarkets).length,
    datesWithFinalGames: perDate.filter((x) => x.finalGames > 0).length,
    datesProducingObservations: perDate.filter((x) => x.observationsCreated > 0).length,
    lostResearchOpportunities: lostDays.length,
    cadenceGapDays: perDate.filter((x) => x.cadenceGap === true).length,
    perDate,
    note: "A LOST research opportunity is a final slate that produced 0 observations — either no pregame market capture (like 2026-07-21) or captures that landed after first pitch (cadence gap). Surfaced so an operator can restore coverage; never fabricated.",
  };
  fs.mkdirSync(STATUS, { recursive: true });
  fs.writeFileSync(path.join(STATUS, "market-capture-reliability.json"), JSON.stringify(report, null, 2));

  console.log(`\n=== MARKET-CAPTURE RELIABILITY ===`);
  for (const x of perDate) console.log(`  ${x.date}: ${x.finalGames}/${x.games} final · snaps ${x.marketSnapshots} · obs ${x.observationsCreated}${x.lostOpportunity ? "  ⚠️ LOST" : ""}${x.cadenceGap ? "  (cadence gap)" : ""}`);
  console.log(`  lost research opportunities: ${lostDays.length}  ·  cadence-gap days: ${report.cadenceGapDays}`);
  console.log(`  → data/internal/mlb/pregame-archive/status/market-capture-reliability.json`);
  process.exit(0);
}
const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();

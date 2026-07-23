/**
 * quarantine-mlb-research-eligibility.mjs — Phase 3 of the timestamp-leakage repair.
 *
 * Re-validates every committed settlement-join marketRow's INHERITED researchEligible against the join's own
 * authoritative eventStartTime (via the single canonical gate scripts/lib/research-eligibility.mjs). A row that was
 * carried as researchEligible=true but was actually captured at/after first pitch is DOWNGRADED in place
 * (researchEligible=false + eligibilityReason + countsAsSettledEligible=false) and recorded in a quarantine audit
 * artifact. Timestamps are NEVER altered — only the (incorrectly-inherited) eligibility flag is corrected, and the
 * row is KEPT as evidence. Deterministic + idempotent: a second run finds nothing new and rewrites byte-identical
 * files. Does NOT touch public boards, public results, official settlement, portfolio, Bank Builder, or Moonshot.
 *
 *   node app/scripts/quarantine-mlb-research-eligibility.mjs          # apply
 *   node app/scripts/quarantine-mlb-research-eligibility.mjs --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import { revalidateMarketEligibility } from "./lib/research-eligibility.mjs";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const JOIN_DIR = path.join(REPO, "data/internal/mlb/pregame-archive/settlement-joins");
const QUAR_DIR = path.join(REPO, "data/internal/mlb/research-quarantine");
const DRY = process.argv.includes("--dry-run");
const SETTLED = new Set(["win", "loss"]);

function main() {
  if (!fs.existsSync(JOIN_DIR)) { console.log("[quarantine] no settlement-joins present — nothing to do."); return; }
  const dates = fs.readdirSync(JOIN_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const summary = { dates: 0, joinFiles: 0, rowsScanned: 0, quarantined: 0, byReason: {}, byMarket: {}, byDate: {}, settledEligibleBefore: 0, settledEligibleAfter: 0 };
  const perDateQuarantine = {};

  for (const date of dates) {
    const jdir = path.join(JOIN_DIR, date);
    const quarantined = [];
    let touchedFiles = 0;
    for (const jf of fs.readdirSync(jdir).filter((x) => x.endsWith(".json"))) {
      const p = path.join(jdir, jf);
      const join = JSON.parse(fs.readFileSync(p, "utf8"));
      const eventStartTime = join.eventStartTime ?? null;
      let changed = false;
      for (const r of join.marketRows || []) {
        summary.rowsScanned++;
        const wasEligible = r.researchEligible === true;
        if (wasEligible && SETTLED.has(r.settlementStatus)) summary.settledEligibleBefore++;
        const reval = revalidateMarketEligibility({ inherited: r.researchEligible, capturedAt: r.capturedAt, availableAt: r.availableAt, eventStartTime });
        // only ACT on rows that were inherited-eligible but fail re-validation (the leak class); leave the rest as-is
        if (wasEligible && !reval.eligible) {
          quarantined.push({
            observationId: `${date}:${join.gamePk}:${r.market}:${r.playerId ?? r.selection ?? ""}:${r.line ?? ""}`,
            date, gamePk: join.gamePk, market: r.market, selection: r.selection ?? r.player ?? null, line: r.line ?? null,
            capturedAt: r.capturedAt ?? null, availableAt: r.availableAt ?? null, eventStartTime,
            exclusionReason: reval.quality === "POST_START_ONLY" ? "post_start_market_capture" : reval.quality === "TIMESTAMP_UNPROVEN" ? "missing_timestamp_provenance" : "invalid_event_start",
            reasonDetail: reval.reason, settlementStatus: r.settlementStatus ?? null,
            sourceArtifact: path.relative(REPO, p), detectedByGate: "revalidateMarketEligibility",
          });
          summary.quarantined++;
          summary.byReason[reval.quality] = (summary.byReason[reval.quality] || 0) + 1;
          summary.byMarket[r.market] = (summary.byMarket[r.market] || 0) + 1;
          summary.byDate[date] = (summary.byDate[date] || 0) + 1;
          // downgrade IN PLACE — timestamps untouched, row kept as evidence. A SHORT code keeps the committed
          // join under the size cap; the full reason lives in the quarantine artifact + the incident doc.
          r.researchEligible = false;
          r.ineligibleReason = reval.quality;
          r.countsAsSettledEligible = false;
          changed = true;
        }
        if (r.researchEligible === true && SETTLED.has(r.settlementStatus)) summary.settledEligibleAfter++;
      }
      summary.joinFiles++;
      if (changed) { touchedFiles++; if (!DRY) fs.writeFileSync(p, JSON.stringify(join)); }
    }
    summary.dates++;
    if (quarantined.length) {
      perDateQuarantine[date] = quarantined;
      if (!DRY) {
        fs.mkdirSync(QUAR_DIR, { recursive: true });
        const artifact = { public: false, kind: "mlb-research-eligibility-quarantine", date, notModeling: true, count: quarantined.length, rows: quarantined.sort((a, b) => a.observationId.localeCompare(b.observationId)) };
        fs.writeFileSync(path.join(QUAR_DIR, `${date}.json`), JSON.stringify(artifact, null, 2));
      }
    }
    if (quarantined.length) console.log(`  ${date}: quarantined ${quarantined.length} inherited-eligible rows (re-validated post-first-pitch) across ${touchedFiles} join file(s)`);
  }

  console.log(`\n=== ELIGIBILITY QUARANTINE ${DRY ? "(DRY RUN)" : "(APPLIED)"} ===`);
  console.log(`  dates ${summary.dates} · join files ${summary.joinFiles} · rows scanned ${summary.rowsScanned}`);
  console.log(`  quarantined ${summary.quarantined}  |  by reason ${JSON.stringify(summary.byReason)}`);
  console.log(`  by date ${JSON.stringify(summary.byDate)}`);
  console.log(`  settled-eligible before ${summary.settledEligibleBefore} → after ${summary.settledEligibleAfter}`);
  if (!DRY) console.log(`  → quarantine artifacts: data/internal/mlb/research-quarantine/<date>.json`);
  return summary;
}
main();

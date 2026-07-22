/**
 * build-mlb-research-observations.mjs — INTERNAL: assemble the leakage-safe research WAREHOUSE from the settled
 * settlement-join artifacts. This is DATA ASSEMBLY ONLY — it materializes one ResearchObservation per SETTLED,
 * pregame-researchEligible market lean by joining the official outcome (from the settlement-join) to the pregame
 * features (from the immutable freeze/snapshot). It NEVER trains a model, generates a prediction, or emits a
 * probability of its own; the only probability stored is the captured DE-VIGGED MARKET probability.
 *
 * A ResearchObservation is a future training row:
 *   { game, player, market, pregame_features, market_probability, model_inputs_available, actual_outcome,
 *     settlement_result }
 *
 * HARD RULES: reads freezes/snapshots/joins immutably; only settled (win|loss|push) leans become observations;
 * pending/ambiguous/unsupported/unavailable are NOT observations; researchEligible is copied verbatim (a settled
 * outcome can never make an ineligible pregame value eligible); official StatsAPI outcomes only.
 *
 * Pure node builtins. Output: data/internal/mlb/pregame-archive/research-observations/<date>.jsonl (internal;
 * public:false). With 0 settled rows today it emits 0 observations — it is the READY foundation, not a model.
 *
 *   node app/scripts/build-mlb-research-observations.mjs --dates 2026-07-21,2026-07-22        # dry-run
 *   node app/scripts/build-mlb-research-observations.mjs --lookback 3 --write                 # materialize
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCHIVE = path.join(REPO, "data/internal/mlb/pregame-archive");
const JOIN_DIR = path.join(ARCHIVE, "settlement-joins");
const FREEZE_DIR = path.join(ARCHIVE, "freezes");
const SNAP_DIR = path.join(ARCHIVE, "snapshots");
const OUT_DIR = path.join(ARCHIVE, "research-observations");
const SCHEMA_VERSION = "mlb-research-observation-1";
const ALL_FAMILIES = ["confirmed_lineup", "pitcher_status", "bullpen", "plate_appearance_opportunity", "environment", "umpire"];
const SETTLED = new Set(["win", "loss", "push"]);

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const sha = (s) => crypto.createHash("sha256").update(typeof s === "string" ? s : JSON.stringify(s)).digest("hex").slice(0, 16);
const isNum = (x) => typeof x === "number" && Number.isFinite(x);

// pregame family values from the freeze-referenced snapshot(s) — leakage-safe (only what the freeze marked eligible)
function pregameFeatures(date, freeze) {
  const wantIds = new Set(Object.values(freeze.featureEligibility || {}).map((f) => f.snapshotId).filter(Boolean));
  const values = {};
  const dir = path.join(SNAP_DIR, date);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((x) => x.startsWith(`${freeze.gamePk}-`) && x.endsWith(".json"))) {
      const s = readJson(path.join(dir, f));
      if (!s || !wantIds.has(s.snapshotId)) continue;
      for (const fam of s.featureFamilies || []) if (fam.researchEligible) values[fam.family] = fam.value;
    }
  }
  const eligibleFamilies = freeze.coverageSummary?.eligibleFamilies || [];
  const feats = {};
  for (const fam of eligibleFamilies) feats[fam] = values[fam] ?? null;
  return { feats, eligibleFamilies };
}

function buildObservation(date, join, freeze, row, pf, workload) {
  const isTeam = ["h2h", "spreads", "totals"].includes(row.market);
  // pitcher_workload is an ADDITIVE leakage-safe family (rest/recent-workload from strictly-earlier starts).
  const wl = workload && workload.researchEligible === true ? workload.pitchers : null;
  const missingFamilies = ALL_FAMILIES.filter((f) => !pf.eligibleFamilies.includes(f)).concat(wl ? [] : ["pitcher_workload"]);
  return {
    schemaVersion: SCHEMA_VERSION, public: false, approvedForProduction: false, productEligible: false,
    observationId: sha(`${join.gamePk}|${row.playerId ?? row.selection}|${row.market}|${row.selection}|${row.line}`),
    game: { gamePk: join.gamePk, date, homeTeam: join.teamOutcome?.homeTeam ?? null, awayTeam: join.teamOutcome?.awayTeam ?? null, eventStartTime: join.eventStartTime ?? null },
    player: isTeam ? null : { playerId: row.playerId ?? null, name: row.player ?? null },
    market: { key: row.market, kind: isTeam ? "team" : "player", selection: row.selection, line: isNum(row.line) ? row.line : null },
    pregame_features: { ...pf.feats, ...(wl ? { pitcher_workload: wl } : {}) },
    market_probability: { impliedProbability: null, noVigProbability: isNum(row.noVigProbability) ? row.noVigProbability : null, capturedAt: row.capturedAt ?? null, researchEligible: row.researchEligible === true },
    model_inputs_available: {
      eligibleFamilies: pf.eligibleFamilies.concat(wl ? ["pitcher_workload"] : []), missingFamilies,
      hasDeVigMarketProbability: isNum(row.noVigProbability), hasLineupContext: pf.eligibleFamilies.includes("confirmed_lineup"),
      hasPitcherContext: pf.eligibleFamilies.includes("pitcher_status"), hasEnvironmentContext: pf.eligibleFamilies.includes("environment"),
      hasPitcherWorkload: !!wl,
    },
    actual_outcome: { actual: isNum(row.actual) ? row.actual : null, source: "MLB Stats API (official)", finalStatus: join.gameFinalStatus?.detailedState ?? null, teamOutcome: isTeam ? { homeRuns: join.teamOutcome?.homeRuns ?? null, awayRuns: join.teamOutcome?.awayRuns ?? null } : undefined },
    settlement_result: { status: row.settlementStatus, line: isNum(row.line) ? row.line : null, countsAsSettledEligible: row.countsAsSettledEligible === true },
    provenance: { freezeHash: join.freezeHash ?? null, sourceSnapshotIds: join.sourceSnapshotIds ?? [], officialSource: join.officialSource?.endpoint ?? null, joinCreatedAt: join.createdAt ?? null },
  };
}

function main() {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--write");
  const idx = (k) => args.indexOf(k);
  let dates;
  if (idx("--dates") >= 0) dates = args[idx("--dates") + 1].split(",").map((s) => s.trim()).filter(Boolean);
  else if (fs.existsSync(JOIN_DIR)) {
    const all = fs.readdirSync(JOIN_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    dates = idx("--lookback") >= 0 ? all.slice(-(parseInt(args[idx("--lookback") + 1], 10) + 1)) : all;
  } else dates = [];

  const summary = { dates: [], observations: 0, settledEligible: 0, byMarket: {}, byOutcome: { win: 0, loss: 0, push: 0 }, ineligibleObservations: 0 };
  for (const date of dates) {
    const jdir = path.join(JOIN_DIR, date);
    if (!fs.existsSync(jdir)) continue;
    const rows = [];
    for (const jf of fs.readdirSync(jdir).filter((x) => x.endsWith(".json"))) {
      const join = readJson(path.join(jdir, jf));
      if (!join) continue;
      const freeze = readJson(path.join(FREEZE_DIR, date, `${join.gamePk}.json`));
      if (!freeze) continue;
      const pf = pregameFeatures(date, freeze);
      const workload = readJson(path.join(ARCHIVE, "pregame-features", "pitcher-workload", date, `${join.gamePk}.json`));
      for (const row of join.marketRows || []) {
        if (!SETTLED.has(row.settlementStatus)) continue; // only settled leans become observations; pending never
        const obs = buildObservation(date, join, freeze, row, pf, workload);
        rows.push(obs);
        summary.byMarket[row.market] = (summary.byMarket[row.market] || 0) + 1;
        summary.byOutcome[row.settlementStatus] = (summary.byOutcome[row.settlementStatus] || 0) + 1;
        if (obs.settlement_result.countsAsSettledEligible) summary.settledEligible++;
        if (row.researchEligible !== true) summary.ineligibleObservations++;
      }
    }
    summary.dates.push(date);
    summary.observations += rows.length;
    if (WRITE && rows.length) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      // deterministic order (observationId) so re-runs are idempotent
      rows.sort((a, b) => a.observationId.localeCompare(b.observationId));
      fs.writeFileSync(path.join(OUT_DIR, `${date}.jsonl`), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    }
    console.log(`[obs] ${date}: settled leans → ${rows.length} observations (settled-eligible ${rows.filter((r) => r.settlement_result.countsAsSettledEligible).length})${WRITE ? " · wrote" : " · dry-run"}`);
  }
  console.log(`\n[obs] ${WRITE ? "WROTE" : "DRY-RUN"} · dates ${summary.dates.join(",")} · TOTAL observations ${summary.observations} (settled-eligible ${summary.settledEligible}) · byOutcome ${JSON.stringify(summary.byOutcome)} · byMarket ${JSON.stringify(summary.byMarket)}`);
  if (summary.observations === 0) console.log(`[obs] 0 observations — expected until a market-capture date is FINAL (settled research rows accrue only from graded, pregame-eligible leans). The warehouse is READY.`);
  return summary;
}

export { buildObservation, pregameFeatures };
const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();

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

// latest pregame-eligible lineup snapshot for a game (the closest-to-first-pitch confirmed order).
function latestEligibleLineup(featDir, date, gamePk) {
  const dir = path.join(featDir, "lineup", date);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(`${gamePk}-`) && f.endsWith(".json")).sort();
  for (let i = files.length - 1; i >= 0; i--) { const r = readJson(path.join(dir, files[i])); if (r && r.researchEligible) return r; }
  return null;
}

function buildObservation(date, join, freeze, row, pf, features = {}) {
  const isTeam = ["h2h", "spreads", "totals"].includes(row.market);
  // ADDITIVE leakage-safe families — attached ONLY when their record exists AND is researchEligible.
  const elig = (r) => (r && r.researchEligible === true ? r : null);
  const wl = elig(features.workload) ? features.workload.pitchers : null;
  const lu = elig(features.lineup) ? { home: features.lineup.home, away: features.lineup.away, window: features.lineup.window } : null;
  const bp = elig(features.bullpen) ? { home: features.bullpen.home, away: features.bullpen.away } : null;
  const mu = elig(features.matchup) ? { homeStartingPitcher: features.matchup.homeStartingPitcher, awayStartingPitcher: features.matchup.awayStartingPitcher, homeBatters: features.matchup.homeBatters, awayBatters: features.matchup.awayBatters } : null;
  const pk = elig(features.park) ? { venue: features.park.venue, factors: features.park.factors } : null;
  // batter families are per-player — attached only for the batter this observation is about (matching playerId).
  const bsp = elig(features.splits) && features.splits.playerId === row.playerId ? { season: features.splits.seasonSplits, previousSeason: features.splits.previousSeason } : null;
  const bfm = elig(features.form) && features.form.playerId === row.playerId ? { last7: features.form.last7, last30: features.form.last30 } : null;
  const bvp = elig(features.vsPitcher) && features.vsPitcher.playerId === row.playerId ? { opposingStarter: features.vsPitcher.opposingStarter, headToHead: features.vsPitcher.headToHead, sufficientSample: features.vsPitcher.sufficientSample } : null;
  const pao = elig(features.paOpp) && features.paOpp.playerId === row.playerId ? { battingOrderSlot: features.paOpp.battingOrderSlot, projectedPA: features.paOpp.projectedPA, historicalPaPerGame: features.paOpp.historicalPaPerGame } : null;
  const allFams = { pitcher_workload: wl, confirmed_lineup: lu, bullpen_availability: bp, batter_matchup: mu, park_factors: pk, batter_splits: bsp, batter_form: bfm, batter_vs_pitcher: bvp, plate_appearance_opportunity: pao };
  const missingFamilies = Object.keys(allFams).filter((f) => allFams[f] == null);
  // deterministic per-observation feature coverage (drives future confidence; safe to compute now)
  const featureCoverage = { pitcherStatus: pf.eligibleFamilies.includes("pitcher_status"), pitcherWorkload: !!wl, lineup: !!lu, bullpen: !!bp, matchup: !!mu, batterSplits: !!bsp, batterForm: !!bfm, batterVsPitcher: !!bvp, paOpportunity: !!pao, park: !!pk, environment: pf.eligibleFamilies.includes("environment"), market: isNum(row.noVigProbability) };
  const coverageScore = +(Object.values(featureCoverage).filter(Boolean).length / Object.keys(featureCoverage).length).toFixed(3);
  return {
    schemaVersion: SCHEMA_VERSION, public: false, approvedForProduction: false, productEligible: false,
    observationId: sha(`${join.gamePk}|${row.playerId ?? row.selection}|${row.market}|${row.selection}|${row.line}`),
    game: { gamePk: join.gamePk, date, homeTeam: join.teamOutcome?.homeTeam ?? null, awayTeam: join.teamOutcome?.awayTeam ?? null, eventStartTime: join.eventStartTime ?? null },
    player: isTeam ? null : { playerId: row.playerId ?? null, name: row.player ?? null },
    market: { key: row.market, kind: isTeam ? "team" : "player", selection: row.selection, line: isNum(row.line) ? row.line : null },
    pregame_features: { ...pf.feats, ...Object.fromEntries(Object.entries(allFams).filter(([, v]) => v != null)) },
    market_probability: { impliedProbability: null, noVigProbability: isNum(row.noVigProbability) ? row.noVigProbability : null, capturedAt: row.capturedAt ?? null, researchEligible: row.researchEligible === true },
    model_inputs_available: {
      eligibleFamilies: pf.eligibleFamilies.concat(Object.keys(allFams).filter((f) => allFams[f] != null)), missingFamilies,
      hasDeVigMarketProbability: isNum(row.noVigProbability),
      hasPitcherContext: pf.eligibleFamilies.includes("pitcher_status"), hasEnvironmentContext: pf.eligibleFamilies.includes("environment"),
      hasPitcherWorkload: !!wl, hasLineup: !!lu, hasBullpen: !!bp, hasMatchup: !!mu, hasParkFactors: !!pk, hasBatterSplits: !!bsp, hasBatterForm: !!bfm, hasBatterVsPitcher: !!bvp, hasPaOpportunity: !!pao,
    },
    featureCoverage, coverageScore, missingFeatureList: missingFamilies, captureTimestamp: join.createdAt ?? null,
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
    // per-date per-player batter feature maps (splits/form are one file per playerId)
    const loadBatterMap = (fam) => { const m = new Map(); const d = path.join(ARCHIVE, "pregame-features", fam, date); if (fs.existsSync(d)) for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".json"))) { const r = readJson(path.join(d, f)); if (r?.playerId != null) m.set(r.playerId, r); } return m; };
    const splitsMap = loadBatterMap("batter-splits");
    const formMap = loadBatterMap("batter-form");
    const bvpMap = loadBatterMap("batter-vs-pitcher");
    const paoMap = loadBatterMap("pa-opportunity");
    const rows = [];
    for (const jf of fs.readdirSync(jdir).filter((x) => x.endsWith(".json"))) {
      const join = readJson(path.join(jdir, jf));
      if (!join) continue;
      const freeze = readJson(path.join(FREEZE_DIR, date, `${join.gamePk}.json`));
      if (!freeze) continue;
      const pf = pregameFeatures(date, freeze);
      const feat = path.join(ARCHIVE, "pregame-features");
      const features = {
        workload: readJson(path.join(feat, "pitcher-workload", date, `${join.gamePk}.json`)),
        bullpen: readJson(path.join(feat, "bullpen", date, `${join.gamePk}.json`)),
        matchup: readJson(path.join(feat, "matchup", date, `${join.gamePk}.json`)),
        lineup: latestEligibleLineup(feat, date, join.gamePk),
        park: readJson(path.join(feat, "park-factors", date, `${join.gamePk}.json`)),
      };
      for (const row of join.marketRows || []) {
        if (!SETTLED.has(row.settlementStatus)) continue; // only settled leans become observations; pending never
        // per-player batter families resolved by the row's playerId
        const rowFeatures = { ...features, splits: row.playerId != null ? splitsMap.get(row.playerId) : null, form: row.playerId != null ? formMap.get(row.playerId) : null, vsPitcher: row.playerId != null ? bvpMap.get(row.playerId) : null, paOpp: row.playerId != null ? paoMap.get(row.playerId) : null };
        const obs = buildObservation(date, join, freeze, row, pf, rowFeatures);
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

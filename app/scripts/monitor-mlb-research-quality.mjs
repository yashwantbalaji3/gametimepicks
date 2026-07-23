/**
 * monitor-mlb-research-quality.mjs — INTERNAL data-quality monitor for the MLB pregame research warehouse.
 *
 * Scans the settlement-join artifacts + freezes and reports data-quality signals so the future training set can
 * be trusted. NO modeling, NO predictions, NO public output. Writes data/internal/mlb/pregame-archive/status/
 * research-quality.json (public:false).
 *
 * Checks: duplicate rows · missing outcomes (a FINAL game with an ungraded market row) · impossible stats
 * (out-of-range official values) · timestamp violations (researchEligible with capturedAt ≥ first pitch = leakage)
 * · stale odds (freshest lean captured far before first pitch) · join failures (freeze without a join / no official
 * source). Each check is PASS / WARN / FAIL; FAIL means the warehouse is not yet trustworthy for that signal.
 *
 *   node app/scripts/monitor-mlb-research-quality.mjs
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCHIVE = path.join(REPO, "data/internal/mlb/pregame-archive");
const JOIN_DIR = path.join(ARCHIVE, "settlement-joins");
const FREEZE_DIR = path.join(ARCHIVE, "freezes");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const isNum = (x) => typeof x === "number" && Number.isFinite(x);

// generous sanity bounds per market — meant to catch PARSING errors (negative / absurd), not real outliers.
const MAX_BY_MARKET = { pitcher_outs: 60, pitcher_strikeouts: 30, pitcher_earned_runs: 30, batter_hits: 10, batter_total_bases: 20, batter_home_runs: 6, batter_rbis: 15, batter_runs_scored: 8, batter_hits_runs_rbis: 30, totals: 60, spreads: 60, h2h: 60 };
const STALE_HOURS = 26; // freshest lean captured > this many hours before first pitch ⇒ WARN (never refreshed near game)

export function auditQuality(joinDir = JOIN_DIR, freezeDir = FREEZE_DIR, featureDir = path.join(ARCHIVE, "pregame-features")) {
  const dates = fs.existsSync(joinDir) ? fs.readdirSync(joinDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort() : [];
  const q = {
    duplicateRows: [], missingOutcomes: [], impossibleStats: [], timestampViolations: [], staleOdds: [], joinFailures: [],
    scanned: { dates: dates.length, joinFiles: 0, marketRows: 0, settledRows: 0, contextualRows: 0 },
  };
  for (const date of dates) {
    const jdir = path.join(joinDir, date);
    // join failures: a freeze with no join file
    const fdir = path.join(freezeDir, date);
    if (fs.existsSync(fdir)) {
      for (const ff of fs.readdirSync(fdir).filter((x) => x.endsWith(".json"))) {
        if (!fs.existsSync(path.join(jdir, ff))) q.joinFailures.push({ date, gamePk: ff.replace(".json", ""), reason: "freeze has no settlement-join file" });
      }
    }
    for (const jf of fs.readdirSync(jdir).filter((x) => x.endsWith(".json"))) {
      const join = readJson(path.join(jdir, jf));
      if (!join) { q.joinFailures.push({ date, file: jf, reason: "join file unreadable" }); continue; }
      q.scanned.joinFiles++;
      q.scanned.contextualRows += (join.contextualRows || []).length;
      if (!join.officialSource || !/statsapi\.mlb\.com/.test(join.officialSource.endpoint || "")) q.joinFailures.push({ date, gamePk: join.gamePk, reason: "missing/non-official source" });
      const eventStart = join.eventStartTime ? Date.parse(join.eventStartTime) : null;
      const isFinal = join.gameFinalStatus?.isFinal === true;
      const seen = new Set();
      let freshestByGame = null;
      for (const r of join.marketRows || []) {
        q.scanned.marketRows++;
        const key = `${join.gamePk}|${r.playerId ?? r.selection}|${r.market}|${r.selection}|${r.line}`;
        if (seen.has(key)) q.duplicateRows.push({ date, gamePk: join.gamePk, key }); else seen.add(key);
        // missing outcome: a FINAL game whose market row is still pending
        if (isFinal && r.settlementStatus === "pending") q.missingOutcomes.push({ date, gamePk: join.gamePk, market: r.market, player: r.player ?? r.selection });
        // impossible official stat (only for settled decisive/push rows that carry an actual). spreads (run line)
        // settle on a SIGNED run margin — a negative actual (the team lost by N) is legitimate — so those are bounded
        // by magnitude, not floored at 0. All other markets are non-negative counts (K, hits, TB, combined runs…).
        if ((r.settlementStatus === "win" || r.settlementStatus === "loss" || r.settlementStatus === "push") && isNum(r.actual)) {
          q.scanned.settledRows++;
          const max = MAX_BY_MARKET[r.market] ?? 100;
          const signedMargin = r.market === "spreads"; // signed run-line margin (can be negative)
          const bad = signedMargin ? Math.abs(r.actual) > max : r.actual < 0 || r.actual > max;
          if (bad) q.impossibleStats.push({ date, gamePk: join.gamePk, market: r.market, actual: r.actual, allowedMax: max, signedMargin });
        }
        // timestamp violation: a researchEligible lean captured at/after first pitch = leakage
        if (r.researchEligible === true && r.capturedAt && eventStart && Date.parse(r.capturedAt) >= eventStart) {
          q.timestampViolations.push({ date, gamePk: join.gamePk, market: r.market, capturedAt: r.capturedAt, eventStartTime: join.eventStartTime });
        }
        if (r.capturedAt && (!freshestByGame || r.capturedAt > freshestByGame)) freshestByGame = r.capturedAt;
      }
      // stale odds: the freshest lean is captured > STALE_HOURS before first pitch (never refreshed near game)
      if (freshestByGame && eventStart) {
        const hrs = (eventStart - Date.parse(freshestByGame)) / 3.6e6;
        if (hrs > STALE_HOURS) q.staleOdds.push({ date, gamePk: join.gamePk, freshestCapturedAt: freshestByGame, hoursBeforeFirstPitch: +hrs.toFixed(1) });
      }
      // contextual timestamp leakage guard (researchEligible contextual rows must be pregame — freeze already
      // guarantees this; we re-assert nothing postgame leaked into a "researchEligible" flag)
      for (const c of join.contextualRows || []) if (c.researchEligible === true && c.capturedAt && eventStart && Date.parse(c.capturedAt) >= eventStart) q.timestampViolations.push({ date, gamePk: join.gamePk, family: c.family, capturedAt: c.capturedAt });
    }
  }
  // ── pregame-feature families (pitcher_workload / confirmed_lineup / bullpen_availability / batter_matchup):
  //    every record must carry a capturedAt; a researchEligible record must be captured before first pitch; and
  //    each family's source data must be strictly earlier than the slate (no postgame/same-day leakage). ──
  q.missingTimestamps = [];
  q.duplicateFeatures = [];
  q.scanned.featureRecords = {};
  const FEAT = featureDir;
  const rateBad = (r, lo, hi) => r != null && Number.isFinite(r) && (r < lo || r > hi);
  for (const fam of ["pitcher-workload", "bullpen", "matchup", "lineup", "batter-splits", "batter-form", "park-factors", "batter-vs-pitcher", "pa-opportunity"]) {
    const base = path.join(FEAT, fam);
    q.scanned.featureRecords[fam] = 0;
    if (!fs.existsSync(base)) continue;
    // dedup granularity: per-GAME families are 1 record per gamePk; per-PLAYER families 1 per playerId. lineup AND
    // pitcher-workload are MULTI-CADENCE (append-only, timestamped, many legitimate captures per game across windows),
    // so for those a "duplicate" is only two records sharing the SAME capturedAt (a true double-write) — distinct
    // capture windows are keyed by (key@capturedAt) and are never flagged. (pitcher-workload became multi-cadence in
    // a later capture-reliability fix; the old naive per-gamePk key false-flagged every second-window capture.)
    const perPlayer = fam === "batter-splits" || fam === "batter-form" || fam === "batter-vs-pitcher" || fam === "pa-opportunity";
    const multiCadence = fam === "lineup" || fam === "pitcher-workload";
    for (const date of fs.readdirSync(base).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
      const seen = {};
      for (const f of fs.readdirSync(path.join(base, date)).filter((x) => x.endsWith(".json"))) {
        const r = readJson(path.join(base, date, f));
        if (!r) { q.joinFailures.push({ date, file: `${fam}/${f}`, reason: "feature record unreadable" }); continue; }
        q.scanned.featureRecords[fam]++;
        if (!r.capturedAt) q.missingTimestamps.push({ date, family: fam, gamePk: r.gamePk, playerId: r.playerId });
        { const baseKey = perPlayer ? r.playerId : r.gamePk; const key = multiCadence ? `${baseKey}@${r.capturedAt}` : baseKey; seen[key] = (seen[key] || 0) + 1; if (seen[key] > 1) q.duplicateFeatures.push({ date, family: fam, key }); }
        if (r.researchEligible !== true) continue;
        const es = r.eventStartTime ? Date.parse(r.eventStartTime) : null;
        if (r.capturedAt && es && Date.parse(r.capturedAt) >= es) q.timestampViolations.push({ date, gamePk: r.gamePk, family: fam, capturedAt: r.capturedAt });
        // family-specific leakage checks
        if (fam === "pitcher-workload") for (const s of ["home", "away"]) { const p = r.pitchers?.[s]; if (p?.lastStartDate && p.lastStartDate >= date) q.timestampViolations.push({ date, gamePk: r.gamePk, family: fam, side: s, reason: "source start not strictly earlier than slate" }); }
        if (fam === "bullpen") for (const wd of r.windowDates || []) if (wd >= date) q.timestampViolations.push({ date, gamePk: r.gamePk, family: fam, windowDate: wd, reason: "bullpen source date not strictly earlier than slate" });
        if (fam === "lineup" && r.window === "postgame") q.timestampViolations.push({ date, gamePk: r.gamePk, family: fam, reason: "postgame lineup marked eligible" });
        if (fam === "batter-form" && r.last30?.lastDate && r.last30.lastDate >= date) q.timestampViolations.push({ date, playerId: r.playerId, family: fam, lastDate: r.last30.lastDate, reason: "form source game not strictly earlier than slate" });
        // impossible official-stat guards for the batter families (parse-error catch, not outlier rejection)
        if (fam === "batter-splits") for (const s of [r.seasonSplits?.vsRHP, r.seasonSplits?.vsLHP]) if (s && (rateBad(s.avg, 0, 1) || rateBad(s.obp, 0, 1) || rateBad(s.slg, 0, 5) || rateBad(s.ops, 0, 6) || rateBad(s.kPct, 0, 100) || rateBad(s.bbPct, 0, 100))) q.impossibleStats.push({ date, playerId: r.playerId, family: fam, split: JSON.stringify(s) });
        if (fam === "batter-form") for (const w of [r.last7, r.last30]) if (w && (w.h > w.pa || w.tb < w.h || w.h < 0 || w.k > w.pa)) q.impossibleStats.push({ date, playerId: r.playerId, family: fam, window: JSON.stringify(w) });
      }
    }
  }

  const verdict = (arr, warnOnly = false) => (arr.length === 0 ? "PASS" : warnOnly ? "WARN" : "FAIL");
  const checks = {
    duplicateRows: { count: q.duplicateRows.length, verdict: verdict(q.duplicateRows) },
    missingOutcomes: { count: q.missingOutcomes.length, verdict: verdict(q.missingOutcomes) },
    impossibleStats: { count: q.impossibleStats.length, verdict: verdict(q.impossibleStats) },
    timestampViolations: { count: q.timestampViolations.length, verdict: verdict(q.timestampViolations) },
    staleOdds: { count: q.staleOdds.length, verdict: verdict(q.staleOdds, true) },
    joinFailures: { count: q.joinFailures.length, verdict: verdict(q.joinFailures, true) },
    missingTimestamps: { count: q.missingTimestamps.length, verdict: verdict(q.missingTimestamps) },
    duplicateFeatures: { count: q.duplicateFeatures.length, verdict: verdict(q.duplicateFeatures) },
  };
  const anyFail = Object.values(checks).some((c) => c.verdict === "FAIL");
  return { public: false, approvedForProduction: false, productEligible: false, kind: "mlb-research-quality", scanned: q.scanned, checks, overall: anyFail ? "FAIL" : "PASS", details: q };
}

function main() {
  const report = auditQuality();
  fs.mkdirSync(path.join(ARCHIVE, "status"), { recursive: true });
  fs.writeFileSync(path.join(ARCHIVE, "status", "research-quality.json"), JSON.stringify(report, null, 2));
  console.log(`\n=== MLB research-warehouse DATA QUALITY ===`);
  console.log(`scanned: ${report.scanned.dates} dates · ${report.scanned.joinFiles} join files · ${report.scanned.marketRows} market rows (${report.scanned.settledRows} settled) · ${report.scanned.contextualRows} contextual · features ${JSON.stringify(report.scanned.featureRecords || {})}`);
  for (const [k, c] of Object.entries(report.checks)) console.log(`  ${c.verdict === "PASS" ? "✓" : c.verdict === "WARN" ? "▲" : "✗"} ${k}: ${c.verdict}${c.count ? ` (${c.count})` : ""}`);
  console.log(`OVERALL: ${report.overall}`);
  console.log(`report → ${path.relative(REPO, path.join(ARCHIVE, "status", "research-quality.json"))}`);
}
const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();

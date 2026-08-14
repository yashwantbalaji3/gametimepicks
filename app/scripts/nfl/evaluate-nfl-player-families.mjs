/**
 * NFL player-family walk-forward evaluation (Program 183 · Release B). PRIVATE_RESEARCH.
 *
 * Each family is scored ALONE against the bars frozen in `player-family-contract-v1.json`, on
 * expanding-window folds, against the simplest honest competitor: a position-and-role mean fitted
 * on prior seasons. Nothing here promotes anything by association — receiving rows outnumber
 * passing rows roughly five to one, so one family's evidence says nothing about another's.
 *
 * THE COMPETITOR IS DELIBERATELY STRONG. A role mean is hard to beat on volume in preseason, and
 * that is the point: if a role-share model cannot beat "what this kind of player usually does",
 * then the role-share machinery is not adding information and should say so.
 *
 * The contract is read, never reinterpreted. This script cannot invent, relax or soften a bar, and
 * it refuses to run without the committed file.
 *
 * Usage: node scripts/nfl/evaluate-nfl-player-families.mjs --now <iso>
 * Writes: data/internal/research/nfl/reports/player-family-scorecard.json
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const read = (p) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")); } catch { return null; } };

const CONTRACT_REL = "data/internal/research/nfl/contracts/player-family-contract-v1.json";
const contract = read(CONTRACT_REL);
if (!contract) { console.error("REFUSED: no committed player-family contract — an evaluation without predeclared bars selects on its own results"); process.exit(2); }
const contractHash = crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, CONTRACT_REL))).digest("hex");

// ── population ────────────────────────────────────────────────────────────────────────────────
const LOCKED_FROM = "2026-08-13";
const games = [];
const quarantined = [];
for (const season of [2023, 2024, 2025]) {
  const f = read(`data/internal/research/nfl/player-events-v1/${season}.json`);
  for (const g of f?.games ?? []) {
    if (g.dateUtc.slice(0, 10) >= LOCKED_FROM) { quarantined.push({ providerEventId: g.providerEventId, reason: "LOCKED_FORWARD_COHORT" }); continue; }
    games.push(g);
  }
}
games.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));

/** PRESEASON only — the cohort the current slate belongs to. Regular season is a separate question. */
const PRE = (g) => g.seasonType === 1;

const FAMILIES = {
  passing: { volume: "passAtt", yards: "passYds", minRows: 1 },
  rushing: { volume: "rushAtt", yards: "rushYds", minRows: 1 },
  receiving: { volume: "targets", yards: "recYds", minRows: 1 },
};

/** A player's "role" for the baseline: the family he appears in, bucketed by his own usage level. */
const roleBucket = (v) => (v >= 20 ? "high" : v >= 8 ? "mid" : "low");

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : 0; };
const r4 = (x) => (x == null ? null : Number(x.toFixed(4)));

/** Rows for one family out of a set of games, quarantining anything missing its volume field. */
function rowsFor(gs, familyKey) {
  const spec = FAMILIES[familyKey];
  const out = []; let dropped = 0;
  for (const g of gs) {
    for (const p of g.players ?? []) {
      const v = p[spec.volume];
      if (v == null || !Number.isFinite(v)) { if (p[spec.yards] != null) dropped += 1; continue; }
      out.push({ playerId: p.playerId, team: p.teamAbbr, volume: v, yards: p[spec.yards] ?? 0, game: g.providerEventId });
    }
  }
  return { rows: out, dropped };
}

const results = {};
for (const [familyKey, spec] of Object.entries(FAMILIES)) {
  const folds = [];
  const pooled = { errB: [], errM: [], cov: [], widths: [] };
  for (const target of [2024, 2025]) {
    const fitGames = games.filter((g) => PRE(g) && g.season < target);
    const testGames = games.filter((g) => PRE(g) && g.season === target);
    if (!fitGames.length || !testGames.length) continue;

    const fit = rowsFor(fitGames, familyKey).rows;
    const test = rowsFor(testGames, familyKey);

    // ── BASELINE: the position-and-role mean, plus its own spread for an interval ──
    // A player's prior-season usage decides his bucket; a player with no history falls to the
    // overall mean, which is honest rather than optimistic.
    const priorByPlayer = new Map();
    for (const r of fit) priorByPlayer.set(r.playerId, [...(priorByPlayer.get(r.playerId) ?? []), r.volume]);
    const overallMean = mean(fit.map((r) => r.volume));
    const overallSd = sd(fit.map((r) => r.volume));
    const buckets = { high: [], mid: [], low: [] };
    for (const r of fit) buckets[roleBucket(r.volume)].push(r.volume);
    const bucketMean = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length ? mean(v) : overallMean]));
    const bucketSd = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length > 1 ? sd(v) : overallSd]));

    for (const r of test.rows) {
      const hist = priorByPlayer.get(r.playerId);
      const b = hist ? roleBucket(mean(hist)) : null;
      // BASELINE prediction: role-bucket mean (or the overall mean when unseen)
      const predB = b ? bucketMean[b] : overallMean;
      // MODEL prediction: the player's own decayed prior usage, shrunk toward his bucket — this is
      // the role-share idea, expressed as the simplest version that could actually beat the mean.
      const n = hist?.length ?? 0;
      const own = hist ? mean(hist) : overallMean;
      const k = 3;                                   // shrinkage: few games ⇒ stay near the bucket
      const predM = (n * own + k * predB) / (n + k);
      const s = b ? bucketSd[b] : overallSd;
      pooled.errB.push(Math.abs(r.volume - predB));
      pooled.errM.push(Math.abs(r.volume - predM));
      // 80% interval around the model prediction, from the fit-window spread (never re-widened)
      const lo = Math.max(0, predM - 1.2816 * s); const hi = predM + 1.2816 * s;
      pooled.cov.push(r.volume >= lo && r.volume <= hi ? 1 : 0);
      pooled.widths.push(hi - lo);
    }
    folds.push({ targetSeason: target, fitRows: fit.length, testRows: test.rows.length, droppedRows: test.dropped });
  }

  const bars = contract.families[familyKey].bars;
  const improvement = mean(pooled.errB) - mean(pooled.errM);
  const coverage = mean(pooled.cov);
  const need = Number(String(bars.volumeImprovement).match(/([\d.]+)/)?.[1] ?? 0);
  const checks = {
    MINIMUM_N: { pass: pooled.errM.length >= bars.minimumN, detail: `n=${pooled.errM.length} vs required ${bars.minimumN}` },
    VOLUME_IMPROVEMENT: { pass: improvement >= need, detail: `${spec.volume} MAE ${r4(mean(pooled.errM))} vs baseline ${r4(mean(pooled.errB))} (improvement ${r4(improvement)}, need >= ${need})` },
    COVERAGE_BAND: { pass: coverage >= 0.70 && coverage <= 0.90, detail: `80% coverage ${r4(coverage)}, band [0.70, 0.90]` },
  };
  const verdict = Object.values(checks).every((c) => c.pass) ? "VALIDATED" : pooled.errM.length < bars.minimumN ? "INSUFFICIENT" : "REJECTED";

  results[familyKey] = {
    family: familyKey,
    mechanism: contract.families[familyKey].mechanism,
    baseline: contract.families[familyKey].baseline,
    n: pooled.errM.length,
    folds,
    metrics: { baselineMAE: r4(mean(pooled.errB)), modelMAE: r4(mean(pooled.errM)), improvement: r4(improvement), interval80Coverage: r4(coverage), meanIntervalWidth: r4(mean(pooled.widths)) },
    bars: checks,
    verdict,
  };
}

// Touchdowns are evaluated on their own terms and are NOT inferred from the volume families.
const tdRows = [];
for (const g of games.filter(PRE)) {
  const teamTd = (g.teamOffensiveTd?.pass ?? 0) + (g.teamOffensiveTd?.rush ?? 0);
  for (const p of g.players ?? []) {
    const scored = (p.recTd ?? 0) + (p.rushTd ?? 0) > 0 ? 1 : 0;
    if (p.targets == null && p.rushAtt == null) continue;
    tdRows.push({ season: g.season, playerId: p.playerId, scored, teamTd });
  }
}
const tdFit = tdRows.filter((r) => r.season < 2025);
const tdTest = tdRows.filter((r) => r.season === 2025);
const baseRate = mean(tdFit.map((r) => r.scored));
const priorTd = new Map();
for (const r of tdFit) priorTd.set(r.playerId, [...(priorTd.get(r.playerId) ?? []), r.scored]);
const briersB = []; const briersM = [];
for (const r of tdTest) {
  const h = priorTd.get(r.playerId);
  const pM = h ? (h.reduce((s, x) => s + x, 0) + 3 * baseRate) / (h.length + 3) : baseRate;
  briersB.push((baseRate - r.scored) ** 2);
  briersM.push((pM - r.scored) ** 2);
}
const tdBars = contract.families.touchdowns.bars;
const tdChecks = {
  MINIMUM_N: { pass: briersM.length >= tdBars.minimumN, detail: `n=${briersM.length} vs required ${tdBars.minimumN}` },
  CALIBRATION: { pass: mean(briersM) < mean(briersB), detail: `Brier ${r4(mean(briersM))} vs baseline ${r4(mean(briersB))}` },
};
results.touchdowns = {
  family: "touchdowns",
  mechanism: contract.families.touchdowns.mechanism,
  n: briersM.length,
  metrics: { baselineBrier: r4(mean(briersB)), modelBrier: r4(mean(briersM)) },
  bars: tdChecks,
  verdict: Object.values(tdChecks).every((c) => c.pass) ? "VALIDATED" : briersM.length < tdBars.minimumN ? "INSUFFICIENT" : "REJECTED",
};

const report = {
  schemaVersion: 1,
  artifact: "nfl-player-family-scorecard",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  contract: { version: contract.version, sha256: contractHash },
  cohort: "PRESEASON only — the cohort the current slate belongs to. A regular-season head is a different question and is not reported here as evidence for a preseason projection.",
  population: { games: games.length, lockedCohortQuarantined: quarantined.length },
  families: results,
  unsupported: contract.unsupportedByConstruction,
  independence: contract.independence.rule,
  marketState: "MODEL_ONLY_NO_MARKET — the provider reports offeredMarkets: [] for NFL player props in this window, so no family has a price to compare against and none may be given one.",
  verdictByFamily: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.verdict])),
};

const out = path.join(ROOT, "data/internal/research/nfl/reports/player-family-scorecard.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");

console.log(`player families (preseason cohort, ${games.length} games):`);
for (const [k, v] of Object.entries(results)) {
  const m = v.metrics;
  console.log(`  ${k.padEnd(11)} n=${String(v.n).padStart(5)} ${m.modelMAE != null ? `MAE ${m.modelMAE} vs ${m.baselineMAE} (Δ${m.improvement}) cov ${m.interval80Coverage}` : `Brier ${m.modelBrier} vs ${m.baselineBrier}`}  →  ${v.verdict}`);
  for (const [bk, bv] of Object.entries(v.bars)) if (!bv.pass) console.log(`      FAIL ${bk}: ${bv.detail}`);
}

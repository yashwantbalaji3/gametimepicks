#!/usr/bin/env node
/**
 * P248 · Release B — pass-yds-baseline-v1, evaluated EXACTLY as preregistered
 * (pass-baseline-candidate-preregistration.json, committed first).
 *
 * The candidate IS the baseline that beat the simulation chain, given a distribution:
 *   center  mu = qbShare_wf · (a0 + a1·E[ownMargin]) · league.compRate · league.ypcmp
 *   spread  TRAIN (2023-24) walk-forward residual quantiles, pooled in three share buckets
 *           frozen in the preregistration (>=0.7 / 0.2-0.7 / <0.2), floored at 0.
 * Every input is forecast-time: walk-forward share (the props evaluator's own share params),
 * committed volume/league constants, margin mean from the committed game-sim heads at an Elo
 * cutoff strictly before kickoff. Population contract v2 decides who is scored (played),
 * voided (DNP) or excluded (ambiguous/source-missing) — same as every family.
 *
 * Champion comparison is on IDENTICAL points: the evaluator's per-point diagnostics dump
 * (participation-true) is joined by (gameId, playerId); a point missing from either side is
 * reported, never silently dropped into a different denominator.
 *
 * Usage: node scripts/nfl/backtest-pass-baseline.mjs --now <iso> --champion-dump <points.jsonl>
 * Writes: data/internal/research/nfl/reports/pass-baseline-evaluation.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SHARE_FAMILIES, familyNumerator, teamGameTotals, decayedShare } from "../../src/lib/sports/nfl/role-shares.mjs";
import { strengthStateAt } from "../../src/lib/sports/nfl/model-v1.mjs";
import { classifyParticipation, outcomeForAbsentCandidate, newPopulationAccounting, POPULATION_CONTRACT_VERSION } from "../../src/lib/sports/nfl/participation-truth.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const NOW = arg("--now");
const DUMP = arg("--champion-dump");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
if (!DUMP || !fs.existsSync(DUMP)) { console.error("REFUSED: --champion-dump <points.jsonl> required for identical-points comparison"); process.exit(1); }

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const props = read(path.join(ROOT, "data/internal/research/nfl/reports/player-props-v1-evaluation.json"));
if (props.populationContractVersion !== POPULATION_CONTRACT_VERSION) { console.error("REFUSED: champion receipt is not on the current population contract"); process.exit(1); }
const VOL = props.fit.volume.pass;      // { a0, a1, sigma }
const LEAGUE = props.fit.league;        // compRate, ypcmp, ...
const GS = props.fit.gamesim;           // marginSlope (margin head untouched by totals integration)

const bridge = read(path.join(ROOT, "data/internal/research/nfl/reports/scoring-bridge-v1.json"));
const pinned = new Map((bridge.corpusAccounting ?? []).map((a) => [a.season, a.contentHash]));
const seasons = [2023, 2024, 2025].map((season) => {
  const part = read(path.join(ROOT, `data/internal/research/nfl/player-events-v1/${season}.json`));
  if (part.contentHash !== pinned.get(season)) { console.error(`REFUSED: ${season} corpus hash mismatch`); process.exit(2); }
  return part;
});
const games = seasons.flatMap((s) => s.games)
  .filter((g) => (g.seasonType ?? 0) !== 1)
  .sort((a, b) => (a.dateUtc < b.dateUtc ? -1 : a.dateUtc > b.dateUtc ? 1 : a.providerEventId < b.providerEventId ? -1 : 1));
const finals = read(path.join(ROOT, "data/internal/research/nfl/corpus-v1.json")).rows;
const participationBySeason = new Map([2023, 2024, 2025].map((y) => [y, read(path.join(ROOT, `data/internal/research/nfl/participation-truth-v1/${y}.json`))]));

const schedule = read(path.join(APP, "public/data/nfl/schedule/latest.json"));
const nameToAbbr = new Map();
for (const r of schedule.rows) { nameToAbbr.set(r.home.name, r.home.abbr); nameToAbbr.set(r.away.name, r.away.abbr); }

// The props evaluator's own share parameters — stated, identical, never re-derived here.
const SHARE_PARAMS = { halfLifeGames: 4, shrinkK: 0.5, boundaryDecay: 0.25 };
const BUCKETS = [[0.7, "starter"], [0.2, "contested"], [0, "reserve"]]; // frozen in the prereg
const bucketOf = (share) => (share >= 0.7 ? "starter" : share >= 0.2 ? "contested" : "reserve");

// ── walk-forward pass over ALL games; collect train residuals, score 2025 ───────────────────────
const state = new Map(); // playerId -> { team, name, obs: [{share, season}], recent: [] }
const residuals = { starter: [], contested: [], reserve: [] };
const testPoints = [];
const popAccounting = newPopulationAccounting();

for (const g of games) {
  const homeAbbr = nameToAbbr.get(g.home);
  const awayAbbr = nameToAbbr.get(g.away);
  if (homeAbbr && awayAbbr) {
    const strength = strengthStateAt({ rows: finals.filter((r) => r.dateUtc < g.dateUtc), cutoffIso: g.dateUtc });
    const d = strength.ratingFor(g.home) + 48 - strength.ratingFor(g.away); // HOME_ADVANTAGE = 48 (committed Elo params)
    const marginMean = GS.marginSlope * d;
    for (const [abbr, ownMargin] of [[homeAbbr, marginMean], [awayAbbr, -marginMean]]) {
      const rowsByPlayer = new Map((g.players ?? []).filter((p) => p.teamAbbr === abbr).map((p) => [p.playerId, p]));
      for (const [playerId, st] of state) {
        if (st.team !== abbr || !st.obs.length) continue;
        const share = decayedShare({ observations: st.obs, predictSeason: g.season, ...SHARE_PARAMS }).share;
        if (share < 0.3) continue; // the evaluator's qbShare threshold — identical population gate
        const mu = Math.max(0, share * (VOL.a0 + VOL.a1 * ownMargin) * LEAGUE.compRate * LEAGUE.ypcmp);
        const row = rowsByPlayer.get(playerId);
        let actual = null;
        if (row) {
          actual = (row.passAtt ?? 0) > 0 ? (row.passYds ?? 0) : null; // zero-attempt appearance voids (family rule)
          if (actual != null) popAccounting.scoredWithRow += 1;
        } else {
          const cls = classifyParticipation({ part: participationBySeason.get(g.season), game: g, teamAbbr: abbr, playerName: st.name ?? "" });
          const out = outcomeForAbsentCandidate(cls);
          if (out.kind === "VOID") { popAccounting.voidDidNotDress += 1; }
          else if (out.kind === "EXCLUDED") {
            if (cls.state === "AMBIGUOUS_IDENTITY") popAccounting.excludedAmbiguous += 1; else popAccounting.excludedSourceMissing += 1;
          } else { actual = out.actual; popAccounting.scoredPlayedNoRow += 1; }
        }
        if (actual == null) continue;
        if (g.season <= 2024) residuals[bucketOf(share)].push(actual - mu);
        else {
          const r4 = (st.recent ?? []).slice(-4);
          testPoints.push({
            gameId: g.providerEventId, playerId, share, mu, actual,
            rolling4: r4.length ? r4.reduce((a, b) => a + b, 0) / r4.length : 0,
            line: r4.length === 4 ? r4.reduce((a, b) => a + b, 0) / 4 : null,
          });
        }
      }
    }
  }
  // fold AFTER predicting (walk-forward)
  for (const abbr of new Set((g.players ?? []).map((p) => p.teamAbbr))) {
    const { totals, rows } = teamGameTotals(g, abbr);
    for (const r of rows) {
      let st = state.get(r.playerId);
      if (!st || st.team !== r.teamAbbr) { st = { team: r.teamAbbr, obs: [], recent: [] }; state.set(r.playerId, st); }
      if (r.name) st.name = r.name;
      if (totals.passAttempts > 0) st.obs.push({ share: familyNumerator(r, "passAttempts") / totals.passAttempts, season: g.season });
      if ((r.passAtt ?? 0) > 0) st.recent.push(r.passYds ?? 0);
    }
  }
}

// ── train residual quantiles per bucket ─────────────────────────────────────────────────────────
const Q = [0.10, 0.25, 0.50, 0.75, 0.90];
const bucketQuantiles = {}; const bucketCdf = {};
for (const b of Object.keys(residuals)) {
  const rs = residuals[b].slice().sort((x, y) => x - y);
  bucketQuantiles[b] = Object.fromEntries(Q.map((q) => [q, rs.length ? rs[Math.min(rs.length - 1, Math.floor(q * rs.length))] : 0]));
  bucketCdf[b] = (x) => {
    if (!rs.length) return 0.5;
    let lo = 0; let hi = rs.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (rs[m] <= x) lo = m + 1; else hi = m; }
    return lo / rs.length;
  };
}

// ── score held-out 2025; join champion on identical points ──────────────────────────────────────
const champ = new Map();
for (const l of fs.readFileSync(DUMP, "utf8").split("\n")) {
  if (!l.trim()) continue;
  const r = JSON.parse(l);
  if (r.mkt === "player_pass_yds") champ.set(`${r.gameId}|${r.playerId}`, r);
}
let n = 0; let mae = 0; let maeChamp = 0; let maeR4 = 0; let pinball = 0; let cover = 0;
const cal = []; let joined = 0; const unjoined = [];
for (const t of testPoints) {
  const key = `${t.gameId}|${t.playerId}`;
  const c = champ.get(key);
  if (!c) { if (unjoined.length < 8) unjoined.push(key); continue; } // identical points ONLY — reported
  joined += 1;
  const b = bucketOf(t.share);
  const qs = Object.fromEntries(Q.map((q) => [q, Math.max(0, t.mu + bucketQuantiles[b][q])]));
  n += 1;
  mae += Math.abs(t.actual - t.mu);
  maeChamp += Math.abs(t.actual - c.pred.mean);
  maeR4 += Math.abs(t.actual - t.rolling4);
  pinball += Q.reduce((s, q) => s + (t.actual >= qs[q] ? q * (t.actual - qs[q]) : (1 - q) * (qs[q] - t.actual)), 0) / Q.length;
  cover += t.actual >= qs[0.10] && t.actual <= qs[0.90] ? 1 : 0;
  if (typeof t.line === "number") cal.push({ p: 1 - bucketCdf[b](t.line - t.mu), hit: t.actual > t.line ? 1 : 0 });
}
const bins = Array.from({ length: 10 }, () => ({ p: 0, hit: 0, n: 0 }));
for (const c of cal) { const b = bins[Math.min(9, Math.floor(c.p * 10))]; b.p += c.p; b.hit += c.hit; b.n += 1; }
const usable = bins.filter((b) => b.n >= 50);
const usableN = usable.reduce((s, b) => s + b.n, 0);
const ece = usableN ? Number(usable.reduce((s, b) => s + (b.n / usableN) * Math.abs(b.p / b.n - b.hit / b.n), 0).toFixed(4)) : null;

const observed = {
  n,
  joinedOfCandidatePoints: `${joined}/${testPoints.length}`,
  unjoinedSample: unjoined,
  mae: Number((mae / n).toFixed(3)),
  championMaeIdenticalPoints: Number((maeChamp / n).toFixed(3)),
  rolling4MaeIdenticalPoints: Number((maeR4 / n).toFixed(3)),
  pinball: Number((pinball / n).toFixed(3)),
  coverage80: Number((cover / n).toFixed(4)),
  ece,
  calPairs: cal.length,
  binsUsed: usable.length,
  trainResiduals: Object.fromEntries(Object.entries(residuals).map(([b, r]) => [b, r.length])),
  bucketQuantiles,
};
const bars = {
  beatsRolling4: { pass: observed.mae < observed.rolling4MaeIdenticalPoints, observed: `${observed.mae} vs ${observed.rolling4MaeIdenticalPoints}` },
  beatsChampionChain: { pass: observed.mae < observed.championMaeIdenticalPoints, observed: `${observed.mae} vs ${observed.championMaeIdenticalPoints}` },
  coverage80: { pass: observed.coverage80 >= 0.72 && observed.coverage80 <= 0.88, observed: observed.coverage80 },
  ece: { pass: observed.ece != null && observed.ece <= 0.05, observed: observed.ece },
  minN: { pass: n >= 300, observed: n },
};
const verdict = Object.values(bars).every((b) => b.pass) ? "ELIGIBLE" : "REJECTED";

fs.writeFileSync(path.join(ROOT, "data/internal/research/nfl/reports/pass-baseline-evaluation.json"), JSON.stringify({
  schemaVersion: 1,
  artifact: "pass-baseline-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  candidate: "pass-yds-baseline-v1",
  preregistration: "data/internal/research/nfl/reports/pass-baseline-candidate-preregistration.json",
  populationContractVersion: POPULATION_CONTRACT_VERSION,
  populationAccounting: popAccounting,
  inputs: { volume: VOL, league: { compRate: LEAGUE.compRate, ypcmp: LEAGUE.ypcmp }, marginSlope: GS.marginSlope, shareParams: SHARE_PARAMS, qbShareGate: 0.3 },
  heldOut2025: observed,
  bars,
  verdict,
}, null, 1));
console.log(`pass-yds-baseline-v1: n=${n} mae=${observed.mae} (champ ${observed.championMaeIdenticalPoints}, r4 ${observed.rolling4MaeIdenticalPoints}) cov80=${observed.coverage80} ece=${observed.ece} → ${verdict}`);

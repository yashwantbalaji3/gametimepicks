#!/usr/bin/env node
/**
 * EPL MATCH-SIMULATION BACKTEST — run the bars frozen in preregistration-match-sim-v1.json.
 *
 *   node scripts/epl/backtest-epl-match-sim.mjs [--write]
 *
 * HEAD-TO-HEAD, on identical rows. The interesting question is not whether allocation beats a
 * positional average — shrunk rates already do — but whether it beats THE MODEL CURRENTLY ON THE
 * SITE. Both are scored on exactly the same population so a difference cannot be a difference in
 * who was included.
 *
 * Walk-forward by match date, with TWO fits per day: the team strength state over the match corpus
 * and the player rates over the ESPN player corpus. Both see only strictly earlier matches.
 *
 * POPULATION NOTE, recorded rather than glossed: the preregistration's design section says goals are
 * allocated across "the eleven", and the allocation here spans every player who APPEARED for that
 * side — starters and substitutes, each at his own participation rate. That is what the
 * preregistration's population section declares ("players who APPEARED, in the participation state
 * they appeared in"), and it is also the only set over which the shares can sum to one. Allocating
 * to starters alone would hand a side's goals to eleven men when thirteen or fourteen played.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fitEplStrength, scoreMatrix } from "../../src/lib/sports/epl/strength-state.mjs";
import { fitPlayerRates, predictPlayer, predictPositional, participationState, positionGroup } from "../../src/lib/sports/epl/player-rates.mjs";
import { allocateGoals, coherenceRatio } from "../../src/lib/sports/epl/match-simulation.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const RESEARCH = path.join(REPO, "data/internal/research/epl");
const WRITE = process.argv.includes("--write");

const prereg = JSON.parse(fs.readFileSync(path.join(RESEARCH, "preregistration-match-sim-v1.json"), "utf8"));
const matchCorpus = JSON.parse(fs.readFileSync(path.join(RESEARCH, "corpus-v1.json"), "utf8"));
const playerRows = fs.readFileSync(path.join(RESEARCH, "players/espn-players-v1.jsonl"), "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

const WARMUP = prereg.protocol.warmup.season;
const DEV_SEASON = prereg.protocol.development.season;
const HOLD_SEASON = prereg.protocol.holdout.season;
/** The shipped model's configuration, read from its own backtest rather than retyped. */
const SHIPPED_K = JSON.parse(fs.readFileSync(path.join(RESEARCH, "reports/player-model-v2-backtest.json"), "utf8")).locked.k;

/* ── Fixtures, in date order ─────────────────────────────────────────────────────────────────── */
const byFixture = new Map();
for (const r of playerRows) {
  if (!byFixture.has(r.espnEventId)) {
    byFixture.set(r.espnEventId, { date: r.dateUtc, season: r.season, home: r.homeClub, away: r.awayClub, rows: [] });
  }
  byFixture.get(r.espnEventId).rows.push(r);
}
const fixtures = [...byFixture.entries()].map(([id, v]) => ({ id, ...v }))
  .filter((f) => f.season === WARMUP || f.season === DEV_SEASON || f.season === HOLD_SEASON)
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));
const DEV = new Set(fixtures.filter((f) => f.season === DEV_SEASON).map((f) => f.id));
const HOLD = new Set(fixtures.filter((f) => f.season === HOLD_SEASON).map((f) => f.id));
if (!DEV.size || !HOLD.size) { console.error(`REFUSED — dev ${DEV.size} / holdout ${HOLD.size}`); process.exit(2); }
console.log(`corpus ${fixtures.length} fixtures · warm-up ${WARMUP} · dev ${DEV.size} (${DEV_SEASON}) · holdout ${HOLD.size} (${HOLD_SEASON})`);

/* ── Metrics ─────────────────────────────────────────────────────────────────────────────────── */
const clip = (p) => Math.min(1 - 1e-15, Math.max(1e-15, p));
function metrics(preds) {
  const usable = preds.filter((r) => r.p != null);
  const n = usable.length;
  if (!n) return null;
  let ll = 0, brier = 0, sumP = 0, obs = 0;
  for (const r of usable) {
    ll += -(r.y * Math.log(clip(r.p)) + (1 - r.y) * Math.log(1 - clip(r.p)));
    brier += (r.p - r.y) ** 2; sumP += r.p; obs += r.y;
  }
  const bins = Array.from({ length: 10 }, () => ({ n: 0, sumP: 0, hits: 0 }));
  for (const r of usable) { const b = Math.min(9, Math.floor(r.p * 10)); bins[b].n += 1; bins[b].sumP += r.p; bins[b].hits += r.y; }
  const ece = bins.filter((b) => b.n > 0).reduce((s, b) => s + (b.n / n) * Math.abs(b.sumP / b.n - b.hits / b.n), 0);
  return {
    n, coverage: Number((n / preds.length).toFixed(4)),
    logLoss: Number((ll / n).toFixed(5)), brier: Number((brier / n).toFixed(5)), ece: Number(ece.toFixed(5)),
    predictedScorers: Number(sumP.toFixed(1)), observedScorers: obs,
    countError: Number((Math.abs(sumP - obs) / Math.max(1, obs)).toFixed(4)),
  };
}
const on = (preds, split) => metrics(preds.filter((r) => r.split === split));

/**
 * One walk-forward pass producing THREE aligned prediction sets — allocation, the shipped model and
 * the positional baseline — on identical rows, plus the coherence ratio of every scored side.
 */
function walkForward({ k, weightFloor }) {
  const sim = [], shipped = [], positional = [];
  const coherence = [];
  const priorPlayers = [];
  let playerFit = fitPlayerRates([]);
  let strength = null;
  let lastDate = null;

  for (const f of fixtures) {
    if (f.date !== lastDate) {
      playerFit = fitPlayerRates(priorPlayers);
      /* The team fit takes its own cutoff, so it can never see a result from the match it prices. */
      strength = fitEplStrength({ rows: matchCorpus.rows, cutoffIso: `${String(f.date).slice(0, 10)}T00:00:00Z` });
      lastDate = f.date;
    }

    if (DEV.has(f.id) || HOLD.has(f.id)) {
      const split = DEV.has(f.id) ? "dev" : "holdout";
      let matrix = null;
      try { matrix = scoreMatrix(strength, f.home, f.away); } catch { matrix = null; }

      for (const side of ["home", "away"]) {
        const appeared = f.rows.filter((r) => participationState(r) && (side === "home" ? r.isHome : !r.isHome));
        if (!appeared.length) continue;

        /* The rate each player is allocated on — the SAME shrunk rate the shipped model publishes. */
        const withRates = appeared.map((r) => {
          const st = participationState(r);
          const pred = predictPlayer(playerFit, { playerId: r.playerId, position: r.position, state: st }, { k });
          return { row: r, state: st, rate: pred ? pred.lambda : 0, shippedP: pred ? pred.probability : null };
        });

        const dist = matrix?.teamGoals?.[side]?.distribution ?? null;
        const allocated = dist ? allocateGoals(dist, withRates.map((w) => ({ playerId: w.row.playerId, rate: w.rate })), { weightFloor }) : null;
        if (allocated) {
          const ratio = coherenceRatio(dist, allocated);
          if (ratio != null) coherence.push({ split, ratio });
        }
        const byId = new Map((allocated ?? []).map((a) => [String(a.playerId), a]));

        for (const w of withRates) {
          const y = Number(w.row.goals ?? 0) > 0 ? 1 : 0;
          const a = byId.get(String(w.row.playerId));
          sim.push({ split, y, p: a ? a.probability : null });
          shipped.push({ split, y, p: w.shippedP });
          const pos = predictPositional(playerFit, { playerId: w.row.playerId, position: w.row.position, state: w.state });
          positional.push({ split, y, p: pos ? pos.probability : null });
        }
      }
    }
    priorPlayers.push(...f.rows);
  }
  return { sim, shipped, positional, coherence };
}

/* ── Phase 1 · DEVELOPMENT sweep ─────────────────────────────────────────────────────────────── */
const grid = prereg.stoppingRule.grid;
console.log(`\nDEVELOPMENT sweep — selection metric = log loss`);
const sweep = [];
for (const k of grid.k) {
  for (const weightFloor of grid.weightFloor) {
    const r = walkForward({ k, weightFloor });
    const m = on(r.sim, "dev");
    sweep.push({ k, weightFloor, dev: m });
    console.log(`  k=${String(k).padEnd(3)} floor=${String(weightFloor).padEnd(6)} logLoss ${m.logLoss.toFixed(5)}  ece ${m.ece.toFixed(4)}  coverage ${(m.coverage * 100).toFixed(1)}%`);
  }
}
const locked = sweep.reduce((a, b) => (a.dev.logLoss <= b.dev.logLoss ? a : b));
console.log(`\nLOCKED on development: k=${locked.k} weightFloor=${locked.weightFloor} (dev logLoss ${locked.dev.logLoss})`);
console.log("The holdout season has not been scored for any configuration up to this line.");

/* ── Phase 2 · HOLDOUT, once ─────────────────────────────────────────────────────────────────── */
const final = walkForward({ k: locked.k, weightFloor: locked.weightFloor });
const simHold = on(final.sim, "holdout");
const shipHold = on(final.shipped, "holdout");
const posHold = on(final.positional, "holdout");
const holdCoh = final.coherence.filter((c) => c.split === "holdout").map((c) => c.ratio);
const worstCoh = holdCoh.reduce((w, r) => (Math.abs(r - 1) > Math.abs(w - 1) ? r : w), 1);

console.log(`\nHOLDOUT (n=${simHold.n}) — scored once`);
console.log(`  simulation  logLoss ${simHold.logLoss}  ece ${simHold.ece}  predicted ${simHold.predictedScorers} vs observed ${simHold.observedScorers}`);
console.log(`  shipped     logLoss ${shipHold.logLoss}  ece ${shipHold.ece}  predicted ${shipHold.predictedScorers}`);
console.log(`  positional  logLoss ${posHold.logLoss}`);
console.log(`  coherence   ${holdCoh.length} sides scored · worst ratio ${worstCoh.toFixed(8)}`);

const bars = [
  { id: "M1_coherent", pass: Math.abs(worstCoh - 1) <= 0.01,
    detail: `worst coherence ratio ${worstCoh.toFixed(8)} across ${holdCoh.length} sides, allowed within 1%` },
  { id: "M2_beats_shipped", pass: simHold.logLoss <= shipHold.logLoss,
    detail: `simulation ${simHold.logLoss} vs shipped ${shipHold.logLoss} — need <=` },
  { id: "M3_beats_positional", pass: posHold.logLoss - simHold.logLoss >= 0.005,
    detail: `${simHold.logLoss} vs positional ${posHold.logLoss} — improvement ${(posHold.logLoss - simHold.logLoss).toFixed(5)}, need >= 0.005` },
  { id: "M4_calibrated", pass: simHold.ece <= 0.020, detail: `ECE ${simHold.ece}, allowed <= 0.020` },
  { id: "M5_count_sane", pass: simHold.countError <= 0.10,
    detail: `predicted ${simHold.predictedScorers} vs observed ${simHold.observedScorers} — ${(simHold.countError * 100).toFixed(1)}%, allowed <= 10%` },
];
const verdict = bars.every((b) => b.pass) ? "ACCEPTED" : "REJECTED";
console.log(`\nBARS`);
for (const b of bars) console.log(`  ${b.pass ? "PASS" : "FAIL"}  ${b.id.padEnd(22)} ${b.detail}`);
console.log(`\nVERDICT: ${verdict}${verdict === "REJECTED" ? " — the shipped model stays live and the incoherence is disclosed instead." : " — the simulation replaces the shipped goalscorer model."}`);

const report = {
  schemaVersion: 1,
  artifact: "epl-match-simulation-v1-backtest",
  dataClass: "PRIVATE_RESEARCH",
  public: false,
  generatedAt: new Date().toISOString(),
  preregistration: { file: "preregistration-match-sim-v1.json", registeredAt: prereg.registeredAt },
  protocol: prereg.protocol,
  shippedComparand: { model: "epl-player-v2-shrunk-rate", k: SHIPPED_K },
  developmentSweep: sweep.map((s) => ({ k: s.k, weightFloor: s.weightFloor, devLogLoss: s.dev.logLoss, devEce: s.dev.ece })),
  locked: { k: locked.k, weightFloor: locked.weightFloor },
  holdout: { simulation: simHold, shipped: shipHold, positional: posHold, coherenceSides: holdCoh.length, worstCoherenceRatio: worstCoh },
  bars,
  verdict,
};

if (WRITE) {
  fs.writeFileSync(path.join(RESEARCH, "reports/match-sim-v1-backtest.json"), JSON.stringify(report, null, 1) + "\n");
  console.log(`\nwrote data/internal/research/epl/reports/match-sim-v1-backtest.json`);
} else {
  console.log(`\ndry run — pass --write to persist.`);
}

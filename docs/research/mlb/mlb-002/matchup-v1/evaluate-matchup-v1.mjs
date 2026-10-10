/**
 * MLB-002 · challenger mlb-pa-matchup-v1 vs the published engine, as preregistered in PREREGISTRATION.md (+ amendments).
 * READ-ONLY research: writes only into this directory.
 *
 *   (from app/) npx tsx ../docs/research/mlb/mlb-002/matchup-v1/evaluate-matchup-v1.mjs --split dev|holdout [--freeze-league]
 *
 * Inputs per graded game: the forecast of record's base inputs rebuilt from the commit that first published it (board,
 * team markets, confirmed lineups as in the MLB-001 rule-corrections harness), plus pregame features (batter-splits,
 * pitcher-workload, matchup) — the LATEST committed capture with capturedAt ≤ the forecast's generatedAt and < first
 * pitch, read from every committed version (files are overwritten during the day). Both arms: the same inputs, the same
 * seed, 10,000 games. The control is the published engine; the challenger sets EngineParams.matchup.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gameInputsFromBoard } from "../../../../../app/src/lib/mlb/full-game/board-adapter.ts";
import { selectConfirmedLineup } from "../../../../../app/src/lib/mlb/full-game/confirmed-lineup.ts";
import { simulateFullGame } from "../../../../../app/src/lib/mlb/full-game/simulate.ts";
import { DEFAULT_ENGINE_PARAMS } from "../../../../../app/src/lib/mlb/full-game/engine.ts";
import { stableHash } from "../../../../../app/src/lib/game-simulations/rng.ts";
import { PA_BY_SLOT } from "../../../../../app/scripts/capture-mlb-pregame-pa-opportunity.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../..");
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const SPLIT = arg("--split");
if (SPLIT !== "dev" && SPLIT !== "holdout") { console.error("REFUSED: --split dev|holdout"); process.exit(2); }
const WINDOWS = { dev: ["2026-07-24", "2026-08-31"], holdout: ["2026-09-01", "2026-10-08"] };
const [FROM, TO] = WINDOWS[SPLIT];
const RUNS = 10000;
const FEATURES = "data/internal/mlb/pregame-archive/pregame-features";
const LEAGUE_FILE = path.join(HERE, "league-constants.json");
const PRIORS = { batter: { k: 60, bb: 120, hr: 170 }, pitcher: { k: 70, bb: 170, hr: 500 }, prevSeasonWeight: 0.5, bfPerIp: 4.25, hbp: 0.011, starterProjectionBf: 25 };

const git = (...a) => execFileSync("git", a, { cwd: REPO, maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "ignore"] }).toString();
const gitJson = (sha, rel) => { try { return JSON.parse(git("show", `${sha}:${rel}`)); } catch { return null; } };
const ms = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? t : null; };

// ── every committed version of every file under a directory, via one cat-file batch ─────────────────────────────────
async function allVersions(dirRel) {
  const log = git("log", "--format=%H", "--name-only", "--diff-filter=AM", "--", dirRel).split("\n");
  const pairs = [];
  let sha = null;
  for (const line of log) {
    if (/^[0-9a-f]{40}$/.test(line)) sha = line;
    else if (line.trim() && sha) pairs.push(`${sha}:${line.trim()}`);
  }
  // Working-tree copies too (uncommitted is never expected here, but the committed tip is in the log already).
  if (!pairs.length) return [];
  return new Promise((resolve, reject) => {
    const p = spawn("git", ["cat-file", "--batch"], { cwd: REPO });
    const chunks = [];
    p.stdout.on("data", (c) => chunks.push(c));
    p.on("error", reject);
    p.on("close", () => {
      const buf = Buffer.concat(chunks);
      const out = [];
      let i = 0;
      for (const spec of pairs) {
        const nl = buf.indexOf(10, i);
        const header = buf.slice(i, nl).toString();
        i = nl + 1;
        if (header.endsWith("missing")) continue;
        const size = Number(header.split(" ")[2]);
        const body = buf.slice(i, i + size).toString();
        i += size + 1;
        try { out.push({ path: spec.slice(41), doc: JSON.parse(body) }); } catch { /* torn file */ }
      }
      resolve(out);
    });
    p.stdin.end(pairs.join("\n") + "\n");
  });
}
const featureCache = new Map();
async function featuresFor(family, date) {
  const k = `${family}|${date}`;
  if (!featureCache.has(k)) featureCache.set(k, await allVersions(`${FEATURES}/${family}/${date}`));
  return featureCache.get(k);
}
const latestBefore = (versions, pred, cutoff) => versions
  .filter((v) => pred(v.doc) && ms(v.doc.capturedAt) != null && ms(v.doc.capturedAt) <= cutoff && ms(v.doc.capturedAt) < ms(v.doc.eventStartTime ?? "9999"))
  .sort((a, b) => ms(b.doc.capturedAt) - ms(a.doc.capturedAt))[0]?.doc ?? null;

// ── forecast of record + rebuilt base inputs (as in the MLB-001 rule-corrections harness) ───────────────────────────
const graded = fs.readFileSync(path.join(REPO, "app/public/data/mlb/results/game-predictions-graded.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const games = new Map();
for (const r of graded) {
  if (r.date < FROM || r.date > TO) continue;
  if (!games.has(r.gamePk)) games.set(r.gamePk, { gamePk: r.gamePk, date: r.date, src: r.forecastSource, actual: r.actual, firstPitch: r.firstPitchUtc });
}
const predCache = new Map();
function predictionsAt(src, date) {
  if (predCache.has(src)) return predCache.get(src);
  const i = src.indexOf(":");
  const kind = src.slice(0, i);
  const rest = src.slice(i + 1);
  let a = null;
  if (kind === "git") a = gitJson(rest, `app/public/data/mlb/predictions/${date}.json`);
  else if (kind === "snapshot") { try { a = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/mlb/prediction-snapshots", rest), "utf8")); } catch { a = null; } }
  const m = a ? new Map(a.predictions.map((p) => [p.gamePk, p])) : null;
  predCache.set(src, m);
  return m;
}
const firstSeen = new Map();
const indexed = new Set();
function indexDate(date) {
  if (indexed.has(date)) return;
  indexed.add(date);
  const rel = `app/public/data/mlb/full-game-simulations/${date}.json`;
  for (const sha of git("log", "--reverse", "--format=%H", "--", rel).split("\n").filter(Boolean)) {
    const a = gitJson(sha, rel);
    for (const g of a?.games ?? []) if (g.artifactHash && !firstSeen.has(g.artifactHash)) firstSeen.set(g.artifactHash, { sha, artifact: a, game: g });
  }
}
const inputCache = new Map();
function inputsAt(sha, artifact) {
  const key = `${sha}|${artifact.generatedAt}`;
  if (inputCache.has(key)) return inputCache.get(key);
  const date = artifact.date;
  const board = gitJson(sha, `app/public/data/mlb/boards/${date}.json`);
  if (!board || stableHash(board) !== artifact.sourceBoardHash) { inputCache.set(key, null); return null; }
  const nowIso = artifact.generatedAt;
  const started = new Set(board.games.filter((g) => g.gameDate && Date.parse(g.gameDate) <= Date.parse(nowIso)).map((g) => g.gamePk));
  const bounded = { ...board, games: board.games.map((g) => (started.has(g.gamePk) ? { ...g, startedBeforeGeneration: true } : g)) };
  const tm = gitJson(sha, `app/public/data/mlb/team-markets/${date}.json`);
  const marketByGamePk = new Map();
  if (tm?.games && typeof tm.games === "object") {
    const oddsId = new Map();
    for (const l of board.leans ?? []) if (l.gamePk != null && l.gameId) oddsId.set(l.gamePk, l.gameId);
    const byOdds = new Map(Object.entries(tm.games));
    for (const g of board.games) {
      const t = byOdds.get(oddsId.get(g.gamePk));
      if (!t) continue;
      marketByGamePk.set(g.gamePk, {
        bookmaker: t.bookmaker ?? null, capturedAt: tm.generatedAt ?? null,
        moneyline: t.moneyline ? { home: t.moneyline.home?.noVigProb ?? null, away: t.moneyline.away?.noVigProb ?? null } : null,
        total: t.total ? { line: t.total.line ?? null, over: t.total.over?.noVigProb ?? null } : null,
        runLine: t.runLine ? { line: t.runLine.line ?? null, homeCover: t.runLine.home?.coverNoVigProb ?? null } : null,
      });
    }
  }
  const confirmed = new Map();
  const dir = path.join(REPO, `data/internal/mlb/pregame-archive/pregame-features/lineup/${date}`);
  const byGame = new Map();
  let files = [];
  try { files = fs.readdirSync(dir).filter((x) => x.endsWith(".json")); } catch { files = []; }
  for (const f of files) {
    let snap = null;
    try { snap = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    if (!Number.isFinite(snap?.gamePk) || !(Date.parse(snap.capturedAt) <= Date.parse(nowIso))) continue;
    if (!byGame.has(snap.gamePk)) byGame.set(snap.gamePk, []);
    byGame.get(snap.gamePk).push(snap);
  }
  for (const [pk, snaps] of byGame) {
    const picked = selectConfirmedLineup(snaps);
    if (picked.away || picked.home) confirmed.set(pk, picked);
  }
  const inputs = new Map(gameInputsFromBoard(bounded, marketByGamePk, confirmed).map((i) => [i.gamePk, i]));
  inputCache.set(key, inputs);
  return inputs;
}

// ── rates ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const shrink = (count, n, prior, league) => (count + prior * league) / (n + prior);
function splitCounts(doc, which) {
  const w = PRIORS.prevSeasonWeight;
  const keys = which === "R" ? ["vsRHP"] : which === "L" ? ["vsLHP"] : ["vsRHP", "vsLHP"];
  let pa = 0; let k = 0; let bb = 0; let hr = 0;
  for (const key of keys) {
    const a = doc.seasonSplits?.[key];
    const b = doc.previousSeason?.[key];
    if (a) { pa += a.pa ?? 0; k += a.k ?? 0; bb += a.bb ?? 0; hr += a.hr ?? 0; }
    if (b) { pa += w * (b.pa ?? 0); k += w * (b.k ?? 0); bb += w * (b.bb ?? 0); hr += w * (b.hr ?? 0); }
  }
  return { pa, k, bb, hr };
}
const batterRates = (c, L) => ({ k: shrink(c.k, c.pa, PRIORS.batter.k, L.k), bb: shrink(c.bb, c.pa, PRIORS.batter.bb, L.bb), hr: shrink(c.hr, c.pa, PRIORS.batter.hr, L.hr) });

async function freezeLeague() {
  // Pooled 2026 splits from dev-window captures only (latest capture per player): K%, BB%, HR/PA.
  const latest = new Map();
  const dates = fs.readdirSync(path.join(REPO, FEATURES, "batter-splits")).filter((d) => d >= WINDOWS.dev[0] && d <= WINDOWS.dev[1]).sort();
  for (const d of dates) {
    for (const f of fs.readdirSync(path.join(REPO, FEATURES, "batter-splits", d))) {
      try {
        const doc = JSON.parse(fs.readFileSync(path.join(REPO, FEATURES, "batter-splits", d, f), "utf8"));
        if (doc.playerId) latest.set(doc.playerId, doc);
      } catch { /* skip */ }
    }
  }
  let pa = 0; let k = 0; let bb = 0; let hr = 0;
  for (const doc of latest.values()) for (const key of ["vsRHP", "vsLHP"]) {
    const a = doc.seasonSplits?.[key];
    if (a) { pa += a.pa ?? 0; k += a.k ?? 0; bb += a.bb ?? 0; hr += a.hr ?? 0; }
  }
  const L = { k: k / pa, bb: bb / pa, hr: hr / pa, hbp: PRIORS.hbp, basis: { players: latest.size, pa, window: WINDOWS.dev, frozenAt: new Date().toISOString() } };
  fs.writeFileSync(LEAGUE_FILE, JSON.stringify(L, null, 2) + "\n");
  return L;
}

// ── metrics ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const clampP = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
function crps(dist, actual) {
  // Discrete CRPS over integer totals: Σ_x (F(x) − 1{actual ≤ x})².
  const pmf = new Map(dist.map((d) => [d.value, d.probability]));
  const maxV = Math.max(actual, ...dist.map((d) => d.value)) + 1;
  let F = 0;
  let s = 0;
  for (let x = 0; x <= maxV; x += 1) {
    F += pmf.get(x) ?? 0;
    const ind = actual <= x ? 1 : 0;
    s += (F - ind) ** 2;
  }
  return s;
}

const main = async () => {
  if (process.argv.includes("--freeze-league")) { console.log(JSON.stringify(await freezeLeague())); return; }
  if (!fs.existsSync(LEAGUE_FILE)) { console.error("REFUSED: league constants not frozen (run --split dev --freeze-league first)"); process.exit(2); }
  const L = JSON.parse(fs.readFileSync(LEAGUE_FILE, "utf8"));
  const CHALLENGER = { ...DEFAULT_ENGINE_PARAMS, matchup: { league: { k: L.k, bb: L.bb, hr: L.hr, hbp: L.hbp } } };
  const rows = [];
  const tally = { games: games.size, noForecast: 0, noInputs: 0, run: 0 };
  let n = 0;
  for (const G of games.values()) {
    n += 1;
    if (n % 25 === 0) console.error(`… ${n}/${games.size}`);
    const pred = predictionsAt(G.src, G.date)?.get(G.gamePk);
    if (!pred?.artifactHash) { tally.noForecast += 1; continue; }
    indexDate(G.date);
    const hit = firstSeen.get(pred.artifactHash);
    const input = hit ? inputsAt(hit.sha, hit.artifact)?.get(G.gamePk) : null;
    if (!input || input.completeness?.level === "unavailable") { tally.noInputs += 1; continue; }
    const cutoff = Math.min(ms(hit.artifact.generatedAt), ms(G.firstPitch));
    // Features (latest capture at or before the forecast and before first pitch).
    const mu = latestBefore(await featuresFor("matchup", G.date), (d) => d.gamePk === G.gamePk, cutoff);
    const pw = latestBefore(await featuresFor("pitcher-workload", G.date), (d) => d.gamePk === G.gamePk, cutoff);
    const splits = await featuresFor("batter-splits", G.date);
    const hand = { home: mu?.homeStartingPitcher?.pitchHand ?? null, away: mu?.awayStartingPitcher?.pitchHand ?? null };
    const slotOf = new Map();
    for (const side of ["homeBatters", "awayBatters"]) for (const b of mu?.[side] ?? []) if (b.playerId && b.battingOrderSlot) slotOf.set(b.playerId, b.battingOrderSlot);
    const cov = { batters: 0, battersWithSplits: 0, battersWithSlot: 0, starters: 0, startersWithLine: 0 };
    const withBatter = (lineup, confirmedSide, oppHand) => lineup.map((b, i) => {
      cov.batters += 1;
      if (!Number.isFinite(b.playerId) || b.playerId < 0) return b; // replacement-level filler: published model
      const doc = latestBefore(splits, (d) => d.playerId === b.playerId && d.gamePk === G.gamePk, cutoff);
      const slot = confirmedSide ? i + 1 : slotOf.get(b.playerId) ?? null;
      if (slot) cov.battersWithSlot += 1;
      const slotPa = slot ? PA_BY_SLOT[slot] : DEFAULT_ENGINE_PARAMS.league.PA_PER_GAME;
      const vsStarter = doc ? batterRates(splitCounts(doc, oppHand), L) : { k: L.k, bb: L.bb, hr: L.hr };
      const vsBullpen = doc ? batterRates(splitCounts(doc, null), L) : { k: L.k, bb: L.bb, hr: L.hr };
      if (doc) cov.battersWithSplits += 1;
      return { ...b, matchup: { slotPa, vsStarter, vsBullpen } };
    });
    const withStarter = (s, side) => {
      if (!s) return s;
      cov.starters += 1;
      const p = pw?.pitchers?.[side];
      const st = p && p.id === s.playerId ? p.seasonToDate : null;
      const bf = st ? (st.ip ?? 0) * PRIORS.bfPerIp : 0;
      if (st) cov.startersWithLine += 1;
      const kFromProj = s.expStrikeouts != null && Number.isFinite(s.expStrikeouts) && s.expStrikeouts > 0 ? s.expStrikeouts / PRIORS.starterProjectionBf : null;
      return {
        ...s,
        matchup: {
          k: kFromProj ?? shrink(st?.k ?? 0, bf, PRIORS.pitcher.k, L.k),
          bb: shrink(st?.bb ?? 0, bf, PRIORS.pitcher.bb, L.bb),
          hr: shrink(st?.hr ?? 0, bf, PRIORS.pitcher.hr, L.hr),
        },
      };
    };
    const c = input.completeness ?? {};
    const challengerInput = {
      ...input,
      awayLineup: withBatter(input.awayLineup, c.awayLineupSource === "confirmed", hand.home),
      homeLineup: withBatter(input.homeLineup, c.homeLineupSource === "confirmed", hand.away),
      awayStarter: withStarter(input.awayStarter, "away"),
      homeStarter: withStarter(input.homeStarter, "home"),
    };
    const opts = { runCount: RUNS, modelVersion: hit.artifact.modelVersion, simulationVersion: hit.artifact.simulationVersion, generatedAt: hit.artifact.generatedAt };
    const control = simulateFullGame(input, opts);
    const chall = simulateFullGame(challengerInput, { ...opts, engine: CHALLENGER });
    if (control.status === "unavailable" || chall.status === "unavailable") { tally.noInputs += 1; continue; }
    tally.run += 1;
    const tot = G.actual.homeRuns + G.actual.awayRuns;
    const arm = (g) => {
      const at15 = g.runLine.find((x) => x.line === 1.5);
      const pmf = g.totalRuns.distribution;
      const pTot = pmf.find((d) => d.value === tot)?.probability ?? 0;
      return {
        pHome: g.winProbability.home, meanTotal: g.totalRuns.mean, p10: g.totalRuns.p10, p90: g.totalRuns.p90,
        crps: crps(pmf, tot), logScoreTotal: -Math.log(Math.max(1e-4, pTot)),
        homeMinus15: at15?.homeCover ?? null, meanHome: g.runs.home.mean, meanAway: g.runs.away.mean,
      };
    };
    rows.push({
      gamePk: G.gamePk, date: G.date, postseason: G.date >= "2026-09-28", actual: G.actual,
      marketHome: input.market?.moneyline?.home ?? null, lineup: `${c.awayLineupSource ?? "?"}/${c.homeLineupSource ?? "?"}`,
      coverage: cov, control: arm(control), challenger: arm(chall),
    });
  }
  fs.writeFileSync(path.join(HERE, `rows-${SPLIT}.jsonl`), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

  // ── summary ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const y = (r) => (r.actual.winner === "home" ? 1 : 0);
  const ll = (p, yy) => -Math.log(yy ? clampP(p) : 1 - clampP(p));
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  function boot(xs, iters = 10000, seed = 20261010) {
    let s = seed >>> 0;
    const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
    const m = [];
    for (let b = 0; b < iters; b += 1) { let t = 0; for (let i = 0; i < xs.length; i += 1) t += xs[Math.floor(rand() * xs.length)]; m.push(t / xs.length); }
    m.sort((a, b) => a - b);
    return [m[Math.floor(0.025 * iters)], m[Math.floor(0.975 * iters)]];
  }
  function slope(rs, k) {
    // Logistic calibration slope/intercept of logit(p) on outcome (Newton, 25 iterations).
    const xs = rs.map((r) => Math.log(clampP(r[k].pHome) / (1 - clampP(r[k].pHome))));
    const ys = rs.map(y);
    let a = 0; let b = 1;
    for (let it = 0; it < 25; it += 1) {
      let ga = 0; let gb = 0; let haa = 0; let hab = 0; let hbb = 0;
      for (let i = 0; i < xs.length; i += 1) {
        const p = 1 / (1 + Math.exp(-(a + b * xs[i])));
        const w = p * (1 - p);
        ga += ys[i] - p; gb += (ys[i] - p) * xs[i];
        haa += w; hab += w * xs[i]; hbb += w * xs[i] * xs[i];
      }
      const det = haa * hbb - hab * hab;
      if (Math.abs(det) < 1e-12) break;
      a += (hbb * ga - hab * gb) / det;
      b += (haa * gb - hab * ga) / det;
    }
    return { intercept: a, slope: b };
  }
  function summarize(rs) {
    if (!rs.length) return null;
    const dLL = rs.map((r) => ll(r.challenger.pHome, y(r)) - ll(r.control.pHome, y(r)));
    const dCRPS = rs.map((r) => r.challenger.crps - r.control.crps);
    const mk = rs.filter((r) => r.marketHome != null);
    const arm = (k) => ({
      winnerLogLoss: mean(rs.map((r) => ll(r[k].pHome, y(r)))),
      winnerBrier: mean(rs.map((r) => (r[k].pHome - y(r)) ** 2)),
      calibration: slope(rs, k),
      totalCRPS: mean(rs.map((r) => r[k].crps)),
      totalLogScore: mean(rs.map((r) => r[k].logScoreTotal)),
      totalLevel: mean(rs.map((r) => r.actual.homeRuns + r.actual.awayRuns - r[k].meanTotal)),
      total80Coverage: mean(rs.map((r) => { const t = r.actual.homeRuns + r.actual.awayRuns; return t >= r[k].p10 && t <= r[k].p90 ? 1 : 0; })),
      runLineLogLoss: mean(rs.filter((r) => r[k].homeMinus15 != null).map((r) => ll(r[k].homeMinus15, r.actual.homeRuns - r.actual.awayRuns >= 2 ? 1 : 0))),
      meanSdPHome: Math.sqrt(mean(rs.map((r) => (r[k].pHome - 0.5) ** 2))),
    });
    return {
      games: rs.length,
      control: arm("control"),
      challenger: arm("challenger"),
      winnerLogLossDiff: { mean: mean(dLL), ci95: boot(dLL), note: "challenger − control; below 0 = challenger better" },
      totalCRPSDiff: { mean: mean(dCRPS), ci95: boot(dCRPS) },
      vsMarket: mk.length ? {
        games: mk.length,
        market: mean(mk.map((r) => ll(r.marketHome, y(r)))),
        control: mean(mk.map((r) => ll(r.control.pHome, y(r)))),
        challenger: mean(mk.map((r) => ll(r.challenger.pHome, y(r)))),
        challengerMinusMarket95: boot(mk.map((r) => ll(r.challenger.pHome, y(r)) - ll(r.marketHome, y(r)))),
      } : null,
      coverage: {
        battersWithSplits: mean(rs.map((r) => r.coverage.battersWithSplits / r.coverage.batters)),
        battersWithSlot: mean(rs.map((r) => r.coverage.battersWithSlot / r.coverage.batters)),
        startersWithLine: mean(rs.map((r) => (r.coverage.starters ? r.coverage.startersWithLine / r.coverage.starters : 0))),
      },
    };
  }
  const summary = {
    challenger: "mlb-pa-matchup-v1", split: SPLIT, window: WINDOWS[SPLIT], runs: RUNS, league: L, priors: PRIORS, tally,
    all: summarize(rows), regularSeason: summarize(rows.filter((r) => !r.postseason)), postseason: summarize(rows.filter((r) => r.postseason)),
  };
  fs.writeFileSync(path.join(HERE, `summary-${SPLIT}.json`), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
};
main();

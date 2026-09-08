/**
 * Fit + walk-forward evaluation for the NFL player-prop heads (Program 171 · Release B).
 * PRIVATE RESEARCH.
 *
 * PROTOCOL (the P170 bridge discipline):
 *   FIT on 2023–24 REG+POST only — game-script volume model (attempts ~ margin), league
 *   per-opportunity rates, Gamma dispersion shapes, and the rate-shrink pseudo-count m
 *   (selected by walk-forward MAE inside 2023–24, never on the held-out season).
 *   TEST once on 2025: every prediction is fully pre-game (walk-forward roles/rates, Elo
 *   strength at cutoff, committed game-sim heads) → sampled distributions → scored against
 *   realized stat lines beside four baselines.
 *
 * The receipt this writes is the ONLY parameter source the runtime engine accepts.
 *
 * Usage: node scripts/nfl/evaluate-nfl-player-props.mjs --now <iso> [--runs 1000]
 * Writes: data/internal/research/nfl/reports/player-props-v1-evaluation.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SHARE_FAMILIES, familyNumerator, teamGameTotals, decayedShare } from "../../src/lib/sports/nfl/role-shares.mjs";
import { shrunkRate, simulatePlayerProps, PROP_MARKETS, NFL_PLAYER_PROPS_ID } from "../../src/lib/sports/nfl/player-props-v1.mjs";
import { strengthStateAt } from "../../src/lib/sports/nfl/model-v1.mjs";
import { totalsStateAt } from "../../src/lib/sports/nfl/totals-rating.mjs";
import { classifyParticipation, outcomeForAbsentCandidate, newPopulationAccounting, POPULATION_CONTRACT_VERSION } from "../../src/lib/sports/nfl/participation-truth.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const RUNS = Number(arg("--runs", "1000"));
/*
 * P246 §4.2 challenger lane. `--challenger pass-gamesigma-pooled-mean-v1` changes EXACTLY ONE
 * parameter's estimator (fit.dispersion.gameSigma.player_pass_yds: games-weighted MEAN of the
 * excess ratio instead of the unweighted median of sigma) and redirects the receipt to
 * pass-yds-repair-evaluation.json. The champion receipt is NEVER overwritten by a challenger
 * run, and the default (no flag) path is byte-identical to the champion protocol.
 * Preregistered (bars frozen before implementation):
 * data/internal/research/nfl/reports/pass-yds-coverage-repair-preregistration.json
 */
const CHALLENGER = arg("--challenger", null);
/* P246 §4.3 diagnostics: --diagnose <dir> reruns the champion protocol but writes the receipt
   AND the per-family threshold-calibration bins into <dir> instead of any committed path —
   measurement only, no receipt is touched. */
const DIAGNOSE_DIR = arg("--diagnose", null);
/* --diagnose-season <year>: score that season instead of 2025 — ONLY with --diagnose (a
   receipt can never be written from a non-held-out scoring population). For 2024 the league
   fits are in-sample; usable for BIAS DIRECTION diagnosis, never for a promotion claim. */
const DIAGNOSE_SEASON = Number(arg("--diagnose-season", "2025"));
/* --present-only: MEASUREMENT lane (requires --diagnose) — scores only players present in the
   boxscore, i.e. treats absent-from-boxscore as void for every family. The committed receipts
   score absent candidates as 0; the truth sits between (absent mixes inactive=void with
   active-no-touch=settles-0, indistinguishable without historical actives). This lane measures
   how much of each family's evidence rests on that branch. */
const PRESENT_ONLY = process.argv.includes("--present-only");
if (PRESENT_ONLY && !DIAGNOSE_DIR) { console.error("REFUSED: --present-only requires --diagnose"); process.exit(1); }
/*
 * P247 — PARTICIPATION-TRUE conditioning: the market-matching population. An absent-from-
 * boxscore candidate resolves through the snap-count ground truth (participation-truth-v1,
 * 99.96% join validation): snaps>0 -> he played, the prop settles 0; no record -> he did not
 * dress, the prop VOIDS and the point is excluded. Present players are scored exactly as
 * before. Measurement via --diagnose, or the governed re-receipt via the named challenger.
 */
/* CHAMPION ADOPTION (P247): the participation-true verdict supersedes the P246 gamma verdict —
   population conditioning AND the deflation parameter both come from it. Fails loudly. */
const ptVerdictPath = path.join(ROOT, "data/internal/research/nfl/reports/participation-true-verdict.json");
const ptVerdict = fs.existsSync(ptVerdictPath) ? JSON.parse(fs.readFileSync(ptVerdictPath, "utf8")) : null;
const PT_ADOPTED = ptVerdict?.verdict === "ACCEPTED";
const PARTICIPATION_TRUE = process.argv.includes("--participation-true") || CHALLENGER === "participation-true-conditioning-v1" || (!CHALLENGER && !DIAGNOSE_DIR && PT_ADOPTED);
let participationBySeason = null;
if (PARTICIPATION_TRUE) {
  participationBySeason = new Map();
  for (const season of [2023, 2024, 2025]) {
    const pp = path.join(ROOT, `data/internal/research/nfl/participation-truth-v1/${season}.json`);
    participationBySeason.set(season, JSON.parse(fs.readFileSync(pp, "utf8")));
  }
}
if (DIAGNOSE_SEASON !== 2025 && !DIAGNOSE_DIR) { console.error("REFUSED: --diagnose-season requires --diagnose"); process.exit(1); }
if (CHALLENGER && !["pass-gamesigma-pooled-mean-v1", "receiving-target-deflation-v1", "props-gamesim-matchup-totals-v1", "pass-starter-conditioning-v1", "participation-true-conditioning-v1"].includes(CHALLENGER)) {
  console.error(`REFUSED: unknown challenger ${CHALLENGER}`); process.exit(1);
}
/* P246 §4.3: gamma for receiving-target-deflation-v1 — a preregistered grid value, threaded
   into fit.dispersion so the ENGINE receives it as fit evidence. Valid only alongside the
   receiving challenger or a --diagnose selection run; the champion path never carries it. */
/* CHAMPION ADOPTION (P246 §4.3): an ACCEPTED deflation gamma is read from the committed
   verdict receipt — parameters are fit evidence, never constants chosen by taste. The default
   path carries it; an explicit --gamma still overrides only in diagnose/challenger lanes. */
const acceptedVerdict = (() => {
  // Direct fs read: the shared `read` helper is declared later in this file, and a try/catch
  // around a TDZ ReferenceError silently disabled adoption on the first run — the parameter
  // must fail LOUDLY if the verdict exists but cannot be parsed.
  const vp = path.join(ROOT, "data/internal/research/nfl/reports/receiving-repair-verdict.json");
  if (!fs.existsSync(vp)) return null;
  return JSON.parse(fs.readFileSync(vp, "utf8"));
})();
const ACCEPTED_GAMMA = acceptedVerdict?.perFamilyVerdicts?.player_receptions?.verdict === "ACCEPTED"
  ? Number(acceptedVerdict.accepted.gamma)
  : null;
const GAMMA = arg("--gamma", null) != null ? Number(arg("--gamma")) : (PT_ADOPTED ? Number(ptVerdict.adopted.targetShareDeflation) : ACCEPTED_GAMMA);
/*
 * P247 Release A — INTEGRATED TOTALS (props-gamesim-matchup-totals-v1): the player chain draws
 * its game total from the SAME matchup head the team artifact publishes (per-game walk-forward
 * mu cut strictly before each game; sigma from the totals receipt) instead of the constant.
 * The bridge derivation says player volumes are total-invariant up to score snapping — this
 * lane exists to PROVE that under the frozen bars (nfl-integration-preregistration.json).
 * Adoption is read from the committed integration verdict and FAILS LOUDLY on an unreadable
 * file (the P246 TDZ silent-no-op lesson).
 */
const totalsReceiptPath = path.join(ROOT, "data/internal/research/nfl/reports/matchup-totals-evaluation.json");
const integrationVerdictPath = path.join(ROOT, "data/internal/research/nfl/reports/props-integration-verdict.json");
const INTEGRATED_ADOPTED = fs.existsSync(integrationVerdictPath)
  ? JSON.parse(fs.readFileSync(integrationVerdictPath, "utf8")).verdict === "ACCEPTED"
  : false;
const USE_MATCHUP_TOTALS = CHALLENGER === "props-gamesim-matchup-totals-v1" || CHALLENGER === "pass-starter-conditioning-v1" || CHALLENGER === "participation-true-conditioning-v1" || (!CHALLENGER && !DIAGNOSE_DIR && INTEGRATED_ADOPTED);
/*
 * P247 Release B (pass-starter-conditioning-v1): pass yards becomes a STARTER-CONDITIONED
 * family — evaluated only for the team's projected starter (previous game's leading passer,
 * walk-forward; season opener falls back to the highest decayed share), with absent-from-
 * boxscore treated as VOID exactly like the existing zero-attempt exclusion, and the starter's
 * effective share floored at the TRAIN mean attempt share of playing starters. All three
 * elements preregistered: pass-starter-conditioning-preregistration.json. The 2023-24 constant
 * is COMPUTED evidence (993/1108 starter-games, mean share 0.9577), not a tuned knob.
 */
const STARTER_CONDITIONED = CHALLENGER === "pass-starter-conditioning-v1";
const TRAIN_STARTER_SHARE = 0.9577;
const lastLeadingPasser = new Map(); // teamAbbr → playerId (walk-forward, updated as games fold)
const totalsReceipt = USE_MATCHUP_TOTALS ? JSON.parse(fs.readFileSync(totalsReceiptPath, "utf8")) : null;
if (USE_MATCHUP_TOTALS && totalsReceipt?.verdict !== "ELIGIBLE") {
  console.error("REFUSED: matchup totals lane needs an ELIGIBLE totals receipt"); process.exit(1);
}
if (GAMMA != null && !(GAMMA > 0.8 && GAMMA <= 1)) { console.error("REFUSED: --gamma outside (0.8, 1]"); process.exit(1); }
if (arg("--gamma", null) != null && !DIAGNOSE_DIR && !["receiving-target-deflation-v1", "participation-true-conditioning-v1"].includes(CHALLENGER)) {
  console.error("REFUSED: --gamma requires --diagnose (selection) or a challenger whose protocol selects it"); process.exit(1);
}
if (CHALLENGER === "receiving-target-deflation-v1" && GAMMA == null) {
  console.error("REFUSED: the receiving challenger needs the selected --gamma"); process.exit(1);
}

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

// ------------------------------------------------------------------ corpus (pinned) + joins
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

const schedule = read(path.join(APP, "public/data/nfl/schedule/latest.json"));
const nameToAbbr = new Map();
for (const r of schedule.rows) { nameToAbbr.set(r.home.name, r.home.abbr); nameToAbbr.set(r.away.name, r.away.abbr); }
if (new Set(nameToAbbr.values()).size < 32) { console.error("REFUSED: name→abbr map covers <32 teams (the P170-B join lesson)"); process.exit(2); }

// finals rows for Elo strength (full names, same namespace as game home/away)
const finals = read(path.join(ROOT, "data/internal/research/nfl/corpus-v1.json")).rows;

// ------------------------------------------------------------------ 1. fit on 2023–24
const train = games.filter((g) => g.season <= 2024);
const test = games.filter((g) => g.season === DIAGNOSE_SEASON);

// 1a. game-script volume model: OLS attempts = a0 + a1·ownMargin
function fitVolume(rowsOf) {
  const obs = [];
  for (const g of train) {
    const homeAbbr = nameToAbbr.get(g.home);
    const awayAbbr = nameToAbbr.get(g.away);
    if (!homeAbbr || !awayAbbr) continue;
    for (const [abbr, own, opp] of [[homeAbbr, g.ftHome, g.ftAway], [awayAbbr, g.ftAway, g.ftHome]]) {
      const { totals } = teamGameTotals(g, abbr);
      const y = rowsOf(totals);
      if (y > 0) obs.push({ x: own - opp, y });
    }
  }
  const n = obs.length;
  const mx = obs.reduce((s, o) => s + o.x, 0) / n;
  const my = obs.reduce((s, o) => s + o.y, 0) / n;
  let sxy = 0; let sxx = 0;
  for (const o of obs) { sxy += (o.x - mx) * (o.y - my); sxx += (o.x - mx) ** 2; }
  const a1 = sxy / sxx;
  const a0 = my - a1 * mx;
  const sigma = Math.sqrt(obs.reduce((s, o) => s + (o.y - a0 - a1 * o.x) ** 2, 0) / (n - 2));
  return { a0: Number(a0.toFixed(4)), a1: Number(a1.toFixed(5)), sigma: Number(sigma.toFixed(4)), n };
}
const volume = { pass: fitVolume((t) => t.passAttempts), rush: fitVolume((t) => t.rushAttempts) };

// 1b. league per-opportunity rates (train Σ-ratios)
const sums = { rec: 0, targets: 0, recYds: 0, rushYds: 0, rushAtt: 0, passCmp: 0, passAtt: 0, passYds: 0, passInt: 0 };
for (const g of train) for (const p of g.players ?? []) {
  sums.rec += p.rec ?? 0; sums.targets += p.targets ?? 0; sums.recYds += p.recYds ?? 0;
  sums.rushYds += p.rushYds ?? 0; sums.rushAtt += p.rushAtt ?? 0;
  sums.passCmp += p.passCmp ?? 0; sums.passAtt += p.passAtt ?? 0; sums.passYds += p.passYds ?? 0; sums.passInt += p.passInt ?? 0;
}
const league = {
  catchRate: Number((sums.rec / sums.targets).toFixed(5)),
  ypr: Number((sums.recYds / sums.rec).toFixed(4)),
  ypc: Number((sums.rushYds / sums.rushAtt).toFixed(4)),
  compRate: Number((sums.passCmp / sums.passAtt).toFixed(5)),
  ypcmp: Number((sums.passYds / sums.passCmp).toFixed(4)),
  intRate: Number((sums.passInt / sums.passAtt).toFixed(5)),
};

// 1c. Gamma dispersion shapes by method of moments: Var(Y|n) = n·ypo²/κ  ⇒  κ = Σ n·ypo² / Σ (y − n·ypo)²
function fitShape(oppOf, ydsOf) {
  const perPlayer = new Map();
  for (const g of train) for (const p of g.players ?? []) {
    const n = oppOf(p); const y = ydsOf(p);
    if (!(n > 0)) continue;
    const acc = perPlayer.get(p.playerId) ?? { n: 0, y: 0, games: [] };
    acc.n += n; acc.y += y; acc.games.push({ n, y });
    perPlayer.set(p.playerId, acc);
  }
  let num = 0; let den = 0;
  for (const acc of perPlayer.values()) {
    if (acc.n < 30) continue; // stable per-opportunity mean first
    const ypo = acc.y / acc.n;
    for (const gm of acc.games) { num += gm.n * ypo * ypo; den += (gm.y - gm.n * ypo) ** 2; }
  }
  return Number(Math.min(30, Math.max(0.5, num / den)).toFixed(4));
}
// 1d. role-volatility concentration κ per family (Dirichlet-multinomial, MoM on train stints):
// excess of observed per-game share variance beyond binomial ⇒ (κ+1) = (1−1/N̄)·ŝ(1−ŝ)/excess.
function fitAllocKappa(family) {
  const state = new Map(); // playerId → {team, obs: [{share, N}]}
  const kappas = [];
  for (const g of train) {
    for (const abbr of new Set((g.players ?? []).map((p) => p.teamAbbr))) {
      const { totals, rows } = teamGameTotals(g, abbr);
      if (!(totals[family] > 0)) continue;
      for (const r of rows) {
        let st = state.get(r.playerId);
        if (!st || st.team !== r.teamAbbr) { st = { team: r.teamAbbr, obs: [] }; state.set(r.playerId, st); }
        st.obs.push({ share: familyNumerator(r, family) / totals[family], N: totals[family] });
      }
    }
  }
  for (const st of state.values()) {
    if (st.obs.length < 8) continue;
    const s = st.obs.reduce((a, o) => a + o.share, 0) / st.obs.length;
    if (s < 0.03) continue;
    const nBar = st.obs.reduce((a, o) => a + o.N, 0) / st.obs.length;
    const varObs = st.obs.reduce((a, o) => a + (o.share - s) ** 2, 0) / (st.obs.length - 1);
    const excess = varObs - (s * (1 - s)) / nBar;
    if (excess <= 0) continue;
    kappas.push(((1 - 1 / nBar) * s * (1 - s)) / excess - 1);
  }
  kappas.sort((a, b) => a - b);
  const median = kappas.length ? kappas[Math.floor(kappas.length / 2)] : 100;
  return Number(Math.min(500, Math.max(2, median)).toFixed(2));
}

// 1e. per-game efficiency lognormal σ per yardage market (MoM: excess per-game ypo variance
// beyond the Gamma-implied component, pooled as a robust median over qualifying players).
function fitGameSigma(oppOf, ydsOf, shape) {
  const perPlayer = new Map();
  for (const g of train) for (const p of g.players ?? []) {
    const n = oppOf(p);
    if (!(n >= 3)) continue;
    const acc = perPlayer.get(p.playerId) ?? [];
    acc.push({ n, y: ydsOf(p) ?? 0 });
    perPlayer.set(p.playerId, acc);
  }
  const sigmas = [];
  for (const gamesArr of perPlayer.values()) {
    if (gamesArr.length < 8) continue;
    const totOpp = gamesArr.reduce((s, o) => s + o.n, 0);
    const ypo = gamesArr.reduce((s, o) => s + o.y, 0) / totOpp;
    if (!(ypo > 0)) continue;
    const ypoG = gamesArr.map((o) => o.y / o.n);
    const varObs = ypoG.reduce((s, v) => s + (v - ypo) ** 2, 0) / (gamesArr.length - 1);
    const gammaVar = gamesArr.reduce((s, o) => s + (ypo * ypo) / (shape * o.n), 0) / gamesArr.length;
    const excessRatio = Math.max(0, varObs - gammaVar) / (ypo * ypo);
    sigmas.push(Math.sqrt(Math.log(1 + excessRatio)));
  }
  sigmas.sort((a, b) => a - b);
  const median = sigmas.length ? sigmas[Math.floor(sigmas.length / 2)] : 0;
  return Number(Math.min(0.8, Math.max(0, median)).toFixed(4));
}

/*
 * P246 §4.2 candidate estimator: same qualification and per-player excessRatio as the champion,
 * pooled by a GAMES-WEIGHTED MEAN of excessRatio (weight = qualifying games) instead of the
 * unweighted median of per-player sigma. The median deleted the game-level efficiency term for
 * every family (all three gameSigma = 0); passing yards is where that term dominates.
 */
function fitGameSigmaPooledMean(oppOf, ydsOf, shape) {
  const perPlayer = new Map();
  for (const g of train) for (const p of g.players ?? []) {
    const n = oppOf(p);
    if (!(n >= 3)) continue;
    const acc = perPlayer.get(p.playerId) ?? [];
    acc.push({ n, y: ydsOf(p) ?? 0 });
    perPlayer.set(p.playerId, acc);
  }
  let wSum = 0;
  let wTot = 0;
  for (const gamesArr of perPlayer.values()) {
    if (gamesArr.length < 8) continue;
    const totOpp = gamesArr.reduce((s, o) => s + o.n, 0);
    const ypo = gamesArr.reduce((s, o) => s + o.y, 0) / totOpp;
    if (!(ypo > 0)) continue;
    const ypoG = gamesArr.map((o) => o.y / o.n);
    const varObs = ypoG.reduce((s, v) => s + (v - ypo) ** 2, 0) / (gamesArr.length - 1);
    const gammaVar = gamesArr.reduce((s, o) => s + (ypo * ypo) / (shape * o.n), 0) / gamesArr.length;
    const excessRatio = Math.max(0, varObs - gammaVar) / (ypo * ypo);
    wSum += excessRatio * gamesArr.length;
    wTot += gamesArr.length;
  }
  const pooled = wTot ? wSum / wTot : 0;
  return Number(Math.min(0.8, Math.max(0, Math.sqrt(Math.log(1 + pooled)))).toFixed(4));
}

const recShape = fitShape((p) => p.rec ?? 0, (p) => p.recYds ?? 0);
const rushShape = fitShape((p) => p.rushAtt ?? 0, (p) => p.rushYds ?? 0);
const passShape = fitShape((p) => p.passCmp ?? 0, (p) => p.passYds ?? 0);
const dispersion = {
  recShape, rushShape, passShape,
  allocKappa: {
    passAttempts: fitAllocKappa("passAttempts"),
    rushAttempts: fitAllocKappa("rushAttempts"),
    targets: fitAllocKappa("targets"),
  },
  ...(GAMMA != null && GAMMA !== 1 ? { targetShareDeflation: GAMMA } : {}),
  gameSigma: {
    player_pass_yds: CHALLENGER === "pass-gamesigma-pooled-mean-v1"
      ? fitGameSigmaPooledMean((p) => p.passCmp ?? 0, (p) => p.passYds, passShape)
      : fitGameSigma((p) => p.passCmp ?? 0, (p) => p.passYds, passShape),
    player_rush_yds: fitGameSigma((p) => p.rushAtt ?? 0, (p) => p.rushYds, rushShape),
    player_reception_yds: fitGameSigma((p) => p.rec ?? 0, (p) => p.recYds, recShape),
  },
};

// gamesim heads: copied VERBATIM from the committed model-v1 receipt (never refit here)
const modelReceipt = read(path.join(ROOT, "data/internal/research/nfl/reports/model-v1-evaluation.json"));
const gamesim = {
  marginSlope: modelReceipt.fitParams.marginSlope,
  sigmaMargin: modelReceipt.fitParams.sigmaMargin,
  muTotal: modelReceipt.fitParams.muTotal,
  sigmaTotal: modelReceipt.fitParams.sigmaTotal,
  source: "data/internal/research/nfl/reports/model-v1-evaluation.json (committed P167-E fit, copied verbatim)",
};

// ------------------------------------------------------------------ 2. walk-forward state machinery
const RATE_HL = 8;
const BOUNDARY = 0.25; // Release A's walk-forward-selected boundary decay
const RATE_DEFS = {
  catchRate: { s: (p) => p.rec ?? 0, t: (p) => p.targets ?? 0, league: league.catchRate },
  ypr: { s: (p) => p.recYds ?? 0, t: (p) => p.rec ?? 0, league: league.ypr },
  ypc: { s: (p) => p.rushYds ?? 0, t: (p) => p.rushAtt ?? 0, league: league.ypc },
  compRate: { s: (p) => p.passCmp ?? 0, t: (p) => p.passAtt ?? 0, league: league.compRate },
  ypcmp: { s: (p) => p.passYds ?? 0, t: (p) => p.passCmp ?? 0, league: league.ypcmp },
  intRate: { s: (p) => p.passInt ?? 0, t: (p) => p.passAtt ?? 0, league: league.intRate },
};

function newState() { return new Map(); } // playerId → {team, shares:{fam:[{share,season}]}, rates:{key:[{success,trials,season}]}, recent:{market:[values]}}
function foldGame(state, g) {
  for (const abbr of new Set((g.players ?? []).map((p) => p.teamAbbr))) {
    const { totals, rows } = teamGameTotals(g, abbr);
    const lead = rows.reduce((best, r) => ((r.passAtt ?? 0) > ((best?.passAtt ?? 0)) ? r : best), null);
    if (lead && (lead.passAtt ?? 0) > 0) lastLeadingPasser.set(abbr, lead.playerId);
    for (const r of rows) {
      let st = state.get(r.playerId);
      if (!st || st.team !== r.teamAbbr) { st = { team: r.teamAbbr, shares: {}, rates: {}, recent: {} }; state.set(r.playerId, st); }
      if (r.name) st.name = r.name; // last seen name — the participation-truth join key
      for (const fam of SHARE_FAMILIES) {
        if (!(totals[fam] > 0)) continue;
        (st.shares[fam] ??= []).push({ share: familyNumerator(r, fam) / totals[fam], season: g.season });
      }
      for (const [key, def] of Object.entries(RATE_DEFS)) {
        const trials = def.t(r);
        if (trials > 0) (st.rates[key] ??= []).push({ success: def.s(r), trials, season: g.season });
      }
      const actuals = { player_pass_yds: r.passYds, player_rush_yds: r.rushYds, player_reception_yds: r.recYds, player_receptions: r.rec };
      for (const [mkt, v] of Object.entries(actuals)) if (v != null) (st.recent[mkt] ??= []).push(v);
    }
  }
}

// m (rate shrink pseudo-trials) selected by walk-forward inside 2023–24: weighted MAE of
// per-opportunity rate predictions on 2024 (weights = trials).
function selectRateM() {
  const grid = [10, 25, 60];
  const err = new Map(grid.map((m) => [m, { sum: 0, w: 0 }]));
  const state = newState();
  for (const g of train) {
    if (g.season === 2024) {
      for (const p of g.players ?? []) {
        const st = state.get(p.playerId);
        if (!st || st.team !== p.teamAbbr) continue;
        for (const [key, def] of Object.entries(RATE_DEFS)) {
          const trials = def.t(p);
          if (!(trials > 0) || !st.rates[key]?.length) continue;
          const realized = def.s(p) / trials;
          for (const m of grid) {
            const { rate } = shrunkRate({ observations: st.rates[key], predictSeason: g.season, halfLifeGames: RATE_HL, boundaryDecay: BOUNDARY, priorTrials: m, leagueRate: def.league });
            const e = err.get(m);
            e.sum += Math.abs(rate - realized) * trials;
            e.w += trials;
          }
        }
      }
    }
    foldGame(state, g);
  }
  return grid.map((m) => ({ m, mae: err.get(m).sum / err.get(m).w })).sort((a, b) => a.mae - b.mae);
}
const rateSelection = selectRateM();
const RATE_M = rateSelection[0].m;

// ------------------------------------------------------------------ 3. held-out 2025 evaluation
const fit = { gamesim, volume, dispersion, league, rates: { halfLifeGames: RATE_HL, boundaryDecay: BOUNDARY, priorTrials: RATE_M }, receipt: "in-flight" };
const shareParams = { halfLifeGames: 4, shrinkK: 0.5, boundaryDecay: BOUNDARY }; // Release A's committed selection

const THRESH = { qbShare: 0.3, carryShare: 0.05, targetShare: 0.05 };
function candidatesFor(state, abbr, season) {
  const players = [];
  for (const [playerId, st] of state) {
    if (st.team !== abbr) continue;
    const share = (fam) => (st.shares[fam]?.length ? decayedShare({ observations: st.shares[fam], predictSeason: season, ...shareParams }).share : 0);
    const rate = (key) => shrunkRate({ observations: st.rates[key] ?? [], predictSeason: season, halfLifeGames: RATE_HL, boundaryDecay: BOUNDARY, priorTrials: RATE_M, leagueRate: RATE_DEFS[key].league }).rate;
    const qbShare = share("passAttempts");
    const carryShare = share("rushAttempts");
    const targetShare = share("targets");
    const families = new Set();
    if (qbShare >= THRESH.qbShare) families.add("passAttempts");
    if (carryShare >= THRESH.carryShare) families.add("rushAttempts");
    if (targetShare >= THRESH.targetShare) families.add("targets");
    if (!families.size) continue;
    players.push({
      playerId, name: st.name ?? null, families, qbShare, carryShare, targetShare,
      share: Math.max(qbShare, carryShare, targetShare),
      compRate: rate("compRate"), ypcmp: rate("ypcmp"), catchRate: rate("catchRate"), ypr: rate("ypr"), ypc: rate("ypc"), intRate: rate("intRate"),
      shareBasis: "walk-forward corpus role", recent: st.recent,
    });
  }
  return players;
}

const MARKET_ACTUAL = {
  player_pass_yds: (p) => ((p.passAtt ?? 0) > 0 ? p.passYds ?? 0 : null),
  player_rush_yds: (p) => ((p.rushAtt ?? 0) > 0 || (p.targets ?? 0) > 0 ? p.rushYds ?? 0 : null),
  player_reception_yds: (p) => ((p.targets ?? 0) > 0 || (p.rushAtt ?? 0) > 0 ? p.recYds ?? 0 : null),
  player_receptions: (p) => ((p.targets ?? 0) > 0 || (p.rushAtt ?? 0) > 0 ? p.rec ?? 0 : null),
};
const MARKET_FAMILY = { player_pass_yds: "passAttempts", player_rush_yds: "rushAttempts", player_reception_yds: "targets", player_receptions: "targets" };

/* P247 Release B: per-point diagnostic rows (diagnose lane only) — signed residuals, workload,
   quantiles and role rank, so the pass-yds failure can be DECOMPOSED instead of inferred from
   aggregate MAE. Never written outside --diagnose. */
const diagnosticsPoints = [];
const popAccounting = newPopulationAccounting();
const metrics = {};
for (const mkt of PROP_MARKETS) metrics[mkt] = { n: 0, mae: 0, rmse: 0, pinball: 0, cover80: 0, base: { rolling4: 0, shareVol: 0, trailing8Pinball: 0, trailing8Cover: 0, trailing8N: 0, tierMae: 0 }, cal: [] };
const tierMeans = (() => { // train league means by within-team share rank (naive role-tier baseline)
  const t = { player_pass_yds: [246], player_rush_yds: [55, 25, 10], player_reception_yds: [55, 40, 30, 22, 15], player_receptions: [4.5, 3.5, 2.8, 2.2, 1.6] };
  return (mkt, rank) => t[mkt][Math.min(rank, t[mkt].length - 1)];
})();

const state = newState();
for (const g of train) foldGame(state, g); // full 2023-24 history enters 2025 (boundary-decayed at predict time)
let evaluated = 0;
let realizedVolumeCovered = { covered: 0, total: 0 };
for (const g of test) {
  const homeAbbr = nameToAbbr.get(g.home);
  const awayAbbr = nameToAbbr.get(g.away);
  /* Integrated totals: per-game mu from ratings folding ONLY finals strictly before this
     kickoff (walk-forward, same recurrence and receipt the team builder uses). g.home/g.away
     are full names — the corpus namespace the ratings are keyed by. */
  const gameFit = (() => {
    if (!USE_MATCHUP_TOTALS) return fit;
    const ts = totalsStateAt({ rows: finals, cutoffIso: g.dateUtc, receipt: totalsReceipt });
    if (ts.state !== "READY") { console.error(`REFUSED: totals state ${ts.reason} at ${g.dateUtc}`); process.exit(1); }
    return { ...fit, gamesim: { ...fit.gamesim, muTotal: ts.muFor(g.home, g.away), sigmaTotal: ts.sigma } };
  })();
  if (homeAbbr && awayAbbr) {
    const strength = strengthStateAt({ rows: finals.filter((r) => r.dateUtc < g.dateUtc), cutoffIso: g.dateUtc });
    // strength rows use full names — wrap ratingFor so abbr lookups resolve through the map
    const byName = strength.ratingFor;
    const abbrToName = new Map([[homeAbbr, g.home], [awayAbbr, g.away]]);
    const wrapped = { ...strength, ratingFor: (t) => byName(abbrToName.get(t) ?? t) };
    for (const abbr of [homeAbbr, awayAbbr]) {
      const cands = candidatesFor(state, abbr, g.season);
      if (!cands.length) continue;
      /* Projected starter: last game's leading passer if he is a candidate; else top qbShare. */
      const starterId = STARTER_CONDITIONED
        ? (cands.some((c) => c.playerId === lastLeadingPasser.get(abbr))
            ? lastLeadingPasser.get(abbr)
            : cands.filter((c) => (c.qbShare ?? 0) > 0).sort((a, b) => (b.qbShare ?? 0) - (a.qbShare ?? 0))[0]?.playerId ?? null)
        : null;
      if (STARTER_CONDITIONED && starterId != null) {
        for (const c of cands) {
          if (c.playerId === starterId) c.qbShare = Math.max(c.qbShare ?? 0, TRAIN_STARTER_SHARE);
        }
      }
      const linesProxy = {};
      for (const c of cands) {
        for (const mkt of PROP_MARKETS) {
          const r4 = (c.recent[mkt] ?? []).slice(-4);
          if (r4.length === 4) {
            const proxy = r4.reduce((a, b) => a + b, 0) / 4;
            if (proxy > 0) (linesProxy[c.playerId] ??= {})[mkt] = proxy;
          }
        }
      }
      const sim = simulatePlayerProps({
        event: { providerEventId: g.providerEventId, home: { abbr: homeAbbr }, away: { abbr: awayAbbr }, seasonType: g.seasonType },
        teamAbbr: abbr, fit: gameFit, strengthState: wrapped,
        roleRates: { players: cands }, artifactDate: g.dateUtc.slice(0, 10), runs: RUNS, lines: linesProxy,
      });
      if (sim.state !== "SIMULATED") continue;
      const rowsByPlayer = new Map((g.players ?? []).filter((p) => p.teamAbbr === abbr).map((p) => [p.playerId, p]));
      for (const simP of sim.players) {
        const cand = cands.find((c) => c.playerId === simP.playerId);
        const actualRow = rowsByPlayer.get(simP.playerId);
        for (const [mkt, dist] of Object.entries(simP.markets)) {
          if (!PROP_MARKETS.includes(mkt)) continue;
          if (STARTER_CONDITIONED && mkt === "player_pass_yds") {
            if (simP.playerId !== starterId) continue; // starter-conditioned family: one row per team
            if (!actualRow) continue; // absent from the boxscore = VOID, same as the zero-attempt rule
          }
          if (PRESENT_ONLY && !actualRow) continue;
          /*
           * P248 A1: the POPULATION CONTRACT owns every absent-candidate decision. The previous
           * inline rule collapsed DID_NOT_DRESS, AMBIGUOUS_IDENTITY and SOURCE_MISSING into one
           * "no snaps -> void" branch; the contract types them, scores dressed-no-row players
           * as real zeros, voids only genuine DNPs, EXCLUDES (and counts) the rest.
           */
          let absentActual = null;
          if (PARTICIPATION_TRUE && !actualRow) {
            const part = participationBySeason.get(g.season);
            const cls = classifyParticipation({ part, game: g, teamAbbr: abbr, playerName: cand.name ?? "" });
            const out = outcomeForAbsentCandidate(cls);
            if (out.kind === "VOID") { popAccounting.voidDidNotDress += 1; continue; }
            if (out.kind === "EXCLUDED") {
              if (cls.state === "AMBIGUOUS_IDENTITY") popAccounting.excludedAmbiguous += 1;
              else popAccounting.excludedSourceMissing += 1;
              continue;
            }
            popAccounting.scoredPlayedNoRow += 1;
            absentActual = out.actual;
          }
          const actual = actualRow
            ? MARKET_ACTUAL[mkt](actualRow)
            : (PARTICIPATION_TRUE ? absentActual : (cand.families.has(MARKET_FAMILY[mkt]) ? 0 : null));
          if (actual == null) continue; // zero-opportunity appearance — the family's own row rule voids it
          if (actualRow) popAccounting.scoredWithRow += 1;
          const m = metrics[mkt];
          m.n += 1;
          evaluated += 1;
          const err = dist.mean - actual;
          m.mae += Math.abs(err);
          m.rmse += err * err;
          const qs = [[0.10, dist.p10], [0.25, dist.p25], [0.50, dist.median], [0.75, dist.p75], [0.90, dist.p90]];
          m.pinball += qs.reduce((s, [q, v]) => s + (actual >= v ? q * (actual - v) : (1 - q) * (v - actual)), 0) / qs.length;
          /* Contract v2.1 (preregistered): COUNT families score coverage MID-P — an indivisible
             endpoint mass counts half, making nominal 80% attainable on small integers. Continuous
             families are unchanged. */
          const isCount = mkt === "player_receptions";
          const insideInclusive = actual >= dist.p10 && actual <= dist.p90 ? 1 : 0;
          m.cover80Inclusive = (m.cover80Inclusive ?? 0) + insideInclusive;
          if (isCount && (actual === dist.p10 || actual === dist.p90)) m.cover80 += 0.5;
          else m.cover80 += insideInclusive;
          if (DIAGNOSE_DIR) {
            const famD = MARKET_FAMILY[mkt];
            const shareD = famD === "passAttempts" ? cand.qbShare : famD === "rushAttempts" ? cand.carryShare : cand.targetShare;
            const rankD = cands.filter((c) => c.families.has(famD)).sort((a, b) => b.share - a.share).findIndex((c) => c.playerId === simP.playerId);
            diagnosticsPoints.push({
              mkt, playerId: simP.playerId, gameId: g.providerEventId, date: g.dateUtc.slice(0, 10), team: abbr,
              share: Number((shareD ?? 0).toFixed(4)), roleRank: rankD,
              pred: { mean: Number(dist.mean.toFixed(2)), p10: dist.p10, p25: dist.p25, p50: dist.median, p75: dist.p75, p90: dist.p90 },
              actual,
              actualOpp: famD === "passAttempts" ? (actualRow?.passAtt ?? 0) : famD === "rushAttempts" ? (actualRow?.rushAtt ?? 0) : (actualRow?.targets ?? 0),
              actualSecondary: mkt === "player_pass_yds" ? (actualRow?.passCmp ?? 0) : null,
              absent: !actualRow,
            });
          }
          const recent = (cand.recent[mkt] ?? []);
          const r4 = recent.slice(-4);
          const rolling4 = r4.length ? r4.reduce((a, b) => a + b, 0) / r4.length : 0;
          m.base.rolling4 += Math.abs(rolling4 - actual);
          const fam = MARKET_FAMILY[mkt];
          const share = fam === "passAttempts" ? cand.qbShare : fam === "rushAttempts" ? cand.carryShare : cand.targetShare;
          const vol = fam === "rushAttempts" ? volume.rush.a0 : volume.pass.a0;
          const perOpp = mkt === "player_pass_yds" ? league.compRate * league.ypcmp : mkt === "player_rush_yds" ? league.ypc : mkt === "player_reception_yds" ? league.catchRate * league.ypr : league.catchRate;
          m.base.shareVol += Math.abs(share * vol * perOpp - actual);
          const t8 = recent.slice(-8).sort((a, b) => a - b);
          if (t8.length >= 4) {
            const tq = (p) => t8[Math.min(t8.length - 1, Math.floor(p * t8.length))];
            m.base.trailing8Pinball += qs.map(([q]) => q).reduce((s, q) => { const v = tq(q); return s + (actual >= v ? q * (actual - v) : (1 - q) * (v - actual)); }, 0) / 5;
            m.base.trailing8Cover += actual >= tq(0.10) && actual <= tq(0.90) ? 1 : 0;
            m.base.trailing8N += 1;
          }
          const rank = cands.filter((c) => c.families.has(fam)).sort((a, b) => b.share - a.share).findIndex((c) => c.playerId === simP.playerId);
          m.base.tierMae += Math.abs(tierMeans(mkt, Math.max(0, rank)) - actual);
          if (typeof dist.line === "number") {
            m.cal.push({ p: dist.probOverLine, hit: actual > dist.line ? 1 : 0 });
          }
        }
      }
      // realized-volume coverage: how much of the team's actual yards the evaluated pool covered
      const teamRows = [...rowsByPlayer.values()];
      const totalYds = teamRows.reduce((s, p) => s + (p.recYds ?? 0) + (p.rushYds ?? 0), 0);
      const coveredYds = teamRows.filter((p) => cands.some((c) => c.playerId === p.playerId)).reduce((s, p) => s + (p.recYds ?? 0) + (p.rushYds ?? 0), 0);
      realizedVolumeCovered.covered += coveredYds;
      realizedVolumeCovered.total += totalYds;
    }
  }
  foldGame(state, g);
}

// finalize metrics + ECE + promotion
const diagnosticsBins = {};
const table = {};
for (const mkt of PROP_MARKETS) {
  const m = metrics[mkt];
  const n = m.n || 1;
  const bins = Array.from({ length: 10 }, () => ({ p: 0, hit: 0, n: 0 }));
  for (const c of m.cal) { const b = bins[Math.min(9, Math.floor(c.p * 10))]; b.p += c.p; b.hit += c.hit; b.n += 1; }
  const usable = bins.filter((b) => b.n >= 50);
  const usableN = usable.reduce((s, b) => s + b.n, 0);
  const ece = usableN ? Number(usable.reduce((s, b) => s + (b.n / usableN) * Math.abs(b.p / b.n - b.hit / b.n), 0).toFixed(4)) : null;
  if (DIAGNOSE_DIR) {
    diagnosticsBins[mkt] = bins.map((b, i) => ({
      bin: `${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}`,
      n: b.n,
      meanPredicted: b.n ? Number((b.p / b.n).toFixed(4)) : null,
      observedHitRate: b.n ? Number((b.hit / b.n).toFixed(4)) : null,
    }));
  }
  table[mkt] = {
    n: m.n,
    mae: Number((m.mae / n).toFixed(3)),
    rmse: Number(Math.sqrt(m.rmse / n).toFixed(3)),
    pinball: Number((m.pinball / n).toFixed(3)),
    interval80Coverage: Number((m.cover80 / n).toFixed(4)),
    /* BOTH conventions on the receipt (P249): the gate uses mid-p for count families (contract
       v2.1); the inclusive number is what the DISPLAYED [p10, p90] empirically contains — the
       two are not interchangeable and neither may impersonate the other. */
    interval80CoverageInclusive: Number(((m.cover80Inclusive ?? 0) / n).toFixed(4)),
    thresholdCalibration: { pairs: m.cal.length, binsUsed: usable.length, ece },
    baselines: {
      rolling4Mae: Number((m.base.rolling4 / n).toFixed(3)),
      shareVolMae: Number((m.base.shareVol / n).toFixed(3)),
      roleTierMae: Number((m.base.tierMae / n).toFixed(3)),
      trailing8Pinball: m.base.trailing8N ? Number((m.base.trailing8Pinball / m.base.trailing8N).toFixed(3)) : null,
      trailing8Cover80: m.base.trailing8N ? Number((m.base.trailing8Cover / m.base.trailing8N).toFixed(4)) : null,
      trailing8N: m.base.trailing8N,
    },
  };
}

// PROMOTION POLICY (written, applied by code): see receipt.promotionPolicy verbatim.
const promotion = {};
for (const mkt of PROP_MARKETS) {
  const t = table[mkt];
  const beatsRolling = t.mae < t.baselines.rolling4Mae;
  const beatsShareVol = t.mae < t.baselines.shareVolMae;
  const coverOk = t.interval80Coverage >= 0.72 && t.interval80Coverage <= 0.88;
  const coverLoose = t.interval80Coverage >= 0.68 && t.interval80Coverage <= 0.92;
  const calOk = t.thresholdCalibration.ece != null && t.thresholdCalibration.ece <= 0.05;
  const enoughN = t.n >= 300;
  let state2 = "RESEARCH_ONLY";
  if (beatsRolling && beatsShareVol && coverOk && calOk && enoughN) state2 = "PUBLIC_ELIGIBLE";
  else if ((beatsRolling || beatsShareVol) && coverLoose && enoughN) state2 = "SHADOW_ELIGIBLE";
  promotion[mkt] = { state: state2, evidence: { beatsRolling, beatsShareVol, coverOk, calOk, n: t.n } };
}
promotion.player_pass_int = { state: "RESEARCH_ONLY", evidence: { note: "simulated component, never separately evaluated — cannot promote" } };

const receipt = {
  schemaVersion: 1,
  artifact: "nfl-player-props-v1-evaluation",
  gamesimTotals: USE_MATCHUP_TOTALS ? "matchup-totals-v1-decayed-points (integrated)" : "constant (model-v1 shared prior)",
  conditioning: PARTICIPATION_TRUE ? "participation-true (DNP=void via participation-truth-v1)" : "absent-as-zero (legacy)",
  populationContractVersion: PARTICIPATION_TRUE ? POPULATION_CONTRACT_VERSION : null,
  coverageMeasurement: "v2.1: mid-p for count families (player_receptions); inclusive for continuous families",
  populationAccounting: PARTICIPATION_TRUE ? popAccounting : null,
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  engine: { id: NFL_PLAYER_PROPS_ID, version: 1 },
  corpusAccounting: seasons.map((s) => ({ season: s.season, games: s.games.length, contentHash: s.contentHash })),
  protocol: {
    fit: "2023–24 REG+POST only: game-script volume OLS, league Σ-rates, Gamma dispersion (MoM, ≥30-opportunity players), rate shrink m walk-forward-selected inside 2023–24",
    test: "held-out 2025, fully pre-game walk-forward chain (roles, rates, Elo cutoff, committed game-sim heads), sampled distributions, baselines on identical points",
    runs: RUNS,
    thresholds: THRESH,
  },
  fit: { gamesim, volume, dispersion, league, rates: { halfLifeGames: RATE_HL, boundaryDecay: BOUNDARY, priorTrials: RATE_M, selection: rateSelection.map((r) => ({ m: r.m, mae: Number(r.mae.toFixed(5)) })) } },
  heldOut2025: { evaluatedPlayerMarkets: evaluated, realizedYardageCoverage: Number((realizedVolumeCovered.covered / realizedVolumeCovered.total).toFixed(4)), table },
  promotionPolicy: [
    "PUBLIC_ELIGIBLE: beats rolling-4 AND share×volume on MAE; interval80 coverage in [0.72,0.88]; threshold ECE ≤ 0.05; n ≥ 300 — runtime role/line/settlement gates still apply",
    "SHADOW_ELIGIBLE: beats ≥1 point baseline; coverage in [0.68,0.92]; n ≥ 300",
    "RESEARCH_ONLY otherwise; promotion of one market never promotes siblings",
    "preseason events: every player market ABSTAINS regardless (participation contract), evidenceTier REDUCED_PRESEASON",
  ],
  promotion,
  honesty: [
    "distributions are opportunity×efficiency conditioned on the committed game-sim stream — no odds parameter exists anywhere in the engine (source-scan pinned)",
    "multinomial allocation reconciles player opportunities to team volumes per iteration by construction",
    "threshold calibration uses the rolling-4 mean as the line proxy (no historical sportsbook lines exist in this repo); P(over) is read off the true sampled distribution as a post-sampling read-out",
    "rush yards are Gamma (non-negative): true negative rushing games exist and are outside v1 support — a stated limitation",
  ],
};
const OUT = DIAGNOSE_DIR
  ? null
  : CHALLENGER === "receiving-target-deflation-v1"
    ? "data/internal/research/nfl/reports/receiving-repair-evaluation.json"
    : CHALLENGER === "participation-true-conditioning-v1"
    ? "data/internal/research/nfl/reports/participation-true-evaluation.json"
    : CHALLENGER === "pass-starter-conditioning-v1"
      ? "data/internal/research/nfl/reports/pass-starter-evaluation.json"
    : CHALLENGER === "props-gamesim-matchup-totals-v1"
      ? "data/internal/research/nfl/reports/props-integration-evaluation.json"
      : CHALLENGER
        ? "data/internal/research/nfl/reports/pass-yds-repair-evaluation.json"
        : "data/internal/research/nfl/reports/player-props-v1-evaluation.json";
if (CHALLENGER) {
  receipt.artifact = "nfl-pass-yds-repair-evaluation";
  receipt.challenger = CHALLENGER === "participation-true-conditioning-v1"
    ? {
        id: CHALLENGER,
        preregistration: "data/internal/research/nfl/reports/participation-true-preregistration.json",
        champion: "data/internal/research/nfl/reports/player-props-v1-evaluation.json",
        scope: "evaluation POPULATION only — market-true void conditioning via snap-count ground truth; every model parameter identical to the integrated champion",
      }
    : CHALLENGER === "pass-starter-conditioning-v1"
    ? {
        id: CHALLENGER,
        preregistration: "data/internal/research/nfl/reports/pass-starter-conditioning-preregistration.json",
        champion: "data/internal/research/nfl/reports/player-props-v1-evaluation.json",
        scope: "player_pass_yds only: starter-conditioned eligibility, absent=void, train share floor 0.9577; integrated totals as adopted",
      }
    : CHALLENGER === "props-gamesim-matchup-totals-v1"
    ? {
        id: CHALLENGER,
        preregistration: "data/internal/research/nfl/reports/nfl-integration-preregistration.json",
        champion: "data/internal/research/nfl/reports/player-props-v1-evaluation.json",
        scope: "gamesim totals input only: per-game matchup mu + receipt sigma replace the constant; every player parameter and seed unchanged",
        totalsReceipt: `${totalsReceipt.artifact}@${totalsReceipt.generatedAt}`,
      }
    : CHALLENGER === "receiving-target-deflation-v1"
    ? {
        id: CHALLENGER,
        gamma: GAMMA,
        preregistration: "data/internal/research/nfl/reports/receiving-calibration-repair-preregistration.json",
        champion: "data/internal/research/nfl/reports/player-props-v1-evaluation.json",
        scope: "dispersion.targetShareDeflation only (modeled target shares scaled; freed mass to OTHER)",
      }
    : {
        id: CHALLENGER,
        preregistration: "data/internal/research/nfl/reports/pass-yds-coverage-repair-preregistration.json",
        champion: "data/internal/research/nfl/reports/player-props-v1-evaluation.json",
        scope: "gameSigma.player_pass_yds estimator only",
      };
}
if (DIAGNOSE_DIR) {
  fs.mkdirSync(DIAGNOSE_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIAGNOSE_DIR, "receipt.json"), JSON.stringify(receipt, null, 1));
  fs.writeFileSync(path.join(DIAGNOSE_DIR, "calibration-bins.json"), JSON.stringify(diagnosticsBins, null, 1));
  fs.writeFileSync(path.join(DIAGNOSE_DIR, "points.jsonl"), diagnosticsPoints.map((r) => JSON.stringify(r)).join("\n") + "\n");
} else {
  fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(receipt, null, 1));
}
console.log(`player-props eval: ${evaluated} player-market points; rate m=${RATE_M}`);
for (const mkt of PROP_MARKETS) console.log(`${mkt}: n=${table[mkt].n} mae=${table[mkt].mae} (r4 ${table[mkt].baselines.rolling4Mae}, sv ${table[mkt].baselines.shareVolMae}, tier ${table[mkt].baselines.roleTierMae}) pin=${table[mkt].pinball} (t8 ${table[mkt].baselines.trailing8Pinball}) cov80=${table[mkt].interval80Coverage} ece=${table[mkt].thresholdCalibration.ece} → ${promotion[mkt].state}`);

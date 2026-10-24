/**
 * RESEARCH_NOT_PUBLISHED — model disagreement on frozen NBA slates (official Elo side vs the v0.1 / v1 / v0.3 sims).
 * dataClass PRIVATE_RESEARCH · productEligible: false · EVIDENCE ONLY.
 *
 *   npx tsx scripts/nba/research/report-nba-model-disagreement.mjs --dates 2026-10-22,2026-10-23 [--json <path outside the repo>]
 *
 * Reads ONLY committed files (no network, no git history, no wall clock; git is asked only where the checkout root is):
 *   official v0.1   data/internal/research/nba/experimental-v0.1/forecasts/<date>.json   (required; Elo side + v0.1 sim + players)
 *   supporting v1   data/internal/research/nba/experimental-v1/forecasts/<date>.json     (optional; its own sim AND its own Elo)
 *   challenger v0.3 data/internal/research/nba/experimental-v0.3/forecasts/<date>.json   (optional)
 *   public lane     app/public/data/nba/experimental-public/<date>.json                  (optional; what is shown)
 *   finals          app/public/data/nba/results/finals-2026-27.json                      (optional; descriptive scoring only)
 *   box scores      data/internal/research/nba/<family dir>/boxscores/<eventId>.json      (optional; actual minutes)
 *
 * Writes nothing except the optional --json file, which must be outside the repository. The markdown report goes to
 * stdout. Output is a pure function of the input bytes: no generatedAt, no wall-clock field, fixed ordering, and a
 * seeded bootstrap that only runs at n ≥ MIN_N_FOR_INTERVAL games.
 *
 * Official composition (unchanged by this report): the Elo-favoured side is the official game call; v0.1 player medians
 * are official; team scores are WITHHELD publicly. v1 and v0.3 are supporting / challenger research heads.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { receiptIntegrity } from "../../../src/lib/sports/nba/forecast-receipt.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const REPO_ROOT = path.resolve(APP, "..");

export const REPORT_SCHEMA = "nba-model-disagreement@1";
export const MIN_N_FOR_INTERVAL = 30; // below this many paired games no interval is computed and no difference is claimed
export const BOOTSTRAP_RESAMPLES = 2000;
export const P_CLIP = 1e-6;
const NOT_DISTINGUISHABLE = "not distinguishable at this n";

/** Heads compared. `elo` is the official game call; the rest are research signals. */
export const HEADS = Object.freeze([
  { key: "elo", label: "Elo (official side)", source: "v0.1 receipt forecast.elo.pHome", role: "OFFICIAL_SIDE" },
  { key: "v01Sim", label: "v0.1 sim", source: "v0.1 receipt forecast.sim.pHome", role: "OFFICIAL_FAMILY_SIM (team scores withheld)" },
  { key: "v1Sim", label: "v1 sim", source: "v1 receipt forecast.sim.pHome", role: "SUPPORTING" },
  { key: "v03Sim", label: "v0.3 sim", source: "v0.3 receipt forecast.sim.pHome", role: "CHALLENGER" },
  { key: "v1Elo", label: "v1 own Elo", source: "v1 receipt forecast.elo.pHome (refolds 2026-27 games; not the official rating)", role: "SUPPORTING (informational)" },
]);
const SIM_HEADS = [
  { key: "v01Sim", fam: "v01" },
  { key: "v1Sim", fam: "v1" },
  { key: "v03Sim", fam: "v03" },
];
const FAMILY_FILES = { v01: "experimental-v0.1", v1: "experimental-v1", v03: "experimental-v0.3" };
const BOX_DIRS = ["experimental", "experimental-v0.1", "experimental-v0.2", "experimental-v1", "experimental-v0.3"];

const r4 = (x) => (Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : null);
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const favours = (p) => (num(p) == null ? null : p > 0.5 ? "HOME" : p < 0.5 ? "AWAY" : "NONE");
export const contradicts = (a, b) => a != null && b != null && a !== "NONE" && b !== "NONE" && a !== b;
const clip = (p) => Math.min(1 - P_CLIP, Math.max(P_CLIP, p));
export const logLoss = (p, y) => -(y * Math.log(clip(p)) + (1 - y) * Math.log(1 - clip(p)));
export const brier = (p, y) => (p - y) ** 2;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Paired per-game differences (head − Elo). One row per game, so a resample of rows is game-clustered by construction.
 * Below MIN_N_FOR_INTERVAL no interval is computed and the verdict is always "not distinguishable at this n".
 */
export function pairedSpread(diffs, seed = 20261023) {
  const n = diffs.length;
  const out = { n, meanDiff: r4(mean(diffs)), minDiff: n ? r4(Math.min(...diffs)) : null, maxDiff: n ? r4(Math.max(...diffs)) : null, gamesHeadLower: diffs.filter((d) => d < 0).length, gamesHeadHigher: diffs.filter((d) => d > 0).length, interval95: null, verdict: NOT_DISTINGUISHABLE };
  if (n < MIN_N_FOR_INTERVAL) return { ...out, intervalRule: `none: n=${n} < ${MIN_N_FOR_INTERVAL} games` };
  const rnd = mulberry32(seed);
  const means = [];
  for (let b = 0; b < BOOTSTRAP_RESAMPLES; b += 1) {
    let s = 0;
    for (let i = 0; i < n; i += 1) s += diffs[Math.floor(rnd() * n)];
    means.push(s / n);
  }
  means.sort((a, b) => a - b);
  const lo = means[Math.floor(0.025 * BOOTSTRAP_RESAMPLES)], hi = means[Math.ceil(0.975 * BOOTSTRAP_RESAMPLES) - 1];
  const excludes0 = lo > 0 || hi < 0;
  return { ...out, interval95: [r4(lo), r4(hi)], intervalRule: `game-clustered percentile bootstrap, ${BOOTSTRAP_RESAMPLES} resamples, seed ${seed}`, verdict: excludes0 ? (hi < 0 ? "head lower than Elo (interval excludes 0)" : "head higher than Elo (interval excludes 0)") : NOT_DISTINGUISHABLE };
}

const teamQuant = (s) => (s ? { p50: num(s.p50), mean: num(s.mean) } : null);

function simScores(fc) {
  const s = fc?.sim;
  if (!s) return null;
  const margin = num(s.margin?.p50);
  return {
    home: teamQuant(s.home), away: teamQuant(s.away),
    marginP50: margin, totalP50: num(s.total?.p50),
    medianSide: margin == null ? null : margin > 0 ? "HOME" : margin < 0 ? "AWAY" : "NONE",
  };
}

/** Sum of a head's player rows with expectedMinutes > 0 on one side, against that head's team sim. */
function playerSum(fc, side) {
  const rows = (fc?.players?.[side] ?? []).filter((p) => num(p?.expectedMinutes) != null && p.expectedMinutes > 0);
  if (!fc?.players?.[side]) return null;
  const sim = fc?.sim?.[side];
  const ptsP50 = sum(rows.map((p) => num(p.pts?.p50) ?? 0));
  // v1 / v0.3 player distributions are conditional on playing; the expected contribution is mean × playRate.
  const ptsMeanAdj = sum(rows.map((p) => (num(p.pts?.mean) ?? 0) * (num(p.playRate) ?? 1)));
  return {
    rows: rows.length,
    sumExpectedMinutes: r1(sum(rows.map((p) => p.expectedMinutes))),
    sumPtsP50: r1(ptsP50),
    sumPtsMeanXPlayRate: r1(ptsMeanAdj),
    simP50: num(sim?.p50), simMean: num(sim?.mean),
    gapSumP50MinusSimP50: sim ? r1(ptsP50 - sim.p50) : null,
    gapSumMeanMinusSimMean: sim ? r1(ptsMeanAdj - sim.mean) : null,
  };
}

function minutesVsActual(fc, side, box, teamId) {
  if (!box || !fc?.players?.[side]) return null;
  const teamRows = (box.players ?? []).filter((p) => String(p.providerTeamId) === String(teamId));
  const actual = new Map(teamRows.map((p) => [String(p.providerAthleteId), num(p.minutes) ?? 0]));
  const starter = new Set(teamRows.filter((p) => p.starter === true).map((p) => String(p.providerAthleteId)));
  const proj = (fc.players[side] ?? []).filter((p) => num(p?.expectedMinutes) != null && p.expectedMinutes > 0);
  const projIds = new Set(proj.map((p) => String(p.providerAthleteId)));
  const matched = proj.filter((p) => (actual.get(String(p.providerAthleteId)) ?? 0) > 0);
  const diffs = matched.map((p) => p.expectedMinutes - actual.get(String(p.providerAthleteId)));
  const bucket = (rows) => ({ n: rows.length, sumProjected: r1(sum(rows.map((p) => p.expectedMinutes))), sumActual: r1(sum(rows.map((p) => actual.get(String(p.providerAthleteId))))) });
  const unprojected = [...actual.entries()].filter(([id, m]) => m > 0 && !projIds.has(id));
  const projectedDnp = proj.filter((p) => !((actual.get(String(p.providerAthleteId)) ?? 0) > 0));
  return {
    playedAndProjected: matched.length,
    meanProjectedMinusActual: r2(mean(diffs)),
    sumProjected: r1(sum(matched.map((p) => p.expectedMinutes))),
    sumActual: r1(sum(matched.map((p) => actual.get(String(p.providerAthleteId))))),
    // starter = the box score's starter flag (who started, not how long they played), so the bucket is not chosen on the outcome
    starters: bucket(matched.filter((p) => starter.has(String(p.providerAthleteId)))),
    bench: bucket(matched.filter((p) => !starter.has(String(p.providerAthleteId)))),
    playedButNotProjected: unprojected.length,
    minutesPlayedByUnprojected: r1(sum(unprojected.map(([, m]) => m))),
    projectedButDidNotPlay: projectedDnp.length,
    minutesProjectedForNonPlayers: r1(sum(projectedDnp.map((p) => p.expectedMinutes))),
  };
}

/**
 * Pure: the whole report from already-loaded documents.
 * @param {{ dates: string[], byDate: Record<string, { v01: object, v1?: object|null, v03?: object|null, lane?: object|null }>,
 *           finals?: object[]|null, boxscores?: Map<string, object>, sources?: object }} input
 */
export function buildReport({ dates, byDate, finals = null, boxscores = new Map(), sources = {} }) {
  const finalById = new Map((finals ?? []).filter((f) => f?.providerEventId && (f.winnerSide === "home" || f.winnerSide === "away")).map((f) => [String(f.providerEventId), f]));
  const slates = [];
  for (const date of dates) {
    const d = byDate[date];
    if (!d?.v01) throw new Error(`${date}: no official v0.1 receipt file`);
    const v1ById = new Map((d.v1?.games ?? []).map((g) => [String(g.providerEventId), g]));
    const v03ById = new Map((d.v03?.games ?? []).map((g) => [String(g.providerEventId), g]));
    const laneById = new Map((d.lane?.games ?? []).map((g) => [String(g.providerEventId), g]));
    const official = [...d.v01.games].sort((a, b) => String(a.dateUtc).localeCompare(String(b.dateUtc)) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
    const games = official.map((og) => {
      const id = String(og.providerEventId);
      const fam = { v01: og, v1: v1ById.get(id) ?? null, v03: v03ById.get(id) ?? null };
      const eloP = num(og.forecast?.elo?.pHome);
      const eloSide = favours(eloP);
      const lane = laneById.get(id) ?? null;
      const laneFav = lane?.elo?.favoured ?? null;
      const expectedFavAbbr = eloSide === "HOME" ? og.home.abbr : eloSide === "AWAY" ? og.away.abbr : null;
      const p = {
        elo: eloP,
        v01Sim: num(og.forecast?.sim?.pHome),
        v1Sim: num(fam.v1?.forecast?.sim?.pHome),
        v03Sim: num(fam.v03?.forecast?.sim?.pHome),
        v1Elo: num(fam.v1?.forecast?.elo?.pHome),
      };
      const side = {};
      for (const h of HEADS.filter((x) => x.key !== "elo")) {
        const f = favours(p[h.key]);
        side[h.key] = p[h.key] == null ? null : { pHome: p[h.key], favours: f, gapVsElo: eloP == null ? null : r4(p[h.key] - eloP), contradictsElo: contradicts(f, eloSide) };
      }
      const teamScores = {};
      for (const s of SIM_HEADS) {
        const sc = simScores(fam[s.fam]?.forecast);
        teamScores[s.key] = sc ? { ...sc, medianSideContradictsElo: contradicts(sc.medianSide, eloSide) } : null;
      }
      const playerSums = { v01: {}, v1: {}, v03: {} };
      for (const f of ["v01", "v1", "v03"]) for (const sd of ["home", "away"]) playerSums[f][sd] = playerSum(fam[f]?.forecast, sd);
      const v01VsOtherSims = {};
      for (const sd of ["home", "away"]) {
        const ps = playerSums.v01[sd];
        v01VsOtherSims[sd] = {
          v01PlayerSumP50: ps?.sumPtsP50 ?? null,
          minusV1SimP50: ps && teamScores.v1Sim ? r1(ps.sumPtsP50 - teamScores.v1Sim[sd].p50) : null,
          minusV03SimP50: ps && teamScores.v03Sim ? r1(ps.sumPtsP50 - teamScores.v03Sim[sd].p50) : null,
        };
      }
      const laneRows = {};
      for (const sd of ["home", "away"]) {
        const rows = lane?.players?.[sd] ?? null;
        laneRows[sd] = rows ? { shownRows: rows.length, sumShownPtsMedians: r1(sum(rows.map((r) => num(r.medians?.pts) ?? 0))) } : null;
      }
      const rescale = {};
      for (const sd of ["home", "away"]) {
        const m = og.forecast?.assumptions?.minutes?.[sd];
        rescale[sd] = m ? { rawPoolMinutes: num(m.rawPoolMinutes), rescaleFactor: num(m.rescaleFactor), targetTeamMinutes: num(m.targetTeamMinutes) } : null;
      }
      const fin = finalById.get(id) ?? null;
      let result = null;
      if (fin) {
        const y = fin.winnerSide === "home" ? 1 : 0;
        const scores = {};
        for (const h of HEADS) if (p[h.key] != null) scores[h.key] = { pHome: p[h.key], logLoss: r4(logLoss(p[h.key], y)), brier: r4(brier(p[h.key], y)) };
        const actualMargin = fin.ftHome - fin.ftAway;
        const scoreErr = {};
        for (const s of SIM_HEADS) {
          const t = teamScores[s.key];
          if (t) scoreErr[s.key] = { homeP50MinusActual: r1(t.home.p50 - fin.ftHome), awayP50MinusActual: r1(t.away.p50 - fin.ftAway), marginP50MinusActual: r1(t.marginP50 - actualMargin), totalP50MinusActual: r1(t.totalP50 - (fin.ftHome + fin.ftAway)) };
        }
        result = { ftHome: fin.ftHome, ftAway: fin.ftAway, winnerSide: fin.winnerSide.toUpperCase(), phase: fin.phase ?? null, officialSideCorrect: eloSide === "NONE" ? null : eloSide === fin.winnerSide.toUpperCase(), scores, teamScoreMinusActual: scoreErr };
      }
      const box = boxscores.get(id) ?? null;
      let minutes = null;
      if (box) {
        minutes = { boxscoreSource: box.__source ?? null };
        for (const f of ["v01", "v1", "v03"]) minutes[f] = { home: minutesVsActual(fam[f]?.forecast, "home", box, og.home.providerTeamId), away: minutesVsActual(fam[f]?.forecast, "away", box, og.away.providerTeamId) };
      }
      return {
        providerEventId: id,
        matchup: `${og.away.abbr}@${og.home.abbr}`,
        tipUtc: og.dateUtc,
        receipts: {
          v01: { frozenAt: og.receipt?.generatedAt ?? null, integrity: receiptIntegrity(og).state },
          v1: fam.v1 ? { frozenAt: fam.v1.receipt?.generatedAt ?? null, integrity: receiptIntegrity(fam.v1).state } : null,
          v03: fam.v03 ? { frozenAt: fam.v03.receipt?.generatedAt ?? null, integrity: receiptIntegrity(fam.v03).state, sameInstantAsV01: fam.v03.receipt?.generatedAt === og.receipt?.generatedAt, eloMatchesOfficial: num(fam.v03.forecast?.elo?.pHome) === eloP } : null,
        },
        official: {
          eloPHome: eloP, eloSide, eloFavouredAbbr: expectedFavAbbr,
          publishedSide: og.forecast?.publishedSide ?? null,
          publishedSideMatchesElo: (og.forecast?.publishedSide ?? null) === eloSide,
          publicLaneFavoured: laneFav,
          publicLaneMatchesElo: lane ? laneFav === expectedFavAbbr : null,
          publicLaneTeamScores: lane ? lane.teamScores?.state ?? null : null,
        },
        side, teamScores, playerSums, v01VsOtherSims, v01Rescale: rescale, publicLanePlayers: laneRows, result, minutes,
      };
    });
    slates.push({ date, n: slateCounts(games), games, summary: summarise(games), withheldTeamScoresReason: d.lane?.withheld?.teamScores ?? null });
  }
  const allGames = slates.flatMap((s) => s.games);
  return {
    schema: REPORT_SCHEMA,
    marker: "RESEARCH_NOT_PUBLISHED",
    dataClass: "PRIVATE_RESEARCH",
    productEligible: false,
    changesOfficialValues: false,
    dates: [...dates],
    heads: HEADS,
    rules: {
      side: "pHome > 0.5 → HOME, < 0.5 → AWAY, exactly 0.5 → NONE; a contradiction is a head favouring the other side from the official Elo",
      scoring: "per-game log loss (natural log, p clipped to [1e-6, 1−1e-6]) and Brier on pHome vs the recorded winner; lower is better; DESCRIPTIVE ONLY",
      comparison: `paired per-game (head − Elo); no interval and no claim below n=${MIN_N_FOR_INTERVAL} games; at or above it a game-clustered bootstrap, and a difference is named only when its 95% interval excludes 0`,
      playerSum: "official v0.1 player rows with expectedMinutes > 0, summed per team; v1 / v0.3 means × playRate (their distributions are conditional on playing)",
    },
    sources,
    slates,
    pooled: { n: slateCounts(allGames), summary: summarise(allGames) },
  };
}

function slateCounts(games) {
  return {
    games: games.length,
    v01Sim: games.filter((g) => g.side.v01Sim).length,
    v1Sim: games.filter((g) => g.side.v1Sim).length,
    v03Sim: games.filter((g) => g.side.v03Sim).length,
    finals: games.filter((g) => g.result).length,
    boxscores: games.filter((g) => g.minutes).length,
  };
}

function summarise(games) {
  const side = {};
  for (const h of HEADS.filter((x) => x.key !== "elo")) {
    const rows = games.filter((g) => g.side[h.key]);
    const gaps = rows.map((g) => g.side[h.key].gapVsElo).filter((x) => x != null);
    const c = rows.filter((g) => g.side[h.key].contradictsElo);
    side[h.key] = {
      n: rows.length,
      contradictions: c.length,
      contradictionGames: c.map((g) => ({ providerEventId: g.providerEventId, matchup: g.matchup, eloPHome: g.official.eloPHome, headPHome: g.side[h.key].pHome, gap: g.side[h.key].gapVsElo })),
      meanAbsGapVsElo: r4(mean(gaps.map(Math.abs))),
      meanSignedGapVsElo: r4(mean(gaps)),
      maxAbsGapVsElo: gaps.length ? r4(Math.max(...gaps.map(Math.abs))) : null,
    };
  }
  const teamScores = {};
  for (const s of SIM_HEADS) {
    const rows = games.filter((g) => g.teamScores[s.key]);
    teamScores[s.key] = {
      n: rows.length,
      meanTotalP50: r1(mean(rows.map((g) => g.teamScores[s.key].totalP50))),
      meanHomeMarginP50: r2(mean(rows.map((g) => g.teamScores[s.key].marginP50))),
      medianSideContradictsElo: rows.filter((g) => g.teamScores[s.key].medianSideContradictsElo).length,
    };
  }
  const pairs = [["v01Sim", "v1Sim"], ["v01Sim", "v03Sim"], ["v1Sim", "v03Sim"]];
  const marginPairs = {};
  for (const [a, b] of pairs) {
    const rows = games.filter((g) => g.teamScores[a] && g.teamScores[b]);
    marginPairs[`${a}|${b}`] = { n: rows.length, meanAbsMarginP50Diff: r2(mean(rows.map((g) => Math.abs(g.teamScores[a].marginP50 - g.teamScores[b].marginP50)))), meanTotalP50Diff: r2(mean(rows.map((g) => g.teamScores[a].totalP50 - g.teamScores[b].totalP50))) };
  }
  const teamSides = games.flatMap((g) => ["home", "away"].map((sd) => ({ g, sd })));
  const playerSums = {};
  for (const f of ["v01", "v1", "v03"]) {
    const rows = teamSides.filter(({ g, sd }) => g.playerSums[f][sd]);
    playerSums[f] = {
      nTeamSides: rows.length,
      meanSumExpectedMinutes: r1(mean(rows.map(({ g, sd }) => g.playerSums[f][sd].sumExpectedMinutes))),
      meanGapSumP50MinusSimP50: r2(mean(rows.map(({ g, sd }) => g.playerSums[f][sd].gapSumP50MinusSimP50))),
      meanGapSumMeanMinusSimMean: r2(mean(rows.map(({ g, sd }) => g.playerSums[f][sd].gapSumMeanMinusSimMean))),
    };
  }
  const v1Rows = teamSides.filter(({ g, sd }) => g.v01VsOtherSims[sd].minusV1SimP50 != null);
  const v03Rows = teamSides.filter(({ g, sd }) => g.v01VsOtherSims[sd].minusV03SimP50 != null);
  const v01VsOtherSims = {
    v1: { nTeamSides: v1Rows.length, meanV01PlayerSumP50MinusV1SimP50: r2(mean(v1Rows.map(({ g, sd }) => g.v01VsOtherSims[sd].minusV1SimP50))) },
    v03: { nTeamSides: v03Rows.length, meanV01PlayerSumP50MinusV03SimP50: r2(mean(v03Rows.map(({ g, sd }) => g.v01VsOtherSims[sd].minusV03SimP50))) },
  };
  const scored = games.filter((g) => g.result);
  const scores = {};
  for (const h of HEADS) {
    const rows = scored.filter((g) => g.result.scores[h.key]);
    scores[h.key] = { n: rows.length, meanLogLoss: r4(mean(rows.map((g) => g.result.scores[h.key].logLoss))), meanBrier: r4(mean(rows.map((g) => g.result.scores[h.key].brier))) };
  }
  const vsElo = {};
  for (const h of HEADS.filter((x) => x.key !== "elo")) {
    const rows = scored.filter((g) => g.result.scores[h.key] && g.result.scores.elo);
    vsElo[h.key] = {
      logLoss: pairedSpread(rows.map((g) => g.result.scores[h.key].logLoss - g.result.scores.elo.logLoss)),
      brier: pairedSpread(rows.map((g) => g.result.scores[h.key].brier - g.result.scores.elo.brier)),
    };
  }
  const perPlayer = (bs) => { const n = sum(bs.map((b) => b.n)); return { n, meanProjectedMinusActual: n ? r2((sum(bs.map((b) => b.sumProjected)) - sum(bs.map((b) => b.sumActual))) / n) : null }; };
  const minutes = {};
  for (const f of ["v01", "v1", "v03"]) {
    const rows = games.filter((g) => g.minutes).flatMap((g) => ["home", "away"].map((sd) => g.minutes[f][sd]).filter(Boolean));
    const players = sum(rows.map((r) => r.playedAndProjected));
    minutes[f] = {
      nGames: games.filter((g) => g.minutes && (g.minutes[f].home || g.minutes[f].away)).length,
      nTeamSides: rows.length,
      playedAndProjected: players,
      meanProjectedMinusActualPerPlayer: players ? r2((sum(rows.map((r) => r.sumProjected)) - sum(rows.map((r) => r.sumActual))) / players) : null,
      starters: perPlayer(rows.map((r) => r.starters)),
      bench: perPlayer(rows.map((r) => r.bench)),
      playedButNotProjected: sum(rows.map((r) => r.playedButNotProjected)),
      minutesPlayedByUnprojected: r1(sum(rows.map((r) => r.minutesPlayedByUnprojected))),
      projectedButDidNotPlay: sum(rows.map((r) => r.projectedButDidNotPlay)),
    };
  }
  return {
    officialConsistency: {
      publishedSideMatchesElo: games.filter((g) => g.official.publishedSideMatchesElo).length,
      publicLaneChecked: games.filter((g) => g.official.publicLaneMatchesElo != null).length,
      publicLaneMatchesElo: games.filter((g) => g.official.publicLaneMatchesElo === true).length,
      receiptsNotOk: games.flatMap((g) => Object.entries(g.receipts).filter(([, r]) => r && r.integrity !== "OK").map(([k, r]) => `${g.providerEventId}:${k}:${r.integrity}`)),
    },
    side, teamScores, marginPairs, playerSums, v01VsOtherSims,
    finals: { n: scored.length, officialSideCorrect: scored.filter((g) => g.result.officialSideCorrect === true).length },
    scores, vsElo, minutes,
  };
}

// ── rendering ────────────────────────────────────────────────────────────────────────────────────────────────────
const f4 = (x) => (x == null ? "—" : x.toFixed(4));
const f3 = (x) => (x == null ? "—" : x.toFixed(3));
const f1 = (x) => (x == null ? "—" : x.toFixed(1));
const sg = (x, f = f3) => (x == null ? "—" : `${x > 0 ? "+" : ""}${f(x)}`);
const row = (cells) => `| ${cells.join(" | ")} |`;
const table = (head, rows) => [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n");

export function renderMarkdown(rep) {
  const out = [];
  out.push(`<!-- generated by app/scripts/nba/research/report-nba-model-disagreement.mjs --dates ${rep.dates.join(",")} · ${rep.schema} · deterministic -->`);
  out.push(`RESEARCH_NOT_PUBLISHED · dataClass ${rep.dataClass} · productEligible ${rep.productEligible} · changes no official value`);
  out.push("");
  out.push("Inputs (sha256 of the committed bytes read):");
  out.push("");
  for (const [k, v] of Object.entries(rep.sources)) out.push(`- \`${k}\`: ${v ?? "absent"}`);
  out.push("");
  for (const s of [...rep.slates, { date: `POOLED ${rep.dates.join(" + ")}`, n: rep.pooled.n, summary: rep.pooled.summary, games: null }]) {
    const S = s.summary;
    out.push(`## ${s.date}`);
    out.push("");
    out.push(`n: ${s.n.games} games · v0.1 sim ${s.n.v01Sim} · v1 sim ${s.n.v1Sim} · v0.3 sim ${s.n.v03Sim} · finals ${s.n.finals} · box scores ${s.n.boxscores}`);
    out.push("");
    const oc = S.officialConsistency;
    out.push(`Official consistency: publishedSide = Elo side on ${oc.publishedSideMatchesElo}/${s.n.games}; public lane favoured = Elo side on ${oc.publicLaneMatchesElo}/${oc.publicLaneChecked} checked; receipts not OK: ${oc.receiptsNotOk.length ? oc.receiptsNotOk.join(", ") : "none"}.`);
    out.push("");
    out.push("### 1. Winner side vs the official Elo side");
    out.push("");
    if (s.games) {
      out.push(table(["game", "Elo pHome (side)", "v0.1 sim", "v1 sim", "v0.3 sim", "v1 own Elo", "contradictions"], s.games.map((g) => {
        const c = (k) => (g.side[k] ? `${f3(g.side[k].pHome)} (${sg(g.side[k].gapVsElo)})${g.side[k].contradictsElo ? " **≠**" : ""}` : "—");
        const list = ["v01Sim", "v1Sim", "v03Sim", "v1Elo"].filter((k) => g.side[k]?.contradictsElo).map((k) => HEADS.find((h) => h.key === k).label);
        return [`${g.matchup}`, `${f3(g.official.eloPHome)} (${g.official.eloFavouredAbbr ?? "none"})`, c("v01Sim"), c("v1Sim"), c("v03Sim"), c("v1Elo"), list.length ? list.join(", ") : "none"];
      })));
      out.push("");
      out.push("Cells: head pHome (head − Elo). **≠** = the head favours the other side from the official Elo.");
      out.push("");
    }
    out.push(table(["head", "n", "side contradictions", "mean |head − Elo|", "mean (head − Elo)", "max |head − Elo|", "games contradicting"], ["v01Sim", "v1Sim", "v03Sim", "v1Elo"].map((k) => {
      const x = S.side[k];
      return [HEADS.find((h) => h.key === k).label, x.n, `${x.contradictions}/${x.n}`, f4(x.meanAbsGapVsElo), sg(x.meanSignedGapVsElo, f4), f4(x.maxAbsGapVsElo), x.contradictionGames.map((c) => c.matchup).join(", ") || "none"];
    })));
    out.push("");
    out.push("### 2. Team scores (medians; v0.1's are WITHHELD publicly)");
    out.push("");
    if (s.games) {
      out.push(table(["game", "v0.1 sim H–A (margin)", "v1 sim H–A (margin)", "v0.3 sim H–A (margin)", "final H–A (margin)"], s.games.map((g) => {
        const c = (k) => { const t = g.teamScores[k]; return t ? `${f1(t.home.p50)}–${f1(t.away.p50)} (${sg(t.marginP50, f1)})${t.medianSideContradictsElo ? " **≠**" : ""}` : "—"; };
        return [g.matchup, c("v01Sim"), c("v1Sim"), c("v03Sim"), g.result ? `${g.result.ftHome}–${g.result.ftAway} (${sg(g.result.ftHome - g.result.ftAway, (x) => String(x))})` : "pending"];
      })));
      out.push("");
      out.push("**≠** = the sim's median margin favours the other side from the official Elo.");
      out.push("");
    }
    out.push(table(["head", "n", "mean total p50", "mean home margin p50", "median margin contradicts Elo"], SIM_HEADS.map(({ key }) => { const x = S.teamScores[key]; return [HEADS.find((h) => h.key === key).label, x.n, f1(x.meanTotalP50), sg(x.meanHomeMarginP50, f1), `${x.medianSideContradictsElo}/${x.n}`]; })));
    out.push("");
    out.push(table(["pair", "n", "mean |margin p50 diff|", "mean total p50 diff (first − second)"], Object.entries(S.marginPairs).map(([k, x]) => [k.replace("|", " vs "), x.n, f1(x.meanAbsMarginP50Diff), sg(x.meanTotalP50Diff, f1)])));
    out.push("");
    out.push("### 3. Player sums vs team sims");
    out.push("");
    if (s.games) {
      out.push(table(["game · side", "v0.1 rows / Σ exp min", "v0.1 raw pool min → rescale", "Σ v0.1 pts p50", "Σ v0.1 pts mean", "v0.1 sim p50 / mean", "Σp50 − sim p50", "v1 sim p50", "v0.3 sim p50", "public rows / Σ shown p50", "final"], s.games.flatMap((g) => ["home", "away"].map((sd) => {
        const p = g.playerSums.v01[sd], rs = g.v01Rescale[sd], lr = g.publicLanePlayers[sd];
        const fin = g.result ? (sd === "home" ? g.result.ftHome : g.result.ftAway) : "—";
        return [`${g.matchup} · ${sd} ${sd === "home" ? g.matchup.split("@")[1] : g.matchup.split("@")[0]}`, p ? `${p.rows} / ${f1(p.sumExpectedMinutes)}` : "—", rs ? `${f1(rs.rawPoolMinutes)} → ×${rs.rescaleFactor?.toFixed(3) ?? "—"}` : "—", p ? f1(p.sumPtsP50) : "—", p ? f1(p.sumPtsMeanXPlayRate) : "—", p ? `${f1(p.simP50)} / ${f1(p.simMean)}` : "—", p ? sg(p.gapSumP50MinusSimP50, f1) : "—", g.teamScores.v1Sim ? f1(g.teamScores.v1Sim[sd].p50) : "—", g.teamScores.v03Sim ? f1(g.teamScores.v03Sim[sd].p50) : "—", lr ? `${lr.shownRows} / ${f1(lr.sumShownPtsMedians)}` : "—", fin];
      }))));
      out.push("");
    }
    out.push(table(["family", "n team-sides", "mean Σ expected minutes", "mean (Σ pts p50 − sim p50)", "mean (Σ pts mean×playRate − sim mean)"], ["v01", "v1", "v03"].map((f) => { const x = S.playerSums[f]; return [{ v01: "v0.1 (official players)", v1: "v1", v03: "v0.3" }[f], x.nTeamSides, f1(x.meanSumExpectedMinutes), sg(x.meanGapSumP50MinusSimP50, f1), sg(x.meanGapSumMeanMinusSimMean, f1)]; })));
    out.push("");
    out.push(`Σ official v0.1 player pts p50 − v1 sim team p50: ${sg(S.v01VsOtherSims.v1.meanV01PlayerSumP50MinusV1SimP50, f1)} (n=${S.v01VsOtherSims.v1.nTeamSides} team-sides); − v0.3 sim team p50: ${sg(S.v01VsOtherSims.v03.meanV01PlayerSumP50MinusV03SimP50, f1)} (n=${S.v01VsOtherSims.v03.nTeamSides}).`);
    out.push("");
    out.push(`Projected vs actual minutes (box scores; players who played and had a projection; descriptive, n=${S.minutes.v01.nGames} games):`);
    out.push("");
    out.push(table(["family", "n games", "n team-sides", "players played & projected", "mean (projected − actual) min", "starters: n · mean (proj − actual)", "bench: n · mean (proj − actual)", "played, not projected (min)", "projected, did not play"], ["v01", "v1", "v03"].map((f) => { const x = S.minutes[f]; return [{ v01: "v0.1", v1: "v1", v03: "v0.3" }[f], x.nGames, x.nTeamSides, x.playedAndProjected, sg(x.meanProjectedMinusActualPerPlayer, f1), `${x.starters.n} · ${sg(x.starters.meanProjectedMinusActual, f1)}`, `${x.bench.n} · ${sg(x.bench.meanProjectedMinusActual, f1)}`, `${x.playedButNotProjected} (${f1(x.minutesPlayedByUnprojected)})`, x.projectedButDidNotPlay]; })));
    out.push("");
    out.push("Starter = the box score's starter flag. v1 / v0.3 expected minutes are conditional on playing; v0.1's are not.");
    out.push("");
    out.push(`### 4. Finals: descriptive scores (n=${S.finals.n} games; lower log loss is better)`);
    out.push("");
    if (S.finals.n === 0) {
      out.push("No recorded finals for these games yet.");
      out.push("");
    } else {
      out.push(`Official Elo side correct: ${S.finals.officialSideCorrect}/${S.finals.n}.`);
      out.push("");
      if (s.games) {
        out.push(table(["game", "winner", ...HEADS.map((h) => `${h.label} p · LL · Brier`)], s.games.filter((g) => g.result).map((g) => [g.matchup, `${g.result.winnerSide} ${g.result.ftHome}–${g.result.ftAway}`, ...HEADS.map((h) => { const x = g.result.scores[h.key]; return x ? `${f3(x.pHome)} · ${f4(x.logLoss)} · ${f4(x.brier)}` : "—"; })])));
        out.push("");
      }
      out.push(table(["head", "n", "mean log loss", "mean Brier", "per-game LL diff vs Elo: mean [min, max]", "verdict"], HEADS.map((h) => {
        const x = S.scores[h.key], v = S.vsElo[h.key];
        return [h.label, x.n, f4(x.meanLogLoss), f4(x.meanBrier), v ? `${sg(v.logLoss.meanDiff, f4)} [${sg(v.logLoss.minDiff, f4)}, ${sg(v.logLoss.maxDiff, f4)}] (n=${v.logLoss.n})` : "reference", v ? v.logLoss.verdict : "—"];
      })));
      out.push("");
      out.push(`No interval is computed below n=${MIN_N_FOR_INTERVAL} games; every head-vs-Elo difference here is ${NOT_DISTINGUISHABLE}.`);
      out.push("");
    }
  }
  out.push("## What this means for the products");
  out.push("");
  out.push("The official game call is the Elo-favoured side, and nothing in this report changes it, a v0.1 player median, a receipt, a ledger row or the public lane. Where a sim favours the other side, that is a research signal about the sim (v0.1's team score ignores the opponent, which is why team scores are withheld publicly), not a reason to flip a published side. v1 and v0.3 disagreements stay supporting / challenger evidence; any change to an official value goes through the founder and the promotion record, never through this report. The descriptive scores cover a handful of games and cannot rank the heads.");
  out.push("");
  return out.join("\n");
}

// ── loading + CLI ────────────────────────────────────────────────────────────────────────────────────────────────
const shaOf = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/** Load committed inputs under `root` (the repository root, or a fixture root laid out the same way). */
export function loadInputs(root, dates) {
  const sources = {};
  const read = (rel, required = false) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      if (required) throw new Error(`missing ${rel}`);
      sources[rel] = null;
      return null;
    }
    const buf = fs.readFileSync(abs);
    sources[rel] = shaOf(buf);
    return JSON.parse(buf.toString("utf8"));
  };
  const byDate = {};
  const ids = new Set();
  for (const date of dates) {
    const fam = {};
    for (const [k, dir] of Object.entries(FAMILY_FILES)) fam[k] = read(`data/internal/research/nba/${dir}/forecasts/${date}.json`, k === "v01");
    fam.lane = read(`app/public/data/nba/experimental-public/${date}.json`);
    byDate[date] = fam;
    for (const g of fam.v01.games) ids.add(String(g.providerEventId));
  }
  const finalsDoc = read("app/public/data/nba/results/finals-2026-27.json");
  const boxscores = new Map();
  for (const id of [...ids].sort()) {
    for (const dir of BOX_DIRS) {
      const rel = `data/internal/research/nba/${dir}/boxscores/${id}.json`;
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs)) continue;
      const buf = fs.readFileSync(abs);
      const doc = JSON.parse(buf.toString("utf8"));
      if (doc.boxscoreAvailable && doc.status === "STATUS_FINAL" && doc.phase === 2) {
        sources[rel] = shaOf(buf);
        boxscores.set(id, { ...doc, __source: rel });
        break;
      }
    }
  }
  return { dates, byDate, finals: finalsDoc?.finals ?? null, boxscores, sources };
}

/** The checkouts a --json path must stay out of: this worktree and, when it is a linked worktree, the main checkout. */
export function protectedRoots(root = REPO_ROOT) {
  const roots = [root];
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (common && path.basename(common) === ".git") roots.push(path.dirname(common));
  } catch { /* not a git checkout: the script's own root is still protected */ }
  return [...new Set(roots.map(realish))];
}
/** realpath of the nearest existing ancestor, so /tmp vs /private/tmp style aliases cannot slip a path past the check. */
function realish(p) {
  let cur = path.resolve(p);
  const tail = [];
  while (!fs.existsSync(cur) && path.dirname(cur) !== cur) { tail.unshift(path.basename(cur)); cur = path.dirname(cur); }
  return path.join(fs.realpathSync(cur), ...tail);
}
export function isInsideRepo(p, roots = protectedRoots()) {
  const abs = realish(p);
  return roots.some((root) => abs === root || abs.startsWith(root + path.sep));
}

function main(argv) {
  const arg = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? null; };
  const refuse = (m) => { console.error(`REFUSED: ${m}`); process.exit(1); };
  const raw = arg("--dates");
  const dates = (raw ?? "").split(",").filter(Boolean);
  if (!dates.length || dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) refuse("--dates YYYY-MM-DD[,YYYY-MM-DD…] required");
  const jsonOut = arg("--json");
  if (argv.includes("--json") && !jsonOut) refuse("--json needs a path");
  if (jsonOut && isInsideRepo(jsonOut)) refuse(`--json ${path.resolve(jsonOut)} is inside the repository — research output is never written where a build or a publisher could read it`);
  const root = arg("--root") ? path.resolve(arg("--root")) : REPO_ROOT;
  let rep;
  try { rep = buildReport(loadInputs(root, dates)); } catch (e) { refuse(e.message); }
  if (jsonOut) {
    fs.mkdirSync(path.dirname(path.resolve(jsonOut)), { recursive: true });
    fs.writeFileSync(path.resolve(jsonOut), JSON.stringify(rep, null, 2) + "\n");
  }
  process.stdout.write(renderMarkdown(rep));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2));

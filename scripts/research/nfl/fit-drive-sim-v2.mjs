#!/usr/bin/env node
/**
 * FIT THE NFL DRIVE SIMULATOR'S PARAMETER TABLES (Session 13 · Simulation Engine V2 · SHADOW).
 *
 *   node scripts/research/nfl/fit-drive-sim-v2.mjs --first 2015 --last 2022 [--kickoff-season 2022] [--out <path>]
 *
 * Reads the derived drive table (extract_pbp_drives.py → data/internal/research/nfl/sim-v2/drives-v1.json.gz) and
 * writes ONE small committed receipt of empirical, smoothed tables — the only thing the simulator reads:
 *
 *   result     P(drive result | start field position bucket, score state, clock state)      (backs off to field position)
 *   plays      P(scrimmage plays | result)                                                    (histogram)
 *   duration   seconds per play | clock state                                                 (histogram)
 *   netYards   P(net yards | result, start bucket)          for PUNT / TURNOVER / DOWNS / END_HALF / FG(_MISS)
 *   start      next drive's start: KICKOFF histogram (from --kickoff-season only: the kickoff rule changed in 2024
 *              and 2025) and, for PUNT / TURNOVER / DOWNS / FG_MISS, the offset from the mirrored end spot
 *   playMix    dropback rate | score state × clock state; sack / scramble / completion rates
 *   conversions XP make, two-point attempt rate by post-TD score difference, two-point success
 *   turnover   INT share of turnovers
 *
 * Training window is explicit and recorded. Validation must use a window that ends BEFORE every validated season
 * (no leakage): e.g. fit 2015–2022 → validate 2023–2025.
 *
 * Fits nothing to any market. Reads no outcome beyond what a drive row carries.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SRC = path.join(ROOT, "data/internal/research/nfl/sim-v2/drives-v1.json.gz");
const BOX = path.join(ROOT, "data/internal/research/nfl/sim-v2/team-games-v1.json.gz");

const arg = (k, d = null) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const FIRST = Number(arg("--first", 2015));
const LAST = Number(arg("--last", 2022));
const KICK_SEASON = Number(arg("--kickoff-season", LAST));
const OUT = arg("--out", path.join(ROOT, `data/internal/research/nfl/sim-v2/drive-params-${FIRST}-${LAST}.json`));

/** Field-position buckets: yards to goal at drive start, 10-yard bins (1–10 … 91–99). */
export const yBucket = (y) => Math.min(9, Math.max(0, Math.floor((y - 1) / 10)));
/** Score state from the offense's view. */
export const scoreState = (diff) => (diff <= -9 ? "T2" : diff < 0 ? "T1" : diff === 0 ? "EV" : diff < 9 ? "L1" : "L2");
/** Clock state: LATE_HALF = ≤120 s left in a half; LATE_GAME = ≤300 s left in regulation; otherwise NORMAL. */
export const clockState = (q, halfSec, gameSec) => (q >= 4 && gameSec <= 300 ? "LATE_GAME" : halfSec <= 120 ? "LATE_HALF" : "NORMAL");
export const RESULTS = ["TD", "FG", "FG_MISS", "PUNT", "TURNOVER", "DOWNS", "END_HALF", "OPP_TD", "SAFETY"];

const sha256 = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const hist = (values, cap) => {
  const h = {};
  for (const v of values) {
    const k = Math.max(-99, Math.min(cap, Math.round(v)));
    h[k] = (h[k] ?? 0) + 1;
  }
  return h;
};

function main() {
  const all = JSON.parse(zlib.gunzipSync(fs.readFileSync(SRC)));
  const drives = all.filter((d) => d.s >= FIRST && d.s <= LAST && d.q <= 4 && RESULTS.includes(d.res));
  const kickDrives = all.filter((d) => d.s === KICK_SEASON && d.q <= 4);

  // ── result table with back-off ────────────────────────────────────────────────────────────────────────────────
  const cell = new Map();
  const marg = new Map();
  const bump = (m, k, r) => {
    const o = m.get(k) ?? Object.fromEntries(RESULTS.map((x) => [x, 0]));
    o[r] += 1;
    m.set(k, o);
  };
  for (const d of drives) {
    const yb = yBucket(d.y0);
    const cs = clockState(d.q, d.h0, d.t0);
    bump(cell, `${yb}|${scoreState(d.diff)}|${cs}`, d.res);
    bump(marg, `${yb}|${cs}`, d.res);
  }
  const K = 25; // pseudo-count pulling a sparse cell toward its field-position × clock margin
  const result = {};
  for (const yb of [...Array(10).keys()]) {
    for (const cs of ["NORMAL", "LATE_HALF", "LATE_GAME"]) {
      const m = marg.get(`${yb}|${cs}`) ?? marg.get(`${yb}|NORMAL`);
      const mTot = RESULTS.reduce((a, r) => a + m[r], 0);
      for (const ss of ["T2", "T1", "EV", "L1", "L2"]) {
        const c = cell.get(`${yb}|${ss}|${cs}`) ?? Object.fromEntries(RESULTS.map((x) => [x, 0]));
        const n = RESULTS.reduce((a, r) => a + c[r], 0);
        const probs = RESULTS.map((r) => (c[r] + K * (m[r] / mTot)) / (n + K));
        result[`${yb}|${ss}|${cs}`] = { n, p: probs.map((x) => Number(x.toFixed(5))) };
      }
    }
  }

  // ── plays per drive | result, seconds per play | clock state ─────────────────────────────────────────────────
  const plays = {};
  for (const r of RESULTS) plays[r] = hist(drives.filter((d) => d.res === r).map((d) => d.plays), 25);
  const secPerPlay = {};
  for (const cs of ["NORMAL", "LATE_HALF", "LATE_GAME"]) {
    secPerPlay[cs] = hist(drives.filter((d) => clockState(d.q, d.h0, d.t0) === cs && d.plays > 0).map((d) => d.dur / d.plays), 60);
  }

  // ── net yards | result, start bucket (TD is exact: the whole field) ──────────────────────────────────────────
  const netYards = {};
  for (const r of RESULTS.filter((x) => x !== "TD" && x !== "OPP_TD")) {
    for (const yb of [...Array(10).keys()]) {
      const ds = drives.filter((d) => d.res === r && yBucket(d.y0) === yb);
      const pool = ds.length >= 40 ? ds : drives.filter((d) => d.res === r);
      netYards[`${r}|${yb}`] = hist(pool.map((d) => d.netYds), 99);
    }
  }
  netYards["OPP_TD|all"] = hist(drives.filter((d) => d.res === "OPP_TD").map((d) => d.netYds), 99);

  // ── next drive's start: walk each game's drive order ─────────────────────────────────────────────────────────
  const byGame = new Map();
  for (const d of all.filter((x) => x.q <= 4)) {
    const a = byGame.get(d.g) ?? [];
    a.push(d);
    byGame.set(d.g, a);
  }
  const kickoff = [];
  const offsets = { PUNT: [], TURNOVER: [], DOWNS: [], FG_MISS: [] };
  for (const [, ds] of byGame) {
    ds.sort((a, b) => b.t0 - a.t0 || a.d - b.d);
    for (let i = 1; i < ds.length; i++) {
      const prev = ds[i - 1];
      const cur = ds[i];
      const sameHalf = (prev.q <= 2) === (cur.q <= 2);
      if (cur.pos === prev.pos) continue; // OPP_TD / safety re-possessions — not a mirrored change of possession
      const endPrev = prev.y0 - prev.netYds; // yards to goal for the previous offense where its drive ended
      if (offsets[prev.res] && sameHalf) offsets[prev.res].push({ s: prev.s, v: cur.y0 - (100 - endPrev) });
      if ((prev.res === "TD" || prev.res === "FG") && cur.s === KICK_SEASON) kickoff.push(cur.y0);
    }
  }
  const start = {
    KICKOFF: hist(kickoff.length ? kickoff : kickDrives.map((d) => d.y0), 99),
    ...Object.fromEntries(Object.entries(offsets).map(([k, v]) => [k, hist(v.filter((x) => x.s >= FIRST && x.s <= LAST).map((x) => x.v), 99)])),
  };

  // ── play mix, conversions, turnovers from the box table ──────────────────────────────────────────────────────
  const box = JSON.parse(zlib.gunzipSync(fs.readFileSync(BOX))).filter((t) => t.s >= FIRST && t.s <= LAST);
  const sum = (k) => box.reduce((a, t) => a + (t[k] ?? 0), 0);
  const dropbackRate = {};
  for (const ss of ["T2", "T1", "EV", "L1", "L2"]) {
    for (const cs of ["NORMAL", "LATE_HALF", "LATE_GAME"]) {
      const ds = drives.filter((d) => scoreState(d.diff) === ss && clockState(d.q, d.h0, d.t0) === cs);
      const db = ds.reduce((a, d) => a + d.passAtt + d.sacks + d.scrambles, 0);
      const sc = ds.reduce((a, d) => a + d.plays - d.kneels - d.spikes, 0);
      dropbackRate[`${ss}|${cs}`] = sc > 0 ? Number((db / sc).toFixed(4)) : 0.58;
    }
  }
  const dropbacks = sum("passAtt") + sum("sacks") + sum("scrambles");
  const playMix = {
    dropbackRate,
    sackPerDropback: Number((sum("sacks") / dropbacks).toFixed(4)),
    scramblePerDropback: Number((sum("scrambles") / dropbacks).toFixed(4)),
    completionRate: Number((sum("cmp") / sum("passAtt")).toFixed(4)),
    yardsPerCompletion: Number((sum("passYds") / sum("cmp")).toFixed(3)),
    yardsPerRush: Number((sum("rushYds") / (sum("rushAtt") + sum("scrambles"))).toFixed(3)),
    sackYards: Number((sum("sackYds") / sum("sacks")).toFixed(3)),
  };
  const tdDrives = drives.filter((d) => d.res === "TD");
  const conversions = {
    xpMake: Number((sum("xpMade") / sum("xpAtt")).toFixed(4)),
    twoPointSuccess: Number((sum("twoMade") / Math.max(1, sum("twoAtt"))).toFixed(4)),
    twoPointAttemptRate: Number((sum("twoAtt") / Math.max(1, sum("twoAtt") + sum("xpAtt"))).toFixed(4)),
    passTdShare: Number((tdDrives.filter((d) => d.tdType === "PASS").length / Math.max(1, tdDrives.filter((d) => d.tdType).length)).toFixed(4)),
  };
  const turnover = { intShare: Number((sum("int") / Math.max(1, sum("int") + sum("fumLost"))).toFixed(4)) };

  const params = {
    schemaVersion: "nfl-drive-sim-params@1",
    engine: "nfl-drive-sim-v2",
    trainingWindow: { first: FIRST, last: LAST, kickoffSeason: KICK_SEASON, seasonTypes: ["REG", "POST"] },
    source: { drives: "data/internal/research/nfl/sim-v2/drives-v1.json.gz", drivesSha256: sha256(SRC), box: "data/internal/research/nfl/sim-v2/team-games-v1.json.gz", boxSha256: sha256(BOX) },
    counts: { drives: drives.length, teamGames: box.length, kickoffStarts: kickoff.length },
    buckets: { results: RESULTS, scoreStates: ["T2", "T1", "EV", "L1", "L2"], clockStates: ["NORMAL", "LATE_HALF", "LATE_GAME"], fieldBuckets: 10, pseudoCount: K },
    result, plays, secPerPlay, netYards, start, playMix, conversions, turnover,
    marketInputs: "NONE — no betting-market number is read by this fit",
  };
  fs.writeFileSync(OUT, JSON.stringify(params) + "\n");
  console.log(`wrote ${path.relative(ROOT, OUT)} · drives ${drives.length} · kickoff starts ${kickoff.length} · ${JSON.stringify(playMix)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

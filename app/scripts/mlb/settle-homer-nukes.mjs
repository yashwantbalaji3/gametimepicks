#!/usr/bin/env node
/**
 * Grade a Homer Nukes board against the official MLB box score.
 *
 * A published probability that is never checked is an opinion, not a model. This settles each of
 * the day's five picks from the one source this repository trusts for baseball truth — the official
 * box score, joined by gamePk and player name — and keeps a cumulative record so the board earns,
 * or fails to earn, the right to be believed.
 *
 * WHAT IS MEASURED, and why it is not a win rate:
 *   Five picks at ~25% each should land about 1.25 times a day. Counting "hits" alone would make a
 *   well-calibrated board look terrible. So the record carries the numbers that actually judge a
 *   probability — how many were predicted vs how many happened, and a Brier score against the
 *   published number. Calibration, not a hit rate.
 *
 * RULES, deliberately conservative and matching the MLB player-prop settler:
 *   · a game that is not FINAL is left PENDING, never graded early
 *   · a player absent from the box score is PENDING, not a miss — a scratch is not a wrong forecast
 *   · a settled day is written ONCE; an identical re-run is a no-op, a differing one refuses
 *
 *   node app/scripts/mlb/settle-homer-nukes.mjs --now <ISO> [--date YYYY-MM-DD] [--write]
 *   node app/scripts/mlb/settle-homer-nukes.mjs --now <ISO> --record-only --write   (rebuild record.json only, HN-1)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { homerNukesDayOfRecord, homerNukesRecord } from "../../src/lib/results/homer-nukes-of-record.mjs";
import { readHomerNukesCorrections } from "../../src/lib/results/homer-nukes-of-record-io.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const write = process.argv.includes("--write");

/** Yesterday in ET. Settlement runs after midnight ET, when UTC has already rolled over — naming the
 *  day by a UTC slice would grade a slate that has not been played. (That trap has bitten here.) */
const etYesterday = (iso) => {
  const et = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York" }));
  et.setDate(et.getDate() - 1);
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, "0")}-${String(et.getDate()).padStart(2, "0")}`;
};
const DATE = arg("--date", etYesterday(NOW));

const BOARD_DIR = path.join(APP, "public", "data", "mlb", "homer-nukes");
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };

const boxCache = new Map();
async function boxFor(gamePk) {
  if (boxCache.has(gamePk)) return boxCache.get(gamePk);
  let out = { final: false, byPlayer: new Map() };
  try {
    const feed = await get(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
    out.final = feed?.gameData?.status?.abstractGameState === "Final";
    for (const side of ["away", "home"]) {
      for (const p of Object.values(feed?.liveData?.boxscore?.teams?.[side]?.players ?? {})) {
        if (p?.person?.fullName) out.byPlayer.set(norm(p.person.fullName), p.stats?.batting ?? {});
      }
    }
  } catch (e) { console.error(`  gamePk ${gamePk}: ${e.message}`); }
  boxCache.set(gamePk, out);
  return out;
}

async function main() {
  if (process.argv.includes("--record-only")) {
    let modelId = null;
    try { modelId = JSON.parse(fs.readFileSync(path.join(BOARD_DIR, "record.json"), "utf8")).modelId ?? null; } catch { /* none yet */ }
    if (!write) { console.log("dry-run --record-only: nothing written. Re-run with --write."); }
    else writeRecord(modelId);
    return;
  }
  const boardPath = path.join(BOARD_DIR, `${DATE}.json`);
  if (!fs.existsSync(boardPath)) { console.log(`NOT_OBSERVABLE: no Homer Nukes board for ${DATE}`); return; }
  const board = JSON.parse(fs.readFileSync(boardPath, "utf8"));

  const graded = [];
  let pending = 0;
  for (const p of board.picks ?? []) {
    const box = await boxFor(p.gamePk);
    if (!box.final) { pending++; graded.push({ ...slim(p), result: "pending", note: "game not final" }); continue; }
    const batting = box.byPlayer.get(norm(p.player));
    if (!batting) { pending++; graded.push({ ...slim(p), result: "pending", note: "player absent from the official box score (possible scratch) — never graded as a miss" }); continue; }
    const hr = batting.homeRuns ?? 0;
    graded.push({ ...slim(p), result: hr > 0 ? "hit" : "miss", homeRuns: hr, source: "mlb_stats_api", gamePk: p.gamePk });
    console.log(`  ${p.player}: predicted ${(p.probability * 100).toFixed(1)}% → ${hr} HR ${hr > 0 ? "HIT" : "miss"}`);
  }

  const decided = graded.filter((g) => g.result !== "pending");
  const expected = decided.reduce((n, g) => n + g.probability, 0);
  const actual = decided.filter((g) => g.result === "hit").length;
  // Brier: mean squared error of the published probability against the 0/1 outcome. Lower is better;
  // it rewards being right AND being appropriately unsure, which a hit rate cannot do.
  const brier = decided.length ? decided.reduce((n, g) => n + Math.pow(g.probability - (g.result === "hit" ? 1 : 0), 2), 0) / decided.length : null;

  const receipt = {
    schemaVersion: 1, artifact: "mlb-homer-nukes-settlement", dataClass: "PUBLIC_DERIVED",
    date: DATE, settledAt: NOW, modelId: board.model?.id ?? null,
    source: "MLB Stats API official box score (feed/live), joined by gamePk and player name",
    picks: graded,
    day: { graded: decided.length, pending, predicted: round(expected), actual, brier: round(brier) },
  };

  console.log(`\nhomer nukes ${DATE}: ${decided.length} graded · ${pending} pending · predicted ${round(expected)} homers, actual ${actual}${brier != null ? ` · brier ${round(brier)}` : ""}`);
  if (!write) { console.log("\ndry-run — nothing written. Re-run with --write."); return; }

  const outPath = path.join(BOARD_DIR, `settled-${DATE}.json`);
  if (fs.existsSync(outPath)) {
    const prior = JSON.parse(fs.readFileSync(outPath, "utf8"));
    const same = JSON.stringify(prior.picks) === JSON.stringify(receipt.picks);
    console.log(same ? `receipt ${DATE} already recorded and identical — left untouched`
      : `REFUSED: receipt ${DATE} exists and DIFFERS. A settled day is not rewritten silently.`);
    if (!same) process.exit(1);
  } else {
    fs.writeFileSync(outPath, JSON.stringify(receipt, null, 1) + "\n");
    console.log(`wrote mlb/homer-nukes/settled-${DATE}.json`);
  }

  writeRecord(board.model?.id ?? null);
}

/**
 * HN-1: `--record-only` rebuilds record.json from the settled days on disk through the of-record rule, grading nothing
 * and fetching nothing (used to publish a committed correction without waiting for the next slate).
 */
function writeRecord(modelId) {
  /*
   * The cumulative record is REBUILT from every settled day on disk, never incremented in place.
   * Both settlement ledgers in this repository have been wiped by a job that rewrote a running
   * total from one day's view; deriving it from the receipts makes that failure unreachable.
   */
  /* HN-1 (founder Q1-RULE): days are read through the one of-record rule, which applies the append-only correction log
     (a day with no pregame list is excluded and disclosed; Sep 10 is graded on its last pre-first-pitch list). The
     settled files themselves are never rewritten. */
  const corrections = readHomerNukesCorrections(path.resolve(APP, ".."));
  const days = fs.readdirSync(BOARD_DIR).filter((f) => /^settled-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    .map((f) => homerNukesDayOfRecord(JSON.parse(fs.readFileSync(path.join(BOARD_DIR, f), "utf8")), corrections));
  const rec = homerNukesRecord(days);
  const hits = rec.actual;
  const lifetime = {
    schemaVersion: 1, artifact: "mlb-homer-nukes-record", dataClass: "PUBLIC_DERIVED",
    generatedAt: NOW, modelId,
    gradedPicks: rec.gradedPicks, predicted: rec.predicted, actual: rec.actual,
    brier: rec.brier,
    ...(rec.excluded ? { excluded: rec.excluded } : {}),
    note: rec.gradedPicks
      ? "Predicted counts how many homers the published probabilities expected; actual counts how many happened. A board of ~25% picks is SUPPOSED to miss most of the time — the question is whether the rate matches the number."
      : "No Homer Nukes pick has been graded yet. A record appears here once the first board's games are final.",
  };
  fs.writeFileSync(path.join(BOARD_DIR, "record.json"), JSON.stringify(lifetime, null, 1) + "\n");
  console.log(`record: ${rec.gradedPicks} graded · predicted ${lifetime.predicted} · actual ${hits}${lifetime.brier != null ? ` · brier ${lifetime.brier}` : ""}`);
}

const slim = (p) => ({ playerId: p.playerId, player: p.player, teamAbbr: p.teamAbbr, matchup: p.matchup, gamePk: p.gamePk, probability: p.probability });
const round = (v, n = 4) => (v == null ? null : Number(v.toFixed(n)));

main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });

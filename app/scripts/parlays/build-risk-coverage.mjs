#!/usr/bin/env node
/**
 * RISK COVERAGE MATRIX v2 — the mechanical completion instrument (Program 200).
 *
 *   npx tsx scripts/parlays/build-risk-coverage.mjs --now <ISO>
 *
 * One generated grid: five lanes (mlb, epl, ufc, nfl, multi) × four risk tiers (low, medium,
 * high, longshot), every cell typed — PUBLISHED with its card id, NO_PLAY with the ladder's own
 * skip reason, or LANE_CLOSED with the eligibility gate's reason. "Four risk levels are four
 * daily evaluations, not four forced bets": this matrix is where that promise becomes checkable,
 * per lane, per day, mechanically.
 *
 * REPLACES the previous coverage-matrix.json, which froze on 2026-06-23 describing World Cup
 * scopes that no longer exist — a completion instrument that stopped counting is worse than none,
 * because it reads as coverage. Same filename, schemaVersion 2, derived from the lanes' own
 * artifacts on every run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RISK_ORDER } from "../../src/lib/prefs/bettor-tiers.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(APP, "public", "data");
const arg = (n) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const LADDERS = { mlb: "risk-ladder", epl: "risk-ladder-epl", ufc: "risk-ladder-ufc" };
const ledger = readJson(path.join(DATA, "parlays", "lab-ledger.json"));
const streamById = new Map((ledger?.streams ?? []).map((s) => [s.id, s]));

function laneRow(lane) {
  const stream = streamById.get(lane) ?? null;

  // The lane's card artifact: per-sport ladders, or the multi tier grid.
  const art = lane === "multi"
    ? readJson(path.join(DATA, "parlays", "tier-grid", "multi-latest.json"))
    : LADDERS[lane] ? readJson(path.join(DATA, "parlays", LADDERS[lane], "latest.json")) : null;

  const laneClosed = stream && stream.live === false;
  /*
   * The lane artifact may itself have refused (state NOT_ELIGIBLE) at ITS build time even if the
   * ledger's eligibility has since moved — the grid is the evaluation of record until the next
   * scheduled rebuild. That is LANE_CLOSED with the artifact's own stamp, not MISSING: the
   * evaluation accounted for every tier by refusing the lane. MISSING stays reserved for a lane
   * whose evaluation never spoke at all.
   */
  const artRefused = art?.state && art.state !== "PUBLISHED" && (art.cards ?? []).length === 0;
  const tiers = {};
  for (const tier of RISK_ORDER) {
    if (laneClosed) {
      tiers[tier] = { state: "LANE_CLOSED", reason: stream.blocked ?? "the eligibility gate holds this lane closed" };
      continue;
    }
    if (artRefused) {
      tiers[tier] = { state: "LANE_CLOSED", reason: `lane evaluation of record refused (${art.state}) at ${art.generatedAt ?? "its build time"}; the next scheduled run re-evaluates under current eligibility` };
      continue;
    }
    const card = (art?.cards ?? []).find((c) => (c.tier ?? c.risk) === tier);
    if (card) {
      tiers[tier] = { state: "PUBLISHED", slipId: card.slipId ?? card.id ?? null };
      continue;
    }
    const skip = (art?.skipped ?? []).find((s) => (s.tier ?? s.risk) === tier);
    if (skip) {
      tiers[tier] = { state: "NO_PLAY", reason: skip.reason ?? "the evaluation completed and nothing qualified" };
      continue;
    }
    /*
     * Neither a card nor a typed skip: the evaluation did not account for this tier. That is the
     * failure state the charter names ("missing tier or no receipt") and it must read as one.
     */
    tiers[tier] = { state: "MISSING", reason: art ? "the lane artifact carries neither a card nor a skip for this tier" : "no lane artifact on disk for the current day" };
  }

  return {
    lane,
    date: art?.date ?? null,
    laneState: laneClosed ? "CLOSED" : "LIVE",
    laneReason: laneClosed ? (stream?.blocked ?? null) : null,
    tiers,
  };
}

const rows = ["mlb", "epl", "ufc", "nfl", "multi"].map(laneRow);
const counts = { PUBLISHED: 0, NO_PLAY: 0, LANE_CLOSED: 0, MISSING: 0 };
for (const r of rows) for (const t of Object.values(r.tiers)) counts[t.state] += 1;

const artifact = {
  schemaVersion: 2,
  artifact: "risk-coverage-matrix",
  dataClass: "PUBLIC_DERIVED",
  generatedAt: NOW,
  note: "Five lanes x four risk tiers, every cell typed. PUBLISHED carries its card; NO_PLAY carries the ladder's own skip reason; LANE_CLOSED carries the eligibility gate's reason; MISSING is a defect, never a quiet gap.",
  counts,
  rows,
};
fs.writeFileSync(path.join(DATA, "parlays", "coverage-matrix.json"), JSON.stringify(artifact, null, 1) + "\n");
console.log(`risk coverage: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ")} (20 cells)`);
for (const r of rows) {
  console.log(`  ${r.lane.padEnd(5)} ${r.laneState.padEnd(6)} ${RISK_ORDER.map((t) => `${t}:${r.tiers[t].state}`).join(" ")}`);
}
if (counts.MISSING > 0) { console.error("::warning::risk coverage has MISSING cells — an evaluation did not account for a tier"); process.exit(2); }

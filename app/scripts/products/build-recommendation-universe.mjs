#!/usr/bin/env node
/**
 * THE DAILY RECOMMENDATION UNIVERSE (Session 7 · Product Engine V2) — every candidate leg, every sport,
 * as a RecommendationReceiptV2, judged by ONE leg floor (engine-v2/eligibility.mjs).
 *
 *   npx tsx app/scripts/products/build-recommendation-universe.mjs --date YYYY-MM-DD --now <ISO> [--write] [--json]
 *
 * Reads committed artifacts only — no network, no credits. `--now` is the publication instant (a replay
 * passes the historical instant; prices captured after it are refused).
 *
 * Writes (with --write) data/internal/products/recommendation-universe/<date>.json:
 *   · the floor version, the registry state per sport, the coverage table (GTP probability vs market-only
 *     vs none, by sport × family), every exclusion code counted, and the funnel;
 *   · every ELIGIBLE receipt in full; ineligible legs as counts only (a Sunday is ~700 rows — the full
 *     list is `--json` on stdout, never committed, so the daily commit stays small).
 * First publication wins for a date: a later run never rewrites the committed universe (a selector
 * shadow built on it must stay reproducible). Pass --force only for a fixture/replay directory.
 *
 * EXIT 0 it ran (zero eligible legs is a RESULT) · 2 it could not run.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { mlbCandidates } from "../../src/lib/products/eligible-leg/normalize-mlb.mjs";
import { nflCandidates } from "../../src/lib/products/eligible-leg/normalize-nfl.mjs";
import { ufcCandidates } from "../../src/lib/products/eligible-leg/normalize-ufc.mjs";
import { eplCandidates } from "../../src/lib/products/eligible-leg/normalize-epl.mjs";
import { marketContextFamilies } from "../../src/lib/parlays/card-leg-eligibility.mjs";
import { receiptFromV1Candidate, receiptFromNflBoardCandidate, receiptFromMlbOptimizerLeg } from "../../src/lib/products/engine-v2/sources.mjs";
import { evaluateReceiptV2, coverageTable, exclusionCounts, LEG_FLOOR_V2, sportState } from "../../src/lib/products/engine-v2/eligibility.mjs";
import { loadNflBoardCandidates, etDateOf } from "../../src/lib/products/engine-v2/nfl-boards.mjs";
import { deriveNflFamilyGates, grantedFamilyKeys } from "../../src/lib/products/engine-v2/family-gate.mjs";
import { nflForecastsAsOf, nflMarketsAsOf, boardAsSchedule } from "./build-product-eligible-legs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..");
const REPO = path.resolve(APP, "..");

export const UNIVERSE_SCHEMA = "recommendation-universe@1";
export const SPORTS = Object.freeze(["mlb", "nfl", "epl", "ufc", "nba"]);

/**
 * Build the universe. Pure apart from reading `root` (public data) and `repo` (internal data).
 */
export function buildRecommendationUniverse({ date, now, root = path.join(APP, "public", "data"), repo = REPO }) {
  const rj = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); } catch { return null; } };
  const onDate = (iso) => etDateOf(iso) === date;
  const receipts = [];

  /* MLB team markets (Bank Builder / Moonshot pool) — the dated file is the slate. */
  const mlb = mlbCandidates({ teamMarkets: rj(`mlb/team-markets/${date}.json`), schedule: rj(`mlb/statsapi-schedule/${date}.json`) ?? boardAsSchedule(rj(`mlb/boards/${date}.json`)), date });
  for (const c of mlb.candidates) receipts.push(receiptFromV1Candidate(c));

  /* MLB props (the Suggested Parlays optimizer pool). */
  const opt = rj(`parlays/optimizer/${date}.json`);
  const coverage = (() => { try { return JSON.parse(fs.readFileSync(path.join(repo, "data/ask-projection/v1/coverage.json"), "utf8")); } catch { return null; } })();
  const demotedFamilies = marketContextFamilies(coverage);
  for (const l of opt?.legPool?.legs ?? []) receipts.push(receiptFromMlbOptimizerLeg(l, { demotedFamilies, generatedAt: opt.generatedAt ?? null }));

  /* NFL team markets + player boards. */
  for (const c of nflCandidates({ forecasts: nflForecastsAsOf(root, now), markets: nflMarketsAsOf(root, now) }).candidates) if (onDate(c.eventStartUtc)) receipts.push(receiptFromV1Candidate(c));
  const nflBoards = loadNflBoardCandidates({ dataRoot: root, workflowsDir: path.join(repo, ".github/workflows"), date });
  for (const c of nflBoards.candidates) receipts.push(receiptFromNflBoardCandidate(c));

  /* EPL and UFC team / fight markets. */
  for (const c of eplCandidates({ forecasts: rj(`soccer/epl/forecasts/${date}.json`) ?? rj("soccer/epl/forecasts/latest.json"), odds: rj("soccer/epl/odds/latest.json"), date }).candidates) if (onDate(c.eventStartUtc)) receipts.push(receiptFromV1Candidate(c));
  for (const c of ufcCandidates({ odds: rj("ufc/odds-latest.json") }).candidates) if (onDate(c.eventStartUtc)) receipts.push(receiptFromV1Candidate(c));

  /* De-duplicate on the stable receipt id (a re-listed leg must not count twice). */
  const seen = new Set(); const unique = [];
  for (const r of receipts) { if (seen.has(r.receiptId)) continue; seen.add(r.receiptId); unique.push(r); }

  /* NFL family-level product gate (Session 8): evidence derived from today's own receipts + the committed
     forward receipt; a family enters only with a founder grant AND zero blockers. */
  const forwardReceipt = (() => { try { return JSON.parse(fs.readFileSync(path.join(repo, "data/internal/research/nfl/replay/player-props-share-level-forward/receipt.json"), "utf8")); } catch { return null; } })();
  const nflFamilyGate = deriveNflFamilyGates({ receipts: unique, forwardReceipt, familyState: nflBoards.familyState });
  const grantedFamilies = grantedFamilyKeys(nflFamilyGate);
  const floor = { ...LEG_FLOOR_V2, grantedFamilies };

  const rows = unique.map((receipt) => ({ receipt, evaluation: evaluateReceiptV2(receipt, { asOf: now, floor }) }));
  const eligible = rows.filter((x) => x.evaluation.eligible);
  const universeHash = createHash("sha256").update(JSON.stringify(eligible.map((x) => x.receipt.receiptId).sort())).digest("hex").slice(0, 12);

  const bySport = Object.fromEntries(SPORTS.map((s) => {
    const own = rows.filter((x) => x.receipt.identity.sport === s);
    return [s, { registryState: sportState(s), candidates: own.length, eligible: own.filter((x) => x.evaluation.eligible).length, events: new Set(own.map((x) => x.receipt.identity.eventId)).size, exclusions: exclusionCounts(own) }];
  }));

  return {
    schema: UNIVERSE_SCHEMA,
    artifact: "recommendation-universe",
    dataClass: "internal",
    date, asOf: now,
    floor: LEG_FLOOR_V2,
    note: "Every candidate leg judged by one floor. Zero eligible is a result, not a failure. Probabilities: MODEL = a GameTimePicks model number (usable only when MODEL_PUBLISHED); MARKET_IMPLIED = the book's de-vigged price, never ours.",
    counts: { candidates: rows.length, eligible: eligible.length, universeHash },
    bySport,
    coverage: coverageTable(rows),
    exclusions: exclusionCounts(rows),
    nflUnknownFamilies: nflBoards.unknownFamilies,
    grantedFamilies: [...grantedFamilies].sort(),
    nflFamilyGate,
    eligibleReceipts: eligible.map((x) => ({ ...x.receipt, evaluation: x.evaluation })),
    _rows: rows,
  };
}

/** Write once: an existing committed universe for the date is never rewritten. */
export function writeUniverse(u, { dir = path.join(REPO, "data/internal/products/recommendation-universe"), force = false } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${u.date}.json`);
  if (fs.existsSync(file) && !force) return { file, written: false };
  const { _rows, ...doc } = u;
  fs.writeFileSync(file, JSON.stringify(doc, null, 1) + "\n");
  return { file, written: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
  const now = arg("--now");
  const date = arg("--date");
  if (!now || !Number.isFinite(Date.parse(now)) || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) { console.error("usage: --date YYYY-MM-DD --now <ISO> [--write] [--json]"); process.exit(2); }
  const u = buildRecommendationUniverse({ date, now });
  if (process.argv.includes("--json")) {
    fs.writeSync(1, JSON.stringify({ ...u, _rows: undefined, rows: u._rows }, null, 1) + "\n");
    process.exit(0);
  }
  console.log(`RECOMMENDATION UNIVERSE · ${date} · asOf ${now} · floor ${LEG_FLOOR_V2.version}`);
  console.log(`candidates ${u.counts.candidates} · eligible ${u.counts.eligible} · universe ${u.counts.universeHash}`);
  for (const [s, v] of Object.entries(u.bySport)) console.log(`  ${s.padEnd(4)} ${v.registryState.padEnd(20)} ${String(v.eligible).padStart(4)}/${String(v.candidates).padEnd(4)} events ${v.events}`);
  console.log("\nsport/family                        cand  gtpAny gtpUse  mkt  none priced elig");
  for (const r of u.coverage) console.log(`  ${`${r.sport}/${r.family}`.padEnd(34)}${String(r.candidates).padStart(4)} ${String(r.gtpProbabilityAny).padStart(6)} ${String(r.gtpProbabilityUsable).padStart(6)} ${String(r.marketOnly).padStart(4)} ${String(r.noProbability).padStart(5)} ${String(r.priced).padStart(6)} ${String(r.eligible).padStart(4)}`);
  console.log("\nexclusions (every failing gate):", JSON.stringify(u.exclusions));
  if (process.argv.includes("--write")) {
    const w = writeUniverse(u, { force: process.argv.includes("--force") });
    console.log(w.written ? `wrote ${path.relative(REPO, w.file)}` : `kept ${path.relative(REPO, w.file)} (first publication wins)`);
  }
}

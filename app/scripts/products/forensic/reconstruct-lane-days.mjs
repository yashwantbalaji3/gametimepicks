#!/usr/bin/env node
/**
 * v1.7 Phase A — time-locked reconstruction of every Bank Builder / Moonshot lane-day.
 *
 * WHAT IT PROVES
 *   For each product date, the lanes AS PUBLISHED (the first git version of
 *   public/data/mr-dub/daily-portfolio.json for that date that carried an active lane, identified by
 *   commit SHA and commit time) joined to the write-once settlement receipt
 *   public/data/mr-dub/settled/<date>.json. Nothing here reads a result file to decide what was
 *   selected: the selection side is the committed publication and only the publication.
 *
 * WHAT IT CANNOT PROVE
 *   · June/July lane-days have no mr-dub/settled receipt (they settled through the retired World Cup
 *     settler and were folded into the July-7 protected base). They are listed with receiptExists=false.
 *   · Aug 15–17 legs carry no kickoff time, so the publication-vs-first-pitch lead is null there.
 *   · Published legs carry no odds-source line/gamePk field, so leg identity is the published id.
 *
 * OUTPUT (internal, never served): data/internal/products/forensic-v17/
 *   lane-days.json   one row per lane-day (published + settled + taxonomy)
 *   legs.json        one row per published leg with its graded result
 *   baseline.json    the A4 baseline metrics, computed from the rows above
 *   manifest.json    coverage: dates, versions, receipts, gaps, generator SHA of this script run
 *
 * Usage: node scripts/products/forensic/reconstruct-lane-days.mjs [--out <dir>]
 * Pure git + fs. No network. Deterministic for a given repository state.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..");
const REPO = path.resolve(APP, "..");
const REL = "app/public/data/mr-dub/daily-portfolio.json";
const RECEIPTS = path.join(APP, "public", "data", "mr-dub", "settled");
const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(REPO, "data", "internal", "products", "forensic-v17");

const git = (args) => execSync(`git -C ${REPO} ${args}`, { encoding: "utf8", maxBuffer: 1 << 27 });
const DECIDED = new Set(["won", "lost", "void", "push"]);

/** "1:41 PM ET" on an ET date → epoch ms (EDT for the June–September window this covers). */
function parseEt(date, s) {
  const m = /^(\d{1,2}):(\d{2}) (AM|PM) ET$/.exec(s || "");
  if (!m) return null;
  let h = Number(m[1]) % 12; if (m[3] === "PM") h += 12;
  const month = Number(date.slice(5, 7));
  const offset = month >= 4 && month <= 10 ? "-04:00" : "-05:00"; // the window is entirely inside EDT
  return Date.parse(`${date}T${String(h).padStart(2, "0")}:${m[2]}:00${offset}`);
}

// 1. Every committed version of the daily portfolio, oldest first.
const versions = [];
for (const line of git(`log --format='%H|%cI|%s' -- ${REL}`).trim().split("\n").reverse()) {
  const [sha, committedAt, ...rest] = line.split("|");
  let doc; try { doc = JSON.parse(git(`show ${sha}:${REL}`)); } catch { continue; }
  versions.push({ sha, committedAt, subject: rest.join("|"), doc });
}
const byDate = new Map();
for (const v of versions) { if (!byDate.has(v.doc.date)) byDate.set(v.doc.date, []); byDate.get(v.doc.date).push(v); }

// 2. Receipts.
const receipts = new Map();
for (const f of fs.readdirSync(RECEIPTS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
  const d = JSON.parse(fs.readFileSync(path.join(RECEIPTS, f), "utf8")); receipts.set(d.date, d);
}

// 3. Rows.
const laneDays = []; const legs = [];
for (const [date, vs] of [...byDate.entries()].sort()) {
  const pub = vs.find((v) => v.doc.lanes?.some((l) => l.status === "active")) ?? vs[0];
  const last = vs.at(-1);
  const genMs = Date.parse(pub.doc.generatedAt);
  for (const lane of pub.doc.lanes ?? []) {
    const rec = receipts.get(date)?.lanes?.find((r) => r.product === lane.product && r.lane === lane.lane) ?? null;
    const recStatus = rec ? (rec.status ?? rec.result ?? null) : null;
    const laneLegs = lane.legs ?? [];
    const games = new Set(laneLegs.map((x) => (x.id ?? x.legId ?? "").split(":")[1] || x.eventId || x.id));
    let jointP = 1, anyP = false, startedAtGen = 0, minLead = null;
    const legRows = laneLegs.map((x, i) => {
      // A MODEL claim (Aug-era `modelProbability`, e.g. 0.94 on a strikeout under) outranks the display
      // `modelConfidence` tier; Sept-era legs carry only the de-vigged market price and say so.
      const p = x.modelProbability ?? x.modelConfidence ?? null;
      const src = x.probabilitySource ?? (x.modelProbability != null ? "model" : "unknown");
      // Graded leg: by id, else by selection, else — the Aug-15..17 receipts carry ONLY `result` per leg —
      // by position, because the settler graded legs in publication order. Never `undefined === undefined`.
      const xid = x.id ?? x.legId ?? null, xsel = x.selection ?? x.displaySelection ?? null;
      const legacyReceipt = !!rec?.legs?.length && rec.legs.every((r) => r.id == null && r.selection == null);
      const graded = (xid && rec?.legs?.find((r) => r.id === xid)) || (xsel && rec?.legs?.find((r) => r.selection === xsel)) || (legacyReceipt ? rec.legs[i] : null) || null;
      const ko = parseEt(date, x.kickoffEt); const lead = ko == null ? null : (ko - genMs) / 60000;
      if (lead != null) { minLead = minLead == null ? lead : Math.min(minLead, lead); if (lead < 0) startedAtGen++; }
      if (p != null) { jointP *= p; anyP = true; }
      return { date, product: lane.product, lane: lane.lane, step: lane.step, legId: x.id ?? x.legId ?? null, market: x.market ?? x.marketType ?? null, selection: x.selection ?? x.displaySelection ?? null, odds: x.odds ?? null, publishedP: p, probabilitySource: src, result: graded?.result ?? null, official: graded?.official ?? null, leadMinutesAtGeneration: lead };
    });
    legs.push(...legRows);
    laneDays.push({
      date, product: lane.product, lane: lane.lane, step: lane.step, publishedStatus: lane.status, publishedAt: pub.committedAt, publicationSha: pub.sha.slice(0, 12), generatedAt: pub.doc.generatedAt, versionsThatDay: vs.length, finalStatusThatDay: last.doc.lanes?.find((l) => l.product === lane.product && l.lane === lane.lane)?.status ?? null,
      legCount: laneLegs.length, distinctGames: games.size, sameGameLegs: laneLegs.length > games.size, markets: laneLegs.map((x) => x.market ?? x.marketType ?? null), combinedOdds: lane.combinedOdds ?? null, stake: lane.stake ?? null, targetReturn: lane.targetReturn ?? null, fitsTarget: lane.fitsTarget ?? null,
      publishedJointP: anyP ? jointP : null, probabilitySources: [...new Set(legRows.map((r) => r.probabilitySource))], noPlayReason: lane.status === "active" ? null : (lane.activationEligibility?.reason ?? lane.shortfallNote ?? null),
      receiptExists: !!rec, settledStatus: recStatus, settledLegResults: rec?.legs?.map((r) => r.result) ?? null, potentialReturn: rec?.potentialReturn ?? lane.potentialReturn ?? null, legsStartedAtGeneration: startedAtGen, minLeadMinutes: minLead,
    });
  }
}

// 4. Failure taxonomy (evidence rules, no hindsight narrative). One label per placed lane-day.
const FROZEN_RUNG_WINDOW = ["2026-08-18", "2026-09-10"]; // P255: rung store frozen 08-17; wins not carried until 09-10
for (const r of laneDays) {
  const placed = r.publishedStatus === "active";
  if (!placed) { r.taxonomy = r.noPlayReason?.includes("fewer than 2") ? "STALE_INPUT" : "NO_PLAY"; r.taxonomyEvidence = r.noPlayReason; continue; }
  if (!DECIDED.has(r.settledStatus)) { r.taxonomy = r.receiptExists ? "PENDING" : "UNRECEIPTED"; r.taxonomyEvidence = r.receiptExists ? "receipt row not decided" : "no mr-dub/settled receipt (pre-Aug-15 era)"; continue; }
  const myLegs = legs.filter((l) => l.date === r.date && l.product === r.product && l.lane === r.lane);
  const lostModelLeg = myLegs.find((l) => l.result === "lost" && l.probabilitySource === "model" && (l.publishedP ?? 0) >= 0.7);
  if (r.settledStatus === "won") {
    const winNotCarried = r.date >= FROZEN_RUNG_WINDOW[0] && r.date < FROZEN_RUNG_WINDOW[1];
    r.taxonomy = winNotCarried ? "SETTLEMENT_OR_RECORD_BUG" : "WON";
    r.taxonomyEvidence = winNotCarried ? "won, but the next day's rung came from a store frozen 2026-08-17 (P255) — the payout never carried" : null;
  } else if (r.settledStatus === "lost") {
    if (lostModelLeg) { r.taxonomy = "MODEL_MISS"; r.taxonomyEvidence = `lost leg ${lostModelLeg.legId} published as a MODEL probability ${lostModelLeg.publishedP} (demoted market family)`; }
    else if (r.sameGameLegs) { r.taxonomy = "CORRELATION_CONCENTRATION"; r.taxonomyEvidence = `${r.legCount} legs over ${r.distinctGames} games`; }
    else if (r.probabilitySources.every((s) => s === "market-devigged" || s === "unknown")) { r.taxonomy = "PRICE_STRUCTURE"; r.taxonomyEvidence = `every published probability is the de-vigged market price; published joint p ${r.publishedJointP?.toFixed(3)} — the loss is inside the market's own expectation`; }
    else { r.taxonomy = "VARIANCE_OR_UNRESOLVED"; r.taxonomyEvidence = null; }
  } else { r.taxonomy = "VOID_OR_PUSH"; r.taxonomyEvidence = r.settledStatus; }
}

// 5. Baseline metrics (A4).
const placed = laneDays.filter((r) => r.publishedStatus === "active");
const decided = placed.filter((r) => DECIDED.has(r.settledStatus));
const tally = (rows, f) => rows.reduce((m, r) => { const k = f(r); m[k] = (m[k] ?? 0) + 1; return m; }, {});
function cycles(product) {
  // A cycle = consecutive placed lane-days per lane starting at step 1 (receipt era only), ending at a loss or open.
  const out = [];
  for (const lane of ["A", "B"]) {
    const seq = decided.filter((r) => r.product === product && r.lane === lane).sort((a, b) => a.date.localeCompare(b.date));
    let cur = null;
    for (const r of seq) {
      if (r.step === 1 || !cur) { if (cur) { cur.outcome = "truncated"; cur.end = cur.steps.at(-1).date; out.push(cur); } cur = { product, lane, start: r.date, steps: [] }; }
      cur.steps.push({ date: r.date, step: r.step, result: r.settledStatus, taxonomy: r.taxonomy });
      if (r.settledStatus === "lost") { cur.end = r.date; cur.outcome = "lost"; out.push(cur); cur = null; }
    }
    if (cur) { cur.outcome = "open"; out.push(cur); }
  }
  for (const c of out) c.furthestStep = Math.max(...c.steps.map((s) => s.step));
  return out;
}
const baseline = {};
for (const product of ["bank-builder", "moonshot"]) {
  const p = placed.filter((r) => r.product === product), d = decided.filter((r) => r.product === product);
  const cyc = cycles(product);
  const legD = legs.filter((l) => l.product === product && ["won", "lost"].includes(l.result));
  const bySrc = {}; for (const l of legD) { const k = l.probabilitySource; bySrc[k] ??= { legs: 0, won: 0, impliedWins: 0 }; bySrc[k].legs++; if (l.result === "won") bySrc[k].won++; bySrc[k].impliedWins += l.publishedP ?? 0; }
  for (const v of Object.values(bySrc)) { v.hitRate = +(v.won / v.legs).toFixed(3); v.impliedRate = +(v.impliedWins / v.legs).toFixed(3); v.impliedWins = +v.impliedWins.toFixed(2); }
  const byMarket = {}; for (const l of legD) { const k = l.market; byMarket[k] ??= { legs: 0, won: 0 }; byMarket[k].legs++; if (l.result === "won") byMarket[k].won++; }
  const byOdds = {}; for (const l of legD.filter((l) => l.odds != null)) { const o = l.odds; const k = o <= -200 ? "<=-200" : o < -110 ? "-199..-111" : o <= 110 ? "-110..+110" : o <= 200 ? "+111..+200" : ">+200"; byOdds[k] ??= { legs: 0, won: 0 }; byOdds[k].legs++; if (l.result === "won") byOdds[k].won++; }
  const withP = d.filter((r) => r.publishedJointP != null);
  baseline[product] = {
    laneDaysPublishedActive: p.length, laneDaysDecided: d.length, laneDaysUnreceipted: p.filter((r) => !r.receiptExists).length,
    decidedByStatus: tally(d, (r) => r.settledStatus), decidedByStep: tally(d, (r) => `step${r.step}|${r.settledStatus}`), decidedByLegCount: tally(d, (r) => `${r.legCount}legs|${r.settledStatus}`), decidedBySameGame: tally(d, (r) => `${r.sameGameLegs ? "sameGame" : "distinctGames"}|${r.settledStatus}`),
    taxonomy: tally(p, (r) => r.taxonomy), noPlayLaneDays: tally(laneDays.filter((r) => r.product === product && r.publishedStatus !== "active"), (r) => r.taxonomy),
    cyclesStarted: cyc.length, cyclesCompleted: 0, cyclesLost: cyc.filter((c) => c.outcome === "lost").length, cyclesOpen: cyc.filter((c) => c.outcome === "open").length, cyclesTruncatedByFrozenRung: cyc.filter((c) => c.outcome === "truncated").length, furthestStepPerCycle: cyc.map((c) => c.furthestStep), meanFurthestStep: +(cyc.reduce((a, c) => a + c.furthestStep, 0) / Math.max(1, cyc.length)).toFixed(2),
    publishedJointP: { n: withP.length, mean: +(withP.reduce((a, r) => a + r.publishedJointP, 0) / Math.max(1, withP.length)).toFixed(3), expectedWins: +withP.reduce((a, r) => a + r.publishedJointP, 0).toFixed(2), actualWins: withP.filter((r) => r.settledStatus === "won").length },
    legsByProbabilitySource: bySrc, legsByMarket: byMarket, legsByOddsBucket: byOdds,
    publicationLead: { laneDaysGeneratedAfterAFirstPitch: p.filter((r) => r.legsStartedAtGeneration > 0).length, laneDaysWithoutKickoff: p.filter((r) => r.minLeadMinutes == null).length },
    cycles: cyc,
  };
}
// Ladder arithmetic under the market's own numbers — intuition, not a performance claim.
baseline.note = "cyclesCompleted is 0 in the receipt era by construction of the data (no lane cleared step 5 since 2026-08-15); the two completed ladders of June 2026 predate the receipts and live in mr-dub/banked-ladders.json.";

fs.mkdirSync(OUT, { recursive: true });
const manifest = {
  schemaVersion: 1, artifact: "forensic-v17/lane-days", dataClass: "internal-research", generatedAt: new Date().toISOString(),
  repoHead: git("rev-parse HEAD").trim(), source: { publications: REL, receipts: "app/public/data/mr-dub/settled/<date>.json" },
  coverage: { dates: byDate.size, firstDate: [...byDate.keys()].sort()[0], lastDate: [...byDate.keys()].sort().at(-1), publishedVersions: versions.length, receipts: receipts.size, receiptFirst: [...receipts.keys()].sort()[0], receiptLast: [...receipts.keys()].sort().at(-1) },
  gaps: { laneDaysPlacedWithoutReceipt: placed.filter((r) => !r.receiptExists).map((r) => `${r.date} ${r.product} ${r.lane}`), laneDaysWithoutKickoff: placed.filter((r) => r.minLeadMinutes == null).map((r) => `${r.date} ${r.product} ${r.lane}`), publishedLegsCarryNoLineOrGamePk: true, publishedLanesCarryNoPolicyVersion: true },
  taxonomyRules: { STALE_INPUT: "lane published as awaiting with 'fewer than 2 model-qualified legs' — the product pool did not exist (team-leg loader wired 2026-09-05)", SETTLEMENT_OR_RECORD_BUG: "a won step inside 2026-08-18..2026-09-09 whose payout never carried (rung store frozen 2026-08-17, fixed P255 2026-09-10)", MODEL_MISS: "a lost leg published with a MODEL probability >= 0.70 from a demoted market family", CORRELATION_CONCENTRATION: "a lost card with more legs than distinct games", PRICE_STRUCTURE: "a lost card whose every leg probability was the de-vigged market price — the loss is inside the market's own expectation of the construction", VARIANCE_OR_UNRESOLVED: "anything else" },
};
fs.writeFileSync(path.join(OUT, "lane-days.json"), JSON.stringify(laneDays, null, 1));
fs.writeFileSync(path.join(OUT, "legs.json"), JSON.stringify(legs, null, 1));
fs.writeFileSync(path.join(OUT, "baseline.json"), JSON.stringify(baseline, null, 1));
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`forensic-v17: ${laneDays.length} lane-days over ${byDate.size} dates (${versions.length} published versions, ${receipts.size} receipts) → ${OUT}`);
for (const product of ["bank-builder", "moonshot"]) { const b = baseline[product]; console.log(`${product}: placed ${b.laneDaysPublishedActive} decided ${b.laneDaysDecided} ${JSON.stringify(b.decidedByStatus)} taxonomy ${JSON.stringify(b.taxonomy)} cycles ${b.cyclesStarted} (lost ${b.cyclesLost}, open ${b.cyclesOpen}, truncated ${b.cyclesTruncatedByFrozenRung}) furthest ${JSON.stringify(b.furthestStepPerCycle)} jointP mean ${b.publishedJointP.mean} exp ${b.publishedJointP.expectedWins} act ${b.publishedJointP.actualWins}`); }

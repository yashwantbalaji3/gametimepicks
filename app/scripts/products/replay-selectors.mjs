#!/usr/bin/env node
/**
 * v1.7 Phase F — time-locked replay of every preregistered selector policy.
 *
 *   npx tsx scripts/products/replay-selectors.mjs [--from 2026-08-15] [--to 2026-09-20] [--write]
 *
 * For each product date: the eligible universe is built at THE DAY'S ACTUAL PUBLICATION INSTANT
 * (`generatedAt` of the published lanes, from the Phase A reconstruction), prices captured after it are
 * refused by the contract, and the rung position for each policy is carried forward from that policy's
 * OWN replayed settlement (never from the live receipts, which belong to the legacy policy). Cards are
 * graded from the committed official linescore cache only. Days with no linescore stay PENDING and are
 * never a loss.
 *
 * What it can and cannot prove: it proves whether a policy would have produced a better ladder from the
 * same information; it cannot prove the future. Coverage is labelled per day.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEligibleLegs } from "./build-product-eligible-legs.mjs";
import { guardLegs } from "../../src/lib/products/eligible-leg/contract.mjs";
import { selectProduct } from "../../src/lib/products/selector/select.mjs";
import { POLICIES, LADDERS, policyId } from "../../src/lib/products/selector/policies.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..");
const REPO = path.resolve(APP, "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const FROM = arg("--from", "2026-08-15"), TO = arg("--to", "2026-09-20"), WRITE = process.argv.includes("--write");

const laneDays = JSON.parse(fs.readFileSync(path.join(REPO, "data", "internal", "products", "forensic-v17", "lane-days.json"), "utf8"));
const pubAt = {}; for (const r of laneDays) if (r.publishedStatus === "active" && r.generatedAt) pubAt[r.date] = pubAt[r.date] && pubAt[r.date] < r.generatedAt ? pubAt[r.date] : r.generatedAt;
const dates = [];
for (const f of fs.readdirSync(path.join(APP, "public", "data", "mlb", "team-markets"))) { const d = f.replace(".json", ""); if (d >= FROM && d <= TO) dates.push(d); }
dates.sort();

/** Grade a card from the official linescore cache. */
function linescores(date) { try { const d = JSON.parse(fs.readFileSync(path.join(REPO, "data", "internal", "mlb", "linescores", `${date}.json`), "utf8")); return Array.isArray(d) ? d : (d.linescores ?? d.games ?? Object.values(d)); } catch { return null; } }
function gradeLeg(leg, ls) {
  const g = (ls ?? []).find((x) => String(x.gamePk) === String(leg.eventId));
  if (!g || !g.isFinal || !Number.isFinite(g.homeRuns) || !Number.isFinite(g.awayRuns)) return "pending";
  const home = g.homeRuns, away = g.awayRuns;
  if (leg.marketKey === "mlb_moneyline") return (leg.side === "home" ? home > away : away > home) ? "won" : "lost";
  if (leg.marketKey === "mlb_run_line") { const m = leg.side === "home" ? home - away + leg.line : away - home + leg.line; return m > 0 ? "won" : m < 0 ? "lost" : "push"; }
  if (leg.marketKey === "mlb_total_runs") { const t = home + away; if (t === leg.line) return "push"; return (leg.side === "over" ? t > leg.line : t < leg.line) ? "won" : "lost"; }
  return "pending";
}
function gradeCard(card, ls) {
  const r = card.legs.map((l) => gradeLeg(l, ls));
  if (r.includes("lost")) return { status: "lost", legs: r };
  if (r.includes("pending")) return { status: "pending", legs: r };
  if (r.every((x) => x === "push")) return { status: "push", legs: r };
  return { status: "won", legs: r };
}

/** Carry a lane's position from its own replayed result (ladder-position rules). */
function advance(policy, pos, status, card) {
  const ladder = LADDERS[policy.ladder];
  if (status === "won") {
    const payout = +(card.stake * card.decimal).toFixed(2);
    if (payout >= ladder[ladder.length - 1][1]) return { step: 1, stake: policy.seed, completed: true }; // cleared the final goal
    // The next rung is the highest whose START the payout has reached (skips rungs already cleared).
    let step = pos.step; while (step < ladder.length && payout >= ladder[step][0]) step++;
    return { step, stake: payout, completed: false };
  }
  if (status === "lost") return { step: 1, stake: policy.seed, completed: false };
  return { ...pos, completed: false }; // push/void: same rung, same stake
}

const results = {};
for (const name of Object.keys(POLICIES)) results[name] = { policyId: policyId(name), product: POLICIES[name].product, positions: { A: { step: 1, stake: POLICIES[name].seed }, B: { step: 1, stake: POLICIES[name].seed } }, days: [], lastPlaced: { A: null, B: null } };
const coverage = [];
for (const date of dates) {
  // THE TIME-LOCK. The only price archive is the committed team-market file, which the ingest rewrites
  // intra-day (audit defect S7). If its capture postdates the day's publication, the replay cannot see
  // the prices the original saw; it runs at the CAPTURE instant instead — later, so fewer pregame games,
  // never earlier prices — and labels the day. A day with no known publication instant is the same case.
  const tm = JSON.parse(fs.readFileSync(path.join(APP, "public", "data", "mlb", "team-markets", `${date}.json`), "utf8"));
  const captureAt = tm.generatedAt;
  const publication = pubAt[date] ?? null;
  const asOf = publication && publication >= captureAt ? publication : captureAt;
  const timeLock = publication ? (publication >= captureAt ? "AT_PUBLICATION" : "AT_CAPTURE_AFTER_PUBLICATION") : "AT_CAPTURE_NO_PUBLICATION";
  const { artifact } = buildEligibleLegs({ date, now: asOf });
  const { kept } = guardLegs(artifact.legs, { asOf });
  const ls = linescores(date);
  coverage.push({ date, asOf, publication, captureAt, timeLock, eligibleLegs: kept.length, linescore: !!ls });
  const usedByBB = {}; // per policy family, BB legs are excluded from the same family's Moonshot? No — policies are independent; each replays alone.
  for (const [name, st] of Object.entries(results)) {
    const policy = POLICIES[name];
    const positions = { A: { ...st.positions.A, state: "ready" }, B: { ...st.positions.B, state: "ready" } };
    const cadence = policy.cadenceDays ? { A: { lastPlacedDate: st.lastPlaced.A, date }, B: { lastPlacedDate: st.lastPlaced.B, date } } : null;
    const sel = selectProduct({ policyName: name, legs: kept, positions, asOf, cadence });
    const day = { date, asOf, lanes: {} };
    for (const lane of ["A", "B"]) {
      const r = sel[lane];
      if (r.status !== "CARD") { day.lanes[lane] = { status: "NO_QUALIFYING_PLAY", reason: r.reason, step: r.rung.step, stake: r.rung.stake }; continue; }
      const g = gradeCard(r.card, ls);
      const before = st.positions[lane];
      day.lanes[lane] = { status: g.status, step: before.step, stake: r.card.stake, american: r.card.american, jointP: r.card.jointP, legs: r.card.legs.map((l) => `${l.displayMatchup} · ${l.displaySelection} (${l.american})`), legResults: g.legs, relationships: r.card.relationshipsRecorded, receipt: r.receipt };
      if (g.status !== "pending") { const next = advance(policy, before, g.status, r.card); day.lanes[lane].completed = next.completed; st.positions[lane] = { step: next.step, stake: next.stake }; }
      st.lastPlaced[lane] = date;
    }
    st.days.push(day);
  }
}

/** Metrics per policy (charter §14 I4). */
function metrics(st) {
  const rows = st.days.flatMap((d) => ["A", "B"].map((lane) => ({ date: d.date, lane, ...d.lanes[lane] })));
  const placed = rows.filter((r) => r.status !== "NO_QUALIFYING_PLAY"), decided = placed.filter((r) => ["won", "lost", "push"].includes(r.status));
  const byStep = {}; for (const r of decided) { byStep[r.step] ??= { won: 0, lost: 0, push: 0 }; byStep[r.step][r.status]++; }
  const noPlay = {}; for (const r of rows.filter((r) => r.status === "NO_QUALIFYING_PLAY")) noPlay[r.reason] = (noPlay[r.reason] ?? 0) + 1;
  const jp = decided.filter((r) => r.jointP != null);
  return {
    laneDays: rows.length, placed: placed.length, decided: decided.length, pending: placed.length - decided.length,
    won: decided.filter((r) => r.status === "won").length, lost: decided.filter((r) => r.status === "lost").length, push: decided.filter((r) => r.status === "push").length,
    survivalPerStep: +(decided.filter((r) => r.status === "won").length / Math.max(1, decided.filter((r) => r.status !== "push").length)).toFixed(3),
    byStep, completions: placed.filter((r) => r.completed).length, furthestStep: Math.max(0, ...placed.map((r) => r.step)),
    noPlayLaneDays: rows.length - placed.length, noPlayByReason: noPlay, publicationRate: +(placed.length / Math.max(1, rows.length)).toFixed(3),
    expectedWinsUnderPublishedP: +jp.reduce((a, r) => a + r.jointP, 0).toFixed(2), meanJointP: +(jp.reduce((a, r) => a + r.jointP, 0) / Math.max(1, jp.length)).toFixed(3),
    priceDistribution: placed.map((r) => r.american).sort((a, b) => a - b),
  };
}
const summary = { schemaVersion: 1, artifact: "selector-replay", dataClass: "internal-research", generatedAt: new Date().toISOString(), window: { from: FROM, to: TO, dates: dates.length }, coverage, policies: {} };
for (const [name, st] of Object.entries(results)) summary.policies[name] = { policyId: st.policyId, product: st.product, metrics: metrics(st) };
for (const [name, p] of Object.entries(summary.policies)) { const m = p.metrics; console.log(`${name.padEnd(10)} ${p.product.padEnd(12)} placed ${String(m.placed).padStart(3)} decided ${String(m.decided).padStart(3)} W-L-P ${m.won}-${m.lost}-${m.push} survival ${m.survivalPerStep} completions ${m.completions} furthest ${m.furthestStep} noPlay ${m.noPlayLaneDays} (${Object.entries(m.noPlayByReason).map(([k, v]) => `${k}:${v}`).join(",")}) meanP ${m.meanJointP} expW ${m.expectedWinsUnderPublishedP}`); }
const tl = {}; for (const c of coverage) tl[c.timeLock] = (tl[c.timeLock] ?? 0) + 1;
console.log(`coverage: ${coverage.length} dates · time-lock ${JSON.stringify(tl)} · linescore ${coverage.filter((c) => c.linescore).length} · mean eligible legs ${(coverage.reduce((a, c) => a + c.eligibleLegs, 0) / coverage.length).toFixed(1)}`);
if (WRITE) {
  const dir = path.join(REPO, "data", "internal", "products", "selector-replay"); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 1));
  fs.writeFileSync(path.join(dir, "days.json"), JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.days])), null, 1));
  console.log(`wrote ${dir}/summary.json + days.json`);
}

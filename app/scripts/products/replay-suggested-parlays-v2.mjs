#!/usr/bin/env node
/**
 * SUGGESTED PARLAYS — V1 (as published) vs V2 (shadow selector), replayed time-safely. Session 7.
 *
 *   npx tsx app/scripts/products/replay-suggested-parlays-v2.mjs [--write] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *
 * ⚠ TIME SAFETY. The V2 input for a day is the ProductEligibleLeg universe COMMITTED for that day by
 * daily-products (data/internal/products/eligible-legs/<date>.json), evaluated at the instant the file
 * itself records (`asOf`). Nothing captured after that instant is read; outcomes are read only to grade
 * the cards each selector had already chosen. Days with no committed universe are reported as
 * NO_UNIVERSE and never reconstructed.
 *
 * V1 is NOT re-run: it is the ladder as published (parlays/risk-ladder/<date>.json) and its settlement
 * (parlays/lab-settled/<date>.json). V1's legs are also put through leg-floor@2, so the report states how
 * many of the legs V1 actually published would have passed V2's floor.
 *
 * Writes (with --write) data/internal/products/engine-v2/sp-replay.json. Never touches a public file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { receiptFromV1Candidate, receiptFromMlbOptimizerLeg } from "../../src/lib/products/engine-v2/sources.mjs";
import { evaluateReceiptV2 } from "../../src/lib/products/engine-v2/eligibility.mjs";
import { selectSuggestedParlaysV2, spPolicyId } from "../../src/lib/products/engine-v2/suggested-parlays.mjs";
import { gradeCardFromLinescores } from "../../src/lib/products/selector/shadow.mjs";
import { marketContextFamilies } from "../../src/lib/parlays/card-leg-eligibility.mjs";
import { PUBLIC_RISK_TIERS, getRiskBucketForCombinedOdds } from "../../src/lib/parlays/risk-odds-bands.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..");
const REPO = path.resolve(APP, "..");
const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const UNIVERSE_DIR = path.join(REPO, "data/internal/products/eligible-legs");
const linescores = (date) => { const d = rj(path.join(REPO, "data/internal/mlb/linescores", `${date}.json`)); return d ? (Array.isArray(d) ? d : (d.linescores ?? d.games ?? Object.values(d))) : null; };

export function replayDay(date, { coverage }) {
  const day = rj(path.join(UNIVERSE_DIR, `${date}.json`));
  const ladder = rj(path.join(APP, "public/data/parlays/risk-ladder", `${date}.json`));
  const settled = rj(path.join(APP, "public/data/parlays/lab-settled", `${date}.json`));
  const rows = linescores(date);
  const out = { date, asOf: day?.asOf ?? null, v1: {}, v2: {}, v1LegsThroughV2Floor: null };

  /* ── V1 as published ── */
  const v1Cards = (ladder?.cards ?? []).filter((c) => (c.legs ?? []).every((l) => (l.sport ?? "mlb") === "mlb"));
  const demoted = marketContextFamilies(coverage);
  let v1Legs = 0, v1LegsPass = 0; const v1LegCodes = {};
  for (const c of v1Cards) {
    const tier = c.band ?? c.tier ?? getRiskBucketForCombinedOdds(c.combinedAmerican ?? c.americanOdds);
    const s = (settled?.cards ?? []).find((x) => x.slipId && x.slipId === c.slipId) ?? null;
    out.v1[tier] = { state: "PUBLISHED", american: c.combinedAmerican ?? c.americanOdds ?? null, legs: (c.legs ?? []).length, result: s?.result ?? s?.status ?? "unsettled" };
    for (const l of c.legs ?? []) {
      v1Legs++;
      const r = receiptFromMlbOptimizerLeg({ ...l, playerName: l.player, oddsForSide: l.oddsForSide ?? l.odds ?? null, bookmaker: l.bookmaker ?? null }, { demotedFamilies: demoted });
      const e = evaluateReceiptV2(r, { asOf: day?.asOf ?? `${date}T12:00:00Z` });
      if (e.eligible) v1LegsPass++;
      for (const code of e.exclusionCodes) v1LegCodes[code] = (v1LegCodes[code] ?? 0) + 1;
    }
  }
  for (const t of PUBLIC_RISK_TIERS) if (!out.v1[t]) out.v1[t] = { state: ladder ? "NO_CARD" : "NO_LADDER", reason: (ladder?.skipped ?? []).find((s) => (s.band ?? s.tier) === t)?.reason ?? null };
  out.v1LegsThroughV2Floor = { legs: v1Legs, pass: v1LegsPass, codes: v1LegCodes };

  /* ── V2 on the committed universe at its own instant ── */
  if (!day?.asOf || !Array.isArray(day.legs)) {
    for (const t of PUBLIC_RISK_TIERS) out.v2[t] = { state: "NO_UNIVERSE" };
    return out;
  }
  const receipts = day.legs.map((l) => receiptFromV1Candidate(l));
  const eligible = receipts.filter((r) => evaluateReceiptV2(r, { asOf: day.asOf }).eligible);
  out.v2Universe = { candidates: receipts.length, eligible: eligible.length, v1ContractEligible: day.legs.filter((l) => l.productEligible).length };
  const sel = selectSuggestedParlaysV2(eligible, { asOf: day.asOf });
  for (const t of sel.tiers) {
    if (!t.card) { out.v2[t.tier] = { state: "NO_QUALIFYING_CARD", reason: t.reasonCode }; continue; }
    const g = rows ? gradeCardFromLinescores({ legs: t.card.legs.map((l) => ({ eventId: l.eventId, marketKey: l.marketKey, side: l.side, line: l.line })) }, rows) : { status: "pending" };
    const started = t.card.legs.filter((l) => Date.parse(l.eventStartUtc) <= Date.parse(day.asOf)).length;
    const events = new Set(t.card.legs.map((l) => l.eventId));
    out.v2[t.tier] = { state: "PUBLISHABLE", american: t.card.combinedAmerican, legs: t.card.legs.length, jointProbability: +t.card.jointProbability.toFixed(4), basis: t.card.jointProbabilityBasis, fairRatio: +t.card.fairRatio.toFixed(4), minLegProbability: +t.card.minLegProbability.toFixed(4), result: g.status, violations: { startedLegs: started, sameEvent: events.size !== t.card.legs.length ? 1 : 0 }, selection: t.card.legs.map((l) => `${l.selection} (${l.price > 0 ? "+" : ""}${l.price})`) };
  }
  return out;
}

export function summarize(days) {
  const tiers = {};
  for (const t of PUBLIC_RISK_TIERS) {
    const s = { v1: { published: 0, won: 0, lost: 0, push: 0, other: 0, prices: [] }, v2: { published: 0, won: 0, lost: 0, push: 0, pending: 0, noCard: {}, prices: [], jointP: [], violations: 0 } };
    for (const d of days) {
      const a = d.v1[t];
      if (a?.state === "PUBLISHED") { s.v1.published++; const r = String(a.result).toLowerCase(); if (/win|won/.test(r)) s.v1.won++; else if (/loss|lost/.test(r)) s.v1.lost++; else if (/push/.test(r)) s.v1.push++; else s.v1.other++; if (Number.isFinite(a.american)) s.v1.prices.push(a.american); }
      const b = d.v2[t];
      if (b?.state === "PUBLISHABLE") { s.v2.published++; s.v2[b.result === "won" ? "won" : b.result === "lost" ? "lost" : b.result === "push" ? "push" : "pending"]++; s.v2.prices.push(b.american); s.v2.jointP.push(b.jointProbability); s.v2.violations += b.violations.startedLegs + b.violations.sameEvent; }
      else if (b) s.v2.noCard[b.reason ?? b.state] = (s.v2.noCard[b.reason ?? b.state] ?? 0) + 1;
    }
    const med = (a) => { if (!a.length) return null; const x = [...a].sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
    const mean = (a) => (a.length ? +(a.reduce((p, q) => p + q, 0) / a.length).toFixed(3) : null);
    tiers[t] = { v1: { ...s.v1, medianAmerican: med(s.v1.prices), prices: undefined }, v2: { ...s.v2, medianAmerican: med(s.v2.prices), meanJointProbability: mean(s.v2.jointP), expectedWins: +s.v2.jointP.reduce((p, q) => p + q, 0).toFixed(2), prices: undefined, jointP: undefined } };
  }
  return tiers;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const from = arg("--from", "2026-09-21"), to = arg("--to", "2026-10-01");
  const coverage = rj(path.join(REPO, "data/ask-projection/v1/coverage.json"));
  const dates = [];
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 864e5) dates.push(new Date(t).toISOString().slice(0, 10));
  const days = dates.map((d) => replayDay(d, { coverage }));
  const summary = summarize(days);
  const doc = { schema: "sp-v1-v2-replay@1", artifact: "suggested-parlays-replay", dataClass: "internal-research", policy: spPolicyId, from, to, generatedAt: new Date().toISOString(), timeSafety: "V2 input = committed eligible-legs/<date>.json evaluated at its own asOf; outcomes used only to grade already-chosen cards", days, summary };
  console.log(`SUGGESTED PARLAYS REPLAY ${from} → ${to} · ${spPolicyId}`);
  for (const d of days) {
    const cell = (x) => (x?.state === "PUBLISHED" || x?.state === "PUBLISHABLE" ? `${x.american > 0 ? "+" : ""}${x.american}/${x.legs}L ${String(x.result).slice(0, 4)}` : (x?.reason ?? x?.state ?? "—").slice(0, 16));
    console.log(`${d.date}  V1: ${PUBLIC_RISK_TIERS.map((t) => cell(d.v1[t]).padEnd(18)).join(" ")}\n            V2: ${PUBLIC_RISK_TIERS.map((t) => cell(d.v2[t]).padEnd(18)).join(" ")}  ${d.v2Universe ? `(universe ${d.v2Universe.eligible}/${d.v2Universe.candidates}; v1-contract ${d.v2Universe.v1ContractEligible})` : ""}  v1 legs passing V2 floor ${d.v1LegsThroughV2Floor.pass}/${d.v1LegsThroughV2Floor.legs}`);
  }
  console.log("\nSUMMARY", JSON.stringify(summary, null, 1));
  if (process.argv.includes("--write")) {
    const dir = path.join(REPO, "data/internal/products/engine-v2"); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "sp-replay.json"), JSON.stringify(doc, null, 1) + "\n");
    console.log(`wrote ${path.relative(REPO, path.join(dir, "sp-replay.json"))}`);
  }
}

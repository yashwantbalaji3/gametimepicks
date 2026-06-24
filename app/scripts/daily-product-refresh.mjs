#!/usr/bin/env node
/**
 * DAILY PRODUCT REFRESH pipeline. One command to roll the whole platform to a slate:
 *   1. Settle the previous day's Bank Builder lanes — ONLY if an official results bundle exists
 *      (fail-closed; never fabricates a settlement).
 *   2. Generate the current day's Bank Builder + Moonshot daily portfolio (safest cross-sport cards).
 *   3. Refresh World Cup Specials (team-model fallback when player props are absent).
 *   4. Rebuild the Mr. Dub master ledger.
 *   5. Run consistency checks (canonical money frozen, exposure math, no stale-as-active).
 *   6. Write daily-refresh-report.json.
 *
 *   cd app && npx tsx scripts/daily-product-refresh.mjs --date 2026-06-24 [--apply]
 *
 * Without --apply it is a DRY-RUN (computes + reports, writes nothing). NEVER mutates the canonical Bank
 * Builder bankroll/crown/record except through the official seed-model settlement path (step 1).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPersistedDailyPortfolio } from "../src/lib/daily-portfolio/accounting.ts";
import { buildWorldCupSpecials } from "../src/lib/world-cup/world-cup-specials.ts";
import { buildMasterLedger } from "../src/lib/mr-dub/master-ledger.ts";
import { loadHomerNukes } from "../src/lib/mlb/homer-nukes.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(APP, "public", "data");
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const date = val("--date", new Date().toISOString().slice(0, 10));
const apply = has("--apply");
const nowIso = `${date}T08:00:00Z`;
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const round2 = (n) => Number(n.toFixed(2));
const prevDate = (d) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };

const report = { date, apply, generatedAt: nowIso, settled: [], generated: [], exposure: 0, warnings: [], consistency: {} };
const moneyBefore = readJson(path.join(DATA, "mr-dub", "portfolio.json"));

// 1. SETTLE previous day — only if its official bundle exists (fail-closed).
const prev = prevDate(date);
const officialBundle = path.join(DATA, "world-cup", "settlement", `${prev}.json`);
if (fs.existsSync(officialBundle)) {
  report.settled.push({ date: prev, status: "official_bundle_present", note: "run settle-daily-portfolio.mjs --apply to apply the seed-model settlement" });
} else {
  report.settled.push({ date: prev, status: "awaiting_official_results", note: `no ${prev}.json official bundle — settlement deferred (fail-closed, never fabricated)` });
}

// 2. Generate Bank Builder + Moonshot daily portfolio (cross-sport safest cards).
const dp = buildPersistedDailyPortfolio(DATA, nowIso, date, nowIso, apply);
const activeBB = dp.lanes.filter((l) => l.product === "bank-builder" && l.status === "active").length;
const activeMoon = dp.lanes.filter((l) => l.product === "moonshot" && l.status === "active").length;
report.generated.push({ product: "bank-builder", activeLanes: activeBB, awaiting: 2 - activeBB });
report.generated.push({ product: "moonshot", activeLanes: activeMoon, awaiting: 2 - activeMoon });
report.exposure = round2(dp.openExposure);

// 3. Refresh World Cup Specials (team-model fallback if needed).
const specials = buildWorldCupSpecials({ root: DATA, nowIso, date });
report.generated.push({ product: "wc-specials", cards: specials.cards.length, fallback: specials.diagnostics.fallbackMode ?? null });
if (specials.diagnostics.playerPropsUnavailable) report.warnings.push("wc-specials: player props unavailable — using team models");

// 4. Homer Nukes V2 — two $10 / 3-leg lanes derived from the HR props. Persist the active lanes so the
//    master ledger tracks the product (date + $20 exposure).
const homer = loadHomerNukes(DATA, date);
report.generated.push({ product: "homer-nukes", lanes: homer.lanes.length, stake: homer.stake, available: homer.available });
if (apply && homer.available) {
  fs.writeFileSync(path.join(DATA, "mlb", "homer-nukes-active.json"), JSON.stringify({
    date, generatedAt: nowIso, stake: homer.stake, exposure: homer.stake, confidence: homer.confidence,
    lanes: homer.lanes.map((l) => ({ lane: l.lane, stake: l.stake, combinedOdds: l.combinedOdds, projectedReturn: l.projectedReturn, impliedProbability: l.impliedProbability, legs: l.legs.map((g) => ({ player: g.player, playerId: g.playerId, photoUrl: g.photoUrl, team: g.teamAbbr, matchup: g.matchup, odds: g.odds, modelProbability: g.modelProbability })) })),
  }, null, 2) + "\n");
}

// 5. Rebuild master ledger.
const ledger = buildMasterLedger(DATA, nowIso, date);
report.masterLedger = { aggregate: ledger.aggregate, products: ledger.products.map((p) => ({ id: p.productId, record: `${p.record.wins}-${p.record.losses}`, roi: p.roi, exposure: p.exposure, stale: p.stale })) };

// 6. CONSISTENCY CHECKS.
const c = report.consistency;
c.canonicalMoneyFrozen = moneyBefore ? (moneyBefore.currentBankroll === 10176.17 && moneyBefore.crownBankroll === 10376.17) : null;
const sumSeeds = round2(dp.lanes.filter((l) => l.status === "active").reduce((s, l) => s + (l.exposure ?? 0), 0));
c.exposureMatchesActiveSeeds = dp.openExposure === sumSeeds;
c.availableEqualsActiveMinusExposure = dp.availableBankroll === round2(dp.activeBankroll - dp.openExposure);
c.noStaleProductCarriesExposure = ledger.products.every((p) => !p.stale || p.exposure === 0);
for (const [k, v] of Object.entries(c)) if (v === false) report.warnings.push(`consistency check FAILED: ${k}`);

// 7. WRITE.
if (apply) {
  // daily-portfolio.json is written by buildPersistedDailyPortfolio(...activate) via accounting; WC specials + ledger here.
  fs.writeFileSync(path.join(DATA, "mr-dub", "daily-portfolio.json"), JSON.stringify(dp, null, 2) + "\n");
  // archive prior specials slate, then write current
  const SPEC = path.join(DATA, "world-cup", "world-cup-specials.json");
  const HIST = path.join(DATA, "world-cup", "world-cup-specials-history.json");
  const prior = readJson(SPEC);
  if (prior?.date && prior.date !== date) {
    const h = readJson(HIST) ?? { version: "world-cup-specials-history-v1", days: [] };
    if (!h.days.some((d) => d.date === prior.date)) { h.days.push({ date: prior.date, cardCount: (prior.cards ?? []).length, cards: (prior.cards ?? []).map((cd) => ({ id: cd.id, combinedOdds: cd.combinedOdds, legs: cd.legs })) }); h.days.sort((a, b) => a.date.localeCompare(b.date)); fs.writeFileSync(HIST, JSON.stringify(h, null, 2) + "\n"); }
  }
  fs.writeFileSync(SPEC, JSON.stringify(specials, null, 2) + "\n");
  ledger.note = "Product paper track record. SEPARATE from the canonical Bank Builder seed-model bankroll/crown.";
  fs.writeFileSync(path.join(DATA, "mr-dub", "master-ledger.json"), JSON.stringify(ledger, null, 2) + "\n");
}
fs.writeFileSync(path.join(DATA, "mr-dub", "daily-refresh-report.json"), JSON.stringify(report, null, 2) + "\n");

console.log(`=== Daily product refresh · ${apply ? "APPLY" : "DRY-RUN"} · ${date} ===`);
console.log(`  BankBuilder ${activeBB} active · Moonshot ${activeMoon} active · WC Specials ${specials.cards.length} cards${specials.diagnostics.fallbackMode ? " (team-model fallback)" : ""} · exposure $${report.exposure}`);
console.log(`  Master ledger ${ledger.aggregate.wins}-${ledger.aggregate.losses} · roi ${ledger.aggregate.roi}% · pnl $${ledger.aggregate.profit}`);
console.log(`  Consistency: ${Object.entries(c).map(([k, v]) => `${k}=${v}`).join(" · ")}`);
if (report.warnings.length) console.log(`  ⚠ warnings: ${report.warnings.join("; ")}`);
console.log(`  → wrote daily-refresh-report.json${apply ? " + artifacts" : " (dry-run, no artifacts)"}`);

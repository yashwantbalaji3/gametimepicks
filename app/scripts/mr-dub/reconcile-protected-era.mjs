#!/usr/bin/env node
/**
 * Protected-era reconciliation — a PROPOSAL CALCULATOR, never a writer of protected money (P256 · Task 9).
 *
 *   node scripts/mr-dub/reconcile-protected-era.mjs --now <ISO> [--write]
 *
 * The protected Mr. Dub record (public/data/mr-dub/portfolio.json) was last built on 2026-07-07 and has
 * not moved since. The founder chose (2026-09-10) to let Moonshot move the core bankroll, conditional on
 * Bank Builder's post-July results being folded in too, with the reconciliation prepared as a proposal
 * first. This computes that proposal from the official, write-once lane receipts
 * (public/data/mr-dub/settled/<date>.json) under two rules, and writes an internal report. It never
 * touches portfolio.json.
 *
 *   RULE S — the protected record's own written rule (daily-portfolio-settle.ts): a lost step costs the
 *            lane its seed (Bank Builder $100, Moonshot $25); a won step rolls and never moves the bankroll.
 *   RULE B — RULE S, plus: a win the frozen-rung defect never carried (the next card restarted at the seed)
 *            is banked at payout − seed, because the lane neither lost it nor rode it.
 *
 * Rows still "pending" are excluded: from 2026-08-18 to 2026-09-05 the daily portfolio was frozen (the
 * roll-forward never ran — see nightly-settle.yml), so those receipts describe cards nobody placed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..");
const ROOT = path.resolve(APP, "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("--now <ISO> required"); process.exit(2); }

export const SEED = Object.freeze({ "bank-builder": 100, moonshot: 25 });
const round2 = (n) => Math.round(n * 100) / 100;

const portfolio = JSON.parse(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json"), "utf8"));
const dir = path.join(APP, "public/data/mr-dub/settled");
const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const since = String(portfolio.generatedAt ?? "").slice(0, 10);

const lanes = {};
for (const f of files) {
  const date = f.slice(0, 10);
  if (since && date <= since) continue; // already inside the protected record
  const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  for (const l of r.lanes ?? []) {
    (lanes[`${l.product}:${l.lane}`] ??= []).push({ date, product: l.product, lane: l.lane, step: l.step, stake: l.stake, result: l.result ?? "pending", payout: l.potentialReturn });
  }
}

const losses = [], wins = [], abandoned = [], excluded = [];
for (const rows of Object.values(lanes)) {
  const decided = rows.filter((r) => r.result === "won" || r.result === "lost");
  excluded.push(...rows.filter((r) => r.result !== "won" && r.result !== "lost"));
  decided.forEach((r, i) => {
    if (r.result === "lost") { losses.push({ ...r, bankrollDelta: -SEED[r.product] }); return; }
    wins.push(r);
    const next = decided[i + 1];
    const carried = next && next.step === r.step + 1 && Math.abs(next.stake - r.payout) < 0.02;
    if (!carried) abandoned.push({ ...r, replacedBy: next ? `${next.date} step ${next.step} $${next.stake}` : null, bankedUnderRuleB: next ? round2(r.payout - SEED[r.product]) : 0 });
  });
}

const ruleS = round2(losses.reduce((s, l) => s + l.bankrollDelta, 0));
const ruleB = round2(ruleS + abandoned.reduce((s, a) => s + a.bankedUnderRuleB, 0));
const count = (arr, p) => arr.filter((x) => x.product === p).length;
const report = {
  schemaVersion: 1,
  artifact: "mr-dub-protected-era-reconciliation-proposal",
  dataClass: "INTERNAL_PROPOSAL — computes, never writes protected money",
  generatedAt: NOW,
  protectedRecordAsOf: portfolio.generatedAt,
  current: { currentBankroll: portfolio.currentBankroll, crownBankroll: portfolio.crownBankroll, record: portfolio.record },
  source: { receipts: files.filter((f) => f.slice(0, 10) > since).length, from: files.find((f) => f.slice(0, 10) > since)?.slice(0, 10) ?? null, through: files.at(-1)?.slice(0, 10) ?? null },
  decided: {
    bankBuilder: { wins: count(wins, "bank-builder"), losses: count(losses, "bank-builder") },
    moonshot: { wins: count(wins, "moonshot"), losses: count(losses, "moonshot") },
  },
  excludedPendingRows: excluded.length,
  ruleS: { bankrollDelta: ruleS, currentBankroll: round2(portfolio.currentBankroll + ruleS), seedsLost: { bankBuilder: -SEED["bank-builder"] * count(losses, "bank-builder"), moonshot: -SEED.moonshot * count(losses, "moonshot") } },
  ruleB: { bankrollDelta: ruleB, currentBankroll: round2(portfolio.currentBankroll + ruleB), bankedAbandonedRolls: round2(ruleB - ruleS) },
  abandonedWins: abandoned,
  crownUnchanged: portfolio.crownBankroll,
};
console.log(`[reconcile] ${report.source.receipts} receipts ${report.source.from} → ${report.source.through} · BB ${report.decided.bankBuilder.wins}-${report.decided.bankBuilder.losses} · Moonshot ${report.decided.moonshot.wins}-${report.decided.moonshot.losses} · ${report.excludedPendingRows} pending rows excluded`);
console.log(`  RULE S: ${ruleS} → $${report.ruleS.currentBankroll} · RULE B: ${ruleB} → $${report.ruleB.currentBankroll} · crown $${portfolio.crownBankroll} unchanged`);
if (process.argv.includes("--write")) {
  const out = path.join(ROOT, "data/internal/mr-dub/reconciliation-proposal.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(`  wrote ${path.relative(ROOT, out)}`);
}

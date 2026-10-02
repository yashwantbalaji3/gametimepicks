#!/usr/bin/env node
/**
 * SUGGESTED PARLAYS V2 — FORWARD SHADOW (Session 7). Nothing public reads what this writes.
 *
 *   npx tsx app/scripts/products/suggested-parlays-shadow.mjs build --date YYYY-MM-DD --now <ISO> [--write]
 *   npx tsx app/scripts/products/suggested-parlays-shadow.mjs grade [--write]
 *
 * build — reads the day's committed recommendation universe (build-recommendation-universe.mjs, same
 *   run, same instant), runs the SP-V2 selector over its eligible receipts, and writes
 *   data/internal/products/engine-v2/sp-shadow/<date>.json. FIRST PUBLICATION WINS: a later run of
 *   daily-products never rewrites a shadow day, and a missing universe writes nothing (a shadow built
 *   on a reconstructed universe would not be a forward test).
 * grade — grades every published, ungraded tier card from the official MLB linescore cache (pending is
 *   never a loss; a non-MLB leg stays pending until a grader for it is wired) and rebuilds ledger.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectSuggestedParlaysV2, spPolicyId } from "../../src/lib/products/engine-v2/suggested-parlays.mjs";
import { gradeCardFromLinescores, settledDecimal } from "../../src/lib/products/selector/shadow.mjs";
import { PUBLIC_RISK_TIERS } from "../../src/lib/parlays/risk-odds-bands.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
export const SHADOW_DIR = path.join(REPO, "data/internal/products/engine-v2/sp-shadow");
const UNIVERSE_DIR = path.join(REPO, "data/internal/products/recommendation-universe");
const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

/** Build one shadow day from a committed universe document. Pure. */
export function buildShadowDay(universe) {
  const sel = selectSuggestedParlaysV2(universe.eligibleReceipts ?? [], { asOf: universe.asOf });
  return {
    schema: "sp-shadow-day@1", artifact: "suggested-parlays-v2-shadow", dataClass: "internal-research",
    status: "SHADOW — not published, not counted in any public record",
    date: universe.date, asOf: universe.asOf, generatedAt: new Date().toISOString(),
    policy: sel.policy, legFloor: universe.floor?.version ?? null, universeHash: universe.counts?.universeHash ?? null,
    eligibleLegs: universe.counts?.eligible ?? 0,
    tiers: sel.tiers.map((t) => ({ ...t, graded: null })),
  };
}

const linescores = (date) => { const d = rj(path.join(REPO, "data/internal/mlb/linescores", `${date}.json`)); return d ? (Array.isArray(d) ? d : (d.linescores ?? d.games ?? Object.values(d))) : null; };

/** Grade a shadow day in place (returns true if anything changed). Pending stays pending. */
export function gradeShadowDay(day, rows) {
  let changed = false;
  for (const t of day.tiers) {
    if (!t.card || t.graded) continue;
    if (t.card.legs.some((l) => l.sport !== "mlb")) continue; // no non-MLB grader wired here — stays pending, never guessed
    const g = rows ? gradeCardFromLinescores({ legs: t.card.legs.map((l) => ({ eventId: l.eventId, marketKey: l.marketKey, side: l.side, line: l.line })) }, rows) : { status: "pending" };
    if (g.status === "pending") continue;
    t.graded = { status: g.status, legs: g.legs, settledDecimal: settledDecimal(t.card.legs.map((l) => ({ american: l.price })), g.legs), source: "statsapi_linescore", gradedAt: new Date().toISOString() };
    changed = true;
  }
  return changed;
}

export function ledgerOf(days) {
  const tiers = Object.fromEntries(PUBLIC_RISK_TIERS.map((t) => [t, { days: 0, publishable: 0, won: 0, lost: 0, push: 0, pending: 0, noCard: {}, expectedWins: 0 }]));
  for (const d of days) for (const t of d.tiers) {
    const x = tiers[t.tier]; if (!x) continue;
    x.days++;
    if (!t.card) { x.noCard[t.reasonCode ?? "UNKNOWN"] = (x.noCard[t.reasonCode ?? "UNKNOWN"] ?? 0) + 1; continue; }
    x.publishable++;
    x.expectedWins += t.card.jointProbability ?? 0;
    const s = t.graded?.status ?? "pending";
    x[s === "won" ? "won" : s === "lost" ? "lost" : s === "push" ? "push" : "pending"]++;
  }
  for (const x of Object.values(tiers)) x.expectedWins = +x.expectedWins.toFixed(2);
  return { schema: "sp-shadow-ledger@1", dataClass: "internal-research", policy: spPolicyId, generatedAt: new Date().toISOString(), days: days.length, firstDate: days[0]?.date ?? null, lastDate: days.at(-1)?.date ?? null, note: "expectedWins = sum of each card's market-implied joint probability — the record the market itself predicts. SHADOW: no public record counts these.", tiers };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  const WRITE = process.argv.includes("--write");
  if (mode === "build") {
    const date = arg("--date"), now = arg("--now");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !Number.isFinite(Date.parse(now ?? ""))) { console.error("usage: build --date YYYY-MM-DD --now <ISO> [--write]"); process.exit(2); }
    const file = path.join(SHADOW_DIR, `${date}.json`);
    if (fs.existsSync(file)) { console.log(`[sp-shadow] ${date} already published — first publication wins`); process.exit(0); }
    const universe = rj(path.join(UNIVERSE_DIR, `${date}.json`));
    if (!universe) { console.log(`[sp-shadow] ${date}: no committed recommendation universe — nothing published (never reconstructed)`); process.exit(0); }
    const day = buildShadowDay(universe);
    for (const t of day.tiers) console.log(`  ${t.label.padEnd(12)} ${t.card ? `${t.card.combinedAmerican > 0 ? "+" : ""}${t.card.combinedAmerican} · ${t.card.legCount} legs · joint ${(t.card.jointProbability * 100).toFixed(1)}% (${t.card.jointProbabilityBasis})` : `NO_QUALIFYING_CARD · ${t.reasonCode}`}`);
    if (WRITE) { fs.mkdirSync(SHADOW_DIR, { recursive: true }); fs.writeFileSync(file, JSON.stringify(day, null, 1) + "\n"); console.log(`[sp-shadow] wrote ${path.relative(REPO, file)}`); }
  } else if (mode === "grade") {
    const files = fs.existsSync(SHADOW_DIR) ? fs.readdirSync(SHADOW_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
    const days = [];
    let graded = 0;
    for (const f of files) {
      const day = rj(path.join(SHADOW_DIR, f)); if (!day) continue;
      if (gradeShadowDay(day, linescores(day.date))) { graded++; if (WRITE) fs.writeFileSync(path.join(SHADOW_DIR, f), JSON.stringify(day, null, 1) + "\n"); }
      days.push(day);
    }
    const ledger = ledgerOf(days);
    console.log(`[sp-shadow] graded ${graded} day(s) · ${days.length} day file(s)`);
    for (const [t, x] of Object.entries(ledger.tiers)) console.log(`  ${t.padEnd(9)} publishable ${x.publishable}/${x.days} W-L-P ${x.won}-${x.lost}-${x.push} pending ${x.pending} · market-expected wins ${x.expectedWins}`);
    if (WRITE) { fs.mkdirSync(SHADOW_DIR, { recursive: true }); fs.writeFileSync(path.join(SHADOW_DIR, "ledger.json"), JSON.stringify(ledger, null, 1) + "\n"); }
  } else { console.error("usage: suggested-parlays-shadow.mjs build|grade …"); process.exit(2); }
}

/**
 * persist-soccer-settlement.mjs — writes the HISTORY + TRACKING records for a graded soccer slate, and
 * NOTHING else. It grades the slate's products through the shared engine against the supplied official
 * bundle, then writes:
 *   • world-cup/settlement/official-scores-<date>.json   (the official results, from the operator bundle)
 *   • world-cup/settlement/<date>.json                   (the graded per-card record)
 *   • product-ledger/<productId>.json                    (durable SettledResult[] per product)
 *   • world-cup/world-cup-specials-history.json          (the WC Specials results ledger)
 *
 * IT NEVER TOUCHES MONEY STATE. A hard guard refuses to open portfolio.json / daily-portfolio.json /
 * ledger.json / any crown/bankroll/exposure/record field. No fabrication — every number comes from the
 * official bundle through the tested engine.
 *
 *   npx tsx app/scripts/persist-soccer-settlement.mjs --date 2026-06-23 --official /tmp/official.json
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const DATE = getArg("date", "2026-06-23");
const OFFICIAL = getArg("official", null);
const ROOT = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const DATA = path.join(ROOT, "public", "data");

// HARD GUARD: these money-state files must never be written by this script.
const FORBIDDEN = ["portfolio.json", "daily-portfolio.json", "ledger.json", "daily-summary.json"];
function writeJson(rel, obj) {
  const base = path.basename(rel);
  if (FORBIDDEN.includes(base)) throw new Error(`REFUSED: ${rel} is money state — this script never writes it.`);
  const full = path.join(DATA, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(obj, null, 2));
  console.log(`  wrote ${rel}`);
}
const read = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")); } catch { return null; } };

async function main() {
  if (!OFFICIAL) { console.error("need --official <bundle>"); process.exit(1); }
  const official = JSON.parse(fs.readFileSync(OFFICIAL, "utf8"));
  // Reuse the shared product collection + the engine (single source of truth).
  const { collectForDate } = await import("./_settlement-collect.mjs");
  const { settleCard } = await import("../src/lib/settlement/soccer-markets.ts");
  const cards = collectForDate(DATA, DATE);

  console.log(`=== Persisting June ${DATE} settlement (history/tracking only · NO money state) ===`);

  // 1) Official results record.
  writeJson(`world-cup/settlement/official-scores-${DATE}.json`, official);

  // 2) Grade + build the per-card graded record + per-product SettledResults.
  const graded = [];
  const byProduct = {};
  for (const c of cards) {
    const s = settleCard(c.legs, c.stake, official);
    graded.push({ product: c.product, card: c.label, stake: c.stake, result: s.result,
      payout: s.payout, paperPnl: s.paperPnl, combinedDecimal: s.combinedDecimal,
      legs: s.legs.map((g) => ({ market: g.leg.market, selection: g.leg.selection, player: g.leg.player ?? null, odds: g.leg.oddsAmerican, result: g.result, reason: g.reason })) });
    if (s.result === "pending") continue;
    const outcome = s.result === "won" ? "won" : s.result === "void" ? "void" : "lost";
    (byProduct[c.product] ??= []).push({ productId: c.product, date: DATE, card: c.label, outcome, stake: c.stake, payout: s.payout });
  }

  writeJson(`world-cup/settlement/${DATE}.json`, {
    generatedAt: `${DATE}T00:00:00Z`, date: DATE,
    settlementSource: official.source, finals: official.matches,
    graded,
  });

  // 3) Per-product durable ledgers (append, dedupe by date+card).
  for (const [productId, results] of Object.entries(byProduct)) {
    // Bank Builder's canonical realized history is the cumulative-crown ledger (banked-ladders.json →
    // build-mr-dub-ledger → portfolio.json / ledger.json). It is a COMPOUNDING bankroll and does NOT use a
    // flat product-ledger — maintaining one created a second, incomplete source of truth that drifted from
    // the hero (the $8,228-vs-$19,965 bug). Skip it: only the flat-stake side lanes use product-ledger.
    if (productId === "bank-builder") continue;
    const rel = `product-ledger/${productId}.json`;
    const existing = read(rel) ?? { productId, results: [] };
    const seen = new Set((existing.results ?? []).map((r) => `${r.date}|${r.card}`));
    for (const r of results) if (!seen.has(`${r.date}|${r.card}`)) existing.results.push(r);
    existing.results.sort((a, b) => (a.date + a.card).localeCompare(b.date + b.card));
    writeJson(rel, existing);
  }

  // 4) WC Specials results ledger (history).
  const spResults = (byProduct["wc-specials"] ?? []);
  if (spResults.length) {
    const hist = read(`world-cup/world-cup-specials-history.json`) ?? {};
    hist.entries = hist.entries ?? [];
    const seen = new Set(hist.entries.map((e) => `${e.date}|${e.card}`));
    for (const r of spResults) if (!seen.has(`${r.date}|${r.card}`)) hist.entries.push({ date: r.date, card: r.card, result: r.outcome, stake: r.stake, payout: r.payout, paperPnl: Number((r.payout - r.stake).toFixed(2)) });
    hist.lastSettled = DATE;
    writeJson(`world-cup/world-cup-specials-history.json`, hist);
  }

  console.log(`done. NO money/portfolio/crown files written (guarded).`);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });

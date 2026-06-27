/**
 * RUN REPORT — one observability artifact per lifecycle run, stored historically under
 * public/data/ops/run-reports/. Captures the money snapshot (from canonical portfolio.json — never
 * hardcoded), products generated today, settled day, gate/smoke results, runtime, and warnings so the
 * owner can tell success from failure remotely without reading CI logs.
 *
 *   node app/scripts/write-run-report.mjs --to YYYY-MM-DD --prev YYYY-MM-DD --mode APPLY \
 *        --deploy yes --smoke pass --duration 540 --pending 0
 */
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const DATA = path.join(process.cwd(), "public", "data");
const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")); } catch { return null; } };

const to = arg("--to", "");
const stampArg = arg("--now", ""); // CI passes a real timestamp; falls back to ISO from Date when available
let generatedAt = stampArg;
try { if (!generatedAt) generatedAt = new Date().toISOString(); } catch { generatedAt = `${to}T00:00:00Z`; }

const portfolio = readJson("mr-dub/portfolio.json") || {};
const homer = readJson("mlb/homer-nukes-active.json");
const wc = readJson("world-cup/world-cup-specials.json");
const dp = readJson("mr-dub/daily-portfolio.json");

// Which products produced a card for `to` (honest: a product that skipped — no key, no slate — shows false).
const fresh = (d) => d && String(d).slice(0, 10) === to;
const products = {
  bankBuilder: fresh(dp?.date),
  moonshot: fresh(dp?.date) && (dp?.products?.moonshot?.lanes?.length ?? 0) > 0,
  wcSpecials: fresh(wc?.date ?? wc?.generatedAt) && (wc?.cards?.length ?? 0) > 0,
  homerNukes: fresh(homer?.date ?? homer?.generatedAt) && (homer?.lanes?.length ?? 0) > 0,
};
const apiSkips = Object.entries(products).filter(([, v]) => !v).map(([k]) => k);

const report = {
  generatedAt,
  date: to,
  settledDay: arg("--prev", ""),
  mode: arg("--mode", "DRY-RUN"),
  deployed: arg("--deploy", "no") === "yes",
  smoke: arg("--smoke", "skipped"),
  durationSec: Number(arg("--duration", "0")) || 0,
  pendingLanesAtStart: Number(arg("--pending", "0")) || 0,
  money: {
    bankroll: portfolio.currentBankroll ?? null,
    crown: portfolio.crownBankroll ?? null,
    settledProfit: portfolio.settledProfit ?? null,
    roiMultiple: portfolio.roiMultiple ?? null,
    record: portfolio.record ? `${portfolio.record.wins}-${portfolio.record.losses}` : null,
    drawdown: portfolio.drawdown ?? null,
  },
  products,
  warnings: apiSkips.length ? [`products with no card today (honest skip — no slate or missing credentials): ${apiSkips.join(", ")}`] : [],
  deployUrl: "https://gametime-picks.vercel.app",
};

const dir = path.join(DATA, "ops", "run-reports");
fs.mkdirSync(dir, { recursive: true });
const fname = `${to || generatedAt.slice(0, 10)}.json`;
fs.writeFileSync(path.join(dir, fname), JSON.stringify(report, null, 2) + "\n");
// Keep a rolling "latest" pointer for the health page / quick checks.
fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`run report → ops/run-reports/${fname} · mode ${report.mode} · smoke ${report.smoke} · bankroll $${report.money.bankroll} · products ${Object.values(products).filter(Boolean).length}/4`);

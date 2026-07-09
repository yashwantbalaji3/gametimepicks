/**
 * build-founder-review-previews.mjs — INTERNAL founder-review Bank Builder / Moonshot previews.
 *
 * Reads the read-only multi-sport candidate pool and produces two internal preview artifacts that a
 * founder can review. They are NEVER active cards: status is `founder_review` (a qualifying set exists,
 * needs approval) or `no_play`; `active:false`, `exposure:0`, `officialMoneyRecordAffected:false`,
 * `requiresFounderApproval:true`. No money artifact is read/written. Multi-sport: only settlement-
 * supported eligible legs (MLB statsapi + soccer api-football) may appear.
 *
 * Output (repo-root data/internal — NOT web-served):
 *   data/internal/product-previews/bank-builder/<date>.json
 *   data/internal/product-previews/moonshot/<date>.json
 *
 * Usage:  npx tsx scripts/build-founder-review-previews.mjs [--date 2026-07-09] [--write]
 */
import fs from "node:fs";
import path from "node:path";

const REPO = path.join(process.cwd(), process.cwd().endsWith("app") ? ".." : "");
const POOL_DIR = path.join(REPO, "data", "internal", "multi-sport", "candidate-pool");
const OUT_BB = path.join(REPO, "data", "internal", "product-previews", "bank-builder");
const OUT_MS = path.join(REPO, "data", "internal", "product-previews", "moonshot");
const WRITE = process.argv.includes("--write");
const DATE = (() => { const i = process.argv.indexOf("--date"); return i >= 0 ? process.argv[i + 1] : null; })();

const BB_MIN_PROB = 0.60;
const MOONSHOT_FLOOR = 700;
const decToAmerican = (dec) => (dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1)));

function pickDate() {
  if (DATE) return DATE;
  if (!fs.existsSync(POOL_DIR)) return null;
  const files = fs.readdirSync(POOL_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return files.length ? files[files.length - 1].replace(".json", "") : null;
}

/** Every guard-satisfying preview carries the same money-safety envelope. */
const envelope = (date, status, extra) => ({
  kind: extra.kind, date, public: false, internal: true,
  status, active: false, exposure: 0, officialMoneyRecordAffected: false, requiresFounderApproval: true,
  ...extra,
  note: "INTERNAL founder-review preview. NOT an active card. No exposure, no money-record change. Founder approval + settlement + calibration gate any real activation.",
});

function bankBuilder(date, eligible) {
  // Highest-probability eligible leg per game (distinct games ⇒ low correlation), conservative floor.
  const byGame = new Map();
  for (const l of eligible) {
    if (typeof l.marketProbability !== "number") continue;
    const cur = byGame.get(l.gameId);
    if (!cur || l.marketProbability > cur.marketProbability) byGame.set(l.gameId, l);
  }
  const conservative = [...byGame.values()].filter((l) => l.marketProbability >= BB_MIN_PROB).sort((a, b) => b.marketProbability - a.marketProbability);
  if (conservative.length < 2) {
    return envelope(date, "no_play", { kind: "bank-builder-founder-review", reason: `fewer than 2 distinct-game legs at ≥${BB_MIN_PROB} de-vigged probability`, legs: [] });
  }
  const legs = conservative.slice(0, 2).map((l) => ({ sport: l.sport, event: l.eventName, market: l.market, publicLabel: l.publicLabel, marketProbability: l.marketProbability, settlementSource: l.settlementSource }));
  return envelope(date, "founder_review", { kind: "bank-builder-founder-review", reason: "two conservative distinct-game legs qualify for founder review — NOT placed", sports: [...new Set(legs.map((l) => l.sport))], legs });
}

function moonshot(date, eligible) {
  const games = [...new Set(eligible.map((l) => l.gameId))].slice(0, 4);
  const byGame = new Map(games.map((g) => [g, eligible.filter((l) => l.gameId === g && typeof l.marketProbability === "number")]));
  const combos = (arr) => arr.reduce((acc, g) => acc.flatMap((c) => (byGame.get(g) || []).map((l) => [...c, l])), [[]]);
  let best = null, maxReachable = null;
  for (const combo of combos(games)) {
    if (combo.length < 2) continue;
    const prob = combo.reduce((p, l) => p * l.marketProbability, 1);
    if (prob <= 0) continue;
    const american = decToAmerican(1 / prob);
    if (maxReachable == null || american > maxReachable) maxReachable = american;
    if (american >= MOONSHOT_FLOOR && (best == null || american < best.american)) best = { american, combo };
  }
  if (!best) return envelope(date, "no_play", { kind: "moonshot-founder-review", reason: `no distinct-game combo reaches +${MOONSHOT_FLOOR} (best reachable ${maxReachable == null ? "n/a" : (maxReachable >= 0 ? "+" : "") + maxReachable})`, legs: [] });
  const legs = best.combo.map((l) => ({ sport: l.sport, event: l.eventName, market: l.market, publicLabel: l.publicLabel, marketProbability: l.marketProbability, settlementSource: l.settlementSource }));
  return envelope(date, "founder_review", { kind: "moonshot-founder-review", reason: `a +${best.american} distinct-game combo qualifies for founder review — NOT placed, no EV claimed`, combinedAmerican: best.american, sports: [...new Set(legs.map((l) => l.sport))], legs });
}

function main() {
  const date = pickDate();
  if (!date) { console.error("[founder-review] no candidate pool"); process.exit(1); }
  const poolPath = path.join(POOL_DIR, `${date}.json`);
  if (!fs.existsSync(poolPath)) { console.error(`[founder-review] no pool for ${date}`); process.exit(1); }
  const eligible = (JSON.parse(fs.readFileSync(poolPath, "utf8")).legs || []).filter((l) => l.productEligible);

  const bb = bankBuilder(date, eligible);
  const ms = moonshot(date, eligible);
  if (WRITE) {
    fs.mkdirSync(OUT_BB, { recursive: true }); fs.writeFileSync(path.join(OUT_BB, `${date}.json`), JSON.stringify(bb, null, 2) + "\n");
    fs.mkdirSync(OUT_MS, { recursive: true }); fs.writeFileSync(path.join(OUT_MS, `${date}.json`), JSON.stringify(ms, null, 2) + "\n");
  }
  console.log(`[founder-review] ${WRITE ? "WROTE" : "DRY-RUN"} ${date} · eligible ${eligible.length} · BankBuilder ${bb.status} (${(bb.sports || []).join("+") || "—"}) · Moonshot ${ms.status} (${(ms.sports || []).join("+") || "—"})`);
  if (!WRITE) console.log("  (dry run — pass --write to persist)");
}

main();

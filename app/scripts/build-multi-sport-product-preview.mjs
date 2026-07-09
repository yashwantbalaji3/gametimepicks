/**
 * build-multi-sport-product-preview.mjs — a READ-ONLY preview of what a future multi-sport Bank Builder
 * / Moonshot WOULD surface from the eligible candidate pool. It ALWAYS reports `no-play` or `watchlist`
 * — never an active card, never exposure, never a money write. `watchlist` means "a qualifying set
 * exists for review", not "placed".
 *
 * Input:  data/internal/multi-sport/candidate-pool/<date>.json  (productEligible legs only)
 * Output: data/internal/multi-sport/product-preview/<date>.json
 *
 * Usage:  npx tsx scripts/build-multi-sport-product-preview.mjs [--date 2026-07-09] [--write]
 */
import fs from "node:fs";
import path from "node:path";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const POOL_DIR = path.join(REPO, "data", "internal", "multi-sport", "candidate-pool");
const OUT_DIR = path.join(REPO, "data", "internal", "multi-sport", "product-preview");
const WRITE = process.argv.includes("--write");
const DATE = (() => { const i = process.argv.indexOf("--date"); return i >= 0 ? process.argv[i + 1] : null; })();

const BB_MIN_PROB = 0.60;      // conservative survival leg
const MOONSHOT_FLOOR = 700;    // +700 combined (American)

function pickDate() {
  if (DATE) return DATE;
  if (!fs.existsSync(POOL_DIR)) return null;
  const files = fs.readdirSync(POOL_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return files.length ? files[files.length - 1].replace(".json", "") : null;
}
const decToAmerican = (dec) => (dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1)));

/** Highest-probability eligible leg per game (one per game keeps lanes low-correlation). */
function bestPerGame(legs) {
  const byGame = new Map();
  for (const l of legs) {
    if (typeof l.marketProbability !== "number") continue;
    const cur = byGame.get(l.gameId);
    if (!cur || l.marketProbability > cur.marketProbability) byGame.set(l.gameId, l);
  }
  return [...byGame.values()];
}

function bankBuilderPreview(eligible) {
  const conservative = bestPerGame(eligible).filter((l) => l.marketProbability >= BB_MIN_PROB).sort((a, b) => b.marketProbability - a.marketProbability);
  if (conservative.length < 2) {
    return { status: "no-play", reason: `fewer than 2 distinct-game legs at ≥${BB_MIN_PROB} de-vigged probability`, qualifying: conservative.length };
  }
  const pick = conservative.slice(0, 2);
  return {
    status: "watchlist",
    reason: "two conservative distinct-game legs qualify for review — NOT placed",
    legs: pick.map((l) => ({ sport: l.sport, event: l.eventName, publicLabel: l.publicLabel, marketProbability: l.marketProbability })),
  };
}

function moonshotPreview(eligible) {
  // Distinct-game combos of size 2..min(4, #games). With de-vigged probs, combined fair odds = product.
  const games = [...new Set(eligible.map((l) => l.gameId))];
  const byGame = new Map(games.map((g) => [g, eligible.filter((l) => l.gameId === g && typeof l.marketProbability === "number")]));
  let best = null; // the LOWEST combined odds that still clears the floor (controlled longshot)
  let maxReachable = null;
  // enumerate one-leg-per-game combos for up to 4 distinct games
  const chosenGames = games.slice(0, 4);
  const combos = (arr) => arr.reduce((acc, g) => acc.flatMap((c) => (byGame.get(g) || []).map((l) => [...c, l])), [[]]);
  for (const combo of combos(chosenGames)) {
    if (combo.length < 2) continue;
    const prob = combo.reduce((p, l) => p * l.marketProbability, 1);
    if (prob <= 0) continue;
    const american = decToAmerican(1 / prob);
    if (maxReachable == null || american > maxReachable) maxReachable = american;
    if (american >= MOONSHOT_FLOOR && (best == null || american < best.american)) best = { american, combo };
  }
  if (!best) {
    return { status: "no-play", reason: `no distinct-game combo reaches +${MOONSHOT_FLOOR} (best reachable ${maxReachable == null ? "n/a" : (maxReachable >= 0 ? "+" : "") + maxReachable})` };
  }
  return {
    status: "watchlist",
    reason: `a +${best.american} distinct-game combo exists for review — NOT placed, no EV claimed`,
    combinedAmerican: best.american,
    legs: best.combo.map((l) => ({ sport: l.sport, event: l.eventName, publicLabel: l.publicLabel, marketProbability: l.marketProbability })),
  };
}

function main() {
  const date = pickDate();
  if (!date) { console.error("[preview] no candidate pool found — run build-multi-sport-candidate-pool.mjs --write first"); process.exit(1); }
  const poolPath = path.join(POOL_DIR, `${date}.json`);
  if (!fs.existsSync(poolPath)) { console.error(`[preview] no candidate pool for ${date}`); process.exit(1); }
  const pool = JSON.parse(fs.readFileSync(poolPath, "utf8"));
  const eligible = (pool.legs || []).filter((l) => l.productEligible);

  const out = {
    kind: "multi-sport-product-preview", public: false, internal: true, date,
    eligibleLegCount: eligible.length,
    bankBuilderPreview: bankBuilderPreview(eligible),
    moonshotPreview: moonshotPreview(eligible),
    note: "READ-ONLY preview. status is ALWAYS no-play or watchlist — never an active card. No exposure created, no product-card activated, money untouched. Founder approval + settlement + backtest gate any real activation.",
  };

  if (WRITE) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, `${date}.json`), JSON.stringify(out, null, 2) + "\n"); }
  console.log(`[preview] ${WRITE ? "WROTE" : "DRY-RUN"} ${date} · eligible ${eligible.length} · BB ${out.bankBuilderPreview.status} · Moonshot ${out.moonshotPreview.status}`);
  console.log(`  BB: ${out.bankBuilderPreview.reason}`);
  console.log(`  Moonshot: ${out.moonshotPreview.reason}`);
  if (!WRITE) console.log("  (dry run — pass --write to persist)");
}

main();

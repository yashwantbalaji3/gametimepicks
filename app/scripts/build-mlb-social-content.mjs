/**
 * build-mlb-social-content.mjs — daily EXPORTABLE analytics-content artifact for social posting (Phase 5). Derives
 * honest talking points from the already-public 10k game simulations: the largest simulation-vs-market DIFFERENCES,
 * the highest-volatility games, and interesting matchups. This is ANALYTICS CONTENT, NOT betting advice — it never
 * uses "edge"/"value"/"lock"/"pick"/"beat", never claims the simulation is superior (the modeled markets are not
 * market-proven), and never implies profitability. Read-only over public sim data; writes an INTERNAL artifact
 * (data/internal/mlb/social/<date>.json — exportable, not served publicly). No modeling, no money.
 *
 *   node app/scripts/build-mlb-social-content.mjs --date 2026-07-22
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const round = (x, d = 1) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);

function main() {
  const args = process.argv.slice(2);
  const di = args.indexOf("--date");
  const date = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[di + 1] || "") ? args[di + 1] : new Date().toISOString().slice(0, 10);
  const sim = readJson(path.join(APP, "public/data/mlb/game-simulations", `${date}.json`));
  if (!sim || !Array.isArray(sim.games)) { console.log(`[social] no simulations for ${date} — nothing to build (honest no-op).`); return; }

  const perGame = [];
  const allDiffs = [];
  for (const g of sim.games) {
    const picks = (g.generatedPicks || g.picks || []).filter((p) => Number.isFinite(p.modelProbability) && Number.isFinite(p.marketProbability));
    const matchup = `${g.teams?.away ?? "?"} @ ${g.teams?.home ?? "?"}`;
    // per-pick simulation-vs-market DIFFERENCE (neutral comparison; NOT an edge or a recommendation)
    const diffs = picks.map((p) => ({
      game: matchup, gameId: g.gameId, player: p.player, market: p.market, line: p.line, side: p.side,
      simulationProbability: round(100 * p.modelProbability), marketProbability: round(100 * p.marketProbability),
      differencePct: round(Math.abs(100 * (p.modelProbability - p.marketProbability))),
    }));
    allDiffs.push(...diffs);
    const spread = diffs.length ? round(Math.max(...diffs.map((d) => d.differencePct)) - Math.min(...diffs.map((d) => d.differencePct))) : 0;
    perGame.push({ gameId: g.gameId, matchup, marketsSimulated: picks.length, largestDifferencePct: diffs.length ? Math.max(...diffs.map((d) => d.differencePct)) : 0, volatilitySpreadPct: spread, headline: g.simulationSummary?.headline ?? null });
  }

  const byDiff = allDiffs.slice().sort((a, b) => b.differencePct - a.differencePct);
  const report = {
    public: false, kind: "mlb-social-content", contentType: "analytics", notBettingAdvice: true,
    date, generatedAt: sim.generatedAt ?? null, runCount: sim.runCount ?? 10000, games: perGame.length,
    // top simulation-vs-market DIFFERENCES (a comparison to talk about — not a pick, not a recommendation)
    largestSimulationDifferences: byDiff.slice(0, 10),
    highestVolatilityGames: perGame.slice().sort((a, b) => b.volatilitySpreadPct - a.volatilitySpreadPct).slice(0, 5).map((g) => ({ matchup: g.matchup, marketsSimulated: g.marketsSimulated, volatilitySpreadPct: g.volatilitySpreadPct })),
    interestingMatchups: perGame.slice().sort((a, b) => b.marketsSimulated - a.marketsSimulated).slice(0, 5).map((g) => ({ matchup: g.matchup, marketsSimulated: g.marketsSimulated, headline: g.headline })),
    disclaimer: "Simulation-powered analytics from 10,000-run game simulations. A comparison of the simulation's projection to the market line — NOT betting advice, NOT a prediction of superiority, NOT a recommendation. Paper-only, educational. Public beta.",
    forbiddenTerms: ["edge", "value", "lock", "pick", "best bet", "beat the market", "profitable", "guaranteed"],
  };
  const outDir = path.join(REPO, "data/internal/mlb/social");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${date}.json`), JSON.stringify(report, null, 2));

  console.log(`\n=== MLB SOCIAL CONTENT ${date} (analytics — NOT betting advice) ===`);
  console.log(`  games: ${report.games}  ·  largest sim-vs-market differences: ${report.largestSimulationDifferences.length}`);
  for (const d of report.largestSimulationDifferences.slice(0, 3)) console.log(`    ${d.game}: ${d.player} ${d.market} ${d.side} ${d.line} — sim ${d.simulationProbability}% vs market ${d.marketProbability}% (diff ${d.differencePct}pts)`);
  console.log(`  → data/internal/mlb/social/${date}.json  (exportable; internal, not served publicly)`);
  process.exit(0);
}
const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();

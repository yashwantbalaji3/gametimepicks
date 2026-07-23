/**
 * build-mlb-social-content.mjs — daily EXPORTABLE analytics-content artifact for social posting. Derives honest
 * talking points from the already-public 10k game simulations: the largest simulation-vs-market DIFFERENCES, the
 * highest-volatility games, and interesting matchups. This is ANALYTICS CONTENT, NOT betting advice — it never uses
 * "edge"/"value"/"lock"/"pick"/"best bet"/"beat"/"profitable"/"guaranteed", never claims the simulation is superior
 * (the modeled markets are not market-proven), and never implies profitability.
 *
 * Integrity rules enforced here (see build-mlb-social-content.test.mjs):
 *   • Every exported item carries the full provenance envelope (date, game, player, market, side, line, sim prob,
 *     market prob, difference, runCount, generatedAt, marketCapturedAt, lineupState, dataStatus, publicBeta,
 *     notBettingAdvice, public).
 *   • Missing market probability (null) is distinct from a real 0% — differencePct is null when the market is absent.
 *   • A market-unavailable item is NEVER ranked among the supported comparisons (separate list).
 *   • A game is only exported if its market artifact was FROZEN PREGAME (marketCapturedAt < commenceTime) and the
 *     game has not started (status is a pregame status) — mirrors the research leakage rule, deterministic.
 *
 * Read-only over public sim + team-market data; writes an INTERNAL artifact (data/internal/mlb/social/<date>.json —
 * exportable, not served publicly). No modeling, no money.
 *
 *   node app/scripts/build-mlb-social-content.mjs --date 2026-07-22
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const round = (x, d = 1) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);

const DISCLAIMER =
  "Simulation-powered analytics from 10,000-run game simulations. A neutral comparison of the simulation's " +
  "projection to the market line — NOT betting advice, NOT a prediction of superiority, NOT a recommendation. " +
  "Paper-only, educational. Public beta.";
export const FORBIDDEN_TERMS = ["edge", "value", "lock", "pick", "best bet", "beat the market", "profitable", "guaranteed"];

// Statuses that mean the game has NOT started yet (a pregame simulation is safe to surface).
const PREGAME_STATUSES = new Set(["ready", "scheduled", "pregame", "upcoming", "preview"]);

/**
 * Pure builder — takes the loaded sim artifact + team-markets map + date and returns the report object. No I/O, so
 * it is deterministic and unit-testable.
 */
export function buildSocialContent(sim, teamMarkets, date) {
  const runCount = sim?.runCount ?? 10000;
  const generatedAt = sim?.generatedAt ?? null;
  // gameId -> commenceTime (first pitch), from the public team-markets artifact
  const commenceById = {};
  const tmGames = teamMarkets?.games && typeof teamMarkets.games === "object" ? teamMarkets.games : {};
  for (const [gid, g] of Object.entries(tmGames)) commenceById[gid] = g?.commenceTime ?? null;

  const perGame = [];
  const supported = []; // items with BOTH sim + market probability
  const simulationOnly = []; // items with sim probability but NO market probability (never ranked above supported)
  const excludedGames = [];

  for (const g of sim?.games || []) {
    const matchup = `${g.teams?.away ?? "?"} @ ${g.teams?.home ?? "?"}`;
    const marketCapturedAt = g.marketSnapshot?.capturedAt ?? g.freshness?.sourceCapturedAt ?? null;
    const commenceTime = commenceById[g.gameId] ?? null;
    const status = g.status ?? null;
    // PREGAME-FREEZE GUARD (deterministic, mirrors research eligibility): only export a game whose market artifact
    // was frozen strictly before first pitch AND whose status is pregame. If we cannot prove the freeze, we skip.
    const startedByStatus = status != null && !PREGAME_STATUSES.has(status);
    const frozenPregame =
      marketCapturedAt != null && commenceTime != null ? marketCapturedAt < commenceTime : marketCapturedAt != null && !startedByStatus;
    if (startedByStatus || !frozenPregame) {
      excludedGames.push({ matchup, status, marketCapturedAt, commenceTime, reason: startedByStatus ? "game not pregame (status)" : "market artifact not proven frozen pregame" });
      continue;
    }
    const lineupState = g.marketSnapshot?.lineupConfirmed != null ? (g.marketSnapshot.lineupConfirmed ? "confirmed" : "projected") : null;

    let marketsSupported = 0;
    for (const p of g.generatedPicks || g.picks || []) {
      if (!Number.isFinite(p.modelProbability)) continue; // a simulation item must carry a simulation probability
      const hasMarket = Number.isFinite(p.marketProbability);
      const simulationProbability = round(100 * p.modelProbability);
      const marketProbability = hasMarket ? round(100 * p.marketProbability) : null; // null = MISSING (≠ a real 0%)
      const differencePct = hasMarket ? round(Math.abs(100 * (p.modelProbability - p.marketProbability))) : null;
      const item = {
        date, game: matchup, gameId: g.gameId, player: p.player ?? null, market: p.market, side: p.side, line: p.line ?? null,
        simulationProbability, marketProbability, marketProbabilityAvailable: hasMarket, differencePct,
        runCount, generatedAt, marketCapturedAt, lineupState,
        dataStatus: hasMarket ? "fully-supported" : "market-unavailable",
        publicBeta: DISCLAIMER, notBettingAdvice: true, public: false,
      };
      if (hasMarket) { supported.push(item); marketsSupported++; } else { simulationOnly.push(item); }
    }
    const diffs = supported.filter((d) => d.gameId === g.gameId).map((d) => d.differencePct);
    perGame.push({
      gameId: g.gameId, matchup, marketsSimulated: (g.generatedPicks || g.picks || []).length, marketsSupported,
      largestDifferencePct: diffs.length ? Math.max(...diffs) : null,
      volatilitySpreadPct: diffs.length ? round(Math.max(...diffs) - Math.min(...diffs)) : null,
      headline: g.simulationSummary?.headline ?? null,
    });
  }

  const byDiff = supported.slice().sort((a, b) => (b.differencePct ?? -1) - (a.differencePct ?? -1));
  return {
    public: false, kind: "mlb-social-content", contentType: "analytics", notBettingAdvice: true,
    date, generatedAt, runCount, games: perGame.length, excludedGames,
    // ONLY fully-supported comparisons are ranked; market-unavailable items live in a separate, un-ranked list.
    largestSimulationDifferences: byDiff.slice(0, 10),
    simulationOnlyProjections: simulationOnly.slice(0, 10),
    highestVolatilityGames: perGame.filter((g) => g.volatilitySpreadPct != null).sort((a, b) => b.volatilitySpreadPct - a.volatilitySpreadPct).slice(0, 5)
      .map((g) => ({ matchup: g.matchup, marketsSimulated: g.marketsSimulated, volatilitySpreadPct: g.volatilitySpreadPct })),
    interestingMatchups: perGame.slice().sort((a, b) => b.marketsSimulated - a.marketsSimulated).slice(0, 5)
      .map((g) => ({ matchup: g.matchup, marketsSimulated: g.marketsSimulated, headline: g.headline })),
    disclaimer: DISCLAIMER,
    forbiddenTerms: FORBIDDEN_TERMS,
  };
}

function main() {
  const args = process.argv.slice(2);
  const di = args.indexOf("--date");
  const date = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[di + 1] || "") ? args[di + 1] : new Date().toISOString().slice(0, 10);
  const sim = readJson(path.join(APP, "public/data/mlb/game-simulations", `${date}.json`));
  if (!sim || !Array.isArray(sim.games)) { console.log(`[social] no simulations for ${date} — nothing to build (honest no-op).`); return; }
  const teamMarkets = readJson(path.join(APP, "public/data/mlb/team-markets", `${date}.json`));
  const report = buildSocialContent(sim, teamMarkets, date);

  const outDir = path.join(REPO, "data/internal/mlb/social");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${date}.json`), JSON.stringify(report, null, 2));

  console.log(`\n=== MLB SOCIAL CONTENT ${date} (analytics — NOT betting advice) ===`);
  console.log(`  games: ${report.games}  ·  supported comparisons: ${report.largestSimulationDifferences.length}  ·  market-unavailable: ${report.simulationOnlyProjections.length}  ·  excluded (not pregame-frozen): ${report.excludedGames.length}`);
  for (const d of report.largestSimulationDifferences.slice(0, 3)) console.log(`    ${d.game}: ${d.player} ${d.market} ${d.side} ${d.line} — sim ${d.simulationProbability}% vs market ${d.marketProbability}% (diff ${d.differencePct}pts)`);
  console.log(`  → data/internal/mlb/social/${date}.json  (exportable; internal, not served publicly)`);
}
const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();

/**
 * build-mlb-social-content.mjs — daily EXPORTABLE analytics-content artifact for social posting. Derives honest
 * talking points from the already-public 10k game simulations: the largest simulation-vs-market DIFFERENCES, the
 * highest-volatility games (from the p10–p90 simulated-outcome range), and interesting matchups. This is ANALYTICS
 * CONTENT, NOT betting advice — it never uses "edge"/"value"/"lock"/"pick"/"best bet"/"beat the market"/"market
 * mistake"/"profitable"/"guaranteed", never claims the simulation is superior (the modeled markets are not
 * market-proven), and never implies profitability.
 *
 * Integrity rules enforced here (see build-mlb-social-content.test.mjs):
 *   • Every exported item carries the full provenance envelope (date, game, gameUrl, player, market, side, line, sim
 *     prob, market prob, difference, runCount, generatedAt, marketCapturedAt, lineupState, dataStatus, publicBeta,
 *     notBettingAdvice, public).
 *   • gameUrl is the CANONICAL public game URL, resolved with the same slug logic the site uses in
 *     app/src/lib/game-detail.ts: /games/mlb/<away>-vs-<home>-<date>, with the stable gamePk suffix for a
 *     doubleheader (a team-pair+date base shared by >1 game on the slate).
 *   • Missing market probability (null) is distinct from a real 0% — differencePct is null when the market is absent.
 *   • A market-unavailable item is NEVER ranked among the supported comparisons (separate list).
 *   • A game is only exported if its market artifact was FROZEN PREGAME (marketCapturedAt < commenceTime) and the
 *     game has not started (status is a pregame status) — mirrors the research leakage rule, deterministic.
 *   • The uncertainty spotlight is the p10–p90 spread of the simulated-outcome distribution — a neutral spread
 *     statement, never a recommendation.
 *
 * Deterministic: pure over its inputs (sim + team-markets), no wall-clock / randomness. Same public artifacts in →
 * byte-identical report out. Read-only over public sim + team-market data; writes an INTERNAL artifact
 * (data/internal/mlb/social/<date>.json — exportable, not served publicly). No modeling, no money.
 *
 *   node app/scripts/build-mlb-social-content.mjs --date 2026-07-23
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const round = (x, d = 1) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);

// The app's own metadataBase (app/src/app/layout.tsx) — used only to form an absolute share URL alongside the
// canonical relative path. Not a fabricated host.
export const SITE_BASE = "https://gametimepicks.yashwantbalaji.com";

const DISCLAIMER =
  "Simulation-powered analytics from 10,000-run game simulations. A neutral comparison of the simulation's " +
  "projection to the market line — NOT betting advice, NOT a prediction of superiority, NOT a recommendation. " +
  "Paper-only, educational. Public beta.";
export const FORBIDDEN_TERMS = ["edge", "value", "lock", "pick", "best bet", "beat the market", "market mistake", "profitable", "guaranteed"];

// Statuses that mean the game has NOT started yet (a pregame simulation is safe to surface).
const PREGAME_STATUSES = new Set(["ready", "scheduled", "pregame", "upcoming", "preview"]);

/**
 * Canonical public game URL, mirroring app/src/lib/game-detail.ts boardDetails(): the base slug is
 * <away>-vs-<home>-<date> (team abbreviations, already carried on each sim game as `slug`). A base shared by >1
 * game on the slate (a doubleheader) is disambiguated with the stable gamePk suffix so every game maps to exactly
 * ONE canonical URL. Returns a { gameId -> slug } map. Deterministic over the slate.
 */
export function canonicalSlugMap(games) {
  const baseCounts = {};
  for (const g of games || []) { const s = g?.slug; if (s) baseCounts[s] = (baseCounts[s] ?? 0) + 1; }
  const map = {};
  for (const g of games || []) {
    const base = g?.slug;
    if (!base || g?.gameId == null) continue;
    map[g.gameId] = baseCounts[base] > 1 && g.gamePk != null ? `${base}-${g.gamePk}` : base;
  }
  return map;
}
/** Canonical relative game path from a resolved slug (null slug ⇒ null, an honest "no canonical URL"). */
export const gamePathFor = (slug) => (slug ? `/games/mlb/${slug}` : null);

// Canonical daily-loop destinations (Sprint 003): the morning slate lands on the daily hub, the recap lands
// on the results page. Absolute URLs use the app's own metadataBase — never an archived/retired route.
export const DAILY_HUB_PATH = "/today";
export const RESULTS_RECAP_PATH = "/results";
export const siteUrl = (p) => `${SITE_BASE}${p}`;

/**
 * p10/p90 of a simulated-outcome distribution. `bins` are integer buckets with a `probability` and a `lowerEdge`
 * (the outcome value). Returns the outcome value at cumulative probability q — deterministic, sorted by outcome.
 */
export function percentileFromBins(bins, q) {
  const sorted = (Array.isArray(bins) ? bins : []).slice().sort((a, b) => (a?.lowerEdge ?? 0) - (b?.lowerEdge ?? 0));
  let cum = 0;
  for (const b of sorted) { cum += b?.probability ?? 0; if (cum >= q) return b?.lowerEdge ?? null; }
  return sorted.length ? sorted[sorted.length - 1]?.lowerEdge ?? null : null;
}

// Widest-spread simulated distribution for a game → a neutral uncertainty spotlight (p10–p90 range).
function distributionSpotlight(g, ctx) {
  let best = null;
  for (const [key, dist] of Object.entries(g.distributions || {})) {
    const bins = Array.isArray(dist?.bins) ? dist.bins : [];
    if (bins.length < 2) continue;
    const p10 = percentileFromBins(bins, 0.1);
    const p90 = percentileFromBins(bins, 0.9);
    if (!Number.isFinite(p10) || !Number.isFinite(p90)) continue;
    const rangeP10P90 = round(p90 - p10);
    if (best == null || rangeP10P90 > best.rangeP10P90) {
      const [market, , lineStr] = String(key).split("__");
      const player = typeof dist.label === "string" ? dist.label.split(" — ")[0].trim() : null;
      best = { key, market: market ?? null, player, line: lineStr != null && lineStr !== "" ? Number(lineStr) : null, p10, p90, rangeP10P90, sampleCount: dist.sampleCount ?? null };
    }
  }
  if (!best) return null;
  return {
    date: ctx.date, game: ctx.matchup, gameId: g.gameId, gameUrl: ctx.gameUrl,
    player: best.player, market: best.market, line: best.line, side: null,
    p10: best.p10, p90: best.p90, rangeP10P90: best.rangeP10P90, sampleCount: best.sampleCount,
    metric: "p10-p90 simulated-outcome range",
    runCount: ctx.runCount, generatedAt: ctx.generatedAt, marketCapturedAt: ctx.marketCapturedAt,
    publicBeta: DISCLAIMER, notBettingAdvice: true, public: false,
  };
}

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
  // Canonical URL per game (same slug logic the site uses), resolved once over the whole slate.
  const slugById = canonicalSlugMap(sim?.games || []);

  const perGame = [];
  const supported = []; // items with BOTH sim + market probability
  const simulationOnly = []; // items with sim probability but NO market probability (never ranked above supported)
  const spotlights = []; // p10–p90 uncertainty spotlight, one per exported game
  const excludedGames = [];

  for (const g of sim?.games || []) {
    const matchup = `${g.teams?.away ?? "?"} @ ${g.teams?.home ?? "?"}`;
    const marketCapturedAt = g.marketSnapshot?.capturedAt ?? g.freshness?.sourceCapturedAt ?? null;
    const commenceTime = commenceById[g.gameId] ?? null;
    const status = g.status ?? null;
    const gameUrl = gamePathFor(slugById[g.gameId] ?? g.slug ?? null);
    // PREGAME-FREEZE GUARD (deterministic, mirrors research eligibility): only export a game whose market artifact
    // was frozen strictly before first pitch AND whose status is pregame. If we cannot prove the freeze, we skip.
    const startedByStatus = status != null && !PREGAME_STATUSES.has(status);
    const frozenPregame =
      marketCapturedAt != null && commenceTime != null ? marketCapturedAt < commenceTime : marketCapturedAt != null && !startedByStatus;
    if (startedByStatus || !frozenPregame) {
      excludedGames.push({ matchup, gameUrl, status, marketCapturedAt, commenceTime, reason: startedByStatus ? "game not pregame (status)" : "market artifact not proven frozen pregame" });
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
        date, game: matchup, gameId: g.gameId, gameUrl, player: p.player ?? null, market: p.market, side: p.side, line: p.line ?? null,
        simulationProbability, marketProbability, marketProbabilityAvailable: hasMarket, differencePct,
        runCount, generatedAt, marketCapturedAt, lineupState,
        dataStatus: hasMarket ? "fully-supported" : "market-unavailable",
        publicBeta: DISCLAIMER, notBettingAdvice: true, public: false,
      };
      if (hasMarket) { supported.push(item); marketsSupported++; } else { simulationOnly.push(item); }
    }
    const diffs = supported.filter((d) => d.gameId === g.gameId).map((d) => d.differencePct);
    const spotlight = distributionSpotlight(g, { date, matchup, gameUrl, runCount, generatedAt, marketCapturedAt });
    if (spotlight) spotlights.push(spotlight);
    perGame.push({
      gameId: g.gameId, matchup, gameUrl, marketCapturedAt, marketsSimulated: (g.generatedPicks || g.picks || []).length, marketsSupported,
      largestDifferencePct: diffs.length ? Math.max(...diffs) : null,
      volatilitySpreadPct: diffs.length ? round(Math.max(...diffs) - Math.min(...diffs)) : null,
      distributionRangeP10P90: spotlight ? spotlight.rangeP10P90 : null,
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
    // Uncertainty spotlight — the widest p10–p90 simulated-outcome spreads on the slate (a neutral spread, one per game).
    uncertaintySpotlights: spotlights.slice().sort((a, b) => (b.rangeP10P90 ?? -1) - (a.rangeP10P90 ?? -1)).slice(0, 3),
    highestVolatilityGames: perGame.filter((g) => g.volatilitySpreadPct != null).sort((a, b) => b.volatilitySpreadPct - a.volatilitySpreadPct).slice(0, 5)
      .map((g) => ({ matchup: g.matchup, gameUrl: g.gameUrl, marketsSimulated: g.marketsSimulated, volatilitySpreadPct: g.volatilitySpreadPct, distributionRangeP10P90: g.distributionRangeP10P90 })),
    interestingMatchups: perGame.slice().sort((a, b) => b.marketsSimulated - a.marketsSimulated).slice(0, 5)
      .map((g) => ({
        matchup: g.matchup, gameUrl: g.gameUrl, marketsSimulated: g.marketsSimulated, headline: g.headline,
        date, generatedAt, marketCapturedAt: g.marketCapturedAt, runCount, line: null, side: null,
        publicBeta: DISCLAIMER, notBettingAdvice: true, public: false,
      })),
    // Canonical daily-loop destinations — morning slate → /today, settled recap → /results. Absolute so a
    // future share lands on the correct, current page (never an archived route).
    canonicalLinks: {
      morningSlatePath: DAILY_HUB_PATH,
      morningSlateUrl: siteUrl(DAILY_HUB_PATH),
      recapPath: RESULTS_RECAP_PATH,
      recapUrl: siteUrl(RESULTS_RECAP_PATH),
    },
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
  console.log(`  games: ${report.games}  ·  supported comparisons: ${report.largestSimulationDifferences.length}  ·  market-unavailable: ${report.simulationOnlyProjections.length}  ·  spotlights: ${report.uncertaintySpotlights.length}  ·  excluded (not pregame-frozen): ${report.excludedGames.length}`);
  for (const d of report.largestSimulationDifferences.slice(0, 3)) console.log(`    ${d.game}: ${d.player} ${d.market} ${d.side} ${d.line} — sim ${d.simulationProbability}% vs market ${d.marketProbability}% (diff ${d.differencePct}pts)  ${d.gameUrl}`);
  console.log(`  → data/internal/mlb/social/${date}.json  (exportable; internal, not served publicly)`);
}
const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();

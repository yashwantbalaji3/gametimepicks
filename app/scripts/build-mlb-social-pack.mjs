/**
 * build-mlb-social-pack.mjs — the INTERNAL daily social pack. Assembles the six planned sections from the honest
 * social-content artifact (build-mlb-social-content.mjs) + the settled prior-date simulation-accuracy report, and
 * drafts platform-specific copy (X / Instagram / Discord / TikTok) plus ONE game-specific, OG-ready share card.
 * DRAFTS ONLY — nothing is posted or exposed; the pack is written to data/internal/mlb/social/pack-<date>.json
 * (public:false, notBettingAdvice).
 *
 * Voice: analytical, not advisory. It reports the simulation's projections and their NEUTRAL difference from the
 * market — never "edge/value/lock/best bet/beat the market/market mistake/profitable/guaranteed", never a
 * recommendation, never a claim the simulation is superior. Every content item + the share card carries the full
 * provenance envelope (date, generatedAt, marketCapturedAt, line, side, runCount, the CANONICAL game URL, the
 * public-beta disclaimer, notBettingAdvice). Every platform draft embeds the canonical game URL + the not-advice
 * line. The results recap is the simulation's own projection accuracy — a SEPARATE model-performance family,
 * explicitly NOT the paper-product record and NOT profitability, always with a single-date caveat.
 *
 * Deterministic: pure over its inputs (a built content report + a prior settled report). Same inputs → byte-identical
 * pack (no wall-clock, no randomness).
 *
 *   node app/scripts/build-mlb-social-pack.mjs --date 2026-07-23
 */
import fs from "node:fs";
import path from "node:path";
import { buildSocialContent, FORBIDDEN_TERMS, SITE_BASE } from "./build-mlb-social-content.mjs";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const NOT_ADVICE = "Simulation-powered analytics · paper-only · public beta · NOT betting advice.";
const shareUrl = (gameUrl) => (gameUrl ? `${SITE_BASE}${gameUrl}` : null);
const MARKET_LABEL = {
  pitcher_strikeouts: "strikeouts", batter_hits: "hits", batter_total_bases: "total bases",
  batter_hits_runs_rbis: "hits + runs + RBIs", batter_rbis: "RBIs", batter_runs_scored: "runs",
};
const prettyMarket = (m) => MARKET_LABEL[m] ?? String(m || "").replace(/^batter_|^pitcher_/, "").replace(/_/g, " ");

/** Pure assembler — content = a built social-content report; prior = a settled comparison_report (or null). */
export function buildSocialPack(content, prior, date) {
  const overview = {
    date, generatedAt: content.generatedAt, runCount: content.runCount, gamesSimulated: content.games,
    supportedComparisons: content.largestSimulationDifferences.length,
    marketUnavailable: content.simulationOnlyProjections.length,
    excludedNotPregameFrozen: content.excludedGames.length,
    notBettingAdvice: true, publicBeta: content.disclaimer,
  };
  // Every content item keeps its full provenance envelope (incl. the canonical gameUrl).
  const largestDifferences = content.largestSimulationDifferences.slice(0, 5).map((d) => ({
    game: d.game, gameUrl: d.gameUrl, player: d.player, market: d.market, side: d.side, line: d.line,
    simulationProbability: d.simulationProbability, marketProbability: d.marketProbability, differencePct: d.differencePct,
    date: d.date, generatedAt: d.generatedAt, marketCapturedAt: d.marketCapturedAt, runCount: d.runCount,
    publicBeta: d.publicBeta, notBettingAdvice: d.notBettingAdvice,
  }));
  // Uncertainty spotlight = the widest p10–p90 simulated-outcome spreads (already enveloped, one per game).
  const highestUncertainty = content.uncertaintySpotlights.slice(0, 3);
  const interestingMatchups = content.interestingMatchups.slice(0, 3);
  // feature completeness = how many markets the sim could actually support (both sim + market probability) per game
  const strongestCoverage = content.largestSimulationDifferences.concat(content.simulationOnlyProjections)
    .reduce((acc, it) => { acc[it.game] = acc[it.game] || { game: it.game, gameUrl: it.gameUrl, supportedMarkets: 0 }; acc[it.game].supportedMarkets += it.marketProbabilityAvailable ? 1 : 0; return acc; }, {});
  const feature = Object.values(strongestCoverage).sort((a, b) => b.supportedMarkets - a.supportedMarkets).slice(0, 3);

  // Results recap — the simulation's projection accuracy on the last settled date. NEUTRAL + single-date caveat.
  const resultsRecap = prior
    ? {
        settledDate: prior.date, marketsGraded: prior.decisive ?? ((prior.wins ?? 0) + (prior.losses ?? 0)),
        projectionHitRatePct: prior.hitRate != null ? Number((100 * prior.hitRate).toFixed(1)) : null,
        note: "Simulation projection accuracy on a single settled date — a model-performance measure only. NOT the paper-product record, NOT profitability, and never a conclusion from one day. Modeled markets are not market-proven (public beta).",
        notBettingAdvice: true, publicBeta: content.disclaimer,
      }
    : { settledDate: null, note: "No settled prior-date simulation-accuracy report available yet.", notBettingAdvice: true, publicBeta: content.disclaimer };

  const topLine = largestDifferences[0];
  const topUrl = shareUrl(topLine?.gameUrl);
  const gap = topLine ? `${topLine.player} ${prettyMarket(topLine.market)} ${topLine.side} ${topLine.line}: sim ${topLine.simulationProbability}% vs market ${topLine.marketProbability}% (a ${topLine.differencePct}-pt difference)` : null;
  const spot = highestUncertainty[0];

  // ONE game-specific, OG-ready share card — grounded in the top supported comparison, full provenance envelope.
  const shareCard = topLine
    ? {
        kind: "og-share-card", game: topLine.game, gameUrl: topLine.gameUrl, shareUrl: topUrl,
        ogTitle: `${topLine.game} — simulation vs market`,
        ogDescription: `${topLine.player} ${prettyMarket(topLine.market)} ${topLine.side} ${topLine.line}: simulation ${topLine.simulationProbability}% vs market ${topLine.marketProbability}% — a ${topLine.differencePct}-pt difference over ${content.runCount.toLocaleString()} runs. ${NOT_ADVICE}`,
        text: `${topLine.game}\n${topLine.player} — ${prettyMarket(topLine.market)} ${topLine.side} ${topLine.line}\nSimulation ${topLine.simulationProbability}% · Market ${topLine.marketProbability}% · ${topLine.differencePct}-pt difference\n${content.runCount.toLocaleString()} simulated runs · deterministic\n${topUrl}\n${NOT_ADVICE}`,
        player: topLine.player, market: topLine.market, side: topLine.side, line: topLine.line,
        simulationProbability: topLine.simulationProbability, marketProbability: topLine.marketProbability, differencePct: topLine.differencePct,
        date, generatedAt: content.generatedAt, marketCapturedAt: topLine.marketCapturedAt, runCount: content.runCount,
        publicBeta: content.disclaimer, notBettingAdvice: true,
      }
    : null;

  const drafts = {
    x: topLine
      ? `Today's MLB simulations are live: ${overview.gamesSimulated} games, ${overview.runCount.toLocaleString()} runs each. Biggest simulation-vs-market difference — ${gap}. Explore the probabilities yourself: ${topUrl} ${NOT_ADVICE}`
      : `MLB simulations for ${date}: ${overview.gamesSimulated} games, ${overview.runCount.toLocaleString()} runs each. Explore the probabilities. ${NOT_ADVICE}`,
    instagramCaption:
      `⚾ MLB simulations — ${date}\n\n${overview.gamesSimulated} games modeled, ${overview.runCount.toLocaleString()} simulated runs each. We compare the simulation's projection to the market line and show the difference — you decide what it means.\n\n` +
      (topLine ? `Largest difference today: ${gap}.\nGame page: ${topUrl}\n\n` : "") +
      `Deterministic — the same result for every user. ${NOT_ADVICE}\n\n#MLB #baseball #analytics #simulation #publicbeta`,
    discord:
      `**MLB Simulations — ${date}**\n` +
      `• ${overview.gamesSimulated} games · ${overview.runCount.toLocaleString()} runs each\n` +
      largestDifferences.slice(0, 3).map((d) => `• [${d.game}](${shareUrl(d.gameUrl)}): ${d.player} ${prettyMarket(d.market)} ${d.side} ${d.line} — sim ${d.simulationProbability}% vs market ${d.marketProbability}% (${d.differencePct}-pt gap)`).join("\n") +
      `\n_${NOT_ADVICE}_`,
    tiktokVoiceoverOutline: [
      `Hook: "We ran every MLB game ${overview.runCount.toLocaleString()} times. Here's where our simulation and the market disagree the most."`,
      topLine ? `Beat 1: Show ${topLine.player} — simulation ${topLine.simulationProbability}%, market ${topLine.marketProbability}%. Say the number, not a recommendation. On screen: ${topUrl}` : `Beat 1: Show the slate of ${overview.gamesSimulated} simulated games.`,
      spot ? `Beat 2: Uncertainty spotlight — ${spot.player} ${prettyMarket(spot.market)}: simulated outcomes span p10 ${spot.p10} to p90 ${spot.p90} (a range of ${spot.rangeP10P90}). Emphasize spread, not a prediction.` : `Beat 2: Emphasize it's a neutral comparison — a difference, not a prediction that the sim is right.`,
      `Close: "It's paper-only, deterministic, public beta. Not betting advice. Explore it yourself."`,
    ],
    shareCard,
  };

  return {
    public: false, kind: "mlb-social-pack", contentType: "analytics-draft", notBettingAdvice: true, date,
    generatedAt: content.generatedAt,
    generatedFrom: { socialContentDate: content.date, priorSettledDate: prior?.date ?? null },
    provenance: {
      date, generatedAt: content.generatedAt, runCount: content.runCount, notBettingAdvice: true, publicBeta: content.disclaimer,
      canonicalUrls: content.largestSimulationDifferences.map((d) => d.gameUrl).filter((u, i, a) => u && a.indexOf(u) === i),
    },
    sections: { overview, largestDifferences, highestUncertainty, interestingMatchups, featureCompleteness: feature, resultsRecap },
    drafts, disclaimer: content.disclaimer, forbiddenTerms: FORBIDDEN_TERMS,
    note: "DRAFTS ONLY — internal. Nothing here is posted or exposed automatically.",
  };
}

function latestSettledBefore(date) {
  const dir = path.join(APP, "public/data/mlb/results");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^comparison_report_\d{4}-\d{2}-\d{2}\.json$/.test(f)) : [];
  const dates = files.map((f) => f.slice("comparison_report_".length, -".json".length)).filter((d) => d < date).sort();
  return dates.length ? readJson(path.join(dir, `comparison_report_${dates[dates.length - 1]}.json`)) : null;
}

function main() {
  const args = process.argv.slice(2);
  const di = args.indexOf("--date");
  const date = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[di + 1] || "") ? args[di + 1] : new Date().toISOString().slice(0, 10);
  const sim = readJson(path.join(APP, "public/data/mlb/game-simulations", `${date}.json`));
  if (!sim || !Array.isArray(sim.games)) { console.log(`[social-pack] no simulations for ${date} — nothing to build (honest no-op).`); return; }
  const teamMarkets = readJson(path.join(APP, "public/data/mlb/team-markets", `${date}.json`));
  const content = buildSocialContent(sim, teamMarkets, date);
  const prior = latestSettledBefore(date);
  const pack = buildSocialPack(content, prior, date);

  const outDir = path.join(REPO, "data/internal/mlb/social");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `pack-${date}.json`), JSON.stringify(pack, null, 2));

  console.log(`\n=== MLB SOCIAL PACK ${date} (internal drafts — NOT betting advice) ===`);
  console.log(`  overview: ${pack.sections.overview.gamesSimulated} games · ${pack.sections.overview.supportedComparisons} comparisons`);
  console.log(`  uncertainty spotlight: ${pack.sections.highestUncertainty[0] ? `${pack.sections.highestUncertainty[0].player} ${pack.sections.highestUncertainty[0].market} p10-p90 range ${pack.sections.highestUncertainty[0].rangeP10P90}` : "none"}`);
  console.log(`  results recap: ${pack.sections.resultsRecap.settledDate ?? "none"} (projection hit-rate ${pack.sections.resultsRecap.projectionHitRatePct ?? "n/a"}%)`);
  console.log(`  drafts: X / Instagram / Discord / TikTok + share card\n  X draft: ${pack.drafts.x}`);
  console.log(`  → data/internal/mlb/social/pack-${date}.json  (internal drafts, never auto-posted)`);
}
const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();

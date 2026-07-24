/**
 * Deterministic guards for the exportable MLB social-content builder + daily social PACK
 * (build-mlb-social-content.mjs / build-mlb-social-pack.mjs). Uses synthetic sim + team-market fixtures for the unit
 * rules and the REAL live public slate (2026-07-23) for the end-to-end hardening proofs:
 *   • full provenance envelope on every item (incl. the canonical gameUrl);
 *   • missing-vs-0% market probability; market-unavailable items never ranked among supported comparisons;
 *   • the pregame-freeze leakage guard;
 *   • zero betting-recommendation vocabulary anywhere in the pack (drafts + share card included);
 *   • every shared link is a VALID canonical /games/mlb/<away>-vs-<home>-<date> URL, resolved with the same slug
 *     logic the site uses in app/src/lib/game-detail.ts (incl. the doubleheader gamePk suffix);
 *   • the p10–p90 uncertainty spotlight and the OG-ready game share card;
 *   • byte-identical regeneration from the same public artifacts (deterministic — no wall-clock / randomness).
 *
 * Run: npx tsx --test src/lib/build-mlb-social-content.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildSocialContent, FORBIDDEN_TERMS, canonicalSlugMap, percentileFromBins, SITE_BASE } from "../../scripts/build-mlb-social-content.mjs";
import { buildSocialPack } from "../../scripts/build-mlb-social-pack.mjs";

const REQUIRED_ITEM_FIELDS = [
  "date", "game", "gameUrl", "player", "market", "side", "line", "simulationProbability", "marketProbability",
  "marketProbabilityAvailable", "differencePct", "runCount", "generatedAt", "marketCapturedAt",
  "lineupState", "dataStatus", "publicBeta", "notBettingAdvice", "public",
];
// The task's forbidden vocabulary — scanned as whole words (single) or phrases (multiword) so the brand host
// (gametimepicks…) and neutral copy never false-trip.
const TASK_FORBIDDEN = ["edge", "value", "lock", "best bet", "profitable", "guaranteed", "market mistake", "beat the market"];
function scanForbidden(objOrString) {
  const s = (typeof objOrString === "string" ? objOrString : JSON.stringify(objOrString)).toLowerCase();
  const hits = [];
  for (const t of TASK_FORBIDDEN) {
    const re = t.includes(" ") ? new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : new RegExp(`\\b${t}\\b`);
    if (re.test(s)) hits.push(t);
  }
  return hits;
}
// Canonical URL shape + the site's slug logic (mirrors app/src/lib/game-detail.ts).
const CANON_URL = /^\/games\/mlb\/[a-z0-9-]+-vs-[a-z0-9-]+-\d{4}-\d{2}-\d{2}(-\d+)?$/;
const slugify = (x) => (x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const siteGameSlug = (away, home, date) => `${slugify(away)}-vs-${slugify(home)}-${date}`;

// A pregame game (market captured before first pitch, status "ready") with a mix of markets + a distribution set.
function pregameGame(over = {}) {
  return {
    gameId: "g1", gamePk: 900001, slug: "awy-vs-hom-2026-07-22",
    teams: { home: "Home Nine", away: "Away Nine" }, status: "ready",
    marketSnapshot: { capturedAt: "2026-07-22T15:00:00Z" },
    simulationSummary: { headline: "A close one on paper." },
    distributions: {
      // strikeouts: cum .05,.15,.35,.65,.85,1.0 → p10=5, p90=12, range 7 (the WIDEST → the spotlight)
      "pitcher_strikeouts__1__6.5": { label: "Ace Arm — Strikeouts (line 6.5)", sampleCount: 10000, bins: [
        { label: "0", lowerEdge: 0, upperEdge: 1, probability: 0.05 }, { label: "5", lowerEdge: 5, upperEdge: 6, probability: 0.10 },
        { label: "6", lowerEdge: 6, upperEdge: 7, probability: 0.20 }, { label: "7", lowerEdge: 7, upperEdge: 8, probability: 0.30 },
        { label: "8", lowerEdge: 8, upperEdge: 9, probability: 0.20 }, { label: "12", lowerEdge: 12, upperEdge: 13, probability: 0.15 },
      ] },
      // hits: cum .4,.8,1.0 → p10=0, p90=2, range 2 (narrower)
      "batter_hits__2__1.5": { label: "Bat One — Hits (line 1.5)", sampleCount: 10000, bins: [
        { label: "0", lowerEdge: 0, upperEdge: 1, probability: 0.4 }, { label: "1", lowerEdge: 1, upperEdge: 2, probability: 0.4 },
        { label: "2", lowerEdge: 2, upperEdge: 3, probability: 0.2 },
      ] },
    },
    generatedPicks: [
      { player: "Ace Arm", market: "pitcher_strikeouts", side: "over", line: 6.5, modelProbability: 0.68, marketProbability: 0.45 }, // big diff, supported
      { player: "Bat One", market: "batter_hits", side: "over", line: 1.5, modelProbability: 0.52, marketProbability: 0.50 },       // small diff, supported
      { player: "Zero Zed", market: "batter_total_bases", side: "over", line: 2.5, modelProbability: 0.30, marketProbability: 0 },   // market EXACTLY 0% (real, not missing)
      { player: "Missing Moe", market: "batter_rbis", side: "over", line: 0.5, modelProbability: 0.40 },                              // NO market probability (missing)
    ],
    ...over,
  };
}
const teamMarkets = { games: { g1: { commenceTime: "2026-07-22T23:05:00Z" }, gLate: { commenceTime: "2026-07-22T18:00:00Z" } } };
const sim = (games) => ({ runCount: 10000, generatedAt: "2026-07-22T19:00:00Z", games });

test("1 · every emitted item carries the full provenance envelope (incl. the canonical gameUrl)", () => {
  const r = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  const items = [...r.largestSimulationDifferences, ...r.simulationOnlyProjections];
  assert.ok(items.length >= 3, "produced items");
  for (const it of items) for (const f of REQUIRED_ITEM_FIELDS) assert.ok(f in it, `item missing ${f}`);
  for (const it of items) { assert.equal(it.public, false); assert.equal(it.notBettingAdvice, true); assert.ok(it.publicBeta.length > 20); assert.equal(it.runCount, 10000); assert.equal(it.gameUrl, "/games/mlb/awy-vs-hom-2026-07-22"); }
});

test("2 · missing market probability is null (distinct from a real 0%) and is NOT ranked among supported", () => {
  const r = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  // the 0% market row IS a supported comparison (real number, not missing)
  const zero = r.largestSimulationDifferences.find((d) => d.player === "Zero Zed");
  assert.ok(zero, "0% market row is a supported comparison");
  assert.equal(zero.marketProbability, 0);
  assert.equal(zero.marketProbabilityAvailable, true);
  assert.equal(zero.differencePct, 30, "diff computed against a real 0%");
  // the missing-market row is null + un-ranked (separate list only)
  const miss = r.simulationOnlyProjections.find((d) => d.player === "Missing Moe");
  assert.ok(miss, "missing-market row is in the un-ranked list");
  assert.equal(miss.marketProbability, null, "missing market prob is null, not 0");
  assert.equal(miss.marketProbabilityAvailable, false);
  assert.equal(miss.differencePct, null, "no difference when market is missing");
  assert.equal(miss.dataStatus, "market-unavailable");
  assert.ok(!r.largestSimulationDifferences.some((d) => d.player === "Missing Moe"), "missing-market item never ranked among supported comparisons");
});

test("3 · supported comparisons are ranked by difference (largest first); a missing-market item never outranks them", () => {
  const r = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  const diffs = r.largestSimulationDifferences.map((d) => d.differencePct);
  for (let i = 1; i < diffs.length; i++) assert.ok(diffs[i - 1] >= diffs[i], "descending by differencePct");
  // Zero Zed's |30 − 0| = 30pt gap (a real 0% market) is the largest, so it ranks first — proving a genuine 0%
  // is included and ranked, not dropped as "missing".
  assert.equal(r.largestSimulationDifferences[0].player, "Zero Zed", "biggest gap ranks first");
  assert.equal(r.largestSimulationDifferences[0].differencePct, 30);
  // NO market-unavailable item is present in the ranked comparison list at all.
  assert.ok(r.largestSimulationDifferences.every((d) => d.marketProbabilityAvailable === true), "ranked list is complete comparisons only");
});

test("4 · PREGAME-FREEZE guard excludes a game whose market was captured after first pitch, or that has started", () => {
  // market captured AFTER commence → leakage → excluded
  const leak = pregameGame({ gameId: "gLate", marketSnapshot: { capturedAt: "2026-07-22T19:00:00Z" } }); // commence gLate = 18:00
  let r = buildSocialContent(sim([leak]), teamMarkets, "2026-07-22");
  assert.equal(r.games, 0, "post-first-pitch capture is excluded");
  assert.equal(r.largestSimulationDifferences.length, 0);
  assert.ok(r.excludedGames.some((g) => /frozen pregame/.test(g.reason)));
  // a started game (status not pregame) → excluded even if timestamps are absent
  r = buildSocialContent(sim([pregameGame({ status: "live" })]), teamMarkets, "2026-07-22");
  assert.equal(r.games, 0, "a live/started game is excluded");
  assert.ok(r.excludedGames.some((g) => /status/.test(g.reason)));
});

test("5 · the output contains NO betting-recommendation vocabulary (field names OR values)", () => {
  const r = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  // scan the ranked/derived content, NOT the intentional forbiddenTerms allow-list or the disclaimer
  const scanObj = {
    largestSimulationDifferences: r.largestSimulationDifferences,
    simulationOnlyProjections: r.simulationOnlyProjections,
    uncertaintySpotlights: r.uncertaintySpotlights,
    highestVolatilityGames: r.highestVolatilityGames,
    interestingMatchups: r.interestingMatchups,
  };
  assert.deepEqual(scanForbidden(scanObj), [], "output must not contain any task-forbidden vocabulary");
  const scan = JSON.stringify(scanObj).toLowerCase();
  assert.ok(!/edgepct|isedge|bestbet|islock/.test(scan), "no edge/lock/best-bet field keys");
  // the report advertises its own guard list (now incl. "market mistake") + is flagged not-betting-advice
  assert.deepEqual(r.forbiddenTerms, FORBIDDEN_TERMS);
  assert.ok(FORBIDDEN_TERMS.includes("market mistake"), "guard list covers 'market mistake'");
  assert.equal(r.notBettingAdvice, true);
  assert.equal(r.public, false);
});

test("6 · a difference is a neutral magnitude — never described as the simulation beating/being superior to the market", () => {
  const r = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  const d = r.largestSimulationDifferences[0];
  assert.ok(d.differencePct >= 0, "difference is an absolute magnitude, not a signed advantage");
  assert.match(r.disclaimer, /not a prediction of superiority|not betting advice/i);
});

// ── the daily social PACK (6 sections + platform drafts + share card) ──
const priorReport = { date: "2026-07-21", decisive: 47, wins: 15, losses: 32, hitRate: 0.3194 };

test("7 · the pack has all six sections + four platform drafts + a share card, internal + not-advice", () => {
  const content = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  const pack = buildSocialPack(content, priorReport, "2026-07-22");
  assert.equal(pack.public, false);
  assert.equal(pack.notBettingAdvice, true);
  for (const s of ["overview", "largestDifferences", "highestUncertainty", "interestingMatchups", "featureCompleteness", "resultsRecap"]) {
    assert.ok(s in pack.sections, `pack missing section ${s}`);
  }
  for (const d of ["x", "instagramCaption", "discord", "tiktokVoiceoverOutline", "shareCard"]) assert.ok(d in pack.drafts, `pack missing draft ${d}`);
  assert.ok(/not betting advice/i.test(pack.drafts.x), "the X draft carries the not-advice disclaimer");
});

test("8 · the results recap is a NEUTRAL single-date simulation-accuracy figure — not the paper record, not profitability", () => {
  const content = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  const recap = buildSocialPack(content, priorReport, "2026-07-22").sections.resultsRecap;
  assert.equal(recap.settledDate, "2026-07-21");
  assert.equal(recap.projectionHitRatePct, 31.9, "reports the raw projection hit-rate honestly, low as it is");
  assert.match(recap.note, /NOT the paper-product record/i);
  assert.match(recap.note, /NOT profitability/i);
  assert.match(recap.note, /single settled date|from one day/i);
  // never surfaces the money record family (19-14 / bankroll / crown) in a sim-accuracy recap
  const scan = JSON.stringify(recap);
  assert.ok(!/19-14|19–14|bankroll|crown|\$20,465|\$19,065/.test(scan), "no money-record family mixed into the sim recap");
});

test("9 · the pack (drafts + sections + share card) contains NO betting-recommendation vocabulary", () => {
  const content = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  const pack = buildSocialPack(content, priorReport, "2026-07-22");
  const { forbiddenTerms, ...scanable } = pack; void forbiddenTerms;
  assert.deepEqual(scanForbidden(scanable), [], "pack must not contain any task-forbidden vocabulary");
  // guard the extra promo cliché too
  assert.ok(!JSON.stringify(scanable).toLowerCase().includes("sure thing"), "no 'sure thing'");
});

// ── Phase-7 hardening proofs ──

test("10 · every shared link is a VALID canonical URL, resolved via the site's slug logic (incl. doubleheaders)", () => {
  const content = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  const pack = buildSocialPack(content, priorReport, "2026-07-22");
  // gather every gameUrl surfaced anywhere in the content + pack
  const urls = [
    ...content.largestSimulationDifferences.map((d) => d.gameUrl),
    ...content.uncertaintySpotlights.map((d) => d.gameUrl),
    ...content.interestingMatchups.map((d) => d.gameUrl),
    ...pack.sections.largestDifferences.map((d) => d.gameUrl),
    ...pack.provenance.canonicalUrls,
    pack.drafts.shareCard?.gameUrl,
  ].filter(Boolean);
  assert.ok(urls.length > 0, "there are shared links");
  for (const u of urls) assert.match(u, CANON_URL, `invalid canonical URL: ${u}`);
  // doubleheader: two games sharing a base slug get distinct gamePk-suffixed canonical URLs (site logic)
  const dh = [
    pregameGame({ gameId: "dh1", gamePk: 900010, slug: "dh-vs-xyz-2026-07-22" }),
    pregameGame({ gameId: "dh2", gamePk: 900011, slug: "dh-vs-xyz-2026-07-22" }),
  ];
  const tm2 = { games: { dh1: { commenceTime: "2026-07-22T23:05:00Z" }, dh2: { commenceTime: "2026-07-22T23:05:00Z" } } };
  const map = canonicalSlugMap(dh);
  assert.equal(map.dh1, "dh-vs-xyz-2026-07-22-900010");
  assert.equal(map.dh2, "dh-vs-xyz-2026-07-22-900011");
  const rc = buildSocialContent(sim(dh), tm2, "2026-07-22");
  const dhUrls = [...new Set(rc.largestSimulationDifferences.map((d) => d.gameUrl))];
  assert.deepEqual(dhUrls.sort(), ["/games/mlb/dh-vs-xyz-2026-07-22-900010", "/games/mlb/dh-vs-xyz-2026-07-22-900011"]);
  for (const u of dhUrls) assert.match(u, CANON_URL);
});

test("10b · the daily-loop canonical links land on /today (morning) + /results (recap), never an archived route", () => {
  const content = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  const links = content.canonicalLinks;
  assert.equal(links.morningSlatePath, "/today", "morning slate → /today");
  assert.equal(links.recapPath, "/results", "recap → /results");
  assert.equal(links.morningSlateUrl, `${SITE_BASE}/today`, "absolute morning URL uses the app's own base");
  assert.equal(links.recapUrl, `${SITE_BASE}/results`, "absolute recap URL uses the app's own base");
  // No archived / retired destination is ever emitted.
  for (const u of [links.morningSlatePath, links.recapPath, links.morningSlateUrl, links.recapUrl]) {
    assert.doesNotMatch(u, /world-cup|homer-nukes|\/wc\b|parlay-lab|\/board\b/i, `archived route leaked: ${u}`);
  }
});

test("11 · the uncertainty spotlight is the p10–p90 simulated-outcome range, with full provenance + a canonical URL", () => {
  assert.equal(percentileFromBins([{ lowerEdge: 0, probability: 0.4 }, { lowerEdge: 1, probability: 0.4 }, { lowerEdge: 2, probability: 0.2 }], 0.1), 0);
  assert.equal(percentileFromBins([{ lowerEdge: 0, probability: 0.4 }, { lowerEdge: 1, probability: 0.4 }, { lowerEdge: 2, probability: 0.2 }], 0.9), 2);
  const content = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  const spot = content.uncertaintySpotlights[0];
  assert.ok(spot, "a spotlight exists");
  assert.equal(spot.market, "pitcher_strikeouts", "the widest-spread distribution is the spotlight");
  assert.equal(spot.player, "Ace Arm");
  assert.equal(spot.p10, 5); assert.equal(spot.p90, 12); assert.equal(spot.rangeP10P90, 7);
  assert.ok(spot.p90 >= spot.p10, "p90 ≥ p10");
  assert.match(spot.metric, /p10-p90/);
  for (const f of ["date", "generatedAt", "marketCapturedAt", "line", "side", "runCount", "gameUrl", "publicBeta", "notBettingAdvice"]) assert.ok(f in spot, `spotlight missing ${f}`);
  assert.match(spot.gameUrl, CANON_URL);
  assert.equal(spot.notBettingAdvice, true);
});

test("12 · the OG-ready game share card is grounded in a complete comparison + carries the full provenance envelope", () => {
  const content = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  const sc = buildSocialPack(content, priorReport, "2026-07-22").drafts.shareCard;
  assert.ok(sc, "share card exists");
  assert.equal(sc.kind, "og-share-card");
  for (const f of ["game", "gameUrl", "shareUrl", "ogTitle", "ogDescription", "text", "player", "market", "side", "line", "simulationProbability", "marketProbability", "differencePct", "date", "generatedAt", "marketCapturedAt", "runCount", "publicBeta", "notBettingAdvice"]) {
    assert.ok(f in sc, `share card missing ${f}`);
  }
  assert.match(sc.gameUrl, CANON_URL);
  assert.equal(sc.shareUrl, `${SITE_BASE}${sc.gameUrl}`, "absolute share URL = site base + canonical path");
  assert.ok(sc.text.includes(sc.shareUrl), "the share text carries the canonical link");
  assert.match(sc.text, /not betting advice/i);
  assert.equal(sc.marketProbability != null, true, "share card is a COMPLETE comparison (market present)");
  assert.deepEqual(scanForbidden(sc), [], "share card has no forbidden vocabulary");
});

test("13 · regeneration is byte-identical from the same inputs (deterministic — no wall-clock / randomness)", () => {
  const a = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  const b = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  assert.equal(JSON.stringify(a), JSON.stringify(b), "content regen is byte-identical");
  const pa = buildSocialPack(a, priorReport, "2026-07-22");
  const pb = buildSocialPack(b, priorReport, "2026-07-22");
  assert.equal(JSON.stringify(pa), JSON.stringify(pb), "pack regen is byte-identical");
  // provenance timestamps come from the artifact, NOT the wall clock
  assert.equal(a.generatedAt, "2026-07-22T19:00:00Z");
  assert.equal(pa.generatedAt, "2026-07-22T19:00:00Z");
});

// ── against the REAL live public slate (2026-07-23) ──
const APP = process.cwd();
const LIVE = "2026-07-23";
const readReal = (kind) => { try { return JSON.parse(fs.readFileSync(path.join(APP, `public/data/mlb/${kind}/${LIVE}.json`), "utf8")); } catch { return null; } };

test("14 · LIVE slate: deterministic + every content/pack item carries provenance + valid canonical URLs", () => {
  const simLive = readReal("game-simulations");
  const tmLive = readReal("team-markets");
  const board = readReal("boards");
  assert.ok(simLive && Array.isArray(simLive.games) && simLive.games.length > 0, "live simulations present");

  const c1 = buildSocialContent(simLive, tmLive, LIVE);
  const c2 = buildSocialContent(simLive, tmLive, LIVE);
  assert.equal(JSON.stringify(c1), JSON.stringify(c2), "LIVE content regen is byte-identical");
  const p1 = buildSocialPack(c1, priorReport, LIVE);
  const p2 = buildSocialPack(c2, priorReport, LIVE);
  assert.equal(JSON.stringify(p1), JSON.stringify(p2), "LIVE pack regen is byte-identical");
  assert.equal(c1.generatedAt, simLive.generatedAt, "generatedAt is the artifact's, not the wall clock");

  // every ranked comparison carries the envelope + a valid canonical URL
  for (const it of c1.largestSimulationDifferences) {
    for (const f of REQUIRED_ITEM_FIELDS) assert.ok(f in it, `LIVE item missing ${f}`);
    assert.match(it.gameUrl, CANON_URL);
    assert.equal(it.notBettingAdvice, true);
  }
  // URLs match the site's slug logic reconstructed from the board's team abbreviations (join by gamePk)
  const abbrByPk = {};
  for (const bg of board.games || []) abbrByPk[String(bg.gamePk)] = { away: bg.awayTeamAbbr, home: bg.homeTeamAbbr };
  for (const sg of simLive.games) {
    const ab = abbrByPk[String(sg.gamePk)];
    if (!ab) continue;
    assert.equal(sg.slug, siteGameSlug(ab.away, ab.home, LIVE), `artifact slug matches site logic for ${sg.gamePk}`);
  }
  const expectedUrls = new Set(simLive.games.map((sg) => { const ab = abbrByPk[String(sg.gamePk)]; return ab ? `/games/mlb/${siteGameSlug(ab.away, ab.home, LIVE)}` : null; }).filter(Boolean));
  for (const u of p1.provenance.canonicalUrls) assert.ok(expectedUrls.has(u), `canonical URL ${u} resolved via site slug logic`);

  // the spotlight is a real p10–p90 spread; the share card is a complete comparison
  assert.ok(p1.sections.highestUncertainty.length > 0, "a live uncertainty spotlight exists");
  assert.ok(p1.sections.highestUncertainty[0].p90 >= p1.sections.highestUncertainty[0].p10, "p90 ≥ p10");
  assert.match(p1.drafts.shareCard.gameUrl, CANON_URL);
});

test("15 · LIVE slate: the whole pack (drafts + share card + sections) is free of task-forbidden vocabulary", () => {
  const c = buildSocialContent(readReal("game-simulations"), readReal("team-markets"), LIVE);
  const pack = buildSocialPack(c, priorReport, LIVE);
  const { forbiddenTerms, ...scanable } = pack; void forbiddenTerms;
  assert.deepEqual(scanForbidden(scanable), [], "LIVE pack has no forbidden vocabulary");
  // every platform draft embeds a canonical link + the not-advice line
  assert.match(pack.drafts.x, /gametimepicks\.yashwantbalaji\.com\/games\/mlb\//);
  assert.match(pack.drafts.x, /not betting advice/i);
  assert.match(pack.drafts.discord, /not betting advice/i);
});

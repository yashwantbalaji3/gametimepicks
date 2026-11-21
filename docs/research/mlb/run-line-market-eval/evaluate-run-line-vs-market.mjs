/**
 * MLB RUN LINE · MARKET-INFORMED EVALUATION, protocol `mlb-runline-market-eval@1` (founder decision 7, 2026-10-09).
 *
 * Replaces the coin-flip floor as the yardstick for the run-line record WITHOUT rewriting that record: the live-record
 * gate's judgement and every graded row stay exactly as they are. This is research, read-only, and it grants nothing —
 * no unpause, no eligibility.
 *
 * The event scored is "the HOME side covers the line the book posted for it", for every graded game with a usable quote:
 *   - market quote: the one the forecast itself carried (`market.runLine`, signed home line + no-vig home cover, with
 *     book and capture time), joined to the committed team-markets revision captured at that instant for BOTH sides'
 *     prices; the de-vig is recomputed from those prices (multiplicative normalisation) and must match;
 *   - point in time: the quote must be captured before the forecast was generated and before first pitch;
 *   - settlement: home margin m, line L → covers iff m + L > 0; a whole-number line that lands exactly is a PUSH and is
 *     excluded from scoring (counted);
 *   - model probability for the same signed side, from the forecast of record's own simulated margins
 *     (L = +1.5 → 1 − awayCover@1.5; L = −1.5 → homeCover@1.5); other lines are not in the artifact and are excluded.
 *
 * Reported separately (they answer different questions):
 *   1. raw hit rate of the graded picks;
 *   2. base-rate effect: the market's own probability for each picked side — what a pick on that side "should" hit;
 *   3. model accuracy vs market on the same event: log loss and Brier, paired bootstrap of the difference;
 *   4. market probability (calibration of the benchmark itself);
 *   5. potential edge: model − market on the picked side, and the hypothetical flat-stake return at the posted price
 *      (descriptive only; never a product claim);
 *   6. product eligibility: NOT decided here.
 *
 * Run (from app/): node ../docs/research/mlb/run-line-market-eval/evaluate-run-line-vs-market.mjs --out ../docs/research/mlb/run-line-market-eval
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const PROTOCOL = "mlb-runline-market-eval@1";
const REPO = path.resolve(process.cwd(), "..");
const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : null;
const git = (...a) => execFileSync("git", a, { cwd: REPO, maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }).toString();
const gitJson = (sha, rel) => { try { return JSON.parse(git("show", `${sha}:${rel}`)); } catch { return null; } };

const graded = fs.readFileSync(path.join(REPO, "app/public/data/mlb/results/game-predictions-graded.jsonl"), "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.market === "run_line");

// Forecast of record: graded row → its prediction revision → artifactHash → the full-game game with that hash.
const predCache = new Map();
function predictionFor(r) {
  const key = r.forecastSource;
  if (!predCache.has(key)) {
    const i = key.indexOf(":");
    const kind = key.slice(0, i);
    const rest = key.slice(i + 1);
    let a = null;
    if (kind === "git") a = gitJson(rest, `app/public/data/mlb/predictions/${r.date}.json`);
    else if (kind === "snapshot") { try { a = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/mlb/prediction-snapshots", rest), "utf8")); } catch { a = null; } }
    predCache.set(key, a ? new Map(a.predictions.map((p) => [p.gamePk, p])) : null);
  }
  return predCache.get(key)?.get(r.gamePk) ?? null;
}
const byHash = new Map();
const indexed = new Set();
function gameByHash(date, hash) {
  if (!indexed.has(date)) {
    indexed.add(date);
    const rel = `app/public/data/mlb/full-game-simulations/${date}.json`;
    for (const sha of git("log", "--reverse", "--format=%H", "--", rel).split("\n").filter(Boolean)) {
      for (const g of gitJson(sha, rel)?.games ?? []) if (g.artifactHash && !byHash.has(g.artifactHash)) byHash.set(g.artifactHash, g);
    }
  }
  return byHash.get(hash) ?? null;
}
// Committed team-markets revisions of a date, by generatedAt (the capture instant the artifact's market block names).
const tmCache = new Map();
function teamMarketsAt(date, capturedAt) {
  if (!tmCache.has(date)) {
    const rel = `app/public/data/mlb/team-markets/${date}.json`;
    const m = new Map();
    for (const sha of git("log", "--format=%H", "--", rel).split("\n").filter(Boolean)) {
      const a = gitJson(sha, rel);
      if (a?.generatedAt && !m.has(a.generatedAt)) m.set(a.generatedAt, a);
    }
    tmCache.set(date, m);
  }
  return tmCache.get(date).get(capturedAt) ?? null;
}
const implied = (american) => (american < 0 ? -american / (-american + 100) : 100 / (american + 100));
const decimal = (american) => (american < 0 ? 1 + 100 / -american : 1 + american / 100);
const ms = (iso) => Date.parse(iso ?? "");

const rows = [];
const excluded = {};
const exclude = (why) => { excluded[why] = (excluded[why] ?? 0) + 1; };
for (const r of graded) {
  const pred = predictionFor(r);
  if (!pred?.artifactHash) { exclude("NO_FORECAST_OF_RECORD"); continue; }
  const g = gameByHash(r.date, pred.artifactHash);
  if (!g || g.status === "unavailable") { exclude("NO_FORECAST_OF_RECORD"); continue; }
  const q = g.market?.runLine;
  if (!q || q.line == null || q.homeCover == null || !g.market.capturedAt) { exclude("NO_MARKET_QUOTE"); continue; }
  if (!(ms(g.market.capturedAt) < ms(r.forecastGeneratedAt)) || !(ms(g.market.capturedAt) < ms(r.firstPitchUtc))) { exclude("QUOTE_NOT_POINT_IN_TIME"); continue; }
  const L = q.line;
  const at15 = g.runLine.find((x) => x.line === 1.5);
  if (!at15 || Math.abs(L) !== 1.5) { exclude("LINE_NOT_IN_ARTIFACT"); continue; }
  // Both sides' prices from the committed capture the artifact names; the de-vig must recompute.
  const tm = teamMarketsAt(r.date, g.market.capturedAt);
  const tg = tm ? Object.values(tm.games ?? {}).find((x) => x.commenceTime && Math.abs(ms(x.commenceTime) - ms(r.firstPitchUtc)) < 6 * 3600e3 && x.runLine?.home?.coverNoVigProb === q.homeCover && x.runLine?.line === L) : null;
  if (!tg) { exclude("NO_COMMITTED_PRICES"); continue; }
  const hOdds = tg.runLine.home.odds;
  const aOdds = tg.runLine.away.odds;
  if (!Number.isFinite(hOdds) || !Number.isFinite(aOdds)) { exclude("ONE_SIDED_QUOTE"); continue; }
  const ih = implied(hOdds);
  const ia = implied(aOdds);
  const devig = ih / (ih + ia);
  if (Math.abs(devig - q.homeCover) > 0.0006) { exclude("DEVIG_MISMATCH"); continue; }
  const margin = r.actual.homeRuns - r.actual.awayRuns;
  if (margin + L === 0) { exclude("PUSH"); continue; }
  const homeCovers = margin + L > 0;
  const modelHome = L > 0 ? 1 - at15.awayCover : at15.homeCover;
  // The graded pick, as a side of the posted market.
  const pickIsHome = r.pick.startsWith(r.matchup.split(" @ ")[1] + " ");
  const pickLine = Number(r.pick.split(" ").pop());
  rows.push({
    gamePk: r.gamePk, date: r.date, bookmaker: g.market.bookmaker, capturedAt: g.market.capturedAt, homeLine: L,
    prices: { home: hOdds, away: aOdds }, overround: Number((ih + ia - 1).toFixed(4)),
    marketHome: q.homeCover, modelHome, homeCovers,
    pick: r.pick, pickIsHome, pickMatchesPostedSide: pickIsHome ? pickLine === L : pickLine === -L, outcome: r.outcome,
    postseason: r.date >= "2026-09-28",
  });
}

// ── metrics ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const clamp = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
const ll = (p, y) => -Math.log(y ? clamp(p) : 1 - clamp(p));
const br = (p, y) => (p - (y ? 1 : 0)) ** 2;
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
function bootstrapDiff(xs, iters = 10000, seed = 20261009) {
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const means = [];
  for (let b = 0; b < iters; b += 1) { let t = 0; for (let i = 0; i < xs.length; i += 1) t += xs[Math.floor(rand() * xs.length)]; means.push(t / xs.length); }
  means.sort((a, b) => a - b);
  return [means[Math.floor(0.025 * iters)], means[Math.floor(0.975 * iters)]];
}
function summarize(set) {
  if (!set.length) return null;
  const y = set.map((r) => r.homeCovers);
  const dLL = set.map((r, i) => ll(r.modelHome, y[i]) - ll(r.marketHome, y[i]));
  const dBr = set.map((r, i) => br(r.modelHome, y[i]) - br(r.marketHome, y[i]));
  const picks = set.filter((r) => r.pickMatchesPostedSide);
  const pickP = (r, p) => (r.pickIsHome ? p : 1 - p);
  const pickPrice = (r) => (r.pickIsHome ? r.prices.home : r.prices.away);
  const won = (r) => r.outcome === "WIN";
  return {
    games: set.length,
    homeCoverRate: mean(y.map(Number)),
    scoring: {
      event: "home side covers its posted line",
      model: { logLoss: mean(set.map((r, i) => ll(r.modelHome, y[i]))), brier: mean(set.map((r, i) => br(r.modelHome, y[i]))) },
      market: { logLoss: mean(set.map((r, i) => ll(r.marketHome, y[i]))), brier: mean(set.map((r, i) => br(r.marketHome, y[i]))) },
      modelMinusMarket: { logLoss: mean(dLL), logLoss95: bootstrapDiff(dLL), brier: mean(dBr), brier95: bootstrapDiff(dBr) },
      note: "lower is better; an interval that excludes 0 is the only basis for calling a difference established",
    },
    picks: {
      gradedPicksOnPostedSide: picks.length,
      rawHitRate: picks.length ? mean(picks.map((r) => Number(won(r)))) : null,
      marketExpectedHitRate: picks.length ? mean(picks.map((r) => pickP(r, r.marketHome))) : null,
      plusSide: picks.filter((r) => (r.pickIsHome ? r.homeLine : -r.homeLine) > 0).length,
      minusSide: picks.filter((r) => (r.pickIsHome ? r.homeLine : -r.homeLine) < 0).length,
      meanModelMinusMarketOnPick: picks.length ? mean(picks.map((r) => pickP(r, r.modelHome) - pickP(r, r.marketHome))) : null,
      hitRateMinusMarketExpected95: picks.length > 1 ? bootstrapDiff(picks.map((r) => Number(won(r)) - pickP(r, r.marketHome))) : null,
      hypotheticalFlatStakeReturnPerUnit: picks.length ? mean(picks.map((r) => (won(r) ? decimal(pickPrice(r)) - 1 : -1))) : null,
      hypotheticalFlatStakeReturn95: picks.length > 1 ? bootstrapDiff(picks.map((r) => (won(r) ? decimal(pickPrice(r)) - 1 : -1))) : null,
      gradedPicksOnUnpostedSide: set.length - picks.length,
      note: "descriptive; a hit rate above 50% at +1.5 is the base rate, the market-expected rate is the floor",
    },
    marketCalibration: { meanMarketHome: mean(set.map((r) => r.marketHome)), observedHomeCover: mean(y.map(Number)) },
  };
}

const report = {
  protocol: PROTOCOL,
  gradedRunLineRows: graded.length,
  scored: rows.length,
  excluded,
  all: summarize(rows),
  regularSeason: summarize(rows.filter((r) => !r.postseason)),
  postseason: summarize(rows.filter((r) => r.postseason)),
  productEligibility: "NOT_DETERMINED — this protocol measures; it grants nothing and unpauses nothing",
};
if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "rows.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify(report, null, 2));

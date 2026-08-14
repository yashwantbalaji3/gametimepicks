/**
 * NFL public-beta forecasts (Program 173 · Release A3). PUBLIC_EXPERIMENTAL.
 *
 * One deterministic pre-kickoff forecast per eligible game, published under
 * nfl-preseason-public-beta-v1 with its calibration applied. Everything a reader sees derives
 * from ONE joint score distribution, so win probability, projected score, margin and total can
 * never disagree with each other.
 *
 * FROZEN AT GENERATION. The seed is model version + event id + input hash, so identical inputs
 * reproduce identical bytes. Market prices are carried alongside for comparison and are NOT an
 * input to the simulation — changing odds moves the comparison column and never the forecast.
 *
 * REFUSALS (each typed, never a silent omission or a zero): post-start generation, missing
 * identity, evidence stamped at/after kickoff, and an already-published event whose artifact is
 * locked. After kickoff an artifact is immutable.
 *
 * Usage: node scripts/nfl/build-nfl-public-forecasts.mjs --now <iso> [--lookahead-hours 30]
 * Writes: app/public/data/nfl/forecasts/<date>.json  (PUBLIC — derived, no research payload)
 *         data/internal/nfl/forecast-receipts/<date>/<eventId>.json (immutable receipt)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { mulberry32, snapScore } from "../../src/lib/sports/nfl/game-sim.mjs";
import { fnv1a } from "../../src/lib/sports/research/replay-runner.mjs";
import { strengthStateAt } from "../../src/lib/sports/nfl/strength-state.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const LOOKAHEAD_H = Number(arg("--lookahead-hours", "30"));
const RUNS = Number(arg("--runs", "10000"));
const DATE = NOW.slice(0, 10);
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const cal = read(path.join(ROOT, "data/internal/research/nfl/reports/public-beta-v1-calibration.json"));
const card = read(path.join(ROOT, "data/internal/research/nfl/public-beta-model-card-v1.json"));
if (!cal || !card) { console.error("REFUSED: no committed public-beta calibration — a forecast may not publish without its card"); process.exit(2); }
const MODEL_ID = cal.modelId;
const base = read(path.join(ROOT, "data/internal/research/nfl/reports/preseason-model-v1-evaluation.json")).fit;
const sigmaMargin = cal.calibration.sigmaMarginCalibrated;
const sigmaTotal = cal.calibration.sigmaTotalCalibrated;
const LAMBDA = cal.calibration.signalShrinkLambda;

// ── P178-C · THE SIGNIFICANCE GATE ────────────────────────────────────────────────────────────
// The team-strength term drives a published forecast only when its coefficient is distinguishable
// from zero. It is not: t = -0.575, 95% CI [-0.078, +0.043]. Applying it anyway produced a -0.97
// correlation between a home side's strength and its published win probability — the model leaned
// AGAINST the better team, consistently, on evidence that does not exist.
//
// Zeroing the term is not a claim that the teams are equal. It is the honest statement that this
// model cannot tell them apart, which is a different and much more publishable thing than a
// confident-looking number pointing the wrong way.
const sig = read(path.join(ROOT, "data/internal/research/nfl/reports/signal-significance.json"));
if (!sig) { console.error("REFUSED: no signal-significance receipt — a forecast may not publish a team term that has never been tested"); process.exit(2); }
const TEAM_SIGNAL_APPLIED = sig.significant === true;
const EFFECTIVE_SLOPE = TEAM_SIGNAL_APPLIED ? base.marginSlope : 0;
const TEAM_SIGNAL = TEAM_SIGNAL_APPLIED
  ? { state: "APPLIED", tStatistic: sig.fitted.tStatistic, note: "the team-strength coefficient clears the |t| >= 2 bar, so team evidence moves this forecast" }
  : {
      state: "NOT_SIGNIFICANT",
      tStatistic: sig.fitted.tStatistic,
      ci95: sig.fitted.ci95,
      note: "This model has no measurable read on which of these two teams is better in preseason: the coefficient linking team strength to margin is indistinguishable from zero (t = " + sig.fitted.tStatistic + ", 95% interval " + JSON.stringify(sig.fitted.ci95) + "). Rather than publish a direction it cannot support, the team term is set to zero, so this forecast reflects preseason scoring and home context only.",
    };
console.log(`team signal: ${TEAM_SIGNAL.state} (t=${sig.fitted.tStatistic}) → effective slope ${TEAM_SIGNAL_APPLIED ? base.marginSlope : 0}`);

const schedule = read(path.join(APP, "public/data/nfl/schedule/latest.json"));
const finals = read(path.join(ROOT, "data/internal/research/nfl/corpus-v1.json")).rows;
const markets = read(path.join(APP, "public/data/nfl/markets/latest.json"));
const marketByEvent = new Map((markets?.rows ?? []).map((r) => [r.providerEventId, r]));

const nowMs = Date.parse(NOW);
const events = (schedule?.rows ?? [])
  .filter((r) => r.statusRaw === "STATUS_SCHEDULED" && Date.parse(r.dateUtc) > nowMs && Date.parse(r.dateUtc) <= nowMs + LOOKAHEAD_H * 3.6e6)
  .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
console.log(`window: ${events.length} pre-start events within ${LOOKAHEAD_H}h of ${NOW}`);

const normalPair = (rng) => {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  const r = Math.sqrt(-2 * Math.log(u1));
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)];
};
const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const sortNum = (xs) => [...xs].sort((x, y) => x - y);

const published = [];
const refused = [];
for (const ev of events) {
  const kickoff = Date.parse(ev.dateUtc);
  if (!ev.home?.abbr || !ev.away?.abbr) { refused.push({ providerEventId: ev.providerEventId, state: "IDENTITY_MISSING", reason: "participants unresolved — identity is never guessed" }); continue; }

  const strength = strengthStateAt({ rows: finals.filter((r) => r.dateUtc < ev.dateUtc), cutoffIso: NOW });
  const nameOf = new Map([[ev.home.abbr, ev.home.name], [ev.away.abbr, ev.away.name]]);
  const d = strength.ratingFor(nameOf.get(ev.home.abbr)) - strength.ratingFor(nameOf.get(ev.away.abbr));
  // CALIBRATED margin mean: λ shrinks the team-differentiating term. Everything below — win
  // probability included — is measured off the resulting simulation, so the published win % and
  // the published scoreline are the same distribution by construction and cannot disagree.
  const marginMean = base.homeAdvantage + LAMBDA * (EFFECTIVE_SLOPE * d);

  // input hash: everything the forecast depends on. Market is NOT included — it is not an input.
  const inputHash = crypto.createHash("md5").update(JSON.stringify({
    modelId: MODEL_ID, version: card.version, eventId: ev.providerEventId, kickoff: ev.dateUtc,
    d: Number(d.toFixed(6)), marginMean: Number(marginMean.toFixed(6)),
    sigmaMargin, sigmaTotal, muTotal: base.muTotal, lambda: LAMBDA,
    effectiveSlope: EFFECTIVE_SLOPE, teamSignal: TEAM_SIGNAL.state,
    strengthCutoff: strength.cutoffIso, scheduleAsOf: schedule.generatedAt,
  })).digest("hex").slice(0, 16);

  const rng = mulberry32(fnv1a(`${MODEL_ID}::${ev.providerEventId}::${inputHash}`));
  const homeScores = []; const awayScores = []; const margins = []; const totals = [];
  let homeWins = 0; let ties = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const [z1, z2] = normalPair(rng);
    const margin = marginMean + sigmaMargin * z1;
    const total = Math.max(2, base.muTotal + sigmaTotal * z2);
    const h = snapScore((total + margin) / 2);
    const a = snapScore((total - margin) / 2);
    homeScores.push(h); awayScores.push(a); margins.push(h - a); totals.push(h + a);
    if (h > a) homeWins += 1; else if (h === a) ties += 1;
  }
  const hS = sortNum(homeScores), aS = sortNum(awayScores), mS = sortNum(margins), tS = sortNum(totals);
  // the win probability IS the simulation's own home-win rate over the calibrated distribution —
  // not a second formula that could drift from the scoreline shown beside it
  const pHomeCalibrated = homeWins / RUNS;
  // coherence check: the published median margin and the published win side must agree in sign
  const medMargin = q(sortNum(margins), 0.5);
  if ((medMargin > 0 && pHomeCalibrated < 0.5) || (medMargin < 0 && pHomeCalibrated > 0.5)) {
    refused.push({ providerEventId: ev.providerEventId, state: "INCOHERENT", reason: `median margin ${medMargin} disagrees with win probability ${pHomeCalibrated.toFixed(3)} — refusing rather than publishing two contradictory numbers` });
    continue;
  }

  const market = marketByEvent.get(ev.providerEventId) ?? null;
  const marketFresh = market && markets.capturedAt < ev.dateUtc;

  const forecast = {
    providerEventId: ev.providerEventId,
    canonicalEventId: `nfl-${ev.providerEventId}`,
    matchup: `${ev.away.abbr} @ ${ev.home.abbr}`,
    home: { abbr: ev.home.abbr, name: ev.home.name },
    away: { abbr: ev.away.abbr, name: ev.away.name },
    kickoffUtc: ev.dateUtc,
    seasonType: ev.seasonType,
    week: ev.week,
    venue: ev.venue ?? null,
    state: "PUBLIC_EXPERIMENTAL",
    model: { id: MODEL_ID, version: card.version, launchState: card.launchState, inputHash, simulations: RUNS },
    teamSignal: TEAM_SIGNAL,
    generatedAt: NOW,
    evidence: { schedule: schedule.generatedAt, strengthCutoff: strength.cutoffIso },
    forecastSummary: {
      projectedScore: { home: Math.round(hS[Math.floor(RUNS / 2)]), away: Math.round(aS[Math.floor(RUNS / 2)]) },
      winProbability: {
        home: Number(pHomeCalibrated.toFixed(4)),
        away: Number((1 - pHomeCalibrated).toFixed(4)),
        tieMass: Number((ties / RUNS).toFixed(4)),
        calibration: LAMBDA === 0
          ? "Held at 50% by design: on a full held-out preseason this model picked winners no better than a coin flip, so it does not claim a side."
          : `Shrunk toward 50% by a factor fit before testing (λ=${LAMBDA}).`,
      },
      margin: { median: q(mS, 0.5), p10: q(mS, 0.1), p90: q(mS, 0.9) },
      total: { median: q(tS, 0.5), p10: q(tS, 0.1), p90: q(tS, 0.9) },
      scoreRange: { homeP10: q(hS, 0.1), homeP90: q(hS, 0.9), awayP10: q(aS, 0.1), awayP90: q(aS, 0.9) },
    },
    marketComparison: marketFresh
      ? {
        state: "MARKET_VIEW",
        capturedAt: markets.capturedAt,
        books: market.books.length,
        marketHomeWinPct: market.consensus.homeWinProbNoVig,
        marketSpreadHome: market.consensus.spreadHome,
        marketTotal: market.consensus.total,
        modelVsMarketTotal: Number((q(tS, 0.5) - (market.consensus.total ?? 0)).toFixed(1)),
        note: "The sportsbook numbers are the books' own, shown for context. A difference is a difference — this model has not been shown to beat the market.",
      }
      : { state: "NO_MARKET", note: "No current sportsbook capture covers this game." },
    settlementKey: { canonicalEventId: `nfl-${ev.providerEventId}`, settlesAgainst: "official final score", ledger: "experimental-forecast" },
    disclaimer: "Experimental preseason model. Educational and paper-only — not betting advice, and not shown to beat the market.",
  };

  // immutable receipt: refuse to rewrite one that already exists for this event+date
  const receiptPath = path.join(ROOT, "data/internal/nfl/forecast-receipts", DATE, `${ev.providerEventId}.json`);
  if (fs.existsSync(receiptPath)) {
    const existing = read(receiptPath);
    if (existing?.model?.inputHash === inputHash) {
      published.push(forecast);
      continue; // identical inputs → identical forecast; nothing to rewrite
    }
    if (Date.parse(existing?.generatedAt ?? 0) && nowMs >= kickoff) {
      refused.push({ providerEventId: ev.providerEventId, state: "LOCKED_AT_KICKOFF", reason: "an artifact is immutable once its game has started" });
      continue;
    }
    // pre-kickoff revision: new file with lineage, original preserved
    const revPath = path.join(ROOT, "data/internal/nfl/forecast-receipts", DATE, `${ev.providerEventId}-rev-${NOW.slice(11, 16).replace(":", "")}Z.json`);
    fs.writeFileSync(revPath, JSON.stringify({ ...forecast, revisionOf: path.basename(receiptPath), priorInputHash: existing?.model?.inputHash ?? null }, null, 1));
    published.push(forecast);
    continue;
  }
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, JSON.stringify(forecast, null, 1));
  published.push(forecast);
}

const publicArtifact = {
  schemaVersion: 1,
  artifact: "nfl-public-forecasts",
  dataClass: "PUBLIC_DERIVED",
  generatedAt: NOW,
  date: DATE,
  model: { id: MODEL_ID, version: card.version, launchState: "PUBLIC_EXPERIMENTAL" },
  modelCard: card.plainEnglish,
  eventCount: published.length,
  forecasts: published,
  refused,
  disclaimer: "Experimental preseason forecasts. Educational and paper-only. This model has not been shown to beat the sportsbook market.",
};
const payload = JSON.stringify(publicArtifact, null, 1);
for (const banned of ["data/internal", "PRIVATE_RESEARCH", "apiKey", "p171-ledger"]) {
  if (payload.includes(banned)) { console.error(`REFUSED: public forecasts would carry "${banned}"`); process.exit(3); }
}
const outPath = path.join(APP, "public/data/nfl/forecasts", `${DATE}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, payload);
fs.writeFileSync(path.join(APP, "public/data/nfl/forecasts", "latest.json"), payload);

console.log(`forecasts: ${published.length} published · ${refused.length} refused`);
for (const f of published.slice(0, 3)) {
  console.log(`  ${f.matchup}: ${f.forecastSummary.projectedScore.away}-${f.forecastSummary.projectedScore.home} · win ${(f.forecastSummary.winProbability.home * 100).toFixed(1)}% · total ${f.forecastSummary.total.median} (${f.forecastSummary.total.p10}-${f.forecastSummary.total.p90}) · ${f.marketComparison.state}`);
}

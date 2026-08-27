#!/usr/bin/env node
/**
 * BUILD EPL FORECASTS — the missing end of the EPL chain.
 *
 * Capture, evaluate, replay and simulate all existed; nothing turned fixtures + odds + strength into
 * a published prediction. NFL has build-nfl-forecasts and UFC has its preflight; EPL had no
 * equivalent, so the engine priced fixtures correctly and the output reached no artifact and no
 * surface. That is the same orphaned shape as the UFC de-vig path, one layer further out.
 *
 *   node scripts/epl/build-epl-forecasts.mjs --now <iso> [--lookahead-hours 96] [--write]
 *
 * Writes data/internal/research/epl/forecasts/<date>.json + latest.json (PRIVATE research). Public
 * activation stays OFF on every row — this publishes the RUN, not a recommendation.
 *
 * Every state the ladder can reach is emitted with its reason. A fixture that cannot price is listed
 * as READY_EXCEPT_ODDS or ABSTAIN rather than dropped, because a forecast set that silently contains
 * only its successes misrepresents the slate it claims to cover.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fitEplStrength } from "../../src/lib/sports/epl/strength-state.mjs";
import { loadEplCorpus } from "../../src/lib/sports/epl/corpus.mjs";
import { loadEplGradedRecord } from "../../src/lib/sports/epl/graded-record.ts";
import { runEplShadow } from "../../src/lib/sports/epl/shadow-run.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now", new Date().toISOString());
const LOOKAHEAD_H = Number(arg("--lookahead-hours", "96"));
const WRITE = process.argv.includes("--write");
if (!Number.isFinite(Date.parse(NOW))) { console.error("usage: build-epl-forecasts.mjs --now <iso>"); process.exit(1); }

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const EPL = path.join(APP, "public/data/soccer/epl");

/*
 * THE NEWEST CAPTURE, sorted — not `readdir().find()`, which returns whatever the filesystem lists
 * first and in practice returned `capture-2026-27-2026-08-09T2245.json`. Every EPL forecast this
 * repository has published was built from an EIGHTEEN-DAY-OLD fixture list.
 *
 * It was not a cosmetic staleness. The kickoff time is part of the canonical eventId, so all ten
 * matchweek-2 rows carried `…:20260829t1400` — one fabricated slot for fixtures that actually run
 * Aug 28 19:00, Aug 29 11:30/14:00/16:30 and Aug 30 13:00/15:30. Crystal Palace v Manchester City
 * kicks off the DAY BEFORE the time its own forecast claimed, so a freeze-before-kickoff check
 * would have passed on a match already played, and settlement would have joined by an id no
 * official result carries.
 *
 * Every other consumer of this directory already sorts (lane status, odds capture, forward
 * coverage, current results). This was the one that did not.
 */
const capFile = fs.readdirSync(path.join(EPL, "fixtures"))
  .filter((f) => f.startsWith("capture-") && f.endsWith(".json"))
  .sort()
  .at(-1);
if (!capFile) { console.error("no committed season capture — nothing to forecast"); process.exit(2); }
console.log(`fixtures: ${capFile}`);
const season = readJson(path.join(EPL, "fixtures", capFile));

/* Odds are OPTIONAL by design: without them every fixture lands on READY_EXCEPT_ODDS with its reason
   stated, which is honest. Absent odds must never become approximated odds. */
const oddsPath = path.join(EPL, "odds", "latest.json");
const oddsSnapshot = fs.existsSync(oddsPath) ? readJson(oddsPath) : null;

/*
 * BASE + THIS SEASON. Previously this read corpus-v1.json alone — a static file ending 2026-05-24 —
 * so every forecast all season would have been fit on data that stopped before the season started,
 * and no match the model predicted ever came back to inform it.
 *
 * fitEplStrength still takes cutoffIso: NOW, so a settled result can sit in the corpus the instant
 * it is graded without any risk of a fixture informing its own forecast. A forecast is built before
 * kickoff; the match it describes has not happened.
 */
const corpus = loadEplCorpus(REPO);
/* Cutoff at NOW: the fit may never see a result from a match it is about to forecast. */
const strengthState = fitEplStrength({ rows: corpus.rows, cutoffIso: NOW });
console.log(`corpus: ${corpus.base} historical + ${corpus.current} from ${corpus.currentSeason ?? "the current season"} = ${corpus.rows.length} matches (fit cutoff ${NOW})`);

const nowMs = Date.parse(NOW);
const upcoming = (season.rows ?? []).filter((f) => {
  const k = Date.parse(f.kickoffIso ?? "");
  return Number.isFinite(k) && k > nowMs && k <= nowMs + LOOKAHEAD_H * 3600_000;
});

/*
 * The per-fixture page needs a URL-safe identifier, and `eventId` is not one — it is
 * "soccer:epl:arsenal-v-coventry-city:20260821t1900", colons and all. The slug is derived from the
 * SAME fields as the canonical id (both clubs + the kickoff date) so the two cannot describe
 * different fixtures, and a collision REFUSES the run rather than letting two matches share a page.
 * The EPL cannot produce a same-day repeat of one pairing, so a collision here means an identity
 * defect upstream, which is exactly the case P043 ruled must fail closed on both sides.
 */
const slugify = (v) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const fixtureSlug = (f) => `${slugify(f.homeClub)}-v-${slugify(f.awayClub)}-${String(f.kickoffIso ?? "").slice(0, 10)}`;

const rows = upcoming.map((fixture) => {
  const out = runEplShadow({ fixture, nowIso: NOW, strengthState, oddsSnapshot });
  return {
    eventId: fixture.eventId,
    matchup: `${fixture.homeClub} v ${fixture.awayClub}`,
    homeClub: fixture.homeClub,
    awayClub: fixture.awayClub,
    slug: fixtureSlug(fixture),
    kickoffUtc: fixture.kickoffIso,
    matchweek: fixture.matchweek ?? null,
    state: out.state,
    rule: out.rule ?? null,
    reason: out.reason ?? null,
    /*
     * The model's own probabilities live at artifact.model.probs — NOT artifact.threeWay, which does
     * not exist. My first version read the wrong path and published nine rows stamped
     * CURRENT_PRE_EVENT with `threeWay: null`: a forecast set asserting it had predicted, carrying
     * no prediction. Nothing failed, because a missing field reads exactly like a quiet one.
     */
    model: out.artifact?.model ? { ...out.artifact.model } : null,
    /*
     * THE MARKET BASELINE, PERSISTED — PRIVATE ROWS ONLY.
     *
     * This kept `books` and `impliedSum` and threw the de-vigged probabilities away. They exist for
     * a moment inside runEplShadow and were never written down, which made one question permanently
     * unanswerable after the fact: is this model better than the price it was standing next to?
     *
     * That is not a nice-to-have. It is the question that decided MLB — where the model turned out
     * to add nothing beyond the market, three times, and R&D was suspended on a stopping rule. A
     * learning loop that cannot ask it can only ever measure a model against itself and will happily
     * report improvement while losing to a closing line.
     *
     * It has to be recorded AT FORECAST TIME. Re-deriving it later from whatever odds file happens
     * to be on disk compares the model to a price that did not exist when it spoke — the rot that
     * date-pinned fixtures keep teaching this repository.
     *
     * PRIVATE ONLY. Paid capture never reaches a public artifact: publicRows below selects explicit
     * fields and market is not among them, and the odds sweep keeps captures out of out/data.
     */
    market: out.artifact?.market
      ? {
          books: out.artifact.market.bookmakers.length,
          impliedSum: out.artifact.market.bookmakers[0]?.impliedSum ?? null,
          // De-vigged across the whole three-way set, as captured. Sums to 1 by construction.
          noVig: out.artifact.market.bookmakers[0]?.noVig ?? null,
        }
      : null,
    publicActivation: "OFF",
  };
});

/*
 * A CURRENT_PRE_EVENT row without probabilities is not a forecast, and shipping one is worse than
 * shipping nothing — it looks like coverage. Refuse the whole set rather than persist it.
 */
const hollow = rows.filter((r) => r.state === "CURRENT_PRE_EVENT" && !r.model?.probs);
if (hollow.length > 0) {
  console.error(`REFUSED — ${hollow.length} row(s) claim CURRENT_PRE_EVENT while carrying no probabilities: ${hollow.map((r) => r.matchup).join(", ")}`);
  process.exit(3);
}

/* Two fixtures resolving to one page is an identity defect; publish neither rather than the wrong one. */
const bySlug = new Map();
for (const r of rows) bySlug.set(r.slug, [...(bySlug.get(r.slug) ?? []), r.eventId]);
const collisions = [...bySlug].filter(([, ids]) => ids.length > 1);
if (collisions.length > 0) {
  console.error(`REFUSED — slug collision: ${collisions.map(([sl, ids]) => `${sl} ← ${ids.join(" + ")}`).join("; ")}`);
  process.exit(4);
}
const unslugged = rows.filter((r) => !/^[a-z0-9-]+-v-[a-z0-9-]+-\d{4}-\d{2}-\d{2}$/.test(r.slug));
if (unslugged.length > 0) {
  console.error(`REFUSED — ${unslugged.length} row(s) produced an unusable slug: ${unslugged.map((r) => `${r.matchup} → "${r.slug}"`).join("; ")}`);
  process.exit(5);
}

const counts = {};
for (const r of rows) counts[r.state] = (counts[r.state] ?? 0) + 1;

const artifact = {
  schemaVersion: 1,
  artifact: "epl-forecast-set",
  dataClass: "PRIVATE_RESEARCH",
  public: false,
  competition: "epl",
  generatedAt: NOW,
  lookaheadHours: LOOKAHEAD_H,
  oddsCapturedAt: oddsSnapshot?.capturedAt ?? null,
  fixturesConsidered: upcoming.length,
  counts,
  /* Named so a reader can see WHY a fixture is absent from the priced set. */
  rows,
  note: "Forecast distributions only. publicActivation is OFF on every row; nothing here is a recommendation.",
};

/*
 * THE PUBLIC VIEW.
 *
 * The private artifact above is the full research record. This is the reader's copy, and it carries
 * the limitation WITH each number rather than in a footer a later edit can drop: no EPL match has
 * ever been graded under this model, so there is no track record and nothing here is a pick.
 *
 * Deliberately absent: any pick, confidence, rating, or comparison to a price. The distribution IS
 * the product. A cold-start club is flagged on the row it affects, not summarised away.
 */
const publicRows = rows.map((r) => ({
  eventId: r.eventId,
  matchup: r.matchup,
  homeClub: r.homeClub,
  awayClub: r.awayClub,
  slug: r.slug,
  kickoffUtc: r.kickoffUtc,
  matchweek: r.matchweek,
  state: r.state,
  /* A fixture we could not price says so, with its reason, instead of vanishing from the list. */
  unavailableReason: r.state === "CURRENT_PRE_EVENT" ? null : (r.reason ?? r.rule ?? "not priced"),
  probs: r.model?.probs ?? null,
  expectedGoals: r.model?.totals?.expected ?? null,
  over25: r.model?.totals?.over25 ?? null,
  coldStart: r.model?.coldStart ?? null,
  /*
   * THE DISTRIBUTION IS THE PRODUCT, so the reader gets the distribution — not a five-number
   * summary of one. Every field here is an exact sum over the same grid that produced `probs`
   * above, which is what lets a per-fixture page show a scoreline table, a totals ladder and each
   * side's goal curve without a second derivation that could drift from the headline numbers.
   *
   * Still deliberately absent, and this does not change with volume: any pick, rating, confidence,
   * or comparison against a price. A richer readout of a model that has graded ZERO matches must
   * not start reading as evidence the model is right — which is why `validation` and `trackRecord`
   * below stay on the artifact and the page prints them beside the numbers.
   */
  lambdas: r.model?.lambdas ?? null,
  totals: r.model?.totals ?? null,
  teamGoals: r.model?.teamGoals ?? null,
  btts: r.model?.btts ?? null,
  cleanSheet: r.model?.cleanSheet ?? null,
  doubleChance: r.model?.doubleChance ?? null,
  margin: r.model?.margin ?? null,
  topScorelines: r.model?.topScorelines ?? null,
  topScorelinesMass: r.model?.topScorelinesMass ?? null,
  modelId: r.model?.modelId ?? null,
}));

/**
 * What may honestly be said about this model's record, from the ledger and nothing else.
 *
 * Deliberately refuses to quote an accuracy figure at any sample size this function can see. A hit
 * rate over a handful of matches is noise with a percent sign on it, and putting one here would be
 * read as a claim no matter how it were hedged.
 */
function trackRecordSentence() {
  const rec = loadEplGradedRecord();
  if (rec == null) {
    return "The graded record could not be read, so no accuracy claim is made here.";
  }
  const n = rec.team.matches;
  if (n === 0) {
    return "No Premier League match has been graded under this model. There is no win/loss record, no accuracy figure, and no track record to cite.";
  }
  return `${n} Premier League match${n === 1 ? " has" : "es have"} been graded under this model — far too few to support any accuracy claim. ` +
    "No win rate or accuracy figure is quoted, and this model has not been validated out of sample.";
}

const publicArtifact = {
  schemaVersion: 1,
  artifact: "epl-forecast-public",
  dataClass: "FORECAST_PUBLIC",
  public: true,
  competition: "epl",
  generatedAt: NOW,
  oddsCapturedAt: oddsSnapshot?.capturedAt ?? null,
  counts,
  /*
   * These two strings are the contract with the reader. A guard pins them.
   *
   * trackRecord USED TO SAY "No Premier League match has been graded under this model." That was
   * true when it was written and stopped being true on 2026-08-21, when Arsenal v Coventry City was
   * settled — a sentence hard-coded into an artifact that a settler was quietly making false. It is
   * now derived from the ledger, and the derivation is what keeps it honest in BOTH directions: it
   * cannot understate a growing record, and it cannot let a growing record read as validation.
   *
   * validation stays NOT_VALIDATED_OUT_OF_SAMPLE regardless of the count, because no number of
   * graded matches on this line is a validation. That is the calibration stage — a preregistered
   * backtest against a market baseline — and it is UNPROVEN for this competition.
   */
  validation: "NOT_VALIDATED_OUT_OF_SAMPLE",
  trackRecord: trackRecordSentence(),
  note: "Model distributions only — not picks, not advice, and not compared against a price.",
  rows: publicRows,
};

const date = NOW.slice(0, 10);
const outDir = path.join(REPO, "data/internal/research/epl/forecasts");
if (WRITE) {
  fs.mkdirSync(outDir, { recursive: true });
  const payload = JSON.stringify(artifact, null, 1) + "\n";
  fs.writeFileSync(path.join(outDir, `${date}.json`), payload);
  fs.writeFileSync(path.join(outDir, "latest.json"), payload);
  /*
   * ── AN IMMUTABLE SNAPSHOT PER RUN ──────────────────────────────────────────────────────────────
   *
   * The dated file is OVERWRITTEN by every run on that day, so the revision that existed before a
   * fixture kicked off is destroyed by the next run a few hours later. The grader needs the latest
   * PRE-KICKOFF forecast, and after 11:30 there is no longer one on disk for an 11:30 kickoff — only
   * an afternoon rewrite it must reject, and last night's file it falls back to.
   *
   * That is not hypothetical. Hull City v Manchester United kicked off at 11:30 on 2026-08-22 with a
   * forecast written at 11:18. It was graded against the 23:51 forecast from the night before, which
   * predates the market-baseline field entirely — so the one comparison the learning loop exists to
   * make came out "no baseline recorded" for a match the model called and the market did not.
   *
   * The player projections have written immutable snapshots all along. The team forecasts, which are
   * the thing actually graded, did not.
   */
  const stamp = `${NOW.slice(0, 4)}${NOW.slice(5, 7)}${NOW.slice(8, 10)}${NOW.slice(11, 13)}${NOW.slice(14, 16)}`;
  fs.writeFileSync(path.join(outDir, `snapshot-${stamp}.json`), payload);

  const pubDir = path.join(EPL, "forecasts");
  fs.mkdirSync(pubDir, { recursive: true });
  const pubPayload = JSON.stringify(publicArtifact, null, 1) + "\n";
  fs.writeFileSync(path.join(pubDir, "latest.json"), pubPayload);
  fs.writeFileSync(path.join(pubDir, `${date}.json`), pubPayload);
}

for (const r of rows) console.log(`  ${r.state.padEnd(18)} ${r.matchup}${r.threeWay ? ` · H ${r.threeWay.H} D ${r.threeWay.D} A ${r.threeWay.A}` : ""}`);
console.log(`\n${upcoming.length} fixture(s) in the next ${LOOKAHEAD_H}h · ${JSON.stringify(counts)}`);
console.log(WRITE ? `wrote ${path.relative(REPO, outDir)}/${date}.json + latest.json` : "dry run — pass --write to persist.");

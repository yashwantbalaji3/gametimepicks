/**
 * DETERMINISTIC EVIDENCE FOR THE CASES WHOSE POLICY MUST NOT DEPEND ON TONIGHT'S SLATE.
 *
 * The golden eval reads the PUBLISHED assets on purpose: most cases are about the real tool layer over
 * real data, and a fixture there would measure the fixture. But a few cases test a POLICY that needs a
 * particular shape of evidence to be exercised at all, and production data is not obliged to have it.
 *
 * ⚠ mut-18, 2026-09-27. "The writer presents a paused market as a pick" needs a paused market in the
 * evidence. The night the projection carried no MLB forecast, there was none, the verifier's pause
 * check had no subject, and the case failed — not because the policy regressed, but because the slate
 * moved. A policy test whose subject can disappear with the calendar is not a test of the policy.
 *
 * So these cases overlay a small, fixed asset on the published tree — ONLY the asset named here, every
 * other read still goes to the published export — through the loader's own `fixtureFetchText`
 * transport. Each fixture exists to put one evidence shape in front of the real planner → executor →
 * evidence → writer → verifier pipeline. They are eval inputs, never published, never read by the app.
 *
 * Ids are prefixed `fixture-` and the matchups are generic so no fixture can be mistaken for a real
 * forecast in a receipt or a log.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FORECASTS = "/data/ask/v1/forecasts.json";
const PARLAYS = "/data/ask/v1/parlays.json";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const frozen = (name) => JSON.parse(fs.readFileSync(path.join(HERE, "fixtures", name), "utf8"));
const COVERAGE = "/data/ask/v1/coverage.json";
/** The eval's pinned product date (eval.mjs NOW is 2026-09-17 21:00 ET). */
export const EVAL_DAY = "2026-09-17";
/** Move a frozen parlay projection's day to another date (the slips are unchanged). */
const redate = (doc, from, to) => ({ ...doc, dates: (doc.dates ?? []).map((d) => (d === from ? to : d)), byDate: Object.fromEntries(Object.entries(doc.byDate ?? {}).map(([d, v]) => [d === from ? to : d, v])) });
/** Relabel every leg into a family the coverage registry does not demote — SYNTHETIC, for writer-grounding cases. */
const syntheticEligible = (doc) => ({ ...doc, byDate: Object.fromEntries(Object.entries(doc.byDate).map(([d, day]) => [d, { ...day,
  profiles: Object.fromEntries(Object.entries(day.profiles ?? {}).map(([p, slips]) => [p, slips.map((s) => ({ ...s,
    legs: s.legs.map((l) => ({ ...l, market: "synthetic_eligible_family", marketLabel: "Synthetic eligible family" })) }))])) }])) });

const RESULTS = "/data/ask/v1/results.json";
/** A results asset carrying only frozen Results V2 days, each moved to a new date. Nothing inside a day changes. */
const resultsDoc = (moves) => ({
  schemaVersion: 1, artifact: "ask-results", available: true, cells: [], headline: {}, recent: {}, excluded: [],
  days: frozen("results-days-2026-09-30.json").days.filter((d) => moves[d.date]).map((d) => ({ ...d, date: moves[d.date] })),
});

const forecastsDoc = (forecasts) => ({
  schemaVersion: 1,
  artifact: "ask-forecasts",
  count: forecasts.length,
  eligibleSports: ["mlb", "nfl", "epl"],
  forecasts,
});

export const EVAL_FIXTURES = Object.freeze({
  /* One MLB game: a PUBLISHED moneyline pick beside a PAUSED Over/Under — the shape the pause rule needs. */
  "paused-market": {
    [FORECASTS]: forecastsDoc([
      {
        forecastId: "fixture-mlb-paused",
        sport: "mlb",
        gameId: "fixture-mlb-paused",
        away: "NYM",
        home: "PHI",
        awayName: "New York Mets",
        homeName: "Philadelphia Phillies",
        matchup: "NYM @ PHI",
        /* E-1: dated on the eval's pinned evening (2026-09-17 ET) — "tonight" means today's product date now, and an
           undated row can never be tonight's forecast. */
        startUtc: "2026-09-17T23:05:00Z",
        experimental: false,
        capability: "PUBLIC",
        markets: [
          { market: "moneyline", label: "Moneyline", status: "PUBLISHED", pick: "NYM", team: "NYM", line: null,
            modelProbability: 0.55, marketImpliedProbability: 0.52, confidence: "lean", agreement: null, pausedReason: null },
          { market: "total", label: "Over/Under", status: "PAUSED", pick: null, team: null, line: 8.5,
            modelProbability: null, marketImpliedProbability: null, confidence: null, agreement: null,
            pausedReason: "the totals model is below its publication bar" },
        ],
        why: [],
        players: [],
        links: [{ id: "report", label: "Open the MLB game report", href: "/games/mlb/fixture-mlb-paused/" }],
      },
    ]),
  },

  /*
   * A REAL parlay slate, frozen (the published Ask projection for 2026-09-27). ⚠ 2026-09-28: the
   * optimizer published 0 slips on a day with no MLB game, and six parlay cases fell to the
   * deterministic fallback — correct behaviour for the day, but the cases test the parlay TOOL and the
   * writer's grounding over candidates, which needs candidates to exist. parlay-01 and parlay-05 still
   * run against the published assets, so whatever today holds — candidates or none — is also exercised.
   */
  /*
   * ⚠ E-3: every leg of the real 2026-09-27 slate is an MLB batter-hits / H+R+RBI leg — a family the coverage
   * registry marks DEMOTED_TO_MARKET_CONTEXT — so Ask now WITHHOLDS all of it. The real slate therefore tests the
   * withholding (re-dated to the eval's pinned day, since an omitted date is today's product date)...
   */
  "parlay-slate": {
    [PARLAYS]: redate(frozen("parlays-2026-09-27.json"), "2026-09-27", EVAL_DAY),
    [COVERAGE]: frozen("coverage-2026-09-30.json"),
  },
  /*
   * ...and the writer's grounding over candidates is tested on a SYNTHETIC copy whose legs carry a family the
   * registry does not demote. It is a test fixture only: labelled synthetic in every leg, never product data.
   */
  "parlay-slate-eligible": {
    [PARLAYS]: syntheticEligible(redate(frozen("parlays-2026-09-27.json"), "2026-09-27", EVAL_DAY)),
    [COVERAGE]: frozen("coverage-2026-09-30.json"),
  },

  /*
   * Session 2 · A PROBABILITY-ONLY NFL FORECAST — the real PIT @ CLE row (2026-09-30 projection), re-dated onto the
   * eval's pinned evening. It carries win probabilities and a projected score and NO pick, the shape every NFL and
   * EPL forecast has, and the shape the paraphrase fallback was found on.
   */
  "nfl-probability-only": {
    [FORECASTS]: forecastsDoc([
      {
        forecastId: "fixture-nfl-prob", sport: "NFL", gameId: "401872964", away: "PIT", home: "CLE",
        awayName: "Pittsburgh Steelers", homeName: "Cleveland Browns", matchup: "PIT @ CLE",
        startUtc: "2026-09-18T00:15Z", experimental: true, capability: "EXPERIMENTAL_PUBLIC", state: "PUBLIC_EXPERIMENTAL",
        probabilities: { away: 0.5443, home: 0.4258, tie: 0.0299 }, projectedScore: { away: 20, home: 19 },
        markets: [], why: [], players: [], updatedAt: "2026-09-17T15:52:56Z",
        links: [{ id: "report", label: "Open the NFL game report", href: "/nfl/game/401872964/" }],
      },
    ]),
  },

  /*
   * Session 2 · RESULTS DAYS — real Results V2 days (2026-09-30 projection), re-dated so the eval's pinned "yesterday"
   * (2026-09-16) is the settled 09-27 day, or the all-pending 09-29 day, or absent.
   */
  "results-day-settled": { [RESULTS]: resultsDoc({ "2026-09-27": "2026-09-16", "2026-09-29": "2026-09-14" }) },
  "results-day-pending": { [RESULTS]: resultsDoc({ "2026-09-29": "2026-09-16", "2026-09-27": "2026-09-13" }) },
  "results-day-missing": { [RESULTS]: resultsDoc({ "2026-09-27": "2026-09-13", "2026-09-29": "2026-09-12" }) },

  /* Nothing published at all — the night mut-18 found. Any pick claim is then unsourced by definition. */
  "empty-slate": {
    [FORECASTS]: forecastsDoc([]),
  },
});

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

const FORECASTS = "/data/ask/v1/forecasts.json";

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

  /* Nothing published at all — the night mut-18 found. Any pick claim is then unsourced by definition. */
  "empty-slate": {
    [FORECASTS]: forecastsDoc([]),
  },
});

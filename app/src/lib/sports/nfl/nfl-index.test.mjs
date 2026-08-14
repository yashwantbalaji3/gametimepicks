/**
 * Release A guards (Program 174): the canonical index is the ONE source of NFL public truth, its
 * counts reconcile with the artifacts they summarise, the kickoff lock preserves rather than
 * deletes, and a contradiction is an internal incident — never a public no-play.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const idx = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/index.json"), "utf8"));
const forecasts = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/forecasts/latest.json"), "utf8"));
const markets = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/markets/latest.json"), "utf8"));

test("the index is public-derived and declares itself the single source", () => {
  assert.equal(idx.dataClass, "PUBLIC_DERIVED");
  assert.match(idx.note, /ONE canonical NFL state/);
  assert.ok(Number.isFinite(Date.parse(idx.generatedAt)));
});

test("COUNTS RECONCILE with the artifacts they summarise — no independently computed number", () => {
  assert.equal(idx.counts.forecastsTotal, forecasts.forecasts.length, "forecast total must match the forecast artifact");
  assert.equal(idx.counts.forecastsUpcoming + idx.counts.forecastsStarted, idx.counts.forecastsTotal, "every forecast is upcoming or started");
  assert.equal(idx.events.length, idx.counts.forecastsTotal);
  const preKickoffMarketRows = markets.rows.filter((r) => markets.capturedAt < r.kickoffUtc).length;
  assert.equal(idx.counts.marketEvents, preKickoffMarketRows, "market count counts only pre-kickoff rows");
  assert.equal(idx.model.id, forecasts.model.id, "one model identity across artifacts");
});

test("KICKOFF LOCK preserves the receipt — a started game is hidden from pregame, never deleted", () => {
  for (const e of idx.events) {
    assert.ok(["UPCOMING", "STARTED", "SETTLED"].includes(e.lifecycle));
    assert.equal(e.locked, e.lifecycle !== "UPCOMING");
    // every event, started or not, keeps everything it published
    assert.ok(e.receipt?.inputHash, `${e.matchup}: receipt survives the lock`);
    assert.ok(e.projectedScore && typeof e.projectedScore.home === "number", `${e.matchup}: pre-event numbers preserved`);
    assert.ok(e.winProbability, `${e.matchup}: win probability preserved`);
  }
  if (idx.nextMatchup) {
    const next = idx.events.find((e) => e.matchup === idx.nextMatchup);
    assert.equal(next.lifecycle, "UPCOMING", "next kickoff is always an upcoming game");
  }
});

test("every event carries a state from the classifier with its reader-facing meaning", () => {
  for (const e of idx.events) {
    assert.ok(e.state && e.stateMeaning, `${e.matchup} needs a state and a meaning`);
    assert.doesNotMatch(e.stateMeaning, /\b(edge|profit|lock|best bet)\b/i);
    if (e.state === "EXPERIMENTAL_LEAN") {
      assert.ok(e.lean, "a lean carries its gap");
      assert.match(e.lean.notAnEdge, /not been shown to beat the market/);
    } else {
      assert.equal(e.lean, null, "only a lean carries lean data");
    }
  }
});

test("CONTRADICTIONS are detected and stay internal — never a public no-play", () => {
  assert.ok(Array.isArray(idx.contradictions));
  assert.equal(idx.contradictions.length, 0, `live index has contradictions: ${JSON.stringify(idx.contradictions)}`);
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-index.mjs"), "utf8");
  for (const kind of ["GENERATED_AFTER_START", "FORECAST_WITHOUT_SETTLEMENT_KEY", "MODEL_VERSION_DISAGREEMENT", "MARKET_COUNT_WITHOUT_ROWS"]) {
    assert.ok(src.includes(kind), `the detector must cover ${kind}`);
  }
  assert.match(src, /never rendered as a public no-play/, "the contradiction channel is documented as internal");
});

test("the experimental record is honest about what has and has not settled", () => {
  assert.ok(idx.experimentalRecord);
  // P178: this keyed off `counts.settled`, which counts settled events IN THE CURRENT WINDOW, and
  // read it as "nothing has ever settled". Those are different questions: on the first day after a
  // slate settles, the window is all-upcoming again while the lifetime record is no longer empty.
  // The record's own count is the authority on the lifetime question.
  if (idx.experimentalRecord.settledForecasts === 0) {
    assert.match(idx.experimentalRecord.note, /No experimental forecast has been settled yet/);
    assert.equal(idx.experimentalRecord.winnerAccuracy, null, "no accuracy is claimed before any result exists");
  } else {
    assert.ok(idx.experimentalRecord.settledForecasts > 0);
    assert.match(idx.experimentalRecord.note, /not a betting record/,
      "a populated record still says plainly what it is not");
  }
});

test("PUBLIC BOUNDARY · the index carries no private path or payload", () => {
  const blob = JSON.stringify(idx);
  for (const banned of ["data/internal", "PRIVATE_RESEARCH", "apiKey", "p171-ledger", "INTERNAL_ADMIN"]) {
    assert.ok(!blob.includes(banned), `index must not carry "${banned}"`);
  }
});

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

test("THE NEXT KICKOFF IS A SCHEDULE FACT · it cannot be null while a game is scheduled", () => {
  /*
   * P224: `nextKickoffUtc` used to name the next FORECAST event, so in every gap between a settled
   * slate and the next modelled one it published null beside `counts.scheduledUpcoming: 1` — two
   * neighbouring fields answering different questions with no way for a reader to tell. On
   * 2026-09-01 the index's only event was CHI @ TEN (played and settled 08-29) while NE @ SEA sat
   * scheduled and unnamed, and every consumer that derives a slate day from this field got null.
   *
   * The two questions now have two fields. This pins that they stay separate AND consistent.
   */
  const schedule = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/schedule/latest.json"), "utf8"));
  const upcomingRows = (schedule.rows ?? [])
    .filter((r) => r.statusRaw === "STATUS_SCHEDULED" && Date.parse(r.dateUtc) > Date.parse(idx.generatedAt))
    .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));

  /*
   * TWO PRODUCERS, TWO CADENCES (P233 · A). `sport-schedules` recaptures the NFL schedule on its own
   * clock; `nfl-event-window` rebuilds this index on another. On 2026-09-05 the schedule was
   * recaptured at 15:41Z carrying a sixteenth upcoming game while the index still read 15 from
   * 09-04T22:48Z — seventeen hours old and one game behind an input that did not exist when it was
   * built. Requiring exact equality asks an artifact to reconcile with its own future.
   *
   * The claim that survives is the one that matters: the index can be BEHIND the schedule, never
   * ahead of it. A count exceeding the capture would be invented.
   */
  const captureAt = schedule.capturedAt ?? schedule.generatedAt ?? null;
  const captureIsNewer = Boolean(captureAt) && Date.parse(captureAt) > Date.parse(idx.generatedAt);

  assert.ok(
    idx.counts.scheduledUpcoming <= upcomingRows.length,
    `the index counts ${idx.counts.scheduledUpcoming} upcoming games and the capture holds ${upcomingRows.length} — an index may lag its schedule, never exceed it`,
  );
  if (!captureIsNewer) {
    assert.equal(idx.counts.scheduledUpcoming, upcomingRows.length, "the count reconciles with the committed capture");
  }

  if (upcomingRows.length > 0) {
    assert.equal(idx.nextKickoffUtc, upcomingRows[0].dateUtc,
      "a scheduled game exists, so the index must name it — null here is the P224 defect");
    assert.ok(idx.nextMatchup, "and name the matchup");
  } else {
    assert.equal(idx.nextKickoffUtc, null, "with nothing scheduled, the anchor is honestly null");
  }

  // The forecast question keeps its own field, and it may legitimately be null while a game is
  // scheduled — that gap is the real state, and hiding it inside the anchor is what broke.
  assert.ok("nextForecastUtc" in idx, "what we have MODELLED stays visible and separate");
  if (idx.counts.forecastsUpcoming === 0) {
    assert.equal(idx.nextForecastUtc, null, "no upcoming forecast means no forecast anchor");
  } else {
    assert.ok(idx.nextForecastUtc, "an upcoming forecast names itself");
  }
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
  /*
   * P224 repoint: this asserted that `nextMatchup` names one of the index's own events and that the
   * event is UPCOMING. That was right while the anchor meant "next FORECAST" — it is not the claim
   * to make now the anchor means "next SCHEDULED game", which may legitimately have no forecast yet.
   * The forecast anchor keeps the original assertion verbatim, and the schedule anchor gets the
   * stronger half of it: whatever it names must never be a game that has already been played.
   */
  if (idx.nextForecastMatchup) {
    const nextForecast = idx.events.find((e) => e.matchup === idx.nextForecastMatchup);
    assert.ok(nextForecast, "the forecast anchor names one of this index's own events");
    assert.equal(nextForecast.lifecycle, "UPCOMING", "next forecast kickoff is always an upcoming game");
  }
  if (idx.nextMatchup) {
    const forecastForNext = idx.events.find((e) => e.matchup === idx.nextMatchup);
    if (forecastForNext) {
      assert.equal(forecastForNext.lifecycle, "UPCOMING",
        "the next kickoff must never name a game that has already been played — the P224 defect");
    }
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

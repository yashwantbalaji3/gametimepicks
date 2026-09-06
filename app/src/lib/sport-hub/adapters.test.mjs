import test from "node:test";
import assert from "node:assert/strict";
import { mlbHub, nflHub, eplHub, ufcHub } from "./adapters.ts";

const NOW = "2026-09-06T06:00:00Z";

test("LIVE · every MLB row carries a real first pitch, never a fabricated one", () => {
  const m = mlbHub(NOW);
  if (!m.rows.length) return;
  /*
   * THE DEFECT THIS PINS. `PublicGameDetail.date` is a calendar day. The first version cast it to
   * `T00:00:00Z` and rendered that, so every row read "8:00 PM ET" — midnight UTC in New York — and
   * named the day BEFORE the game. Two invented values from one careless cast, on fifteen rows.
   */
  const withTime = m.rows.filter((r) => / · .* ET$/.test(r.startLabel));
  assert.ok(withTime.length > 0, "no MLB row carries a time; the first-pitch source has moved");
  const times = new Set(withTime.map((r) => r.startLabel.split(" · ")[1]));
  assert.ok(times.size > 1, `every row shows the same time (${[...times]}) — that is a cast, not a schedule`);
  assert.ok(!times.has("8:00 PM ET") || times.size > 2, "8:00 PM on every row is the midnight-UTC artifact");
});

test("LIVE · an MLB read is the model's own line, labelled as a model forecast", () => {
  const m = mlbHub(NOW);
  const withRead = m.rows.filter((r) => r.read);
  if (!withRead.length) return;
  for (const r of withRead) {
    assert.ok(["MODEL_FORECAST", "MARKET_PRICE", "BASELINE_ONLY"].includes(r.read.kind));
    // A market-implied number must never be presented under a model kind.
    if (r.read.detail === "odds_api" || r.read.detail === "market_implied") {
      assert.equal(r.read.kind, "MARKET_PRICE", `${r.matchup} labels a book number as a model read`);
    }
  }
});

test("LIVE · NFL does not call a preseason archive 'this week'", () => {
  const n = nflHub(NOW);
  if (!n.rows.length) return;
  const allStarted = n.rows.every((r) => r.started);
  const anyRead = n.rows.some((r) => r.read !== null);
  if (allStarted && !anyRead) {
    assert.equal(n.periodLabel, "Preseason archive", "an archive with no forecasts must not be labelled a current week");
    assert.ok(!/this week/i.test(n.periodLabel), "an archive must not be labelled a current week");
  }
});

test("LIVE · a row with no exact start shows a DATE, not an invented time", () => {
  const n = nflHub(NOW);
  const dateOnly = n.rows.filter((r) => !/ ET$/.test(r.startLabel) && r.startLabel !== "TBD");
  for (const r of dateOnly) {
    assert.ok(!/\d:\d\d/.test(r.startLabel), `${r.matchup} shows a time it does not have`);
  }
});

test("LIVE · EPL rows without a published forecast still appear, with the reason", () => {
  const e = eplHub(NOW);
  for (const r of e.rows) {
    if (r.reportState === "NONE") {
      assert.ok(r.reportNote && r.reportNote.length > 0, `${r.matchup} has no report and no reason`);
      assert.equal(r.reportHref, null, "a row with no report must not carry a link");
    } else {
      assert.ok(r.reportHref, `${r.matchup} claims a report with no href`);
    }
  }
});

test("UFC bouts never claim a per-bout report route that does not exist", () => {
  const u = ufcHub(NOW, [
    { id: "b1", matchup: "A vs B", startUtc: "2026-09-07T02:00:00Z" },
    { id: "b2", matchup: "C vs D", startUtc: null },
  ], "UFC 999");
  assert.equal(u.labels.games, "Bouts");
  for (const r of u.rows) {
    assert.equal(r.reportState, "NONE");
    assert.equal(r.reportHref, null);
    assert.match(r.reportNote, /card-level/);
  }
  assert.equal(u.rows[1].startLabel, "TBD", "an unscheduled bout must not be given a time");
  assert.ok(!u.present.includes("products"), "UFC has no signature product; the section is omitted, not empty");
});

test("every hub declares only sections it can fill, and an empty reason", () => {
  for (const m of [mlbHub(NOW), nflHub(NOW), eplHub(NOW), ufcHub(NOW, [], "UFC 999")]) {
    assert.ok(m.present.length > 0, `${m.sport} declares no sections`);
    assert.ok(m.present.includes("games"), `${m.sport} must always have a games section`);
    assert.ok(m.emptyReason && m.emptyReason.length > 20, `${m.sport} has no useful empty state`);
    assert.ok(m.labels.games && m.sportLabel, `${m.sport} is missing vocabulary`);
  }
});

test("LIVE · report links point at routes that are actually generated", () => {
  for (const m of [mlbHub(NOW), nflHub(NOW), eplHub(NOW)]) {
    for (const r of m.rows) {
      if (!r.reportHref) continue;
      assert.match(r.reportHref, /^\/(games\/(mlb|nfl)|epl\/match)\/[^/]+\/$/, `${m.sport}: ${r.reportHref} is not a known report route`);
    }
  }
});

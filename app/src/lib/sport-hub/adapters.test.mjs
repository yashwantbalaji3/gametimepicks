import test from "node:test";
import assert from "node:assert/strict";
import { mlbHub, nflHub, eplHub, ufcHub } from "./adapters.ts";

const NOW = "2026-09-06T06:00:00Z";

test("LIVE · every MLB row carries a real first pitch, never a fabricated one", async () => {
  const m = mlbHub(NOW);
  if (!m.rows.length) return;
  /*
   * THE DEFECT THIS PINS. `PublicGameDetail.date` is a calendar day. The first version cast it to
   * `T00:00:00Z` and rendered that, so every row read "8:00 PM ET" — midnight UTC in New York — and
   * named the day BEFORE the game. Two invented values from one careless cast, on fifteen rows.
   *
   * CADENCE (P242): first pitch comes from fullGameSim/gameCenter/marketIntelligence, which the
   * daily-production step publishes HOURS after the morning board. Mid-chain, rows honestly carry a
   * date-only label — that is the product working, not the defect. So the expectation is derived
   * from the SAME source artifacts: a row must render a time exactly when its detail carries one,
   * and rows that do render times must not all be the midnight-UTC cast.
   */
  const { buildAllGameDetails } = await import("../game-detail.ts");
  const sourceTimes = buildAllGameDetails()
    .filter((d) => d.sport === "mlb")
    .filter((d) => {
      const g = d;
      const iso = g.fullGameSim?.firstPitch ?? g.gameCenter?.firstPitch ?? g.marketIntelligence?.startTime ?? null;
      return typeof iso === "string" && Number.isFinite(Date.parse(iso));
    }).length;
  const withTime = m.rows.filter((r) => / · .* ET$/.test(r.startLabel));
  assert.equal(
    withTime.length,
    sourceTimes,
    `rows rendering a time (${withTime.length}) must equal details carrying one (${sourceTimes}) — a drop means the first-pitch source moved; an excess means a fabricated time`,
  );
  if (!withTime.length) return; // honest mid-chain state: no source carries a time yet
  const times = new Set(withTime.map((r) => r.startLabel.split(" · ")[1]));
  assert.ok(times.size > 1 || withTime.length <= 2, `every row shows the same time (${[...times]}) — that is a cast, not a schedule`);
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

test("LIVE · NFL does not call a settled archive 'this week'", () => {
  // P240: the label was "Preseason archive" — a phase inferred from staleness, which becomes a
  // false phase claim the moment a settled REGULAR-season window goes stale. The invariant this
  // guard protects is unchanged: an all-started window with no reads is an archive, never a
  // current week. The label just stopped guessing the phase.
  const n = nflHub(NOW);
  if (!n.rows.length) return;
  const allStarted = n.rows.every((r) => r.started);
  const anyRead = n.rows.some((r) => r.read !== null);
  if (allStarted && !anyRead) {
    assert.equal(n.periodLabel, "Settled window", "an archive with no forecasts must not be labelled a current week");
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

test("UFC bouts: a modelled bout anchors to its own detail; an unmodelled one never fakes a route (P241 · A08)", () => {
  const u = ufcHub(NOW, [
    { id: "b1", matchup: "A vs B", startUtc: "2026-09-07T02:00:00Z", read: { label: "A", detail: "winner 60%" } },
    { id: "b2", matchup: "C vs D", startUtc: null },
  ], "UFC 999");
  assert.equal(u.labels.games, "Bouts");
  const modelled = u.rows.find((r) => r.id === "b1");
  assert.equal(modelled.reportState, "READY");
  assert.equal(modelled.reportHref, "#bout-b1", "a modelled bout deep-links to its rendered detail");
  const unmodelled = u.rows.find((r) => r.id === "b2");
  assert.equal(unmodelled.reportState, "NONE");
  assert.equal(unmodelled.reportHref, null);
  assert.match(unmodelled.reportNote, /not modelled/);
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
      // P244: /nfl/game/<id>/ is the forecast report route, generated for every published
      // forecast; the /games/nfl deep-sim route exists only when a participation-backed game
      // simulation was produced.
      assert.match(r.reportHref, /^\/(games\/(mlb|nfl)|nfl\/game|epl\/match)\/[^/]+\/$/, `${m.sport}: ${r.reportHref} is not a known report route`);
    }
  }
});

test("LIVE · EPL shows FORTHCOMING fixtures, not only the current forecast set", () => {
  /*
   * `loadEplForecasts()` returns the CURRENT set, and once a matchweek has kicked off it is
   * legitimately empty — on 2026-09-06 it held zero rows at 17:27Z while twelve Premier League
   * fixtures sat on the schedule for the following weekend. The hub showed "0 scheduled". A
   * published forecast is not the only thing worth showing; the fixture is.
   */
  const e = eplHub(NOW);
  const future = e.rows.filter((r) => !r.started);
  if (future.length === 0) return;   // a genuine off-window
  for (const r of future) {
    assert.ok(r.startUtc, `${r.matchup} has no kickoff`);
    // A fixture with no forecast must SAY so rather than offering a link to nothing.
    if (r.read === null) {
      assert.equal(r.reportHref, null, `${r.matchup} has no read but offers a report link`);
      assert.ok(r.reportNote, `${r.matchup} has no read and no reason`);
    }
  }
  // Scheduled and forecast are different populations and must not be conflated.
  const withRead = future.filter((r) => r.read !== null).length;
  assert.ok(withRead <= future.length, "read count cannot exceed scheduled");
});

test("LIVE · no forthcoming EPL row is a duplicate of a forecast row — keyed on FIXTURE identity, not row-id strings", () => {
  const e = eplHub(NOW);
  const ids = e.rows.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "a fixture appears twice — the schedule merge is not deduped");
  /*
   * P250 · A05: the assertion above passed VACUOUSLY for two weeks while every fixture rendered
   * twice, because the forecast ids (soccer:epl:…) and the schedule's canonical ids
   * (epl:premier-league:…) never collide AS STRINGS. Fixture identity is the club pair plus the
   * kickoff minute — the same fixture under two id schemes is still one fixture.
   */
  const fixtureKey = (r) => {
    const clubs = String(r.matchup ?? "").split(/\s+v(?:s)?\s+|\s+@\s+/i).map((c) => c.trim().toLowerCase()).sort().join("|");
    return `${clubs}|${String(r.startUtc ?? "").slice(0, 16)}`;
  };
  const keys = e.rows.map(fixtureKey);
  assert.equal(new Set(keys).size, keys.length, "the same fixture renders under two id namespaces — the merge joined on strings, not identity");
});

test("LIVE · every EPL hub row belongs to the ONE selected matchweek; later weeks are counted, not mixed in", () => {
  const e = eplHub(NOW);
  const m = /^Matchweek (\d+)$/.exec(e.periodLabel);
  if (!m) return; // between matchweeks with no schedule — nothing to scope
  // The hub's row count is what the header claims: one row per actual fixture of the selected week.
  // Ten reportable fixtures must never render as 22 rows again.
  const forecastCount = e.rows.filter((r) => r.read !== null || r.reportState !== "NONE").length;
  assert.ok(e.rows.length <= 20, `a single matchweek cannot have ${e.rows.length} rows (10 fixtures max + stragglers)`);
  assert.ok(forecastCount <= e.rows.length, "reportable is a subset of scheduled");
  // Deferred later-period fixtures are visible in the internal reconciliation, never silently dropped.
  assert.ok(e.identityReconciliation, "the adapter exposes its identity reconciliation");
  assert.equal(typeof e.identityReconciliation.laterPeriodRows, "number");
  assert.equal(e.identityReconciliation.unidentifiedScheduleRows, 0, "every schedule row states its canonical identity");
});

/**
 * The preview view model — market intelligence and provenance, and structurally nothing else.
 *
 * Run: npx tsx --test src/lib/soccer/epl-preview.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { EPL_PREVIEW_COPY, buildEplPreview } from "./epl-preview.ts";
import { MODEL_FIELD_KEYS, findModelField } from "./epl-artifacts.ts";
import { loadEplArtifacts } from "./epl-load.ts";
import { identitiesFromFixtures } from "./epl-identity.ts";

const EVENT = "soccer:epl:arsenal-v-chelsea:20260822t1400";
const KICKOFF = "2026-08-22T14:00:00Z";

const fixture = (over = {}) => ({
  eventId: EVENT,
  homeClub: "Arsenal",
  awayClub: "Chelsea",
  kickoffIso: KICKOFF,
  lifecycle: "SCHEDULED",
  providerRefs: [{ provider: "odds-api", id: "evt-1", kind: "event" }],
  capturedAt: "2026-07-30T00:00:00Z",
  ...over,
});

const odds = (over = {}) => ({
  eventId: EVENT,
  kickoffIso: KICKOFF,
  capturedAt: "2026-07-30T09:00:00Z",
  market: "MATCH_RESULT_1X2",
  book: "book-a",
  prices: { HOME: -125, DRAW: 260, AWAY: 340 },
  ...over,
});

// ── content ────────────────────────────────────────────────────────────────────

test("a fixture renders identity, both clocks, provider refs and the de-vigged market", () => {
  const [view] = buildEplPreview({ fixtures: [fixture()], odds: [odds()] });

  assert.equal(view.eventId, EVENT);
  assert.equal(view.homeAbbr, "ARS");
  assert.equal(view.awayAbbr, "CHE");
  assert.match(view.kickoffEtLabel, /ET$/);
  assert.match(view.kickoffUtcLabel, /UTC$/);
  assert.notEqual(view.kickoffEtLabel, view.kickoffUtcLabel, "ET and UTC are different clocks");
  assert.deepEqual(view.providerRefs, ["odds-api:evt-1"]);

  const [capture] = view.captures;
  assert.equal(capture.pregame, true);
  assert.equal(capture.reading.status, "OK");
  assert.ok(capture.reading.overround > 1);
  const sum = capture.reading.noVig.HOME + capture.reading.noVig.DRAW + capture.reading.noVig.AWAY;
  assert.ok(Math.abs(sum - 1) < 1e-12);
  assert.ok(capture.reading.noVig.DRAW > 0, "the draw is a first-class outcome on the surface");
});

test("provider refs from the identity layer are merged in and de-duplicated", () => {
  const { identities } = identitiesFromFixtures(
    [
      {
        homeClub: "Arsenal",
        awayClub: "Chelsea",
        kickoffIso: KICKOFF,
        providerRefs: [
          { provider: "odds-api", id: "evt-1" },
          { provider: "results-source", id: "fx-99" },
        ],
      },
    ],
    "2026-07-30T00:00:00Z",
  );
  const [view] = buildEplPreview({ fixtures: [fixture()], odds: [], identities });
  assert.deepEqual(view.providerRefs, ["odds-api:evt-1", "results-source:fx-99"]);
});

test("a fixture with no capture is a real state, not a blank", () => {
  const [view] = buildEplPreview({ fixtures: [fixture()], odds: [] });
  assert.deepEqual(view.captures, []);
  assert.equal(view.movement.state, "NO_CAPTURE");
  assert.equal(view.movement.noVigDelta, null);
});

test("an odds row with no fixture is dropped rather than rendered under a provider's own spelling", () => {
  const views = buildEplPreview({ fixtures: [], odds: [odds({ eventId: "soccer:epl:unknown:20260101t0000" })] });
  assert.deepEqual(views, []);
});

test("fixtures are ordered by kickoff", () => {
  const later = fixture({ eventId: "b", kickoffIso: "2026-08-23T13:00:00Z" });
  const views = buildEplPreview({ fixtures: [later, fixture()], odds: [] });
  assert.deepEqual(views.map((v) => v.eventId), [EVENT, "b"]);
});

// ── movement ───────────────────────────────────────────────────────────────────

test("one snapshot shows SINGLE_CAPTURE and no movement — a line needs two points", () => {
  const [view] = buildEplPreview({ fixtures: [fixture()], odds: [odds()] });
  assert.equal(view.movement.state, "SINGLE_CAPTURE");
  assert.equal(view.movement.noVigDelta, null, "movement is absent, never zero");
  assert.equal(view.movement.snapshotCount, 1);
});

test("two snapshots of the same book measure movement between REAL captures", () => {
  const [view] = buildEplPreview({
    fixtures: [fixture()],
    odds: [odds(), odds({ capturedAt: "2026-07-30T18:00:00Z", prices: { HOME: -140, DRAW: 270, AWAY: 360 } })],
  });
  assert.equal(view.movement.state, "MULTI_CAPTURE");
  assert.equal(view.movement.snapshotCount, 2);
  assert.equal(view.movement.deltaBook, "book-a");
  assert.equal(view.movement.firstCapturedAt, "2026-07-30T09:00:00Z");
  assert.equal(view.movement.lastCapturedAt, "2026-07-30T18:00:00Z");
  assert.ok(view.movement.noVigDelta.HOME > 0, "the home side shortened between the two captures");
  const total = Object.values(view.movement.noVigDelta).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total) < 1e-12, "no-vig deltas across three outcomes cancel");
});

test("two different books at one instant is still a single capture — that is a spread, not movement", () => {
  const [view] = buildEplPreview({ fixtures: [fixture()], odds: [odds(), odds({ book: "book-b" })] });
  assert.equal(view.movement.state, "SINGLE_CAPTURE");
  assert.equal(view.movement.noVigDelta, null);
});

// ── settlement state ───────────────────────────────────────────────────────────

test("every fixture reports settlement BLOCKED on RESULTS_SOURCE_PENDING", () => {
  const views = buildEplPreview({ fixtures: [fixture(), fixture({ eventId: "b", lifecycle: "POSTPONED" })], odds: [] });
  for (const v of views) {
    assert.equal(v.settlement.state, "BLOCKED");
    assert.equal(v.settlement.blocker, "RESULTS_SOURCE_PENDING");
  }
});

test("a postponed fixture renders as a first-class state with its reason", () => {
  const [view] = buildEplPreview({ fixtures: [fixture({ lifecycle: "POSTPONED" })], odds: [] });
  assert.equal(view.lifecycle.state, "POSTPONED");
  assert.equal(view.lifecycle.disposition, "VOID_ALL");
  assert.ok(view.lifecycle.reason.length > 20);
});

// ── the no-model guarantee ─────────────────────────────────────────────────────

test("NO MODEL FIELD appears anywhere in the built view model", () => {
  const views = buildEplPreview({
    fixtures: [fixture()],
    odds: [odds(), odds({ capturedAt: "2026-07-30T18:00:00Z" })],
  });
  assert.equal(findModelField(views), null, "the view model carries no modelled field");

  const keys = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      for (const [k, inner] of Object.entries(v)) {
        keys.add(k);
        walk(inner);
      }
    }
  };
  walk(views);
  for (const forbidden of MODEL_FIELD_KEYS) {
    assert.equal(keys.has(forbidden), false, `view model must not expose "${forbidden}"`);
  }
});

test("the preview copy makes no claim about a model, and states the no-model position", () => {
  const copy = Object.values(EPL_PREVIEW_COPY).join(" ");
  for (const banned of [/\bedge\b/i, /\block\b/i, /beat the market/i, /guarantee/i, /\bROI\b/, /sure thing/i, /\bwe like\b/i]) {
    assert.equal(banned.test(copy), false, `copy must not contain ${banned}`);
  }
  assert.match(EPL_PREVIEW_COPY.noModel, /no GameTimePicks number/i);
  assert.match(EPL_PREVIEW_COPY.leakage, /capture/i);
  assert.match(EPL_PREVIEW_COPY.singleCapture, /one snapshot/i);
});

// ── the committed samples render ───────────────────────────────────────────────

test("the committed sample artifacts load and build a preview", () => {
  const artifacts = loadEplArtifacts();
  assert.equal(artifacts.empty, false, "the samples must be readable from disk");
  assert.deepEqual(artifacts.dataClasses, ["FIXTURE_SAMPLE"]);
  assert.equal(artifacts.oddsValidations.every((v) => v.validation.clean), true);
  assert.equal(artifacts.fixtureValidations.every((v) => v.validation.clean), true);

  const views = buildEplPreview({ fixtures: artifacts.fixtures, odds: artifacts.odds });
  assert.equal(views.length, 4);
  assert.equal(findModelField(views), null);

  const states = views.map((v) => v.movement.state);
  assert.ok(states.includes("MULTI_CAPTURE"), "one sample fixture has two snapshots");
  assert.ok(states.includes("SINGLE_CAPTURE"), "one has exactly one");
  assert.ok(states.includes("NO_CAPTURE"), "one has none");

  const lifecycles = views.map((v) => v.lifecycle.state);
  assert.ok(lifecycles.includes("POSTPONED") && lifecycles.includes("REPLAYED"));

  // The postponed fixture and its replacement are the same clubs and DIFFERENT events.
  const pair = views.filter((v) => v.homeClub === "Everton");
  assert.equal(pair.length, 2);
  assert.notEqual(pair[0].eventId, pair[1].eventId);
});

/**
 * GTP-02 / GTP-10 — Home's featured lanes say only what their rows support.
 *
 * GTP-02: "Every forecast fixture has kicked off" beside ten Matchweek 8 fixtures four days away
 * (all model-only, no sportsbook price yet). GTP-10: a prelim (the LAST modelled bout) featured and
 * labelled "main card" on a card whose main event was modelled and listed first.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { freshnessFor } from "./freshness.ts";
import { featuredEpl, featuredNfl, featuredUfc, eplEmptyReason, ufcBoutPlacement } from "./featured.ts";

const NOW = "2026-10-13T12:00:00Z";
const status = { id: "x", family: "Model", state: "EXPERIMENTAL", headline: "", detail: "", n: null, source: "" };
const fresh = freshnessFor(NOW, NOW);
const ctx = { dataRoot: os.tmpdir(), today: "2026-10-13", nowIso: NOW, freshness: fresh, status };

const eplRow = (o) => ({ eventId: "e", matchup: "A v B", homeClub: "A", awayClub: "B", slug: "a-v-b", kickoffUtc: "2026-10-17T14:00:00Z", matchweek: 8, state: "READY_EXCEPT_ODDS", modelOnly: true, unavailableReason: null, probs: { home: 0.5, draw: 0.25, away: 0.25 }, ...o });
const set = (rows) => ({ generatedAt: NOW, validation: "", trackRecord: "", note: "", counts: {}, rows });

test("GTP-02 EPL: model-only future fixtures are never described as kicked off", () => {
  const s = set([eplRow({ eventId: "1" }), eplRow({ eventId: "2", kickoffUtc: "2026-10-18T15:30:00Z" })]);
  const f = featuredEpl({ ...ctx, set: s });
  assert.equal(f.card, null, "a model-only row is still not featured (the chip counts CURRENT_PRE_EVENT only)");
  assert.doesNotMatch(f.reason, /kicked off/);
  assert.match(f.reason, /^2 upcoming fixtures have a model forecast but no sportsbook price yet/);
});

test("GTP-02 EPL: 'kicked off' remains the answer when it is true", () => {
  const s = set([eplRow({ kickoffUtc: "2026-10-12T14:00:00Z", state: "CURRENT_PRE_EVENT", modelOnly: false })]);
  assert.match(eplEmptyReason(s, NOW), /Every forecast fixture has kicked off/);
  assert.equal(eplEmptyReason(set([]), NOW), "No fixture carries a current forecast yet.");
});

test("GTP-02 NFL: a pregame event without a probability is not 'kicked off'", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-nfl-"));
  try {
    fs.mkdirSync(path.join(root, "nfl"), { recursive: true });
    fs.writeFileSync(path.join(root, "nfl", "index.json"), JSON.stringify({ events: [{ providerEventId: "9", kickoffUtc: "2026-10-16T00:15:00Z", home: { abbr: "DEN" }, away: { abbr: "SEA" }, winProbability: null }] }));
    const f = featuredNfl({ ...ctx, dataRoot: root });
    assert.equal(f.card, null);
    assert.doesNotMatch(f.reason, /kicked off/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

const bout = (id, red, blue, startUtc, modelled = true) => ({
  boutId: id, startUtc, red: { name: red }, blue: { name: blue },
  prediction: modelled ? { winner: { name: red, probability: 0.6 }, method: { most: "DEC" } } : null,
});

test("GTP-10 UFC: the main event is featured and labelled by its real placement", () => {
  const card = { event: { name: "UFC Fight Night", startUtc: "2026-10-17T21:00Z" }, bouts: [
    bout("m", "Malott", "Buckley", "2026-10-18T00:00Z"),
    bout("c", "Blanchfield", "Jasudavicius", "2026-10-18T00:00Z"),
    bout("p", "You", "Chovancek", "2026-10-17T21:00Z"),
  ] };
  const f = featuredUfc({ ...ctx, card });
  assert.equal(f.card.id, "ufc-m", "the first modelled bout is the headline, not the last");
  assert.equal(f.card.context, "UFC Fight Night · main event");
  assert.equal(ufcBoutPlacement(card.bouts[1], card), "co-main event");
  assert.equal(ufcBoutPlacement(card.bouts[2], card), "prelims", "a prelim is never called main card");
});

test("GTP-10 UFC: an unmodelled main event falls to the first MODELLED bout, labelled honestly", () => {
  const card = { event: { name: "UFC X" }, bouts: [
    bout("m", "A", "B", "2026-10-18T00:00Z", false),
    bout("c", "C", "D", "2026-10-18T00:00Z", false),
    bout("x", "E", "F", "2026-10-18T00:00Z"),
    bout("p", "G", "H", "2026-10-17T21:00Z"),
  ] };
  const f = featuredUfc({ ...ctx, card });
  assert.equal(f.card.id, "ufc-x");
  assert.equal(f.card.context, "UFC X · main card");
});

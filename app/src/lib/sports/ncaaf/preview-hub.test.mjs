/**
 * NCAAF preview-hub guards (NCAAF-008): rows obey the shared sport-hub contract — every read is a labelled
 * SHADOW model forecast, no split bar is invented from a one-sided probability, no logo is drawn without an
 * approved source, a started game is an archive (never a forecast to act on), and a final comes only from the
 * grade log. PRIVATE_RESEARCH.
 *
 * Receipts and grades below are SYNTHETIC TEST FIXTURES.
 *
 * Run: npx tsx --test src/lib/sports/ncaaf/preview-hub.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { drawableSplit } from "../../sport-hub/contract";
import { NCAAF_SHADOW_DETAIL, ncaafPreviewHubFrom } from "./preview-hub";

const receipt = (eventId, start, pHome, over = {}) => ({
  capturedAt: "2026-10-09T21:42:09.641Z", publicationStatus: "SHADOW", code: { commit: "f".repeat(40) }, models: {},
  event: { eventId, season: 2026, week: 6, slateDate: start.slice(0, 10), startUtcAtCapture: start, homeAbbreviation: "HOM", awayAbbreviation: "AWY", neutralSite: false, pairing: "FBS-FBS", ...over },
  forecast: { winner: { pHome, source: "C1" }, score: { pHome, homeMean: 30, awayMean: 24, marginMean: 6, marginSd: 15, totalMean: 54, totalSd: 14 }, worlds: { refused: "x" } },
  market: null,
});
const NOW = "2026-10-10T18:00:00Z";

test("every row carries a labelled shadow MODEL_FORECAST read, no split bar and no logo", () => {
  const m = ncaafPreviewHubFrom({ nowIso: NOW, capturedAt: "2026-10-09T21:42:09.641Z", receipts: [receipt("900005001", "2026-10-10T19:30Z", 0.64), receipt("900005002", "2026-10-10T23:00Z", 0.31)], grades: new Map() });
  assert.equal(m.rows.length, 2);
  for (const r of m.rows) {
    assert.equal(r.read.kind, "MODEL_FORECAST");
    assert.equal(r.read.detail, NCAAF_SHADOW_DETAIL);
    assert.equal(drawableSplit(r.read), null, "a one-sided probability never becomes a two-sided split");
    assert.ok(r.participants.every((p) => p.logoTeam === null && p.logoSport === null));
  }
  assert.equal(m.rows[0].read.label, "HOM 64% to win");
  assert.equal(m.rows[1].read.label, "AWY 69% to win", "the favourite is named from the owner's own P(home)");
  assert.equal(m.freshness, "2026-10-09T21:42:09.641Z", "freshness is the capture time, never a build clock");
});

test("a started game is an archive; a final appears only from the grade log", () => {
  const started = receipt("900005003", "2026-10-10T16:00Z", 0.55);
  const graded = receipt("900005004", "2026-10-10T16:00Z", 0.55);
  const grades = new Map([["900005004", { settlement: { state: "SETTLED", finalHome: 21, finalAway: 24, overtimePeriods: 1 }, forecastOfRecord: { capturedAt: graded.capturedAt } }]]);
  const m = ncaafPreviewHubFrom({ nowIso: NOW, capturedAt: null, receipts: [started, graded], grades });
  const s = m.rows.find((r) => r.id === "900005003"), g = m.rows.find((r) => r.id === "900005004");
  assert.equal(s.started, true);
  assert.equal(s.reportState, "ARCHIVE");
  assert.equal(s.status, "started or final", "no final is claimed without a grade");
  assert.equal(s.reportNote, undefined);
  assert.equal(g.status, "final");
  assert.equal(g.reportNote, "Final · AWY 24 – HOM 21 (1OT)");
});

test("rows are chronological and neutral sites are named", () => {
  const m = ncaafPreviewHubFrom({ nowIso: NOW, capturedAt: null, receipts: [receipt("900005006", "2026-10-11T00:00Z", 0.5), receipt("900005005", "2026-10-10T19:00Z", 0.5, { neutralSite: true })], grades: new Map() });
  assert.deepEqual(m.rows.map((r) => r.id), ["900005005", "900005006"]);
  assert.match(m.rows[0].matchup, /neutral site/);
});

/**
 * NCAAF-005 forward-capture guards: only scheduled games with a known kickoff at least MIN_LEAD_MINUTES away
 * are forecast; the signed home spread is filled only when text and number agree and the abbreviation names a
 * team; receipts captured at/after kickoff are never the forecast of record; a later kickoff revision cannot
 * re-admit a post-start receipt. PRIVATE_RESEARCH.
 *
 * All events are SYNTHETIC TEST FIXTURES (ids 9xxxxxxxx, teams 90xx).
 *
 * Run: npx tsx --test src/lib/sports/ncaaf/forward.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeScoreboardEvent } from "./espn-events.mjs";
import { MIN_LEAD_MINUTES, forecastOfRecord, marketFromEvent, pregameRow, receiptPath } from "./forward.mjs";

const CAP = "2026-10-09T22:00:00.000Z";
const raw = ({ id = "900003001", date = "2026-10-10T19:30Z", status = "STATUS_SCHEDULED", timeValid = true, odds } = {}) => ({
  id, date, season: { year: 2026, type: 2 }, week: { number: 6 },
  competitions: [{
    date, timeValid, neutralSite: false, conferenceCompetition: true,
    status: { period: 0, type: { name: status, completed: false } },
    competitors: [
      { homeAway: "home", score: "0", team: { id: "9001", abbreviation: "HOM", conferenceId: "5" } },
      { homeAway: "away", score: "0", team: { id: "9002", abbreviation: "AWY", conferenceId: "5" } },
    ],
    ...(odds ? { odds: [odds] } : {}),
  }],
});
const M = { fbs: new Set(["9001", "9002"]), fcs: new Set() };
const pre = (e) => pregameRow(normalizeScoreboardEvent(e, { capturedAt: CAP }).row, M, CAP);

test("a scheduled game with a known kickoff becomes a pregame row with no outcome fields", () => {
  const { row } = pre(raw());
  assert.equal(row.pairing, "FBS-FBS");
  assert.equal(row.slateDate, "2026-10-10");
  assert.equal("homeScore" in row || "awayScore" in row, false);
});

test("forecasts are refused for TBD kickoffs, imminent or past kickoffs, and non-scheduled games", () => {
  assert.equal(pre(raw({ timeValid: false })).refused, "KICKOFF_TIME_TBD");
  const soon = new Date(Date.parse(CAP) + (MIN_LEAD_MINUTES - 1) * 60_000).toISOString();
  assert.equal(pre(raw({ date: soon })).refused, "KICKOFF_TOO_CLOSE_OR_PAST");
  assert.equal(pre(raw({ date: "2026-10-09T20:00Z" })).refused, "KICKOFF_TOO_CLOSE_OR_PAST");
  assert.equal(pre(raw({ status: "STATUS_IN_PROGRESS" })).refused, "NOT_SCHEDULED_STATUS_IN_PROGRESS");
});

test("signed home spread: filled only when text names a team and agrees with the number", () => {
  const mk = (details, spread) => marketFromEvent(raw({ odds: { provider: { name: "DraftKings" }, details, spread, overUnder: 52.5, homeTeamOdds: { moneyLine: -160, favorite: true }, awayTeamOdds: { moneyLine: 135 } } }), CAP);
  assert.equal(mk("HOM -3.5", -3.5).homeSpread, -3.5, "home favourite");
  assert.equal(mk("HOM -3.5", -3.5).spreadCheck, "AGREES_HOME_SIGNED");
  assert.equal(mk("AWY -7", 7).homeSpread, 7, "away favourite ⇒ home +7");
  assert.equal(mk("AWY -7", -7).spreadCheck, "AGREES_MAGNITUDE_ONLY", "a provider that signs from the favourite's side still verifies by magnitude");
  assert.equal(mk("EVEN", 0).homeSpread, 0);
  const bad = mk("HOM -3.5", -6.5);
  assert.equal(bad.homeSpread, null);
  assert.equal(bad.spreadCheck, "DISAGREES");
  const stranger = mk("XYZ -3", -3);
  assert.equal(stranger.homeSpread, null);
  assert.equal(stranger.spreadCheck, "ABBREVIATION_MATCHES_NEITHER_TEAM");
  assert.equal(mk("HOM -3.5", -3.5).homeMoneyline, -160);
  assert.equal(marketFromEvent(raw(), CAP), null, "no odds ⇒ no market, never a default -110");
});

test("receipt paths are deterministic and per capture", () => {
  assert.equal(receiptPath(2026, "2026-10-10", "900003001", "2026-10-09T22:00:00.123Z"), "forecasts/2026/2026-10-10/900003001/20261009T220000Z.json");
});

test("forecast of record: last capture before kickoff; post-start captures never qualify, even after a kickoff revision", () => {
  const r = (capturedAt, startUtcAtCapture) => ({ capturedAt, event: { startUtcAtCapture } });
  const a = r("2026-10-09T22:00:00Z", "2026-10-10T19:30Z");
  const b = r("2026-10-10T15:00:00Z", "2026-10-10T19:30Z");
  const late = r("2026-10-10T19:45:00Z", "2026-10-10T23:00Z"); // captured after the ORIGINAL kickoff; feed later moved it
  assert.equal(forecastOfRecord([a, b]), b);
  assert.equal(forecastOfRecord([a, b], "2026-10-10T19:30Z"), b);
  assert.equal(forecastOfRecord([a, b, late], "2026-10-10T19:30Z"), b, "a capture after the real kickoff is refused");
  assert.equal(forecastOfRecord([b], "2026-10-10T14:00Z"), null, "kickoff moved earlier than the capture ⇒ nothing of record");
});

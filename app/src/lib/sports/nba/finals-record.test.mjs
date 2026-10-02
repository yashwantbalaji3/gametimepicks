/**
 * NBA finals record guards (Session 6 · NBA foundation).
 *
 * The record is the durable answer to "what was the final", so every way it could lie is pinned:
 * identity joined by name or by a disagreeing abbreviation, an exhibition club given an NBA tricode, a
 * recorded final rewritten by a later observation, a quarantined capture row (tie, no lineage) entering,
 * a no-op run moving the timestamp, and a pending game read as anything but pending.
 *
 * Run: npx tsx --test src/lib/sports/nba/finals-record.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeFinals, finalFor, finalRow, sideIdentity, nbaSeasonLabel, etDateOf } from "./finals-record.mjs";
import { loadCurrentNbaResults } from "./current-results.mjs";
import { ESPN_NBA_TEAMS } from "./roster-contract.mjs";
import { canonicalTeamId } from "../../nba/identity-contract.ts";

const NOW = "2026-10-04T16:00:00Z";
const LATER = "2026-10-05T16:00:00Z";
const MIA = { abbr: "MIA", name: "Miami Heat", providerTeamId: "14" };
const TOR = { abbr: "TOR", name: "Toronto Raptors", providerTeamId: "28" };
const GS = { abbr: "GS", name: "Golden State Warriors", providerTeamId: "9" };
const raw = (over = {}) => ({ providerEventId: "401902644", dateUtc: "2026-10-03T23:00Z", statusRaw: "STATUS_FINAL", seasonType: 1, neutralSite: false, home: TOR, away: MIA, ftHome: 112, ftAway: 104, ...over });

test("season label follows the ET date: August opens a season, July closes it", () => {
  assert.equal(nbaSeasonLabel("2026-10-03"), "2026-27");
  assert.equal(nbaSeasonLabel("2027-06-15"), "2026-27");
  assert.equal(nbaSeasonLabel("2026-07-31"), "2025-26");
  assert.equal(nbaSeasonLabel("2026-08-01"), "2026-27");
  assert.equal(nbaSeasonLabel("not a date"), null);
  // 01:30Z on Oct 21 is still Oct 20 in New York — the ET date, not the UTC date, names the game day.
  assert.equal(etDateOf("2026-10-21T01:30Z"), "2026-10-20");
});

test("identity comes from the ESPN team id; the canonical tricode is not the provider abbreviation", () => {
  const gs = sideIdentity(GS);
  assert.equal(gs.ok, true);
  assert.equal(gs.side.tricode, "GSW", "ESPN 'GS' must canonicalise to GSW");
  assert.equal(gs.side.espnAbbr, "GS");
  const lie = sideIdentity({ ...GS, abbr: "LAL" });
  assert.equal(lie.ok, false, "an id/abbreviation disagreement must refuse, never pick a side");
  assert.match(lie.reason, /identity disagrees/);
});

test("an exhibition club is recorded with no tricode and labelled — never dropped, never an NBA team", () => {
  const out = finalRow(raw({ away: { abbr: "LON", name: "London Lions", providerTeamId: "999901" } }), NOW);
  assert.equal(out.ok, true);
  assert.equal(out.row.exhibition, true);
  assert.equal(out.row.away.tricode, null);
  assert.equal(out.row.home.tricode, "TOR");
});

test("every ESPN team in the roster table resolves to the same tricode through the TS identity contract", () => {
  assert.equal(ESPN_NBA_TEAMS.length, 30);
  assert.equal(new Set(ESPN_NBA_TEAMS.map((t) => t.canonicalTricode)).size, 30, "30 distinct canonical tricodes");
  for (const t of ESPN_NBA_TEAMS) {
    assert.ok(t.canonicalTricode, `ESPN ${t.espnAbbr} has a canonical tricode`);
    assert.equal(canonicalTeamId(t.espnAbbr), t.canonicalTricode, `identity-contract.ts and the roster table disagree on ESPN ${t.espnAbbr}`);
  }
});

test("a new final is recorded once with phase, identity and winner; a repeat run changes nothing", () => {
  const first = mergeFinals(null, [raw()], { season: "2026-27", nowIso: NOW });
  assert.equal(first.changed, true);
  assert.equal(first.added, 1);
  const f = first.record.finals[0];
  assert.equal(f.canonicalEventId, "nba:nba:2026-10-03:401902644");
  assert.equal(f.phase, "PRESEASON");
  assert.equal(f.winnerSide, "home");
  assert.equal(f.firstRecordedAt, NOW);
  assert.deepEqual(first.record.counts, { finals: 1, preseason: 1, regular: 0, postseason: 0, playIn: 0, other: 0, exhibition: 0, conflicts: 0, refused: 0 });

  const again = mergeFinals(first.record, [raw()], { season: "2026-27", nowIso: LATER });
  assert.equal(again.changed, false, "nothing new learned → caller must not rewrite the file");
  assert.equal(again.record.updatedAt, NOW, "a no-op run does not move updatedAt");
});

test("WRITE-ONCE: a later disagreeing score is a conflict, and the recorded final stands", () => {
  const first = mergeFinals(null, [raw()], { season: "2026-27", nowIso: NOW }).record;
  const second = mergeFinals(first, [raw({ ftHome: 113 })], { season: "2026-27", nowIso: LATER });
  assert.equal(second.changed, true);
  assert.equal(second.record.finals[0].ftHome, 112, "the recorded final must never be rewritten");
  assert.equal(second.record.conflicts.length, 1);
  assert.deepEqual(second.record.conflicts[0].observed.ftHome, 113);
  assert.equal(finalFor(second.record, "401902644").state, "FINAL_UNDER_REVIEW");
  // The same conflict seen twice is recorded once.
  assert.equal(mergeFinals(second.record, [raw({ ftHome: 113 })], { season: "2026-27", nowIso: LATER }).changed, false);
});

test("a row from another season is left to that season's record", () => {
  const out = mergeFinals(null, [raw({ providerEventId: "x", dateUtc: "2026-06-10T00:30Z", seasonType: 3 })], { season: "2026-27", nowIso: NOW });
  assert.equal(out.record.finals.length, 0);
  assert.equal(out.changed, false);
});

test("identity refusals are recorded once, never as finals", () => {
  const out = mergeFinals(null, [raw({ home: { ...GS, abbr: "LAL" } })], { season: "2026-27", nowIso: NOW });
  assert.equal(out.record.finals.length, 0);
  assert.equal(out.record.refused.length, 1);
  assert.equal(mergeFinals(out.record, [raw({ home: { ...GS, abbr: "LAL" } })], { season: "2026-27", nowIso: LATER }).changed, false);
});

test("PENDING is not a result: an unrecorded game is PENDING, never a loss or a zero", () => {
  const rec = mergeFinals(null, [raw()], { season: "2026-27", nowIso: NOW }).record;
  const p = finalFor(rec, "401999999");
  assert.deepEqual(p, { state: "PENDING", providerEventId: "401999999" });
  assert.equal(finalFor(null, "401902644").state, "PENDING");
  const f = finalFor(rec, "401902644");
  assert.equal(f.state, "FINAL");
  assert.equal(f.home, "TOR");
  assert.equal(f.ftHome, 112);
});

test("only finals the current-results adapter ACCEPTS can reach the record (tie and no-lineage rows stay out)", () => {
  const sched = new Map([["401902644", { providerEventId: "401902644", seasonType: 1, home: { abbr: "TOR" }, away: { abbr: "MIA" } }]]);
  const rows = [raw(), raw({ providerEventId: "tie", ftHome: 100, ftAway: 100 }), raw({ providerEventId: "orphan" })];
  const adapter = loadCurrentNbaResults({ nowIso: NOW, artifact: { generatedAt: NOW, sourceAsOf: NOW, rows }, scheduleIndex: sched });
  const acceptedIds = new Set(adapter.results.map((r) => r.providerEventId));
  assert.deepEqual([...acceptedIds], ["401902644"]);
  const out = mergeFinals(null, rows.filter((r) => acceptedIds.has(r.providerEventId)), { season: "2026-27", nowIso: NOW });
  assert.deepEqual(out.record.finals.map((f) => f.providerEventId), ["401902644"]);
});

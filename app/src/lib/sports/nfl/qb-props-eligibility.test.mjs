/**
 * NFL QB props · eligibility at freeze (qb-props-eligibility.mjs). Synthetic receipts and captures only.
 * Run (from app/): node --test src/lib/sports/nfl/qb-props-eligibility.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { eligibilityAtFrom, freezeKey, mergeRecord, pinnedAvailability, resolveReceiptQbs } from "./qb-props-eligibility.mjs";

const AT = "2026-11-16T12:00:00Z";
const STAMP = "2026-11-16T11:58:00Z";
const q = (v) => ({ p10: v, p50: v, p90: v });
const receipt = (over = {}) => ({
  eventId: "11", generatedAt: AT, eventStart: "2026-11-16T18:00Z",
  availabilitySnapshotId: `injuries@${STAMP}+rosters@${STAMP}`,
  playerStatDistributions: [
    { playerId: "nfl-athlete-1", name: "QB1", team: "AAA", stats: { passAtt: q(32) } },
    { playerId: "nfl-athlete-9", name: "QB9", team: "AAA", stats: { passAtt: q(3) } },
    { playerId: "nfl-athlete-2", name: "QB2", team: "BBB", stats: { passAtt: q(30) } },
  ],
  ...over,
});
const roster = { generatedAt: STAMP, teams: [
  { teamAbbr: "AAA", providerTeamId: "1", players: [{ id: "1", status: { type: "active" } }, { id: "9", status: { type: "active" } }] },
  { teamAbbr: "BBB", providerTeamId: "2", players: [{ id: "2", status: { type: "active" } }] },
] };
const injuries = (entries = []) => ({ generatedAt: STAMP, entries });

test("the pin: injuries + rosters stamps parsed from availabilitySnapshotId; no pin ⇒ null", () => {
  assert.deepEqual(pinnedAvailability(receipt()), { injuriesAt: STAMP, rostersAt: STAMP });
  assert.equal(pinnedAvailability({ availabilitySnapshotId: "injuries@x" }), null);
  assert.equal(pinnedAvailability({}), null);
});

test("each team's projected QB (largest pass-attempt median) resolved at freeze; a Doubtful starter is INELIGIBLE", () => {
  const r = resolveReceiptQbs({
    receipt: receipt(),
    injuriesAt: (s) => (s === STAMP ? injuries([{ athleteId: "2", providerTeamId: "2", status: "Doubtful", statedAt: "2026-11-15T20:00Z" }]) : null),
    rosterAt: (s) => (s === STAMP ? roster : null),
  });
  assert.equal(r.missing, null);
  const m = Object.fromEntries(r.entries);
  assert.deepEqual(Object.keys(m), [`${AT}|AAA|nfl-athlete-1`, `${AT}|BBB|nfl-athlete-2`], "QB9 is not the projected QB");
  assert.equal(m[`${AT}|AAA|nfl-athlete-1`].state, "ELIGIBLE");
  assert.equal(m[`${AT}|BBB|nfl-athlete-2`].state, "INELIGIBLE");
  assert.deepEqual(m[`${AT}|BBB|nfl-athlete-2`].reasons, ["DOUBTFUL_STARTER"]);
  assert.deepEqual(m[`${AT}|AAA|nfl-athlete-1`].pinned, { injuriesAt: STAMP, rostersAt: STAMP });
});

test("never a different capture: a pinned stamp that cannot be found resolves nothing (the row stays PENDING)", () => {
  const later = { ...roster, generatedAt: "2026-11-16T13:00:00Z" };
  assert.match(resolveReceiptQbs({ receipt: receipt(), injuriesAt: () => null, rosterAt: () => roster }).missing, /^PINNED_INJURIES_UNAVAILABLE/);
  assert.match(resolveReceiptQbs({ receipt: receipt(), injuriesAt: () => injuries(), rosterAt: () => later }).missing, /^PINNED_ROSTER_UNAVAILABLE/);
  assert.match(resolveReceiptQbs({ receipt: receipt({ availabilitySnapshotId: null }), injuriesAt: () => injuries(), rosterAt: () => roster }).missing, /^RECEIPT_PINS_NO_AVAILABILITY/);
});

test("a capture stamped after the freeze is never used (R4): the contract says UNKNOWN", () => {
  const after = "2026-11-16T12:30:00Z";
  const r = resolveReceiptQbs({
    receipt: receipt({ availabilitySnapshotId: `injuries@${after}+rosters@${after}` }),
    injuriesAt: () => ({ generatedAt: after, entries: [] }), rosterAt: () => ({ ...roster, generatedAt: after }),
  });
  assert.ok(r.entries.every(([, v]) => v.state === "UNKNOWN"));
});

test("append-only merge: an existing key is kept verbatim and reported; output keys sorted; re-merge is byte-identical", () => {
  const a = [[`${AT}|BBB|nfl-athlete-2`, { state: "ELIGIBLE" }], [`${AT}|AAA|nfl-athlete-1`, { state: "ELIGIBLE" }]];
  const first = mergeRecord(null, a);
  assert.equal(first.added, 2);
  assert.deepEqual(Object.keys(first.record.entries), [`${AT}|AAA|nfl-athlete-1`, `${AT}|BBB|nfl-athlete-2`]);
  const second = mergeRecord(first.record, [[`${AT}|AAA|nfl-athlete-1`, { state: "INELIGIBLE" }]]);
  assert.equal(second.added, 0);
  assert.deepEqual(second.conflicts, [`${AT}|AAA|nfl-athlete-1`]);
  assert.equal(second.record.entries[`${AT}|AAA|nfl-athlete-1`].state, "ELIGIBLE");
  assert.equal(JSON.stringify(mergeRecord(first.record, a).record), JSON.stringify(first.record));
  assert.ok(!/generatedAt|writtenAt|now/.test(Object.keys(first.record).join(",")), "no wall-clock field");
});

test("the grader hook: keyed by (asOf, team, playerId), with or without the nfl-athlete- prefix; missing ⇒ null", () => {
  const { record } = mergeRecord(null, [[freezeKey({ asOf: AT, teamAbbr: "AAA", playerId: "1" }), { state: "ELIGIBLE" }]]);
  const at = eligibilityAtFrom(record);
  assert.equal(at({ playerId: "nfl-athlete-1", teamAbbr: "AAA", asOf: AT }).state, "ELIGIBLE");
  assert.equal(at({ playerId: "1", teamAbbr: "AAA", asOf: AT }).state, "ELIGIBLE");
  assert.equal(at({ playerId: "nfl-athlete-1", teamAbbr: "AAA", asOf: "2026-11-16T12:00:01Z" }), null);
  assert.equal(eligibilityAtFrom(null)({ playerId: "1", teamAbbr: "AAA", asOf: AT }), null);
});

test("the module reads no outcome: no finals, box scores or player events", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/sports/nfl/qb-props-eligibility.mjs"), "utf8");
  assert.doesNotMatch(src, /official-stats|player-events|readVerifiedFinals|readPlayerEventGames/);
});

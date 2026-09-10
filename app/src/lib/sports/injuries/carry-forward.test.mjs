/**
 * Guards for the injury designation carry-forward.
 *
 * The load-bearing property runs in both directions: an omission must not clear a designation, and
 * the carry must never overrule the feed. Every case below is one of those two.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ABSENT_DESIGNATION_CARRY_H, carryForwardDesignations } from "./carry-forward.mjs";
import { BLOCKING_STATUSES, INJURY_STATUSES, LONG_TERM_STATUSES, isBlockingStatus } from "./contract.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NOW = "2026-09-10T19:20:06Z";
// The measured case: committed 2026-09-10T16:44 capture vs a live one at 19:20.
const FIELDS = { sport: "nfl", providerTeamId: "3", athleteId: "4245655", athleteName: "Tony Fields II", status: "Injured Reserve", statedAt: "2026-08-31T23:12Z" };

test("THE BUG · a long-term designation that vanished from the feed is carried forward", () => {
  const { entries, carried } = carryForwardDesignations({ previousEntries: [FIELDS], currentEntries: [], nowIso: NOW });
  assert.equal(carried.length, 1);
  const row = entries.find((e) => e.athleteId === "4245655");
  assert.ok(row, "Tony Fields II survives the feed forgetting him");
  assert.equal(row.status, "Injured Reserve");
  assert.equal(row.statedAt, "2026-08-31T23:12Z", "the original statement date is kept, never restamped");
  assert.equal(row.carriedForward, true, "and it is marked, so the carry is auditable rather than silent");
  assert.equal(row.absentFromFeedSince, NOW);
});

test("the feed ALWAYS overrules the carry — a re-listed player is taken as the feed states him", () => {
  const relisted = { ...FIELDS, status: "Questionable", statedAt: "2026-09-10T18:00Z" };
  const { entries, carried, skipped } = carryForwardDesignations({ previousEntries: [FIELDS], currentEntries: [relisted], nowIso: NOW });
  assert.equal(carried.length, 0);
  assert.equal(entries.length, 1, "no duplicate row");
  assert.equal(entries[0].status, "Questionable", "the feed's newer statement wins");
  assert.equal(skipped.spokenInFeed, 1);
});

test("a game-week 'Out' is NOT carried — it legitimately clears when the game is played", () => {
  const out = { ...FIELDS, athleteId: "1", status: "Out", statedAt: "2026-09-08T12:00Z" };
  const { carried, skipped } = carryForwardDesignations({ previousEntries: [out], currentEntries: [], nowIso: NOW });
  assert.equal(carried.length, 0);
  assert.equal(skipped.gameWeekOut, 1);
});

test("every long-term status in the CONTRACT carries — including 'Suspension', which the old regex dropped", () => {
  const rows = LONG_TERM_STATUSES.nfl.map((status, i) => ({ ...FIELDS, athleteId: String(100 + i), status }));
  const { carried } = carryForwardDesignations({ previousEntries: rows, currentEntries: [], nowIso: NOW });
  assert.equal(carried.length, LONG_TERM_STATUSES.nfl.length);
  assert.ok(carried.some((e) => e.status === "Suspension"), "a vanished suspension must survive — four players were affected on 2026-09-10");
});

test("a status outside the contract vocabulary is never carried — it is not guessed into a bucket", () => {
  // The contract quarantines unlisted statuses before they reach a consumer; these can only appear
  // here through a malformed file, and a near-miss match is exactly the old regex's error.
  const rows = ["IR", "PUP", "NFI", "Suspended"].map((status, i) => ({ ...FIELDS, athleteId: String(200 + i), status }));
  const { carried } = carryForwardDesignations({ previousEntries: rows, currentEntries: [], nowIso: NOW });
  assert.equal(carried.length, 0);
});

test("a designation older than the window is NOT carried — the opposite error is also an error", () => {
  const old = { ...FIELDS, statedAt: "2026-08-20T00:00Z" }; // ~21 days before NOW
  const { carried, skipped } = carryForwardDesignations({ previousEntries: [old], currentEntries: [], nowIso: NOW });
  assert.equal(carried.length, 0);
  assert.equal(skipped.tooOld, 1);
});

test("an undated designation is NOT carried — there is no evidence of how recent it is", () => {
  const { carried, skipped } = carryForwardDesignations({ previousEntries: [{ ...FIELDS, statedAt: null }], currentEntries: [], nowIso: NOW });
  assert.equal(carried.length, 0);
  assert.equal(skipped.undated, 1);
});

test("a carried entry keeps the moment it FIRST went missing across captures", () => {
  const firstMissing = "2026-09-10T16:44:34Z";
  const alreadyCarried = { ...FIELDS, carriedForward: true, absentFromFeedSince: firstMissing };
  const { carried } = carryForwardDesignations({ previousEntries: [alreadyCarried], currentEntries: [], nowIso: NOW });
  assert.equal(carried[0].absentFromFeedSince, firstMissing, "the audit trail is not restamped every capture");
});

test("non-blocking and malformed previous entries are ignored, never carried", () => {
  const prev = [{ ...FIELDS, athleteId: "7", status: "Questionable" }, { status: "Injured Reserve" }, null, undefined];
  const { carried, entries } = carryForwardDesignations({ previousEntries: prev, currentEntries: [], nowIso: NOW });
  assert.equal(carried.length, 0);
  assert.equal(entries.length, 0);
});

test("the capture moment is required", () => {
  assert.throws(() => carryForwardDesignations({ previousEntries: [FIELDS], currentEntries: [] }), /nowIso required/);
});

test("the window is P251's window — the two cannot drift apart", () => {
  // The guard 'A STALE FEED CANNOT UN-DESIGNATE A PLAYER' demands OUT for designations within 336h
  // of kickoff. If this window were shorter, a carried designation could lapse while the guard
  // still requires it; if role evidence's changed, the carry would no longer match what it honours.
  const roleSrc = fs.readFileSync(path.resolve(HERE, "../../../../scripts/nfl/build-nfl-role-evidence.mjs"), "utf8");
  const m = /const DESIGNATION_CARRY_H = (\d+);/.exec(roleSrc);
  assert.ok(m, "role evidence still declares DESIGNATION_CARRY_H");
  assert.equal(ABSENT_DESIGNATION_CARRY_H, Number(m[1]));
});

/* MUTATION PROBE — a carry that ignored the feed would resurrect designations the feed has updated. */
test("probe: a carry that skipped the 'feed has spoken' check would be caught above", () => {
  const relisted = { ...FIELDS, status: "Active" };
  const { entries } = carryForwardDesignations({ previousEntries: [FIELDS], currentEntries: [relisted], nowIso: NOW });
  assert.ok(!entries.some((e) => e.carriedForward), "nothing may be carried over a player the feed re-listed");
});

test("DERIVATION · the blocking sets are subsets of the contract vocabulary, and pin the old miss", () => {
  for (const sport of Object.keys(BLOCKING_STATUSES)) {
    for (const b of BLOCKING_STATUSES[sport]) assert.ok(INJURY_STATUSES[sport].includes(b), `${sport}: "${b}" is not a status the contract emits`);
    for (const l of LONG_TERM_STATUSES[sport]) assert.ok(BLOCKING_STATUSES[sport].includes(l), `${sport}: long-term "${l}" must also be blocking`);
  }
  // The bug, pinned: the regex every consumer carried did NOT block a suspension. The predicate does.
  const OLD = /^(out|injured\s*reserve|ir|suspend|pup|nfi)/i;
  assert.equal(OLD.test("Suspension"), false, "the old regex missed it (seventh letter s, not d)");
  assert.equal(isBlockingStatus("Suspension"), true, "the contract-derived predicate does not");
  assert.equal(isBlockingStatus("Questionable"), false);
  assert.equal(isBlockingStatus("Active"), false);
});

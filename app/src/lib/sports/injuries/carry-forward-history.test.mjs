/**
 * Guards for recovering carried designations from the committed history.
 * Same four rules as the live carry — these prove the history path cannot bend them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { recoverFromHistory } from "./carry-forward.mjs";

const NOW = "2026-09-10T20:00:00Z";
const IR = (id, statedAt = "2026-09-01T00:55Z") => ({ sport: "nfl", providerTeamId: "3", athleteId: id, athleteName: `P${id}`, status: "Injured Reserve", statedAt });
const cap = (generatedAt, entries) => ({ generatedAt, entries });

test("a designation that aged out mid-history is recovered, with the moment the feed forgot it", () => {
  const r = recoverFromHistory({ nowIso: NOW, captures: [
    cap("2026-09-02T17:00:00Z", [IR("1")]),
    cap("2026-09-05T17:00:00Z", []),
    cap("2026-09-10T16:44:34Z", []),
  ] });
  assert.equal(r.carried.length, 1);
  assert.equal(r.carried[0].absentFromFeedSince, "2026-09-05T17:00:00Z", "first capture after its last appearance");
});

test("last-known status wins — a player re-listed as Questionable, then dropped, is not resurrected as IR", () => {
  const r = recoverFromHistory({ nowIso: NOW, captures: [
    cap("2026-09-02T17:00:00Z", [IR("2")]),
    cap("2026-09-05T17:00:00Z", [{ ...IR("2"), status: "Questionable", statedAt: "2026-09-05T12:00Z" }]),
    cap("2026-09-10T16:44:34Z", []),
  ] });
  assert.equal(r.carried.length, 0);
});

test("the current file always wins over history", () => {
  const r = recoverFromHistory({ nowIso: NOW, captures: [
    cap("2026-09-02T17:00:00Z", [IR("3")]),
    cap("2026-09-10T16:44:34Z", [{ ...IR("3"), status: "Active", statedAt: "2026-09-10T12:00Z" }]),
  ] });
  assert.equal(r.carried.length, 0);
  assert.equal(r.entries.length, 1);
});

test("history cannot stretch the window", () => {
  const r = recoverFromHistory({ nowIso: NOW, captures: [cap("2026-08-20T17:00:00Z", [IR("4", "2026-08-19T12:00Z")]), cap("2026-09-10T16:44:34Z", [])] });
  assert.equal(r.carried.length, 0);
  assert.equal(r.skipped.tooOld, 1);
});

test("idempotent — a row already carried in the current file is never duplicated", () => {
  const carried = { ...IR("5"), carriedForward: true, absentFromFeedSince: "2026-09-05T17:00:00Z" };
  const r = recoverFromHistory({ nowIso: NOW, captures: [cap("2026-09-02T17:00:00Z", [IR("5")]), cap("2026-09-10T16:44:34Z", [carried])] });
  assert.equal(r.carried.length, 0);
  assert.equal(r.entries.filter((e) => e.athleteId === "5").length, 1);
});

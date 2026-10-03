/** Session 9 · I1/I2 — account sync is a union with a last-synced baseline: nothing is silently removed. */
import test from "node:test";
import assert from "node:assert/strict";
import { describeSync, followRefOfRow, planFollowSync, planSavedSync, savedRowOf, sportOfEntityId } from "./account-sync.mjs";
import { isSavedForecast } from "../saved/saved-schema.mjs";

const T = (id) => ({ sport: id.startsWith("mlb") ? "MLB" : "NFL", entityType: id.includes("athlete") ? "player" : "team", id });
const row = (id) => ({ kind: id.includes("athlete") ? "player" : "team", entity_id: id, label: null });
const snap = (id) => ({ schemaVersion: 1, id, sport: "MLB", href: `/mlb/game/${id}`, startUtc: "2026-10-04T17:00:00Z", matchup: "A @ B", context: null, family: "winner", value: "B", sub: null, signal: null, modelState: "PUBLISHED", modelFamily: null, updatedAt: null, settlement: { kind: "mlb-game", gamePk: Number(id), family: "winner" }, savedAt: "2026-10-02T10:00:00Z", sourceRoute: "/mlb" });
const valid = (x) => (isSavedForecast(x) ? x : null);

test("first sign-in: a union — device-only goes up, account-only comes down, NOTHING is removed", () => {
  const p = planFollowSync([T("nfl-team-2"), T("mlb-team-147")], [row("nfl-team-2"), row("nfl-athlete-9")], null);
  assert.deepEqual(p.toAccount.map((r) => r.entity_id), ["mlb-team-147"]);
  assert.deepEqual(p.toDevice.map((r) => r.id), ["nfl-athlete-9"]);
  assert.deepEqual([p.removeFromAccount, p.removeFromDevice, p.both], [[], [], 1]);
  assert.match(describeSync(p, planSavedSync([], [], valid)), /added here/);
});

test("an unfollow since the last sync propagates; an id that was never synced is added, not removed", () => {
  const last = ["MLB:team:mlb-team-147", "NFL:team:nfl-team-2"];
  // device unfollowed nfl-team-2 after the last sync; account still has it
  const p = planFollowSync([T("mlb-team-147")], [row("mlb-team-147"), row("nfl-team-2"), row("nfl-team-5")], last);
  assert.deepEqual(p.removeFromAccount, [{ kind: "team", entity_id: "nfl-team-2" }]);
  assert.deepEqual(p.toDevice.map((r) => r.id), ["nfl-team-5"], "followed on another device since: added, never removed");
  // the account dropped it on another device
  const q = planFollowSync([T("mlb-team-147"), T("nfl-team-2")], [row("mlb-team-147")], last);
  assert.deepEqual(q.removeFromDevice.map((r) => r.id), ["nfl-team-2"]);
});

test("a non-canonical account row is refused, never adopted (a name is not an identity)", () => {
  assert.equal(followRefOfRow({ kind: "team", entity_id: "Seattle Seahawks" }), null);
  assert.equal(sportOfEntityId("nba-team-1"), null);
  assert.equal(planFollowSync([], [{ kind: "team", entity_id: "Giants" }]).refused, 1);
});

test("saves: union by id, the device snapshot stands, invalid account snapshots are refused", () => {
  const p = planSavedSync([snap("1")], [{ kind: "official_forecast", ref: "1", snapshot: { ...snap("1"), value: "A" } }, { kind: "official_forecast", ref: "2", snapshot: snap("2") }, { kind: "official_forecast", ref: "3", snapshot: { id: "3" } }], valid, null);
  assert.deepEqual(p.toDevice.map((x) => x.id), ["2"]);
  assert.deepEqual([p.toAccount.length, p.both, p.refused], [0, 1, 1]);
  assert.equal(savedRowOf(snap("4")).kind, "official_forecast");
  assert.equal(savedRowOf({ ...snap("5"), sub: "x".repeat(9000) }), null, "an oversized snapshot is refused");
});

test("sync reads no result, bet, P/L or bankroll — the module names none of them", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("./account-sync.mjs", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.ok(!/bet_slips|bankroll|pnl|profit|returned|stake/i.test(src));
});

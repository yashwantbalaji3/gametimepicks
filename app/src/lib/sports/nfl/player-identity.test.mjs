/**
 * NFL player-identity guards (Program 169 · Release A).
 * Run: npx tsx --test src/lib/sports/nfl/player-identity.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPlayerRegistry, resolvePlayerRef, normalizeRosterRow } from "./player-identity.mjs";

const CAP = (generatedAt, teams) => ({ generatedAt, teams });
const P = (id, fullName, extra = {}) => ({ id, fullName, position: { abbreviation: "RB" }, jersey: "26", ...extra });

test("rows without durable ids or names quarantine — identity is never minted", () => {
  const bad = normalizeRosterRow({ fullName: "No Id Player" }, { teamAbbr: "CIN", capturedAt: "2026-08-13T00:00:00Z" });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /never minted/);
  const reg = buildPlayerRegistry([CAP("2026-08-13T00:00:00Z", [{ teamAbbr: "CIN", players: [P("1", "Real Player"), { fullName: "Ghost" }, { id: "x9", fullName: "Weird Id" }] }])]);
  assert.equal(reg.accounting.registered, 1);
  assert.equal(reg.accounting.quarantined, 2);
  assert.equal(reg.accounting.input, 3, "population-exact");
});

test("same athlete on two teams inside ONE capture quarantines both rows", () => {
  const reg = buildPlayerRegistry([CAP("2026-08-13T00:00:00Z", [
    { teamAbbr: "CIN", players: [P("7", "Twice Listed")] },
    { teamAbbr: "DET", players: [P("7", "Twice Listed")] },
  ])]);
  assert.equal(reg.players.has("nfl-athlete-7"), false);
  assert.ok(reg.quarantined.some((q) => /two teams/.test(q.reason)));
});

test("across captures the newest membership wins and history is preserved (trade lineage)", () => {
  const reg = buildPlayerRegistry([
    CAP("2026-08-01T00:00:00Z", [{ teamAbbr: "CIN", players: [P("7", "Moves Around")] }]),
    CAP("2026-08-13T00:00:00Z", [{ teamAbbr: "DET", players: [P("7", "Moves Around")] }]),
  ]);
  const p = reg.players.get("nfl-athlete-7");
  assert.equal(p.teamAbbr, "DET", "current membership is the newest capture's");
  assert.deepEqual(p.memberships.map((m) => m.teamAbbr), ["CIN", "DET"], "the old team is history, not identity");
});

test("resolvePlayerRef: unique resolves, team scoping applies lineage, ambiguity quarantines", () => {
  const reg = buildPlayerRegistry([CAP("2026-08-13T00:00:00Z", [
    { teamAbbr: "CIN", players: [P("1", "Ja'Marr Chase"), P("2", "John Smith")] },
    { teamAbbr: "DET", players: [P("3", "John Smith")] },
  ])]);
  assert.equal(resolvePlayerRef(reg, { name: "Ja'Marr Chase" }).state, "RESOLVED");
  assert.equal(resolvePlayerRef(reg, { name: "JaMarr chase" }).state, "RESOLVED", "diacritics/punctuation are presentation");
  const ambig = resolvePlayerRef(reg, { name: "John Smith" });
  assert.equal(ambig.state, "AMBIGUOUS");
  assert.equal(ambig.candidates.length, 2);
  assert.equal(resolvePlayerRef(reg, { name: "John Smith", teamAbbr: "DET" }).state, "RESOLVED", "team context disambiguates");
  assert.equal(resolvePlayerRef(reg, { name: "Ja'Marr Chase", teamAbbr: "DET" }).state, "UNRESOLVED", "wrong team context refuses — stale membership never joins");
  assert.equal(resolvePlayerRef(reg, { name: "Nobody Real" }).state, "UNRESOLVED");
});

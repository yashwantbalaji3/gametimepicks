/**
 * NFL player-identity guards (Program 169 · Release A).
 * Run: npx tsx --test src/lib/sports/nfl/player-identity.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPlayerRegistry, resolvePlayerRef, normalizeRosterRow, stripGenerationalSuffix } from "./player-identity.mjs";

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

/**
 * GENERATIONAL SUFFIXES — the eight real markets a strict name match was hiding.
 *
 * ⚠ MEASURED, NOT IMAGINED. The first full-week NFL prop sweep quarantined twelve player labels as
 * "unresolved against either roster". Eight were a suffix disagreement between the sportsbook and
 * ESPN, in BOTH directions, and every one of them reached a reader as "Not offered" — a measured
 * negative ABOUT THE BOOKS that was in fact a failure of our own join.
 */
test("resolvePlayerRef: a generational suffix is set aside — but only on a miss, and only when unique", () => {
  const reg = buildPlayerRegistry([CAP("2026-09-25T00:00:00Z", [
    { teamAbbr: "BUF", players: [P("10", "James Cook III"), P("11", "Josh Allen")] },
    { teamAbbr: "LAC", players: [P("12", "Oronde Gadsden")] },
  ])]);
  // the book drops a suffix the roster carries…
  const cook = resolvePlayerRef(reg, { name: "James Cook", teamAbbr: "BUF" });
  assert.equal(cook.state, "RESOLVED");
  assert.equal(cook.playerId, "nfl-athlete-10");
  assert.equal(cook.basis, "generational-suffix-in-team", "the basis SAYS how it resolved — a looser match must be visible, never silent");
  // …and the other direction: the book carries one the roster does not
  assert.equal(resolvePlayerRef(reg, { name: "Oronde Gadsden II", teamAbbr: "LAC" }).playerId, "nfl-athlete-12");
  // an exact match must never be beaten by a stripped one
  assert.equal(resolvePlayerRef(reg, { name: "Josh Allen", teamAbbr: "BUF" }).basis, "unique-name-in-team");
  // and a name that matches nothing, stripped or not, still refuses
  assert.equal(resolvePlayerRef(reg, { name: "Dallen Bentley", teamAbbr: "BUF" }).state, "UNRESOLVED");
});

test("resolvePlayerRef: a father and son on ONE roster quarantine — the fallback never guesses", () => {
  /*
   * THE CONTROL THAT MAKES THE FALLBACK SAFE. Two players whose names differ only by a suffix
   * collapse to the same stripped key. If the fallback picked either one it would be minting an
   * identity from a label, which is the rule this whole module exists to enforce — so it refuses,
   * and says that setting the suffix aside is what made them ambiguous.
   */
  const reg = buildPlayerRegistry([CAP("2026-09-25T00:00:00Z", [
    { teamAbbr: "ARI", players: [P("20", "Marvin Harrison"), P("21", "Marvin Harrison Jr.")] },
  ])]);
  assert.equal(resolvePlayerRef(reg, { name: "Marvin Harrison Jr.", teamAbbr: "ARI" }).playerId, "nfl-athlete-21",
    "an EXACT match still wins outright — the ambiguity below is only in the fallback");
  const ambiguous = resolvePlayerRef(reg, { name: "Marvin Harrison III", teamAbbr: "ARI" });
  assert.equal(ambiguous.state, "AMBIGUOUS");
  assert.match(ambiguous.reason, /generational suffix is set aside/);
  assert.equal(ambiguous.candidates.length, 2);
});

test("stripGenerationalSuffix never erases a name", () => {
  assert.equal(stripGenerationalSuffix("james cook iii"), "james cook");
  assert.equal(stripGenerationalSuffix("aaron jones sr"), "aaron jones");
  /* Two tokens are a first and last name; stripping there could delete half an identity. */
  assert.equal(stripGenerationalSuffix("john v"), "john v", "a two-token name is left alone");
  assert.equal(stripGenerationalSuffix("ceedee lamb"), "ceedee lamb", "a non-suffix last token is untouched");
  assert.equal(stripGenerationalSuffix("amonra st brown"), "amonra st brown");
  assert.equal(stripGenerationalSuffix(""), "");
});

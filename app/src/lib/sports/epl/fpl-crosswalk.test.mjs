/**
 * P700 — the ESPN ↔ FPL crosswalk. Candidate generation, and the fail-closed read over it.
 *
 * THE FAILURE THIS EXISTS TO PREVENT is attaching an injury to the wrong player. Every assertion
 * below is a way that could happen: a club that silently drops, two squad-mates with one name, a
 * shared given name proposed as a match, an unresolved row defaulting to available, or a review
 * tier quietly admitted as if it were reviewed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildCrosswalk, resolveClubs, normaliseName, isTokenPrefix, availabilityByEspnId, FPL_TO_ESPN_CLUB, FPL_STATUS } from "./fpl-crosswalk.mjs";

const team = (id, name, short) => ({ id, name, short_name: short });
const squad = (teamId, abbreviation, players) => ({ teamId, teamName: abbreviation, abbreviation, players });
const pl = (playerId, name, position = "M") => ({ playerId, name, position });
const el = (id, team, first, second, over = {}) => ({ id, team, first_name: first, second_name: second, web_name: second, code: 1000 + id, opta_code: `p${1000 + id}`, status: "a", chance_of_playing_next_round: null, news: "PROSE THAT MUST NOT BE STORED", news_added: "2026-09-20T10:00:00Z", ...over });

test("P700 · 18 of 20 clubs share a code; the two that do not are an explicit table", () => {
  assert.deepEqual(Object.keys(FPL_TO_ESPN_CLUB).sort(), ["MCI", "MUN"]);
  const r = resolveClubs({ fplTeams: [team(1, "Man City", "MCI"), team(2, "Man Utd", "MUN"), team(3, "Arsenal", "ARS")],
    espnSquads: [squad(382, "MNC", []), squad(360, "MAN", []), squad(359, "ARS", [])] });
  assert.equal(r.ok, true);
  assert.equal(r.map.get(1).teamId, 382, "MCI must reach Manchester City");
  assert.equal(r.map.get(2).teamId, 360, "MUN must reach Manchester United");
});

test("P700 · a club that does not resolve REFUSES — it never drops its squad silently", () => {
  const r = resolveClubs({ fplTeams: [team(1, "Wrexham", "WRX")], espnSquads: [squad(359, "ARS", [])] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Wrexham \(WRX → WRX\)/);
});

test("P700 · two ESPN squads sharing an abbreviation REFUSES", () => {
  const r = resolveClubs({ fplTeams: [], espnSquads: [squad(1, "ARS", []), squad(2, "ARS", [])] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /share the abbreviation ARS/);
});

test("P700 · an exact normalised name unique inside the club is AUTO_EXACT — accents and all", () => {
  const cw = buildCrosswalk({
    fplElements: [el(1, 1, "Martín", "Ødegaard")],
    fplTeams: [team(1, "Arsenal", "ARS")],
    espnSquads: [squad(359, "ARS", [pl("111", "Martin Odegaard")])],
  });
  assert.equal(cw.rows[0].state, "AUTO_EXACT");
  assert.equal(cw.rows[0].espnPlayerId, "111");
});

test("P700 · two squad-mates with the same normalised name resolve to NEITHER", () => {
  // Picking the first would be a coin flip on identity, and the loser gets someone else's injury.
  const cw = buildCrosswalk({
    fplElements: [el(1, 1, "Danny", "Ward")],
    fplTeams: [team(1, "Arsenal", "ARS")],
    espnSquads: [squad(359, "ARS", [pl("1", "Danny Ward"), pl("2", "Danny Ward")])],
  });
  assert.equal(cw.rows[0].state, "UNRESOLVED");
  assert.equal(cw.rows[0].espnPlayerId, null);
  assert.match(cw.rows[0].reason, /2 ESPN players in ARS share this normalised name/);
});

test("P700 · a token-prefix unique in the club is REVIEW_PREFIX — proposed, not mapped", () => {
  const cw = buildCrosswalk({
    fplElements: [el(1, 1, "Mikel", "Merino Zazón")],
    fplTeams: [team(1, "Arsenal", "ARS")],
    espnSquads: [squad(359, "ARS", [pl("222", "Mikel Merino")])],
  });
  assert.equal(cw.rows[0].state, "REVIEW_PREFIX");
  assert.equal(cw.rows[0].espnPlayerId, "222");
  // ⚠ and it is NOT admitted by the default read.
  assert.equal(availabilityByEspnId(cw).has("222"), false, "a review tier must not be readable as if it were reviewed");
  assert.equal(availabilityByEspnId(cw, { require: ["REVIEW_PREFIX"] }).has("222"), true, "it is readable only when asked for explicitly");
});

test("P700 · a prefix that is NOT unique in the club stays UNRESOLVED", () => {
  const cw = buildCrosswalk({
    fplElements: [el(1, 1, "Gabriel", "Silva Santos Junior")],
    fplTeams: [team(1, "Arsenal", "ARS")],
    // BOTH are genuine leading prefixes, of different lengths — so neither is unique.
    espnSquads: [squad(359, "ARS", [pl("1", "Gabriel Silva"), pl("2", "Gabriel Silva Santos")])],
  });
  assert.equal(cw.rows[0].state, "UNRESOLVED");
});

test("P700 · a shared GIVEN NAME alone is not a candidate", () => {
  // The first cut proposed "Leon Goretzka → Leon Bailey". A reviewer shown that once stops
  // trusting the column.
  const cw = buildCrosswalk({
    fplElements: [el(1, 1, "Leon", "Goretzka")],
    fplTeams: [team(1, "Aston Villa", "AVL")],
    espnSquads: [squad(362, "AVL", [pl("9", "Leon Bailey")])],
  });
  assert.equal(cw.rows[0].state, "UNRESOLVED");
  assert.deepEqual(cw.rows[0].candidates, [], "a shared first name proposes nobody");
});

test("P700 · a reversed name order IS surfaced as a candidate, never as a match", () => {
  const cw = buildCrosswalk({
    fplElements: [el(1, 1, "Tanaka", "Ao")],
    fplTeams: [team(1, "Leeds", "LEE")],
    espnSquads: [squad(357, "LEE", [pl("7", "Ao Tanaka")])],
  });
  assert.equal(cw.rows[0].state, "UNRESOLVED", "a reversal is a reviewer's call, not a matcher's");
  assert.equal(cw.rows[0].candidates.length, 1);
  assert.equal(cw.rows[0].candidates[0].name, "Ao Tanaka");
});

test("P700 · editorial prose is never carried into a row", () => {
  const cw = buildCrosswalk({
    fplElements: [el(1, 1, "Mikel", "Merino", { status: "i", chance_of_playing_next_round: 25 })],
    fplTeams: [team(1, "Arsenal", "ARS")],
    espnSquads: [squad(359, "ARS", [pl("1", "Mikel Merino")])],
  });
  const row = cw.rows[0];
  assert.equal(row.availability, "INJURED");
  assert.equal(row.chanceOfPlayingNextRound, 25);
  assert.equal(row.newsAddedAt, "2026-09-20T10:00:00Z");
  assert.ok(!JSON.stringify(row).includes("PROSE THAT MUST NOT BE STORED"), "the free-text reason must not reach the artifact");
});

test("P700 · every FPL status maps to a named state, and an unknown one is UNKNOWN not AVAILABLE", () => {
  assert.deepEqual(Object.keys(FPL_STATUS).sort(), ["a", "d", "i", "s", "u"]);
  const cw = buildCrosswalk({
    fplElements: [el(1, 1, "New", "Code", { status: "x" })],
    fplTeams: [team(1, "Arsenal", "ARS")],
    espnSquads: [squad(359, "ARS", [pl("1", "New Code")])],
  });
  assert.equal(cw.rows[0].availability, "UNKNOWN", "an unrecognised code must never read as available");
});

test("P700 · FAIL CLOSED · an unresolved player is absent from the index, never 'available'", () => {
  const cw = buildCrosswalk({
    fplElements: [el(1, 1, "Ezri", "Konsa Ngoyo", { status: "i" })],
    fplTeams: [team(1, "Arsenal", "ARS")],
    espnSquads: [squad(359, "ARS", [pl("1", "Someone Else")])],
  });
  assert.equal(cw.rows[0].state, "UNRESOLVED");
  const idx = availabilityByEspnId(cw);
  assert.equal(idx.size, 0);
  assert.equal(idx.get("1"), undefined, "the caller gets undefined and must treat it as unknown");
});

test("P700 · the index carries its own provenance, so a wrong row is traceable", () => {
  const cw = buildCrosswalk({
    fplElements: [el(5, 1, "Bukayo", "Saka")],
    fplTeams: [team(1, "Arsenal", "ARS")],
    espnSquads: [squad(359, "ARS", [pl("42", "Bukayo Saka")])],
  });
  const hit = availabilityByEspnId(cw).get("42");
  assert.equal(hit.via.fplId, 5);
  assert.equal(hit.via.optaCode, "p1005");
  assert.equal(hit.via.state, "AUTO_EXACT");
});

test("P700 · normaliseName does not reorder, abbreviate or drop tokens", () => {
  assert.equal(normaliseName("Đorđe Petrović"), "dorde petrovic");
  assert.equal(normaliseName("Jurriën  Timber"), "jurrien timber");
  assert.notEqual(normaliseName("Ao Tanaka"), normaliseName("Tanaka Ao"), "reordering here would fabricate matches");
  assert.equal(isTokenPrefix("mikel merino zazon", "mikel merino"), true);
  assert.equal(isTokenPrefix("mikel merino", "mikel merino"), false, "equal lengths are the exact case, not a prefix");
  assert.equal(isTokenPrefix("merino zazon", "mikel merino"), false, "a shared middle token is not a prefix");
});

test("P700 · counts reconcile to the element total — no row is invented or lost", () => {
  const cw = buildCrosswalk({
    fplElements: [el(1, 1, "Bukayo", "Saka"), el(2, 1, "Mikel", "Merino Zazón"), el(3, 1, "Nobody", "Here")],
    fplTeams: [team(1, "Arsenal", "ARS")],
    espnSquads: [squad(359, "ARS", [pl("1", "Bukayo Saka"), pl("2", "Mikel Merino")])],
  });
  const c = cw.counts;
  assert.equal(c.fplElements, 3);
  assert.equal(c.autoExact + c.reviewPrefix + c.unresolved, c.fplElements);
  assert.equal(cw.rows.length, c.fplElements);
});

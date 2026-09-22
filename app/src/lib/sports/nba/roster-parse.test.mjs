/**
 * NBA roster contract guards (N-4): a traded player is on the new team only; rookies with no
 * box-score history are present; duplicate display names are disambiguated by athlete id; a row
 * without an athlete id is refused (never invented); a failed/empty team fetch is MISSING, never
 * an empty roster; normalisation is deterministic (same input → byte-identical output).
 * NBA PRESEASON — EXPERIMENTAL · PRIVATE_RESEARCH.
 *
 * Run: npx tsx --test src/lib/sports/nba/roster-parse.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildRosterArtifact, parseRosterPayload, normalizeAthlete, serializeRosterArtifact, rosterContentKey } from "./roster-parse.mjs";
import { ESPN_NBA_TEAMS, ROSTER_SIZE_BOUNDS, TEAM_STATES, rosterIndex, rosterForTeam, espnTeamById, compareAthleteIds, ROSTER_ROW_KEYS } from "./roster-contract.mjs";

const NOW = "2026-09-22T06:00:00Z";
// Shapes mirror the real 2026-09-22 payloads (docs/V17_NBA_READINESS_RECEIPT.md, roster owner section).
const ath = (id, displayName, over = {}) => ({
  id, uid: `s:40~l:46~a:${id}`, firstName: displayName.split(" ")[0], lastName: displayName.split(" ").slice(1).join(" "), fullName: displayName, displayName,
  shortName: `${displayName[0]}. ${displayName.split(" ").slice(1).join(" ")}`, age: 25, position: { abbreviation: "F", name: "Forward" },
  status: { id: "1", name: "Active", type: "active", abbreviation: "Active" }, injuries: [], contracts: [{ salary: 1 }], experience: { years: 5 }, jersey: "7", ...over,
});
const GIANNIS = ath("3032977", "Giannis Antetokounmpo", { experience: { years: 13 }, debutYear: 2013, contracts: Array(14).fill({ salary: 1 }), injuries: [{ status: "Day-To-Day", date: "2026-09-02T16:32Z" }] });
const CONWELL = ath("5107157", "Ryan Conwell", { position: { abbreviation: "G" }, experience: { years: 0 }, contracts: [], jersey: undefined, injuries: [{ status: "Day-To-Day", date: "2026-07-15T18:28Z" }] });
const payload = (team, athletes, over = {}) => ({ timestamp: "2026-09-22T05:56:19Z", status: "success", season: { year: 2027, displayName: "2026-27", type: 1, name: "Preseason" }, athletes, team: { id: team.providerTeamId, abbreviation: team.espnAbbr, displayName: team.canonicalTricode }, ...over });
const T = Object.fromEntries(ESPN_NBA_TEAMS.map((t) => [t.canonicalTricode, t]));
const PREFIX_CODE = { m: 7, k: 8, b: 2, d: 6, t: 3 }; // numeric ids like the provider's
const filler = (prefix, n, from = 0) => Array.from({ length: n }, (_, i) => ath(`${PREFIX_CODE[prefix]}${String(100 + from + i)}`, `Filler ${prefix}${from + i}`));

test("registry: 30 ESPN team ids resolve to 30 distinct canonical tricodes; ids are numeric-ordered", () => {
  assert.equal(ESPN_NBA_TEAMS.length, 30);
  assert.equal(new Set(ESPN_NBA_TEAMS.map((t) => t.canonicalTricode)).size, 30);
  assert.ok(ESPN_NBA_TEAMS.every((t) => t.canonicalTricode != null), "no ESPN abbreviation may fail canonical resolution");
  assert.deepEqual(espnTeamById("14"), { providerTeamId: "14", espnAbbr: "MIA", canonicalTricode: "MIA" });
  assert.deepEqual(espnTeamById("9"), { providerTeamId: "9", espnAbbr: "GS", canonicalTricode: "GSW" });
  assert.equal(espnTeamById("9999"), null);
  assert.deepEqual(["5107157", "6475", "3032977"].sort(compareAthleteIds), ["6475", "3032977", "5107157"]);
});

test("traded player: appears ONLY on the new team; a stale double listing is flagged, never silently deduplicated", () => {
  const a = buildRosterArtifact({ capturedAt: NOW, teamResults: [
    { providerTeamId: "14", payload: payload(T.MIA, [GIANNIS, ...filler("m", 14)]) },
    { providerTeamId: "15", payload: payload(T.MIL, filler("k", 15)) },
  ] });
  const idx = rosterIndex(a);
  assert.deepEqual(idx.get("3032977"), { providerTeamId: "14", canonicalTricode: "MIA", displayName: "Giannis Antetokounmpo" });
  assert.equal(rosterForTeam(a, "15").players.some((p) => p.providerAthleteId === "3032977"), false, "no MIL row");
  assert.deepEqual(a.manifest.athletesOnMultipleTeams, []);
  const g = rosterForTeam(a, "14").players.find((p) => p.providerAthleteId === "3032977");
  assert.equal(g.injuryStatus, "Day-To-Day");
  assert.equal(g.canonicalTricode, "MIA");
  assert.equal(g.contractSeasonsOnRecord, 14);
  // Stale provider page listing him on both teams: both rows stay, the manifest names the id.
  const stale = buildRosterArtifact({ capturedAt: NOW, teamResults: [
    { providerTeamId: "14", payload: payload(T.MIA, [GIANNIS, ...filler("m", 14)]) },
    { providerTeamId: "15", payload: payload(T.MIL, [GIANNIS, ...filler("k", 14)]) },
  ] });
  assert.deepEqual(stale.manifest.athletesOnMultipleTeams, [{ providerAthleteId: "3032977", teams: ["MIA", "MIL"] }]);
  assert.equal(rosterForTeam(stale, "15").players.filter((p) => p.providerAthleteId === "3032977").length, 1);
});

test("rookies with no box-score history are present with honest nulls (jersey null, 0 years, no contract rows)", () => {
  const a = buildRosterArtifact({ capturedAt: NOW, teamResults: [{ providerTeamId: "14", payload: payload(T.MIA, [CONWELL, GIANNIS, ...filler("m", 13)]) }] });
  const c = rosterForTeam(a, "14").players.find((p) => p.providerAthleteId === "5107157");
  assert.ok(c, "rookie row present");
  assert.equal(c.jersey, null, "no jersey is null, never '0'");
  assert.equal(c.experienceYears, 0);
  assert.equal(c.debutYear, null);
  assert.equal(c.contractSeasonsOnRecord, 0);
  assert.equal(c.rosterStatus, "Active", "two-way is not exposed by the provider; the verbatim status is kept");
  assert.deepEqual(Object.keys(c), [...ROSTER_ROW_KEYS], "every contract key present in contract order");
  assert.equal(a.manifest.playersWithoutJersey, 1);
});

test("duplicate display names are kept as separate rows, disambiguated by athlete id, and listed in the manifest", () => {
  const a = buildRosterArtifact({ capturedAt: NOW, teamResults: [
    { providerTeamId: "2", payload: payload(T.BOS, [ath("1966", "Jaylen Brown"), ...filler("b", 14)]) },
    { providerTeamId: "6", payload: payload(T.DAL, [ath("5000001", "Jaylen Brown"), ...filler("d", 14)]) },
  ] });
  assert.equal(rosterForTeam(a, "2").players.filter((p) => p.displayName === "Jaylen Brown").length, 1);
  assert.equal(rosterForTeam(a, "6").players.filter((p) => p.displayName === "Jaylen Brown").length, 1);
  assert.deepEqual(a.manifest.duplicateDisplayNames, [{ displayName: "jaylen brown", rows: [{ providerAthleteId: "1966", team: "BOS" }, { providerAthleteId: "5000001", team: "DAL" }] }]);
  assert.deepEqual(a.manifest.athletesOnMultipleTeams, [], "different ids are different people");
});

test("a row without an athlete id is REFUSED and recorded — an id is never invented", () => {
  const r = normalizeAthlete({ displayName: "Nameless Placeholder", position: { abbreviation: "G" } }, T.MIA, NOW);
  assert.deepEqual(r, { refused: { reason: "missing athlete id", displayName: "Nameless Placeholder" } });
  assert.deepEqual(normalizeAthlete({ id: "", displayName: "Blank Id" }, T.MIA, NOW).refused.reason, "missing athlete id");
  const a = buildRosterArtifact({ capturedAt: NOW, teamResults: [{ providerTeamId: "14", payload: payload(T.MIA, [{ displayName: "Nameless Placeholder" }, GIANNIS, ...filler("m", 13)]) }] });
  const mia = rosterForTeam(a, "14");
  assert.equal(mia.playerCount, 14);
  assert.ok(mia.players.every((p) => /^\d+$/.test(p.providerAthleteId)));
  assert.deepEqual(a.manifest.rowsRefused, [{ providerTeamId: "14", canonicalTricode: "MIA", reason: "missing athlete id", displayName: "Nameless Placeholder" }]);
  // Every row refused → the team is MISSING, not a roster of zero.
  const allBad = parseRosterPayload(payload(T.MIA, [{ displayName: "A" }, { displayName: "B" }]), { providerTeamId: "14", capturedAt: NOW });
  assert.equal(allBad.state, TEAM_STATES.MISSING);
  assert.equal(allBad.players, null);
  assert.equal(allBad.refused.length, 2);
});

test("failed or empty team fetch is MISSING (players null), never an empty roster; every one of the 30 is always present", () => {
  for (const [label, payloadOrNull, err] of [
    ["fetch error", null, "http_503"],
    ["no payload", null, null],
    ["provider status", { status: "error", athletes: [ath("1", "X")] }, null],
    ["no athletes array", { status: "success", team: {} }, null],
    ["empty athletes", { status: "success", athletes: [] }, null],
  ]) {
    const t = parseRosterPayload(payloadOrNull, { providerTeamId: "14", capturedAt: NOW, fetchError: err });
    assert.equal(t.state, TEAM_STATES.MISSING, label);
    assert.equal(t.players, null, `${label}: players must be null, not []`);
    assert.equal(t.playerCount, null, label);
    assert.ok(typeof t.reason === "string" && t.reason.length > 0, label);
    assert.equal(t.canonicalTricode, "MIA", "identity is kept even when the roster is missing");
  }
  assert.equal(parseRosterPayload({ status: "success", athletes: [ath("1", "X")] }, { providerTeamId: "9999", capturedAt: NOW }).state, TEAM_STATES.MISSING, "unknown team id is never a franchise");
  const a = buildRosterArtifact({ capturedAt: NOW, teamResults: [
    { providerTeamId: "14", payload: payload(T.MIA, [GIANNIS, ...filler("m", 14)]) },
    { providerTeamId: "15", payload: null, fetchError: "timeout" },
  ] });
  assert.equal(a.teams.length, 30);
  assert.equal(a.manifest.teamsCaptured, 1);
  assert.equal(a.manifest.teamsMissing, 29);
  assert.equal(a.manifest.missingTeams.find((m) => m.providerTeamId === "15").reason, "fetch failed: timeout");
  assert.equal(a.manifest.missingTeams.find((m) => m.providerTeamId === "28").reason, "fetch failed: not attempted");
  assert.equal(rosterForTeam(a, "15"), null);
  assert.equal(rosterIndex(a).size, 15, "only CAPTURED teams are indexed");
  assert.equal(a.productEligible, false);
  assert.equal(a.dataClass, "PRIVATE_RESEARCH");
  assert.match(a.neverReadBy, /app\/src\/app/);
  assert.equal(a.asOf, NOW);
});

test("size flags: fewer than 13 or more than 21 players is flagged, never truncated", () => {
  const a = buildRosterArtifact({ capturedAt: NOW, teamResults: [
    { providerTeamId: "14", payload: payload(T.MIA, filler("m", 12)) },
    { providerTeamId: "15", payload: payload(T.MIL, filler("k", 22)) },
    { providerTeamId: "28", payload: payload(T.TOR, filler("t", 18)) },
  ] });
  assert.deepEqual(a.manifest.teamsOutOfBounds.map((x) => [x.canonicalTricode, x.playerCount]), [["MIA", 12], ["MIL", 22]]);
  assert.equal(rosterForTeam(a, "15").playerCount, 22);
  assert.deepEqual(ROSTER_SIZE_BOUNDS, { min: 13, max: 21 });
});

test("deterministic: shuffled input order and shuffled team order → byte-identical artifact; capturedAt is excluded from the content key", () => {
  const mia = [CONWELL, GIANNIS, ...filler("m", 13)];
  const mil = filler("k", 15);
  const a = buildRosterArtifact({ capturedAt: NOW, teamResults: [{ providerTeamId: "14", payload: payload(T.MIA, mia) }, { providerTeamId: "15", payload: payload(T.MIL, mil) }] });
  const b = buildRosterArtifact({ capturedAt: NOW, teamResults: [{ providerTeamId: "15", payload: payload(T.MIL, [...mil].reverse()) }, { providerTeamId: "14", payload: payload(T.MIA, [...mia].reverse()) }] });
  assert.equal(serializeRosterArtifact(a), serializeRosterArtifact(b));
  assert.deepEqual(rosterForTeam(a, "14").players.map((p) => p.providerAthleteId), mia.map((x) => x.id).sort(compareAthleteIds), "rows ordered by numeric athlete id regardless of input order");
  assert.deepEqual(a.teams.map((t) => t.canonicalTricode).slice(0, 3), ["ATL", "BKN", "BOS"], "teams ordered by canonical tricode");
  const later = buildRosterArtifact({ capturedAt: "2026-09-23T06:00:00Z", teamResults: [{ providerTeamId: "14", payload: payload(T.MIA, mia) }, { providerTeamId: "15", payload: payload(T.MIL, mil) }] });
  assert.notEqual(serializeRosterArtifact(a), serializeRosterArtifact(later));
  assert.equal(rosterContentKey(a), rosterContentKey(later), "same membership on a later day is the same content");
  const moved = buildRosterArtifact({ capturedAt: NOW, teamResults: [{ providerTeamId: "14", payload: payload(T.MIA, mia.slice(1)) }, { providerTeamId: "15", payload: payload(T.MIL, [CONWELL, ...mil]) }] });
  assert.notEqual(rosterContentKey(a), rosterContentKey(moved), "a move changes the content key");
});

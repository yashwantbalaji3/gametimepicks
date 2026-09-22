/**
 * Roster-gated pool v0.1 (v1.8 A1) — every rule is a test, every guard has a mutation probe.
 * NBA PRESEASON — EXPERIMENTAL · PRIVATE_RESEARCH · productEligible:false. Nothing here is public.
 *
 * Run: npx tsx --test src/lib/sports/nba/roster-gated-pool.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { gatePool, checkRosterFreshness, lastAppearanceTeamIndex, POOL_VERSION, ROSTER_MAX_AGE_HOURS, MINUTES_STATES, HISTORY_BASES, GATE_REFUSALS } from "./roster-gated-pool.mjs";
import { expectedMinutes } from "./minutes-model.mjs";
import { buildForecastArtifact, familySpec, familyGuard, FAMILIES } from "./experimental-forecast.mjs";
import { simulateGame } from "./game-sim.mjs";

const NOW = "2026-09-22T12:00:00Z";
const TOR = "28", MIA = "14", MIL = "15";
const player = (id, team, over = {}) => ({ providerAthleteId: id, name: `P${id}`, providerTeamId: team, starter: true, didNotPlay: false, dnpReason: null, minutes: 30, pts: 15, reb: 6, ast: 3, threePm: 2, threePa: 5, ...over });
const box = (id, dateUtc, phase, home, away, players) => ({ schemaVersion: 1, providerEventId: id, season: 2026, phase, dateUtc, boxscoreAvailable: true, teams: [{ providerTeamId: home, homeAway: "home" }, { providerTeamId: away, homeAway: "away" }], players });
const teamPlayers = (team, prefix, mins, n = 8) => Array.from({ length: n }, (_, i) => player(`${prefix}${i}`, team, { minutes: mins, pts: Math.round(mins * 0.5), starter: i < 5 }));
// TOR t0..t7 · MIA m0..m7 · MIL: "giannis" (34 min) + k0..k6. Twelve regular-season games each pairing.
const BOX = [
  ...Array.from({ length: 12 }, (_, i) => box(`reg${i}`, `2026-01-${String(i + 1).padStart(2, "0")}T00:00Z`, 2, TOR, MIA, [...teamPlayers(TOR, "t", 30), ...teamPlayers(MIA, "m", 28)])),
  ...Array.from({ length: 12 }, (_, i) => box(`mil${i}`, `2026-02-${String(i + 1).padStart(2, "0")}T00:00Z`, 2, MIL, TOR, [player("giannis", MIL, { minutes: 34, pts: 31 }), ...teamPlayers(MIL, "k", 29, 7), ...teamPlayers(TOR, "t", 30)])),
];
const rosterTeam = (providerTeamId, tricode, ids, state = "CAPTURED") => ({ providerTeamId, espnAbbr: tricode, canonicalTricode: tricode, state, reason: state === "CAPTURED" ? null : "fetch failed: timeout", playerCount: state === "CAPTURED" ? ids.length : null, capturedAt: "2026-09-22T06:08:44Z", players: state === "CAPTURED" ? ids.map((id) => ({ providerAthleteId: id, displayName: `R${id}`, position: "G", experienceYears: id.startsWith("rk") ? 0 : 5, injuryStatus: null })) : null, refused: [] });
const ROSTERS = {
  artifact: "nba-roster-capture", contractVersion: "nba-roster-contract-v1", asOf: "2026-09-22T06:08:44Z", capturedAt: "2026-09-22T06:08:44Z",
  teams: [
    rosterTeam(TOR, "TOR", ["t0", "t1", "t2", "t3", "t4", "t5", "rk1"]),                 // t6, t7 departed; rookie rk1 arrived
    rosterTeam(MIA, "MIA", ["m0", "m1", "m2", "m3", "m4", "m5", "m6", "m7", "giannis"]), // giannis traded in from MIL
    rosterTeam(MIL, "MIL", ["k0", "k1", "k2", "k3", "k4", "k5", "k6"]),                  // giannis gone
  ],
};
const gate = (team, over = {}) => gatePool({ rosters: ROSTERS, providerTeamId: team, boxscores: BOX, asOfDateUtc: NOW, injuries: [], population: "regular", ...over });

test("RULE 1 — a traded player is EXCLUDED from his former team even though every box score says he played there", () => {
  const mil = gate(MIL);
  assert.equal(mil.state, "GATED");
  assert.ok(!mil.rows.some((r) => r.providerAthleteId === "giannis"), "giannis is not on the MIL roster → not in the MIL pool");
  assert.deepEqual(mil.gate.excludedNotOnRoster.map((p) => p.providerAthleteId), ["giannis"]);
  assert.equal(mil.gate.excludedNotOnRoster[0].expectedMinutes, 34, "what v0 would have simulated is listed, not hidden");
  // MUTATION PROBE (deleting the gate): v0's pool for the same inputs DOES contain him — the gate is what removes him.
  const v0 = expectedMinutes({ boxscores: BOX, teamProviderId: MIL, asOfDateUtc: NOW, injuries: [], population: "regular" });
  assert.ok(v0.rows.some((r) => r.providerAthleteId === "giannis"), "positive control: without the roster gate the departed player is simulated");
  assert.equal(mil.gate.v0PoolSize, 8);
  assert.equal(mil.gate.v0PoolRetained, 7);
});

test("RULE 3 — the same traded player is PRESENT on his new team with his history carried (other-team basis, availability re-read under the new club)", () => {
  const mia = gate(MIA, { injuries: [{ providerTeamId: MIA, athleteId: "giannis", athleteName: "Giannis", status: "Day-To-Day" }] });
  const g = mia.rows.find((r) => r.providerAthleteId === "giannis");
  assert.ok(g, "on the MIA roster → in the MIA pool");
  assert.equal(g.historyBasis, HISTORY_BASES.OTHER_TEAM);
  assert.equal(g.historyTeam, MIL);
  assert.equal(g.expectedMinutes, 34);
  assert.equal(g.minutesState, MINUTES_STATES.MODELLED);
  assert.equal(g.availability, "active");
  assert.equal(g.injuryStatus, "Day-To-Day", "the injuries row filed under the NEW team is what governs");
  assert.deepEqual(mia.gate.otherTeamHistory.map((p) => p.providerAthleteId), ["giannis"]);
  // and an OUT filed under the new team excludes him — his old-team history never re-admits him
  const out = gate(MIA, { injuries: [{ providerTeamId: MIA, athleteId: "giannis", athleteName: "Giannis", status: "Out" }] });
  const go = out.rows.find((r) => r.providerAthleteId === "giannis");
  assert.equal(go.minutesState, MINUTES_STATES.OUT);
  assert.equal(go.expectedMinutes, null);
  assert.deepEqual(out.gate.out.map((p) => p.providerAthleteId), ["giannis"]);
});

test("RULE 2 — a rookie on the roster with NO history is present as INSUFFICIENT_HISTORY: null minutes, null rates, never zero, listed", () => {
  const tor = gate(TOR);
  const rk = tor.rows.find((r) => r.providerAthleteId === "rk1");
  assert.ok(rk, "the rookie is in the pool listing");
  assert.equal(rk.minutesState, MINUTES_STATES.INSUFFICIENT_HISTORY);
  assert.equal(rk.expectedMinutes, null);
  assert.notEqual(rk.expectedMinutes, 0, "null, never a silent zero");
  assert.equal(rk.rates, null);
  assert.equal(rk.historyBasis, HISTORY_BASES.NONE);
  assert.equal(rk.name, "Rrk1", "named from the roster, not invented");
  assert.deepEqual(tor.gate.insufficientHistory.map((p) => p.providerAthleteId), ["rk1"]);
  assert.equal(tor.gate.simulated, 6, "t0..t5 modelled; the rookie is not simulated");
  // MUTATION PROBE (substituting box-score membership for roster membership): v0's pool never lists the rookie at all.
  const v0 = expectedMinutes({ boxscores: BOX, teamProviderId: TOR, asOfDateUtc: NOW, injuries: [], population: "regular" });
  assert.ok(!v0.rows.some((r) => r.providerAthleteId === "rk1"), "positive control: box-score membership cannot see a rookie");
  // the sim consumes the gated rows unchanged: the rookie is excluded from the draw and named in the assumptions
  const sim = simulateGame({ providerEventId: "x1", inputAsOf: NOW, home: { name: "TOR", providerTeamId: TOR, rating: { rating: 1500 }, minutes: tor }, away: { name: "MIA", providerTeamId: MIA, rating: { rating: 1500 }, minutes: gate(MIA) }, eloWinProbability: 0.5, simulations: 50 });
  assert.equal(sim.assumptions.availability.home.poolSize, 6);
  assert.ok(sim.assumptions.availability.home.excludedNoMinutes.some((p) => p.providerAthleteId === "rk1"));
  assert.ok(!sim.players.home.some((p) => p.providerAthleteId === "rk1"));
});

test("RULE 4 — no roster capture → REFUSED; it never falls back to box-score membership", () => {
  const r = gate(TOR, { rosters: null });
  assert.equal(r.state, "REFUSED");
  assert.equal(r.reason, GATE_REFUSALS.ROSTER_CAPTURE_MISSING);
  assert.equal(r.rows, undefined, "no rows at all — not the v0 pool, not an empty pool");
  // a team MISSING inside an otherwise fine capture refuses that team only
  const missing = { ...ROSTERS, teams: [rosterTeam(TOR, "TOR", [], "MISSING"), ...ROSTERS.teams.slice(1)] };
  assert.equal(gate(TOR, { rosters: missing }).reason, GATE_REFUSALS.ROSTER_TEAM_MISSING);
  assert.equal(gate(MIA, { rosters: missing }).state, "GATED");
  // an empty CAPTURED roster is refused too — an empty pool would zero a team silently (P247 class)
  const empty = { ...ROSTERS, teams: [{ ...rosterTeam(TOR, "TOR", []), players: [] }, ...ROSTERS.teams.slice(1)] };
  assert.equal(gate(TOR, { rosters: empty }).reason, GATE_REFUSALS.ROSTER_TEAM_EMPTY);
  // the artifact level fails closed as well
  assert.throws(() => buildForecastArtifact({ date: "2026-10-03", now: NOW, scheduleRows: [], corpusRows: [], boxscores: BOX, rosters: null, family: "v0.1" }), /REFUSED: family v0\.1 requires a roster capture/);
});

test("RULE 5 — roster freshness: a capture after the forecast instant is leakage (refused); older than the max age is stale (refused); inside is fine", () => {
  assert.equal(checkRosterFreshness(null, NOW).reason, GATE_REFUSALS.ROSTER_CAPTURE_MISSING);
  assert.equal(checkRosterFreshness({ teams: [] }, NOW).reason, GATE_REFUSALS.ROSTER_AS_OF_UNKNOWN);
  assert.equal(checkRosterFreshness({ asOf: "2026-09-22T12:00:01Z" }, NOW).reason, GATE_REFUSALS.ROSTER_FROM_THE_FUTURE);
  const stale = checkRosterFreshness({ asOf: "2026-09-20T11:59:59Z" }, NOW);
  assert.equal(stale.reason, GATE_REFUSALS.ROSTER_STALE);
  assert.ok(stale.ageHours >= ROSTER_MAX_AGE_HOURS, "reported age is rounded to 2 dp; the decision uses the exact age");
  const ok = checkRosterFreshness({ asOf: "2026-09-20T12:00:00Z" }, NOW);
  assert.equal(ok.ok, true, "exactly the max age is still inside");
  assert.equal(ok.ageHours, 48);
  assert.equal(ROSTER_MAX_AGE_HOURS, 48, "one missed daily capture is tolerated; two are not");
  // and the gate honours it
  assert.equal(gate(TOR, { rosters: { ...ROSTERS, asOf: "2026-09-19T00:00:00Z", capturedAt: "2026-09-19T00:00:00Z" } }).reason, GATE_REFUSALS.ROSTER_STALE);
  assert.equal(gate(TOR, { rosters: { ...ROSTERS, asOf: "2026-09-23T00:00:00Z", capturedAt: "2026-09-23T00:00:00Z" } }).reason, GATE_REFUSALS.ROSTER_FROM_THE_FUTURE);
  assert.throws(() => checkRosterFreshness(ROSTERS, "nope"));
});

test("RULE 6/7 — two-way status is never inferred; ordering is deterministic; the gate stamps its version and the roster instant", () => {
  const tor = gate(TOR);
  assert.ok(!tor.rows.some((r) => "twoWay" in r || "isTwoWay" in r), "no two-way field exists to be inferred from");
  assert.equal(tor.gate.poolVersion, POOL_VERSION);
  assert.equal(POOL_VERSION, "nba-roster-gated-pool-v0.1");
  assert.equal(tor.gate.rosterAsOf, "2026-09-22T06:08:44Z");
  assert.equal(tor.gate.rosterAgeHours, 5.85, "06:08:44 → 12:00:00 = 5h51m16s");
  assert.deepEqual(gate(TOR).rows.map((r) => r.providerAthleteId), tor.rows.map((r) => r.providerAthleteId), "same inputs → same order");
  assert.equal(tor.rows.at(-1).providerAthleteId, "rk1", "null minutes sort last");
  assert.equal(tor.modelVersion, "nba-minutes-model-v0", "the minutes model is UNCHANGED — only the pool rule moved");
});

test("lastAppearanceTeamIndex: newest non-DNP appearance wins; DNP-only and null-minute rows give no history; the population is respected", () => {
  const idx = lastAppearanceTeamIndex(BOX, NOW, "regular");
  assert.equal(idx.get("giannis").providerTeamId, MIL);
  assert.equal(idx.get("t0").providerTeamId, TOR);
  assert.equal(idx.get("t0").dateUtc, "2026-02-12T00:00Z", "the MIL@TOR series is newer than the TOR/MIA one");
  const dnp = [box("d1", "2026-03-01T00:00Z", 2, TOR, MIA, [player("ghost", TOR, { didNotPlay: true, minutes: null }), player("nullmin", TOR, { minutes: null })])];
  const idx2 = lastAppearanceTeamIndex(dnp, NOW, "regular");
  assert.equal(idx2.has("ghost"), false);
  assert.equal(idx2.has("nullmin"), false);
  assert.equal(lastAppearanceTeamIndex(BOX, NOW, "preseason").size, 0, "no preseason rows in the fixture → no preseason history");
  assert.equal(lastAppearanceTeamIndex(BOX, "2026-01-01T00:00Z", "regular").size, 0, "strictly before the cutoff");
});

test("FAMILY v0.1 through the artifact: own model version, v0 untouched, refused games recorded with the gate reason, pool per side", () => {
  const sched = (id, over = {}) => ({ providerEventId: id, dateUtc: "2026-10-03T23:00Z", seasonType: 2, neutralSite: false, home: { abbr: "TOR", name: "Toronto Raptors", providerTeamId: TOR }, away: { abbr: "MIA", name: "Miami Heat", providerTeamId: MIA }, ...over });
  const corpus = BOX.map((b) => ({ providerEventId: b.providerEventId, season: 2026, phase: 2, dateUtc: b.dateUtc, home: "Toronto Raptors", away: "Miami Heat", ftHome: 100, ftAway: 98, neutralSite: false }));
  const base = { date: "2026-10-03", now: NOW, scheduleRows: [sched("g1")], corpusRows: corpus, boxscores: BOX, injuries: [], rosters: ROSTERS, simulations: 200 };
  const v0 = buildForecastArtifact({ ...base, family: "v0" });
  const v01 = buildForecastArtifact({ ...base, family: "v0.1" });
  assert.equal(v0.artifact.modelVersion, "nba-preseason-experimental-v0");
  assert.equal(v0.artifact.family, undefined, "v0 artifact shape is unchanged (no family keys)");
  assert.equal(v01.artifact.modelVersion, "nba-preseason-experimental-v0.1");
  assert.equal(v01.artifact.family, "v0.1");
  assert.equal(v01.artifact.poolRule, "roster-gated");
  assert.equal(v01.artifact.simEngineVersion, "nba-preseason-experimental-v0", "the engine is the frozen v0 engine");
  assert.equal(v01.artifact.productEligible, false);
  assert.equal(v01.artifact.dataClass, "PRIVATE_RESEARCH");
  const g = v01.artifact.games[0];
  assert.equal(g.poolVersion, POOL_VERSION);
  assert.equal(g.home.pool.simulated, 6);
  assert.deepEqual(g.home.pool.insufficientHistory.map((p) => p.providerAthleteId), ["rk1"]);
  assert.deepEqual(g.home.pool.excludedNotOnRoster.map((p) => p.providerAthleteId), ["t6", "t7"]);
  assert.deepEqual(g.away.pool.otherTeamHistory.map((p) => p.providerAthleteId), ["giannis"]);
  assert.equal(g.forecast.assumptions.availability.home.poolSize, 6);
  assert.equal(v0.artifact.games[0].forecast.assumptions.availability.home.poolSize, 8, "v0 still simulates the two departed players");
  assert.notDeepEqual(v01.artifact.games[0].forecast.sim, v0.artifact.games[0].forecast.sim, "the two families produce different forecasts — they are graded side by side, never merged");
  assert.equal(v01.manifest.pool.playersExcludedNotOnRoster, 2);
  assert.equal(v01.manifest.pool.playersInsufficientHistory, 1);
  assert.equal(v01.manifest.pool.playersOtherTeamHistory, 1);
  assert.equal(v01.manifest.pool.gamesRefusedByRosterGate, 0);
  // a stale roster refuses the whole game, with the reason, and the game count reflects it
  const stale = buildForecastArtifact({ ...base, family: "v0.1", rosters: { ...ROSTERS, asOf: "2026-09-01T00:00:00Z", capturedAt: "2026-09-01T00:00:00Z" } });
  assert.equal(stale.manifest.gamesForecast, 0);
  assert.equal(stale.manifest.pool.gamesRefusedByRosterGate, 1);
  assert.match(stale.manifest.refused[0].reason, /ROSTER_GATE: ROSTER_STALE/);
  assert.equal(stale.artifact.games.length, 0);
  // the families are a closed set
  assert.deepEqual(Object.keys(FAMILIES), ["v0", "v0.1"]);
  assert.throws(() => familySpec("v1"), /REFUSED: unknown NBA experimental family/);
  assert.equal(familySpec("v0.1").dir, "experimental-v0.1");
  assert.equal(familySpec("v0").dir, "experimental");
});

/* ───────────────── the grader may never mix the two families (v1.8 A1) ─────────────────
 * The families live in sibling directories, so the PATH normally keeps them apart. A path is not a
 * proof: a forecast written by one family and left in the other's directory would be graded into the
 * wrong ledger, and that ledger's summary would then average two pool rules into one record. The
 * grader therefore checks the DOCUMENT. These pin the decision the grader makes on every file.
 */

test("FAMILY ISOLATION — a v0.1 forecast is refused by the v0 grader and vice versa; each accepts its own", () => {
  const v0Doc = { modelVersion: "nba-preseason-experimental-v0" };                                 // v0 stamps no family key
  const v01Doc = { family: "v0.1", modelVersion: "nba-preseason-experimental-v0.1", poolRule: "roster-gated" };

  assert.equal(familyGuard({ family: "v0", doc: v0Doc }).ok, true);
  assert.equal(familyGuard({ family: "v0.1", doc: v01Doc }).ok, true);

  const a = familyGuard({ family: "v0", doc: v01Doc, what: "forecast artifact" });
  assert.equal(a.ok, false);
  assert.equal(a.reason, "FAMILY_MISMATCH");
  assert.match(a.detail, /never reads another family's forecast artifact/);

  const b = familyGuard({ family: "v0.1", doc: v0Doc, what: "forecast artifact" });
  assert.equal(b.ok, false);
  assert.equal(b.reason, "MODEL_VERSION_MISMATCH");
  assert.match(b.detail, /nba-preseason-experimental-v0\.1/);

  // a ledger is the same decision under a different noun
  const c = familyGuard({ family: "v0", doc: { family: "v0.1", modelVersion: "nba-preseason-experimental-v0.1" }, what: "ledger" });
  assert.equal(c.ok, false);
  assert.match(c.detail, /never reads another family's ledger/);
});

test("FAMILY ISOLATION — an UNSTAMPED document is legacy v0 and is adopted by v0 only, never by v0.1", () => {
  const legacy = { schemaVersion: 1, artifact: "nba-experimental-ledger", entries: [] };   // written before the family key existed
  const adopted = familyGuard({ family: "v0", doc: legacy, what: "ledger" });
  assert.equal(adopted.ok, true);
  assert.equal(adopted.adopt, true, "v0 stamps the legacy ledger rather than refusing it");

  const refused = familyGuard({ family: "v0.1", doc: legacy, what: "ledger" });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "UNSTAMPED_NOT_ADOPTABLE");
  assert.match(refused.detail, /only v0 adopts an unstamped ledger/);

  // a document already carrying its own family is never re-stamped
  assert.equal(familyGuard({ family: "v0.1", doc: { family: "v0.1", modelVersion: FAMILIES["v0.1"].modelVersion } }).adopt, false);
  // null/undefined docs are unstamped, not a crash
  assert.equal(familyGuard({ family: "v0", doc: null }).ok, true);
  assert.equal(familyGuard({ family: "v0.1", doc: null }).ok, false);
  // an unknown family never silently becomes v0
  assert.throws(() => familyGuard({ family: "v0.2", doc: {} }), /unknown NBA experimental family/);
});

test("FAMILY ISOLATION — the two families' directories, ledgers and model versions are all distinct", () => {
  const dirs = Object.values(FAMILIES).map((f) => f.dir);
  const versions = Object.values(FAMILIES).map((f) => f.modelVersion);
  const rules = Object.values(FAMILIES).map((f) => f.poolRule);
  assert.equal(new Set(dirs).size, dirs.length, "two families must never share a directory");
  assert.equal(new Set(versions).size, versions.length, "two families must never share a model version");
  assert.equal(new Set(rules).size, rules.length, "two families must never share a pool rule");
  assert.equal(familySpec("v0").dir, "experimental", "v0 keeps the directory it was preregistered in");
});

test("POPULATION LABELS — preseason and regular season are separate populations a family never collapses", () => {
  // Its own two-phase fixture ON PURPOSE: the shared BOX above is regular-season only (phase 2), so a
  // test that merely compared the two indices over BOX would pass with an EMPTY preseason side and
  // assert nothing. Here `pre` played only preseason games and `reg` only regular-season ones, and the
  // shared player `both` appeared in each — so every branch below has something to be wrong about.
  const PRE_BOX = [
    box("p1", "2026-10-04T00:00Z", 1, TOR, MIA, [player("pre", TOR, { minutes: 28, pts: 14 }), player("both", TOR, { minutes: 20, pts: 9 })]),
    box("r1", "2026-10-22T00:00Z", 2, TOR, MIA, [player("reg", TOR, { minutes: 31, pts: 18 }), player("both", TOR, { minutes: 33, pts: 21 })]),
  ];
  const preIdx = lastAppearanceTeamIndex(PRE_BOX, "2026-11-01T00:00:00Z", "preseason");
  const regIdx = lastAppearanceTeamIndex(PRE_BOX, "2026-11-01T00:00:00Z", "regular");

  // POSITIVE CONTROL: both populations are non-empty, so the comparisons below are not vacuous.
  assert.ok(preIdx.size > 0 && regIdx.size > 0, `both populations must be populated (pre ${preIdx.size}, reg ${regIdx.size})`);

  assert.deepEqual([...preIdx.keys()].sort(), ["both", "pre"], "the preseason index sees only preseason appearances");
  assert.deepEqual([...regIdx.keys()].sort(), ["both", "reg"], "the regular index sees only regular-season appearances");
  assert.equal(preIdx.has("reg"), false, "a regular-season-only player has NO preseason history");
  assert.equal(regIdx.has("pre"), false, "a preseason-only player has NO regular-season history");
  // the shared player resolves to a different appearance in each population — never the same row reused
  assert.equal(preIdx.get("both").dateUtc, "2026-10-04T00:00Z");
  assert.equal(regIdx.get("both").dateUtc, "2026-10-22T00:00Z");
});

test("POPULATION LABELS — a rostered player with preseason-only history is INSUFFICIENT_HISTORY under the regular population, never a preseason number reused", () => {
  const PRE_ONLY = Array.from({ length: 12 }, (_, i) =>
    box(`pre${i}`, `2026-10-${String(i + 1).padStart(2, "0")}T00:00Z`, 1, TOR, MIA, [player("preseasonOnly", TOR, { minutes: 30, pts: 16 }), ...teamPlayers(TOR, "t", 30)]));
  const rosters = {
    artifact: "nba-roster-capture", contractVersion: "nba-roster-contract-v1",
    asOf: "2026-11-01T06:00:00Z", capturedAt: "2026-11-01T06:00:00Z",
    teams: [{ ...rosterTeam(TOR, "TOR", ["preseasonOnly", "t0", "t1", "t2", "t3", "t4"]), capturedAt: "2026-11-01T06:00:00Z" }],
  };

  const pre = gatePool({ rosters, providerTeamId: TOR, boxscores: PRE_ONLY, asOfDateUtc: "2026-11-01T12:00:00Z", population: "preseason" });
  const reg = gatePool({ rosters, providerTeamId: TOR, boxscores: PRE_ONLY, asOfDateUtc: "2026-11-01T12:00:00Z", population: "regular" });
  assert.equal(pre.state, "GATED");
  assert.equal(reg.state, "GATED");

  const inPre = pre.rows.find((r) => r.providerAthleteId === "preseasonOnly");
  const inReg = reg.rows.find((r) => r.providerAthleteId === "preseasonOnly");
  // POSITIVE CONTROL: the preseason side really did model him, so the regular-side null below means something.
  assert.equal(inPre.minutesState, MINUTES_STATES.MODELLED);
  assert.ok(Number.isFinite(inPre.expectedMinutes) && inPre.expectedMinutes > 0, "the preseason population models him from his preseason games");

  assert.equal(inReg.minutesState, MINUTES_STATES.INSUFFICIENT_HISTORY, "the regular population must not borrow his preseason minutes");
  assert.equal(inReg.expectedMinutes, null, "null, never 0, and never the preseason value");
  assert.equal(inReg.rates, null);
  assert.ok(reg.gate.insufficientHistory.some((x) => x.providerAthleteId === "preseasonOnly"), "and he is listed, not silently dropped");
});

/**
 * ELIGIBILITY CONTRACT v1 (~/gtp-evidence/eligibility-contract-v1.md, PD 2026-11-09) — the shared acceptance
 * fixtures A1–A6 plus the rules R1–R4, R6, R7, on the real ids of the INC-2026-11-08-01 players.
 * Run (from app/): npx tsx --test src/lib/availability/eligibility.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveEligibility, ELIGIBILITY_STATES, CONTRACT_VERSION, marketSignal } from "./eligibility.mjs";
import { carryForwardDesignations } from "../sports/injuries/carry-forward.mjs";

const NOW = "2026-11-09T00:35:18Z";
const ACHANE = { id: "4429160", team: "15" };   // MIA — IR stated 2026-09-28T20:10Z, dropped from the feed 10-12
const KENDRE = { id: "4599739", team: "18" };   // NO — released 2026-11-08
const injuries = (entries, generatedAt = NOW) => ({ generatedAt, entries });
const nflRoster = (players, { generatedAt = NOW, teams = ["15", "18"] } = {}) => ({
  generatedAt,
  teams: teams.map((t) => ({ providerTeamId: t, teamAbbr: t === "15" ? "MIA" : "NO", players: players.filter((p) => p.team === t).map((p) => ({ id: p.id, fullName: p.name ?? p.id, status: { type: p.type } })) })),
});
const resolve = (o) => resolveEligibility({ sport: "nfl", asOf: NOW, ...o });

test("the contract's shape: state, reasons, sources with both stamps, contractVersion", () => {
  const r = resolve({ playerId: "1", teamId: "15", injuries: injuries([]), roster: nflRoster([{ id: "1", team: "15", type: "active" }]) });
  assert.equal(CONTRACT_VERSION, "eligibility@1");
  assert.deepEqual([...ELIGIBILITY_STATES], ["ELIGIBLE", "INELIGIBLE", "UNKNOWN"]);
  assert.equal(r.contractVersion, "eligibility@1");
  assert.deepEqual(Object.keys(r.sources).sort(), ["injuries", "roster"]);
  assert.deepEqual(r.sources.injuries, { status: null, statedAt: null, fetchedAt: NOW });
  assert.deepEqual(r.sources.roster, { status: "active", fetchedAt: NOW });
});

test("A1 (Achane): IR, absent from the feed for 30 days, roster day-to-day ⇒ INELIGIBLE — the carry never expires (R1)", () => {
  const ir = { sport: "nfl", providerTeamId: ACHANE.team, athleteId: ACHANE.id, athleteName: "De'Von Achane", status: "Injured Reserve", statedAt: "2026-09-28T20:10Z" };
  // thirty days of captures in which ESPN never lists him again
  let prev = [ir];
  for (let d = 1; d <= 30; d += 1) prev = carryForwardDesignations({ previousEntries: prev, currentEntries: [], nowIso: new Date(Date.parse("2026-10-10T00:00:00Z") + d * 864e5).toISOString() }).entries;
  assert.equal(prev.length, 1, "the IR designation is still carried after 30 days absent");
  const r = resolve({ playerId: ACHANE.id, teamId: ACHANE.team, injuries: injuries(prev), roster: nflRoster([{ ...ACHANE, type: "day-to-day" }]) });
  assert.equal(r.state, "INELIGIBLE");
  assert.ok(r.reasons.includes("LONG_TERM_DESIGNATION"));
  assert.equal(r.sources.injuries.status, "Injured Reserve");
  assert.equal(r.sources.roster.status, "day-to-day");
});

test("A1b: even without a carried entry, feed-absent + roster day-to-day is never ELIGIBLE (R2/R3 ⇒ UNKNOWN)", () => {
  const r = resolve({ playerId: ACHANE.id, teamId: ACHANE.team, injuries: injuries([]), roster: nflRoster([{ ...ACHANE, type: "day-to-day" }]) });
  assert.equal(r.state, "UNKNOWN");
});

test("A2 (Kendre Miller): released — his team's roster is captured and fresh, he is not on it ⇒ INELIGIBLE", () => {
  const r = resolve({ playerId: KENDRE.id, teamId: KENDRE.team, injuries: injuries([]), roster: nflRoster([{ id: "999", team: "18", type: "active" }]) });
  assert.equal(r.state, "INELIGIBLE");
  assert.deepEqual(r.reasons, ["NOT_ON_ROSTER"]);
});

test("A3: absent from the feed, roster active ⇒ ELIGIBLE (R2)", () => {
  const r = resolve({ playerId: "7", teamId: "15", injuries: injuries([]), roster: nflRoster([{ id: "7", team: "15", type: "active" }]) });
  assert.equal(r.state, "ELIGIBLE");
});

test("A4: absent from the feed, no roster record ⇒ UNKNOWN (not publishable)", () => {
  const noTeam = resolve({ playerId: "7", teamId: "33", injuries: injuries([]), roster: nflRoster([]) });
  assert.equal(noTeam.state, "UNKNOWN");
  assert.ok(noTeam.reasons.includes("NO_ROSTER_RECORD"));
  const noRoster = resolve({ playerId: "7", teamId: "15", injuries: injuries([]), roster: null });
  assert.equal(noRoster.state, "UNKNOWN");
  assert.ok(noRoster.reasons.includes("ROSTER_SOURCE_MISSING"));
});

test("A5: an injuries feed older than 6 h at build ⇒ UNKNOWN; a 60-minute window at approval/send (R4)", () => {
  const roster = nflRoster([{ id: "7", team: "15", type: "active" }]);
  const stale = resolve({ playerId: "7", teamId: "15", injuries: injuries([], "2026-11-08T18:00:00Z"), roster });
  assert.equal(stale.state, "UNKNOWN");
  assert.ok(stale.reasons.includes("INJURIES_STALE"));
  assert.equal(resolve({ playerId: "7", teamId: "15", injuries: injuries([], "2026-11-08T19:00:00Z"), roster }).state, "ELIGIBLE", "5 h 35 min old is inside the build window");
  const send = resolve({ playerId: "7", teamId: "15", injuries: injuries([], "2026-11-08T23:00:00Z"), roster, maxAgeHours: 1 });
  assert.ok(send.reasons.includes("INJURIES_STALE"), "95 min old fails the send-time window");
  const staleRoster = resolve({ playerId: "7", teamId: "15", injuries: injuries([]), roster: nflRoster([{ id: "7", team: "15", type: "active" }], { generatedAt: "2026-11-08T12:00:00Z" }) });
  assert.ok(staleRoster.reasons.includes("ROSTER_STALE"));
  const future = resolve({ playerId: "7", teamId: "15", injuries: injuries([], "2026-11-09T05:00:00Z"), roster });
  assert.equal(future.state, "UNKNOWN", "a source stamped after asOf was not available at asOf");
});

test("A6: an explicit Active after the IR date ⇒ ELIGIBLE; a fresh roster 'active' ends a CARRIED long-term designation", () => {
  const active = resolve({ playerId: ACHANE.id, teamId: ACHANE.team, injuries: injuries([{ athleteId: ACHANE.id, providerTeamId: "15", status: "Active", statedAt: "2026-11-08T15:00Z" }]), roster: nflRoster([{ ...ACHANE, type: "active" }]) });
  assert.equal(active.state, "ELIGIBLE");
  const carried = { athleteId: ACHANE.id, providerTeamId: "15", status: "Injured Reserve", statedAt: "2026-09-28T20:10Z", carriedForward: true };
  const byRoster = resolve({ playerId: ACHANE.id, teamId: ACHANE.team, injuries: injuries([carried]), roster: nflRoster([{ ...ACHANE, type: "active" }]) });
  assert.equal(byRoster.state, "ELIGIBLE");
  assert.ok(byRoster.reasons.includes("ACTIVATED_BY_ROSTER"));
  // but a designation the feed is CURRENTLY listing is never overruled by the roster (ESPN rosters say "active" for 181 Out players)
  const listed = resolve({ playerId: ACHANE.id, teamId: ACHANE.team, injuries: injuries([{ ...carried, carriedForward: undefined }]), roster: nflRoster([{ ...ACHANE, type: "active" }]) });
  assert.equal(listed.state, "INELIGIBLE");
});

test("R3: the two sources disagree ⇒ UNKNOWN with both stamps (feed Active, roster practice squad / news)", () => {
  for (const type of ["practice-squad", "news", "day-to-day"]) {
    const r = resolve({ playerId: "7", teamId: "15", injuries: injuries([{ athleteId: "7", providerTeamId: "15", status: "Active", statedAt: "2026-11-08T10:00Z" }]), roster: nflRoster([{ id: "7", team: "15", type }]) });
    assert.equal(r.state, "UNKNOWN", type);
    assert.equal(r.sources.injuries.status, "Active");
    assert.equal(r.sources.roster.status, type);
  }
});

test("blocking designations: Out / Suspension ⇒ INELIGIBLE whatever the roster says; a player on another team ⇒ UNKNOWN", () => {
  for (const status of ["Out", "Suspension", "Injured Reserve"]) {
    const r = resolve({ playerId: "7", teamId: "15", injuries: injuries([{ athleteId: "7", providerTeamId: "15", status, statedAt: "2026-11-08T10:00Z" }]), roster: nflRoster([{ id: "7", team: "15", type: "active" }]) });
    assert.equal(r.state, "INELIGIBLE", status);
  }
  const traded = resolve({ playerId: "7", teamId: "15", injuries: injuries([]), roster: nflRoster([{ id: "7", team: "18", type: "active" }]) });
  assert.equal(traded.state, "UNKNOWN");
  assert.ok(traded.reasons.includes("ROSTER_TEAM_MISMATCH"));
});

test("R6: Questionable / Doubtful / Day-To-Day are not blocked but flagged; Doubtful for a starter is INELIGIBLE", () => {
  const roster = nflRoster([{ id: "7", team: "15", type: "day-to-day" }]);
  const q = resolve({ playerId: "7", teamId: "15", injuries: injuries([{ athleteId: "7", providerTeamId: "15", status: "Questionable", statedAt: "2026-11-08T10:00Z" }]), roster });
  assert.equal(q.state, "ELIGIBLE");
  assert.deepEqual(q.flags, ["QUESTIONABLE"]);
  const d = { athleteId: "7", providerTeamId: "15", status: "Doubtful", statedAt: "2026-11-08T10:00Z" };
  assert.equal(resolve({ playerId: "7", teamId: "15", injuries: injuries([d]), roster }).state, "ELIGIBLE");
  assert.equal(resolve({ playerId: "7", teamId: "15", injuries: injuries([d]), roster, starter: true }).state, "INELIGIBLE");
});

test("NBA: the roster capture's own shape; Day-To-Day flagged; no injury record + active roster ⇒ ELIGIBLE; no roster ⇒ UNKNOWN", () => {
  const roster = { capturedAt: NOW, teams: [{ providerTeamId: "1", espnAbbr: "ATL", state: "CAPTURED", players: [{ providerAthleteId: "11", rosterStatusType: "active" }, { providerAthleteId: "12", rosterStatusType: "active" }] }] };
  const inj = injuries([{ athleteId: "12", providerTeamId: "1", status: "Day-To-Day", statedAt: "2026-11-08T10:00Z" }]);
  const nba = (o) => resolveEligibility({ sport: "nba", asOf: NOW, injuries: inj, roster, teamId: "1", ...o });
  assert.equal(nba({ playerId: "11" }).state, "ELIGIBLE");
  const dtd = nba({ playerId: "12" });
  assert.equal(dtd.state, "ELIGIBLE");
  assert.deepEqual(dtd.flags, ["QUESTIONABLE"]);
  assert.equal(nba({ playerId: "13" }).state, "INELIGIBLE", "team captured, player not on it");
  assert.equal(nba({ playerId: "11", roster: null }).state, "UNKNOWN");
});

test("R7: a featured player with no sportsbook market where peers have one needs a fresh check (MARKET_ABSENT)", () => {
  assert.deepEqual(marketSignal({ playerHasMarket: false, peersWithMarket: 3 }), ["MARKET_ABSENT"]);
  assert.deepEqual(marketSignal({ playerHasMarket: true, peersWithMarket: 3 }), []);
  assert.deepEqual(marketSignal({ playerHasMarket: false, peersWithMarket: 0 }), [], "no peer has a market: the absence says nothing about this player");
});

test("missing inputs are never a pass: no injuries document ⇒ UNKNOWN", () => {
  const r = resolve({ playerId: "7", teamId: "15", injuries: null, roster: nflRoster([{ id: "7", team: "15", type: "active" }]) });
  assert.equal(r.state, "UNKNOWN");
  assert.ok(r.reasons.includes("INJURIES_SOURCE_MISSING"));
  assert.throws(() => resolveEligibility({ sport: "nfl", playerId: "7", injuries: null, roster: null }), /asOf/);
});

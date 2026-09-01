/**
 * NFL participation & allocation guards (Program 169 · Release D).
 * Run: npx tsx --test src/lib/sports/nfl/participation.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { classifyParticipation, buildActivePool, validateAllocation, validateSnapScenario, validateOverride, PARTICIPATION_STATES } from "./participation.mjs";
import { buildPlayerRegistry } from "./player-identity.mjs";

const FRESH = { state: "FRESH" };
const NOW = "2026-08-13T03:20:00Z";
const ROSTER_P = { playerId: "nfl-athlete-1", name: "Test Back", teamAbbr: "CIN", position: "RB" };

test("absence of injury data is never health; staleness widens to UNKNOWN", () => {
  assert.equal(classifyParticipation({ rosterPlayer: ROSTER_P, injuriesFreshness: { state: "STALE" }, seasonType: 2, nowIso: NOW }).state, "UNKNOWN");
  assert.equal(classifyParticipation({ rosterPlayer: ROSTER_P, injuriesFreshness: undefined, seasonType: 2, nowIso: NOW }).state, "UNKNOWN");
});

test("roster lineage: off-roster is UNSUPPORTED; blocking and questionable statuses map typed", () => {
  assert.equal(classifyParticipation({ rosterPlayer: null, injuriesFreshness: FRESH, seasonType: 2, nowIso: NOW }).state, "UNSUPPORTED");
  assert.equal(classifyParticipation({ rosterPlayer: ROSTER_P, injuryFact: { status: "Out" }, injuriesFreshness: FRESH, seasonType: 2, nowIso: NOW }).state, "INACTIVE");
  assert.equal(classifyParticipation({ rosterPlayer: ROSTER_P, injuryFact: { status: "Injured Reserve" }, injuriesFreshness: FRESH, seasonType: 2, nowIso: NOW }).state, "INACTIVE");
  assert.equal(classifyParticipation({ rosterPlayer: ROSTER_P, injuryFact: { status: "Questionable" }, injuriesFreshness: FRESH, seasonType: 2, nowIso: NOW }).state, "QUESTIONABLE");
});

test("preseason: ROLE_UNCERTAIN without a dated+sourced snap scenario — a posted line never substitutes", () => {
  const bare = classifyParticipation({ rosterPlayer: ROSTER_P, injuriesFreshness: FRESH, seasonType: 1, nowIso: NOW });
  assert.equal(bare.state, "ROLE_UNCERTAIN");
  const scenario = { playerId: "nfl-athlete-1", expectedSnapShare: 0.35, source: "team beat availability note (dated)", asOf: "2026-08-13T01:00:00Z", expiresAt: "2026-08-14T02:00:00Z" };
  const withSc = classifyParticipation({ rosterPlayer: ROSTER_P, injuriesFreshness: FRESH, seasonType: 1, snapScenario: scenario, nowIso: NOW });
  assert.equal(withSc.state, "ACTIVE_PROJECTED");
  assert.equal(withSc.snapScenario.expectedSnapShare, 0.35);
  const expired = classifyParticipation({ rosterPlayer: ROSTER_P, injuriesFreshness: FRESH, seasonType: 1, snapScenario: { ...scenario, expiresAt: "2026-08-13T02:00:00Z" }, nowIso: NOW });
  assert.equal(expired.state, "ROLE_UNCERTAIN", "expired scenarios do not gate anything open");
});

test("regular season: fresh + unblocked = ACTIVE_PROJECTED (CONFIRMED is honestly unreachable without an actives source)", () => {
  const r = classifyParticipation({ rosterPlayer: ROSTER_P, injuryFact: { status: "Active" }, injuriesFreshness: FRESH, seasonType: 2, nowIso: NOW });
  assert.equal(r.state, "ACTIVE_PROJECTED");
  assert.match(r.reason, /ACTIVE_CONFIRMED needs an official-actives source/);
});

test("scenario/override discipline: dated, sourced, expiring, reviewed", () => {
  assert.equal(validateSnapScenario(null, NOW).ok, false);
  assert.equal(validateSnapScenario({ playerId: "x", expectedSnapShare: 1.2, source: "s", asOf: NOW, expiresAt: "2026-08-14T00:00:00Z" }, NOW).ok, false);
  assert.equal(validateOverride({ playerId: "x", state: "INACTIVE", source: "s", asOf: "2026-08-13T00:00:00Z", expiresAt: "2026-08-14T00:00:00Z", reviewer: "yash", rationale: "coach ruled him out in presser" }, NOW).ok, true);
  assert.equal(validateOverride({ playerId: "x", state: "INACTIVE", source: "s", asOf: "2026-08-13T00:00:00Z", expiresAt: "2026-08-14T00:00:00Z", rationale: "coach ruled him out" }, NOW).ok, false, "anonymous overrides refuse");
  assert.equal(validateOverride({ playerId: "x", state: "PROBABLY_FINE", source: "s", asOf: "2026-08-13T00:00:00Z", expiresAt: "2026-08-14T00:00:00Z", reviewer: "y", rationale: "outside the closed set!!" }, NOW).ok, false);
});

test("allocation coherence refuses: over-target, receptions>targets, forced-100% lists", () => {
  const good = validateAllocation({
    teamPassAttempts: 30, teamRushAttempts: 25, teamOffensiveTds: 3,
    players: [
      { playerId: "a", targets: 8, receptions: 5, tdProbabilityShare: 0.2 },
      { playerId: "b", rushAttempts: 14, tdProbabilityShare: 0.3 },
    ],
    residual: { label: "defense/ST/unlisted", tdProbabilityShare: 0.5 },
  });
  assert.deepEqual(good.errors, []);
  assert.equal(validateAllocation({ teamPassAttempts: 10, teamRushAttempts: 10, players: [{ playerId: "a", targets: 11 }], residual: { tdProbabilityShare: 1 } }).ok, false);
  assert.equal(validateAllocation({ teamPassAttempts: 10, teamRushAttempts: 10, players: [{ playerId: "a", targets: 3, receptions: 4 }], residual: { tdProbabilityShare: 1 } }).ok, false);
  const forced = validateAllocation({ teamPassAttempts: 10, teamRushAttempts: 10, players: [{ playerId: "a", tdProbabilityShare: 1.0 }], residual: null });
  assert.equal(forced.ok, false, "no residual = forced 100% across the visible list = refused");
});

test("REAL ARTIFACTS · the next event's pool builds from the real roster + injuries captures", () => {
  const rosters = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/rosters/latest.json"), "utf8"));
  const registry = buildPlayerRegistry([rosters]);
  const injuries = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/injuries/nfl/latest.json"), "utf8"));
  const sch = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/schedule/latest.json"), "utf8"));
  // P178: this pinned providerEventId 401873272 (DET@CIN), which left the forward-looking capture
  // the moment that game went final. The intent was "a REAL event from the committed artifact", so
  // take the earliest scheduled one and read its own two teams off it.
  const event = sch.rows.filter((r) => r.statusRaw === "STATUS_SCHEDULED").sort((a, b) => a.dateUtc.localeCompare(b.dateUtc))[0];
  assert.ok(event, "the committed capture holds a scheduled event");
  const pool = buildActivePool({ event, registry, injuriesArtifact: injuries, nowIso: injuries.generatedAt });
  for (const abbr of [event.home.abbr, event.away.abbr]) {
    const p = pool.pools[abbr];
    assert.ok(p.accounting.rosterSize > 60, `${abbr} roster present (${p.accounting.rosterSize})`);
    assert.equal(p.accounting.exact, true, "population-exact");
    for (const row of p.players) assert.ok(PARTICIPATION_STATES.includes(row.state));
    /*
     * P224: these two lines asserted the PRESEASON defaults against a capture that has since rolled
     * to the regular-season opener. The contract at the top of participation.mjs is explicit —
     * ROLE_UNCERTAIN is "ALWAYS the preseason default", ACTIVE_PROJECTED is the regular-season one —
     * so the module was right and the test was pinning a phase. Assert per phase, and keep the one
     * claim that must hold in EVERY phase.
     */
    if (event.seasonType === 1) {
      assert.ok((p.counts.ROLE_UNCERTAIN ?? 0) > 40, `${abbr}: preseason default is ROLE_UNCERTAIN (${p.counts.ROLE_UNCERTAIN}) — no snap scenarios exist yet`);
      assert.equal(p.counts.ACTIVE_PROJECTED ?? 0, 0, "nobody projects active without a snap scenario in preseason");
    } else {
      assert.ok((p.counts.ACTIVE_PROJECTED ?? 0) > 40, `${abbr}: outside preseason the roster projects active (${p.counts.ACTIVE_PROJECTED})`);
    }
    /*
     * THE PHASE-INDEPENDENT CLAIM. ACTIVE_CONFIRMED needs an official game-day actives source that
     * this platform has no rights to, so it is unreachable by construction. A day it starts
     * appearing is a source release — or a defect — and either way must not pass silently.
     */
    assert.equal(p.counts.ACTIVE_CONFIRMED ?? 0, 0, `${abbr}: ACTIVE_CONFIRMED is unreachable without an official actives source`);
  }
});

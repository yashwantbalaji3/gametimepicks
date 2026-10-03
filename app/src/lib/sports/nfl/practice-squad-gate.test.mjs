/**
 * Session 9 overnight · D1 — a practice-squad player is not on the active roster and gets no board row.
 * Mutation probes: the active-roster gate must catch practice squad, prior team and inactive.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { activeRosterIndex, auditBoard } from "./board-roster-integrity.mjs";

const ROSTER = { teams: [
  { teamAbbr: "AAA", players: [{ id: 1, status: { type: "active" } }, { id: 2, status: { type: "practice-squad" } }, { id: 3, status: { type: "day-to-day" } }, { id: 4 }] },
  { teamAbbr: "BBB", players: [{ id: 9, status: { type: "active" } }] },
] };
const board = (players) => ({ matchup: "AAA @ BBB", players: players.map(([id, team]) => ({ playerId: `nfl-athlete-${id}`, name: `P${id}`, team, participation: "AVAILABLE_ROLE_UNCERTAIN", markets: { anytime_td: {} } })) });

test("the active roster excludes the practice squad and keeps every other status (unknown status is not a practice-squad claim)", () => {
  const { active, practiceSquad } = activeRosterIndex(ROSTER);
  assert.deepEqual([...active.get("AAA")].sort(), ["nfl-athlete-1", "nfl-athlete-3", "nfl-athlete-4"]);
  assert.deepEqual([...practiceSquad], [["nfl-athlete-2", "AAA"]]);
  assert.equal(activeRosterIndex(null).active.size, 0, "no roster: nothing invented");
});

test("roster mutation probes land and are caught by the board audit", () => {
  const { active, practiceSquad } = activeRosterIndex(ROSTER);
  const codes = (b, extra = {}) => auditBoard({ board: b, rosterByTeam: active, practiceSquad, unavailable: new Map(), ...extra }).map((v) => v.code);
  assert.deepEqual(codes(board([[1, "AAA"], [9, "BBB"]])), [], "clean board: no violation");
  assert.ok(codes(board([[2, "AAA"]])).includes("PRACTICE_SQUAD_PROJECTED"), "practice squad survives the active-roster gate");
  assert.ok(codes(board([[9, "AAA"]])).includes("OFF_ROSTER"), "prior-team / wrong-team player");
  assert.ok(codes(board([[1, "AAA"]]), { unavailable: new Map([["nfl-athlete-1", "Out"]]) }).includes("UNAVAILABLE_PROJECTED"), "inactive survives");
});

test("the board producer builds membership from the ACTIVE roster and names what it filters", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/build-nfl-player-board.mjs"), "utf8");
  assert.match(src, /const \{ active: rosterByTeam, practiceSquad \} = activeRosterIndex\(/);
  assert.match(src, /practiceSquadFiltered,\s*\n\s*practiceSquadFilteredPlayers:/);
  assert.match(src, /auditBoard\(\{ board: artifact, rosterByTeam, practiceSquad,/);
});

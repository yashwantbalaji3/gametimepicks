/**
 * EXTENDED LEG SETTLEMENT — MLB player props (settled_leans join) + soccer (committed WC FT finals).
 *
 * Pins deterministic, side-correct grading; ambiguous/absent player-prop matches ⇒ pending (never guess);
 * DNP ⇒ unavailable (never loss); soccer rules (match_result / double_chance / DNB / totals / BTTS) on the
 * FT score, oriented to the event's home/away; non-final ⇒ pending; and that the real committed WC
 * settlement artifact parses.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { matchSettledRow, settlePlayerPropFromRow, matchWcFinal, settleSoccerLeg, teamsFromEvent, normalizeTeam } from "./leg-settlement.ts";

const app = process.cwd();
// settled_leans-shaped rows (real shape: gamePk, marketKey, playerName, line, actual).
const rows = [
  { gamePk: 1, marketKey: "batter_hits", playerName: "George Springer", line: 0.5, actual: 0 },
  { gamePk: 1, marketKey: "batter_hits", playerName: "Otto Lopez", line: 0.5, actual: 2 },
  { gamePk: 2, marketKey: "batter_hits", playerName: "Sam DNP", line: 0.5, actual: null },
];
const leg = (o) => ({ sport: "MLB", marketKey: "batter_hits", line: 0.5, ...o });

test("1 · player-prop match is deterministic + side-correct", () => {
  const m = matchSettledRow(leg({ gamePk: 1, selection: "George Springer Hits Over 0.5" }), rows);
  assert.ok(m.row, "matched Springer");
  assert.equal(settlePlayerPropFromRow("over", 0.5, m.row).status, "loss", "0 < 0.5 ⇒ Over loses");
  assert.equal(settlePlayerPropFromRow("under", 0.5, m.row).status, "win", "0 < 0.5 ⇒ Under wins");
});

test("2 · absent / ambiguous / DNP are honest (pending / unavailable, never a loss)", () => {
  assert.equal(matchSettledRow(leg({ gamePk: 99, selection: "George Springer Hits Over 0.5" }), rows).row, null, "no gamePk match ⇒ pending");
  assert.match(matchSettledRow(leg({ selection: "X Hits Over 0.5" }), rows).reason, /no gamePk/, "no gamePk ⇒ reason");
  const dnp = matchSettledRow(leg({ gamePk: 2, selection: "Sam DNP Hits Over 0.5" }), rows);
  assert.equal(settlePlayerPropFromRow("over", 0.5, dnp.row).status, "unavailable", "null actual ⇒ unavailable, not loss");
});

test("3 · soccer FT rules (Norway 1 - 4 France), oriented to the event home/away", () => {
  const finals = [{ match: "Norway vs France", homeGoals: 1, awayGoals: 4, status: "FT" }];
  const f = matchWcFinal("Norway vs France", finals); // Norway home
  assert.deepEqual({ h: f.home, a: f.away }, { h: 1, a: 4 });
  assert.equal(settleSoccerLeg("match_result", "away", undefined, f).status, "win", "France (away) won");
  assert.equal(settleSoccerLeg("match_result", "home", undefined, f).status, "loss");
  assert.equal(settleSoccerLeg("double_chance", "homeOrDraw", undefined, f).status, "loss", "Norway or Draw loses");
  assert.equal(settleSoccerLeg("double_chance", "awayOrDraw", undefined, f).status, "win");
  assert.equal(settleSoccerLeg("draw_no_bet", "home", undefined, f).status, "loss");
  assert.equal(settleSoccerLeg("match_total_goals", "over", 2.5, f).status, "win", "5 > 2.5");
  assert.equal(settleSoccerLeg("btts", "yes", undefined, f).status, "win", "1 & 4 both > 0");
});

test("4 · event orientation handles reversed home/away + draws + non-final", () => {
  const finals = [{ match: "Norway vs France", homeGoals: 1, awayGoals: 4, status: "FT" }];
  const f = matchWcFinal("France vs Norway", finals); // event home = France ⇒ orient to France
  assert.deepEqual({ h: f.home, a: f.away }, { h: 4, a: 1 }, "swapped to event orientation");
  assert.equal(settleSoccerLeg("double_chance", "homeOrDraw", undefined, f).status, "win", "France or Draw wins");
  const draw = { home: 1, away: 1, status: "FT" };
  assert.equal(settleSoccerLeg("draw_no_bet", "home", undefined, draw).status, "push", "draw ⇒ DNB push");
  assert.equal(settleSoccerLeg("match_result", "home", undefined, { home: 0, away: 0, status: "LIVE" }).status, "pending", "non-final ⇒ pending");
  assert.equal(settleSoccerLeg("match_result", "home", undefined, null).status, "pending", "no final ⇒ pending");
});

test("5 · helpers + the REAL committed WC settlement artifact parse", () => {
  assert.deepEqual(teamsFromEvent("France vs Morocco"), { home: "france", away: "morocco" });
  assert.equal(normalizeTeam("Côte d'Ivoire"), "cotedivoire");
  const p = path.join(app, "public/data/world-cup/settlement/2026-06-26.json");
  if (!fs.existsSync(p)) return;
  const finals = JSON.parse(fs.readFileSync(p, "utf8")).finals;
  const f = matchWcFinal("Norway vs France", finals);
  assert.ok(f && Number.isInteger(f.home) && Number.isInteger(f.away), "matched a real committed FT final");
});

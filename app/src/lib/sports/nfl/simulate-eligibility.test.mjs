/**
 * Release A guards (Program 178): NFL is a first-class Simulate sport, and every number on the
 * lobby comes from ONE eligible-event set.
 *
 * The founder's defect was discovery: /simulate offered Today, MLB, NBA, NHL and UFC while live NFL
 * simulations existed only behind /nfl. These tests hold the fix in place AND hold the shape that
 * prevents the next version of the bug — counts computed at their own call sites.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { isEligibleForLobby, nflSimulateEligibility, STARTED_GRACE_HOURS } from "./simulate-eligibility.ts";

const APP = process.cwd();
const lobby = fs.readFileSync(path.join(APP, "src/components/games/simulate-lobby.tsx"), "utf8");
const experience = fs.readFileSync(path.join(APP, "src/components/games-experience.tsx"), "utf8");

const STAMP = "2026-08-14T04:00:00Z";
const sim = (over = {}) => ({
  providerEventId: "1", canonicalEventId: "nfl-1", matchup: "AAA @ BBB",
  kickoffUtc: "2026-08-14T23:00Z", lifecycle: "UPCOMING", locked: false, state: "EXPERIMENTAL_LEAN",
  home: { abbr: "BBB", name: "B" }, away: { abbr: "AAA", name: "A" },
  projectedScore: { home: 19, away: 19 }, winProbability: { home: 0.49, away: 0.51 },
  total: { median: 38, p10: 23, p90: 52 }, hasMarket: true, ...over,
});

test("METAMORPHIC · one eligible artifact in, one game out; take it away and it goes", () => {
  const events = [sim()];
  assert.equal(events.filter((e) => isEligibleForLobby(e, STAMP)).length, 1);
  assert.equal([].filter((e) => isEligibleForLobby(e, STAMP)).length, 0);
  // two distinct artifacts produce two rows — the count tracks the set, not a constant
  const two = [sim(), sim({ providerEventId: "2", canonicalEventId: "nfl-2" })];
  assert.equal(two.filter((e) => isEligibleForLobby(e, STAMP)).length, 2);
});

test("METAMORPHIC · a SCHEDULE-ONLY entry can never promote NFL onto the lobby", () => {
  for (const missing of ["projectedScore", "winProbability", "total"]) {
    const e = sim({ [missing]: null });
    assert.equal(isEligibleForLobby(e, STAMP), false, `an event with no ${missing} is not simulatable`);
  }
  // and the state label a schedule row would carry cannot reach ACTIVE either
  assert.match(lobby, /nflEligibility\.state === "ARTIFACT_UNAVAILABLE"/);
});

test("a SETTLED game leaves the board, and a STARTED one lingers only briefly", () => {
  assert.equal(isEligibleForLobby(sim({ lifecycle: "SETTLED" }), STAMP), false);

  const kickoff = "2026-08-14T00:00Z";
  const hoursAfter = (h) => new Date(Date.parse(kickoff) + h * 3_600_000).toISOString().replace(".000", "");
  assert.equal(isEligibleForLobby(sim({ lifecycle: "STARTED", kickoffUtc: kickoff }), hoursAfter(STARTED_GRACE_HOURS - 1)), true);
  assert.equal(isEligibleForLobby(sim({ lifecycle: "STARTED", kickoffUtc: kickoff }), hoursAfter(STARTED_GRACE_HOURS + 1)), false,
    "a game hours past kickoff is either final or broken — either way it is not simulatable tonight");
});

test("STALENESS IS JUDGED BETWEEN TWO ARTIFACT STAMPS — never against a build-time clock", () => {
  const src = fs.readFileSync(path.join(APP, "src/lib/sports/nfl/simulate-eligibility.ts"), "utf8");
  // Strip comments first: the file EXPLAINS why it must not call a build-time clock, and a naive
  // scan flags that explanation. A guard that punishes its own rationale teaches the next author to
  // delete the rationale.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /Date\.now\(\)|new Date\(\)/,
    "a static export freezes a build-time clock into the HTML, where it silently becomes a lie");
  assert.match(src, /Two artifact-owned timestamps compared to each other cannot rot/);
});

test("AN OUTAGE IS NOT AN EMPTY SLATE — three distinct states, each with its own words", () => {
  const live = nflSimulateEligibility();
  assert.ok(["ACTIVE", "NO_ACTIVE_SLATE", "ARTIFACT_UNAVAILABLE"].includes(live.state));
  assert.ok(live.note.length > 40, "every state explains itself");
  // the lobby renders all three differently: active card / conditional / provider-pending
  assert.match(lobby, /"provider_pending", "data unavailable"/);
  assert.match(lobby, /"conditional", "no current slate"/);
});

test("ONE SET · the card count, the ready count and the rendered rows cannot disagree", () => {
  const live = nflSimulateEligibility();
  // P179-A0: readyCount is no longer events.length "by construction". That construction is exactly
  // what let ten shared-prior forecasts report themselves as ten ready simulations. It now counts a
  // CLASSIFICATION, and may legitimately be zero while ten artifacts exist.
  assert.equal(live.readyCount, live.events.filter((e) => e.simulationReady).length,
    "readyCount counts SIMULATION_READY events");
  assert.ok(live.readyCount <= live.events.length);
  // the lobby builds its rows from that same call, and its card reads the row count back
  assert.match(lobby, /const nflEligibility = nflSimulateEligibility\(\)/);
  assert.match(lobby, /for \(const e of nflEligibility\.events\)/);
  assert.match(lobby, /mk\("nfl", nflId\.label, nflId\.icon, "active", "active", nflRows\.length, simReadyCountFor\("nfl"\)/);
  // Today's aggregate is derived from the same rows, not from an MLB-only artifact count
  // ONE derived total, read by both the hero proof chip and the Today card
  assert.match(lobby, /const boardReadyCount = rows\.filter\(\(r\) => r\.simReady\)\.length;/);
  assert.equal((lobby.match(/boardReadyCount/g) ?? []).length, 3, "declared once, consumed by the hero and the Today card");
});

test("the filter chips are DERIVED from the rows present — a static list is how they drift", async () => {
  const { chipsFor } = await import("../../simulate-chips.ts");
  assert.deepEqual(chipsFor([]), ["all"]);
  assert.deepEqual(chipsFor([{ sport: "nfl" }, { sport: "mlb" }]), ["all", "mlb", "nfl"], "order is deliberate, membership is derived");
  assert.ok(chipsFor([{ sport: "curling" }]).includes("curling"), "an unlisted sport is appended, never silently dropped");
  assert.doesNotMatch(experience, /const CHIPS = \[/, "the hand-kept chip list is gone");
  assert.match(experience, /import \{ chipsFor \} from "@\/lib\/simulate-chips"/);
  assert.match(experience, /sport: "world_cup" \| "mlb" \| "nba" \| "ufc" \| "nfl";/);
});

test("sports are ORDERED by their own tone, not hand-ranked", () => {
  assert.match(lobby, /const TONE_RANK: Record<SportStateTone, number>/);
  assert.match(lobby, /if \(a\.key === "today"\) return -1;/);
  // no calendar literal anywhere in the lobby or the selector
  // Comments are stripped first: both files EXPLAIN the dated incident that motivated the rule, and
  // a naive scan flags the explanation. A guard that punishes its own rationale teaches the next
  // author to delete the rationale — this repository has now hit that trap four times.
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const [name, src] of [["lobby", lobby], ["eligibility", fs.readFileSync(path.join(APP, "src/lib/sports/nfl/simulate-eligibility.ts"), "utf8")]]) {
    assert.deepEqual(strip(src).match(/\b20\d\d-\d\d-\d\d\b/g) ?? [], [], `${name} must not pin a date`);
  }
});

test("every NFL row opens the NATIVE report route P177 built", () => {
  assert.match(lobby, /detailHref: `\/nfl\/game\/\$\{e\.providerEventId\}`/);
  const live = nflSimulateEligibility();
  for (const e of live.events) {
    const route = path.join(APP, "out", "nfl", "game", e.providerEventId, "index.html");
    if (fs.existsSync(path.join(APP, "out"))) {
      assert.ok(fs.existsSync(route), `${e.matchup}: the lobby links /nfl/game/${e.providerEventId}, which must exist in the export`);
    }
  }
});

test("LABEL DISCIPLINE · the NFL row never borrows validated-tier language", () => {
  const block = lobby.slice(lobby.indexOf("const nflEligibility"), lobby.indexOf("// UFC (one event row)"));
  for (const banned of ["edge", "lock", "best bet", "guaranteed", "profitable", "high-confidence"]) {
    assert.doesNotMatch(block.replace(/locked/gi, ""), new RegExp(`\\b${banned}\\b`, "i"), `the NFL row must not say "${banned}"`);
  }
  assert.match(block, /Not proven to beat the market|experimental/i);
});

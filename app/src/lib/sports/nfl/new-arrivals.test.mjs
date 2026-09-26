/**
 * P693 — the arrivals strip must not contradict the board above it.
 *
 * THE DEFECT. `deriveNewArrivals` decides "the model cannot place this player" against
 * `role-shares-v1/current.json`; the board publishes its projections from the WEEKLY share-level
 * forward forecast. Two different producers on two different cadences. On the 2026-09-27 slate the
 * first was 17 days older than the second, and 28 of 52 arrivals across 13 of 14 games were listed
 * as unplaceable movers WHILE carrying a full projection on the same page — each with a note
 * asserting "he is NOT in this game's simulated team numbers", published in a PUBLIC_DERIVED
 * artifact, false for every one of them.
 *
 * WHY THE RULE IS A FUNCTION AND NOT A FRESHNESS FIX. A strip whose correctness depends on two
 * producers staying in step is wrong even while they are in step. The board's own published rows
 * are the only pool that can answer a question about the board.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { shadowProjectedArrivals } from "./new-arrivals.mjs";

const APP = process.cwd();
const DIR = path.join(APP, "public/data/nfl/player-board");

const arrival = (playerId, team, name) => ({ playerId, team, name, position: "WR", lastSeason: { club: "TB", games: 17 } });

test("P693 · a projected player is removed from the strip, and the removal is counted", () => {
  const out = shadowProjectedArrivals({
    arrivals: { SF: [arrival("nfl-athlete-1", "SF", "Mike Evans"), arrival("nfl-athlete-2", "SF", "Brandin Cooks")] },
    players: [{ playerId: "nfl-athlete-1", team: "SF", name: "Mike Evans", markets: {} }],
  });
  assert.equal(out.arrivalsShadowed, 1, "the contradiction is counted, never silent");
  assert.deepEqual(out.newArrivals.SF.map((a) => a.name), ["Brandin Cooks"], "only the genuinely unplaced mover survives");
});

test("P693 · a genuinely unplaced mover is kept — the strip's purpose survives the fix", () => {
  const out = shadowProjectedArrivals({
    arrivals: { WSH: [arrival("nfl-athlete-9", "WSH", "Stefon Diggs")] },
    players: [{ playerId: "nfl-athlete-4", team: "WSH", name: "Someone Else", markets: {} }],
  });
  assert.equal(out.arrivalsShadowed, 0);
  assert.deepEqual(out.newArrivals.WSH.map((a) => a.name), ["Stefon Diggs"],
    "over-filtering would reintroduce the defect the strip exists to prevent: a star silently absent");
});

test("P693 · the match is by TEAM AND id, not by id alone", () => {
  // A player projected for one club is not thereby placed at another. Keying on the id alone would
  // silently drop a real arrival whenever the same athlete appeared on the other side of the board.
  const out = shadowProjectedArrivals({
    arrivals: { SF: [arrival("nfl-athlete-1", "SF", "Mike Evans")] },
    players: [{ playerId: "nfl-athlete-1", team: "ARI", name: "Mike Evans", markets: {} }],
  });
  assert.equal(out.arrivalsShadowed, 0, "a projection for ARI does not place him at SF");
  assert.equal(out.newArrivals.SF.length, 1);
});

test("P693 · a team whose every arrival is projected disappears from the strip entirely", () => {
  const out = shadowProjectedArrivals({
    arrivals: { SF: [arrival("nfl-athlete-1", "SF", "Mike Evans")] },
    players: [{ playerId: "nfl-athlete-1", team: "SF", name: "Mike Evans", markets: {} }],
  });
  assert.equal(out.arrivalsShadowed, 1);
  assert.ok(!("SF" in out.newArrivals), "an empty team key would render a heading over nothing");
});

test("P693 · missing inputs refuse to invent a strip", () => {
  assert.deepEqual(shadowProjectedArrivals({ arrivals: null, players: null }), { newArrivals: {}, arrivalsShadowed: 0 });
});

/*
 * LIVE · the published artifacts. Boards written before this guard carry no `arrivalsShadowed`;
 * they are counted and reported rather than asserted, because a regenerated NFL artifact comes
 * from the bots and never from a local run. The assertion arms itself per board at the next event
 * window, so this does not need revisiting — and the unit tests above are what prove the rule
 * works today. `reduce` over an empty directory is not a pass: the count is printed either way.
 */
test("LIVE · no published board lists a projected player as an unplaced mover", () => {
  const boards = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((f) => /^\d+\.json$/.test(f))
        .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { return null; } })
        .filter((b) => b && b.artifact === "nfl-player-board")
    : [];
  const armed = boards.filter((b) => typeof b.arrivalsShadowed === "number");
  console.log(`P693 live coverage: ${armed.length} of ${boards.length} published boards carry the guard`);
  for (const b of armed) {
    const projected = new Set((b.players ?? []).map((p) => `${p.team}:${p.playerId}`));
    for (const [abbr, list] of Object.entries(b.newArrivals ?? {})) {
      assert.ok(list.length, `${b.matchup}: ${abbr} renders an arrivals heading over an empty list`);
      for (const a of list) {
        assert.ok(!projected.has(`${a.team}:${a.playerId}`),
          `${b.matchup}: ${a.name} is projected on this board AND listed as a mover who is not in its numbers`);
      }
    }
  }
});

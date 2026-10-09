/**
 * TRUTH-001 — the simulated box score never passes a replacement-rated row off as a projection.
 *
 * Run: npx tsx --test src/lib/mlb/full-game/box-score-rates.test.mjs
 *
 * Pinned on the immutable committed artifact 2026-10-07 TB @ NYY (849838), which recorded only the
 * per-team count (3 TB, 2 NYY). An older artifact is never guessed at: the count is stated and no row
 * is marked. New artifacts carry `rateSource` per row and are marked row by row.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { rowRateLabel, teamRateNote } from "./box-score-rates.ts";

const SIM_DIR = path.join(process.cwd(), "public/data/mlb/full-game-simulations");
const REPORT = path.join(process.cwd(), "src/components/game/mlb-full-game-report.tsx");
const game = (date, pk) => JSON.parse(fs.readFileSync(path.join(SIM_DIR, `${date}.json`), "utf8")).games.find((g) => g.gamePk === pk);

test("older artifact (849838): the count is stated, no row is guessed", () => {
  const g = game("2026-10-07", 849838);
  assert.equal(g.completeness.awayLineupSource, "confirmed");
  assert.equal(g.players.batters.some((b) => "rateSource" in b), false, "published before the field existed");
  const away = g.players.batters.filter((b) => b.team === g.awayTeam);
  assert.ok(away.every((b) => rowRateLabel(b) === "not_recorded"));
  assert.equal(teamRateNote(g, g.awayTeam),
    `${9 - g.completeness.awayRatedCount} of 9 batters were simulated at replacement-level rates (no GTP projection). This simulation did not record which ones, so no row is marked.`);
  assert.equal(9 - g.completeness.awayRatedCount, 3);
  assert.equal(9 - g.completeness.homeRatedCount, 2);
});

test("new artifact: replacement rows are marked and counted", () => {
  const rows = Array.from({ length: 9 }, (_, i) => ({ playerId: 10 + i, team: "AAA", rateSource: i === 4 ? "replacement" : "projection" }));
  const g = { awayTeam: "AAA", homeTeam: "BBB", completeness: { awayRatedCount: 8 }, players: { batters: rows, pitchers: [] } };
  assert.equal(rowRateLabel(rows[4]), "replacement");
  assert.equal(rowRateLabel(rows[0]), "projection");
  assert.match(teamRateNote(g, "AAA"), /^1 of 9 marked "replacement rates"/);
  const all = { ...g, completeness: { awayRatedCount: 9 }, players: { batters: rows.map((r) => ({ ...r, rateSource: "projection" })), pitchers: [] } };
  assert.equal(teamRateNote(all, "AAA"), null, "nothing to disclose when every row is projected");
});

test("a filler slot is replacement by construction, and an all-filler gap is fully visible", () => {
  assert.equal(rowRateLabel({ playerId: -3 }), "replacement");
  const rows = [...Array.from({ length: 6 }, (_, i) => ({ playerId: 10 + i, team: "AAA" })), ...[-7, -8, -9].map((id) => ({ playerId: id, team: "AAA" }))];
  const g = { awayTeam: "AAA", homeTeam: "BBB", completeness: { awayRatedCount: 6 }, players: { batters: rows, pitchers: [] } };
  assert.equal(teamRateNote(g, "AAA"), '3 of 9 slots are "Lineup fallback" rows simulated at replacement-level rates.');
});

test("EVERY committed game: the note never claims fewer replacement rows than the artifact recorded", () => {
  let checked = 0;
  for (const f of fs.readdirSync(SIM_DIR).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    for (const g of JSON.parse(fs.readFileSync(path.join(SIM_DIR, f), "utf8")).games ?? []) {
      if (!g.players?.batters?.length) continue;
      for (const [team, side] of [[g.awayTeam, "away"], [g.homeTeam, "home"]]) {
        const rated = g.completeness?.[`${side}RatedCount`];
        if (typeof rated !== "number") continue;
        const note = teamRateNote(g, team);
        if (9 - rated > 0) {
          checked++;
          assert.ok(note && note.startsWith(`${9 - rated} of 9`), `${f} ${g.gamePk} ${team}: ${note}`);
        }
      }
    }
  }
  assert.ok(checked > 0);
});

test("the box score renders the mark and the team note from these helpers", () => {
  const src = fs.readFileSync(REPORT, "utf8");
  assert.match(src, /rowRateLabel\(b\) === "replacement"/);
  assert.match(src, /teamRateNote\(g, team\)/);
});

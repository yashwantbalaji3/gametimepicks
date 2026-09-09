/**
 * P250-GD3 — GAME-DAY EVIDENCE FRESHNESS + ROSTER MOVERS.
 *
 * Two defects found by the founder on game day, both about the product's relationship to its own
 * evidence rather than its models:
 *
 * 1. A DESIGNATION THIS CHAIN CONDITIONS ON MUST BE REFRESHED BY THIS CHAIN. The injuries feed was
 *    captured only by sport-schedules, on its own cadence. On 2026-09-09 our snapshot was 22.6h
 *    old — inside the 24h bound, so every surface said FRESH — while the source had upgraded
 *    TreVeyon Henderson to Out four hours after it. The site published volume projections for an
 *    out player on the day of his game. The event window now captures injuries itself, before
 *    event assembly and before role evidence.
 *
 * 2. A ROSTER MOVER IS NOT A NON-PERSON. A player who changed clubs after his last corpus game is
 *    absent from BOTH share pools — off the old club's list, and started at zero evidence on the
 *    new one by the evaluated stint rule. A.J. Brown (16 games, 64.3 receiving yards per game at
 *    PHI in 2025) appeared NOWHERE on New England's page. The stint rule is RIGHT about what is
 *    unknown; the product was wrong to render that as silence. His prior-club usage now publishes
 *    as stated fact, explicitly outside the simulated numbers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { deriveNewArrivals } from "./new-arrivals.mjs";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const readApp = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("the event window captures injuries ITSELF, before the steps that condition on them", () => {
  const wf = readApp("../.github/workflows/nfl-event-window.yml");
  assert.match(wf, /capture-injuries\.mjs --now/, "the window refreshes designations");
  const iInj = wf.indexOf("capture-injuries.mjs");
  const iAssembly = wf.indexOf("run-nfl-event-window.mjs");
  const iRole = wf.indexOf("build-nfl-role-evidence.mjs");
  assert.ok(iInj > 0 && iInj < iAssembly, "injuries refresh BEFORE event assembly builds the participation pool");
  assert.ok(iInj < iRole, "…and before role evidence reads the designations");
});

test("LIVE · a player designated Out carries no volume projection anywhere", () => {
  const injuries = read("data/internal/research/injuries/nfl/latest.json");
  const out = new Set(
    (injuries.entries ?? [])
      .filter((e) => /^(out|injured\s*reserve|ir|suspend|pup|nfi)/i.test(String(e.status ?? "")))
      .map((e) => `nfl-athlete-${e.athleteId}`),
  );
  const dir = path.join(APP, "public/data/nfl/player-board");
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
    const b = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const p of b.players ?? []) {
      if (!out.has(p.playerId)) continue;
      const volume = Object.keys(p.markets).filter((m) => m !== "anytime_td");
      assert.deepEqual(volume, [], `${p.name} is designated out and still carries ${volume.join(", ")} in ${b.matchup}`);
    }
  }
});

test("LIVE · every board's evidence is no older than the artifact that built it", () => {
  const dir = path.join(APP, "public/data/nfl/player-board");
  if (!fs.existsSync(dir)) return;
  const role = read("data/internal/nfl/role-evidence/latest.json");
  const injuries = read("data/internal/research/injuries/nfl/latest.json");
  // The role evidence must not predate the injuries capture it is supposed to reflect.
  assert.ok(
    Date.parse(role.generatedAt) >= Date.parse(injuries.generatedAt),
    `role evidence (${role.generatedAt}) is older than the injuries capture (${injuries.generatedAt}) — it cannot carry designations it never saw`,
  );
});

test("LIVE · no published row belongs to a player who is off that team's roster", () => {
  /*
   * P250-GD4: the Aug-13 share snapshot still listed movers under the club they LEFT, so the pool
   * did not merely omit them — it attributed their volume to the wrong team. Quinn Ewers was
   * projected as Miami's passing leader while rostered in Jacksonville; Brady Cook as the Jets' QB
   * while rostered in Miami; 27 rows in all. A missing player is a gap; a projection for a player
   * who cannot take that field is a false statement, and this is the invariant that forbids it.
   */
  const rosters = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/rosters/latest.json"), "utf8"));
  const byTeam = new Map();
  for (const t of rosters.teams ?? []) {
    const ids = new Set((t.players ?? []).map((p) => `nfl-athlete-${p.id}`));
    if (ids.size) byTeam.set(t.teamAbbr, ids);
  }
  const dir = path.join(APP, "public/data/nfl/player-board");
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
    const b = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const p of b.players ?? []) {
      const roster = byTeam.get(p.team);
      if (!roster) continue; // capture gap for that team — the builder fails closed rather than wiping a board
      assert.ok(roster.has(p.playerId), `${p.name} is projected for ${p.team} in ${b.matchup} and is not on its roster`);
    }
    assert.equal(typeof b.departedFiltered, "number", "the board records how many rows the roster filter removed");
  }
});

test("new arrivals: a notable mover is published as prior-club FACT, never as a projection", () => {
  const seasons = ["2025", "2024"]
    .map((y) => { try { return read(`data/internal/research/nfl/player-events-v1/${y}.json`); } catch { return null; } })
    .filter(Boolean);
  if (!seasons.length) return;
  const arrivals = deriveNewArrivals({
    corpusSeasons: seasons,
    roleEvidence: read("data/internal/nfl/role-evidence/latest.json"),
    shares: read("data/internal/research/nfl/role-shares-v1/current.json"),
  });
  let total = 0;
  for (const [, teams] of arrivals) {
    for (const [abbr, list] of Object.entries(teams)) {
      for (const a of list) {
        total += 1;
        assert.equal(a.team, abbr, "an arrival is filed under the club he is rostered on");
        assert.notEqual(a.lastSeason.club, abbr, "a same-club player is not an arrival — the stint rule already sees him");
        assert.ok(a.lastSeason.games >= 6, `${a.name}: a mover publishes only with a real prior sample`);
        assert.match(a.note, /NOT in this game's simulated team numbers/, `${a.name}: the frame must travel with the row`);
        // Prior-club history is FACT: no field may look like a forward projection.
        for (const k of Object.keys(a.lastSeason)) {
          assert.ok(!/proj|median|p10|p90|share/i.test(k), `${a.name}: ${k} reads as a projection, not history`);
        }
      }
    }
  }
  assert.ok(total > 0, "the current week has movers — an empty derivation would mean the join broke");
});

test("both UIs render arrivals with the not-in-these-numbers frame", () => {
  const board = readApp("src/components/nfl/player-board.tsx");
  assert.match(board, /New arrivals · not in the simulated numbers above/);
  assert.match(board, /history, not a projection/);
  const page = readApp("src/app/nfl/game/[eventId]/page.tsx");
  assert.match(page, /New arrivals · not in these numbers/);
  assert.match(page, /their share sits in the\s*\n?\s*unallocated mass/);
});

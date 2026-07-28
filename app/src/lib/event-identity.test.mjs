/**
 * Sprint 041 — event identity invariants, checked against committed artifacts.
 *
 * THE INVARIANT
 *   A provider event and a real-world game are one-to-one.
 *   No two `gameId`s may claim one `gamePk`, and no simulated game may be unreachable.
 *
 * WHY
 * On 2026-07-28 the board mapped BOTH halves of the CLE @ CIN doubleheader to gamePk 824489.
 * `gamePk 824490` was simulated but orphaned, and the early game's markets were joined to the late
 * game's simulation. Root cause: `_team_lookup_from_schedule` indexed team-name -> a single context
 * with `lookup[name] = ctx`, assuming a team plays at most one game per date.
 *
 * The upstream fix (nearest-start resolution) is unit-tested in
 * `pipeline/mlb/generate_mlb_board_identity_test.py`, including a mutation case proving the old
 * behaviour fails 7 assertions. THIS file is the other half: it checks the invariant against the
 * boards actually committed, so a regression is caught on real data rather than only in theory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const BOARDS = path.join(APP, "public/data/mlb/boards");
const SIMS = path.join(APP, "public/data/mlb/full-game-simulations");

/**
 * Boards generated BEFORE the Sprint 041 fix landed. Named and dated rather than skipped, with the
 * exact collision pinned — a nameless exclusion is how a real regression hides.
 *
 * These cannot be repaired in place: regenerating a past board would need that day's paid market
 * snapshot, which is gone. They self-heal only in the sense that every board generated from
 * 2026-07-29 onward uses the fixed resolver. If a board dated after the fix appears here, the fix
 * regressed and this guard fails.
 */
const PRE_FIX_BOARDS = new Map([
  ["2026-05-23", { collisions: 1, note: "doubleheader — two provider events collapsed onto one gamePk" }],
  ["2026-07-22", { collisions: 2, note: "two doubleheaders on one slate (gamePk 823519 and 824732)" }],
  ["2026-07-28", { collisions: 1, note: "CLE@CIN — both events mapped to gamePk 824489; 824490 orphaned" }],
]);
const FIX_LANDED_ON = "2026-07-28";

function boardDates() {
  if (!fs.existsSync(BOARDS)) return [];
  return fs
    .readdirSync(BOARDS)
    .map((f) => /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f)?.[1])
    .filter(Boolean)
    .sort();
}

/** gamePk -> set of gameIds claiming it, for one board. */
function claimsFor(date) {
  const doc = JSON.parse(fs.readFileSync(path.join(BOARDS, `${date}.json`), "utf8"));
  const byPk = new Map();
  for (const lean of doc?.leans ?? []) {
    const { gameId, gamePk } = lean ?? {};
    if (!gameId || gamePk == null) continue;
    if (!byPk.has(gamePk)) byPk.set(gamePk, new Set());
    byPk.get(gamePk).add(gameId);
  }
  return byPk;
}

test("INVARIANT · no gamePk is claimed by more than one provider event", () => {
  const violations = [];

  for (const date of boardDates()) {
    const byPk = claimsFor(date);
    const collisions = [...byPk.entries()].filter(([, ids]) => ids.size > 1);

    const known = PRE_FIX_BOARDS.get(date);
    if (known) {
      // Pinned, not waved through. If the count moves, something changed and we want to know.
      assert.equal(
        collisions.length,
        known.collisions,
        `${date}: known pre-fix board had ${known.collisions} collision(s), now ${collisions.length} — ${known.note}`,
      );
      continue;
    }

    if (collisions.length > 0) {
      const detail = collisions
        .map(([pk, ids]) => `gamePk ${pk} <- ${[...ids].map((i) => i.slice(0, 12)).join(", ")}`)
        .join("; ");
      violations.push(`${date}: ${detail}`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Two real-world games collapsed onto one identity:\n  ${violations.join("\n  ")}\n\n` +
      `  Each provider event must resolve to exactly one gamePk. A collision means one game's markets\n` +
      `  are joined to another game's model output — see _resolve_team_ctx in generate_mlb_board.py.`,
  );
});

test("INVARIANT · no simulated game is orphaned from the board", () => {
  // A simulation nobody can reach is wasted compute at best and a mis-join at worst — 824490 was
  // simulated and unreachable while its markets pointed at the other half of the doubleheader.
  const orphaned = [];

  for (const date of boardDates()) {
    const simPath = path.join(SIMS, `${date}.json`);
    if (!fs.existsSync(simPath)) continue;

    const sims = JSON.parse(fs.readFileSync(simPath, "utf8"))?.games ?? [];
    const simPks = new Set(sims.map((g) => g?.gamePk).filter((v) => v != null));
    if (simPks.size === 0) continue;

    const reachable = new Set(claimsFor(date).keys());
    const missing = [...simPks].filter((pk) => !reachable.has(pk));

    if (missing.length === 0) continue;
    if (PRE_FIX_BOARDS.has(date)) continue; // already pinned by the collision test above
    orphaned.push(`${date}: simulated but unreachable → ${missing.join(", ")}`);
  }

  assert.deepEqual(
    orphaned,
    [],
    `Simulations exist that no market row can reach:\n  ${orphaned.join("\n  ")}`,
  );
});

test("the pre-fix quarantine cannot silently absorb post-fix boards", () => {
  // The failure mode this prevents: appending a date each time the guard goes red.
  for (const date of PRE_FIX_BOARDS.keys()) {
    assert.ok(
      date <= FIX_LANDED_ON,
      `${date} is dated after the fix landed (${FIX_LANDED_ON}) — a post-fix collision is a REGRESSION, ` +
        `not something to quarantine`,
    );
  }
  // Measured across all 58 committed boards: 3 affected, 4 collisions, 1 orphaned simulation.
  // 55 of 58 are clean, which is consistent with the root cause — only doubleheader dates could
  // collide, and every one of them did.
  assert.equal(PRE_FIX_BOARDS.size, 3, "three boards predate the fix; new entries mean the fix regressed");
  const totalCollisions = [...PRE_FIX_BOARDS.values()].reduce((n, v) => n + v.collisions, 0);
  assert.equal(totalCollisions, 4, "the historical damage is 4 collisions across 3 dates");
});

test("the upstream fix and its unit tests are both present", () => {
  // The artifact guard above only sees generated output. These assert the generator itself still
  // carries the fix, so removing it fails immediately rather than on the next slate.
  const gen = fs.readFileSync(path.resolve(APP, "../pipeline/mlb/generate_mlb_board.py"), "utf8");
  assert.match(gen, /_resolve_team_ctx/, "the nearest-start resolver must exist");
  assert.match(gen, /lookup\.setdefault\(/, "the index must accumulate games, not overwrite them");
  assert.doesNotMatch(
    gen.replace(/"""[\s\S]*?"""/g, "").replace(/^\s*#.*$/gm, ""),
    /lookup\[home\["name"\]\]\s*=\s*home/,
    "last-write-wins indexing must not return",
  );
  assert.ok(
    fs.existsSync(path.resolve(APP, "../pipeline/mlb/generate_mlb_board_identity_test.py")),
    "the upstream regression tests must exist",
  );
});

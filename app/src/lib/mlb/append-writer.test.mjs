/**
 * Append-only official-addition WRITER mutations (Program 123-127 §8).
 *
 * `board-patches.test.mjs` proves the patch contract in isolation. These exercise the writer's
 * CLI — the thing that will actually run in production — because a refusal that exists in the
 * validator but is never reached by the real entry point protects nothing.
 *
 * Every case runs in a child process against a temp copy of a real board, so module caching
 * cannot mask a change, and the production board is never touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const WRITER = path.join(APP, "scripts/mlb-append-official-coverage.mjs");
const BOARDS = path.join(APP, "public/data/mlb/boards");

// FIXTURE BOARD, not the live one.
//
// The first version of this suite read today's real board and picked a genuinely uncovered event.
// It passed all afternoon and then failed at 23:30 ET with "event already started — append window
// closed": the validator was right, the TEST was time-dependent. A guard whose result depends on
// the wall clock relative to live data is not a guard.
//
// So the suite writes its own board at a far-future date — real file, real code path, real CLI —
// whose events can never have started. The date cannot collide with a generated slate, and the
// fixture is removed in `after()` so the tracked data directory is left byte-identical.
const DATE = "2099-07-04";
const FIXTURE_BOARD = path.join(BOARDS, `${DATE}.json`);
const START_A = "2099-07-04T23:40:00Z";
const START_B = "2099-07-05T00:10:00Z";

const board = {
  sport: "MLB",
  date: DATE,
  generatedAt: "2099-07-04T12:00:00.000000+00:00",
  credits: { before: "19000", after: "18990", spent: 10, estimated: 10 },
  games: [
    { gamePk: 990001, awayTeamName: "Fixture Away", homeTeamName: "Fixture Home", gameDate: START_A },
    { gamePk: 990002, awayTeamName: "Second Away", homeTeamName: "Second Home", gameDate: START_B },
  ],
  leans: [
    {
      id: "evCOVERED-Existing_Player-batter_hits-0.5",
      gameId: "evCOVERED",
      gamePk: 990001,
      marketKey: "batter_hits",
      line: 0.5,
      lean: "Over",
      playerId: null,
      player: null,
      bookmaker: "draftkings",
      capturedAt: "2099-07-04T12:00:00Z",
      commenceTime: START_A,
    },
  ],
};

fs.writeFileSync(FIXTURE_BOARD, JSON.stringify(board, null, 2) + "\n");
process.on("exit", () => { try { fs.unlinkSync(FIXTURE_BOARD); } catch { /* already gone */ } });

const covered = new Set(board.leans.map((l) => l.gamePk));
// 990002 is scheduled and uncovered — the shape an official addition legitimately targets.
const target = board.games.find((g) => !covered.has(g.gamePk));

/** A production-shaped scoped row for `target`. */
function scopedRow(over = {}) {
  const t = board.leans[0];
  return {
    ...t,
    id: `evTEST-Player_One-batter_hits-1.5`,
    gameId: "evTEST",
    gamePk: target.gamePk,
    marketKey: "batter_hits",
    line: 1.5,
    lean: "Over",
    playerId: null,
    player: null,
    capturedAt: new Date(Date.parse(target.gameDate) - 3_600_000).toISOString().replace(/\.\d+Z$/, "Z"),
    commenceTime: target.gameDate,
    ...over,
  };
}

function runWriter(rows, { event = target.gamePk, date = DATE, apply = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-writer-"));
  const rowsIn = path.join(dir, "rows.json");
  fs.writeFileSync(rowsIn, JSON.stringify({ rows }));
  const args = [WRITER, "--date", date, "--event", String(event), "--rows-in", rowsIn];
  if (apply) args.push("--apply");
  try {
    const stdout = execFileSync(process.execPath, args, { cwd: APP, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const boardSha = () => crypto.createHash("sha256").update(fs.readFileSync(path.join(BOARDS, `${DATE}.json`))).digest("hex");

test("REHEARSAL: a valid addition is accepted and writes nothing without --apply", () => {
  const before = boardSha();
  const r = runWriter([scopedRow()]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /REHEARSAL — nothing written/);
  assert.match(r.out, /1 new official identities/);
  assert.equal(boardSha(), before, "the base board must be byte-identical after a rehearsal");
});

test("MUTATION · a row whose identity is already published is refused", () => {
  const published = board.leans[0];
  const r = runWriter([{ ...scopedRow(), id: published.id, gameId: published.gameId, gamePk: published.gamePk }]);
  assert.notEqual(r.code, 0, "an already-published identity must refuse");
  assert.match(r.out, /already published|does not belong to target event/);
});

test("MUTATION · a row belonging to a different event is refused", () => {
  const other = board.games.find((g) => g.gamePk !== target.gamePk);
  const r = runWriter([scopedRow({ gamePk: other.gamePk })]);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /does not belong to target event/);
});

test("MUTATION · an unknown target event is refused", () => {
  const r = runWriter([scopedRow({ gamePk: 999999 })], { event: 999999 });
  assert.notEqual(r.code, 0);
  assert.match(r.out, /not on the canonical .* schedule/);
});

test("MUTATION · a capture at/after first pitch is refused", () => {
  const r = runWriter([scopedRow({ capturedAt: target.gameDate })]);
  assert.notEqual(r.code, 0, "a post-start capture can never be an official addition");
  assert.match(r.out, /REFUSED|at\/after scheduled start/);
});

test("MUTATION · a row with no canonical identity is refused", () => {
  const r = runWriter([{ ...scopedRow(), id: undefined, gameId: undefined, marketKey: undefined }]);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /no canonical identity|does not belong/);
});

test("zero eligible rows is an honest NO_MARKET_DECISION, not a failure", () => {
  const r = runWriter([]);
  assert.equal(r.code, 0, "an empty provider result is a successful operational decision");
  assert.match(r.out, /NO_MARKET_DECISION/);
  assert.match(r.out, /honest partial coverage retained/);
});

test("the writer contains no model math — rows come from the canonical generator", () => {
  const src = fs.readFileSync(WRITER, "utf8");
  for (const forbidden of ["projection", "calibrat", "devig", "de-vig", "Math.exp", "poisson"]) {
    assert.ok(!new RegExp(forbidden, "i").test(src.replace(/^\s*\*.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")),
      `the writer must not implement model logic (found "${forbidden}") — it consumes generator output`);
  }
});

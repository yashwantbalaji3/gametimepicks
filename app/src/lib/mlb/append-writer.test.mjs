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

const latestBoardDate = () =>
  fs.readdirSync(BOARDS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1).replace(".json", "");

const DATE = latestBoardDate();
const board = JSON.parse(fs.readFileSync(path.join(BOARDS, `${DATE}.json`), "utf8"));
const covered = new Set(board.leans.map((l) => l.gamePk));
const target = board.games.find((g) => !covered.has(g.gamePk)) ?? board.games.at(-1);

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

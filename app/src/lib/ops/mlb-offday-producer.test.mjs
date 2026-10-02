/**
 * Session 7 — an MLB OFF DAY must not fail mlb-daily-production. On 2026-10-02 (a postseason off day) Homer
 * Nukes correctly printed NO_SLATE and wrote no board, the assert demanded one, the job failed, and the
 * daily-products run chained to it (workflow_run on success) was skipped. This runs the step's OWN shell.
 *
 * Run: npx tsx --test src/lib/ops/mlb-offday-producer.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import yaml from "js-yaml";

const REPO = path.resolve(process.cwd(), "..");
const wf = yaml.load(fs.readFileSync(path.join(REPO, ".github/workflows/mlb-daily-production.yml"), "utf8"));
const step = Object.values(wf.jobs).flatMap((j) => j.steps).find((s) => s.name === "Assert Homer Nukes produced its board");
const DATE = "2031-10-02";

function run(board, { homer = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-offday-"));
  fs.mkdirSync(path.join(dir, "app/public/data/mlb/boards"), { recursive: true });
  fs.mkdirSync(path.join(dir, "app/scripts"), { recursive: true });
  fs.symlinkSync(path.join(REPO, "app/scripts/ops"), path.join(dir, "app/scripts/ops"));
  fs.writeFileSync(path.join(dir, `app/public/data/mlb/boards/${DATE}.json`), JSON.stringify(board));
  if (homer) { fs.mkdirSync(path.join(dir, "app/public/data/mlb/homer-nukes"), { recursive: true }); fs.writeFileSync(path.join(dir, `app/public/data/mlb/homer-nukes/${DATE}.json`), "{}"); }
  const script = step.run.replaceAll("${{ steps.cfg.outputs.date }}", DATE);
  return spawnSync("bash", ["-e", "-c", script], { cwd: dir, env: { ...process.env, RUN_STARTED: "2000-01-01T00:00:00Z" }, encoding: "utf8" });
}

test("the assert is gated on a board existing", () => {
  assert.equal(step.if, "steps.board.outputs.have_board == 'true'");
});

test("a 0-game board is NO_SLATE: the step passes and says why", () => {
  const r = run({ games: [] });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /NO_SLATE: the 2031-10-02 board has 0 games/);
});

test("a board WITH games and no Homer Nukes board still fails loudly", () => {
  const r = run({ games: [{ gamePk: 1 }] });
  assert.notEqual(r.status, 0, "a slate with games that produced no board must fail");
});

test("a board with games and a freshly produced Homer Nukes board passes", () => {
  const r = run({ games: [{ gamePk: 1 }] }, { homer: true });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

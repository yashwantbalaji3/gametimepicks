/* The private comparison CLI never writes line data into a repository, and spends/calls nothing. */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CLI = path.join(process.cwd(), "scripts/nba/compare-nba-lines.mjs");

test("refuses an output directory inside the repository; refuses without one", () => {
  const inRepo = spawnSync(process.execPath, [CLI, "--date", "2026-10-27", "--out-dir", path.join(process.cwd(), "tmp-private")], { encoding: "utf8", env: { ...process.env, GTP_PRIVATE_DATA_DIR: "" } });
  assert.equal(inRepo.status, 2);
  assert.match(inRepo.stderr, /inside the repository/);
  assert.ok(!fs.existsSync(path.join(process.cwd(), "tmp-private")));
  const none = spawnSync(process.execPath, [CLI, "--date", "2026-10-27"], { encoding: "utf8", env: { ...process.env, GTP_PRIVATE_DATA_DIR: "" } });
  assert.equal(none.status, 2);
});

test("the CLI makes no network call and names no provider endpoint", () => {
  const src = fs.readFileSync(CLI, "utf8");
  assert.doesNotMatch(src, /fetch\(|https?:\/\/|ODDS_API_KEY/);
});

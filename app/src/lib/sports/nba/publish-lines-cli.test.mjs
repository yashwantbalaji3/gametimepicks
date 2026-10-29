/* The NBA line publisher CLI refuses by default (display not authorized), writes nothing, and holds no network call or
   credential. CI is Node 20: spawned through npx tsx (local Node 22 hides .ts imports). */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP = process.cwd();
const CLI = path.join(APP, "scripts/nba/publish-nba-line-board.mjs");
const LINES = path.join(APP, "..", "data/odds-display/nba/lines");

test("refuses (exit 2) while the committed display authorization is off — and writes nothing anywhere", () => {
  const priv = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-publish-cli-"));
  const before = fs.existsSync(LINES) ? fs.readdirSync(LINES) : null;
  const r = spawnSync("npx", ["tsx", CLI, "--date", "2099-01-15", "--as-of", "2099-01-15T22:30:00Z", "--receipt", "docs/receipts/ODDS_AUTHORIZATION_NBA_POINTS_PILOT_2026-10-21.md", "--private-dir", priv, "--out", path.join(priv, "lines")], { cwd: APP, encoding: "utf8", env: { ...process.env, GTP_PRIVATE_DATA_DIR: "" } });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /REFUSED: NBA lines are not authorized for site display — nothing is written/);
  assert.equal(r.stdout.trim(), "");
  assert.ok(!fs.existsSync(path.join(priv, "lines")), "the --out directory was never created");
  assert.deepEqual(fs.existsSync(LINES) ? fs.readdirSync(LINES) : null, before, "nothing written to the committed default");
  fs.rmSync(priv, { recursive: true, force: true });
});

test("the CLI makes no network call, reads no credential, and can never target app/public or the export directory", () => {
  const src = fs.readFileSync(CLI, "utf8");
  assert.doesNotMatch(src, /fetch\(|https?:\/\/|ODDS_API_KEY|process\.env\.[A-Z_]*KEY/);
  // authorization is the first executable check — before arguments, inputs or the receipt are read
  const body = src.slice(src.indexOf("\nimport"));
  assert.ok(body.indexOf('displayAuthorization("nba", "site")') < body.indexOf("readFileSync"), "authorization precedes every read");
  assert.match(src, /path\.join\(APP, "public"\), path\.join\(APP, "out"\)/, "app/public and the export directory are refused output targets");
  assert.match(src, /gitTreeContaining\(o\)/, "--out inside any git working tree is refused");
  assert.doesNotMatch(src, /--authorize|--force|DISPLAY_AUTHORIZATION\s*=/, "no flag bypasses the authorization record");
});

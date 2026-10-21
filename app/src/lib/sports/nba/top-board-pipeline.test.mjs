/**
 * NBA Top Boards — the three scripts end to end on SYNTHETIC fixtures in a temp dir (never the repo's data/).
 * freeze (write-once, refuses a re-freeze at the same instant) → grade (append-only, offline) → daily report.
 * Run (from app/): node --test src/lib/sports/nba/top-board-pipeline.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { artifact, boxscore, game, player } from "./__fixtures__/top-board-fixtures.mjs";

const APP = process.cwd();
const run = (script, args) => spawnSync(process.execPath, [path.join(APP, "scripts", "nba", script), ...args], { cwd: APP, encoding: "utf8" });

test("freeze → grade → report on fixtures, entirely outside the repo", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nba-top-boards-"));
  const fdir = path.join(tmp, "forecasts"); const bdir = path.join(tmp, "boards"); const xdir = path.join(tmp, "box"); const rdir = path.join(tmp, "reports");
  fs.mkdirSync(fdir); fs.mkdirSync(xdir);
  fs.writeFileSync(path.join(fdir, "2026-11-01.json"), JSON.stringify(artifact([game("fx-p1", { home: [player(1), player(2, { injuryStatus: "Day-To-Day" })], away: [player(3)] })])));

  const f1 = run("freeze-nba-top-boards.mjs", ["--date", "2026-11-01", "--now", "2026-11-01T16:00:00Z", "--forecast-dir", fdir, "--out-dir", bdir, "--write"]);
  assert.equal(f1.status, 0, f1.stderr);
  const board = JSON.parse(fs.readFileSync(path.join(bdir, "2026-11-01.json"), "utf8"));
  assert.equal(board.editions.length, 1);
  assert.equal(board.dataClass, "PRIVATE_RESEARCH");
  assert.equal(board.publicState, "PRIVATE");
  assert.match(board.editions[0].source.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(board.editions[0].boards.points.rows.map((r) => r.player.providerAthleteId), ["1", "3"]);
  const bytes = fs.readFileSync(path.join(bdir, "2026-11-01.json"), "utf8");

  // same instant again → refused, file untouched; after tip → nothing to freeze (the date has no untipped game)
  const f2 = run("freeze-nba-top-boards.mjs", ["--date", "2026-11-01", "--now", "2026-11-01T16:00:00Z", "--forecast-dir", fdir, "--out-dir", bdir, "--write"]);
  assert.equal(f2.status, 1);
  assert.match(f2.stderr, /REFUSED/);
  const f3 = run("freeze-nba-top-boards.mjs", ["--now", "2026-11-02T06:00:00Z", "--forecast-dir", fdir, "--out-dir", bdir, "--write"]);
  assert.equal(f3.status, 0);
  assert.match(f3.stdout, /nothing to freeze/);
  assert.equal(fs.readFileSync(path.join(bdir, "2026-11-01.json"), "utf8"), bytes, "write-once: bytes unchanged");

  // grade before the box score exists → PENDING; then with it → PENDING_RESOLVED appended
  const ledger = path.join(tmp, "ledger.json");
  const g1 = run("grade-nba-top-boards.mjs", ["--now", "2026-11-02T08:00:00Z", "--boards-dir", bdir, "--ledger", ledger, "--boxscore-dir", xdir, "--write"]);
  assert.equal(g1.status, 0, g1.stderr);
  assert.match(g1.stdout, /PENDING 14/);
  fs.writeFileSync(path.join(xdir, "fx-p1.json"), JSON.stringify(boxscore("fx-p1", [{ id: 1, pts: 25, reb: 5, ast: 3, threePm: 1 }, { id: 2, pts: 9 }, { id: 3, didNotPlay: true, dnpReason: "REST", team: "18" }])));
  const g2 = run("grade-nba-top-boards.mjs", ["--now", "2026-11-02T09:00:00Z", "--boards-dir", bdir, "--ledger", ledger, "--boxscore-dir", xdir, "--write"]);
  assert.equal(g2.status, 0, g2.stderr);
  const L = JSON.parse(fs.readFileSync(ledger, "utf8"));
  assert.equal(L.entries.length, 28, "2 eligible players × 7 ranked boards, twice");
  assert.deepEqual([...new Set(L.entries.slice(14).map((e) => e.lineageReason))], ["PENDING_RESOLVED"]);
  assert.equal(L.entries.filter((e) => ["WIN", "LOSS", "PUSH"].includes(e.settlement.status)).length, 0);

  const r = run("nba-daily-performance-report.mjs", ["--date", "2026-11-01", "--now", "2026-11-02T10:00:00Z", "--boards-dir", bdir, "--ledger", ledger, "--boxscore-dir", xdir, "--out-dir", rdir, "--write"]);
  assert.equal(r.status, 0, r.stderr);
  const rep = JSON.parse(fs.readFileSync(path.join(rdir, "2026-11-01.json"), "utf8"));
  assert.deepEqual([rep.s05_settlement.counts.WIN, rep.s05_settlement.counts.VOID, rep.s05_settlement.counts.UNGRADABLE], [0, 7, 7]);
  assert.ok(fs.readFileSync(path.join(rdir, "2026-11-01.md"), "utf8").includes("## 15. Recommended investigations"));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("family flag: v1 is accepted and refuses cleanly while it has no artifact; an unknown family exits 1", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nba-top-boards-v1-"));
  const v1 = run("freeze-nba-top-boards.mjs", ["--family", "v1", "--forecast-dir", path.join(tmp, "none"), "--out-dir", tmp]);
  assert.equal(v1.status, 0, v1.stderr);
  assert.match(v1.stdout, /nothing to freeze \(v1 has not written an artifact yet\)/);
  const bad = run("freeze-nba-top-boards.mjs", ["--family", "v9"]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /unknown NBA board family/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

/**
 * SESSION 4 §50 — the roster audit command must FAIL on a bad board, not only pass on a good one.
 * Copies one live upcoming board into a temp dir, proves it passes, then injects a former-club row, an
 * OUT player and a second passer, and requires a non-zero exit naming each.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const APP = process.cwd();
const DIR = path.join(APP, "public/data/nfl/player-board");
const run = (dir) => spawnSync(process.execPath, ["scripts/ops/nfl-roster-audit.mjs", "--dir", dir, "--after", "1970-01-01T00:00:00Z"], { cwd: APP, encoding: "utf8" });

test("§50 · the roster audit exits non-zero on injected defects and names them", () => {
  const live = fs.readdirSync(DIR).filter((f) => /^\d+\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")))
    .filter((b) => b.coverage && b.integrity && b.players?.length > 1)
    .sort((a, b) => b.kickoffUtc.localeCompare(a.kickoffUtc))[0];
  if (!live) { console.log("no board with a coverage receipt yet — armed at the next event window"); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-audit-"));
  try {
    fs.writeFileSync(path.join(tmp, `${live.providerEventId}.json`), JSON.stringify(live));
    const clean = run(tmp);
    assert.equal(clean.status, 0, `the unmodified board must pass:\n${clean.stdout}${clean.stderr}`);

    const bad = structuredClone(live);
    const [a, b] = bad.players;
    bad.players.push({ ...a, team: "ZZZ" });                                           // former club / third team
    bad.players.push({ ...b, playerId: "nfl-athlete-999999991", participation: "INACTIVE" }); // OUT player still projected
    const team = bad.players[0].team;
    bad.players.push({ playerId: "nfl-athlete-999999992", name: "Second Passer", team, markets: { player_pass_yds: { median: 150 } } });
    if (!bad.players.some((p) => p.team === team && p !== bad.players.at(-1) && p.markets.player_pass_yds)) {
      bad.players.push({ playerId: "nfl-athlete-999999993", name: "First Passer", team, markets: { player_pass_yds: { median: 200 } } });
    }
    bad.integrity.qbStarter = (bad.integrity.qbStarter ?? []).map((q) => ({ ...q, state: q.team === team ? "APPLIED" : q.state }));
    fs.writeFileSync(path.join(tmp, `${live.providerEventId}.json`), JSON.stringify(bad));
    const out = run(tmp);
    assert.equal(out.status, 1, `injected defects must fail the audit:\n${out.stdout}`);
    for (const code of ["THIRD_TEAM", "UNAVAILABLE_PROJECTED", "PASS_POOL_MULTI"]) assert.match(out.stdout, new RegExp(code), `${code} not reported`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

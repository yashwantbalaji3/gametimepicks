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

/* Session 5 — the clean baseline is what the PRODUCER builds today, not a committed file: a board committed
   before a new rule landed is legitimately dirty under it, and this test is about the audit, not the file. */
function producerBoards(out) {
  const cur = path.join(APP, "..", "data/internal/nfl/current");
  const days = fs.existsSync(cur) ? fs.readdirSync(cur).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort() : [];
  if (!days.length) return [];
  let newest = null;
  for (const f of fs.readdirSync(path.join(cur, days.at(-1))).filter((x) => x.endsWith(".json"))) {
    const g = JSON.parse(fs.readFileSync(path.join(cur, days.at(-1), f), "utf8")).generatedAt;
    if (!newest || g > newest) newest = g;
  }
  spawnSync(process.execPath, ["scripts/nfl/build-nfl-player-board.mjs", "--now", newest, "--out-dir", out], { cwd: APP, encoding: "utf8" });
  return fs.readdirSync(out).filter((f) => /^\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(out, f), "utf8")));
}

test("§50 · the roster audit exits non-zero on injected defects and names them", () => {
  const built = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-audit-built-"));
  const live = producerBoards(built)
    .filter((b) => b.coverage && b.integrity && b.players?.length > 1)
    .sort((a, b) => b.kickoffUtc.localeCompare(a.kickoffUtc))[0];
  fs.rmSync(built, { recursive: true, force: true });
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

    /* Session 5 — publication despite a failing allocation gate: put back the rushing rows the producer
       withheld, and the audit (recomputing Σ from the forecast, not reading the producer's record) must fail. */
    const withheld = live.families?.player_rush_yds?.withheldTeams ?? [];
    if (withheld.length) {
      const back = structuredClone(live);
      const team = withheld[0].team;
      const holders = new Set((back.coverage?.[team]?.players ?? []).filter((r) => r.notModeled?.some((n) => n.state === "WITHHELD_POOL_OVER_ALLOCATED")).map((r) => r.playerId));
      for (const p of back.players) if (p.team === team && holders.has(p.playerId)) p.markets.player_rush_yds = { median: 40, p10: 10, p90: 90 };
      fs.writeFileSync(path.join(tmp, `${live.providerEventId}.json`), JSON.stringify(back));
      const rerun = run(tmp);
      assert.equal(rerun.status, 1, `a re-published over-allocated pool must fail the audit:\n${rerun.stdout}`);
      assert.match(rerun.stdout, new RegExp(`${team} .*POOL_OVER_ALLOCATED_PUBLISHED`));
    } else console.log("no withheld pool on the newest board — the re-publication probe is armed for the next one");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

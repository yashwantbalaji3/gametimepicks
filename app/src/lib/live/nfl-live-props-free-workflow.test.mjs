import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(new URL("../../../..", import.meta.url).pathname);
const WF = path.join(REPO, ".github/workflows/nfl-live-props-free.yml");
const yml = fs.readFileSync(WF, "utf8");
/* Comments carry the WHY and must never satisfy a guard about behaviour. */
const code = yml.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

test("🔴 it can never acquire a schedule — manual dispatch only", () => {
  /*
   * The whole reason this file exists is that a cadence spent credits nobody decided to spend.
   * A `schedule:` here would recreate that, so its ABSENCE is the contract, not a default.
   */
  assert.equal(/^on:/m.test(code), true);
  assert.equal(/^\s*schedule:/m.test(code), false, "a scheduled trigger would restore the cadence that was just stopped");
  assert.equal(/cron:/.test(code), false);
  assert.match(code, /^\s*workflow_dispatch:/m, "and it must still be dispatchable by a human");
});

test("🔴 the provider key is ABSENT from the process, not merely unused", () => {
  assert.equal(/ODDS_API_KEY/.test(yml), false, "the key must not be named anywhere, comments included");
  assert.equal(/^\s*env:/m.test(code), false, "no step may carry an environment block at all");
  assert.equal(/secrets\./.test(code), false, "no secret may be referenced");
});

test("🔴 no Phase H script can run here, because no step invokes one", () => {
  /*
   * Structural, not a flag: a flag can be passed wrongly, an absent step cannot run. Every paid
   * script in the repository is named and asserted missing.
   */
  for (const paid of ["probe-nfl-live-odds", "capture-nfl-live-odds", "capture-nfl-odds"]) {
    assert.equal(code.includes(paid), false, `${paid} is a paid script and must not appear`);
  }
  const invoked = [...code.matchAll(/node\s+(scripts\/[\w/.\-]+)/g)].map((m) => m[1]);
  assert.deepEqual(invoked, ["scripts/nfl/capture-live-props.mjs"],
    "exactly ONE script runs here, and it is the already-proven free capture");
  /* And it must be the same file the paid workflow uses — not a second implementation. */
  assert.ok(fs.existsSync(path.join(REPO, "app", invoked[0])), "the script it names must exist");
  const paidWf = fs.readFileSync(path.join(REPO, ".github/workflows/nfl-live-props.yml"), "utf8");
  assert.ok(paidWf.includes("capture-live-props.mjs"), "one producer, shared — never a fork of it");
});

test("🔴 the commit scope cannot reach a frozen board or a forecast", () => {
  const adds = [...code.matchAll(/git add\s+(\S+)/g)].map((m) => m[1]);
  const paths = [...code.matchAll(/((?:app\/public\/data|data\/internal)\/[\w/.\-]*\/)/g)].map((m) => m[1]);
  assert.ok(paths.length > 0, "the allowlist must be findable");
  for (const p of [...adds, ...paths]) {
    assert.equal(/player-board/.test(p), false, `${p} would stage a FROZEN board`);
    assert.equal(/forecast/.test(p), false, `${p} would stage a forecast artifact`);
    assert.equal(/game-simulations|index\.json/.test(p), false, `${p} is outside this job's output`);
  }
  assert.ok(paths.some((p) => p.endsWith("nfl/live-props/")), "its own output must be staged");
  assert.equal(/git add\s+(-A|--all|\.)(\s|$)/.test(code), false, "never a blanket add");
  /* The missing-directory guard that discarded a whole run's output on 2026-09-27. */
  assert.match(code, /if \[ ! -d "\$P" \]/, "a directory that does not exist yet must not abort the step");
});

test("the free capture itself cannot read a key or write outside live-props", () => {
  const cap = fs.readFileSync(path.join(REPO, "app/scripts/nfl/capture-live-props.mjs"), "utf8");
  assert.equal(/process\.env/.test(cap), false, "the capture must not read ANY environment variable");
  const outs = [...cap.matchAll(/(?:writeFileSync|mkdirSync)\(\s*path\.join\((\w+)/g)].map((m) => m[1]);
  assert.ok(outs.length > 0);
  for (const v of new Set(outs)) assert.match(v, /^(OUT_DIR|outDir)$/, `writes go through the one output dir, not ${v}`);
  assert.match(cap, /OUT_DIR = path\.join\(APP, "public\/data\/nfl\/live-props"\)/);
  /*
   * It DOES name player-board — it reads the frozen predictions to join a live stat against the one
   * that was published before kickoff. That is the whole point. What matters is that every mention
   * is a READ: the board appears only inside `read(...)` or as a directory it lists.
   */
  for (const m of [...cap.matchAll(/^.*player-board.*$/gm)]) {
    const line = m[0];
    assert.ok(/\bread\(|BOARD_DIR = path\.join/.test(line),
      `every player-board reference must be a read, got: ${line.trim()}`);
    assert.equal(/writeFileSync|mkdirSync|rmSync|unlink|appendFile/.test(line), false,
      `the capture must never WRITE the frozen board: ${line.trim()}`);
  }
  assert.equal(/writeFileSync|mkdirSync/.test(cap.split("\n").filter((l) => /player-board|forecast/.test(l)).join("\n")), false,
    "no write call may sit on a line naming a frozen artifact");
});

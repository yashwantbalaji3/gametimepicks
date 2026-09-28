import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";

const REPO = path.resolve(new URL("../../../..", import.meta.url).pathname);
const WF = path.join(REPO, ".github/workflows/nfl-live-props.yml");
const yml = fs.readFileSync(WF, "utf8");

/*
 * A tiny evaluator for the ONE expression shape these gates use:
 *   ${{ github.event.inputs.a != 'x' && github.event.inputs.b != 'y' }}
 * Written rather than string-matched because the claim under test is BEHAVIOURAL — "this step does
 * not run when skip_phase_h is true" — and a substring check cannot tell a gate from its negation.
 */
function evalIf(expr, inputs) {
  if (expr === undefined) return true; // no `if:` means the step always runs
  const body = expr.replace(/^\$\{\{/, "").replace(/\}\}$/, "").trim();
  return body.split("&&").every((clause) => {
    const m = /github\.event\.inputs\.(\w+)\s*(!=|==)\s*'([^']*)'/.exec(clause.trim());
    if (!m) throw new Error(`unsupported clause: ${clause}`);
    const [, name, op, lit] = m;
    /* GitHub supplies NO inputs for a `schedule` event — an absent input is the empty string. */
    const actual = inputs[name] ?? "";
    return op === "!=" ? actual !== lit : actual === lit;
  });
}

/** The steps, as {name, if, run}, without a YAML dependency. */
function steps() {
  const out = [];
  const re = /^      - name: (.+)$/gm;
  let m;
  const idx = [];
  while ((m = re.exec(yml)) !== null) idx.push({ name: m[1].trim(), at: m.index });
  for (let i = 0; i < idx.length; i++) {
    const block = yml.slice(idx[i].at, i + 1 < idx.length ? idx[i + 1].at : yml.length);
    const ifm = /^\s+if: (.+)$/m.exec(block);
    out.push({ name: idx[i].name, if: ifm ? ifm[1].trim() : undefined, block });
  }
  return out;
}

const byName = (frag) => {
  const s = steps().filter((x) => x.name.includes(frag));
  assert.equal(s.length, 1, `expected exactly one step matching ${frag}, got ${s.length}`);
  return s[0];
};

const CAPTURE = "Capture live player-prop state";
const PROBE = "Phase H · live-odds probe";
const PILOT = "Phase H · bounded live-odds pilot";
const COMMIT = "Commit the live state";

test("skip_phase_h=true runs the FREE capture and publishes it, and runs NO paid step", () => {
  const inputs = { dry_run: "false", skip_phase_h: "true" };
  assert.equal(evalIf(byName(CAPTURE).if, inputs), true, "the free factual capture must run");
  assert.equal(evalIf(byName(PROBE).if, inputs), false, "the paid probe must NOT run");
  assert.equal(evalIf(byName(PILOT).if, inputs), false, "the paid pilot must NOT run");
  assert.equal(evalIf(byName(COMMIT).if, inputs), true, "and the result must still be published");
});

test("dry_run and skip_phase_h stay DIFFERENT concepts", () => {
  /*
   * dry_run       = do not execute the real capture/write path
   * skip_phase_h  = DO execute the real free capture and publish, but spend nothing
   * Overloading one onto the other would make "refresh the free player stats" unaskable.
   */
  const dry = { dry_run: "true", skip_phase_h: "false" };
  assert.equal(evalIf(byName(COMMIT).if, dry), false, "dry_run must not publish");
  const free = { dry_run: "false", skip_phase_h: "true" };
  assert.equal(evalIf(byName(COMMIT).if, free), true, "skip_phase_h must publish");
  assert.notEqual(evalIf(byName(COMMIT).if, dry), evalIf(byName(COMMIT).if, free),
    "if these two agreed on publishing, one of them would be redundant");
});

test("the SCHEDULED Phase H policy is unchanged by this patch", () => {
  /*
   * A `schedule` event supplies no inputs at all, so both gates see the empty string. This is the
   * property that keeps an emergency manual mode from silently redefining the paid cadence.
   */
  const scheduled = {};
  assert.equal(evalIf(byName(PROBE).if, scheduled), true, "the scheduled probe must still run");
  assert.equal(evalIf(byName(PILOT).if, scheduled), true, "the scheduled pilot must still run");
  assert.equal(evalIf(byName(CAPTURE).if, scheduled), true);
  const crons = yml.match(/- cron: /g) ?? [];
  assert.equal(crons.length, 5, "no schedule slot may be added or removed by this patch");
});

test("the paid key is reachable ONLY from the two steps this flag disables", () => {
  for (const s of steps()) {
    if (!/ODDS_API_KEY/.test(s.block)) continue;
    assert.ok(s.name.includes("Phase H"), `${s.name} must not see the provider key`);
    assert.equal(evalIf(s.if, { dry_run: "false", skip_phase_h: "true" }), false,
      `${s.name} holds the key and therefore must be skipped by skip_phase_h`);
  }
  /* And the free capture script itself cannot read it under any flag. */
  const cap = fs.readFileSync(path.join(REPO, "app/scripts/nfl/capture-live-props.mjs"), "utf8");
  assert.equal(/process\.env/.test(cap), false, "the free capture must not read ANY environment variable");
  assert.equal(/ODDS_API_KEY|apiKey/i.test(cap), false);
});

test("the commit scope cannot stage a frozen board or a forecast", () => {
  const run = byName(COMMIT).block;
  const paths = [...run.matchAll(/^\s*(?:for P in |\s{9,})([a-z][\w/.\-]*\/)/gm)].map((m) => m[1]);
  const listed = [...run.matchAll(/((?:app\/public\/data|data\/internal)\/[\w/.\-]*\/)/g)].map((m) => m[1]);
  const all = [...new Set([...paths, ...listed])];
  assert.ok(all.length >= 4, `expected the allowlist, found ${JSON.stringify(all)}`);
  for (const p of all) {
    assert.equal(/player-board/.test(p), false, `${p} would stage a FROZEN board`);
    assert.equal(/forecast/.test(p), false, `${p} would stage a forecast artifact`);
  }
  assert.ok(all.some((p) => p.includes("live-props")), "the free capture's own output must be staged");
  /* A bare `git add .` or `-A` would defeat every line above. */
  assert.equal(/git add\s+(-A|--all|\.\s*$)/m.test(run), false, "the commit must stay path-scoped");
});

test("🔴 the commit step survives its own first live run (the #733 regression)", () => {
  /*
   * The exact state that broke run 36333844396, with the one directory a first live capture creates:
   *   live-props/       EXISTS      (the capture just wrote it)
   *   prop-settlement/  MISSING     (nothing settles until a game finishes)
   *   live-markets/     MISSING     (Phase H has never fired)
   * The real loop is extracted from the workflow and run against that tree, so this tests the
   * shipped shell rather than a paraphrase of it.
   */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-commit-"));
  const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
  git("init", "-q", ".");
  git("config", "user.email", "t@t"); git("config", "user.name", "t");
  fs.mkdirSync(path.join(dir, "app/public/data/nfl/live-props"), { recursive: true });
  fs.writeFileSync(path.join(dir, "app/public/data/nfl/live-props/401872955.json"), "{}\n");
  fs.mkdirSync(path.join(dir, "data/internal/research/odds/nfl"), { recursive: true });
  fs.writeFileSync(path.join(dir, "data/internal/research/odds/nfl/x.json"), "{}\n");

  const loop = /(for P in [\s\S]*?done)/.exec(byName(COMMIT).block);
  assert.ok(loop, "the guarded loop must exist in the workflow");
  const script = `set -euo pipefail\n${loop[1].replace(/^\s+/gm, "")}\ngit diff --cached --name-only\n`;
  const staged = execFileSync("bash", ["-c", script], { cwd: dir, encoding: "utf8" }).trim().split("\n").filter(Boolean);

  assert.deepEqual(staged.sort(), [
    "app/public/data/nfl/live-props/401872955.json",
    "data/internal/research/odds/nfl/x.json",
  ], "the live artifact must be staged despite two missing optional directories");

  /* And the pre-fix form must still die on the same tree, or this proves nothing. */
  assert.throws(
    () => execFileSync("bash", ["-c",
      "set -euo pipefail\ngit add app/public/data/nfl/live-props/ data/internal/nfl/prop-settlement/ data/internal/research/odds/nfl/ app/public/data/nfl/live-markets/"],
      { cwd: dir, encoding: "utf8", stdio: "pipe" }),
    /pathspec|Command failed/,
    "the unguarded form must still fail — otherwise the fix is not what made the difference",
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

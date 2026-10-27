/**
 * The Vercel ignore step's DEPLOYED BASELINE (gate leaks measured 2026-10-27).
 *
 * In the first 20 Production builds after the coalescing gate shipped, 2 built non-critical data the gate should have
 * batched, because the script compared against the wrong base:
 *   SHALLOW  3b527d35: a burst of automation pushes left the deployed SHA 11 commits behind HEAD. Vercel clones 10
 *            deep, so the base was not in the clone and the script failed open.
 *   IN-FLIGHT 1a9b26d7: pushed while a critical build was running. Vercel fixes VERCEL_GIT_PREVIOUS_SHA at creation,
 *            so once that build went live this one still compared from the base before it, saw the critical change
 *            and rebuilt it.
 * These tests run the real script on throwaway repos, including a real depth-10 clone over file://, and a fake live
 * build-info.json served through GTP_GATE_LIVE_URL. They pin both fixes and, above all, the safety direction: a critical
 * change NOT yet live always builds at once, and anything the script cannot establish keeps Vercel's base (builds).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(APP, "scripts", "vercel-ignore-build.sh");
const SCRIPT_TEXT = fs.readFileSync(SCRIPT, "utf8");
const CRITICAL = (() => {
  const block = /# GTP-CRITICAL-DATA-BEGIN\s*\nCRITICAL_DATA_INPUTS=\(([\s\S]*?)\n\)\s*\n# GTP-CRITICAL-DATA-END/.exec(SCRIPT_TEXT)?.[1] ?? "";
  return [...block.matchAll(/'\:\(top\)([^']+)'/g)].map((m) => m[1]);
})();
const representative = (entry) => (entry.endsWith("/") ? `${entry}2026-10-27/fixture.json` : entry);

const T = 1793100000; // fixed commit times; every "now" is T + offset
const WINDOW = 5400;
const NONCRITICAL = "app/public/data/mlb/results/x.json";
const NBA_LANE = "app/public/data/nba/experimental-public/2026-10-27.json";
const gateLine = (out) => /GTP_GATE verdict=(\w+) tier=([a-z-]+)/.exec(out)?.slice(1) ?? [];

function sh(cwd, args, env = {}) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

/** A repo whose first commit is the one Production was last built from (Vercel's base). */
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-gate-base-"));
  const src = path.join(root, "src");
  fs.mkdirSync(src);
  sh(src, ["init", "-q"]);
  sh(src, ["config", "user.email", "test@test.invalid"]);
  sh(src, ["config", "user.name", "fixture"]);
  sh(src, ["config", "commit.gpgsign", "false"]);
  let clock = T - 86400;
  const commit = (message, files = {}, epoch) => {
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(src, rel)), { recursive: true });
      fs.writeFileSync(path.join(src, rel), content);
    }
    sh(src, ["add", "-A"]);
    clock = epoch ?? clock + 5; // a burst: pushes seconds apart unless a time is given
    const date = `@${clock} +0000`;
    sh(src, ["commit", "-q", "--allow-empty", "-m", message], { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date });
    return sh(src, ["rev-parse", "HEAD"]);
  };
  const genesis = commit("an older deploy", { "app/src/page.tsx": "v0", [NONCRITICAL]: "{}", "docs/NOTES.md": "v0" }, T - 90000);
  const deployed = commit("deployed", { "app/src/page.tsx": "v1", "docs/NOTES.md": "v1" }, T - 86400);
  let liveBody = null;
  const livePath = path.join(root, "build-info.json");
  /** Serve this body as the live /data/build-info.json (null = unreachable). */
  const serve = (body) => {
    liveBody = body;
    if (body === null) fs.rmSync(livePath, { force: true });
    else fs.writeFileSync(livePath, body);
  };
  const buildInfo = (sha, pretty = false) =>
    JSON.stringify({ _note: "Build marker", schema: 1, builtAt: "2026-10-27T15:21:09.507Z", commit: { sha, shortSha: sha.slice(0, 8) }, environment: "vercel" }, null, pretty ? 2 : 0);
  /** Clone the way Vercel does: depth 10, over a real transport, then check out HEAD. */
  const shallowClone = (depth = 10) => {
    const dir = path.join(root, `clone-${depth}-${Math.random().toString(36).slice(2, 8)}`);
    sh(root, ["clone", "-q", "--depth", String(depth), `file://${src}`, dir]);
    return dir;
  };
  const run = (cwd, base, env = {}) => {
    const r = spawnSync("bash", [SCRIPT], {
      cwd: path.join(cwd, "app"),
      encoding: "utf8",
      env: {
        ...process.env,
        VERCEL_GIT_PREVIOUS_SHA: base,
        VERCEL_PROJECT_PRODUCTION_URL: "",
        VERCEL_FORCE_BUILD: "",
        GTP_COALESCE_SECONDS: "",
        // never the network from a test: no GitHub repo to deepen from, and the live read goes to the fixture file
        VERCEL_GIT_REPO_OWNER: "",
        VERCEL_GIT_REPO_SLUG: "",
        GTP_GATE_REPO_URL: "",
        GTP_GATE_FETCH_DEPTH: "",
        VERCEL_ENV: "production",
        GTP_GATE_LIVE_URL: `file://${livePath}`,
        GTP_NOW_EPOCH: String(T + 60),
        ...env,
      },
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  return { root, src, genesis, deployed, commit, serve, buildInfo, shallowClone, run, livePath, get liveBody() { return liveBody; }, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

const isShallow = (dir) => sh(dir, ["rev-parse", "--is-shallow-repository"]) === "true";
const has = (dir, sha) => spawnSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: dir }).status === 0;

// ── SHALLOW CLONE ─────────────────────────────────────────────────────────────────────────────────────────────────────

test("SHALLOW: a burst of 12 non-critical pushes leaves the base outside a depth-10 clone → fetched, coalesced, NOT built", () => {
  const f = fixture();
  try {
    for (let i = 1; i <= 12; i += 1) f.commit(`data ${i}`, { [NONCRITICAL]: `{"v":${i}}` }, T + i * 5);
    f.serve(f.buildInfo(f.deployed)); // Production still serves the base: nothing went live meanwhile
    const clone = f.shallowClone();
    assert.ok(isShallow(clone) && !has(clone, f.deployed), "control: the base really is outside the depth-10 clone");

    const r = f.run(clone, f.deployed);
    assert.equal(r.status, 0, `the burst must coalesce, not fail open: ${r.out}`);
    assert.deepEqual(gateLine(r.out), ["skip", "coalesce-wait"]);
    assert.match(r.out, /outside the shallow clone — fetched 50 commits/);

    // Before the fix this exact clone failed open. Without a remote to deepen from it still must (fail open preserved).
    const bare = f.shallowClone();
    sh(bare, ["remote", "remove", "origin"]);
    const noRemote = f.run(bare, f.deployed);
    assert.equal(noRemote.status, 1, `no way to fetch → BUILD: ${noRemote.out}`);
    assert.match(noRemote.out, /not in clone/);
  } finally { f.cleanup(); }
});

test("SHALLOW: after the fetch the full tier logic runs — a critical change inside the burst still BUILDS now", () => {
  const f = fixture();
  try {
    for (let i = 1; i <= 5; i += 1) f.commit(`data ${i}`, { [NONCRITICAL]: `{"v":${i}}` }, T + i * 5);
    f.commit("nba lane", { [NBA_LANE]: '{"games":[]}' }, T + 30); // buried 7 commits down the burst
    for (let i = 6; i <= 12; i += 1) f.commit(`data ${i}`, { [NONCRITICAL]: `{"v":${i}}` }, T + 30 + i * 5);
    f.serve(f.buildInfo(f.deployed));
    const r = f.run(f.shallowClone(), f.deployed);
    assert.equal(r.status, 1, r.out);
    assert.deepEqual(gateLine(r.out), ["build", "critical"]);

    // and the window still expires on the OLDEST undeployed change, read from the fetched history
    const g = fixture();
    try {
      for (let i = 1; i <= 12; i += 1) g.commit(`data ${i}`, { [NONCRITICAL]: `{"v":${i}}` }, T + i * 5);
      g.serve(null);
      const late = g.run(g.shallowClone(), g.deployed, { GTP_NOW_EPOCH: String(T + 5 + WINDOW) });
      assert.equal(late.status, 1, late.out);
      assert.deepEqual(gateLine(late.out), ["build", "coalesce-expired"]);
    } finally { g.cleanup(); }
  } finally { f.cleanup(); }
});

test("SHALLOW: every way the fetch cannot close the gap BUILDS (fail open), and a full clone is never made shallow", () => {
  const f = fixture();
  try {
    for (let i = 1; i <= 14; i += 1) f.commit(`data ${i}`, { [NONCRITICAL]: `{"v":${i}}` }, T + i * 5);
    f.serve(null);
    const cases = {
      "the remote is unreachable": (c) => { sh(c, ["remote", "set-url", "origin", `file://${f.root}/no-such-repo`]); return {}; },
      "the fetch is too shallow to reach the base": () => ({ GTP_GATE_FETCH_DEPTH: "11" }),
      "a malformed fetch depth": () => ({ GTP_GATE_FETCH_DEPTH: "deep" }),
      "no remote, and a fallback URL that does not exist": (c) => { sh(c, ["remote", "remove", "origin"]); return { GTP_GATE_REPO_URL: `file://${f.root}/missing.git` }; },
    };
    for (const [label, setup] of Object.entries(cases)) {
      const clone = f.shallowClone();
      const r = f.run(clone, f.deployed, setup(clone));
      assert.equal(r.status, 1, `${label} must BUILD: ${r.out}`);
      assert.match(r.out, /not in clone/, `${label} must build for the reason under test: ${r.out}`);
    }
    // the fallback URL (Vercel's own repo, here a file URL) closes the gap when the clone has no remote
    const viaUrl = f.shallowClone();
    sh(viaUrl, ["remote", "remove", "origin"]);
    assert.equal(f.run(viaUrl, f.deployed, { GTP_GATE_REPO_URL: `file://${f.src}` }).status, 0);

    // A full clone with an unknown base (force push) builds, and keeps its history: the fetch is for shallow clones only.
    const r = f.run(f.src, "0".repeat(40));
    assert.equal(r.status, 1, r.out);
    assert.equal(isShallow(f.src), false, "a full repository must never be converted to a shallow one");
  } finally { f.cleanup(); }
});

// ── IN-FLIGHT BUILD ───────────────────────────────────────────────────────────────────────────────────────────────────

/** D (Vercel's base) → B (critical NBA lane, its build went live while C waited) → C (one non-critical file). */
function inflight() {
  const f = fixture();
  const B = f.commit("nba lane", { [NBA_LANE]: '{"games":[1]}' }, T);
  const C = f.commit("mlb results", { [NONCRITICAL]: '{"v":1}' }, T + 30);
  return { ...f, B, C };
}

test("IN-FLIGHT: a push queued behind a critical build compares from what is LIVE → coalesced, NOT a second build", () => {
  const f = inflight();
  try {
    for (const pretty of [false, true]) {
      f.serve(f.buildInfo(f.B, pretty));
      const r = f.run(f.src, f.deployed);
      assert.equal(r.status, 0, `B is live; C alone is non-critical (pretty=${pretty}): ${r.out}`);
      assert.deepEqual(gateLine(r.out), ["skip", "coalesce-wait"]);
      assert.match(r.out, new RegExp(`already serves the newer ${f.B}`));
    }
  } finally { f.cleanup(); }
});

test("IN-FLIGHT: a critical change that is NOT yet live always BUILDS at once (never skipped by the live read)", () => {
  const f = inflight();
  try {
    // The critical build has not gone live yet (still building, failed, or the alias lags): Production serves D.
    f.serve(f.buildInfo(f.deployed));
    let r = f.run(f.src, f.deployed);
    assert.equal(r.status, 1, r.out);
    assert.deepEqual(gateLine(r.out), ["build", "critical"]);

    // B is live, and a NEW critical change for every critical path lands after it: each builds immediately.
    f.serve(f.buildInfo(f.B));
    assert.ok(CRITICAL.length >= 8, "the critical list was parsed");
    for (const entry of CRITICAL) {
      const g = inflight();
      try {
        g.serve(g.buildInfo(g.B));
        g.commit(`critical ${entry}`, { [representative(entry)]: '{"v":2}' }, T + 60);
        r = g.run(g.src, g.deployed, { GTP_NOW_EPOCH: String(T + 90) });
        assert.equal(r.status, 1, `${entry} after the live commit must BUILD: ${r.out}`);
        assert.deepEqual(gateLine(r.out), ["build", "critical"], entry);
      } finally { g.cleanup(); }
    }

    // ...and so does code after the live commit.
    f.commit("code", { "app/src/page.tsx": "v2" }, T + 60);
    r = f.run(f.src, f.deployed, { GTP_NOW_EPOCH: String(T + 90) });
    assert.equal(r.status, 1, r.out);
    assert.deepEqual(gateLine(r.out), ["build", "code"]);
  } finally { f.cleanup(); }
});

test("IN-FLIGHT: whenever the live commit cannot be trusted, Vercel's base is kept (the critical change in it BUILDS)", () => {
  const f = inflight();
  try {
    const side = (() => {
      sh(f.src, ["checkout", "-q", "-b", "side", f.deployed]);
      const s = f.commit("preview branch work", { [NONCRITICAL]: '{"side":1}' }, T + 10);
      sh(f.src, ["checkout", "-q", "-"]);
      return s;
    })();
    const cases = {
      "the live site is unreachable": [null, {}],
      "a bot challenge page instead of JSON": ["<html><body>Vercel Security Checkpoint</body></html>", {}],
      "JSON without a commit SHA": [JSON.stringify({ builtAt: "2026-10-27T15:00:00Z" }), {}],
      "a SHA that is in no history": [f.buildInfo("f".repeat(40)), {}],
      "a commit that is not an ancestor of HEAD": [f.buildInfo(side), {}],
      "a Preview build (no live alias to read)": [f.buildInfo(f.B), { VERCEL_ENV: "preview" }],
      "VERCEL_ENV unset (deploy-flush runs the gate this way)": [f.buildInfo(f.B), { VERCEL_ENV: "" }],
    };
    for (const [label, [body, env]] of Object.entries(cases)) {
      f.serve(body);
      const r = f.run(f.src, f.deployed, env);
      assert.equal(r.status, 1, `${label} → keep Vercel's base → the critical B builds: ${r.out}`);
      assert.deepEqual(gateLine(r.out), ["build", "critical"], label);
    }
    // Production rolled back to a deploy OLDER than Vercel's base: the live read only ever advances the base, so it is kept.
    f.serve(f.buildInfo(f.genesis));
    let r = f.run(f.src, f.deployed);
    assert.equal(r.status, 1, r.out);
    assert.deepEqual(gateLine(r.out), ["build", "critical"]);
    assert.match(r.out, /not a newer ancestor of HEAD/);
    // Production serving HEAD itself (a dashboard redeploy) keeps the base too.
    f.serve(f.buildInfo(f.C));
    r = f.run(f.src, f.deployed);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /already serves HEAD/);
  } finally { f.cleanup(); }
});

test("IN-FLIGHT + SHALLOW: the live commit and the base both outside the clone → fetched, compared from live, coalesced", () => {
  const f = fixture();
  try {
    const B = f.commit("nba lane", { [NBA_LANE]: '{"games":[1]}' }, T);
    for (let i = 1; i <= 11; i += 1) f.commit(`data ${i}`, { [NONCRITICAL]: `{"v":${i}}` }, T + 30 + i * 5);
    const clone = f.shallowClone();
    assert.ok(!has(clone, f.deployed) && !has(clone, B), "control: neither the base nor the live commit is in the clone");
    f.serve(f.buildInfo(B));
    const r = f.run(clone, f.deployed);
    assert.equal(r.status, 0, r.out);
    assert.deepEqual(gateLine(r.out), ["skip", "coalesce-wait"]);
    // the same clone with the critical build NOT yet live builds it
    f.serve(f.buildInfo(f.deployed));
    const r2 = f.run(f.shallowClone(), f.deployed);
    assert.equal(r2.status, 1, r2.out);
    assert.deepEqual(gateLine(r2.out), ["build", "critical"]);
  } finally { f.cleanup(); }
});

test("the baseline block keeps the gate's invariants: no HEAD^ base, live read only on Production, only advances the base", () => {
  const block = SCRIPT_TEXT.slice(SCRIPT_TEXT.indexOf("The TRUE deployed baseline"), SCRIPT_TEXT.indexOf("What is deploy-worthy"));
  assert.ok(block.length > 500, "baseline block found");
  assert.match(block, /\[ "\$\{VERCEL_ENV:-\}" = "production" \] \|\| return 0/);
  assert.match(block, /merge-base --is-ancestor "\$BASE" "\$_live"/, "the live commit must descend from Vercel's base");
  assert.match(block, /merge-base --is-ancestor "\$_live" HEAD/, "and be an ancestor of HEAD");
  assert.match(block, /is-shallow-repository/, "only a shallow clone is deepened");
  assert.doesNotMatch(block, /HEAD[\^~]/);
  assert.doesNotMatch(block, /exit 0/, "nothing in the baseline block can skip a build by itself");
});

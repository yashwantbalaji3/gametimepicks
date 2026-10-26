/**
 * Behavioral mutation tests for the Vercel Ignored Build Step (Program 088-091 §12).
 *
 * The static guard (vercel-canonical-project.test.mjs) pins what the script SAYS; these pin what
 * it DOES, against a real throwaway git repo: exit 0 = Vercel skips the build, exit 1 = builds.
 * The five behaviors are load-bearing — a false skip freezes production silently, a false build
 * just wastes minutes — so every failure mode here must fail toward BUILDING.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(APP, "scripts", "vercel-ignore-build.sh");

let repo;
const shas = {};

/**
 * Files OUTSIDE app/ that `npm run build` reads (emit steps, research/compare/lab/ask pages, the
 * search index, and the data/internal paths a PUBLIC route reads). Any change here must build;
 * the sibling data/internal churn (pregame archive etc.) must not — it feeds pipeline scripts only.
 * Audit: docs/V17_DEPLOY_TRIGGER_AUDIT.md (2026-09-22).
 */
const REPO_ROOT_BUILD_INPUTS = [
  "data/research-projection/v1/index.json",
  "data/compare-projection/v1/readiness.json",
  "data/lab-projection/v1/index.json",
  "data/ask-projection/v1/manifest.json",
  "data/internal/mlb/model-learning/calibrator-manifest.json",
  "data/internal/nfl/forecast-receipts/2026-w03.json",
  "data/internal/mlb/prediction-snapshots/2026-09-22/1.json",
  /* Session 13: the Forecast Ledger is read at build by /results/forecasts/**, /models, player Research pages, search
     and the Ask projection — its nightly commit touches only this path, so it must build. */
  "data/internal/forecast-ledger/v1/nfl.jsonl",
];
/* 2026-10-17 build-input coverage audit: one representative file for EVERY data/internal entry the script lists, read
   from the script itself, so a newly added path is behaviour-tested the day it lands (build-input-coverage.test.mjs
   proves the list is complete; this proves each entry actually makes the ignore step BUILD). */
{
  const blockText = /# GTP-BUILD-INPUTS-BEGIN\s*\nBUILD_INPUTS=\(([\s\S]*?)\n\)\s*\n# GTP-BUILD-INPUTS-END/.exec(fs.readFileSync(SCRIPT, "utf8"))?.[1] ?? "";
  for (const [, entry] of blockText.matchAll(/'\:\(top\)(data\/internal\/[^']+)'/g)) {
    const rep = entry.endsWith("/") ? `${entry}2026-10-17/fixture.json` : entry;
    if (!REPO_ROOT_BUILD_INPUTS.some((r) => (entry.endsWith("/") ? r.startsWith(entry) : r === entry))) REPO_ROOT_BUILD_INPUTS.push(rep);
  }
}

function git(args, opts = {}) {
  const r = spawnSync("git", args, { cwd: repo, encoding: "utf8", ...opts });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function commit(label, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(repo, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  git(["add", "-A"]);
  git(["commit", "-q", "-m", label, "--no-gpg-sign"]);
  shas[label] = git(["rev-parse", "HEAD"]);
}

function runIgnore(env) {
  // cwd = <repo>/app, mirroring Vercel's root-directory execution. GTP_* cleared so a developer's shell cannot leak in.
  return spawnSync("bash", [SCRIPT], {
    cwd: path.join(repo, "app"),
    encoding: "utf8",
    env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: "", VERCEL_PROJECT_PRODUCTION_URL: "", VERCEL_FORCE_BUILD: "", GTP_COALESCE_SECONDS: "", GTP_NOW_EPOCH: "", ...env },
  });
}

/*
 * Coalescing gate (2026-10-26). The tests above the coalescing section pin the PATH RULE: which spans are build
 * inputs at all. Since non-critical data is now batched for GTP_COALESCE_SECONDS, each of them runs the verdict twice:
 * PATH_RULE (GTP_COALESCE_SECONDS=0, the documented rollback: never coalesce, exactly the pre-gate behaviour) and
 * PAST_WINDOW (the production default window, with "now" a day after every fixture commit), and both must BUILD.
 * Fixture commits are made seconds before the run, so without GTP_NOW_EPOCH a data-only span sits inside the window.
 */
const PATH_RULE = { GTP_COALESCE_SECONDS: "0" };
const PAST_WINDOW = () => ({ GTP_NOW_EPOCH: String(Math.floor(Date.now() / 1000) + 86400) });

before(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-ignore-build-"));
  git(["init", "-q"]);
  git(["config", "user.email", "test@test.invalid"]);
  git(["config", "user.name", "fixture"]);
  commit("base", { "app/src/page.tsx": "v1", "docs/NOTES.md": "v1" });
  commit("docs-only", { "docs/NOTES.md": "v2" });
  commit("data-change", { "app/public/data/board.json": "{}" });
  commit("docs-tail", { "docs/NOTES.md": "v3" });
  commit("app-change", { "app/src/page.tsx": "v2" });
  // 2026-09-22 audit (docs/V17_DEPLOY_TRIGGER_AUDIT.md): repo-root build inputs outside app/.
  commit("internal-churn", { "data/internal/mlb/pregame-archive/freezes/2026-09-22/1.json": "{}" });
  for (const [i, rel] of REPO_ROOT_BUILD_INPUTS.entries()) commit(`input-${i}`, { [rel]: `{"v":${i}}` });
  // Leave HEAD where the older tests expect it; the new tests check out their own shas.
  git(["checkout", "-q", shas["app-change"]]);
});

after(() => fs.rmSync(repo, { recursive: true, force: true }));

test("docs-only span since deployed SHA → SKIP (exit 0)", () => {
  const r = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["base"] });
  // Roll HEAD back so the span base→HEAD is docs-only.
  git(["checkout", "-q", shas["docs-only"]]);
  const r2 = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["base"] });
  git(["checkout", "-q", shas["app-change"]]);
  assert.equal(r2.status, 0, `expected skip, got: ${r2.stdout}${r2.stderr}`);
  // And from the full history tip (which includes app changes) the same base must BUILD:
  assert.equal(r.status, 1, `expected build from tip, got: ${r.stdout}`);
});

test("public-data change → BUILD (exit 1)", () => {
  git(["checkout", "-q", shas["data-change"]]);
  const r = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["docs-only"], ...PATH_RULE });
  const late = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["docs-only"], ...PAST_WINDOW() });
  const fresh = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["docs-only"] });
  git(["checkout", "-q", shas["app-change"]]);
  assert.equal(r.status, 1, `a generated-data commit must deploy: ${r.stdout}`);
  assert.equal(late.status, 1, `past the coalescing window it must deploy: ${late.stdout}`);
  // ...and seconds after it landed it is batched, not dropped: the skip names the window.
  assert.equal(fresh.status, 0, `a fresh non-critical data commit is coalesced: ${fresh.stdout}`);
  assert.match(fresh.stdout, /coalescing/);
});

test("app change → BUILD, and a docs-tail between them cannot strand it", () => {
  // Span docs-only → docs-tail contains data-change: even though HEAD-1..HEAD is docs-only,
  // the diff runs from the last DEPLOYED sha, so the data change still builds.
  git(["checkout", "-q", shas["docs-tail"]]);
  const r = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["docs-only"], ...PATH_RULE });
  const late = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["docs-only"], ...PAST_WINDOW() });
  git(["checkout", "-q", shas["app-change"]]);
  assert.equal(r.status, 1, "a push batch ending in docs must not strand the app change");
  assert.equal(late.status, 1, "nor, once the window has passed, the coalesced data change");
});

test("unknown previous SHA / missing SHA → BUILD (fail open)", () => {
  assert.equal(runIgnore({ VERCEL_GIT_PREVIOUS_SHA: "0000000000000000000000000000000000000000" }).status, 1);
  assert.equal(runIgnore({}).status, 1);
});

test("duplicate project slug → SKIP regardless of span", () => {
  for (const host of ["gametimepicks.vercel.app", "gametimepicks-abc123.vercel.app"]) {
    const r = runIgnore({ VERCEL_PROJECT_PRODUCTION_URL: host, VERCEL_GIT_PREVIOUS_SHA: shas["base"] });
    assert.equal(r.status, 0, `${host}: the duplicate must never build`);
    assert.match(r.stdout, /duplicate/);
  }
});

test("unknown project slug → falls through to diff logic (fail open)", () => {
  const r = runIgnore({
    VERCEL_PROJECT_PRODUCTION_URL: "some-future-rename.vercel.app",
    VERCEL_GIT_PREVIOUS_SHA: shas["base"],
  });
  assert.equal(r.status, 1, "an unrecognized project identity must BUILD, never skip");
});

test("⚠ VERCEL_FORCE_BUILD=1 → BUILD even with no app/ diff (env-var activation hatch)", () => {
  /*
   * The case this exists for: Vercel binds env vars at BUILD time, so a variable set in the
   * dashboard only takes effect on a new build. A same-commit redeploy reaches this script, finds no
   * app/ diff, and SKIPS — the redeploy succeeds and delivers nothing. Observed 2026-09-16 during the
   * Live activation: both flags were set, production was redeployed, and build-info.json came back
   * byte-identical because no build ran.
   */
  const noDiff = { VERCEL_GIT_PREVIOUS_SHA: shas["app-change"] ?? shas["base"] };
  // Same inputs, hatch off: the normal skip still happens (so the hatch is what changes the answer).
  const skipped = runIgnore(noDiff);
  const forced = runIgnore({ ...noDiff, VERCEL_FORCE_BUILD: "1" });
  assert.equal(forced.status, 1, "the hatch must build");
  assert.match(forced.stdout, /VERCEL_FORCE_BUILD/);
  assert.notEqual(forced.status, skipped.status, "the hatch must actually change the outcome");
});

test("the hatch is opt-in — any other value leaves the diff logic untouched", () => {
  const base = { VERCEL_GIT_PREVIOUS_SHA: shas["app-change"] ?? shas["base"] };
  const off = runIgnore(base);
  for (const v of ["", "0", "false", "true", "yes"]) {
    assert.equal(runIgnore({ ...base, VERCEL_FORCE_BUILD: v }).status, off.status,
      `VERCEL_FORCE_BUILD=${JSON.stringify(v)} must not change the decision — only "1" opts in`);
  }
});

// ── 2026-09-22 deploy-trigger audit (docs/V17_DEPLOY_TRIGGER_AUDIT.md) ─────────────────────────

test("`[skip ci]` in the commit message never skips a Vercel build — only the diff decides", () => {
  /*
   * Q1 of the audit: 503 pushes/7d, every one whose span touched app/ was built regardless of the
   * `[skip ci]` marker (361 DATA + 84 CODE), and every span without app/ changes was skipped (55).
   * The marker is a GitHub Actions convention; this script must not grow a message-based skip.
   * Since 2026-10-26 the script reads the message for ONE token, [deploy], which can only force a build. The pin is
   * now: (1) the same data change with and without `[skip ci]` gets the same verdict in every mode, and (2) the
   * message is read in exactly one place whose only outcome is BUILD.
   */
  commit("data-skip-ci [skip ci]", { "app/public/data/board.json": '{"v":2}' });
  git(["checkout", "-q", shas["app-change"]]);
  commit("data-no-marker", { "app/public/data/board.json": '{"v":2}' });
  const modes = [PATH_RULE, PAST_WINDOW(), {}];
  const verdicts = (label) => {
    git(["checkout", "-q", shas[label]]);
    return modes.map((m) => runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["app-change"], ...m }).status);
  };
  const withMarker = verdicts("data-skip-ci [skip ci]");
  const without = verdicts("data-no-marker");
  git(["checkout", "-q", shas["app-change"]]);
  assert.equal(withMarker[0], 1, "a [skip ci] data commit must still deploy");
  assert.equal(withMarker[1], 1, "a [skip ci] data commit must still deploy once the window has passed");
  assert.deepEqual(withMarker, without, "[skip ci] must not change the verdict in any mode");
  const src = fs.readFileSync(SCRIPT, "utf8");
  assert.doesNotMatch(src, /VERCEL_GIT_COMMIT_MESSAGE|--format=[^\s"]*%[sb]\b|--pretty|--oneline/, "no other message source (subject, body, pretty formats)");
  assert.equal((src.match(/--format=%B/g) ?? []).length, 1, "the commit message is read in exactly one place");
  assert.equal((src.match(/\$_msg\b/g) ?? []).length, 1, "and consulted exactly once");
  const arm = /case "\$_msg" in([\s\S]*?)esac/.exec(src)?.[1] ?? "";
  assert.match(arm, /\*"\[deploy\]"\*\)/, "the one token read is [deploy]");
  assert.doesNotMatch(arm, /exit 0|_gate skip/, "the message can only ever BUILD");
});

test("repo-root build inputs outside app/ → BUILD (projections + every read data/internal path)", () => {
  assert.ok(REPO_ROOT_BUILD_INPUTS.length >= 20, `only ${REPO_ROOT_BUILD_INPUTS.length} repo-root inputs exercised — the script's BUILD_INPUTS block was not parsed`);
  // Each input-N commit changes exactly one repo-root file the build reads; base = its parent.
  for (const [i, rel] of REPO_ROOT_BUILD_INPUTS.entries()) {
    const head = shas[`input-${i}`];
    git(["checkout", "-q", head]);
    const parent = git(["rev-parse", `${head}^`]);
    const r = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: parent, ...PATH_RULE });
    assert.equal(r.status, 1, `${rel} is a build input — a change there must BUILD: ${r.stdout}`);
    const late = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: parent, ...PAST_WINDOW() });
    assert.equal(late.status, 1, `${rel} is a build input — past the coalescing window it must BUILD: ${late.stdout}`);
  }
  git(["checkout", "-q", shas["app-change"]]);
});

test("data/internal churn the build never reads → still SKIP (the extension is not a blanket data/ rule)", () => {
  /*
   * ~19 pregame-archive pushes/7d (300+ files each) plus settle receipts touch data/internal only.
   * They feed pipeline scripts, not `npm run build`; building them would add ~4% of builds for
   * byte-identical output. Fail-open still applies to everything the build DOES read (test above).
   */
  git(["checkout", "-q", shas["internal-churn"]]);
  const r = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["app-change"] });
  git(["checkout", "-q", shas["app-change"]]);
  assert.equal(r.status, 0, `internal-only churn must skip: ${r.stdout}`);
  assert.match(r.stdout, /skipping build/);
});

test("after a FAILED deploy the base is the last SUCCESSFUL one, so the failed commit's data is carried by the next build", () => {
  /*
   * Q2 of the audit. Chain: base → docs-only → data-change (its deploy FAILED at the 45-min ceiling)
   * → docs-tail. Vercel sets VERCEL_GIT_PREVIOUS_SHA to the last SUCCESSFUL deployment (docs-only's
   * predecessor "base" here), so the docs-tail push spans the failed data change and BUILDS.
   * Had Vercel pointed at the failed commit itself, the same push would SKIP and strand the data —
   * the second assertion documents why the semantics matter (and why the script must never invent
   * a HEAD^ base of its own).
   */
  git(["checkout", "-q", shas["docs-tail"]]);
  const carried = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["base"], ...PATH_RULE });
  const carriedLate = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["base"], ...PAST_WINDOW() });
  const stranded = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["data-change"], ...PAST_WINDOW() });
  git(["checkout", "-q", shas["app-change"]]);
  assert.equal(carried.status, 1, "span from the last SUCCESSFUL deploy includes the failed data commit → BUILD");
  assert.equal(carriedLate.status, 1, "...with coalescing on, too, once the window has passed");
  assert.equal(stranded.status, 0, "a base AT the failed commit would skip — Vercel's last-successful semantics prevent it");
  assert.doesNotMatch(fs.readFileSync(SCRIPT, "utf8"), /git (rev-parse|diff)[^\n]*HEAD[\^~]|BASE=[^\n]*HEAD[\^~]/,
    "the script must not fall back to a HEAD^ base of its own");
});

// ── Two-tier coalescing gate (build-cost reduction, 2026-10-26) ──────────────────────────────────────────────────────
/*
 * Measured over the 7 days to 2026-10-26: 337 successful Production builds, ~300 of them started by automation DATA
 * commits. The gate batches NON-critical data for GTP_COALESCE_SECONDS (default 5400) and keeps code, the [deploy]
 * marker and critical pre-start forecast paths immediate. Each case below runs the real script on a throwaway repo whose
 * commit times are pinned (GIT_COMMITTER_DATE), with "now" injected through GTP_NOW_EPOCH.
 */
const T = 1761480000; // a fixed commit time; every "now" below is T + offset
const WINDOW = 5400;
const SCRIPT_TEXT = fs.readFileSync(SCRIPT, "utf8");
const CRITICAL = (() => {
  const block = /# GTP-CRITICAL-DATA-BEGIN\s*\nCRITICAL_DATA_INPUTS=\(([\s\S]*?)\n\)\s*\n# GTP-CRITICAL-DATA-END/.exec(SCRIPT_TEXT)?.[1] ?? "";
  return [...block.matchAll(/'\:\(top\)([^']+)'/g)].map((m) => m[1]);
})();
const representative = (entry) => (entry.endsWith("/") ? `${entry}2026-10-26/fixture.json` : entry);

function coalesceRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-coalesce-"));
  const g = (args, env = {}) => {
    const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", env: { ...process.env, ...env } });
    assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
    return r.stdout.trim();
  };
  g(["init", "-q"]);
  g(["config", "user.email", "test@test.invalid"]);
  g(["config", "user.name", "fixture"]);
  g(["config", "commit.gpgsign", "false"]);
  const commitAt = (message, files, epoch) => {
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), content);
    }
    g(["add", "-A"]);
    const date = `@${epoch} +0000`;
    g(["commit", "-q", "--allow-empty", "-m", message], { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date });
    return g(["rev-parse", "HEAD"]);
  };
  const checkout = (sha) => g(["checkout", "-q", sha]);
  const run = (base, env = {}) => {
    const r = spawnSync("bash", [SCRIPT], {
      cwd: path.join(dir, "app"),
      encoding: "utf8",
      env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: base, VERCEL_PROJECT_PRODUCTION_URL: "", VERCEL_FORCE_BUILD: "", GTP_COALESCE_SECONDS: "", GTP_NOW_EPOCH: "", ...env },
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const base = commitAt("deployed", {
    "app/src/page.tsx": "v1",
    "app/public/data/mlb/results/x.json": "{}",
    "app/public/data/ops/heartbeat.json": "{}",
    "docs/NOTES.md": "v1",
  }, T - 86400);
  return { dir, base, commitAt, checkout, run, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const now = (offset) => ({ GTP_NOW_EPOCH: String(T + offset) });
const gateLine = (out) => /GTP_GATE verdict=(\w+) tier=([a-z-]+) trigger_epoch=(\d*)/.exec(out)?.slice(1) ?? [];

test("COALESCE (a) a code change under app/src → BUILD now, whatever the clock", () => {
  const f = coalesceRepo();
  try {
    f.commitAt("code", { "app/src/page.tsx": "v2" }, T);
    for (const offset of [0, 60, WINDOW + 1]) {
      const r = f.run(f.base, now(offset));
      assert.equal(r.status, 1, `code must build at +${offset}s: ${r.out}`);
      assert.deepEqual(gateLine(r.out), ["build", "code", String(T)]);
    }
    // Code + non-critical data in the same span: code wins, immediately.
    f.commitAt("data", { "app/public/data/mlb/results/x.json": '{"v":1}' }, T + 10);
    assert.equal(f.run(f.base, now(60)).status, 1);
  } finally { f.cleanup(); }
});

test("COALESCE (b) a non-critical data change committed just now → SKIP, naming its age and the window", () => {
  const f = coalesceRepo();
  try {
    f.commitAt("data", { "app/public/data/mlb/results/x.json": '{"v":1}' }, T);
    const r = f.run(f.base, now(60));
    assert.equal(r.status, 0, `inside the window a data-only span must skip: ${r.out}`);
    assert.match(r.out, /coalescing: .* 60s old, inside the 5400s window — skipping build/);
    assert.deepEqual(gateLine(r.out), ["skip", "coalesce-wait", String(T)]);
    assert.equal(f.run(f.base, now(WINDOW - 1)).status, 0, "one second before the window still skips");
  } finally { f.cleanup(); }
});

test("COALESCE (c) the same change once the window has passed → BUILD (boundary inclusive)", () => {
  const f = coalesceRepo();
  try {
    f.commitAt("data", { "app/public/data/mlb/results/x.json": '{"v":1}' }, T);
    for (const offset of [WINDOW, WINDOW + 1, 86400]) {
      const r = f.run(f.base, now(offset));
      assert.equal(r.status, 1, `+${offset}s is at or past the window — must build: ${r.out}`);
      assert.deepEqual(gateLine(r.out), ["build", "coalesce-expired", String(T)]);
      assert.match(r.out, /build inputs changed/);
    }
    // The window is configurable, and the env override is what the tests and a Vercel rollback use.
    assert.equal(f.run(f.base, { ...now(120), GTP_COALESCE_SECONDS: "60" }).status, 1);
    assert.equal(f.run(f.base, { ...now(30), GTP_COALESCE_SECONDS: "60" }).status, 0);
  } finally { f.cleanup(); }
});

test("COALESCE (d) two data commits: the OLDER one decides — past the window → BUILD even though HEAD is fresh", () => {
  const f = coalesceRepo();
  try {
    const older = f.commitAt("data-1", { "app/public/data/mlb/results/x.json": '{"v":1}' }, T);
    f.commitAt("docs between", { "docs/NOTES.md": "v2" }, T + 100);
    f.commitAt("data-2", { "app/public/data/mlb/results/y.json": '{"v":2}' }, T + 5000);
    const r = f.run(f.base, now(WINDOW + 1));
    assert.equal(r.status, 1, `the oldest undeployed data change is ${WINDOW + 1}s old: ${r.out}`);
    assert.deepEqual(gateLine(r.out), ["build", "coalesce-expired", String(T)]);
    // Control: deployed at the older commit, only the fresh one is pending → still coalescing.
    assert.equal(f.run(older, now(WINDOW + 1)).status, 0, "with only the 401s-old commit undeployed it must skip");
    // A clock-skewed history (the newer commit dated EARLIER) still finds the true oldest: min, not log order.
    f.commitAt("data-3 skewed", { "app/public/data/mlb/results/z.json": "{}" }, T - 1000);
    assert.deepEqual(gateLine(f.run(f.base, now(60)).out), ["skip", "coalesce-wait", String(T - 1000)], "the trigger is the minimum commit time");
    assert.equal(f.run(f.base, now(WINDOW - 999)).status, 1, "and its age, not HEAD's, decides");
  } finally { f.cleanup(); }
});

test("COALESCE (e) the critical list is well formed: required entries, each a data BUILD_INPUT, each with its producer", async () => {
  const { buildInputPredicate } = await import("./ops/stamp-only-gate.mjs");
  const isBuildInput = buildInputPredicate(SCRIPT_TEXT);
  assert.ok(isBuildInput, "the BUILD_INPUTS lists no longer parse");
  for (const required of [
    "app/public/data/nba/experimental-public/",
    "data/internal/research/nba/theater-possession/",
    "app/public/data/nfl/forecasts/",
    "data/internal/nfl/forecast-receipts/",
    "data/internal/mlb/prediction-snapshots/",
  ]) assert.ok(CRITICAL.includes(required), `${required} must be a critical path`);
  assert.ok(CRITICAL.some((c) => c.startsWith("app/public/data/soccer/")), "the public soccer forecasts must be critical");
  assert.ok(CRITICAL.some((c) => c.startsWith("app/public/data/ufc/")), "the public UFC forecast must be critical");
  const lines = SCRIPT_TEXT.split("\n");
  for (const entry of CRITICAL) {
    assert.ok(entry.startsWith("app/public/data/") || entry.startsWith("data/"), `${entry} is not a data path`);
    assert.equal(isBuildInput(representative(entry)), true, `${entry} is not a BUILD_INPUT — a critical path that never builds is a contradiction`);
    const begin = lines.findIndex((l) => l.startsWith("# GTP-CRITICAL-DATA-BEGIN"));
    const at = lines.findIndex((l, i) => i > begin && l.includes(`':(top)${entry}'`));
    assert.match(lines[at - 1], /^\s*#.*(\.mjs|\.yml)/, `${entry} must be preceded by a comment naming its producer`);
  }
});

test("COALESCE (e) a change to EACH critical path → BUILD immediately, inside the window", () => {
  assert.ok(CRITICAL.length >= 8, `only ${CRITICAL.length} critical entries parsed`);
  const f = coalesceRepo();
  try {
    for (const entry of CRITICAL) {
      f.checkout(f.base);
      f.commitAt(`critical ${entry}`, { [representative(entry)]: '{"forecast":1}' }, T);
      const r = f.run(f.base, now(60));
      assert.equal(r.status, 1, `${entry} is critical — it must build on its own push: ${r.out}`);
      assert.deepEqual(gateLine(r.out), ["build", "critical", String(T)], entry);
    }
    // Critical + non-critical in one span: critical wins.
    f.checkout(f.base);
    f.commitAt("noncritical", { "app/public/data/mlb/results/x.json": '{"v":9}' }, T - 30);
    f.commitAt("critical", { [representative(CRITICAL[0])]: "{}" }, T);
    assert.equal(f.run(f.base, now(60)).status, 1);
    // A sibling of a critical directory is NOT critical (prefix, not substring): results beside forecasts coalesce.
    f.checkout(f.base);
    f.commitAt("nfl results", { "app/public/data/nfl/results/2026-10-26.json": "{}" }, T);
    assert.equal(f.run(f.base, now(60)).status, 0, "NFL results are not a pre-start forecast");
  } finally { f.cleanup(); }
});

test("COALESCE (f) the exact token [deploy] on HEAD → BUILD now for a non-critical data change", () => {
  const f = coalesceRepo();
  try {
    f.commitAt("auto: data refresh [deploy] [skip ci]", { "app/public/data/mlb/results/x.json": '{"v":1}' }, T);
    const r = f.run(f.base, now(60));
    assert.equal(r.status, 1, `[deploy] must build: ${r.out}`);
    assert.deepEqual(gateLine(r.out), ["build", "marker", String(T)]);
    // The empty flush commit deploy-flush pushes: no file of its own, but the span carries the pending data.
    f.checkout(f.base);
    f.commitAt("data", { "app/public/data/mlb/results/x.json": '{"v":2}' }, T);
    f.commitAt("auto: deploy flush [deploy] [skip ci]", {}, T + 1800);
    assert.equal(f.run(f.base, now(1900)).status, 1, "an empty [deploy] commit carries the coalesced data");
    // Only HEAD counts, and only the exact token.
    f.checkout(f.base);
    f.commitAt("older [deploy]", { "app/public/data/mlb/results/x.json": '{"v":3}' }, T);
    f.commitAt("newer", { "app/public/data/mlb/results/y.json": "{}" }, T + 10);
    assert.equal(f.run(f.base, now(60)).status, 0, "[deploy] on an older commit of the span is not a marker");
    for (const near of ["deploy", "[Deploy]", "[deploy-later]", "[ deploy ]"]) {
      f.checkout(f.base);
      f.commitAt(`data ${near}`, { "app/public/data/mlb/results/x.json": `{"near":"${near}"}` }, T);
      assert.equal(f.run(f.base, now(60)).status, 0, `${near} is not the token`);
    }
  } finally { f.cleanup(); }
});

test("COALESCE (g) a change only in NON_BUILD_INPUTS (ops/) → SKIP, unchanged — even with [deploy] or a stale clock", () => {
  const f = coalesceRepo();
  try {
    f.commitAt("ops only [deploy]", { "app/public/data/ops/heartbeat.json": '{"t":1}' }, T);
    for (const offset of [60, 86400]) {
      const r = f.run(f.base, now(offset));
      assert.equal(r.status, 0, `ops-only must skip at +${offset}s: ${r.out}`);
      assert.match(r.out, /no build-input changes/);
    }
  } finally { f.cleanup(); }
});

test("COALESCE (h) every failure builds: bad clock, bad window, future commit, git errors, garbage times", () => {
  const f = coalesceRepo();
  const realGit = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
  const fakeDir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-fakegit-"));
  fs.writeFileSync(path.join(fakeDir, "git"), [
    "#!/bin/sh",
    'if [ -n "$FAKE_GIT_MATCH" ]; then',
    '  case "$*" in *"$FAKE_GIT_MATCH"*)',
    '    if [ "$FAKE_GIT_MODE" = garbage ]; then echo "not-a-time"; exit 0; fi',
    '    if [ "$FAKE_GIT_MODE" = empty ]; then exit 0; fi',
    "    exit 128 ;;",
    "  esac",
    "fi",
    `exec "${realGit}" "$@"`,
    "",
  ].join("\n"), { mode: 0o755 });
  const viaFake = (match, mode = "fail") => ({ PATH: `${fakeDir}${path.delimiter}${process.env.PATH}`, FAKE_GIT_MATCH: match, FAKE_GIT_MODE: mode });
  try {
    f.commitAt("data", { "app/public/data/mlb/results/x.json": '{"v":1}' }, T);
    assert.equal(f.run(f.base, now(60)).status, 0, "control: this span coalesces when nothing fails");
    assert.equal(f.run(f.base, { ...now(60), ...viaFake("") }).status, 0, "control: the fake git is transparent when told to fail nothing");
    const cases = {
      "non-numeric now": [{ GTP_NOW_EPOCH: "soon" }, "clock-error"],
      "negative-looking now": [{ GTP_NOW_EPOCH: "-5" }, "clock-error"],
      "non-numeric window": [{ ...now(60), GTP_COALESCE_SECONDS: "ninety" }, "window-malformed"],
      "absurd window": [{ ...now(60), GTP_COALESCE_SECONDS: "99999999999999999999" }, "window-malformed"],
      "commit dated in the future (clock skew)": [now(-100), "clock-error"],
      "coalescing off (rollback)": [{ ...now(60), GTP_COALESCE_SECONDS: "0" }, "coalesce-off"],
      "git log of commit times fails": [{ ...now(60), ...viaFake("--format=%ct") }, "git-error"],
      "git log of commit times prints garbage": [{ ...now(60), ...viaFake("--format=%ct", "garbage") }, "git-error"],
      "git log of commit times prints nothing": [{ ...now(60), ...viaFake("--format=%ct", "empty") }, "git-error"],
      "the code-path diff fails": [{ ...now(60), ...viaFake(":(top,exclude)app/public/data/") }, "git-error"],
      "the critical-path diff fails": [{ ...now(60), ...viaFake(":(top)app/public/data/nfl/forecasts/") }, "git-error"],
      "the commit message cannot be read": [{ ...now(60), ...viaFake("--format=%B") }, "git-error"],
    };
    for (const [label, [env, tier]] of Object.entries(cases)) {
      const r = f.run(f.base, env);
      assert.equal(r.status, 1, `${label} must BUILD: ${r.out}`);
      assert.equal(gateLine(r.out)[1], tier, `${label} must build for the reason under test, not by accident: ${r.out}`);
    }
  } finally {
    f.cleanup();
    fs.rmSync(fakeDir, { recursive: true, force: true });
  }
});

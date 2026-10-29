/**
 * Hosted settings from NAMES only: the remote preflight (deploy/preflight.mjs --remote) and the configuration plan
 * (deploy/configure-hosted.mjs). The operator console project is refused, hosted publishing can't be switched on by
 * either, existing settings are never overwritten, and the shared vault key is generated once for both sides.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { checkRemote, OPERATOR_CONSOLE_PROJECT } from "../deploy/preflight.mjs";
import { planConfig, PLAIN } from "../deploy/configure-hosted.mjs";

const env = (key, type = "plain", target = ["production"]) => ({ key, type, target });
const COMPLETE = {
  project: "gtp-team",
  vercelEnv: [
    env("DATABASE_URL", "sensitive"), ...Object.keys(PLAIN).map((k) => env(k)),
    env("GH_DISPATCH_TOKEN", "sensitive"), env("CRON_SECRET", "sensitive"), env("GTP_CC_SECRET_KEY", "sensitive"), env("BLOB_STORE_ID"),
  ],
  ghSecrets: ["CC_WORKER_DATABASE_URL", "CC_READER_DATABASE_URL", "CC_PUBLISHER_DATABASE_URL", "CC_BLOB_READ_WRITE_TOKEN", "GTP_CC_SECRET_KEY", "CLAUDE_CODE_OAUTH_TOKEN"],
  ghVars: ["GTP_CC_X_CLIENT_ID", "GTP_CC_X_HANDLE"],
};
const levels = (rows) => rows.filter((r) => r.level !== "PASS").map((r) => `${r.level} ${r.name}`);

test("remote preflight: a complete staging setup passes; each gap is named", () => {
  assert.deepEqual(levels(checkRemote(COMPLETE)), []);
  const gaps = checkRemote({ ...COMPLETE, vercelEnv: COMPLETE.vercelEnv.filter((e) => !["CRON_SECRET", "BLOB_STORE_ID"].includes(e.key)), ghSecrets: COMPLETE.ghSecrets.filter((s) => s !== "GTP_CC_SECRET_KEY") });
  assert.deepEqual(levels(gaps), ["FAIL Vercel CRON_SECRET", "FAIL Vercel Blob store", "FAIL GitHub secret GTP_CC_SECRET_KEY"]);
});

test("remote preflight: operator console, publishing on, model keys, plain or widely-scoped secrets", () => {
  assert.match(levels(checkRemote({ ...COMPLETE, project: OPERATOR_CONSOLE_PROJECT }))[0], /FAIL Vercel project/);
  const bad = checkRemote({
    ...COMPLETE,
    vercelEnv: [...COMPLETE.vercelEnv.filter((e) => !["CRON_SECRET", "GH_DISPATCH_TOKEN"].includes(e.key)),
      env("CRON_SECRET", "encrypted"), env("GH_DISPATCH_TOKEN", "sensitive", ["production", "preview"]), env("GH_PUBLISHER_WORKFLOW"), env("OPENAI_API_KEY", "sensitive")],
  });
  assert.deepEqual(levels(bad).sort(), ["FAIL Vercel GH_PUBLISHER_WORKFLOW", "FAIL Vercel OPENAI_API_KEY", "WARN Vercel CRON_SECRET", "WARN Vercel GH_DISPATCH_TOKEN"]);
});

test("configure plan: adds only what is missing, never publishing, never the operator console", () => {
  const empty = { project: "gtp-team", vercelEnv: [env("DATABASE_URL", "sensitive")], ghSecrets: ["CC_WORKER_DATABASE_URL"] };
  const p = planConfig(empty, { dispatchToken: true, blobToken: true });
  assert.deepEqual(p.refuse, []);
  assert.deepEqual(p.vercel.map((x) => x.name), [...Object.keys(PLAIN), "CRON_SECRET", "GTP_CC_SECRET_KEY", "GH_DISPATCH_TOKEN"]);
  assert.deepEqual(p.github.map((x) => x.name), ["GTP_CC_SECRET_KEY", "CC_BLOB_READ_WRITE_TOKEN"]);
  assert.ok(![...p.vercel, ...p.github].some((x) => x.name === "GH_PUBLISHER_WORKFLOW" || x.name === "DATABASE_URL"));
  assert.equal(p.vercel.find((x) => x.name === "GTP_CC_SECRET_KEY").kind, "shared-key", "one value for both sides");

  const done = planConfig(COMPLETE, { dispatchToken: true, blobToken: true });
  assert.deepEqual([done.vercel, done.github, done.refuse], [[], [], []], "nothing existing is overwritten");
  assert.match(planConfig({ ...empty, project: OPERATOR_CONSOLE_PROJECT }).refuse[0], /operator console/);
  assert.match(planConfig({ ...empty, ghSecrets: ["GTP_CC_SECRET_KEY"] }).refuse[0], /only on GitHub/, "a half-set key is refused, not diverged");
});

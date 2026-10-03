/**
 * Session 9 · H5 — the LIVE two-account RLS battery (db/rls-live/two-account-isolation.sql) executed by a real
 * Postgres against the committed schema, plus every injected defect it must catch. Requires initdb/pg_ctl/psql;
 * where they are absent the test is SKIPPED BY NAME, never passed silently.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const havePg = ["initdb", "pg_ctl", "psql"].every((b) => spawnSync("which", [b]).status === 0);
const run = (...a) => spawnSync(process.execPath, ["scripts/accounts/rls-live.mjs", ...a], { encoding: "utf8", timeout: 240_000 });

test("live RLS: two accounts isolated on every private table; anon reads nothing; invites enforced", { skip: !havePg && "no local Postgres (initdb/pg_ctl/psql) — run `node scripts/accounts/rls-live.mjs` where one exists" }, () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /RLS LIVE ISOLATION: PASS/);
});

test("live RLS: every injected defect lands and is caught", { skip: !havePg && "no local Postgres" }, () => {
  const r = run("--all-mutations");
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal((r.stdout.match(/✓ mutation "/g) ?? []).length, 8);
});

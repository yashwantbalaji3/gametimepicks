/**
 * Session 9 · H5 — the LIVE two-account RLS battery (db/rls-live/two-account-isolation.sql) executed by a real
 * Postgres against the committed schema, plus every injected defect it must catch. Requires initdb/pg_ctl/psql;
 * where they are absent the test is SKIPPED BY NAME, never passed silently.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { MUTATIONS, pgEnvFromUrl } from "../../../scripts/accounts/rls-live.mjs";

/*
 * FIND A POSTGRES THAT ACTUALLY RUNS (2026-10-14). This only looked at PATH, so it SKIPPED on every CI run — the
 * Ubuntu runner image ships Postgres under /usr/lib/postgresql/<v>/bin, off PATH — and it FAILED on a machine whose
 * PATH Postgres was broken (a Homebrew build missing its ICU library) while a working one sat elsewhere. It now
 * looks on PATH and then in the standard install locations, and takes the first directory whose `initdb --version`
 * (and its server binary's) succeeds. On CI a missing Postgres is a FAILURE, never a skip: the battery is the only proof of isolation.
 */
function pgBinDir() {
  const dirs = [];
  const which = spawnSync("which", ["initdb"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) dirs.push(path.dirname(which.stdout.trim()));
  const under = (root, re) => { try { return fs.readdirSync(root).filter((d) => re.test(d)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).map((d) => path.join(root, d, "bin")); } catch { return []; } };
  dirs.push(...under("/usr/lib/postgresql", /^\d+$/), ...under("/Library/PostgreSQL", /^\d+$/), ...under("/opt/homebrew/opt", /^postgresql(@\d+)?$/), ...under("/usr/local/opt", /^postgresql(@\d+)?$/));
  // `postgres --version` too: a Homebrew build whose server binary cannot load ICU still answers `initdb --version`.
  return dirs.find((d) => ["initdb", "pg_ctl", "psql", "postgres"].every((b) => fs.existsSync(path.join(d, b)))
    && ["initdb", "postgres"].every((b) => spawnSync(path.join(d, b), ["--version"]).status === 0)) ?? null;
}
const PG_BIN = pgBinDir();
const ON_CI = process.env.CI === "true";
const SKIP = !PG_BIN && !ON_CI && "no working Postgres (initdb/pg_ctl/psql) on PATH or in a standard location — run `node scripts/accounts/rls-live.mjs` where one exists";
const run = (...a) => spawnSync(process.execPath, ["scripts/accounts/rls-live.mjs", ...a], {
  encoding: "utf8", timeout: 240_000, env: { ...process.env, PATH: PG_BIN ? `${PG_BIN}${path.delimiter}${process.env.PATH}` : process.env.PATH },
});

test("live RLS: a working Postgres is found on CI — the battery may never be skipped there", { skip: !ON_CI && "not on CI" }, () => {
  assert.ok(PG_BIN, "CI has no working initdb/pg_ctl/psql: the live account-isolation battery cannot run");
});

test("live RLS: two accounts isolated on every private table; anon reads nothing; invites enforced", { skip: SKIP }, () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /RLS LIVE ISOLATION: PASS/);
});

test("live RLS: every injected defect lands and is caught", { skip: SKIP }, () => {
  const r = run("--all-mutations");
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal((r.stdout.match(/✓ mutation "/g) ?? []).length, Object.keys(MUTATIONS).length);
});

test("--hosted: the connection string becomes libpq env vars, so psql reaches the hosted project, not a local socket", () => {
  // psql ignores a URI in PGDATABASE (it is read as a plain database NAME) and `-d postgres` overrides it anyway:
  // the first version of --hosted therefore connected to the local default socket and never ran against the project.
  const env = pgEnvFromUrl("postgresql://postgres.abcd:p%40ss%2Fw0rd@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require");
  assert.deepEqual(env, {
    PGHOST: "aws-0-us-east-1.pooler.supabase.com", PGPORT: "5432", PGUSER: "postgres.abcd",
    PGPASSWORD: "p@ss/w0rd", PGDATABASE: "postgres", PGSSLMODE: "require",
  });
  assert.equal(pgEnvFromUrl("postgres://u:p@h/db").PGPORT, "5432", "default port");
  assert.equal(pgEnvFromUrl("postgres://u:p@h/db").PGSSLMODE, "require", "TLS by default for a hosted project");
  assert.equal(pgEnvFromUrl("https://x.supabase.co"), null, "a project URL is not a database connection string");
  assert.equal(pgEnvFromUrl("not a url"), null);
});

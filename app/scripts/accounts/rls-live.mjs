#!/usr/bin/env node
/**
 * LIVE TWO-ACCOUNT RLS ISOLATION (Session 9 · H5) — execute the real policies, not a regex over them.
 *
 *   node scripts/accounts/rls-live.mjs                      # throwaway LOCAL Postgres (needs initdb/pg_ctl/psql)
 *   node scripts/accounts/rls-live.mjs --mutate <name>      # same, with one injected defect: MUST fail
 *   RLS_DB_URL=postgres://… node scripts/accounts/rls-live.mjs --hosted
 *                                                           # a real Supabase project, as `postgres`
 *
 * LOCAL: initdb a cluster in a temp dir, start it on a unix socket only (no TCP listener), apply
 * db/rls-live/supabase-shim.sql (roles, default grants, auth.uid/jwt, storage) + db/accounts-schema.sql,
 * then run db/rls-live/two-account-isolation.sql. The cluster is stopped and deleted afterwards.
 *
 * HOSTED: runs only the isolation file — the platform is the shim. The file is one transaction that ends
 * in ROLLBACK, so the run leaves nothing behind. RLS_DB_URL is read from the environment and never printed.
 *
 * What LOCAL proves: the policies in the committed schema isolate two accounts when executed by Postgres
 * with Supabase's default grants. What it does NOT prove: that the hosted project was set up from this
 * schema. That is the --hosted run (docs/SUPABASE_BETA_SETUP.md § Acceptance) — beta invitations wait on it.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const SCHEMA = path.join(ROOT, "db", "accounts-schema.sql");
const SHIM = path.join(ROOT, "db", "rls-live", "supabase-shim.sql");
const BATTERY = path.join(ROOT, "db", "rls-live", "two-account-isolation.sql");
const PASS = "RLS LIVE ISOLATION: PASS";

/**
 * Defects the battery must catch. Each is applied AFTER the real schema, so it models a project that
 * drifted from it (a dashboard click, a hand-written policy). `--mutate <name>` must FAIL the run.
 */
export const MUTATIONS = Object.freeze({
  "rls-disabled": "alter table public.bet_slips disable row level security;",
  "open-select": "drop policy bet_slips_select_own on public.bet_slips; create policy bet_slips_select_any on public.bet_slips for select using (auth.role() = 'authenticated');",
  "open-update-using": "drop policy beta_feedback_update_own on public.beta_feedback; create policy beta_feedback_update_open on public.beta_feedback for update using (true) with check (auth.uid() = user_id);",
  "anon-read": "create policy profiles_anon_read on public.profiles for select to anon using (true);",
  "no-invite-check": "drop policy profiles_insert_own on public.profiles; create policy profiles_insert_any on public.profiles for insert with check (auth.uid() = id);",
  "allowlist-readable": "create policy beta_access_read on public.beta_access for select using (true);",
  "storage-any-folder": "drop policy slips_read_own on storage.objects; create policy slips_read_any on storage.objects for select using (bucket_id = 'slips');",
  "storage-no-invite-check": "drop policy slips_write_own on storage.objects; create policy slips_write_any_member on storage.objects for insert with check (bucket_id = 'slips' and (storage.foldername(name))[1] = auth.uid()::text);",
  "unprotected-table": "create table public.user_notes (user_id uuid, body text);",
});

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", ...opts });

function psqlFile(conn, file, extraEnv = {}) {
  return run("psql", ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", ...conn, "-f", file], { env: { ...process.env, ...extraEnv } });
}

function verdict(res, { expectFail = false, label = "" } = {}) {
  const out = `${res.stdout ?? ""}`;
  const err = `${res.stderr ?? ""}`.split("\n").filter((l) => /ERROR|LEAK|NOT REFUSED|TAMPER|RLS DISABLED|UNTESTED|REVOKED|OWN-READ/.test(l)).join("\n");
  const passed = res.status === 0 && out.includes(PASS);
  if (expectFail) {
    if (passed) { console.error(`✗ mutation "${label}" was NOT caught — the battery passed a broken project`); return 1; }
    console.log(`✓ mutation "${label}" caught: ${err.split("\n")[0] || `exit ${res.status}`}`);
    return 0;
  }
  if (!passed) { console.error(`✗ RLS live isolation FAILED${label ? ` (${label})` : ""}\n${err || out || `exit ${res.status}`}`); return 1; }
  console.log(`✓ ${PASS}${label ? ` (${label})` : ""}`);
  return 0;
}

/**
 * The project's connection string → libpq environment variables. The secret travels in the child's env, never on
 * the command line (process lists, shell history, CI logs). A URI in PGDATABASE does NOT work: psql reads it as a
 * plain database name and falls back to the local socket, so the string is split into its parts here.
 * @returns {Record<string,string>|null} null when the string is not a postgres:// or postgresql:// URL
 */
export function pgEnvFromUrl(raw) {
  let u;
  try { u = new URL(String(raw ?? "").trim()); } catch { return null; }
  if (!["postgres:", "postgresql:"].includes(u.protocol) || !u.hostname) return null;
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username || "postgres"),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres",
    PGSSLMODE: u.searchParams.get("sslmode") || "require",
  };
}

function hosted() {
  const url = String(process.env.RLS_DB_URL ?? "").trim();
  if (!url) { console.error("--hosted needs RLS_DB_URL (the project's postgres connection string) in the environment"); return 3; }
  const env = pgEnvFromUrl(url);
  if (!env) { console.error("RLS_DB_URL is not a postgresql://… connection string (Supabase → Connect → Session pooler)"); return 3; }
  if (run("which", ["psql"]).status !== 0) { console.error("--hosted needs psql on PATH (macOS: brew install libpq && brew link --force libpq)"); return 3; }
  // No -d / -h flags: libpq takes every connection parameter from the env above.
  return verdict(psqlFile([], BATTERY, env), { label: "hosted project" });
}

function local(mutation) {
  for (const bin of ["initdb", "pg_ctl", "psql"]) {
    if (run("which", [bin]).status !== 0) { console.error(`local mode needs ${bin} on PATH (Postgres 14+)`); return 3; }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-rls-"));
  const data = path.join(dir, "data");
  const sock = dir;
  const conn = ["-h", sock, "-p", "54329", "-U", "postgres", "-d", "postgres"];
  try {
    const init = run("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--no-instructions"]);
    if (init.status !== 0) { console.error(init.stderr); return 3; }
    // listen_addresses='' ⇒ unix socket only: nothing on the network, ever.
    const start = run("pg_ctl", ["-D", data, "-l", path.join(dir, "log"), "-w", "-o", `-k ${sock} -p 54329 -c listen_addresses=''`, "start"]);
    if (start.status !== 0) { console.error(start.stderr || fs.readFileSync(path.join(dir, "log"), "utf8")); return 3; }
    for (const f of [SHIM, SCHEMA]) {
      const r = psqlFile(conn, f);
      if (r.status !== 0) { console.error(`applying ${path.relative(ROOT, f)} failed:\n${r.stderr}`); return 3; }
    }
    if (mutation) {
      const f = path.join(dir, "mutation.sql");
      fs.writeFileSync(f, MUTATIONS[mutation] + "\n");
      const r = psqlFile(conn, f);
      if (r.status !== 0) { console.error(`mutation "${mutation}" did not apply (a probe that never lands proves nothing):\n${r.stderr}`); return 3; }
    }
    return verdict(psqlFile(conn, BATTERY), { expectFail: Boolean(mutation), label: mutation ?? "local Postgres + Supabase shim" });
  } finally {
    run("pg_ctl", ["-D", data, "-m", "immediate", "stop"]);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--hosted")) process.exit(hosted());
  if (process.argv.includes("--all-mutations")) {
    let bad = 0;
    bad += local(null);
    for (const m of Object.keys(MUTATIONS)) bad += local(m);
    process.exit(bad ? 1 : 0);
  }
  const m = arg("--mutate");
  if (m && !(m in MUTATIONS)) { console.error(`unknown mutation ${m}; one of ${Object.keys(MUTATIONS).join(", ")}`); process.exit(2); }
  process.exit(local(m));
}

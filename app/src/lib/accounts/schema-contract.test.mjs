/**
 * THE ACCOUNTS CONTRACT, GUARDED (P263) — before a single row exists.
 *
 * A user's bets are financial behaviour. The whole safety of storing them rests on two things being
 * true of every table: row-level security is ENABLED, and every policy compares auth.uid() to the
 * row's owner. A table added later without both is readable by any signed-in visitor, and nothing in
 * the application would look different — which is exactly why this is asserted against the schema
 * file rather than trusted to review.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { accountsConfig, accountsReady, accountsNotice } from "./config.mjs";

const REPO = path.join(process.cwd(), "..");
const SQL = fs.readFileSync(path.join(REPO, "db/accounts-schema.sql"), "utf8");
const readOrEmpty = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };
const tables = [...SQL.matchAll(/create table if not exists public\.([a-z_]+)/g)].map((m) => m[1]);

test("the schema creates the tables the product needs, and nothing anonymous", () => {
  assert.deepEqual(tables.sort(), ["bet_slips", "profiles"]);
});

test("every table has row-level security enabled", () => {
  for (const t of tables) {
    assert.match(SQL, new RegExp(`alter table public\\.${t}\\s+enable row level security`), `${t} without RLS is readable by any signed-in visitor`);
  }
});

test("every table restricts all four verbs to the row's owner", () => {
  for (const t of tables) {
    const owner = t === "profiles" ? "id" : "user_id";
    for (const verb of ["select", "insert", "update", "delete"]) {
      const policy = new RegExp(`create policy ${t}_${verb}_own on public\\.${t} for ${verb}[\\s\\S]{0,200}?auth\\.uid\\(\\) = ${owner}`);
      assert.match(SQL, policy, `${t}: ${verb} must be restricted to auth.uid() = ${owner}`);
    }
  }
});

test("no policy is open, and no table is left world-readable", () => {
  assert.ok(!/using\s*\(\s*true\s*\)/i.test(SQL), "a `using (true)` policy makes the table public");
  assert.ok(!/for select\s+using\s*\(\s*auth\.role\(\)\s*=\s*'authenticated'\s*\)/i.test(SQL), "any signed-in user is not the owner");
});

test("slip images live in a PRIVATE bucket, one folder per person", () => {
  assert.match(SQL, /insert into storage\.buckets[\s\S]{0,120}'slips'[\s\S]{0,80}false/, "the bucket is created private");
  assert.match(SQL, /do update set public = false/, "and re-running can never flip it public");
  for (const verb of ["select", "insert", "delete"]) {
    assert.match(SQL, new RegExp(`for ${verb}[\\s\\S]{0,220}?storage\\.foldername\\(name\\)\\)\\[1\\] = auth\\.uid\\(\\)::text`), `storage ${verb} is scoped to the user's own folder`);
  }
});

test("deleting the account takes the data with it", () => {
  const cascades = [...SQL.matchAll(/references auth\.users \(id\) on delete cascade/g)];
  assert.equal(cascades.length, tables.length, "every table cascades from the auth user");
});

test("config is fail-closed: no project, no accounts — and never a key when it is not ready", () => {
  const off = accountsConfig({});
  assert.equal(off.state, "UNCONFIGURED");
  assert.equal(off.anonKey, null);
  assert.equal(accountsReady({}), false);

  const half = accountsConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" });
  assert.equal(half.state, "MISCONFIGURED");
  assert.match(half.reason, /ANON_KEY is missing/);
  assert.equal(half.anonKey, null, "a half-configured project hands back nothing");

  const wrong = accountsConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://example.com", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" });
  assert.equal(wrong.state, "MISCONFIGURED");

  const ready = accountsConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co/", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key" });
  assert.equal(ready.state, "READY");
  assert.equal(ready.url, "https://abc.supabase.co", "the trailing slash is normalised away");
  assert.equal(accountsReady({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" }), true);
});

test("the reader is told plainly, without an environment variable in sight", () => {
  const notice = accountsNotice(accountsConfig({}));
  assert.match(notice, /not open yet/);
  assert.ok(!/SUPABASE/i.test(notice), "a visitor is never shown an env var name");
  assert.equal(accountsNotice(accountsConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" })), null);
});

test("the service-role key never appears in client source — it bypasses every policy above", () => {
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      // Test files are excluded: this very file names the variable in order to ban it, and a guard
      // that flags its own text would have to be weakened to pass, which defeats the guard.
      // Read defensively: the identity suite writes and deletes a probe file inside src, so a path
      // from this walk can vanish before it is read. A file that is gone ships nothing.
      else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.test\./.test(e.name) && /SUPABASE_SERVICE_ROLE/.test(readOrEmpty(p))) hits.push(path.relative(process.cwd(), p));
    }
  };
  walk(path.join(process.cwd(), "src"));
  assert.deepEqual(hits, [], "the service-role key belongs to app/api/ server code only, never to anything under src/");
});

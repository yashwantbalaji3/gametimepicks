/**
 * deploy/provision-db.mjs on real Postgres (PGlite) with the real migrations and roles.sql: every permission probe
 * gives its expected answer, the probes write nothing, the schema check passes, and the owner connection string is
 * validated without ever being echoed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pglite } from "../ledger/pg-adapters.mjs";
import { migrate } from "../ledger/sql-store.mjs";
import { CC_ROOT } from "../lib/util.mjs";
import { PROBES, DESTINATIONS, runProbes, checkSchema, roleUrl } from "../deploy/provision-db.mjs";
import { ownerUrlProblem, hiddenPrompt } from "../deploy/owner-url.mjs";

async function provisioned() {
  const db = await pglite();
  await migrate(db);
  let sql = fs.readFileSync(path.join(CC_ROOT, "deploy/sql/roles.sql"), "utf8");
  for (const k of ["app_pw", "worker_pw", "reader_pw", "publisher_pw"]) sql = sql.replace(`:'${k}'`, "'test-only'");
  await db.exec(sql);
  return db;
}

test("provision-db: every role probe gives the expected answer, and nothing is written", async () => {
  const db = await provisioned();
  const before = (await db.query("SELECT (SELECT count(*) FROM ledger_entries) AS e, (SELECT count(*) FROM ledger_claims) AS c")).rows[0];
  const results = await runProbes(db, PROBES, { setRole: true });
  const failed = results.filter((r) => !r.pass);
  assert.deepEqual(failed, [], failed.map((r) => `${r.role} ${r.what}: expected ${r.expect}, got ${r.got}`).join("\n"));
  for (const role of Object.keys(DESTINATIONS)) assert.ok(results.some((r) => r.role === role && r.expect === "ok"), `${role} has an allowed probe`);
  const pub = results.filter((r) => r.role === "gtp_cc_publisher");
  for (const w of ['forge a "decision" entry', 'forge a "publisher-host" entry', "create a user account", "change a user's role", "read auth_users"]) {
    assert.ok(pub.some((r) => r.what === w && r.got === "denied"), `publisher: ${w}`);
  }
  const after = (await db.query("SELECT (SELECT count(*) FROM ledger_entries) AS e, (SELECT count(*) FROM ledger_claims) AS c")).rows[0];
  assert.deepEqual(after, before, "probes are rolled back");
  assert.equal((await db.query("SELECT current_user AS u")).rows[0].u, "postgres", "role switch does not leak");
});

test("provision-db: a probe that expected a denial fails loudly when the grant is too wide", async () => {
  const db = await provisioned();
  await db.exec("GRANT SELECT ON auth_users TO gtp_cc_publisher");
  const r = (await runProbes(db, PROBES.filter((p) => p.role === "gtp_cc_publisher"), { setRole: true })).find((x) => x.what === "read auth_users");
  assert.equal(r.pass, false);
  assert.equal(r.got, "ok");
});

test("provision-db: the schema check passes on the migrated, provisioned database", async () => {
  const db = await provisioned();
  const { rows, roles } = await checkSchema(db);
  assert.deepEqual(rows.filter((r) => r.level !== "PASS"), []);
  assert.deepEqual(roles, ["gtp_cc_app", "gtp_cc_publisher", "gtp_cc_reader", "gtp_cc_worker"]);
});

test("owner connection string: shape checks never echo it; the prompt refuses a pipe", async () => {
  const pw = "Zx9-secret-never-shown";
  const ok = `postgresql://neondb_owner:${pw}@ep-cool-name-a1b2c3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`;
  assert.equal(ownerUrlProblem(ok), null);
  const bad = {
    "not a url": /not a connection string/,
    [ok.replace("ep-cool-name-a1b2c3", "ep-cool-name-a1b2c3-pooler")]: /POOLED/,
    [ok.replace("neondb_owner", "gtp_cc_app")]: /runtime role/,
    [ok.replace("sslmode=require", "sslmode=disable")]: /sslmode=require/,
    [ok.replace(".neon.tech", ".example.com")]: /not a Neon host/,
  };
  for (const [v, re] of Object.entries(bad)) {
    const problem = ownerUrlProblem(v);
    assert.match(problem, re);
    assert.ok(!problem.includes(pw), "the message never includes the value");
  }
  await assert.rejects(hiddenPrompt("x", { input: { isTTY: false }, output: { write() {} } }), /Terminal window/);
});

test("runtime roles use Neon's pooled endpoint; the owner's direct string is never reused as is", () => {
  const owner = "postgresql://neondb_owner:ownerpw@ep-cool-name-a1b2c3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
  const u = new URL(roleUrl(owner, "gtp_cc_publisher", "newpw"));
  assert.equal(u.hostname, "ep-cool-name-a1b2c3-pooler.us-east-1.aws.neon.tech");
  assert.equal(u.username, "gtp_cc_publisher");
  assert.equal(u.password, "newpw");
  assert.equal(u.searchParams.get("sslmode"), "require");
  assert.ok(!u.toString().includes("ownerpw"));
  assert.equal(new URL(roleUrl(u.toString(), "gtp_cc_app", "p")).hostname, u.hostname, "already pooled stays pooled");
});

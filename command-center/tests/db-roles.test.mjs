/**
 * H0: the exact deploy/sql/roles.sql on PGlite. The worker role can append agent work but never a founder action
 * or a non-job claim; nobody can rewrite or truncate the ledger; only the web app sees authentication tables.
 * A real recap job runs end to end AS the worker role, proving the policy doesn't block legitimate work.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pglite } from "../ledger/pg-adapters.mjs";
import { migrate, createSqlStore } from "../ledger/sql-store.mjs";
import { dirObjectStore } from "../ledger/object-store.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { runWorkerJob } from "../worker/worker.mjs";
import { CC_ROOT, stepClock } from "../lib/util.mjs";
import { FOUNDER, tempDir, TEST_SLATE, RECAP_COMMAND } from "./helpers.mjs";

async function withRoles() {
  const db = await pglite();
  await migrate(db);
  const sql = fs.readFileSync(path.join(CC_ROOT, "deploy/sql/roles.sql"), "utf8")
    .replace(":'app_pw'", "'a-pw'").replace(":'worker_pw'", "'w-pw'").replace(":'reader_pw'", "'r-pw'").replace(":'publisher_pw'", "'p-pw'");
  await db.exec(sql);
  const as = async (role, fn) => {
    await db.exec(`SET ROLE ${role}`);
    try { return await fn(); } finally { await db.exec("RESET ROLE"); }
  };
  return { db, as };
}

const insertEntry = (db, kind) => db.query("INSERT INTO ledger_entries (id, at, kind, actor, data) VALUES ($1, '2026-10-27T00:00:00Z', $2, 'x', '{}')", [`${kind}-${Math.random()}`, kind]);
const insertClaim = (db, key) => db.query("INSERT INTO ledger_claims (key_hash, key, value) VALUES ($1, $2, '{}')", [`h-${Math.random()}`, key]);

test("roles.sql: the worker can't forge founder actions, nobody can rewrite the ledger, auth is app-only", async () => {
  const { db, as } = await withRoles();
  await as("gtp_cc_worker", async () => {
    for (const kind of ["progress", "contribution", "decision-request", "job", "report"]) await insertEntry(db, kind);
    for (const kind of ["decision", "attestation", "seat-change", "control", "command", "auth", "publish-receipt"]) {
      await assert.rejects(insertEntry(db, kind), /row-level security/, `worker appended ${kind}`);
    }
    await insertClaim(db, "job|job-0123456789ab|start");
    await assert.rejects(insertClaim(db, "decision|d1"), /row-level security/);
    await assert.rejects(insertClaim(db, "gate|g1"), /row-level security/);
    await assert.rejects(db.query("SELECT * FROM auth_sessions"), /permission denied/);
    await assert.rejects(db.query("UPDATE ledger_entries SET kind = 'decision'"), /permission denied|append-only/);
    await assert.rejects(db.query("DELETE FROM ledger_entries"), /permission denied|append-only/);
    await assert.rejects(db.query("CREATE TABLE x (y int)"), /permission denied/);
  });
  await as("gtp_cc_app", async () => {
    await insertEntry(db, "decision");
    await insertClaim(db, "decision|d1");
    await db.query("SELECT count(*) FROM auth_sessions");
    await assert.rejects(db.query("UPDATE ledger_entries SET kind = 'x'"), /permission denied|append-only/);
    await assert.rejects(db.query("ALTER TABLE ledger_entries DISABLE TRIGGER ALL"), /must be owner|permission denied/);
  });
  await as("gtp_cc_reader", async () => {
    await db.query("SELECT count(*) FROM ledger_entries");
    await assert.rejects(insertEntry(db, "progress"), /permission denied/);
    await assert.rejects(db.query("SELECT * FROM ledger_claims"), /permission denied/);
  });
  await assert.rejects(db.query("TRUNCATE ledger_entries"), /append-only/, "even the owner cannot truncate");
});

test("a recap job runs end to end as the worker role; the founder's approval works as the app role", async () => {
  const { db, as } = await withRoles();
  const clock = stepClock("2026-10-27T16:00:00.000Z");
  const out = tempDir("gtp-cc-roles-");
  const store = createSqlStore({ db, clock });
  const app = async (fn) => as("gtp_cc_app", async () => {
    const s = await store.open();
    const o = createOrchestrator({ store: s, clock, outDir: out, slateDate: TEST_SLATE, execution: "jobs", runnerId: "web" });
    const r = await fn(o);
    await s.flush();
    return { r, outbox: o.takeOutbox() };
  });
  const { outbox } = await app((o) => o.handleCommand(RECAP_COMMAND, FOUNDER));
  const w = await as("gtp_cc_worker", () => runWorkerJob({
    db, clock, jobId: outbox[0].jobId, runnerId: "github-actions", outDir: path.join(out, "w"),
    objects: dirObjectStore(path.join(out, "objects")), slateDate: TEST_SLATE,
  }));
  assert.equal(w.ok, true, JSON.stringify(w));
  const { r: state } = await app(async (o) => o.state());
  const d = state.decisions[0];
  const { r } = await app((o) => o.decide({ decisionId: d.decisionId, verdict: "approve", captionId: "A", digest: d.options[0].digest }, FOUNDER));
  assert.equal(r.receipt.state, "PUBLISHED_MOCK");
});

test("roles.sql: the publisher records only what it did; nobody but the app sees accounts; the worker can't publish", async () => {
  const { db, as } = await withRoles();
  await as("gtp_cc_publisher", async () => {
    for (const kind of ["publish-attempt", "publish-result", "publish-alert", "publish-tick"]) await insertEntry(db, kind);
    await db.query("INSERT INTO ledger_entries (id, at, kind, actor, data) VALUES ('r1', '2026-10-28T00:00:00Z', 'publish-receipt', 'publisher', '{\"provider\":\"x-api\"}')");
    await assert.rejects(db.query("INSERT INTO ledger_entries (id, at, kind, actor, data) VALUES ('r2', '2026-10-28T00:00:00Z', 'publish-receipt', 'publisher', '{\"provider\":\"manual-handoff\"}')"), /row-level security/);
    for (const kind of ["decision", "design-approval", "publish-policy", "publish-job", "publish-pause", "control", "auth", "command"]) {
      await assert.rejects(insertEntry(db, kind), /row-level security/, `publisher appended ${kind}`);
    }
    for (const key of ["xlive|2026-10-28:NBA:game:1|0", "xdry|pubjob-1", "publish|post-1", "xpost|123"]) await insertClaim(db, key);
    for (const key of ["post-approval|x|0", "decision|post-1", "design|t|a", "job|job-1|start"]) {
      await assert.rejects(insertClaim(db, key), /row-level security/, `publisher claimed ${key}`);
    }
    for (const t of ["auth_users", "auth_invites", "auth_sessions", "auth_passkeys", "cc_oauth_states"]) {
      await assert.rejects(db.query(`SELECT * FROM ${t}`), /permission denied/, `publisher read ${t}`);
    }
    await db.query("SELECT * FROM cc_secrets"); // the encrypted tokens (it refreshes them)
  });
  await as("gtp_cc_worker", async () => {
    for (const kind of ["publish-result", "publish-attempt", "publish-policy", "publish-job"]) await assert.rejects(insertEntry(db, kind), /row-level security/, `worker appended ${kind}`);
    await assert.rejects(insertClaim(db, "xlive|x|0"), /row-level security/);
    for (const t of ["cc_secrets", "auth_users", "auth_invites"]) await assert.rejects(db.query(`SELECT * FROM ${t}`), /permission denied/, `worker read ${t}`);
  });
  await as("gtp_cc_reader", async () => {
    await assert.rejects(db.query("SELECT * FROM cc_secrets"), /permission denied/);
  });
  await as("gtp_cc_app", async () => {
    await db.query("SELECT * FROM auth_users");
    await db.query("SELECT * FROM auth_invites");
  });
});

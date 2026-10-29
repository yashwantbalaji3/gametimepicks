/**
 * Hosted media off the database: the private Blob object store (write-once, integrity-checked reads, legacy
 * fallback, retention that removes bytes but keeps evidence) and the pure retention plan. The Blob SDK is a fake
 * here; nothing touches the network.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { pglite } from "../ledger/pg-adapters.mjs";
import { createSqlStore } from "../ledger/sql-store.mjs";
import { blobObjectStore, sqlObjectStore } from "../ledger/object-store.mjs";
import { planRetention } from "../ledger/media-retention.mjs";
import { stepClock } from "../lib/util.mjs";

/** An in-memory stand-in for @vercel/blob's put/get/del, recording the options each call used. */
function fakeBlob() {
  const files = new Map();
  const calls = [];
  return {
    files, calls,
    async put(pathname, bytes, opts) {
      calls.push({ op: "put", pathname, opts });
      if (files.has(pathname) && !opts.allowOverwrite) throw new Error("blob already exists");
      files.set(pathname, Buffer.from(bytes));
      return { pathname };
    },
    async get(pathname, opts) {
      calls.push({ op: "get", pathname, opts });
      if (!files.has(pathname)) return null;
      return { statusCode: 200, stream: Readable.from([files.get(pathname)]) };
    },
    async del(pathname) {
      calls.push({ op: "del", pathname });
      files.delete(pathname);
    },
  };
}

async function setup() {
  const db = await pglite();
  const clock = stepClock();
  await createSqlStore({ db, clock }).migrate();
  const client = fakeBlob();
  return { db, clock, client, objects: blobObjectStore({ db, clock, client }) };
}
const png = (s) => Buffer.from(`\x89PNG fake ${s}`);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

test("blob store: bytes go to the private store, Postgres keeps only the reference", async () => {
  const { db, client, objects } = await setup();
  const bytes = png("a");
  assert.deepEqual(await objects.put("media/a.png", bytes, "image/png"), { key: "media/a.png", created: true });
  const put = client.calls.find((c) => c.op === "put");
  assert.equal(put.opts.access, "private");
  assert.equal(put.opts.allowOverwrite, false);
  assert.equal(put.opts.addRandomSuffix, false);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM stored_objects")).rows[0].n, 0, "no bytes in Postgres");
  const ref = (await db.query("SELECT * FROM stored_object_refs")).rows[0];
  assert.equal(ref.sha256, sha(bytes));
  assert.equal(ref.storage, "blob");
  const got = await objects.get("media/a.png");
  assert.ok(got.body.equals(bytes));
  assert.equal(got.contentType, "image/png");
  assert.ok(client.calls.filter((c) => c.op === "get").every((c) => c.opts.access === "private"));
});

test("blob store: write-once — same bytes is a no-op, different bytes refused", async () => {
  const { client, objects } = await setup();
  await objects.put("media/a.png", png("a"), "image/png");
  assert.deepEqual(await objects.put("media/a.png", png("a"), "image/png"), { key: "media/a.png", created: false });
  await assert.rejects(objects.put("media/a.png", png("b"), "image/png"), /different content/);
  assert.equal(client.calls.filter((c) => c.op === "put").length, 1);
});

test("blob store: a blob left by an interrupted put is adopted only when its bytes match", async () => {
  const { db, client, objects } = await setup();
  client.files.set("gtp-cc/media/x.png", png("x"));
  assert.equal((await objects.put("media/x.png", png("x"), "image/png")).created, true);
  client.files.set("gtp-cc/media/y.png", png("other"));
  await assert.rejects(objects.put("media/y.png", png("y"), "image/png"), /already exists/);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM stored_object_refs WHERE key = 'media/y.png'")).rows[0].n, 0);
});

test("blob store: swapped or corrupted bytes are refused, never served", async () => {
  const { client, objects } = await setup();
  await objects.put("media/a.png", png("a"), "image/png");
  client.files.set("gtp-cc/media/a.png", png("tampered"));
  await assert.rejects(objects.get("media/a.png"), /integrity check/);
});

test("blob store: keys stored in Postgres before the migration stay readable and keep write-once", async () => {
  const { db, clock, client, objects } = await setup();
  await sqlObjectStore({ db, clock }).put("media/old.png", png("old"), "image/png");
  assert.ok((await objects.get("media/old.png")).body.equals(png("old")));
  assert.equal((await objects.put("media/old.png", png("old"), "image/png")).created, false);
  await assert.rejects(objects.put("media/old.png", png("new"), "image/png"), /different content/);
  assert.equal(client.calls.filter((c) => c.op === "put").length, 0, "legacy keys are never duplicated into Blob");
});

test("blob store: retention removes bytes, keeps the reference and records hash + reason (append-only)", async () => {
  const { db, client, objects } = await setup();
  await objects.put("media/a.png", png("a"), "image/png");
  assert.deepEqual(await objects.remove("media/a.png", "only used by superseded d-1"), { key: "media/a.png", removed: true });
  assert.equal(client.files.size, 0);
  assert.equal(await objects.get("media/a.png"), null);
  assert.deepEqual(await objects.remove("media/a.png", "again"), { key: "media/a.png", removed: false });
  const del = (await db.query("SELECT * FROM stored_object_deletions")).rows;
  assert.equal(del.length, 1);
  assert.equal(del[0].sha256, sha(png("a")));
  assert.match(del[0].reason, /superseded/);
  const refs = await objects.listRefs();
  assert.deepEqual(refs.map((r) => [r.key, r.deleted]), [["media/a.png", true]]);
  await assert.rejects(db.query("DELETE FROM stored_object_refs"), /append-only/);
  await assert.rejects(db.query("UPDATE stored_object_deletions SET reason = 'x'"), /append-only/);
  await assert.rejects(objects.put("media/a.png", png("b"), "image/png"), /different content/, "a removed key can't be reused for other bytes");
});

test("retention plan: approved and published media kept forever; open drafts kept; closed drafts removed after keepDays", () => {
  const now = "2026-11-20T12:00:00Z";
  const old = "2026-10-29T00:00:00Z";
  const young = "2026-11-15T00:00:00Z";
  const pkg = (...files) => ({ mediaSet: files.map((f) => ({ file: `media/${f}` })) });
  const posts = [
    { decisionId: "d-pub", package: pkg("pub1.png", "pub2.png"), resolution: { verdict: "approve" }, receipt: { canonicalUrl: "https://x.com/i/status/1" } },
    { decisionId: "d-appr", package: pkg("appr.png"), resolution: { verdict: "approve" }, lifecycle: "superseded" },
    { decisionId: "d-open", package: pkg("open.png"), resolution: null, lifecycle: "open" },
    { decisionId: "d-sup", package: pkg("sup.png", "shared.png"), resolution: null, lifecycle: "superseded" },
    { decisionId: "d-rej", package: { media: { file: "out/media/rej.png" } }, resolution: { verdict: "reject" }, lifecycle: "rejected" },
    { decisionId: "d-pub2", package: pkg("shared.png"), receipt: { canonicalUrl: "https://x.com/i/status/2" } },
  ];
  const refs = ["pub1", "pub2", "appr", "open", "sup", "shared", "rej", "orphan"].map((k) => ({ key: `media/${k}.png`, createdAt: old, size: 1000, deleted: false }));
  refs.push({ key: "media/young.png", createdAt: young, size: 1000, deleted: false });
  refs.push({ key: "media/gone.png", createdAt: old, size: 1000, deleted: true });
  refs.push({ key: "runs/log.jsonl", createdAt: old, size: 1000, deleted: false });
  const plan = planRetention({ posts, refs, now });
  assert.deepEqual(plan.remove.map((r) => r.key).sort(), ["media/orphan.png", "media/rej.png", "media/sup.png"]);
  assert.equal(plan.bytes, 3000);
  const kept = Object.fromEntries(plan.keep.map((k) => [k.key, k.why]));
  assert.match(kept["media/pub1.png"], /published https:\/\/x\.com/);
  assert.match(kept["media/appr.png"], /approved/);
  assert.match(kept["media/shared.png"], /published/, "media shared with a published post is never removed");
  assert.match(kept["media/open.png"], /open draft/);
  assert.match(kept["media/young.png"], /younger than 14 days/);
  assert.ok(!("media/gone.png" in kept) && !plan.remove.some((r) => r.key === "media/gone.png"));
  assert.ok(!plan.keep.concat(plan.remove).some((r) => r.key.startsWith("runs/")), "logs are not media");
});

test("backup file: AES-256-GCM sealed, tamper-evident, media hashes and counts checked on restore", async () => {
  const { seal, open, check } = await import("../deploy/backup.mjs");
  const key = crypto.randomBytes(32);
  const bytes = png("a");
  const b = { schema: "gtp.cc.backup@1", entries: [{ id: "e1" }], claims: [], refs: [{ key: "media/a.png" }], deletions: [], media: { "media/a.png": { sha256: sha(bytes), base64: bytes.toString("base64") } } };
  b.counts = { entries: 1, claims: 0, refs: 1, deletions: 0, media: 1 };
  const file = seal(b, key);
  assert.ok(!file.includes(Buffer.from("media/a.png")), "nothing readable without the key");
  assert.ok(check(open(file, key)).ok);
  const flipped = Buffer.from(file);
  flipped[flipped.length - 1] ^= 1;
  assert.throws(() => open(flipped, key));
  assert.throws(() => open(file, crypto.randomBytes(32)));
  const bad = open(file, key);
  bad.media["media/a.png"].base64 = png("swapped").toString("base64");
  assert.deepEqual(check(bad).badMedia, ["media/a.png"]);
});

test("deploy preflight: never prints a value; refuses the owner role, model keys and a publishing staging", async () => {
  const { checkEnv } = await import("../deploy/preflight.mjs");
  const secret = "s3cret-value-that-must-not-print";
  const env = {
    DATABASE_URL: `postgres://gtp_cc_owner:${secret}@ep-x.neon.tech/db?sslmode=require`, GTP_CC_ORIGIN: "https://team.gametimepicks.yashwantbalaji.com",
    GTP_CC_RP_ID: "team.gametimepicks.yashwantbalaji.com", GH_DISPATCH_TOKEN: `github_pat_${secret}`, GH_OPS_OWNER: "o", GH_OPS_REPO: "gtp-ops",
    CRON_SECRET: secret.repeat(2), OPENAI_API_KEY: secret, GH_PUBLISHER_WORKFLOW: "cc-publisher.yml",
  };
  const rows = checkEnv("vercel", env, { staging: true });
  assert.ok(!JSON.stringify(rows).includes(secret), "no value is ever echoed");
  const fail = rows.filter((r) => r.level === "FAIL").map((r) => r.name).sort();
  assert.deepEqual(fail, ["BLOB_STORE_ID", "DATABASE_URL", "GH_PUBLISHER_WORKFLOW", "OPENAI_API_KEY"]);
  const ok = checkEnv("vercel", { ...env, DATABASE_URL: env.DATABASE_URL.replace("gtp_cc_owner", "gtp_cc_app"), OPENAI_API_KEY: "", GH_PUBLISHER_WORKFLOW: "", BLOB_STORE_ID: "store_1" }, { staging: true });
  assert.deepEqual(ok.filter((r) => r.level === "FAIL"), []);
});

/**
 * Mac → hosted cutover on the real Oct 28 NBA slate, with a mocked X (never the network): the ledger sync copies
 * every record and once-only claim; only ONE host can send live at a time; a host can hand publishing away but never
 * take it; a post one host sent is never sent again by the other; and the rollback works the same way back.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createXOAuth, createMemoryStateStore, X_SCOPES, X_TOKEN_URL } from "../publishers/x-oauth.mjs";
import { createMemoryVault, SECRET } from "../publishers/token-vault.mjs";
import { X_MEDIA_UPLOAD_URL, X_CREATE_POST_URL } from "../publishers/x-api.mjs";
import { liveAuthorizationText, handOffText } from "../orchestrator/publish-flow.mjs";
import { createFileStore } from "../ledger/store.mjs";
import { pglite } from "../ledger/pg-adapters.mjs";
import { createSqlStore } from "../ledger/sql-store.mjs";
import { readSql, readFile, planSync, verifySync, applyToSql, applyToFile } from "../ledger/ledger-sync.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { gitDataSource } from "../recap/multisport-facts.mjs";
import { REPO_ROOT } from "../lib/util.mjs";
import { SOCIAL_TEMPLATE, ASSET_MANIFEST } from "../render/social-v2.mjs";
import { FOUNDER, tempDir } from "./helpers.mjs";
import { seedApprovedCalendar, calendarFixture } from "./queue-fixtures.mjs";

const SLATE = "40a79bf98b6c"; // origin/main 2026-10-28 12:06 PM ET: the Oct 28 NBA lane (12 games)
const hasSlate = (() => { try { execFileSync("git", ["cat-file", "-e", `${SLATE}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" }); return true; } catch { return false; } })();

/** A fake X shared by both hosts: every request either host makes lands in one list. */
function fakeX() {
  const calls = [];
  let n = 0;
  const fetch = async (url) => {
    calls.push(String(url));
    const body = url === X_TOKEN_URL ? { token_type: "bearer", access_token: `AT-${++n}`, refresh_token: `RT-${n}`, expires_in: 7200, scope: X_SCOPES.join(" ") }
      : url === X_MEDIA_UPLOAD_URL ? { data: { id: `M${calls.length}` } }
      : url === X_CREATE_POST_URL ? { data: { id: `21160000000000000${String(calls.length).padStart(2, "0")}` } } : {};
    return new Response(JSON.stringify(body), { status: url === X_CREATE_POST_URL ? 201 : 200, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls, posts: () => calls.filter((u) => u === X_CREATE_POST_URL).length };
}
async function connect(oauth, binding) {
  const st = new URL((await oauth.start({ binding })).authorizeUrl).searchParams.get("state");
  await oauth.receive({ state: st, code: "code-abcdefghij" });
  assert.ok((await oauth.finish({ state: st, binding })).ok);
}

test("cutover: one live publisher at a time, claims travel with the ledger, no post is sent twice, rollback works", { skip: hasSlate ? false : "slate commit missing", timeout: 600_000 }, async () => {
  const dir = tempDir("gtp-cc-cutover-");
  const t = "2026-10-28T16:30:00.000Z";
  const clock = () => t;
  const x = fakeX();
  const src = gitDataSource(REPO_ROOT, SLATE);
  const fresh = async () => ({ ok: true, detail: "test refresh" });

  // ── the Mac: today's queue, design + two game posts approved, live publishing authorized ──────────────────────
  const files = createFileStore({ dir: path.join(dir, "ledger"), clock });
  seedApprovedCalendar(files, { ...calendarFixture(), slots: [] });
  const localOauth = createXOAuth({ vault: createMemoryVault({ [SECRET.clientId]: "client-abc" }), states: createMemoryStateStore(), redirectUri: "http://127.0.0.1:4190/oauth/x/callback", clock, fetch: x.fetch });
  const local = createOrchestrator({ store: files, clock, outDir: dir, queueRender: true, calendarDataSource: src, env: { GTP_CC_X_HANDLE: "GameTimePicksHQ" }, publishing: { oauth: localOauth, refreshData: fresh, fetch: x.fetch } });
  await local.handleCommand("Team, prepare today's content queue", FOUNDER);
  assert.ok(local.approveDesign({ template: SOCIAL_TEMPLATE, assetManifest: ASSET_MANIFEST }, FOUNDER).ok);
  const games = local.state().posts.filter((p) => p.package.kind === "nba-game" && p.lifecycle !== "superseded").sort((a, b) => a.package.tipUtc.localeCompare(b.package.tipUtc));
  const [A, B, C] = games;
  for (const g of [A, B, C]) assert.ok((await local.decide({ decisionId: g.decisionId, verdict: "approve", captionId: "A", digest: g.options.find((o) => o.captionId === "A").digest }, FOUNDER)).ok);
  await connect(localOauth, "local-console");
  assert.ok((await local.publishing.setPolicy({ mode: "live", capUsd: 5, authorization: liveAuthorizationText(5) }, FOUNDER)).ok);
  assert.equal((await local.publishing.publishNow({ decisionId: A.decisionId, live: true }, FOUNDER)).state, "PUBLISHED", "the Mac sends post A");
  assert.equal(x.posts(), 1);

  // ── migration: Mac → hosted database ───────────────────────────────────────────────────────────────────────────
  const db = await pglite();
  const sql = createSqlStore({ db, clock });
  await sql.migrate();
  const sync = async (dir) => {
    const [from, to] = dir === "to-hosted" ? [readFile(files), await readSql(db)] : [await readSql(db), readFile(files)];
    const plan = planSync(from, to);
    assert.deepEqual([plan.conflicts, plan.badIds], [[], []]);
    dir === "to-hosted" ? await applyToSql(db, plan) : applyToFile(files, plan);
    const v = verifySync(from, dir === "to-hosted" ? await readSql(db) : readFile(files));
    assert.ok(v.ok, JSON.stringify(v));
    return plan;
  };
  assert.ok((await sync("to-hosted")).claims.length > 0, "the once-only claims are copied");
  const hostedOauth = createXOAuth({ vault: createMemoryVault({ [SECRET.clientId]: "client-abc" }), states: createMemoryStateStore(), redirectUri: "https://team.gametimepicks.yashwantbalaji.com/oauth/x/callback", clock, fetch: x.fetch });
  await connect(hostedOauth, "hosted-session");
  /** One hosted request, as the worker runs it: a fresh session over the database, flushed at the end. */
  const hosted = async (fn) => {
    const session = await sql.open();
    const o = createOrchestrator({ store: session, clock, outDir: dir, queueRender: true, calendarDataSource: src, hosted: true, execution: "jobs", env: { GTP_CC_X_HANDLE: "GameTimePicksHQ" }, publishing: { oauth: hostedOauth, refreshData: fresh, fetch: x.fetch } });
    const r = await fn(o);
    await session.flush();
    return r;
  };

  // the hosted copy has the same live policy, but it is not the publisher
  assert.deepEqual((await hosted((o) => o.publishing.state())).publisherHost, { self: "hosted", active: "local", generation: 0 });
  assert.equal((await hosted((o) => o.publishing.publishNow({ decisionId: B.decisionId, live: true }, FOUNDER))).code, "OTHER_PUBLISHER_HOST");
  assert.equal((await hosted((o) => o.publishing.setPublisherHost({ to: "local", confirmation: handOffText("local") }, FOUNDER))).code, "NOT_ACTIVE_HOST", "an inactive host has nothing to hand off");
  // a host can never take publishing (nor hand to itself): only the active one hands it away
  assert.equal((await hosted((o) => o.publishing.setPublisherHost({ to: "hosted", confirmation: handOffText("hosted") }, FOUNDER))).code, "INVALID_REQUEST");
  assert.equal(x.posts(), 1, "nothing sent by the inactive host");

  // ── cutover: the Mac hands off (exact words, founder only), then stops sending at once ───────────────────────────
  assert.equal(local.publishing.setPublisherHost({ to: "hosted", confirmation: "yes" }, FOUNDER).code, "AUTHORIZATION_TEXT");
  assert.equal(local.publishing.setPublisherHost({ to: "hosted", confirmation: handOffText("hosted") }, { role: "approver", id: "c1" }).code, "NOT_FOUNDER");
  assert.ok(local.publishing.setPublisherHost({ to: "hosted", confirmation: handOffText("hosted") }, FOUNDER).ok);
  assert.equal((await local.publishing.publishNow({ decisionId: B.decisionId, live: true }, FOUNDER)).code, "OTHER_PUBLISHER_HOST", "the Mac no longer sends");
  assert.equal(local.publishing.setPublisherHost({ to: "hosted", confirmation: handOffText("hosted") }, FOUNDER).code, "NOT_ACTIVE_HOST", "handed off once; can't take it back from here");
  assert.equal((await hosted((o) => o.publishing.publishNow({ decisionId: B.decisionId, live: true }, FOUNDER))).code, "OTHER_PUBLISHER_HOST", "between hand-off and re-sync, neither host sends");

  await sync("to-hosted");
  assert.deepEqual((await hosted((o) => o.publishing.state())).publisherHost, { self: "hosted", active: "hosted", generation: 1 });
  assert.equal((await hosted((o) => o.publishing.publishNow({ decisionId: A.decisionId, live: true }, FOUNDER))).code, "ALREADY_PUBLISHED", "a post the Mac sent is never sent again");
  assert.equal((await hosted((o) => o.publishing.publishNow({ decisionId: B.decisionId, live: true }, FOUNDER))).state, "PUBLISHED", "the hosted publisher sends post B");
  assert.equal(x.posts(), 2);

  // ── rollback: hosted hands back; after the reverse sync the Mac sees B's receipt and refuses to resend it ─────────
  assert.ok((await hosted((o) => o.publishing.setPublisherHost({ to: "local", confirmation: handOffText("local") }, FOUNDER))).ok);
  const rc = await hosted((o) => o.publishing.publishNow({ decisionId: C.decisionId, live: true }, FOUNDER));
  assert.equal(rc.code, "OTHER_PUBLISHER_HOST", "handed back: hosted stops at once");
  await sync("to-local");
  assert.deepEqual((await local.publishing.state()).publisherHost, { self: "local", active: "local", generation: 2 });
  assert.equal(local.state().posts.find((p) => p.decisionId === B.decisionId).lifecycle, "published");
  assert.equal((await local.publishing.publishNow({ decisionId: B.decisionId, live: true }, FOUNDER)).code, "ALREADY_PUBLISHED");
  assert.equal((await local.publishing.publishNow({ decisionId: C.decisionId, live: true }, FOUNDER)).state, "PUBLISHED", "the Mac publishes again after the rollback");
  assert.equal(x.posts(), 3, "three posts, each sent exactly once, across both hosts");
  await db.close();
});

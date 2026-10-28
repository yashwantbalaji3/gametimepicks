/**
 * X Publisher V1: OAuth 2.0 + PKCE (state, binding, single use, refresh rotation, no token leaks), the X API adapter
 * (two images then one post; NOT_SENT vs UNKNOWN), and the publishing gate end to end on the real Oct 28 NBA slate:
 * combined game posts, scheduling 45 minutes before tip, dry run, pause, missed windows, fingerprints, re-checks,
 * live publishing with a mocked X (never the network), duplicate protection, reconciliation and roles.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createXOAuth, createMemoryStateStore, X_SCOPES, X_TOKEN_URL, X_AUTHORIZE_URL } from "../publishers/x-oauth.mjs";
import { createMemoryVault, SECRET } from "../publishers/token-vault.mjs";
import { createXPublisher, X_MEDIA_UPLOAD_URL, X_CREATE_POST_URL } from "../publishers/x-api.mjs";
import { liveAuthorizationText } from "../orchestrator/publish-flow.mjs";
import { xLength } from "../contracts/post-queue.mjs";
import { createFileStore } from "../ledger/store.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { gitDataSource } from "../recap/multisport-facts.mjs";
import { REPO_ROOT, sha256 } from "../lib/util.mjs";
import { SOCIAL_TEMPLATE, ASSET_MANIFEST } from "../render/social-v2.mjs";
import { FOUNDER, STRANGER, tempDir } from "./helpers.mjs";
import { seedApprovedCalendar, calendarFixture } from "./queue-fixtures.mjs";

const SLATE = "40a79bf98b6c"; // origin/main 2026-10-28 12:06 PM ET: the Oct 28 NBA lane (12 games)
const hasSlate = (() => { try { execFileSync("git", ["cat-file", "-e", `${SLATE}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" }); return true; } catch { return false; } })();
const REDIRECT = "http://127.0.0.1:4190/oauth/x/callback";

/** A fake X: records every request; answers per the handler. Never touches the network. */
function fakeX(handler) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body });
    const r = await handler(String(url), init, calls.length);
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return { fetch: f, calls };
}
const tokenAnswer = (n = 1) => ({ status: 200, body: { token_type: "bearer", access_token: `AT-${n}-secret`, refresh_token: `RT-${n}-secret`, expires_in: 7200, scope: X_SCOPES.join(" ") } });

// ── OAuth ──────────────────────────────────────────────────────────────────────────────────────────────────────
test("OAuth: authorize URL (exact callback, S256, scopes), state single-use + bound to the session, tokens only in the vault", async () => {
  let now = "2026-10-28T18:00:00.000Z";
  const vault = createMemoryVault({ [SECRET.clientId]: "client-abc" });
  const x = fakeX((url) => (url === X_TOKEN_URL ? tokenAnswer(1) : { status: 404 }));
  const oauth = createXOAuth({ vault, states: createMemoryStateStore(), redirectUri: REDIRECT, clock: () => now, fetch: x.fetch });

  assert.equal((await oauth.start({ binding: null })).code, "NOT_AUTHENTICATED");
  const s = await oauth.start({ binding: "session-A" });
  const u = new URL(s.authorizeUrl);
  assert.equal(`${u.origin}${u.pathname}`, X_AUTHORIZE_URL);
  assert.equal(u.searchParams.get("redirect_uri"), REDIRECT);
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.deepEqual(u.searchParams.get("scope").split(" "), [...X_SCOPES]);
  assert.match(s.authorizeUrl, /scope=tweet\.read%20tweet\.write/, "space-separated scopes encoded as %20");
  const state = u.searchParams.get("state");

  assert.equal((await oauth.receive({ state: "x".repeat(43), code: "abcdefghijk" })).code, "STATE_INVALID", "an unknown state");
  assert.equal((await oauth.receive({ state: "<script>", code: "abcdefghijk" })).code, "STATE_INVALID");
  assert.ok((await oauth.receive({ state, code: "the-code-1234567" })).ok);
  assert.equal((await oauth.receive({ state, code: "another-code-123" })).code, "STATE_USED", "a code is attached once");
  assert.equal((await oauth.finish({ state, binding: "session-B" })).code, "BINDING_MISMATCH", "another session can't finish it");
  assert.equal((await oauth.finish({ state, binding: "session-A" })).code, "STATE_INVALID", "a failed finish consumed the state: start again");

  const s2 = await oauth.start({ binding: "session-A" });
  const st2 = new URL(s2.authorizeUrl).searchParams.get("state");
  const challenge = new URL(s2.authorizeUrl).searchParams.get("code_challenge");
  await oauth.receive({ state: st2, code: "the-code-7654321" });
  const done = await oauth.finish({ state: st2, binding: "session-A" });
  assert.ok(done.ok, JSON.stringify(done));
  assert.deepEqual(done.missingScopes, []);
  assert.doesNotMatch(JSON.stringify(done), /AT-1|RT-1/, "no token is returned");
  const body = new URLSearchParams(x.calls.at(-1).body);
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("redirect_uri"), REDIRECT);
  assert.equal(body.get("client_id"), "client-abc", "public client: client_id in the body");
  assert.equal(x.calls.at(-1).headers.Authorization, undefined, "public client: no secret is sent");
  assert.equal(crypto.createHash("sha256").update(body.get("code_verifier")).digest("base64url"), challenge, "the PKCE verifier matches the challenge");
  assert.equal((await oauth.finish({ state: st2, binding: "session-A" })).code, "STATE_INVALID", "single use");
  const status = await oauth.status();
  assert.equal(status.connected, true);
  assert.doesNotMatch(JSON.stringify(status), /AT-1|RT-1/);

  // expired state
  const s3 = await oauth.start({ binding: "session-A" });
  now = "2026-10-28T18:20:00.000Z";
  assert.equal((await oauth.receive({ state: new URL(s3.authorizeUrl).searchParams.get("state"), code: "late-code-12345" })).code, "STATE_INVALID");
});

test("OAuth: refresh before expiry stores the rotated refresh token; a confidential app uses HTTP Basic", async () => {
  let now = "2026-10-28T18:00:00.000Z";
  const vault = createMemoryVault({ [SECRET.clientId]: "client-abc", [SECRET.clientSecret]: "shh-secret" });
  let n = 0;
  const x = fakeX((url) => (url === X_TOKEN_URL ? tokenAnswer(++n) : { status: 404 }));
  const oauth = createXOAuth({ vault, states: createMemoryStateStore(), redirectUri: REDIRECT, clock: () => now, fetch: x.fetch });
  const s = await oauth.start({ binding: "b" });
  const st = new URL(s.authorizeUrl).searchParams.get("state");
  await oauth.receive({ state: st, code: "code-abcdefghij" });
  assert.ok((await oauth.finish({ state: st, binding: "b" })).ok);
  assert.match(x.calls[0].headers.Authorization, /^Basic /);
  assert.equal(new URLSearchParams(x.calls[0].body).get("client_id"), null, "confidential: no client_id in the body");
  assert.equal((await oauth.accessToken()).token, "AT-1-secret");
  now = "2026-10-28T19:59:00.000Z"; // inside the 2-minute early window
  assert.equal((await oauth.accessToken()).token, "AT-2-secret");
  assert.equal(new URLSearchParams(x.calls[1].body).get("refresh_token"), "RT-1-secret");
  assert.equal(JSON.parse(await vault.get(SECRET.tokens)).refresh_token, "RT-2-secret", "rotated refresh token stored");
});

// ── X API adapter ──────────────────────────────────────────────────────────────────────────────────────────────
function mediaFixture() {
  const dir = tempDir("gtp-x-media-");
  const files = ["a.png", "b.png"].map((f, i) => { const b = Buffer.from(`png-bytes-${i}`); fs.writeFileSync(path.join(dir, f), b); return { file: f, sha256: sha256(b) }; });
  return { dir, files, readMedia: (f) => fs.readFileSync(path.join(dir, f)) };
}
const connected = { accessToken: async () => ({ ok: true, token: "AT-live" }), status: async () => ({ connected: true }) };

test("X adapter: dry run sends nothing; live uploads both images in order, then one post with both media ids", async () => {
  const m = mediaFixture();
  const x = fakeX((url, init, n) => (url === X_MEDIA_UPLOAD_URL ? { status: 200, body: { data: { id: `M${n}` } } } : url === X_CREATE_POST_URL ? { status: 201, body: { data: { id: "1999", text: "t" } } } : { status: 404 }));
  const dry = await createXPublisher({ mode: "dry-run", fetch: x.fetch, readMedia: m.readMedia }).publish({ text: "hello", media: m.files });
  assert.equal(dry.state, "DRY_RUN");
  assert.equal(x.calls.length, 0, "a dry run makes no request");
  assert.equal(dry.requests.length, 3);
  const live = await createXPublisher({ mode: "live", oauth: connected, fetch: x.fetch, readMedia: m.readMedia }).publish({ text: "hello", media: m.files });
  assert.equal(live.state, "PUBLISHED");
  assert.equal(live.canonicalUrl, "https://x.com/i/status/1999");
  assert.deepEqual(x.calls.map((c) => c.url), [X_MEDIA_UPLOAD_URL, X_MEDIA_UPLOAD_URL, X_CREATE_POST_URL]);
  assert.equal(x.calls[0].body.get("media_category"), "tweet_image");
  assert.deepEqual(JSON.parse(x.calls[2].body), { text: "hello", media: { media_ids: ["M1", "M2"] } });
  assert.equal(x.calls[2].headers.Authorization, "Bearer AT-live");
});

test("X adapter: failures are classified — NOT_SENT may be retried, UNKNOWN never is; a changed image is refused", async () => {
  const m = mediaFixture();
  const run = (handler) => createXPublisher({ mode: "live", oauth: connected, fetch: fakeX(handler).fetch, readMedia: m.readMedia }).publish({ text: "hi", media: m.files }).then(() => null, (e) => e);
  assert.deepEqual(((e) => [e.outcome, e.code])(await run(() => ({ status: 402, body: { title: "CreditsDepleted" } }))), ["NOT_SENT", "X_CREDITS_REQUIRED"]);
  assert.deepEqual(((e) => [e.outcome, e.code])(await run((u) => (u === X_MEDIA_UPLOAD_URL ? { body: { data: { id: "M" } } } : { status: 403, body: { detail: "duplicate content" } }))), ["NOT_SENT", "CREATE_POST_REFUSED"]);
  assert.deepEqual(((e) => [e.outcome, e.code])(await run((u) => (u === X_MEDIA_UPLOAD_URL ? { body: { data: { id: "M" } } } : new Error("socket hang up")))), ["UNKNOWN", "CREATE_POST_NO_ANSWER"]);
  assert.deepEqual(((e) => [e.outcome, e.code])(await run((u) => (u === X_MEDIA_UPLOAD_URL ? { body: { data: { id: "M" } } } : { status: 503 }))), ["UNKNOWN", "CREATE_POST_UNCLEAR"]);
  fs.writeFileSync(path.join(m.dir, "b.png"), "tampered");
  assert.deepEqual(((e) => [e.outcome, e.code])(await run(() => ({ status: 500 }))), ["NOT_SENT", "MEDIA_INVALID"]);
});

// ── the publishing gate on the real Oct 28 NBA slate ──────────────────────────────────────────────────────────
const MIA = "401909881"; // MIA @ ATL, tip 23:00Z
let shared = null;
async function slate() {
  if (shared) return shared;
  const dir = tempDir("gtp-cc-publish-");
  let t = "2026-10-28T16:30:00.000Z";
  const clock = () => t;
  const store = createFileStore({ dir: path.join(dir, "ledger"), clock });
  seedApprovedCalendar(store, { ...calendarFixture(), slots: [] });
  let x = fakeX(() => ({ status: 500 }));
  const vault = createMemoryVault({ [SECRET.clientId]: "client-abc" });
  const oauth = createXOAuth({ vault, states: createMemoryStateStore(), redirectUri: REDIRECT, clock, fetch: (...a) => x.fetch(...a) });
  let fresh = { ok: true, detail: "test refresh" };
  // the published data as the gate sees it; `patch` stands in for a later lane version (injury, changed lines)
  const real = gitDataSource(REPO_ROOT, SLATE);
  let patch = null;
  const src = { ...real, read: (p) => { const raw = real.read(p); return patch && raw && p.endsWith("experimental-public/2026-10-28.json") ? JSON.stringify(patch(JSON.parse(raw))) : raw; } };
  const o = createOrchestrator({
    store, clock, outDir: dir, queueRender: true, calendarDataSource: src, env: { GTP_CC_X_HANDLE: "GameTimePicksHQ" },
    publishing: { oauth, refreshData: async () => fresh, fetch: (...a) => x.fetch(...a) },
  });
  const r = await o.handleCommand("Team, prepare today's content queue", FOUNDER);
  shared = { o, dir, store, vault, oauth, commandId: r.commandId, setNow: (v) => { t = v; }, setX: (h) => { x = fakeX(h); return x; }, setFresh: (v) => { fresh = v; }, setPatch: (f) => { patch = f; } };
  return shared;
}
const gamePost = (h, ev = MIA) => h.o.state().posts.find((p) => p.package.postId === `2026-10-28:NBA:game:${ev}@v2` && p.lifecycle !== "superseded");
const approve = (h, p) => h.o.decide({ decisionId: p.decisionId, verdict: "approve", captionId: "A", digest: p.options.find((x) => x.captionId === "A").digest }, FOUNDER);

test("NBA game posts: one per game, both graphics bound in the fingerprint, featured players, 45 minutes before tip", { skip: hasSlate ? false : "slate commit missing", timeout: 600_000 }, async () => {
  const h = await slate();
  const games = h.o.state().posts.filter((p) => p.package.kind === "nba-game");
  assert.equal(games.length, 12);
  const g = gamePost(h);
  assert.equal(g.package.status, "READY", g.package.reasons.join("; "));
  assert.equal(g.package.mediaSet.length, 2);
  assert.deepEqual(g.package.mediaSet.map((m) => m.format), ["nba-pregame", "nba-players"]);
  assert.equal(g.package.suggestedPublishAt, "2026-10-28T22:15:00.000Z");
  const a = g.options.find((x) => x.captionId === "A");
  assert.ok(a.publishBundle.mediaSetSha256, "both images are in what is approved");
  assert.match(a.text, /Our predicted winner: the Hawks\./);
  assert.match(a.text, /🔥 Bam Adebayo: 14\.3 PTS \| 8\.8 REB \| 3\.5 AST\n🔥 Jalen Johnson: 14\.2 PTS \| 6\.5 REB \| 3\.7 AST/);
  assert.doesNotMatch(games.map((p) => p.options.map((x) => x.text).join(" ")).join(" "), /%|odds|bet/i, "no NBA probability, no betting words");
  assert.ok(games.every((p) => p.options.every((x) => x.check.ok && xLength(x.text) <= 280)));
  const q = h.o.state().commands.find((c) => c.commandId === h.commandId).contributions.find((c) => c.artifactType === "post-queue").artifact;
  assert.ok(["points", "rebounds", "assists"].every((s) => q.skipped.some((k) => k.opportunity === `Top 5 ${s}` && /held: no official published NBA Top Board/.test(k.reason))), "Top 5 NBA held, not derived");
});

test("publishing gate: approval + design required, schedule rules, dry run at the due time, pause, roles", { skip: hasSlate ? false : "slate commit missing", timeout: 600_000 }, async () => {
  const h = await slate();
  const P = h.o.publishing;
  let g = gamePost(h);
  assert.equal(P.schedule({ decisionId: g.decisionId }, FOUNDER).code, "NOT_APPROVED");
  assert.equal((await approve(h, g)).code, "DESIGN_NOT_APPROVED");
  assert.ok(h.o.approveDesign({ template: SOCIAL_TEMPLATE, assetManifest: ASSET_MANIFEST }, FOUNDER).ok);
  assert.ok((await approve(h, g)).ok);
  g = gamePost(h);

  assert.equal(P.schedule({ decisionId: g.decisionId }, STRANGER).code, "NOT_FOUNDER");
  assert.equal(P.schedule({ decisionId: g.decisionId }, { role: "approver", id: "c1" }).code, "NOT_FOUNDER", "an approver can't publish");
  assert.equal(P.schedule({ decisionId: g.decisionId, at: "2026-10-28T23:00:00Z" }, FOUNDER).code, "AFTER_START");
  const s = P.schedule({ decisionId: g.decisionId }, FOUNDER);
  assert.ok(s.ok, JSON.stringify(s));
  assert.equal(s.job.dueAt, "2026-10-28T22:15:00.000Z");
  assert.equal(P.schedule({ decisionId: g.decisionId }, FOUNDER).code, "ALREADY_SCHEDULED");

  assert.deepEqual((await P.runDue()).ran, [], "not due yet");
  h.setNow("2026-10-28T22:15:30.000Z");
  assert.ok(P.setPaused(true, { role: "approver", id: "c1" }).ok, "anyone who can approve can pause");
  assert.deepEqual((await P.runDue()).ran.map((r) => r.state), ["HELD"]);
  assert.equal(P.setPaused(false, { role: "approver", id: "c1" }).code, "NOT_FOUNDER", "resuming needs publish rights");
  assert.ok(P.setPaused(false, FOUNDER).ok);
  const x = h.setX(() => { throw new Error("a dry run must not call X"); });
  const r = await P.runDue();
  assert.deepEqual(r.ran.map((j) => j.state), ["DRY_RUN"]);
  assert.equal(x.calls.length, 0);
  const job = P.jobs().find((j) => j.jobId === s.job.jobId);
  assert.equal(job.status, "dry_run");
  const res = job.results.at(-1);
  assert.equal(res.requests.filter((q) => q.url.endsWith("/2/media/upload")).length, 2);
  assert.match(JSON.stringify(res.requests.at(-1).body), /Bam Adebayo: 14\.3 PTS/);
  assert.ok(res.wouldCostUsd > 0 && res.wouldCostUsd < 0.1);
  assert.equal(gamePost(h).lifecycle, "approved", "a dry run is not a publication");
  assert.equal(gamePost(h).receipt, null);
  h.setNow("2026-10-28T16:30:00.000Z");
});

test("publishing gate: stale data, changed images, missed windows and data that can't be refreshed are refused", { skip: hasSlate ? false : "slate commit missing", timeout: 600_000 }, async () => {
  const h = await slate();
  const P = h.o.publishing;
  const g = gamePost(h);
  h.setFresh({ ok: false, detail: "git fetch failed" });
  assert.equal((await P.publishNow({ decisionId: g.decisionId }, FOUNDER)).code, "DATA_NOT_REFRESHED");
  h.setFresh({ ok: true });
  // the re-check reads the published lane again: an injured featured player, or a changed stat line, blocks
  const lane = (f) => (j) => ({ ...j, games: j.games.map((x) => (x.providerEventId === MIA ? f(structuredClone(x)) : x)) });
  h.setPatch(lane((x) => { x.players.away.find((p) => p.name === "Bam Adebayo").injuryStatus = "OUT"; return x; }));
  const inj = await P.publishNow({ decisionId: g.decisionId }, FOUNDER);
  assert.equal(inj.code, "VERIFICATION_CHANGED");
  assert.match(inj.detail, /featured player changed/);
  h.setPatch(lane((x) => { x.players.home[0].medians.pts += 1; return x; }));
  assert.match((await P.publishNow({ decisionId: g.decisionId }, FOUNDER)).detail, /stat lines changed/);
  h.setPatch(lane((x) => { x.tipUtc = "2026-10-28T23:30Z"; return x; }));
  assert.match((await P.publishNow({ decisionId: g.decisionId }, FOUNDER)).detail, /tip-off moved/);
  h.setPatch(null);
  const otherGame = gamePost(h, "401909882");
  assert.ok((await approve(h, otherGame)).ok);
  // tamper with one approved image on disk → refused before anything is sent
  const file = path.join(h.dir, "media", gamePost(h, "401909882").package.mediaSet[1].file);
  const keep = fs.readFileSync(file);
  fs.writeFileSync(file, Buffer.concat([keep, Buffer.from("x")]));
  const t1 = await P.publishNow({ decisionId: gamePost(h, "401909882").decisionId }, FOUNDER);
  assert.equal(t1.state, "FAILED_NOT_SENT");
  assert.equal(t1.code, "MEDIA_INVALID");
  fs.writeFileSync(file, keep);
  h.setNow("2026-10-28T23:00:00.000Z");
  const late = await P.publishNow({ decisionId: g.decisionId }, FOUNDER);
  assert.equal(late.state, "MISSED", "never after tip-off");
  assert.ok((await P.state()).alerts.some((a) => a.code === "MISSED"));
  h.setNow("2026-10-28T16:30:00.000Z");
});

test("live: refused until authorized + connected; then one post with both images, a receipt, and never twice", { skip: hasSlate ? false : "slate commit missing", timeout: 600_000 }, async () => {
  const h = await slate();
  const P = h.o.publishing;
  const g = gamePost(h);
  assert.equal((await P.publishNow({ decisionId: g.decisionId, live: true }, FOUNDER)).code, "SPEND_NOT_AUTHORIZED");
  assert.equal((await P.publishNow({ decisionId: g.decisionId, live: true }, { role: "approver", id: "c1" })).code, "NOT_FOUNDER");
  assert.equal((await P.setPolicy({ mode: "live", capUsd: 5, authorization: liveAuthorizationText(5) }, FOUNDER)).code, "X_NOT_CONNECTED");
  // connect through the real OAuth flow against a fake X token endpoint
  h.setX((url) => (url === X_TOKEN_URL ? tokenAnswer(1) : { status: 404 }));
  const st = new URL((await h.oauth.start({ binding: "local-console" })).authorizeUrl).searchParams.get("state");
  await h.oauth.receive({ state: st, code: "code-abcdefghij" });
  assert.ok((await h.oauth.finish({ state: st, binding: "local-console" })).ok);
  assert.equal((await P.setPolicy({ mode: "live", capUsd: 5, authorization: "yes" }, FOUNDER)).code, "AUTHORIZATION_TEXT");
  assert.equal((await P.setPolicy({ mode: "live", capUsd: 500, authorization: liveAuthorizationText(500) }, FOUNDER)).code, "CAP_INVALID");
  assert.equal((await P.setPolicy({ mode: "live", capUsd: 5, authorization: liveAuthorizationText(5) }, { role: "publisher", id: "c2" })).code, "NOT_FOUNDER", "only an administrator sets live mode");
  assert.ok((await P.setPolicy({ mode: "live", capUsd: 5, authorization: liveAuthorizationText(5) }, FOUNDER)).ok);

  const x = h.setX((url, init, n) => (url === X_MEDIA_UPLOAD_URL ? { status: 200, body: { data: { id: `M${n}` } } } : url === X_CREATE_POST_URL ? { status: 201, body: { data: { id: "2115399999999999999" } } } : { status: 404 }));
  const r = await P.publishNow({ decisionId: g.decisionId, live: true }, FOUNDER);
  assert.equal(r.state, "PUBLISHED", JSON.stringify(r));
  assert.deepEqual(x.calls.map((c) => c.url), [X_MEDIA_UPLOAD_URL, X_MEDIA_UPLOAD_URL, X_CREATE_POST_URL]);
  const post = gamePost(h);
  assert.equal(post.lifecycle, "published");
  assert.equal(post.receipt.canonicalUrl, "https://x.com/i/status/2115399999999999999");
  assert.equal(post.receipt.provider, "x-api");
  const again = await P.publishNow({ decisionId: g.decisionId, live: true }, FOUNDER);
  assert.equal(again.code, "ALREADY_PUBLISHED");
  assert.equal(x.calls.length, 3, "nothing sent the second time");
  assert.equal(P.schedule({ decisionId: g.decisionId }, FOUNDER).code, "ALREADY_PUBLISHED");
  assert.ok((await P.state()).spentThisMonthUsd > 0);
});

test("live: an unknown outcome is never retried; reconciling with the X link records the receipt once", { skip: hasSlate ? false : "slate commit missing", timeout: 600_000 }, async () => {
  const h = await slate();
  const P = h.o.publishing;
  const g = gamePost(h, "401909883");
  assert.ok((await approve(h, g)).ok);
  const x = h.setX((url) => (url === X_MEDIA_UPLOAD_URL ? { status: 200, body: { data: { id: "M" } } } : new Error("connection reset")));
  const r = await P.publishNow({ decisionId: g.decisionId, live: true }, FOUNDER);
  assert.equal(r.state, "UNKNOWN");
  const n = x.calls.length;
  assert.equal((await P.publishNow({ decisionId: g.decisionId, live: true }, FOUNDER)).code, "OUTCOME_UNKNOWN");
  assert.equal(x.calls.length, n, "no second send");
  const job = P.jobs().find((j) => j.status === "unknown");
  assert.equal((await P.reconcile({ jobId: job.jobId, url: "https://x.com/GameTimePicksHQ/status/2115300000000000777" }, FOUNDER)).state, "PUBLISHED");
  assert.equal(gamePost(h, "401909883").lifecycle, "published");
  // a definite failure (402: credits) allows a later attempt; the cap is enforced
  const g2 = gamePost(h, "401909884");
  assert.ok((await approve(h, g2)).ok);
  h.setX(() => ({ status: 402, body: { title: "CreditsDepleted" } }));
  const f = await P.publishNow({ decisionId: g2.decisionId, live: true }, FOUNDER);
  assert.equal(f.state, "FAILED_NOT_SENT");
  assert.equal(f.code, "X_CREDITS_REQUIRED");
  assert.ok((await P.setPolicy({ mode: "dry-run" }, FOUNDER)).ok, "turning live off always works");
  assert.equal((await P.state()).mode, "dry-run");
});

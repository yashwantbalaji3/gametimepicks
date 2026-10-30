import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createFileStore } from "../ledger/store.mjs";
import { createResultsAutomation, AUTHORIZATION_TEXT } from "../orchestrator/results-automation.mjs";
import { resultsAccuracy } from "../recap/results-accuracy.mjs";
import { gitDataSource } from "../recap/multisport-facts.mjs";
import { REPO_ROOT } from "../lib/util.mjs";
import { FOUNDER, tempDir } from "./helpers.mjs";

const real = gitDataSource(REPO_ROOT, "d367dd50fac6");
const b = await resultsAccuracy({ src: real, date: "2026-10-28" });
const post = (eventId, favoured, id = eventId) => ({ postId: `p${id}`, receipt: { providerPostId: "99", canonicalUrl: "u" }, package: { kind: "nba-game", eventId, favoured, date: "2026-10-28", title: "t" } });
function rig({ posts, src = real, x = [], fail = null, cap = 5 }) {
  let t = "2026-10-29T12:00:00.000Z";
  const clock = () => t;
  const store = createFileStore({ dir: path.join(tempDir("gtp-ra-"), "ledger"), clock });
  const fetch = async (url, init) => { x.push(JSON.parse(init.body)); if (fail) return fail(); return new Response(JSON.stringify({ data: { id: `${x.length}` } }), { status: 201 }); };
  const a = createResultsAutomation({ store, clock, posts: () => posts, dataSource: () => src, oauth: { accessToken: async () => ({ ok: true, token: "t" }) }, fetch, capUsd: () => cap, mode: () => "live" });
  return { a, store, x, go: (v) => { t = v; } };
}
const on = (a, extra = {}) => { assert.equal(a.authorize(AUTHORIZATION_TEXT, FOUNDER).ok, true); a.setConfig({ enabled: true, sports: { NBA: true, NFL: true }, markets: { winner: true, anytime_td: true }, cooldownMin: 0, ...extra }); };
const win = b.games.find((g) => g.correct), miss = b.games.find((g) => !g.correct), other = b.games.filter((g) => g.correct)[1];

test("records wins and misses once; a post and its alternate count once; a mismatch is an exception, not a result; default sends nothing", async () => {
  const R = rig({ posts: [post(win.eventId, win.predictedWinner), post(win.eventId, win.predictedWinner, "alt"), post(miss.eventId, miss.predictedWinner), post(other.eventId, "XXX"), post("nope", "ATL")] });
  const r = await R.a.tick();
  assert.deepEqual(r, { tracked: 4, recorded: 2, unresolved: 1, exceptions: 1, overturned: 0 });
  assert.equal((await R.a.tick()).recorded, 0);
  assert.deepEqual(await R.a.sendDue(), []);
  assert.equal(R.x.length, 0);
  assert.ok(R.a.state().outcomes.every((o) => o.eligibility === "automation is off"));
});

test("sends standalone once, keeps misses off unless enabled, honours caps, and reply mode needs its own confirmation", async () => {
  const R = rig({ posts: [post(win.eventId, win.predictedWinner), post(miss.eventId, miss.predictedWinner)] });
  await R.a.tick();
  on(R.a);
  assert.equal((await R.a.sendDue()).length, 1, "the win only");
  assert.equal(R.x[0].reply, undefined);
  assert.equal(R.x[0].media, undefined);
  assert.equal((await R.a.sendDue()).length, 0, "once only");
  const S = rig({ posts: [post(win.eventId, win.predictedWinner)] });
  await S.a.tick();
  on(S.a, { mode: "reply" });
  assert.equal((await S.a.sendDue()).length, 0, "reply not confirmed");
  S.a.setConfig({ replyCompliant: true });
  await S.a.sendDue();
  assert.equal(S.x[0].reply.in_reply_to_tweet_id, "99");
  const C = rig({ posts: [post(win.eventId, win.predictedWinner)], cap: 0.01 });
  await C.a.tick(); on(C.a);
  assert.equal((await C.a.sendDue()).length, 0);
  assert.equal(C.a.state().outcomes[0].eligibility, "spend cap reached");
});

test("failures: a refused send retries then stops; an unclear one is never retried", async () => {
  const R = rig({ posts: [post(win.eventId, win.predictedWinner)], fail: () => new Response("{}", { status: 429 }) });
  await R.a.tick(); on(R.a, { maxAttempts: 2 });
  assert.equal((await R.a.sendDue())[0].state, "RETRY");
  assert.equal((await R.a.sendDue())[0].state, "FAILED");
  assert.equal((await R.a.sendDue()).length, 0);
  const U = rig({ posts: [post(win.eventId, win.predictedWinner)], fail: () => new Response("{}", { status: 500 }) });
  await U.a.tick(); on(U.a);
  assert.equal((await U.a.sendDue())[0].state, "UNKNOWN");
  assert.equal((await U.a.sendDue()).length, 0);
});

const tdPost = { postId: "td", receipt: { providerPostId: "7", canonicalUrl: "u" }, package: { kind: "td-top3", eventId: "1", candidatesKey: "a:50%|b:40%", date: "2026-10-29", title: "t" } };
const tdSrc = (rows) => ({ commit: "x", read: (p) => (p.includes("prop-settlement") ? JSON.stringify({ rows }) : null) });
const row = (id, o) => ({ settlementId: `1:${id}:anytime_td`, playerName: id.toUpperCase(), finality: "CANONICAL", measurementState: "OBSERVED", lineResult: "YES", ...o });

test("anytime TD: provisional waits, canonical settles, no measurement voids, a reversal cancels an unsent post and flags a sent one", async () => {
  let rows = [row("a", { finality: "PROVISIONAL" }), row("b", { measurementState: "NOT_OBSERVED", noMeasurementReason: "DID_NOT_PLAY" })];
  const src = { commit: "x", read: () => JSON.stringify({ rows }) };
  const R = rig({ posts: [tdPost], src });
  assert.deepEqual([(await R.a.tick()).unresolved, R.a.state().totals.VOID], [1, 1]);
  rows = [row("a", {}), rows[1]];
  await R.a.tick();
  assert.match(R.a.state().outcomes[0].text, /A/);
  on(R.a); await R.a.sendDue();
  assert.equal(R.x.length, 1);
  rows = [row("a", { lineResult: "NO" }), rows[1]];
  assert.equal((await R.a.tick()).overturned, 1);
  assert.equal(R.a.state().outcomes.find((o) => o.key.endsWith("|a")).sendState, "SENT_NEEDS_CORRECTION");
  const U = rig({ posts: [tdPost], src: tdSrc([row("a", {})]) });
  await U.a.tick();
  U.a; const flip = rig({ posts: [tdPost], src: tdSrc([]) }); assert.equal((await flip.a.tick()).unresolved, 2);
});

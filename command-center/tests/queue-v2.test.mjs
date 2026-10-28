/**
 * V2.1 queue integration: standing NFL/NBA formats, the design-approval gate, availability confirmation for TD posts,
 * re-checks at approval, approval invalidation when content changes, held Top 5 families, NBA capability limits, and
 * template + asset-manifest versions in every fingerprint. Reads the pinned data commit (skipped if absent).
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createFileStore } from "../ledger/store.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { gitDataSource } from "../recap/multisport-facts.mjs";
import { REPO_ROOT } from "../lib/util.mjs";
import { SOCIAL_TEMPLATE, ASSET_MANIFEST } from "../render/social-v2.mjs";
import { FOUNDER, STRANGER, tempDir } from "./helpers.mjs";
import { QUEUE_PINNED, QUEUE_NOW, X_URL, hasPinned, seedApprovedCalendar, calendarFixture } from "./queue-fixtures.mjs";

const skip = hasPinned ? false : `pinned data commit ${QUEUE_PINNED.slice(0, 12)} is not in this clone`;

function v2Orchestrator({ now = QUEUE_NOW, window = null, render = false } = {}) {
  const dir = tempDir("gtp-cc-queue-v2-");
  let t = now;
  const clock = () => t;
  const store = createFileStore({ dir: path.join(dir, "ledger"), clock });
  const cal = calendarFixture();
  seedApprovedCalendar(store, window ? { ...cal, window: { ...cal.window, ...window }, slots: [] } : cal);
  const make = (r) => createOrchestrator({ store, clock, outDir: dir, queueRender: r, calendarDataSource: gitDataSource(REPO_ROOT, QUEUE_PINNED), env: { GTP_CC_X_HANDLE: "GameTimePicks" } });
  return { o: make(render), store, dir, setNow: (x) => { t = x; }, remake: (r) => make(r) };
}
const queueOf = (o, commandId) => o.state().commands.find((c) => c.commandId === commandId).contributions.find((c) => c.artifactType === "post-queue").artifact;
const postsOf = (o, commandId) => o.state().posts.filter((p) => p.commandId === commandId);

test("V2.1 TNF queue: CAR @ GB prediction READY, Top 3 TD needs availability, versions in every fingerprint", { skip }, async () => {
  const { o } = v2Orchestrator();
  const r = await o.handleCommand("Team, prepare tomorrow's content queue", FOUNDER);
  const q = queueOf(o, r.commandId);
  const pre = q.packages.find((p) => p.postId === "2026-10-29:NFL:pregame:401873023@v2");
  assert.equal(pre.status, "READY", pre.reasons.join("; "));
  assert.equal(pre.template, SOCIAL_TEMPLATE);
  assert.equal(pre.assetManifest, ASSET_MANIFEST);
  assert.ok(pre.captions.every((c) => c.check.ok), JSON.stringify(pre.captions.map((c) => c.check)));
  assert.ok(pre.captions.every((c) => c.publishBundle.template === SOCIAL_TEMPLATE && c.publishBundle.assetManifest === ASSET_MANIFEST));
  assert.match(pre.captions[0].text, /GameTimePicks Prediction · Panthers at Packers.*Predicted Winner: Green Bay Packers, 63\.8% Win Probability/);
  assert.doesNotMatch(pre.captions.map((c) => c.text).join(" "), /projected|total|33\.5/i, "no projections, no opponent probability");
  const td = q.packages.find((p) => p.kind === "td-top3");
  assert.equal(td.status, "NEEDS_VERIFICATION");
  assert.match(td.captions[0].text, /Chuba Hubbard 54\.9%.*Josh Jacobs 46\.4%.*Christian Watson 39\.5%/);
  assert.ok(q.skipped.some((s) => /Top 5 boards/.test(s.opportunity) && /no frozen Top Board/.test(s.reason)), "no board yet: said, not invented");
  assert.ok(q.skipped.some((s) => s.sport === "NBA" && /not published at the data commit/.test(s.reason)));
});

test("V2.1 approvals: design gate first, availability confirmation for TD, re-check at approval, invalidation on change", { skip }, async () => {
  const h = v2Orchestrator();
  const r = await h.o.handleCommand("Team, prepare tomorrow's content queue", FOUNDER);
  const pre = postsOf(h.o, r.commandId).find((p) => p.package.kind === "pregame-forecast");
  const td = postsOf(h.o, r.commandId).find((p) => p.package.kind === "td-top3");
  const approve = (p, extra = {}) => h.o.decide({ decisionId: p.decisionId, verdict: "approve", captionId: "A", digest: p.options[0].digest, ...extra }, FOUNDER);
  assert.equal((await approve(pre)).code, "DESIGN_NOT_APPROVED", "evidence-ready is not design-approved");
  assert.equal(h.o.approveDesign({ template: SOCIAL_TEMPLATE, assetManifest: ASSET_MANIFEST }, STRANGER).code, "NOT_FOUNDER");
  assert.equal(h.o.approveDesign({ template: "gtp-social@9", assetManifest: ASSET_MANIFEST }, FOUNDER).code, "UNKNOWN_DESIGN");
  assert.ok(h.o.approveDesign({ template: SOCIAL_TEMPLATE, assetManifest: ASSET_MANIFEST }, FOUNDER).ok);
  assert.equal(h.o.state().design.approved, true);
  assert.equal(h.o.state().posts.find((p) => p.decisionId === pre.decisionId).lifecycle, "drafted", "design approval approves no post");
  assert.equal((await approve(td)).code, "AVAILABILITY_NOT_CONFIRMED");
  assert.ok((await approve(td, { availabilityConfirmed: true })).ok);
  h.setNow("2026-10-28T15:30:00.000Z"); // the pinned data is now 2.5 h old: the freeze-time re-check refuses
  assert.equal((await approve(pre)).code, "VERIFICATION_CHANGED");
  h.setNow("2026-10-28T13:40:00.000Z");
  assert.ok((await approve(pre)).ok);

  // Rebuild with graphics: the approved package's media changes, so its approval is invalidated and a new version proposed.
  const o2 = h.remake(true);
  const r2 = await o2.handleCommand("Team, prepare tomorrow's content queue with graphics", FOUNDER);
  const old = o2.state().posts.find((p) => p.decisionId === pre.decisionId);
  assert.equal(old.lifecycle, "invalidated");
  assert.equal(o2.recordPost({ decisionId: pre.decisionId, action: "publish", url: X_URL }, FOUNDER).code, "APPROVAL_INVALIDATED");
  const fresh = postsOf(o2, r2.commandId).find((p) => p.package.kind === "pregame-forecast");
  assert.equal(fresh.lifecycle, "drafted");
  assert.equal(fresh.package.media.width, 1080);
  assert.equal(fresh.package.media.height, 1350);
  assert.notEqual(fresh.options[0].digest, pre.options[0].digest);
  // …and the replacement is approvable (a new approval generation), exactly once
  assert.ok((await o2.decide({ decisionId: fresh.decisionId, verdict: "approve", captionId: "A", digest: fresh.options[0].digest }, FOUNDER)).ok);
  // the TD post's graphic changed too, so its approval was invalidated as well; the fresh one can't be scheduled after kickoff
  assert.equal(o2.state().posts.find((p) => p.decisionId === td.decisionId).lifecycle, "invalidated");
  const td2 = postsOf(o2, r2.commandId).find((p) => p.package.kind === "td-top3");
  assert.ok((await o2.decide({ decisionId: td2.decisionId, verdict: "approve", captionId: "A", digest: td2.options[0].digest, availabilityConfirmed: true }, FOUNDER)).ok);
  assert.equal(o2.recordPost({ decisionId: td2.decisionId, action: "schedule", scheduledFor: "2026-10-30T01:00:00Z" }, FOUNDER).code, "AFTER_KICKOFF");
});

test("V2.1: an identical rebuild (same content, a minute later) keeps the approval", { skip }, async () => {
  const h = v2Orchestrator();
  const r = await h.o.handleCommand("Team, prepare tomorrow's content queue", FOUNDER);
  h.o.approveDesign({ template: SOCIAL_TEMPLATE, assetManifest: ASSET_MANIFEST }, FOUNDER);
  const pre = postsOf(h.o, r.commandId).find((p) => p.package.kind === "pregame-forecast");
  assert.ok((await h.o.decide({ decisionId: pre.decisionId, verdict: "approve", captionId: "A", digest: pre.options[0].digest }, FOUNDER)).ok);
  h.setNow("2026-10-28T13:31:00.000Z");
  const r2 = await h.o.handleCommand("Team, prepare tomorrow's content queue again", FOUNDER);
  assert.equal(h.o.state().posts.find((p) => p.decisionId === pre.decisionId).lifecycle, "approved");
  assert.ok(queueOf(h.o, r2.commandId).skipped.some((x) => /already decided: approve/.test(x.reason)));
  assert.equal(h.store.list().filter((e) => e.kind === "post-status" && e.data.status === "invalidated").length, 0);
});

test("V2.1: a tied game is not a miss, so its captions are not blocked", async () => {
  const { nflPostgamePackage } = await import("../contracts/social-packages.mjs");
  const { sealPackage } = await import("../contracts/post-queue.mjs");
  const team = (abbr, name) => ({ abbr, name, nickname: name.split(" ").at(-1), city: "", color: "#000000", ink: "#FFFFFF", accent: "#FFB612" });
  const m = { eventId: "1", away: team("PIT", "Pittsburgh Steelers"), home: team("NO", "New Orleans Saints"), finalAway: 20, finalHome: 20, winner: "tie",
    favouredTeam: team("PIT", "Pittsburgh Steelers"), winProbabilityDisplay: "64.8%", result: "TIE", frozenLine: "Oct 25, 9:29 AM ET", td: null, evidence: [{ ref: "x" }] };
  const pkg = sealPackage(nflPostgamePackage({ date: "2026-10-26", m, extra: { template: SOCIAL_TEMPLATE, assetManifest: ASSET_MANIFEST, dataCommit: null } }));
  assert.equal(pkg.status, "READY");
  assert.ok(pkg.captions.every((c) => c.check.ok), JSON.stringify(pkg.captions.map((c) => c.check.problems)));
});

test("V2.1 Sunday-style slate: Top 5 boards from the frozen public board; rushing and passing held", { skip }, async () => {
  const { o } = v2Orchestrator({ now: "2026-10-25T12:00:00.000Z", window: { from: "2026-10-25", lookbackFrom: "2026-10-24", to: "2026-10-31" } });
  const r = await o.handleCommand("Team, prepare today's content queue", FOUNDER);
  const q = queueOf(o, r.commandId);
  const top5 = q.packages.filter((p) => p.kind === "top5-board");
  assert.deepEqual(top5.map((p) => p.family).sort(), ["anytime_td", "player_reception_yds", "player_receptions"]);
  assert.ok(top5.every((p) => p.status === "READY" && p.captions.every((c) => c.check.ok)));
  assert.match(top5.find((p) => p.family === "anytime_td").captions[0].text, /1\. Jahmyr Gibbs \(DET\) 84\.3%/);
  for (const fam of ["Rushing Yards", "Passing Yards"]) assert.ok(q.skipped.some((s) => s.opportunity.includes(fam) && /held/.test(s.reason)), fam);
});

test("V2.1 Sunday Nov 1: a predicted-winner package for all 12 games, and 12 Top 3 TD drafts", { skip }, async () => {
  const { o } = v2Orchestrator();
  const r = await o.handleCommand("Team, prepare the content queue for 2026-11-01", FOUNDER);
  const q = queueOf(o, r.commandId);
  const pre = q.packages.filter((p) => p.kind === "pregame-forecast");
  assert.equal(pre.length, 12);
  assert.ok(pre.every((p) => p.status === "READY"), pre.map((p) => `${p.postId} ${p.status} ${p.reasons[0]}`).join("\n"));
  assert.equal(q.packages.filter((p) => p.kind === "td-top3").length, 12);
  assert.ok(q.packages.filter((p) => p.kind === "td-top3").every((p) => p.status === "NEEDS_VERIFICATION"), "no TD post is ever READY on its own");
});

test("V2.1 NBA: predicted winner without probability, non-ranked stat lines, finals; blocked after tip-off", { skip }, async () => {
  const h = v2Orchestrator({ now: "2026-10-27T14:00:00.000Z", window: { from: "2026-10-27", lookbackFrom: "2026-10-26", to: "2026-11-02" } });
  const r = await h.o.handleCommand("Team, prepare today's content queue", FOUNDER);
  const q = queueOf(h.o, r.commandId);
  const pre = q.packages.filter((p) => p.kind === "nba-pregame");
  assert.equal(pre.length, 4);
  assert.ok(pre.every((p) => p.status === "READY" && !/\d%/.test(p.captions.map((c) => c.text).join(" "))), "no NBA probability is drawn or written");
  assert.equal(q.packages.filter((p) => p.kind === "nba-players").length, 4);
  const finals = q.packages.filter((p) => p.kind === "nba-final");
  assert.equal(finals.length, 9, "every Oct 26 final");
  assert.ok([...pre, ...finals].every((p) => p.captions.every((c) => c.check.ok)));
  h.o.approveDesign({ template: SOCIAL_TEMPLATE, assetManifest: ASSET_MANIFEST }, FOUNDER);
  const bos = postsOf(h.o, r.commandId).find((p) => p.package.kind === "nba-pregame");
  h.setNow("2026-10-28T03:00:00.000Z"); // after every tip-off
  assert.equal((await h.o.decide({ decisionId: bos.decisionId, verdict: "approve", captionId: "A", digest: bos.options[0].digest }, FOUNDER)).code, "VERIFICATION_CHANGED");
});

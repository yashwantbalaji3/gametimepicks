/**
 * The Launch Readiness importer: packages become founder-review posts. Fixture packages on a temp folder, real file
 * store, real publisher gate, X disabled. Importing approves nothing, schedules nothing and sends nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createFileStore } from "../ledger/store.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { sha256 } from "../lib/util.mjs";
import { mediaKeysOf } from "../ledger/ledger-sync.mjs";
import { IMPORT_DESIGNS, IMPORT_SENDABLE, IMPORT_TYPES, BLOCK, importTemplateOf, checkImportedCaption } from "../contracts/imported-packages.mjs";
import { proposePlan, MAX_PER_SLATE, MIN_GAP_MS } from "../contracts/content-plan.mjs";
import { FOUNDER, tempDir } from "./helpers.mjs";

const NOW = "2026-10-30T17:00:00.000Z";
const TIP = "2026-10-30T23:00:00.000Z";
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
/** A valid PNG of the size the package promises; `seed` makes the bytes distinct. */
function png(w, h, seed = 0) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = zlib.deflateSync(Buffer.from([0, seed]));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", raw), chunk("IEND", Buffer.alloc(0))]);
}
const LANE = { games: [{ providerEventId: "401", tipUtc: "2026-10-30T23:00Z", elo: { favoured: "CHA", winProbability: { away: 0.73, home: 0.27 } } }] };
const LANE_RAW = JSON.stringify(LANE);
const LANE_REF = "app/public/data/nba/experimental-public/2026-10-30.json";
const src = (files) => ({ label: "fixture", commit: null, read: (p) => files[p] ?? null, list: () => [] });

let n = 0;
function write(root, name, over = {}) {
  n += 1;
  const dir = path.join(root, "packages", name, "images");
  fs.mkdirSync(dir, { recursive: true });
  const b1 = png(1080, 1350, n), b2 = png(2160, 2700, n);
  const f1 = path.join(dir, `${name}.png`), f2 = path.join(dir, `${name}@2x.png`);
  fs.writeFileSync(f1, b1); fs.writeFileSync(f2, b2);
  const contentType = over.contentType ?? "NBA_GAME_WINNER", variant = over.variant === undefined ? "401" : over.variant;
  const sport = over.sport ?? "nba", date = over.date ?? "2026-10-30";
  const P = sport.toUpperCase();
  const p = {
    schema: "gtp-social-package@1", sport, date, contentType, variant, snapshotRefs: [{ ref: LANE_REF, sha256: sha256(LANE_RAW) }],
    images: [{ path: f1, width: 1080, height: 1350, scale: 1, sha256: sha256(b1) }, { path: f2, width: 1080, height: 1350, scale: 2, sha256: sha256(b2) }],
    caption: "GameTime Picks long caption with 1-800-GAMBLER and more text than anyone would want in a short post, repeated until it is well past the limit of the platform, which is two hundred and eighty characters, so it can never be the approved caption of a post, whatever else it says about the game tonight.",
    verification: { passed: true, checks: ["x"], cellsVerified: 4 }, window: { opensAt: NOW, closesAt: TIP }, recommendation: { firstGameUtc: TIP, recommendedAt: "2026-10-30T21:00:00Z" },
    dedupeId: `gtp-social:${sport}:${date}:${contentType}${variant ? `:${variant}` : ""}`, contentSha256: sha256(`${name}|${over.contentVersion ?? 1}`), eligibilityClass: "ESTIMATE",
    approval: { status: "FOUNDER_REVIEW_REQUIRED", socialAuthorized: false }, freshness: { ageHours: 0.2, rule: "valid until tip-off" },
    content: { game: { eventId: "401", matchup: "CHA @ WSH", away: "CHA", home: "WSH", kickoffUtc: "2026-10-30T23:00Z", awayP: 0.73, homeP: 0.27, side: "CHA" } },
    commandCenter: { postId: `${date}:${P}:${contentType.toLowerCase()}${variant ? `:${variant}` : ""}`, title: `${name}: game winner prediction`, sport: P, firstStartUtc: TIP, suggestedPublishAt: "2026-10-30T21:00:00Z", eventId: "401", dataCommit: null, claims: [{ key: "w", display: "CHA 73%", evidenceRef: LANE_REF }], captions: [{ id: "A", tone: "factual", text: "CHA @ WSH: CHA 73%, model estimate. Not betting advice." }, { id: "B", tone: "short", text: "CHA @ WSH. Not betting advice." }], evidence: [], hasMiss: false },
    ...over,
  };
  delete p.contentVersion;
  fs.writeFileSync(path.join(root, "packages", `${name}.json`), JSON.stringify(p));
  return p;
}
function harness({ dir = tempDir("gtp-cc-import-"), root = tempDir("gtp-cc-import-src-"), now = NOW, files = { [LANE_REF]: LANE_RAW } } = {}) {
  let t = now;
  const clock = () => t;
  const store = createFileStore({ dir: path.join(dir, "ledger"), clock });
  const xcalls = [];
  const fetch = async (u) => { xcalls.push(String(u)); throw new Error("X must not be called"); };
  const oauth = { accessToken: async () => ({ ok: true, token: "AT" }), status: async () => ({ connected: true, scopes: ["tweet.write", "media.write"] }) };
  const o = createOrchestrator({ store, clock, outDir: dir, calendarDataSource: { ...src(files) }, env: { GTP_CC_X_HANDLE: "GameTimePicksHQ", GTP_CC_IMPORT_ROOT: root }, publishing: { oauth, fetch, refreshData: async () => ({ ok: true, detail: "test" }) } });
  return { o, dir, root, store, xcalls, files, setNow: (v) => { t = v; } };
}
const approve = async (H, p, cap = "B") => {
  const opt = p.options.find((c) => c.captionId === cap);
  return H.o.decide({ decisionId: p.decisionId, verdict: "approve", captionId: cap, digest: opt.digest }, FOUNDER);
};
const design = (H, p) => H.o.approveDesign({ template: p.package.template, assetManifest: p.package.assetManifest }, FOUNDER);
const post = (H) => H.o.state().posts.find((p) => p.package.imported);
const CLEAN = Object.freeze({ approval: { status: "FOUNDER_APPROVED", socialAuthorized: true } });

test("import: a package becomes one founder-review post with real media; nothing is approved, scheduled or sent", () => {
  const H = harness();
  const p = write(H.root, "chawsh");
  const r = H.o.importPackages({}, FOUNDER);
  assert.deepEqual(r.counts, { imported: 1 });
  const x = post(H);
  assert.deepEqual([x.lifecycle, x.package.status, x.package.kind, x.package.imported.dedupeId], ["drafted", "READY", "lr-nba-game-winner", p.dedupeId]);
  assert.equal(x.package.mediaSet.length, 1, "the 2x export is not a second image in the post");
  assert.equal(x.package.hiRes.length, 1);
  assert.equal(sha256(fs.readFileSync(path.join(H.dir, "media", x.package.media.file))), p.images[0].sha256);
  assert.equal(x.resolution, null);
  assert.equal(H.o.publishing.jobs().length, 0);
  assert.equal(H.xcalls.length, 0);
  assert.equal(H.store.list().filter((e) => e.kind === "import-run").length, 1);
  assert.equal(x.package.imported.socialAuthorized, false);
});

test("import: captions over 280, with an NBA percentage or an em dash can't be approved; a clean one can", () => {
  const H = harness();
  write(H.root, "a");
  H.o.importPackages({}, FOUNDER);
  const x = post(H);
  const by = Object.fromEntries(x.options.map((c) => [c.captionId, c.check]));
  assert.ok(by.A.problems.some((q) => q.code === "NO_PERCENT_IN_NBA_CAPTION"));
  assert.equal(by.B.ok, true);
  assert.equal(by.L.ok, false);
  assert.ok(checkImportedCaption("CHA @ WSH — tonight", x.package).problems.some((q) => q.code === "EM_DASH"));
});

test("import: safe re-import, a new version replaces a draft, and never an approved post", async () => {
  const H = harness();
  write(H.root, "a", CLEAN);
  H.o.importPackages({}, FOUNDER);
  assert.deepEqual(H.o.importPackages({}, FOUNDER).counts, { duplicate: 1 });
  assert.equal(H.o.state().posts.length, 1);
  write(H.root, "a", { ...CLEAN, contentVersion: 2 });
  assert.deepEqual(H.o.importPackages({}, FOUNDER).counts, { "new-version": 1 });
  const all = H.o.state().posts;
  assert.deepEqual(all.map((p) => p.lifecycle).sort(), ["drafted", "superseded"]);
  const cur = all.find((p) => p.lifecycle === "drafted");
  assert.equal(design(H, cur).ok, true);
  assert.equal((await approve(H, cur)).ok, true);
  write(H.root, "a", { ...CLEAN, contentVersion: 3 });
  const r = H.o.importPackages({}, FOUNDER);
  assert.deepEqual([r.counts, r.results[0].code], [{ held: 1 }, "EXISTING_POST_KEPT"]);
  assert.equal(H.o.state().posts.length, 2, "the approved post is not replaced");
  // the gate still refuses the old version: Launch Readiness has moved on
  assert.equal(H.o.publishing.schedule({ decisionId: cur.decisionId }, FOUNDER).ok, true);
  H.setNow("2026-10-30T21:00:01.000Z");
  const d = await H.o.publishing.publishNow({ decisionId: cur.decisionId, live: false }, FOUNDER);
  assert.deepEqual([d.state, d.code], ["REFUSED", "VERIFICATION_CHANGED"]);
  assert.equal(H.xcalls.length, 0);
});

test("import: refused and blocked packages", () => {
  const H = harness();
  const good = write(H.root, "bad-hash");
  good.images[0].sha256 = "0".repeat(64);
  fs.writeFileSync(path.join(H.root, "packages", "bad-hash.json"), JSON.stringify(good));
  const outside = write(H.root, "outside");
  const elsewhere = path.join(tempDir("gtp-cc-out-"), "x.png");
  fs.copyFileSync(outside.images[0].path, elsewhere);
  outside.images[0].path = elsewhere;
  fs.writeFileSync(path.join(H.root, "packages", "outside.json"), JSON.stringify(outside));
  fs.writeFileSync(path.join(H.root, "packages", "broken.json"), "{");
  fs.writeFileSync(path.join(H.root, "packages", "schema.json"), JSON.stringify({ schema: "other@1" }));
  const r = H.o.importPackages({}, FOUNDER);
  assert.equal(r.counts.refused, 4, JSON.stringify(r.results));
  assert.equal(H.o.state().posts.length, 0, "a refusal writes no post");
  assert.ok(r.results.some((x) => /checksum mismatch/.test(x.detail)));
  assert.ok(r.results.some((x) => /outside the import folder/.test(x.detail)));
});

test("blocked: real lines, NBA boards and uncleared NFL estimates can't be approved, scheduled or sent", async () => {
  const H = harness();
  write(H.root, "box", { contentType: "NBA_BOXSCORE", content: { matchup: "CHA @ WSH", quotedAt: "Oct 30, 12:00 PM ET", comparedRows: 72 } });
  write(H.root, "top5", { contentType: "NBA_DAILY_TOP5", variant: "pts", content: { board: "pts", linesShown: 5, rows: [{ line: { text: "U 34.5 −107" }, name: "A" }] } });
  write(H.root, "pass", { sport: "nfl", date: "2026-11-01", contentType: "NFL_WEEKLY_TOP5", variant: "top5_pass_yds", content: { week: 8, rows: [] }, window: { closesAt: "2026-11-01T18:00:00Z" } });
  const r = H.o.importPackages({}, FOUNDER);
  assert.equal(r.counts.imported, 3, JSON.stringify(r.results));
  const posts = H.o.state().posts;
  const codes = (k) => posts.find((p) => p.package.kind === k).package.blockers.map((b) => b.code);
  assert.ok(codes("lr-nba-boxscore").includes(BLOCK.LINE_RIGHTS));
  assert.ok(codes("lr-nba-top5").includes(BLOCK.LINE_RIGHTS) && codes("lr-nba-top5").includes(BLOCK.NBA_BOARDS));
  assert.ok(codes("lr-nfl-top5").includes(BLOCK.BELOW_BAR));
  assert.equal(JSON.stringify(posts).includes("34.5"), false, "no line or price enters the ledger");
  for (const p of posts) {
    design(H, p);
    const a = await approve(H, p);
    assert.equal(a.ok, false, p.package.kind);
    assert.equal(a.code, "NOT_READY");
    assert.equal(H.o.publishing.schedule({ decisionId: p.decisionId, at: "2026-10-30T21:00:00.000Z" }, FOUNDER).ok, false);
  }
  const box = posts.find((p) => p.package.kind === "lr-nba-boxscore");
  assert.equal(box.package.privateReview, true);
  assert.equal(box.package.supported, false);
  assert.equal(mediaKeysOf([{ data: { package: box.package } }]).length, 0, "private cards never go to the hosted store");
  assert.equal(H.xcalls.length, 0);
});

test("the full path: design + post approval + schedule + dry run through the gate; a changed lane or a moved tip holds it", async () => {
  const H = harness();
  write(H.root, "a", CLEAN);
  H.o.importPackages({}, FOUNDER);
  const x = post(H);
  assert.equal((await approve(H, x)).code, "DESIGN_NOT_APPROVED", "a new template needs its own design approval");
  design(H, x);
  assert.equal((await approve(H, x)).ok, true);
  assert.equal(H.o.state().posts[0].lifecycle, "approved");
  assert.equal(H.o.publishing.jobs().length, 0, "approval schedules nothing");
  const s = H.o.publishing.schedule({ decisionId: x.decisionId, at: "2026-10-30T21:30:00.000Z" }, FOUNDER);
  assert.equal(s.ok, true, JSON.stringify(s));
  assert.equal(H.o.publishing.schedule({ decisionId: x.decisionId }, FOUNDER).code, "ALREADY_SCHEDULED");
  H.setNow("2026-10-30T21:30:01.000Z");
  const d = await H.o.publishing.publishNow({ decisionId: x.decisionId, live: false }, FOUNDER);
  assert.equal(d.state, "DRY_RUN", JSON.stringify(d));
  H.files[LANE_REF] = JSON.stringify({ games: [{ ...LANE.games[0], elo: { favoured: "WSH" } }] });
  const d2 = await H.o.publishing.publishNow({ decisionId: x.decisionId, live: false }, FOUNDER);
  assert.equal(d2.code, "VERIFICATION_CHANGED");
  assert.equal(H.xcalls.length, 0);
});

test("a review copy can be approved but never scheduled or sent; its clean export comes back as a new post needing its own approval", async () => {
  const H = harness();
  const p = write(H.root, "a");
  H.o.importPackages({}, FOUNDER);
  const x = post(H);
  design(H, x);
  assert.equal((await approve(H, x)).ok, true);
  assert.equal(H.o.publishing.schedule({ decisionId: x.decisionId, at: "2026-10-30T21:30:00.000Z" }, FOUNDER).code, "REVIEW_COPY");
  const d = await H.o.publishing.publishNow({ decisionId: x.decisionId, live: true }, FOUNDER);
  assert.deepEqual([d.state, d.code], ["REFUSED", "REVIEW_COPY"]);
  const ask = JSON.parse(fs.readFileSync(path.join(H.root, "approvals/approved-for-clean-export.json"), "utf8"));
  assert.deepEqual(ask.approved.map((a) => [a.dedupeId, a.contentSha256, a.captionId]), [[p.dedupeId, p.contentSha256, "B"]]);
  write(H.root, "a", { ...CLEAN, contentVersion: 2 });
  assert.deepEqual(H.o.importPackages({}, FOUNDER).counts, { "new-version": 1 });
  const all = H.o.state().posts;
  assert.equal(all.find((q) => q.decisionId === x.decisionId).lifecycle, "invalidated");
  const clean = all.find((q) => q.decisionId !== x.decisionId);
  assert.equal(clean.lifecycle, "drafted", "the clean image needs its own approval");
  assert.equal((await approve(H, clean)).ok, true);
  assert.equal(H.o.publishing.schedule({ decisionId: clean.decisionId, at: "2026-10-30T21:30:00.000Z" }, FOUNDER).ok, true);
  assert.equal(H.xcalls.length, 0);
});

test("model-only and real-line versions: market data is blocked by its flag, a new design version needs its own approval, and the same slot never shows twice", async () => {
  const H = harness();
  write(H.root, "stats", { contentType: "NBA_PLAYER_STATS", designVersion: "2", content: { matchup: "CHA @ WSH" } });
  write(H.root, "ml", { variant: "401-ml", containsMarketData: true, ...CLEAN });
  write(H.root, "old");
  H.o.importPackages({}, FOUNDER);
  write(H.root, "old", { designVersion: "2", contentVersion: 2 });
  assert.deepEqual(H.o.importPackages({}, FOUNDER).counts, { duplicate: 2, "new-version": 1 });
  const posts = H.o.state().posts;
  const stats = posts.find((p) => p.package.kind === "lr-nba-players");
  assert.deepEqual([stats.package.status, stats.package.template, stats.package.supported], ["READY", "gtp-lr-nba-players@2", true]);
  const ml = posts.find((p) => p.package.imported.variant === "401-ml");
  assert.ok(ml.package.blockers.some((b) => b.code === BLOCK.LINE_RIGHTS), "a flagged moneyline is blocked even when marked clean");
  assert.equal(ml.package.privateReview, true);
  assert.equal(H.o.publishing.schedule({ decisionId: ml.decisionId, at: "2026-10-30T21:00:00.000Z" }, FOUNDER).code, "IMPORT_BLOCKED");
  const winners = posts.filter((p) => p.package.kind === "lr-nba-game-winner" && p.package.imported.variant === "401");
  assert.deepEqual(winners.map((p) => p.lifecycle).sort(), ["drafted", "superseded"], "old and new are one slot");
  const cur = winners.find((p) => p.lifecycle === "drafted");
  assert.equal(cur.package.template, "gtp-lr-nba-game-winner@2");
  assert.equal((await approve(H, cur)).code, "DESIGN_NOT_APPROVED");
  assert.equal(design(H, cur).ok, true, "a design version that arrived in a package can be approved");
  assert.equal((await approve(H, cur)).ok, true);
});

test("a reference that isn't a repo file is kept as provenance, not refused; a repo file that doesn't match still is", () => {
  const H = harness();
  const refs = [{ ref: LANE_REF, sha256: sha256(LANE_RAW) }, { ref: "gtp-graphics-export@2", sha256: "a".repeat(64) }, { ref: "nba-official-receipts:v0.1/2026-10-30", sha256: "b".repeat(64) }];
  write(H.root, "a", { snapshotRefs: refs });
  H.o.importPackages({}, FOUNDER);
  assert.equal(post(H).package.imported.snapshotRefs.length, 3);
  assert.equal(post(H).package.status, "READY");
});

test("an import that changes nothing records no run; a bad designVersion is refused", () => {
  const H = harness();
  write(H.root, "a");
  H.o.importPackages({}, FOUNDER);
  H.o.importPackages({}, FOUNDER);
  assert.equal(H.store.list().filter((e) => e.kind === "import-run").length, 1);
  write(H.root, "b", { designVersion: "x" });
  assert.equal(H.o.importPackages({}, FOUNDER).counts.refused, 1);
});

test("model-only NBA Top 5 is approvable; the real-line variant isn't; a board imported while blocked is re-proposed once the blocker lifts", async () => {
  const H = harness();
  const model = { contentType: "NBA_DAILY_TOP5", variant: "pts-model", content: { board: "pts", linesShown: 0, rows: [{ rank: 1, name: "A", value: 25 }] } };
  write(H.root, "m", model);
  write(H.root, "l", { contentType: "NBA_DAILY_TOP5", variant: "pts", content: { board: "pts", linesShown: 5, rows: [{ line: { text: "U 34.5" } }] } });
  H.o.importPackages({}, FOUNDER);
  const posts = H.o.state().posts;
  const m = posts.find((p) => p.package.imported.variant === "pts-model");
  assert.deepEqual([m.package.status, m.package.blockers, m.package.imported.rights], ["READY", [], "MODEL_ONLY"]);
  const l = posts.find((p) => p.package.imported.variant === "pts");
  assert.equal(l.package.imported.rights, "QUOTE_ON_SOCIAL");
  design(H, m);
  assert.equal((await approve(H, m)).ok, true);
  // a stale blocked record, as the live ledger holds from before the authorization
  const J = harness();
  const was = write(J.root, "m", model);
  J.o.importPackages({}, FOUNDER);
  const first = post(J);
  J.store.append("decision-request", "launch-readiness-import", { decisionId: "post-stale", commandId: "c", kind: "post", subjectType: "post-package", postId: was.commandCenter.postId, date: was.date, package: { ...first.package, status: "BLOCKED", blockers: [{ code: BLOCK.NBA_BOARDS, detail: "old" }] }, options: first.options });
  assert.deepEqual(J.o.importPackages({}, FOUNDER).counts, { "new-version": 1 });
  assert.deepEqual(J.o.importPackages({}, FOUNDER).counts, { duplicate: 1 });
  const cur = J.o.state().posts.filter((p) => p.lifecycle === "drafted");
  assert.deepEqual([cur.length, cur[0].package.status], [1, "READY"]);
});

test("a package flagged for anomaly review is blocked and can't be approved", async () => {
  const H = harness();
  write(H.root, "s", { contentType: "NBA_PLAYER_STATS", anomalyCheck: "REVIEW", anomalies: [{ playerId: "1", market: "pts", verdict: "INCORRECT_MINUTES" }], content: { matchup: "CHA @ WSH" } });
  H.o.importPackages({}, FOUNDER);
  const x = post(H);
  assert.ok(x.package.blockers.some((b) => b.code === BLOCK.ANOMALY));
  design(H, x);
  assert.equal((await approve(H, x)).code, "NOT_READY");
});

test("the pre-send check reads the redesigned content shape, and a game with no side fails closed", async () => {
  const H = harness();
  write(H.root, "t", { ...CLEAN, contentType: "NBA_TONIGHT", variant: null, content: { games: [{ eventId: "401", away: "CHA", home: "WSH", tipUtc: "2026-10-30T23:00Z", winner: "CHA", awayEstimate: 0.73, homeEstimate: 0.27 }] }, commandCenter: { postId: "2026-10-30:NBA:nba_tonight", title: "NBA tonight", sport: "NBA", firstStartUtc: TIP, suggestedPublishAt: "2026-10-30T21:00:00Z", eventId: null, dataCommit: null, claims: [], captions: [{ id: "A", tone: "x", text: "NBA tonight. Not betting advice." }], evidence: [], hasMiss: false } });
  write(H.root, "w", { ...CLEAN, content: { game: { eventId: "401", winner: "CHA", awayEstimate: 0.73, homeEstimate: 0.27, moneyline: "NOT_CAPTURED" } } });
  write(H.root, "bad", { ...CLEAN, variant: "402", content: { game: { eventId: "401", awayEstimate: 0.73 } }, commandCenter: { postId: "2026-10-30:NBA:nba_game_winner:402", title: "x: y", sport: "NBA", firstStartUtc: TIP, eventId: "401", dataCommit: null, claims: [], captions: [{ id: "A", tone: "x", text: "CHA @ WSH. Not betting advice." }], evidence: [], hasMiss: false } });
  H.o.importPackages({}, FOUNDER);
  const posts = H.o.state().posts;
  for (const kind of ["lr-nba-tonight", "lr-nba-game-winner"]) {
    const p = posts.find((x) => x.package.kind === kind && x.postId !== "2026-10-30:NBA:nba_game_winner:402");
    design(H, p);
    const a = await H.o.decide({ decisionId: p.decisionId, verdict: "approve", captionId: p.options.find((o) => o.check.ok).captionId, digest: p.options.find((o) => o.check.ok).digest }, FOUNDER);
    assert.equal(a.ok, true, `${kind}: ${a.detail}`);
  }
  const bad = posts.find((x) => x.postId === "2026-10-30:NBA:nba_game_winner:402");
  const r = await H.o.decide({ decisionId: bad.decisionId, verdict: "approve", captionId: "A", digest: bad.options[0].digest }, FOUNDER);
  assert.equal(r.code, "VERIFICATION_CHANGED", "no side on record: never approved");
});

test("a clean export with the SAME content id arrives as the final image for approval, one record, and repeats are no-ops", async () => {
  const H = harness();
  const p = write(H.root, "a");
  H.o.importPackages({}, FOUNDER);
  const x = post(H);
  design(H, x);
  await approve(H, x);
  const clean = write(H.root, "a", CLEAN);
  clean.contentSha256 = p.contentSha256;
  fs.writeFileSync(path.join(H.root, "packages", "a.json"), JSON.stringify(clean));
  assert.deepEqual(H.o.importPackages({}, FOUNDER).counts, { "new-version": 1 });
  assert.deepEqual(H.o.importPackages({}, FOUNDER).counts, { duplicate: 1 });
  const all = H.o.state().posts;
  const cur = all.find((q) => q.lifecycle === "drafted");
  assert.deepEqual([all.length, all.find((q) => q.decisionId === x.decisionId).lifecycle, cur.package.imported.socialAuthorized], [2, "invalidated", true]);
  assert.deepEqual([cur.package.imported.cleanOf.sameContent, cur.package.imported.cleanOf.captionId], [true, "B"]);
  assert.equal(H.o.publishing.schedule({ decisionId: cur.decisionId, at: "2026-10-30T21:30:00.000Z" }, FOUNDER).code, "NOT_APPROVED", "the clean image needs its own approval");
  assert.equal((await approve(H, cur)).ok, true);
  assert.equal(H.o.publishing.schedule({ decisionId: cur.decisionId, at: "2026-10-30T21:30:00.000Z" }, FOUNDER).ok, true);
});

test("restart: imported posts, media and approvals survive a new process on the same ledger", async () => {
  const dir = tempDir("gtp-cc-import-");
  const A = harness({ dir });
  write(A.root, "a");
  A.o.importPackages({}, FOUNDER);
  const x = post(A);
  design(A, x);
  await approve(A, x);
  const B = harness({ dir, root: A.root });
  const y = post(B);
  assert.deepEqual([y.decisionId, y.lifecycle, y.package.status], [x.decisionId, "approved", "READY"]);
  assert.deepEqual(B.o.importPackages({}, FOUNDER).counts, { duplicate: 1 });
});

test("overlap: a Command Center post already approved or published for the event blocks the import; a draft is noted", () => {
  const H = harness();
  H.store.append("decision-request", "chief-of-staff", { decisionId: "post-cc", commandId: "c", kind: "post", subjectType: "post-package", postId: "2026-10-30:NBA:game:401", date: "2026-10-30", package: { postId: "2026-10-30:NBA:game:401", kind: "nba-game", eventId: "401", sport: "NBA", status: "READY", reasons: [], claims: [], title: "CHA @ WSH", captions: [] }, options: [] });
  write(H.root, "a");
  H.o.importPackages({}, FOUNDER);
  assert.equal(post(H).package.status, "READY");
  assert.ok(post(H).package.reasons.some((r) => /undecided Command Center draft/.test(r)));
  const J = harness();
  J.store.append("decision-request", "chief-of-staff", { decisionId: "post-cc", commandId: "c", kind: "post", subjectType: "post-package", postId: "2026-10-30:NBA:game:401", date: "2026-10-30", package: { postId: "2026-10-30:NBA:game:401", kind: "nba-game", eventId: "401", sport: "NBA", status: "READY", reasons: [], claims: [], title: "CHA @ WSH", captions: [] }, options: [] });
  J.store.append("publish-receipt", "founder", { decisionId: "post-cc", postId: "2026-10-30:NBA:game:401", canonicalUrl: "https://x.com/a/status/123456" });
  write(J.root, "a");
  J.o.importPackages({}, FOUNDER);
  assert.equal(post(J).package.status, "BLOCKED");
  assert.ok(post(J).package.blockers.some((b) => b.code === BLOCK.OVERLAP));
});

test("every sendable type has a design version and only founder review; the publisher set is explicit", () => {
  assert.equal(IMPORT_SENDABLE.includes("lr-nba-boxscore"), false);
  assert.equal(IMPORT_SENDABLE.includes("lr-live-update"), false);
  for (const [c, t] of Object.entries(IMPORT_TYPES)) if (t.supported) assert.ok(IMPORT_DESIGNS.some((d) => d.template === importTemplateOf(c, "NBA")), c);
});

test("content plan: recap two hours before the first game, in the founder's order, spaced, capped, and it schedules nothing", () => {
  const mk = (id, kind, tip = TIP) => ({ decisionId: id, postId: id, lifecycle: "drafted", package: { kind, sport: "NBA", status: "READY", title: id, tipUtc: tip, firstStartUtc: tip, imported: { recommendation: { firstGameUtc: TIP } } } });
  const posts = [mk("w1", "lr-nba-game-winner"), mk("r", "lr-results-recap"), mk("t", "lr-nba-tonight"), ...Array.from({ length: 8 }, (_, i) => mk(`w${i + 2}`, "lr-nba-game-winner"))];
  const plan = proposePlan(posts, NOW);
  assert.deepEqual(plan.items.slice(0, 2).map((i) => i.decisionId), ["r", "t"]);
  assert.equal(plan.items[0].at, "2026-10-30T21:00:00.000Z");
  assert.equal(plan.items.length, MAX_PER_SLATE);
  assert.ok(plan.unslotted.length >= 1);
  for (let i = 1; i < plan.items.length; i++) assert.ok(Date.parse(plan.items[i].at) - Date.parse(plan.items[i - 1].at) >= MIN_GAP_MS);
  const board = (id, v) => ({ ...mk(id, "lr-nfl-top5"), package: { ...mk(id, "lr-nfl-top5").package, imported: { variant: v, recommendation: { firstGameUtc: TIP } } } });
  assert.deepEqual(proposePlan([board("a", "ast-model"), board("p", "pts-model"), board("r", "reb-model")], NOW).items.map((i) => i.decisionId), ["p", "r", "a"]);
  assert.deepEqual(proposePlan([{ ...posts[0], package: { ...posts[0].package, status: "BLOCKED" } }], NOW).items, []);
});

test("approving the calendar records times and schedules nothing", async () => {
  const H = harness();
  write(H.root, "a");
  H.o.importPackages({}, FOUNDER);
  const plan = H.o.state().contentPlan;
  assert.equal(plan.items.length, 1);
  assert.equal(H.o.approveContentPlan({ digest: "nope" }, FOUNDER).code, "PLAN_CHANGED");
  assert.equal(H.o.approveContentPlan({ digest: plan.digest }, FOUNDER).ok, true);
  assert.equal(H.o.state().contentPlan.approved.current, true);
  assert.equal(H.o.publishing.jobs().length, 0);
});

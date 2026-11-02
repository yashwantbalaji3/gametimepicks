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
import { revisionNote, parseRevisionNote, revisionRequests } from "../contracts/revision-requests.mjs";
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
  assert.deepEqual(codes("lr-nba-top5"), [BLOCK.LINE_RIGHTS], "rights are the only blocker: the category itself is authorized");
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
  assert.equal(box.package.supported, true, "the type is sendable; its block is rights");
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
  J.store.append("decision-request", "launch-readiness-import", { decisionId: "post-stale", commandId: "c", kind: "post", subjectType: "post-package", postId: was.commandCenter.postId, date: was.date, package: { ...first.package, status: "BLOCKED", blockers: [{ code: "NBA_BOARDS_NOT_AUTHORIZED_FOR_SOCIAL", detail: "old" }] }, options: first.options });
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

test("revision loop: a request is kept with the post, reaches Launch Readiness, and a re-render with the same content returns as the revised draft of the same slot", async () => {
  const H = harness();
  const p = write(H.root, "a");
  H.o.importPackages({}, FOUNDER);
  const x = post(H);
  const note = revisionNote({ scope: "template", type: "visual", image: "all", text: "Bigger logo, tighter spacing" });
  assert.equal((await H.o.decide({ decisionId: x.decisionId, verdict: "revise", note }, FOUNDER)).ok, true);
  assert.deepEqual(parseRevisionNote(note), { scope: "template", type: "visual", image: "all", text: "Bigger logo, tighter spacing" });
  assert.equal(H.o.state().posts[0].lifecycle, "revise");
  assert.equal(H.o.publishing.jobs().length, 0);
  let file = JSON.parse(fs.readFileSync(path.join(H.root, "approvals/revision-requests.json"), "utf8"));
  const r = file.requests[0];
  assert.deepEqual([r.dedupeId, r.eventId, r.scope, r.type, r.request, r.status], [p.dedupeId, "401", "template", "visual", "Bigger logo, tighter spacing", "PENDING"]);
  assert.match(r.handling, /No model build, no paid capture/);
  assert.equal(r.version.images[0], p.images[0].sha256);
  assert.equal(r.forecast.snapshotRefs.length, 1);
  assert.equal(fs.existsSync(path.join(H.root, "approvals/approved-for-clean-export.json")), false, "a revision requests no clean export");
  // a visual re-render: same content hash, new image
  const again = write(H.root, "a");
  again.contentSha256 = p.contentSha256;
  fs.writeFileSync(path.join(H.root, "packages", "a.json"), JSON.stringify(again));
  assert.deepEqual(H.o.importPackages({}, FOUNDER).counts, { "new-version": 1 });
  assert.deepEqual(H.o.importPackages({}, FOUNDER).counts, { duplicate: 1 });
  const all = H.o.state().posts;
  assert.deepEqual(all.map((q) => q.lifecycle), ["revise", "drafted"], "one slot, feedback kept");
  file = JSON.parse(fs.readFileSync(path.join(H.root, "approvals/revision-requests.json"), "utf8"));
  assert.deepEqual([file.requests[0].status, file.requests[0].revisedIn], ["COMPLETED", all[1].decisionId]);
  assert.equal(revisionRequests(all).length, 1);
  // a second round on the revised draft
  await H.o.decide({ decisionId: all[1].decisionId, verdict: "revise", note: "Plain note" }, FOUNDER);
  assert.deepEqual(revisionRequests(H.o.state().posts).map((q) => [q.status, q.scope]), [["COMPLETED", "template"], ["PENDING", "image"]]);
  assert.equal(H.o.publishing.jobs().length, 0);
  assert.equal(H.xcalls.length, 0);
});

test("rights: the founder's recorded statement clears the provider block, keeps data holds, says no document exists, and one game post carries all its images", async () => {
  const H = harness();
  write(H.root, "game", { ...CLEAN, contentType: "NBA_GAME_POST", containsMarketData: true, content: { game: { eventId: "401", winner: "CHA", awayEstimate: 0.73, homeEstimate: 0.27 } } });
  write(H.root, "box", { contentType: "NBA_BOXSCORE", anomalyCheck: "REVIEW", anomalies: [{ playerId: "1", market: "pts", verdict: "INCORRECT_MINUTES" }], content: { matchup: "CHA @ WSH" } });
  H.o.importPackages({}, FOUNDER);
  assert.ok(H.o.state().posts.every((p) => p.package.blockers.some((b) => b.code === BLOCK.LINE_RIGHTS)));
  assert.equal(H.o.recordMarketAuthorization({ statement: "" }, FOUNDER).code, "INVALID_REQUEST");
  const r = H.o.recordMarketAuthorization({ statement: "Founder personally confirmed with the provider.", provider: "The Odds API", scope: ["NBA moneylines"], writtenConfirmation: false }, FOUNDER);
  assert.deepEqual(r.imported, { "new-version": 2 });
  assert.equal(H.o.state().marketRights.writtenConfirmation, false);
  const cur = H.o.state().posts.filter((p) => p.lifecycle === "drafted");
  const game = cur.find((p) => p.package.kind === "lr-nba-game");
  assert.deepEqual([game.package.status, game.package.blockers, game.package.privateReview], ["READY", [], undefined]);
  const box = cur.find((p) => p.package.kind === "lr-nba-boxscore");
  assert.deepEqual(box.package.blockers.map((b) => b.code), [BLOCK.ANOMALY], "a data hold is not a rights question");
  design(H, game);
  assert.equal((await approve(H, game)).ok, true);
  assert.equal(H.o.publishing.schedule({ decisionId: game.decisionId, at: "2026-10-30T21:30:00.000Z" }, FOUNDER).ok, true, "one job for one post");
  assert.equal(H.o.publishing.jobs().length, 1);
  H.o.publishing.cancel({ jobId: H.o.publishing.jobs()[0].jobId }, FOUNDER);
  // withdrawn: the check fails closed
  H.o.recordMarketAuthorization({ statement: "Withdrawn.", active: false }, FOUNDER);
  assert.equal(H.o.state().marketRights, null);
  H.setNow("2026-10-30T21:30:01.000Z");
  assert.equal((await H.o.publishing.publishNow({ decisionId: game.decisionId, live: false }, FOUNDER)).code, "VERIFICATION_CHANGED");
});

test("a sportsbook Top 5 can't pass while its model-only twin is held, whatever its own check says", async () => {
  const H = harness();
  const board = (v, o) => ({ ...CLEAN, contentType: "NBA_DAILY_TOP5", variant: v, content: { board: "ast", rows: [] }, ...o });
  write(H.root, "a", board("ast", { anomalyCheck: "PASS" }));
  write(H.root, "b", board("ast-model", { anomalyCheck: "REVIEW", anomalies: [{ playerId: "1", market: "ast", verdict: "MODEL_DEFECT" }] }));
  H.o.importPackages({}, FOUNDER);
  const real = H.o.state().posts.find((p) => p.package.imported.variant === "ast");
  design(H, real);
  assert.equal((await approve(H, real)).code, "VERIFICATION_CHANGED");
});

test("one game, one post: approving the unified post or the winner-only post holds the other, whichever came first", async () => {
  const H = harness();
  const game = { ...CLEAN, contentType: "NBA_GAME_POST", content: { game: { eventId: "401", winner: "CHA", awayEstimate: 0.73, homeEstimate: 0.27 } } };
  write(H.root, "g", game);
  write(H.root, "w", { ...CLEAN, variant: "401-ml" });
  H.o.importPackages({}, FOUNDER);
  const posts = H.o.state().posts;
  const g = posts.find((p) => p.package.kind === "lr-nba-game"), w = posts.find((p) => p.package.kind === "lr-nba-game-winner");
  design(H, g); design(H, w);
  assert.equal((await approve(H, w)).ok, true);
  assert.equal((await approve(H, g)).code, "VERIFICATION_CHANGED", "the winner-only post is approved: the unified one can't be too");
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
  assert.equal(IMPORT_SENDABLE.includes("lr-nba-boxscore"), true, "held by rights, not by type");
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

test("clock change: 1:00 PM ET on Nov 1 is 18:00 UTC, 4:00 PM ET on Oct 31 is 20:00 UTC", async () => {
  const { etInstant } = await import("../orchestrator/publish-flow.mjs");
  assert.equal(etInstant("2026-11-01", "13:00"), "2026-11-01T18:00:00.000Z");
  assert.equal(etInstant("2026-10-31", "16:00"), "2026-10-31T20:00:00.000Z");
});

test("the Top 5 carousel and the separate boards are one slot: approving either holds the other", async () => {
  const { overlapsOf, IMPORT_TYPES } = await import("../contracts/imported-packages.mjs");
  assert.equal(IMPORT_TYPES.NBA_TOP5_CAROUSEL.supported, true);
  const carousel = { postId: "c", kind: "lr-nba-top5-carousel", date: "2026-10-31" };
  const board = { postId: "b", kind: "lr-nba-top5", date: "2026-10-31", imported: { variant: "pts" } };
  assert.equal(overlapsOf(carousel, [{ lifecycle: "approved", package: board }]).blocking.length, 1);
  assert.equal(overlapsOf(board, [{ lifecycle: "scheduled", package: carousel }]).blocking.length, 1);
  assert.equal(overlapsOf(carousel, [{ lifecycle: "drafted", package: board }]).blocking.length, 0);
});

test("UFC sections are known, sendable types with a schedule start", async () => {
  const { IMPORT_TYPES, IMPORT_SENDABLE } = await import("../contracts/imported-packages.mjs");
  for (const t of ["UFC_PRELIMS", "UFC_MAIN_CARD"]) assert.ok(IMPORT_SENDABLE.includes(IMPORT_TYPES[t].kind));
});

test("sameClaims ignores build metadata and key order, and catches every claim", async () => {
  const { sameClaims } = await import("../contracts/imported-packages.mjs");
  const a = JSON.stringify({ generatedAt: "1", rows: [{ id: 1, tdP: 0.5, status: "ACTIVE", line: 6.5, price: -110, kickoffUtc: "x" }], hash: "a" });
  assert.equal(sameClaims(a, JSON.stringify({ hash: "b", rows: [{ price: -110, line: 6.5, status: "ACTIVE", tdP: 0.5, id: 1, kickoffUtc: "x" }], generatedAt: "2" })), true);
  for (const change of [{ tdP: 0.6 }, { status: "OUT" }, { line: 7.5 }, { price: -120 }, { kickoffUtc: "y" }]) {
    assert.equal(sameClaims(a, JSON.stringify({ generatedAt: "1", rows: [{ id: 1, tdP: 0.5, status: "ACTIVE", line: 6.5, price: -110, kickoffUtc: "x", ...change }], hash: "a" })), false);
  }
  assert.equal(sameClaims(a, "not json"), false);
});

test("reproduction: a newer version never replaces an approved post, and the post is left blocked", async () => {
  const H = harness();
  write(H.root, "a", CLEAN);
  H.o.importPackages({}, FOUNDER);
  const p = post(H);
  design(H, p);
  assert.equal((await approve(H, p)).ok, true);
  write(H.root, "a", { ...CLEAN, contentVersion: 2 });
  const r = H.o.importPackages({}, FOUNDER);
  assert.equal(r.results.find((x) => x.outcome === "held").code, "EXISTING_POST_KEPT");
  const now = H.o.state().posts.filter((q) => q.package.imported && q.lifecycle !== "superseded");
  assert.equal(now.length, 1, "the newer version is not in the queue");
  assert.equal(now[0].lifecycle, "approved");
  assert.ok(H.o.preflight().find((x) => x.title === now[0].package.title).reasons.some((t) => /newer version/.test(t)));
  assert.equal(H.xcalls.length, 0);
});

test("approved but stale is shown as needing a founder decision", async () => {
  const H = harness();
  write(H.root, "a", CLEAN);
  H.o.importPackages({}, FOUNDER);
  const p = post(H);
  design(H, p);
  await approve(H, p);
  write(H.root, "a", { ...CLEAN, contentVersion: 2 });
  H.o.importPackages({}, FOUNDER);
  const q = H.o.state().posts.find((x) => x.decisionId === p.decisionId);
  assert.equal(q.lifecycle, "approved");
  assert.ok(q.approvedStale?.heldContentSha);
});

test("replace is founder-only in effect: import never replaces, an open job blocks, the replacement is a draft", async () => {
  const H = harness();
  write(H.root, "a", CLEAN);
  H.o.importPackages({}, FOUNDER);
  const p = post(H);
  design(H, p);
  await approve(H, p);
  assert.equal(H.o.replaceHeldVersion({ decisionId: p.decisionId }, FOUNDER).code, "NOTHING_HELD");
  write(H.root, "a", { ...CLEAN, contentVersion: 2 });
  H.o.importPackages({}, FOUNDER);
  H.o.importPackages({}, FOUNDER);
  assert.equal(H.store.list().filter((e) => e.kind === "post-held-version").length, 1, "append once");
  const r = H.o.replaceHeldVersion({ decisionId: p.decisionId }, FOUNDER);
  assert.equal(r.ok, true, JSON.stringify(r));
  const posts = H.o.state().posts.filter((q) => q.package.imported);
  assert.equal(posts.find((q) => q.decisionId === p.decisionId).lifecycle, "invalidated");
  assert.equal(posts.filter((q) => q.lifecycle === "drafted").length, 1);
  assert.equal(H.xcalls.length, 0);
});

test("founder hold: READY at the gate still cannot get a job, and a job made before the hold cannot send; an open job blocks replacement", async () => {
  const H = harness();
  write(H.root, "a", CLEAN);
  H.o.importPackages({}, FOUNDER);
  const p = post(H);
  design(H, p);
  await approve(H, p);
  assert.equal(H.o.publishing.setHold({ decisionId: p.decisionId, held: true, reason: "QB unresolved" }, FOUNDER).ok, true);
  assert.equal(H.o.preflight().find((x) => x.title === p.package.title).status, "HELD");
  assert.equal(H.o.publishing.schedule({ decisionId: p.decisionId, at: "2026-10-30T21:30:00.000Z" }, FOUNDER).code, "FOUNDER_HOLD");
  assert.ok(H.o.state().posts.find((q) => q.decisionId === p.decisionId).founderHold);
  H.o.publishing.setHold({ decisionId: p.decisionId, held: false }, FOUNDER);
  assert.equal(H.o.publishing.schedule({ decisionId: p.decisionId, at: "2026-10-30T21:30:00.000Z" }, FOUNDER).ok, true);
  H.o.publishing.setHold({ decisionId: p.decisionId, held: true }, FOUNDER);
  H.setNow("2026-10-30T21:31:00.000Z");
  const r = await H.o.publishing.runDue();
  assert.equal(JSON.stringify(r).includes("FOUNDER_HOLD"), true, JSON.stringify(r).slice(0, 300));
  assert.equal(H.xcalls.length, 0);
  const K = harness();
  write(K.root, "a", CLEAN);
  K.o.importPackages({}, FOUNDER);
  const k = post(K);
  design(K, k);
  await approve(K, k);
  K.o.publishing.schedule({ decisionId: k.decisionId, at: "2026-10-30T21:30:00.000Z" }, FOUNDER);
  write(K.root, "a", { ...CLEAN, contentVersion: 2 });
  K.o.importPackages({}, FOUNDER);
  const c = K.o.replaceHeldVersion({ decisionId: k.decisionId }, FOUNDER);
  assert.equal(c.code, "OPEN_JOB");
});

const staleRig = async () => {
  const H = harness();
  const first = write(H.root, "a", CLEAN);
  const firstRaw = fs.readFileSync(path.join(H.root, "packages", "a.json"), "utf8");
  H.o.importPackages({}, FOUNDER);
  const p = post(H);
  design(H, p);
  await approve(H, p);
  write(H.root, "a", { ...CLEAN, contentVersion: 2 });
  H.o.importPackages({}, FOUNDER);
  return { H, p, first, firstRaw };
};
test("approvedStale is the same after reloading the ledger from disk", async () => {
  const { H, p } = await staleRig();
  const before = H.o.state().posts.find((q) => q.decisionId === p.decisionId).approvedStale;
  assert.ok(before);
  const store = createFileStore({ dir: path.join(H.dir, "ledger"), clock: () => NOW });
  const o = createOrchestrator({ store, clock: () => NOW, outDir: H.dir, calendarDataSource: { ...src(H.files) }, env: { GTP_CC_X_HANDLE: "GameTimePicksHQ", GTP_CC_IMPORT_ROOT: H.root }, publishing: {} });
  assert.deepEqual(o.state().posts.find((q) => q.decisionId === p.decisionId).approvedStale, before);
});
test("published and rejected posts refuse replacement", async () => {
  const { H, p } = await staleRig();
  H.store.append("publish-receipt", "test", { decisionId: p.decisionId, postId: p.postId, canonicalUrl: "u", providerPostId: "1" });
  assert.equal(H.o.replaceHeldVersion({ decisionId: p.decisionId }, FOUNDER).code, "NOT_REPLACEABLE");
  const R = harness();
  write(R.root, "a", CLEAN);
  R.o.importPackages({}, FOUNDER);
  const r = post(R);
  const v = await R.o.decide({ decisionId: r.decisionId, verdict: "reject", digest: r.subjectDigest, note: "no" }, FOUNDER);
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.equal(R.o.replaceHeldVersion({ decisionId: r.decisionId }, FOUNDER).code, "NOT_REPLACEABLE");
});
test("restoring the approved file clears the stale notice", async () => {
  const { H, p, firstRaw } = await staleRig();
  fs.writeFileSync(path.join(H.root, "packages", "a.json"), firstRaw);
  assert.equal(H.o.state().posts.find((q) => q.decisionId === p.decisionId).approvedStale, null);
  assert.equal(H.o.replaceHeldVersion({ decisionId: p.decisionId }, FOUNDER).code, "NOTHING_HELD");
});

test("a newer version that would not import leaves the approval unchanged and shows why", async () => {
  const { H, p } = await staleRig();
  const f = path.join(H.root, "packages", "a.json");
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  const outside = path.join(tempDir("gtp-cc-outside-"), "x.png");
  fs.writeFileSync(outside, "x");
  d.images[0].path = outside;
  fs.writeFileSync(f, JSON.stringify(d));
  const r = H.o.replaceHeldVersion({ decisionId: p.decisionId }, FOUNDER);
  assert.equal(r.code, "NEWER_VERSION_REFUSED");
  const q = H.o.state().posts.find((x) => x.decisionId === p.decisionId);
  assert.equal(q.lifecycle, "approved");
  assert.ok(q.approvedStale.replaceRefused);
  assert.equal(H.xcalls.length, 0);
});

import { X_CREATE_POST_URL } from "../publishers/x-api.mjs";
import { liveAuthorizationText } from "../orchestrator/publish-flow.mjs";
function liveRig() {
  const dir = tempDir("gtp-cc-import-"), root = tempDir("gtp-cc-import-src-");
  let t = NOW; const clock = () => t;
  const store = createFileStore({ dir: path.join(dir, "ledger"), clock });
  const ctl = { x: [], gateX: null, gateFresh: null, xFail: false };
  let id = 0;
  const fetch = async (u) => {
    u = String(u);
    if (ctl.gateX) await ctl.gateX;
    ctl.x.push(u);
    if (u === X_CREATE_POST_URL) { if (ctl.xFail) throw new Error("socket hang up"); return new Response(JSON.stringify({ data: { id: `211539999999999${90 + (++id)}` } }), { status: 201 }); }
    return new Response(JSON.stringify({ data: { id: `M${++id}` } }), { status: 200 });
  };
  const oauth = { accessToken: async () => ({ ok: true, token: "AT" }), status: async () => ({ connected: true, scopes: ["tweet.write", "media.write"] }) };
  const refreshData = async () => { if (ctl.gateFresh) await ctl.gateFresh(); return { ok: true, detail: "t" }; };
  const o = createOrchestrator({ store, clock, outDir: dir, calendarDataSource: { ...src({ [LANE_REF]: LANE_RAW }) }, env: { GTP_CC_X_HANDLE: "GameTimePicksHQ", GTP_CC_IMPORT_ROOT: root }, publishing: { oauth, fetch, refreshData } });
  return { o, dir, root, store, ctl, setNow: (v) => { t = v; }, creates: () => ctl.x.filter((x) => x === X_CREATE_POST_URL).length };
}
const liveStale = async () => {
  const H = liveRig();
  write(H.root, "a", CLEAN);
  H.o.importPackages({}, FOUNDER);
  const p = post(H);
  design(H, p);
  assert.equal((await approve(H, p)).ok, true);
  await H.o.publishing.setPolicy({ mode: "live", capUsd: 5, authorization: liveAuthorizationText(5) }, FOUNDER);
  return { H, p };
};
const life = (H, p) => H.o.state().posts.find((x) => x.decisionId === p.decisionId).lifecycle;
const tick = () => new Promise((r) => setTimeout(r, 30));

test("a blocked newer version never voids a clean approval", async () => {
  for (const over of [{ verification: { passed: false, checks: [], cellsVerified: 0 } }, { testData: true }, { window: { opensAt: NOW, closesAt: "2026-10-30T16:00:00.000Z" } }, { anomalyCheck: "REVIEW", anomalies: [{}] }]) {
    const { H, p } = await liveStale();
    write(H.root, "a", { ...CLEAN, contentVersion: 2, ...over });
    H.o.importPackages({}, FOUNDER);
    assert.equal(H.o.replaceHeldVersion({ decisionId: p.decisionId }, FOUNDER).code, "NEWER_VERSION_REFUSED", JSON.stringify(over));
    assert.equal(life(H, p), "approved");
  }
});
test("an unknown outcome blocks replacement, on the same post id and on a changed one", async () => {
  for (const changed of [false, true]) {
    const { H, p } = await liveStale();
    H.ctl.xFail = true;
    await H.o.publishing.publishNow({ decisionId: p.decisionId, live: true }, FOUNDER);
    H.ctl.xFail = false;
    const cc = changed ? { commandCenter: { ...JSON.parse(fs.readFileSync(path.join(H.root, "packages/a.json"))).commandCenter, postId: "2026-10-30:NBA:nba_game_winner:401-b" } } : {};
    write(H.root, "a", { ...CLEAN, contentVersion: 2, ...cc });
    H.o.importPackages({}, FOUNDER);
    assert.equal(H.o.replaceHeldVersion({ decisionId: p.decisionId }, FOUNDER).code, "OPEN_JOB");
    assert.equal(life(H, p), "approved");
    assert.equal(H.creates(), 1, "no second create-post");
  }
});
test("replace refuses mid-send; a hold says it cannot recall the send", async () => {
  const { H, p } = await liveStale();
  let open; H.ctl.gateX = new Promise((r) => { open = r; });
  const sending = H.o.publishing.publishNow({ decisionId: p.decisionId, live: true }, FOUNDER);
  await tick();
  write(H.root, "a", { ...CLEAN, contentVersion: 2 });
  H.o.importPackages({}, FOUNDER);
  const h = H.o.publishing.setHold({ decisionId: p.decisionId, held: true }, FOUNDER);
  assert.match(h.warning, /cannot recall/);
  assert.equal(H.o.replaceHeldVersion({ decisionId: p.decisionId }, FOUNDER).code, "OPEN_JOB");
  open(); await sending;
  assert.equal(H.creates(), 1);
});
test("a hold, or a cancel and replace, during the data refresh stops the send before the claim", async () => {
  {
    const { H, p } = await liveStale();
    let open; H.ctl.gateFresh = () => new Promise((r) => { open = r; });
    H.o.publishing.schedule({ decisionId: p.decisionId, at: "2026-10-30T21:30:00.000Z" }, FOUNDER);
    H.setNow("2026-10-30T21:31:00.000Z");
    const run = H.o.publishing.runDue();
    await tick();
    H.o.publishing.setHold({ decisionId: p.decisionId, held: true }, FOUNDER);
    open(); await run;
    assert.equal(H.creates(), 0);
  }
  {
    const { H, p } = await liveStale();
    let open; H.ctl.gateFresh = () => new Promise((r) => { open = r; });
    const s = H.o.publishing.schedule({ decisionId: p.decisionId, at: "2026-10-30T21:30:00.000Z" }, FOUNDER);
    H.setNow("2026-10-30T21:31:00.000Z");
    const run = H.o.publishing.runDue();
    await tick();
    write(H.root, "a", { ...CLEAN, contentVersion: 2 });
    H.o.importPackages({}, FOUNDER);
    H.o.publishing.cancel({ jobId: s.job.jobId }, FOUNDER);
    open(); await run;
    assert.equal(H.creates(), 0);
  }
});
test("v2, v3, back to v2: the newest import is the one held, and replace works", async () => {
  const { H, p } = await liveStale();
  const v2 = write(H.root, "a", { ...CLEAN, contentVersion: 2 });
  H.o.importPackages({}, FOUNDER);
  write(H.root, "a", { ...CLEAN, contentVersion: 3 });
  H.o.importPackages({}, FOUNDER);
  const again = write(H.root, "a", { ...CLEAN, contentVersion: 2 });
  assert.equal(again.contentSha256, v2.contentSha256);
  H.o.importPackages({}, FOUNDER);
  const r = H.o.replaceHeldVersion({ decisionId: p.decisionId }, FOUNDER);
  assert.equal(r.ok, true, JSON.stringify(r));
});
test("a same-content re-render behind an approval is surfaced", async () => {
  const { H, p } = await liveStale();
  const old = JSON.parse(fs.readFileSync(path.join(H.root, "packages/a.json")));
  write(H.root, "a", { ...CLEAN, contentSha256: old.contentSha256 });
  H.o.importPackages({}, FOUNDER);
  assert.ok(H.o.state().posts.find((x) => x.decisionId === p.decisionId).approvedStale);
});
test("the founder check comes before any write", async () => {
  const { H, p } = await liveStale();
  write(H.root, "a", { ...CLEAN, contentVersion: 2 });
  H.o.importPackages({}, FOUNDER);
  fs.writeFileSync(path.join(H.root, "packages/a.json"), "{bad");
  const held = () => H.store.list().filter((e) => e.kind === "post-held-version").length, before = held();
  const r = H.o.replaceHeldVersion({ decisionId: p.decisionId }, { role: "publisher", id: "pat" });
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.notEqual(r.code, "NEWER_VERSION_REFUSED");
  assert.equal(held(), before);
  assert.equal(life(H, p), "approved");
});
test("approvedStale follows the source file; without the file it stays and replace refuses", async () => {
  const { H, p } = await liveStale();
  write(H.root, "a", { ...CLEAN, contentVersion: 2 });
  H.o.importPackages({}, FOUNDER);
  fs.rmSync(path.join(H.root, "packages/a.json"));
  assert.ok(H.o.state().posts.find((x) => x.decisionId === p.decisionId).approvedStale);
  assert.equal(H.o.replaceHeldVersion({ decisionId: p.decisionId }, FOUNDER).code, "NEWER_VERSION_REFUSED");
  assert.equal(life(H, p), "approved");
});
test("a held post can't be recorded as scheduled or published by hand", async () => {
  const { H, p } = await liveStale();
  H.o.publishing.setHold({ decisionId: p.decisionId, held: true }, FOUNDER);
  const r = H.o.recordPost({ decisionId: p.decisionId, action: "schedule", scheduledFor: "2026-10-30T21:30:00.000Z" }, FOUNDER);
  assert.equal(r.code, "FOUNDER_HOLD");
});

test("a started event can never become publishable: approve, schedule, hold release, replace or import", async () => {
  const { H, p } = await liveStale();
  write(H.root, "a", { ...CLEAN, contentVersion: 2 });
  H.o.importPackages({}, FOUNDER);
  H.o.publishing.setHold({ decisionId: p.decisionId, held: true }, FOUNDER);
  H.setNow("2026-10-30T23:00:00.000Z");
  assert.equal(H.o.publishing.setHold({ decisionId: p.decisionId, held: false }, FOUNDER).code, "EVENT_STARTED");
  assert.equal(H.o.replaceHeldVersion({ decisionId: p.decisionId }, FOUNDER).code, "EVENT_STARTED");
  assert.equal(H.o.publishing.schedule({ decisionId: p.decisionId, at: "2026-10-31T00:00:00.000Z" }, FOUNDER).code, "FOUNDER_HOLD");
  const D = liveRig();
  const pk = write(D.root, "b", CLEAN);
  D.o.importPackages({}, FOUNDER);
  const d = post(D);
  design(D, d);
  D.setNow("2026-10-30T23:00:00.000Z");
  assert.equal((await approve(D, d)).ok, false);
  const A = await liveStale();
  A.H.setNow("2026-10-30T23:00:00.000Z");
  assert.equal(A.H.o.publishing.schedule({ decisionId: A.p.decisionId, at: "2026-10-31T00:00:00.000Z" }, FOUNDER).code, "EVENT_STARTED");
  const L = liveRig();
  L.setNow("2026-10-30T23:00:00.000Z");
  write(L.root, "c", { ...CLEAN, window: undefined });
  L.o.importPackages({}, FOUNDER);
  assert.equal(post(L).package.status, "BLOCKED");
  assert.equal(pk.dedupeId.length > 0, true);
  assert.equal(H.creates() + D.creates() + A.H.creates() + L.creates(), 0);
});

const source = (H, displayedCells, name = "render.json") => { const f = path.join(H.root, "packages", name), raw = JSON.stringify({ displayedCells }); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f.replace(/\.json$/, ".src"), raw); return { path: f.replace(/\.json$/, ".src"), sha256: sha256(raw) }; };
const CELLS = { date: "2026-11-03", contentType: "NBA_GAME_POST", content: {}, window: { opensAt: NOW, closesAt: TIP } };
test("forecast cells: missing states are refused, BLOCKED can't publish, REVIEW needs the founder, the gate never touches values", async () => {
  const pkg = (H, cells) => write(H.root, "a", { ...CLEAN, ...CELLS, ...(cells ? { forecastCells: cells, renderSource: source(H, cells.map((x) => x.cellId)) } : {}) });
  const M = liveRig();
  pkg(M, null);
  assert.equal(M.o.importPackages({}, FOUNDER).counts.refused, 1);
  const Bad = liveRig();
  pkg(Bad, [{ cellId: "x:pts", state: "MAYBE" }]);
  assert.equal(Bad.o.importPackages({}, FOUNDER).counts.refused, 1);
  const B = liveRig();
  pkg(B, [{ cellId: "x:pts", state: "BLOCKED" }]);
  B.o.importPackages({}, FOUNDER);
  const bp = post(B);
  assert.ok(bp.package.blockers.some((b) => b.code === BLOCK.CELL_BLOCKED));
  design(B, bp);
  assert.equal((await approve(B, bp)).ok, false);
  const R = liveRig();
  pkg(R, [{ cellId: "x:pts", state: "REVIEW", reason: "minutes" }, { cellId: "x:reb", state: "PASS" }]);
  R.o.importPackages({}, FOUNDER);
  const rp = post(R);
  design(R, rp);
  assert.equal((await approve(R, rp)).code, "FORECAST_REVIEW_NOT_CONFIRMED");
  const o = rp.options.find((c) => c.captionId === "B");
  const yes = await R.o.decide({ decisionId: rp.decisionId, verdict: "approve", captionId: "B", digest: o.digest, forecastReviewConfirmed: true }, FOUNDER);
  assert.equal(yes.ok, true, JSON.stringify(yes));
  assert.deepEqual(post(R).resolution.forecastReviewConfirmed, ["x:pts"]);
  assert.equal(M.creates() + B.creates() + R.creates(), 0);
});
test("forecast cells are not required before the cutover date", () => {
  const H = liveRig();
  write(H.root, "a", { ...CLEAN, contentType: "NBA_GAME_POST" });
  assert.equal(H.o.importPackages({}, FOUNDER).counts.refused ?? 0, 0);
});

test("displayed cells must match stated cells exactly, against a checksummed render source", () => {
  const cells = [{ cellId: "a", state: "PASS" }, { cellId: "b", state: "PASS" }];
  const go = (shown, tamper) => {
    const H = liveRig();
    const renderSource = source(H, shown);
    if (tamper) fs.writeFileSync(renderSource.path, "{}");
    write(H.root, "a", { ...CLEAN, ...CELLS, forecastCells: cells, renderSource });
    return H.o.importPackages({}, FOUNDER).counts;
  };
  assert.equal(go(["a", "b"]).imported, 1);
  assert.equal(go(["a", "b", "c"]).refused, 1, "displayed with no state");
  assert.equal(go(["a"]).refused, 1, "state with no display");
  assert.equal(go(["a", "b"], true).refused, 1, "checksum");
  assert.equal(go([]).refused, 1, "empty");
});

test("the gate check reports holds and exceptions instead of READY", async () => {
  const { H, p } = await liveStale();
  assert.equal(H.o.preflight().find((x) => x.title === p.package.title).status, "READY");
  H.o.publishing.setHold({ decisionId: p.decisionId, held: true }, FOUNDER);
  assert.equal(H.o.preflight().find((x) => x.title === p.package.title).status, "HELD");
  const E = liveRig();
  write(E.root, "e", { ...CLEAN, anomalyCheck: "EXCEPTION" });
  E.o.importPackages({}, FOUNDER);
  assert.equal(E.o.preflight()[0].status, "REQUIRES_FOUNDER_REVIEW");
});

test("hosted: a missing source file is not a block, but a held newer version is; results send only from the active host", async () => {
  const { H, p } = await liveStale();
  const { store, dir, root } = H;
  const C = createOrchestrator({ store, clock: () => NOW, outDir: dir, hosted: true, calendarDataSource: { ...src({ [LANE_REF]: LANE_RAW }) }, env: { GTP_CC_IMPORT_ROOT: root }, publishing: {} });
  const row = () => C.preflight().find((x) => x.title === p.package.title);
  fs.rmSync(path.join(root, "packages/a.json"));
  assert.equal(H.o.preflight().find((x) => x.title === p.package.title).status, "BLOCKED", "local needs the file");
  assert.ok(!row().reasons.some((r) => /source package/.test(r)), JSON.stringify(row()));
  store.append("post-held-version", "t", { decisionId: p.decisionId, postId: p.package.postId, heldContentSha: "new", heldFile: "x" });
  assert.ok(row().reasons.some((r) => /newer version/.test(r)));
  assert.deepEqual(await C.resultsAutomation.sendDue(), []);
});

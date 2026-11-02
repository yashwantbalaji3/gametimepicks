import { REPO_ROOT } from "../lib/util.mjs";
/**
 * THE IMPORTER — reads Launch Readiness' packages and proposes each one for founder review. It never approves, never
 * schedules, never sends and never recomputes a number.
 *
 *   read package → validate → check every image's hash and real size → check its data references against the data
 *   commit it names → classify blockers and overlap → copy the images into the media store under their hashes →
 *   append a post proposal → record the whole run.
 *
 * Re-importing is safe: the same content is a no-op; new content under the same dedupeId is a new version of a draft
 * (the old draft is superseded), but never replaces a post that is approved, scheduled, published or rejected.
 * A refusal writes nothing. Real-line cards are private: no price or line text enters the ledger, their media is
 * flagged so it never leaves this Mac, and they can't be approved.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sha256, shortId } from "../lib/util.mjs";
import { pngSize } from "../render/render-png.mjs";
import { POST_STATUS, sealPackage } from "../contracts/post-queue.mjs";
import { baseIdOf } from "../contracts/social-packages.mjs";
import {
  IMPORT_ASSET_MANIFEST, IMPORT_TYPES, UNSUPPORTED_KIND, BLOCK, importTemplateOf, validatePackage, blockersOf,
  sameClaims, checkImportedCaption, overlapsOf, showsLines, pinnedRef, repoRef, officialReasons, isImported, isReviewCopy,
} from "../contracts/imported-packages.mjs";
import { gitDataSource } from "../recap/multisport-facts.mjs";
import { revisionRequests } from "../contracts/revision-requests.mjs";

export const DEFAULT_IMPORT_ROOT = path.join(os.homedir(), "gtp-private/graphics");
const SPORTS = Object.freeze({ nba: "NBA", nfl: "NFL", ufc: "UFC" });
const fileSafe = (id) => String(id).replace(/[^A-Za-z0-9._-]+/g, "-");
const isPng = (b) => b.length > 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
/** No line or price text in a record the ledger keeps. */
const safeClaims = (claims) => (claims ?? []).filter((c) => !/line|price|odds/i.test(c.key) && !/\b[OU] \d/.test(c.display) && !/[−-]\d{3}\b/.test(c.display));

/**
 * @param {{ store: object, clock: () => string, mediaDir: () => string, posts: () => object[], dataSource: () => object,
 *           repoRoot?: string, env?: object }} ctx
 */
export function createImportFlow(ctx) {
  const { store, clock } = ctx;
  const env = ctx.env ?? {};
  const rights = () => ctx.marketRights?.() ?? null;
  const rootOf = (root) => path.resolve(root ?? env.GTP_CC_IMPORT_ROOT ?? DEFAULT_IMPORT_ROOT);

  /** One image: inside the import root, a PNG of the promised size, with the promised hash. */
  function readImage(root, i) {
    const real = fs.realpathSync(i.path);
    if (!real.startsWith(`${fs.realpathSync(root)}${path.sep}`)) throw new Error(`image outside the import folder: ${i.path}`);
    const bytes = fs.readFileSync(real);
    if (!isPng(bytes)) throw new Error(`not a PNG: ${path.basename(i.path)}`);
    if (sha256(bytes) !== i.sha256) throw new Error(`checksum mismatch: ${path.basename(i.path)}`);
    const size = pngSize(bytes), scale = i.scale ?? 1;
    if (size.width !== i.width * scale || size.height !== i.height * scale) throw new Error(`size mismatch: ${path.basename(i.path)} is ${size.width}×${size.height}`);
    return bytes;
  }
  function store1(bytes, postId, sha) {
    const dir = ctx.mediaDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = `${fileSafe(postId)}-${sha.slice(0, 12)}.png`;
    const dest = path.join(dir, file);
    if (fs.existsSync(dest)) { if (sha256(fs.readFileSync(dest)) !== sha) throw new Error(`media conflict: ${file}`); }
    else {
      const tmp = `${dest}.import-${process.pid}`;
      fs.writeFileSync(tmp, bytes, { flag: "wx" });
      fs.renameSync(tmp, dest);
    }
    return file;
  }

  /** Each referenced file, at the commit the package names, must be the file it hashed. */
  function provenance(p, srcAt) {
    const refs = (p.snapshotRefs ?? []).filter((r) => repoRef(r.ref));
    if (!srcAt) return { verified: false, detail: "the data commit is not in this checkout", refs: refs.length };
    const bad = [];
    for (const r of refs) {
      const raw = srcAt.read(r.ref);
      if (raw == null) bad.push(`${r.ref} is not in ${String(srcAt.commit).slice(0, 12)}`);
      else if (sha256(raw) !== r.sha256) bad.push(`${r.ref} differs from the commit`);
    }
    return { verified: !bad.length, detail: bad.join("; ") || "every data reference matches its commit", refs: refs.length };
  }
  const sourceAt = (commit) => {
    if (!commit) return null;
    try { return gitDataSource(ctx.repoRoot ?? env.GTP_CC_DATA_REPO, commit); } catch { return null; }
  };

  /** Package JSON → the post package the queue understands. */
  function toPost(p, { root, sourceFile }) {
    const cc = p.commandCenter;
    const type = IMPORT_TYPES[p.contentType] ?? null;
    const sport = cc.sport ?? SPORTS[p.sport] ?? String(p.sport).toUpperCase();
    const lines = showsLines(p.contentType, p.content, p.containsMarketData);
    const held = lines && !rights();
    const publishing = p.images.filter((i) => (i.scale ?? 1) === 1).slice(0, 4);
    const hiRes = p.images.filter((i) => (i.scale ?? 1) !== 1);
    const read = (i) => ({ i, bytes: readImage(root, i) });
    const pub = publishing.map(read), hi = hiRes.map(read);
    if (!pub.length) throw new Error("no publish-size image");
    const srcAt = sourceAt(cc.dataCommit);
    const prov = provenance(p, srcAt);
    if (srcAt && !prov.verified) throw new Error(`provenance: ${prov.detail}`);
    const postId = cc.postId;
    const mediaSet = pub.map(({ i, bytes }, n) => ({ file: store1(bytes, postId, i.sha256), sha256: i.sha256, width: i.width, height: i.height, kind: "graphic", altText: pub.length > 1 ? `${cc.title} (${n + 1} of ${pub.length})` : cc.title }));
    const hiResFiles = hi.map(({ i, bytes }) => ({ file: store1(bytes, postId, i.sha256), sha256: i.sha256, width: i.width * i.scale, height: i.height * i.scale }));
    const recommendation = p.recommendation ?? null;
    const blockers = blockersOf({ ...p, sport }, { now: clock(), rights: rights() });
    const reasons = [...blockers.map((b) => b.detail), ...(p.eligibilityClass === "ESTIMATE" ? ["Estimate: quote it only as an estimate, never as a validated probability."] : [])];
    const pkg = {
      postId, slotId: `import:${p.contentType}`, date: p.date, sport, kind: type?.kind ?? UNSUPPORTED_KIND, format: type?.label ?? p.contentType,
      title: cc.title, status: blockers.length ? POST_STATUS.BLOCKED : POST_STATUS.READY, reasons, claims: held ? safeClaims(cc.claims) : cc.claims ?? [],
      media: mediaSet[0], mediaSet, hiRes: hiResFiles, captions: [], label: null, dataCommit: cc.dataCommit ?? null, hasMiss: Boolean(cc.hasMiss), noForecastClaims: false,
      eventId: cc.eventId ?? null, tipUtc: cc.firstStartUtc ?? null, firstStartUtc: cc.firstStartUtc ?? null, suggestedPublishAt: cc.suggestedPublishAt ?? null,
      contentKey: p.contentSha256, template: importTemplateOf(p.contentType, sport, p.designVersion ?? "1"), assetManifest: IMPORT_ASSET_MANIFEST,
      evidence: cc.evidence ?? [], blockers, supported: Boolean(type?.supported), privateReview: held || undefined,
      ...(p.contentType === "RESULTS_RECAP" ? { resultsDate: p.date } : {}), ...(p.content?.week != null ? { week: p.content.week } : {}),
      imported: {
        forecastCells: p.forecastCells ?? null,
        schema: p.schema, dedupeId: p.dedupeId, contentType: p.contentType, variant: p.variant ?? null, sourceFile, contentSha256: p.contentSha256,
        idempotencyKey: p.idempotencyKey ?? null, eligibilityClass: p.eligibilityClass ?? null, snapshotRefs: p.snapshotRefs ?? [], verification: p.verification ?? null,
        provenance: prov, freshness: p.freshness ?? null, window: p.window ?? null, recommendation, disclosures: p.disclosures ?? [], socialAuthorized: p.approval?.socialAuthorized === true,
        designVersion: p.designVersion ?? "1", rights: lines ? "QUOTE_ON_SOCIAL" : "MODEL_ONLY", anomalyCheck: p.anomalyCheck ?? "NOT_RUN", anomalies: p.anomalies ?? [], caveats: p.availabilityCaveats ?? [], modelVersion: p.modelVersion ?? null, containsMarketData: lines, snapshotId: p.snapshotId ?? p.content?.game?.snapshotId ?? null, quote: p.content?.quotedAt ?? null, content: held ? null : p.content ?? null, importedAt: clock(),
      },
    };
    const options = [...(cc.captions ?? [])];
    if (p.caption && !held && !options.some((c) => c.text === p.caption)) options.push({ id: "L", tone: "long, with disclosures", source: "template", text: p.caption });
    pkg.captions = options.map((c) => ({ ...c, source: c.source ?? "template" }));
    return sealPackage(pkg, { check: checkImportedCaption });
  }

  function propose(pkg, runId, lifted = []) {
    const decisionId = shortId("post", { dedupeId: pkg.imported.dedupeId, contentSha256: pkg.contentKey, ...(lifted.length ? { lifted } : {}) });
    store.append("decision-request", "launch-readiness-import", {
      decisionId, commandId: `import:${runId}`, kind: "post", subjectType: "post-package", postId: pkg.postId, date: pkg.date, package: pkg, calendar: null, requestedBy: "launch-readiness-import",
      question: `${pkg.sport} · ${pkg.title}: approve one caption, reject, ask for a revision, or defer? Approving authorizes this one post; nothing was scheduled by the import.`,
      options: pkg.captions.map((c) => ({ captionId: c.id, tone: c.tone, source: c.source, text: c.text, check: c.check, digest: c.digest, publishBundle: c.publishBundle })),
    });
    return decisionId;
  }

  /** One package. @returns a report row; a refusal has touched nothing. */
  /** Would this held file import? Reads and validates; records no post. */
  function checkImportable(file, sha) {
    try {
      const p = JSON.parse(fs.readFileSync(file, "utf8"));
      if (p.contentSha256 !== sha) return { ok: false, detail: "the held file has changed: import again first" };
      const bad = validatePackage(p);
      if (bad.length) return { ok: false, detail: bad.join("; ").slice(0, 300) };
      const pkg = toPost(p, { root: rootOf(), sourceFile: file });
      if (pkg.status !== POST_STATUS.READY) return { ok: false, detail: `the newer version is ${pkg.status}: ${(pkg.reasons ?? []).join("; ").slice(0, 260)}` };
      const others = ctx.posts().filter((x) => x.package?.imported?.dedupeId !== p.dedupeId && baseIdOf(x.package?.postId ?? "") !== baseIdOf(pkg.postId));
      const over = overlapsOf(pkg, others);
      if (over.blocking.length) return { ok: false, detail: `the newer version overlaps ${over.blocking.map((x) => x.package.title).join("; ")}` };
      return { ok: true };
    } catch (err) { return { ok: false, detail: String(err.message ?? err).slice(0, 300) }; }
  }

  function importOne(p, { root, sourceFile, runId }) {
    const id = { dedupeId: p?.dedupeId ?? path.basename(sourceFile), contentType: p?.contentType ?? null };
    const bad = validatePackage(p);
    if (bad.length) return { ...id, outcome: "refused", code: "INVALID_PACKAGE", detail: bad.join("; ") };
    const postId = p.commandCenter.postId;
    const all = ctx.posts();
    const mine = all.filter((x) => x.package?.imported?.dedupeId === p.dedupeId || baseIdOf(x.package?.postId ?? "") === baseIdOf(postId));
    const same = mine.filter((x) => x.package?.contentKey === p.contentSha256 && x.lifecycle !== "superseded").at(-1) ?? mine.find((x) => x.package?.contentKey === p.contentSha256);
    // same content, but a blocker has been lifted since (an authorization, not a date): propose it again as it now stands
    const nowCodes = new Set(blockersOf({ ...p, sport: p.commandCenter.sport ?? SPORTS[p.sport] }, { now: clock(), rights: rights() }).map((b) => b.code));
    const lifted = same?.lifecycle === "drafted" ? (same.package.blockers ?? []).map((b) => b.code).filter((c) => ![BLOCK.EXPIRED, BLOCK.OVERLAP].includes(c) && !nowCodes.has(c)) : [];
    // a clean export has the same content as its review copy, on a new image: that is the one thing not a duplicate
    const cleanArrived = p.approval?.socialAuthorized === true && same && isReviewCopy(same.package);
    // so is a revision: a re-render with the same data keeps its content hash and changes its images
    const publishImages = (p.images ?? []).filter((i) => (i.scale ?? 1) === 1).map((i) => i.sha256).join("|");
    const reRendered = Boolean(same) && publishImages !== (same.package.mediaSet ?? []).map((m) => m.sha256).join("|");
    if (same && !lifted.length && !cleanArrived && !reRendered) return { ...id, outcome: "duplicate", code: "SAME_CONTENT", detail: "already imported", decisionId: same.decisionId };
    // the one thing that may follow an approval: the clean export of an approved review copy (it needs its own approval)
    const cleanOf = p.approval?.socialAuthorized === true ? mine.find((x) => x.lifecycle === "approved" && !x.receipt && isReviewCopy(x.package)) : null;
    const revision = [...lifted, ...(cleanArrived ? ["clean"] : []), ...(reRendered ? [sha256(publishImages).slice(0, 12)] : [])];
    const held = mine.find((x) => x !== cleanOf && (x.receipt || ["approved", "scheduled", "published", "rejected"].includes(x.lifecycle)));
    if (held?.lifecycle === "approved" && !held.receipt) {
      // the newest held version wins: going back to an earlier one records it again; a re-render counts as a version
      const last = store.list().filter((e) => e.kind === "post-held-version" && e.data.decisionId === held.decisionId).at(-1)?.data;
      if (last?.heldContentSha !== p.contentSha256 || last?.heldImages !== publishImages) store.append("post-held-version", "launch-readiness-import", { decisionId: held.decisionId, postId: held.postId, heldContentSha: p.contentSha256, heldImages: publishImages, heldFile: sourceFile, recordedAt: clock() });
    }
    if (held) return { ...id, outcome: "held", code: "EXISTING_POST_KEPT", detail: `a newer version exists, but ${held.decisionId} is ${held.lifecycle}: it is not replaced`, decisionId: held.decisionId };
    let pkg;
    try { pkg = toPost(p, { root, sourceFile }); } catch (err) { return { ...id, outcome: "refused", code: "VERIFICATION_FAILED", detail: String(err.message ?? err).slice(0, 300) }; }
    const over = overlapsOf(pkg, all.filter((x) => !mine.includes(x)));
    if (over.blocking.length) {
      const detail = `Overlaps ${over.blocking.map((x) => `${x.package.title} (${x.lifecycle})`).join("; ")}: it can't go out as well.`;
      pkg = sealPackage({ ...pkg, status: POST_STATUS.BLOCKED, blockers: [...pkg.blockers, { code: BLOCK.OVERLAP, detail }], reasons: [...pkg.reasons, detail], captions: pkg.captions.map(({ digest, publishBundle, chars, ...c }) => c) }, { check: checkImportedCaption });
    } else if (over.noted.length) {
      pkg = { ...pkg, reasons: [...pkg.reasons, `An undecided Command Center draft covers the same content: ${over.noted.map((x) => x.package.title).join("; ")}.`] };
    }
    const claim = store.claim(`import|${p.dedupeId}|${p.contentSha256}${revision.length ? `|${revision.join("+")}` : ""}`, { runId });
    if (!claim.won) return { ...id, outcome: "duplicate", code: "ALREADY_CLAIMED", detail: `claimed by ${claim.record.value.runId}` };
    if (cleanOf) store.append("post-status", "launch-readiness-import", { decisionId: cleanOf.decisionId, postId: cleanOf.postId, status: "invalidated", reason: "the clean export arrived: approve that version", replacedBy: pkg.postId, recordedAt: clock() });
    // the check the founder asked for: does this clean image carry exactly the content that was approved?
    if (cleanOf) pkg = { ...pkg, imported: { ...pkg.imported, cleanOf: { decisionId: cleanOf.decisionId, captionId: cleanOf.resolution?.captionId ?? null, sameContent: cleanOf.package.contentKey === pkg.contentKey } }, reasons: [...pkg.reasons, cleanOf.package.contentKey === pkg.contentKey ? "Clean export of the review copy you approved: same content." : "This clean export differs from the review copy you approved: the data changed, check it."] };
    const decisionId = propose(pkg, runId, revision);
    return { ...id, outcome: mine.length ? "new-version" : "imported", decisionId, postId, status: pkg.status, blockers: pkg.blockers.map((b) => b.code), images: pkg.mediaSet.length, hiRes: pkg.hiRes.length, captionsOk: pkg.captions.filter((c) => c.check.ok).length };
  }

  /** Founder: import every package in the folder. Safe to run any number of times. */
  function importPackages({ root } = {}, actor) {
    const dir = rootOf(root);
    const runId = shortId("import", { at: clock(), n: store.list().filter((e) => e.kind === "import-run").length });
    const results = [];
    const pkgDir = path.join(dir, "packages");
    if (!fs.existsSync(pkgDir)) return { ok: false, code: "NO_PACKAGES", detail: `no packages folder at ${pkgDir}` };
    for (const f of fs.readdirSync(pkgDir).filter((x) => x.endsWith(".json")).sort()) {
      const sourceFile = path.join(pkgDir, f);
      let p;
      try { p = JSON.parse(fs.readFileSync(sourceFile, "utf8")); } catch (err) { results.push({ dedupeId: f, outcome: "refused", code: "BAD_JSON", detail: String(err.message ?? err).slice(0, 200) }); continue; }
      results.push(importOne(p, { root: dir, sourceFile, runId }));
    }
    const counts = {};
    for (const r of results) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
    const images = results.reduce((n, r) => n + (r.images ?? 0), 0);
    // a run that changed nothing is not an event
    if (Object.keys(counts).some((k) => k !== "duplicate")) store.append("import-run", actor?.id ?? "founder", { runId, root: dir, at: clock(), by: actor?.id ?? "founder", counts, images, results });
    try { writeRevisions(); } catch { /* derived file: the import stands */ }
    return { ok: true, runId, counts, images, results };
  }

  /** Approval and the pre-send gate: same package, same data, still allowed. Fails closed. */
  function recheck(pkg) {
    const reasons = [];
    const now = clock();
    if (pkg.status !== POST_STATUS.READY) reasons.push(...(pkg.blockers ?? []).map((b) => b.detail));
    if (!rights() && (showsLines(pkg.imported?.contentType, pkg.imported?.content, pkg.imported?.containsMarketData) || pkg.privateReview)) reasons.push("shows real sportsbook data and no founder authorization is on record");
    const closes = pkg.imported?.window?.closesAt;
    if (Number.isFinite(Date.parse(closes ?? "")) && Date.parse(now) >= Date.parse(closes)) reasons.push(`the publishing window closed at ${closes}`);
    if (!Number.isFinite(Date.parse(pkg.tipUtc ?? "")) || Date.parse(now) >= Date.parse(pkg.tipUtc)) reasons.push("the start has passed (or is unknown)");
    // the source package: a regenerated one means this version is out of date
    try {
      const cur = JSON.parse(fs.readFileSync(pkg.imported.sourceFile, "utf8"));
      if (cur.contentSha256 !== pkg.contentKey) reasons.push("Launch Readiness has a newer version of this package: re-import and approve that one");
    } catch { reasons.push("the source package can't be read: it can't be shown to be current"); }
    let src;
    try { src = ctx.dataSource(); } catch { src = null; }
    if (!src) reasons.push("no data source to re-check against");
    else {
      for (const r of pkg.imported?.snapshotRefs ?? []) {
        if (!repoRef(r.ref) || !pinnedRef(r.ref)) continue;
        const raw = src.read(r.ref);
        if (raw != null && sha256(raw) === r.sha256) continue;
        // a differing file holds a post back only if its claims moved: compare with the pinned bytes at the package's data commit
        let pinned = null;
        try { pinned = pkg.dataCommit ? gitDataSource(REPO_ROOT, pkg.dataCommit).read(r.ref) : null; } catch { pinned = null; }
        if (raw == null || pinned == null || sha256(pinned) !== r.sha256 || !sameClaims(pinned, raw)) reasons.push(`${r.ref} changed since this package was made: Launch Readiness must regenerate it`);
      }
      try { reasons.push(...officialReasons(pkg, src)); } catch (err) { reasons.push(`could not re-check the official data: ${String(err.message ?? err).slice(0, 120)}`); }
    }
    // a sportsbook Top 5 shows the same projections as its model-only twin: the twin's data hold is its hold too
    if (pkg.kind === "lr-nba-top5" && !/-model$/.test(String(pkg.imported?.variant ?? ""))) {
      const twin = ctx.posts().filter((p) => p.package?.imported?.dedupeId === `${pkg.imported.dedupeId}-model`).at(-1);
      if (twin?.package.imported.anomalyCheck === "REVIEW") reasons.push("the model-only version of this board is held for data correction");
    }
    if (pkg.kind === "lr-nba-top5-carousel" && pkg.imported?.anomalyCheck !== "EXCEPTION" && ctx.posts().some((p) => p.lifecycle !== "superseded" && p.package?.kind === "lr-nba-top5" && p.package.date === pkg.date && /-model$/.test(String(p.package.imported?.variant ?? "")) && p.package.imported.anomalyCheck === "REVIEW")) reasons.push("a model-only board in this carousel is held for data correction");
    const over = overlapsOf(pkg, ctx.posts().filter((p) => p.package?.postId !== pkg.postId));
    if (over.blocking.length) reasons.push(`overlaps ${over.blocking.map((x) => x.package.title).join("; ")}`);
    return reasons.length ? { status: POST_STATUS.BLOCKED, reasons } : { status: POST_STATUS.READY, reasons: [] };
  }

  /** For Launch Readiness: the review copies the founder approved, which it may now export clean. Derived, rewritten whole. */
  function writeApprovals() {
    const root = rootOf();
    if (!fs.existsSync(root)) return;
    const approved = ctx.posts().filter((p) => p.lifecycle === "approved" && isReviewCopy(p.package)).map((p) => ({
      dedupeId: p.package.imported.dedupeId, contentSha256: p.package.contentKey, decisionId: p.decisionId, captionId: p.resolution.captionId, caption: p.options.find((o) => o.captionId === p.resolution.captionId)?.text ?? null, approvedAt: p.resolution.approvedAt,
    }));
    const dir = path.join(root, "approvals");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "approved-for-clean-export.json");
    fs.writeFileSync(`${file}.tmp`, `${JSON.stringify({ schema: "gtp-cc-approved-for-clean-export@1", approved }, null, 2)}\n`);
    fs.renameSync(`${file}.tmp`, file);
  }

  /** For Launch Readiness: the founder's revision requests. Derived from the ledger, rewritten whole. */
  function revisionStatus() {
    try { return JSON.parse(fs.readFileSync(path.join(rootOf(), "approvals", "revision-status.json"), "utf8")); } catch { return {}; }
  }
  function writeRevisions() {
    const root = rootOf();
    if (!fs.existsSync(root)) return;
    const dir = path.join(root, "approvals");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "revision-requests.json");
    fs.writeFileSync(`${file}.tmp`, `${JSON.stringify({ schema: "gtp-cc-revision-requests@1", requests: revisionRequests(ctx.posts(), revisionStatus()) }, null, 2)}\n`);
    fs.renameSync(`${file}.tmp`, file);
  }

  const lastRun = () => store.list().filter((e) => e.kind === "import-run").at(-1)?.data ?? null;
  return { checkImportable, importPackages, recheck, lastRun, writeApprovals, writeRevisions, revisionStatus };
}

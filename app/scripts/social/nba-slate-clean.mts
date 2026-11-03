#!/usr/bin/env -S npx tsx
// CLEAN EXPORT OF APPROVED NBA SLATE PACKAGES (the ones nba-slate-deliver.mts put in <import-root>/packages).
//
//   GTP_NBA_UNIFIED_ROSTER=<the slate's roster.json> npx tsx scripts/social/nba-slate-clean.mts --date YYYY-MM-DD --import-root DIR
//
// Reads <import-root>/approvals/approved-for-clean-export.json (Command Center writes it), keeps the entries for this date's
// slate packages, and for each one: the package and its images must match the approval (dedupeId, contentSha256, caption,
// image hashes); it must be clean-eligible (src/lib/social/clean-export.mjs: no anomaly REVIEW, design 2, no market data);
// the card is rebuilt from the same data and as-of, and the rebuilt REVIEW page must render to the very image approved;
// then the banner-free page is rendered. Output: <slug>-clean-<sha8>.json + its image folder in <import-root>/packages,
// written to temp names and renamed (the JSON last), approval.socialAuthorized true, same contentSha256 (Command Center
// pairs it with the approved review copy). An existing <slug>-clean-<sha8>.json is never rewritten. Nothing is posted.
// Exit 0, or 2 when the inputs are unusable, or 3 when a render or write failed (worth a retry); per-entry refusals go to <import-root>/approvals/clean-export-log.jsonl
// and stdout. GTP_NBA_UNIFIED_ROSTER must be set before the card modules load (the footer reads it), hence the dynamic imports.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = (n: string, d: string | null = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const date = arg("date")!, root = arg("import-root")!;
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !root) { console.error("usage: --date YYYY-MM-DD --import-root DIR"); process.exit(2); }
// GTP_CLEAN_NOW (tests only, refused for the live import folder): the clock the expiry check uses.
const live = path.resolve(root) === path.join(os.homedir(), "gtp-private", "graphics");
if (process.env.GTP_CLEAN_NOW && live) { console.error("GTP_CLEAN_NOW is refused for the live import folder"); process.exit(2); }
if (process.env.GTP_CLEAN_CRASH_AFTER && live) { console.error("GTP_CLEAN_CRASH_AFTER is refused for the live import folder"); process.exit(2); }
const nowMs = process.env.GTP_CLEAN_NOW ? Date.parse(process.env.GTP_CLEAN_NOW) : Date.now();
const pk = path.join(root, "packages"), approvalsFile = path.join(root, "approvals", "approved-for-clean-export.json");
const logFile = path.join(root, "approvals", "clean-export-log.jsonl");
const sha = (b: any) => crypto.createHash("sha256").update(b).digest("hex");
const log = (o: any) => { const line = JSON.stringify({ at: new Date().toISOString(), date, ...o }); console.log(line); fs.mkdirSync(path.dirname(logFile), { recursive: true }); fs.appendFileSync(logFile, `${line}\n`); };

if (!fs.existsSync(approvalsFile)) { console.log(`no approvals file at ${approvalsFile}; nothing to do`); process.exit(0); }
const doc = JSON.parse(fs.readFileSync(approvalsFile, "utf8"));
const entries: any[] = Array.isArray(doc) ? doc : doc.approved ?? doc.entries ?? [];
// This slate's review packages, by dedupeId (the runner's variants: <id>-winner|props|projonly|winneronly, slate-today, slate-top5).
const SUFFIX = /^(?:(\d+)-(winner|props|projonly|winneronly)|slate-(today|top5))$/;
const mine = new Map<string, { file: string; pkg: any }>();
// The review JSON is in packages/ until its clean copy is staged; after that it is in packages-review-archive/<date>/ (a pass
// that died between the archive and the clean rename finds it there and finishes). packages/ wins when both hold one.
const archive = path.join(root, "packages-review-archive", date);
for (const dir of [archive, pk]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json") && x.startsWith(`nba-${date}-`) && !x.includes("-clean-"))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (pkg.sport === "nba" && pkg.date === date && SUFFIX.test(String(pkg.variant)) && pkg.approval?.socialAuthorized !== true) mine.set(pkg.dedupeId, { file: path.join(dir, f), pkg });
  }
}
const todo = entries.filter((e) => mine.has(e.dedupeId));
if (!todo.length) { console.log(`no approved ${date} slate packages; nothing to do`); process.exit(0); }
if (!process.env.GTP_NBA_UNIFIED_ROSTER) { console.error("GTP_NBA_UNIFIED_ROSTER is required to rebuild unified-roster cards"); process.exit(2); }

const m: any = await import("./render-social-pack.mjs");
const ce: any = await import("../../src/lib/social/clean-export.mjs");
const { DISCLOSURE } = await import("./game-day-cards.mjs");
const { renderCleanImages } = await import("./clean-export.mjs");
const de: any = await import("../../src/lib/social/display-exception.mjs");
const rebuilt = new Map<string, any>(); // asOf -> prepareGameDay result
let failed = false;
// Delivery order, so a Command Center import tick never sees the review copy after the clean one: (1) stage the clean copy
// (its image folder, and its JSON under a name the importer ignores), (2) rename the review JSON into
// packages-review-archive/<date>/, (3) rename the staged JSON to <slug>-clean-<sha8>.json. Between 2 and 3 a tick sees neither,
// which is harmless. A pass that died at any point resumes from the staged copy, or re-renders from the archived review JSON.
// Only after a successful render, only that dedupeId; the review image folder stays (the console's ledger points at it).
// GTP_CLEAN_CRASH_AFTER=stage|archive (tests only, refused for the live folder) exits at that point to prove the resume.
const crashAt = (step: string) => { if (process.env.GTP_CLEAN_CRASH_AFTER === step) { console.error(`TEST CRASH after ${step}`); process.exit(9); } };
function archiveReview(file: string, dedupeId: string, sk: string) {
  if (path.dirname(file) !== pk || !fs.existsSync(file)) return;
  if (JSON.parse(fs.readFileSync(file, "utf8")).dedupeId !== dedupeId) throw new Error(`archive: ${file} is not ${dedupeId}`);
  fs.mkdirSync(archive, { recursive: true });
  const to = path.join(archive, path.basename(file));
  fs.renameSync(file, fs.existsSync(to) ? `${to}.${Date.now()}` : to);
  status[sk] = { ...status[sk], reviewArchived: path.join(path.basename(path.dirname(archive)), date, path.basename(file)) };
  log({ dedupeId, outcome: "REVIEW_ARCHIVED", from: path.basename(file), to: archive });
}
// Founder-visible status per (dedupeId, contentSha256): CLEAN, REFUSED, RETRYING or FAILED (3 render/write failures, no more tries).
const MAX_ATTEMPTS = 3;
const statusFile = path.join(root, "approvals", `clean-export-status-${date}.json`);
const status: Record<string, any> = Object.fromEntries((fs.existsSync(statusFile) ? JSON.parse(fs.readFileSync(statusFile, "utf8")).entries : []).map((x: any) => [`${x.dedupeId}|${x.contentSha256}`, x]));

for (const e of todo) {
  const { file, pkg } = mine.get(e.dedupeId)!;
  const slug = path.basename(file, ".json").replace(/\.json$/, "");
  const outName = `${slug}-clean-${String(pkg.contentSha256).slice(0, 8)}`;
  const sk = `${e.dedupeId}|${pkg.contentSha256}`;
  const finalJson = path.join(pk, `${outName}.json`), staged = path.join(pk, `.${outName}.json.staged`), finalDir = path.join(pk, outName);
  const markClean = () => { status[sk] = { ...status[sk], dedupeId: e.dedupeId, contentSha256: pkg.contentSha256, state: "CLEAN", package: `${outName}.json`, at: status[sk]?.state === "CLEAN" ? status[sk].at : new Date().toISOString() }; };
  // (2) then (3): archive the review JSON, then publish the staged clean JSON.
  const finish = (cleanSha: string) => {
    archiveReview(file, e.dedupeId, sk); crashAt("archive");
    fs.renameSync(staged, finalJson);
    log({ dedupeId: e.dedupeId, outcome: "CLEAN", package: `${outName}.json`, reviewedSha256: pkg.images[0].sha256, cleanSha256: cleanSha });
    markClean();
  };
  if (fs.existsSync(finalJson)) { archiveReview(file, e.dedupeId, sk); markClean(); continue; } // done (an older pass may have left the review JSON)
  if (status[sk]?.state === "FAILED") continue;
  // A refusal is logged once per (package content, approval, reasons): the backstop runs every minute.
  const refuse = (why: string[]) => {
    status[sk] = { ...status[sk], dedupeId: e.dedupeId, contentSha256: pkg.contentSha256, state: "REFUSED", why, at: new Date().toISOString() };
    const key = sha(JSON.stringify([pkg.contentSha256, e.captionId, e.approvedAt, why])).slice(0, 16);
    const seen = path.join(root, "approvals", ".clean-refused", key);
    if (fs.existsSync(seen)) return;
    log({ dedupeId: e.dedupeId, outcome: "REFUSED", why });
    fs.mkdirSync(path.dirname(seen), { recursive: true }); fs.writeFileSync(seen, "");
  };
  const shas = new Map(pkg.images.map((i: any) => [i.path, fs.existsSync(i.path) ? sha(fs.readFileSync(i.path)) : null]));
  const problems = [...ce.cleanEligibilityProblems(pkg), ...ce.approvalMatchProblems(e, pkg, shas)];
  if (pkg.images.length !== 1) problems.push(`expected 1 image, found ${pkg.images.length}`);
  const closes = Math.min(...[pkg.expiresAt, pkg.window?.closesAt, pkg.commandCenter?.firstStartUtc].filter(Boolean).map((t: string) => Date.parse(t)));
  if (!(nowMs < closes)) problems.push(`expired: window closed ${Number.isFinite(closes) ? new Date(closes).toISOString() : "(no expiry recorded)"}`);
  const changed = pkg.snapshotRefs.filter((r: any) => { const f = path.resolve(process.cwd(), "..", r.ref); return !fs.existsSync(f) || sha(fs.readFileSync(f)) !== r.sha256; }).map((r: any) => r.ref);
  if (changed.length) problems.push(`data changed since the package: ${changed.join(", ")}`);
  // A founder publication exception must still be on file, unchanged, and the card must withhold every flagged cell.
  if (pkg.anomalyCheck === "EXCEPTION") {
    const pe = pkg.publicationException ?? {};
    const f = path.join(root, "approvals", String(pe.founderFile ?? ""));
    if (pkg.reviewAnomalyCheck !== "REVIEW" || !/^publication-exception-\d{4}-\d{2}-\d{2}\.json$/.test(String(pe.founderFile)) || pe.founderFile !== `publication-exception-${date}.json`) problems.push("EXCEPTION without this slate's founder exception file");
    else if (!fs.existsSync(f) || sha(fs.readFileSync(f)) !== pe.founderFileSha256) problems.push(`founder exception file missing or changed: ${pe.founderFile}`);
    if ((pkg.anomalies ?? []).some((a: any) => a.verdict === "BAD_JOIN")) problems.push("BAD_JOIN is never excepted");
  }
  if (problems.length) { refuse(problems); continue; }
  if (fs.existsSync(staged)) {
    try {
      const st = JSON.parse(fs.readFileSync(staged, "utf8"));
      const ok = st.sourceContentSha256 === pkg.contentSha256 && st.dedupeId === e.dedupeId && st.approval?.captionId === e.captionId && st.approval?.approvedAt === e.approvedAt && st.images.every((i: any) => fs.existsSync(i.path) && sha(fs.readFileSync(i.path)) === i.sha256);
      if (ok) { finish(st.images[0].sha256); continue; }
      fs.rmSync(staged, { force: true }); // stale (another approval or a broken image): render again below
    } catch (err: any) { fs.rmSync(staged, { force: true }); }
  }
  const asOf = pkg.freshness.asOf;
  if (!rebuilt.has(asOf)) rebuilt.set(asOf, m.prepareGameDay({ date, asOf }));
  const r = rebuilt.get(asOf);
  const [, id, gv, sv] = String(pkg.variant).match(SUFFIX)!;
  const base = id ? r.posts.find((p: any) => p.contentType === pkg.contentType && p.variant === id)
    : sv === "today" ? r.posts.find((p: any) => p.contentType === "NBA_TONIGHT")
    : m.nbaTop5Carousel({ posts: r.posts.filter((p: any) => p.contentType === "NBA_DAILY_TOP5"), date, minRows: pkg.content?.minRows ?? 5 }).posts[0];
  if (!base || base.cards.length !== 1) { refuse([`the ${gv ?? sv} card could not be rebuilt`]); continue; }
  const reviewed = base.cards[0].html;
  if (pkg.anomalyCheck === "EXCEPTION") {
    const cells = Object.entries(base.cards[0].cells ?? {}).map(([k, v]: any) => [k.replace(/^(pts|reb|ast)\.(\d+)\.num$/, "$2.$1"), v]);
    const shown = de.flaggedCellsShown(pkg.anomalies, cells);
    if (shown.length) { refuse([`flagged cells printed as numbers: ${shown.map((a: any) => `${a.playerId}.${a.market}`).join(", ")}`]); continue; }
  }
  let clean: string;
  try { clean = ce.withoutBanner(reviewed); } catch (err: any) { refuse([err.message]); continue; }
  const bad = ce.sameDisplayProblems(reviewed, clean, DISCLOSURE);
  if (bad.length) { refuse(bad); continue; }
  // The rebuilt review page must be the page approved: same pixels as the approved image.
  const tmp = path.join(pk, `.${outName}.${process.pid}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  try {
    const [again] = await renderCleanImages([{ name: "reviewed", html: reviewed }], path.join(tmp, "check"));
    if (again.sha256 !== pkg.images[0].sha256) { refuse(["the rebuilt review card does not render to the approved image"]); fs.rmSync(tmp, { recursive: true, force: true }); continue; }
    fs.rmSync(path.join(tmp, "check"), { recursive: true, force: true });
    const name = path.basename(pkg.images[0].path, ".png");
    const [img] = await renderCleanImages([{ name, html: clean }], tmp);
    const finalImg = path.join(finalDir, "images", `${name}.png`);
    const image = { ...img, path: finalImg };
    const media = { file: finalImg, sha256: img.sha256 };
    const out = {
      ...pkg, caption: e.caption, images: [image], reviewedImages: pkg.images, mediaSha256: img.sha256, mediaSetSha256: sha(img.sha256),
      clean: true, sourceContentSha256: pkg.contentSha256, dataChanged: false,
      approval: { status: "FOUNDER_APPROVED", socialAuthorized: true, approvedAt: e.approvedAt, captionId: e.captionId, decisionId: e.decisionId ?? null },
      commandCenter: { ...pkg.commandCenter, media: { ...pkg.commandCenter.media, ...media }, mediaSet: [{ ...pkg.commandCenter.mediaSet[0], ...media }] },
    };
    if (JSON.stringify(out).includes(tmp)) throw new Error("temp path left in the package");
    // (1) stage: the image folder (a folder, never read as a package) and the JSON under a name the importer ignores.
    fs.rmSync(finalDir, { recursive: true, force: true });
    fs.renameSync(tmp, finalDir);
    const jt = `${staged}.${process.pid}`;
    fs.writeFileSync(jt, `${JSON.stringify(out, null, 2)}\n`);
    fs.renameSync(jt, staged);
    crashAt("stage");
    finish(img.sha256);
  } catch (err: any) {
    fs.rmSync(tmp, { recursive: true, force: true });
    const attempts = (status[sk]?.attempts ?? 0) + 1;
    log({ dedupeId: e.dedupeId, outcome: attempts >= MAX_ATTEMPTS ? "FAILED" : "RETRY", attempts, why: [`render or write failed: ${err.message}`] });
    status[sk] = { dedupeId: e.dedupeId, contentSha256: pkg.contentSha256, state: attempts >= MAX_ATTEMPTS ? "FAILED" : "RETRYING", attempts, why: [err.message], at: new Date().toISOString() };
    if (attempts < MAX_ATTEMPTS) failed = true;
  }
}
const st = `${statusFile}.${process.pid}`;
fs.writeFileSync(st, `${JSON.stringify({ schema: "gtp-nba-clean-export-status@1", date, updatedAt: new Date().toISOString(), entries: Object.values(status) }, null, 2)}\n`);
fs.renameSync(st, statusFile);
process.exit(failed ? 3 : 0);

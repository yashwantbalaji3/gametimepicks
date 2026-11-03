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
import path from "node:path";

const arg = (n: string, d: string | null = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const date = arg("date")!, root = arg("import-root")!;
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !root) { console.error("usage: --date YYYY-MM-DD --import-root DIR"); process.exit(2); }
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
for (const f of fs.readdirSync(pk).filter((x) => x.endsWith(".json") && x.startsWith(`nba-${date}-`) && !x.includes("-clean-"))) {
  const pkg = JSON.parse(fs.readFileSync(path.join(pk, f), "utf8"));
  if (pkg.sport === "nba" && pkg.date === date && SUFFIX.test(String(pkg.variant)) && pkg.approval?.socialAuthorized !== true) mine.set(pkg.dedupeId, { file: path.join(pk, f), pkg });
}
const todo = entries.filter((e) => mine.has(e.dedupeId));
if (!todo.length) { console.log(`no approved ${date} slate packages; nothing to do`); process.exit(0); }
if (!process.env.GTP_NBA_UNIFIED_ROSTER) { console.error("GTP_NBA_UNIFIED_ROSTER is required to rebuild unified-roster cards"); process.exit(2); }

const m: any = await import("./render-social-pack.mjs");
const ce: any = await import("../../src/lib/social/clean-export.mjs");
const { DISCLOSURE } = await import("./game-day-cards.mjs");
const { renderCleanImages } = await import("./clean-export.mjs");
const rebuilt = new Map<string, any>(); // asOf -> prepareGameDay result
let failed = false;

for (const e of todo) {
  const { file, pkg } = mine.get(e.dedupeId)!;
  const slug = path.basename(file, ".json");
  const outName = `${slug}-clean-${String(pkg.contentSha256).slice(0, 8)}`;
  if (fs.existsSync(path.join(pk, `${outName}.json`))) { console.log(`already exported ${outName}`); continue; }
  // A refusal is logged once per (package content, approval, reasons): the backstop runs every 2 min.
  const refuse = (why: string[]) => {
    const key = sha(JSON.stringify([pkg.contentSha256, e.captionId, e.approvedAt, why])).slice(0, 16);
    const seen = path.join(root, "approvals", ".clean-refused", key);
    if (fs.existsSync(seen)) return;
    log({ dedupeId: e.dedupeId, outcome: "REFUSED", why });
    fs.mkdirSync(path.dirname(seen), { recursive: true }); fs.writeFileSync(seen, "");
  };
  const shas = new Map(pkg.images.map((i: any) => [i.path, fs.existsSync(i.path) ? sha(fs.readFileSync(i.path)) : null]));
  const problems = [...ce.cleanEligibilityProblems(pkg), ...ce.approvalMatchProblems(e, pkg, shas)];
  if (pkg.images.length !== 1) problems.push(`expected 1 image, found ${pkg.images.length}`);
  const changed = pkg.snapshotRefs.filter((r: any) => { const f = path.resolve(process.cwd(), "..", r.ref); return !fs.existsSync(f) || sha(fs.readFileSync(f)) !== r.sha256; }).map((r: any) => r.ref);
  if (changed.length) problems.push(`data changed since the package: ${changed.join(", ")}`);
  if (problems.length) { refuse(problems); continue; }
  const asOf = pkg.freshness.asOf;
  if (!rebuilt.has(asOf)) rebuilt.set(asOf, m.prepareGameDay({ date, asOf }));
  const r = rebuilt.get(asOf);
  const [, id, gv, sv] = String(pkg.variant).match(SUFFIX)!;
  const base = id ? r.posts.find((p: any) => p.contentType === pkg.contentType && p.variant === id)
    : sv === "today" ? r.posts.find((p: any) => p.contentType === "NBA_TONIGHT")
    : m.nbaTop5Carousel({ posts: r.posts.filter((p: any) => p.contentType === "NBA_DAILY_TOP5"), date, minRows: pkg.content?.minRows ?? 5 }).posts[0];
  if (!base || base.cards.length !== 1) { refuse([`the ${gv ?? sv} card could not be rebuilt`]); continue; }
  const reviewed = base.cards[0].html;
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
    const finalDir = path.join(pk, outName);
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
    fs.rmSync(finalDir, { recursive: true, force: true }); // left by an attempt that died before its JSON: never imported
    fs.renameSync(tmp, finalDir);
    const jt = path.join(pk, `.${outName}.json.${process.pid}`);
    fs.writeFileSync(jt, `${JSON.stringify(out, null, 2)}\n`);
    fs.renameSync(jt, path.join(pk, `${outName}.json`));
    log({ dedupeId: e.dedupeId, outcome: "CLEAN", package: `${outName}.json`, reviewedSha256: pkg.images[0].sha256, cleanSha256: img.sha256 });
  } catch (err: any) {
    fs.rmSync(tmp, { recursive: true, force: true });
    refuse([`render or write failed: ${err.message}`]);
    failed = true;
  }
}
process.exit(failed ? 3 : 0);

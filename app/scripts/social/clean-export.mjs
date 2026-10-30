#!/usr/bin/env node
/* global document -- runs in the Playwright page */
/**
 * CLEAN EXPORT. npx tsx scripts/social/clean-export.mjs               every entry in approvals/approved-for-clean-export.json
 *               npx tsx scripts/social/clean-export.mjs --test <slug>  one trial into clean-test/, stays socialAuthorized false
 * Rebuilds the card from the snapshot the package names; refuses when that data changed. Nothing is posted or scheduled.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_PRIVATE_ROOT, APP, assertPrivateOutDir } from "./nba-line-graphics-io.mjs";
import { approvalMatchProblems, cleanEligibilityProblems, sameDisplayProblems, withoutBanner } from "../../src/lib/social/clean-export.mjs";
import { dedupeSlug } from "../../src/lib/social/social-package.mjs";
import { prepareGameDay, prepareNbaRecap, prepareNflGameWinners, prepareNflPlayerStats, prepareNflRecap, prepareNflTop5, prepareNflWinners } from "./render-social-pack.mjs";
import { DISCLOSURE, NFL_DISCLOSURE } from "./game-day-cards.mjs";
import { SIZE } from "./social-pack-cards.mjs";

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
export const APPROVALS = path.join(DEFAULT_PRIVATE_ROOT, "approvals", "approved-for-clean-export.json");

function rebuild(pkg) {
  const asOf = pkg.freshness.asOf;
  if (pkg.sport === "nba") return pkg.contentType === "RESULTS_RECAP" ? prepareNbaRecap({ date: pkg.date, asOf }).posts : prepareGameDay({ date: pkg.date, asOf }).posts;
  if (pkg.contentType === "RESULTS_RECAP") return prepareNflRecap({ week: pkg.content.period.week, asOf }).posts;
  const week = pkg.content.week;
  return [...prepareNflWinners({ week, asOf }).posts, ...prepareNflGameWinners({ week, asOf }).posts, ...prepareNflTop5({ week, asOf }).posts, ...prepareNflPlayerStats({ week, asOf }).posts];
}

/** Everything short of writing. Returns { refused } or { cards, pkg }. */
export function prepareClean(slug, entry, { packages = path.join(DEFAULT_PRIVATE_ROOT, "packages") } = {}) {
  const file = path.join(packages, `${slug}.json`);
  if (!fs.existsSync(file)) return { refused: ["package not found"] };
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  const shas = new Map(pkg.images.map((i) => [i.path, fs.existsSync(i.path) ? sha(fs.readFileSync(i.path)) : null]));
  const problems = [...cleanEligibilityProblems(pkg), ...(entry ? approvalMatchProblems(entry, pkg, shas) : [...shas].filter(([p, s]) => s !== pkg.images.find((i) => i.path === p).sha256).map(([p]) => `image hash differs: ${p}`))];
  const changed = pkg.snapshotRefs.filter((r) => { const f = path.join(APP, "..", r.ref); return !fs.existsSync(f) || sha(fs.readFileSync(f)) !== r.sha256; }).map((r) => r.ref);
  if (changed.length) return { refused: [...problems, `data changed since the package: ${changed.join(", ")}`], dataChanged: changed };
  if (problems.length) return { refused: problems };
  const post = rebuild(pkg).find((p) => dedupeSlug(p) === slug);
  if (!post) return { refused: ["the card could not be rebuilt"] };
  const disclosure = pkg.sport === "nfl" ? NFL_DISCLOSURE : DISCLOSURE;
  const cards = post.cards.map((c) => ({ name: c.name, html: withoutBanner(c.html), reviewed: c.html }));
  const bad = cards.flatMap((c) => sameDisplayProblems(c.reviewed, c.html, disclosure));
  return bad.length ? { refused: bad } : { cards, pkg };
}

export async function writeClean({ cards, pkg }, dir, approval) {
  fs.mkdirSync(path.join(dir, "images"), { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const images = [];
  try {
    const page = await browser.newPage({ viewport: { width: SIZE.width, height: SIZE.height } });
    for (const c of cards) {
      await page.setContent(c.html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const f = path.join(dir, "images", `${c.name}.png`);
      await page.screenshot({ path: f, clip: { x: 0, y: 0, width: SIZE.width, height: SIZE.height } });
      images.push({ path: f, width: SIZE.width, height: SIZE.height, scale: 1, sha256: sha(fs.readFileSync(f)) });
    }
  } finally { await browser.close(); }
  const out = { ...pkg, clean: true, images, reviewedImages: pkg.images, sourceContentSha256: pkg.contentSha256, dataChanged: false, approval };
  fs.writeFileSync(path.join(dir, "package.json"), `${JSON.stringify(out, null, 2)}\n`);
  return out;
}

async function main(argv) {
  if (argv[0] === "--test") {
    const slug = argv[1];
    const r = prepareClean(slug, null);
    if (r.refused) throw new Error(r.refused.join("; "));
    const dir = path.join(assertPrivateOutDir(path.join(DEFAULT_PRIVATE_ROOT, "clean-test")), slug);
    await writeClean(r, dir, { status: "TEST_EXPORT_NOT_APPROVED", socialAuthorized: false });
    console.log(dir);
    return;
  }
  if (!fs.existsSync(APPROVALS)) { console.log(`REFUSED: no approval file at ${APPROVALS}. Nothing written.`); return; }
  const entries = JSON.parse(fs.readFileSync(APPROVALS, "utf8"));
  for (const e of Array.isArray(entries) ? entries : entries.entries ?? []) {
    const slug = String(e.dedupeId).replace(/^gtp-social:/, "").split(":").map((s, i) => (i === 2 ? s.toLowerCase().replace(/_/g, "-") : s)).join("-");
    const r = prepareClean(slug, e);
    if (r.refused) { console.log(`REFUSED ${e.dedupeId}: ${r.refused.join("; ")}`); continue; }
    const dir = path.join(DEFAULT_PRIVATE_ROOT, "clean", slug);
    await writeClean({ ...r, pkg: { ...r.pkg, caption: e.caption } }, dir, { status: "FOUNDER_APPROVED", socialAuthorized: true, approvedAt: e.approvedAt, captionId: e.captionId });
    console.log(`CLEAN ${e.dedupeId} ${dir}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then(() => process.exit(0), (e) => { console.error(`REFUSED: ${e.message}`); process.exit(1); });

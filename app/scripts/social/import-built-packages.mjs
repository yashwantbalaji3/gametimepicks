#!/usr/bin/env node
/**
 * IMPORT BUILT PACKAGES into an import root (the Command Center's import folder). Founder review queue only: importing
 * authorizes nothing.
 *   node scripts/social/import-built-packages.mjs --from <built packages dir> --root <import root> --types NBA_GAME_POST,NBA_TONIGHT [--dry-run]
 * Copies each package of those types with its images and render source into <root>/packages/<slug>/, rewriting only their
 * absolute paths. Every copied file must hash to the sha the package states, and contentSha256 is unchanged (paths are not
 * part of it). A package with the same slug already in <root>/packages is replaced only when this one has a higher revision;
 * the old JSON moves to <root>/superseded/<date>/. Otherwise the slug is refused, never overwritten. JSON last, temp-then-rename.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { socialPackageViolations } from "../../src/lib/social/social-package.mjs";

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const from = arg("from"), root = arg("root"), types = new Set(String(arg("types") ?? "").split(",").filter(Boolean)), dry = process.argv.includes("--dry-run");
if (!from || !root || !types.size) { console.error("usage: --from DIR --root DIR --types A,B [--dry-run]"); process.exit(2); }
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const pk = path.join(root, "packages");
let bad = 0;
for (const f of fs.readdirSync(from).filter((x) => x.endsWith(".json")).sort()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(from, f), "utf8"));
  if (!types.has(pkg.contentType)) continue;
  const slug = path.basename(f, ".json"), dir = path.join(pk, slug), dest = path.join(pk, f);
  const say = (outcome, o = {}) => console.log(JSON.stringify({ slug, outcome, revision: pkg.revision, contentSha256: pkg.contentSha256, ...o }));
  const prior = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, "utf8")) : null;
  if (prior && !((pkg.revision ?? 1) > (prior.revision ?? 1) && prior.dedupeId === pkg.dedupeId)) { say("REFUSED", { why: "a package with this slug is already there and this is not a later revision" }); bad++; continue; }
  const files = [...pkg.images.map((i) => ({ src: i.path, sha256: i.sha256, to: path.join(dir, "images", path.basename(i.path)) })), ...(pkg.renderSource ? [{ src: pkg.renderSource.path, sha256: pkg.renderSource.sha256, to: path.join(dir, "render-source.json") }] : [])];
  const wrong = files.filter((x) => sha(fs.readFileSync(x.src)) !== x.sha256);
  if (wrong.length) { say("REFUSED", { why: `file does not match its sha: ${wrong.map((x) => x.src).join(", ")}` }); bad++; continue; }
  // Command Center media may still name the delivery's copy of an image: matched by file name and sha, never by path alone.
  const moved = (p, h = null) => (files.find((x) => x.src === p) ?? files.find((x) => path.basename(x.src) === path.basename(p) && (h == null || x.sha256 === h)) ?? (() => { throw new Error(`no copied file for ${p}`); })()).to;
  const out = { ...pkg, images: pkg.images.map((i) => ({ ...i, path: moved(i.path) })), ...(pkg.renderSource ? { renderSource: { ...pkg.renderSource, path: moved(pkg.renderSource.path) } } : {}) };
  out.commandCenter = { ...out.commandCenter, media: out.commandCenter.media ? { ...out.commandCenter.media, file: moved(out.commandCenter.media.file, out.commandCenter.media.sha256) } : null, mediaSet: out.commandCenter.mediaSet.map((m) => ({ ...m, file: moved(m.file, m.sha256) })) };
  const v = socialPackageViolations(out);
  if (v.length || out.contentSha256 !== pkg.contentSha256) { say("REFUSED", { why: v.join("; ") || "fingerprint changed" }); bad++; continue; }
  if (dry) { say("WOULD_IMPORT", { replaces: prior?.revision ?? null }); continue; }
  for (const x of files) { fs.mkdirSync(path.dirname(x.to), { recursive: true }); fs.copyFileSync(x.src, `${x.to}.tmp`); fs.renameSync(`${x.to}.tmp`, x.to); }
  if (prior) { const sup = path.join(root, "superseded", pkg.date); fs.mkdirSync(sup, { recursive: true }); fs.renameSync(dest, path.join(sup, `${slug}.rev${prior.revision ?? 1}.json`)); }
  fs.writeFileSync(`${dest}.tmp`, `${JSON.stringify(out, null, 2)}\n`); fs.renameSync(`${dest}.tmp`, dest);
  say("IMPORTED", { replaces: prior?.revision ?? null });
}
process.exit(bad ? 1 : 0);

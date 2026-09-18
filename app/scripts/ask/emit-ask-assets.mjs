#!/usr/bin/env node
/**
 * Emit the PUBLIC Ask GameTime assets (v1.6) — build step, like scripts/lab/emit-lab-assets.mjs.
 *
 *   data/ask-projection/v1 (committed)  →  app/public/data/ask/v1/ (gitignored, rebuilt every build)
 *
 * Every emitted byte is a file of the committed, leak-guarded Ask projection re-serialised as-is, so
 * the public surface is exactly what the projection test proves. The directory is wiped first: a file
 * dropped from the projection can never linger as a stale public asset that the endpoint would still
 * happily read. No network, no clock.
 *
 * The emit ALSO enforces the loader's own size ceiling here, at build time. An asset larger than
 * `ASK_BUDGET.maxAssetBytes` is refused by the loader at runtime, which would present as a tool that
 * mysteriously returns ASSET_UNAVAILABLE in production and nowhere else. Failing the build instead
 * turns a silent runtime degradation into a loud build error — the packed Last-N rows exist because
 * this check caught the unpacked ones at 3.3 MB.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import {
  ASK_ASSET_PREFIX,
  ASK_BUDGET,
  ASK_DAILY_FILES,
  ASK_PROJECTION_DIR,
  askStoredGzipped,
  assertAskVersion,
  isAllowedAssetPath,
  storedName,
} from "../../src/lib/ask/contract.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(APP, "..", ASK_PROJECTION_DIR);
const OUT = path.join(APP, "public", ASK_ASSET_PREFIX.replace(/^\//, ""));

if (!fs.existsSync(path.join(SRC, "manifest.json"))) {
  console.error(`[emit-ask-assets] no ask projection at ${ASK_PROJECTION_DIR} — run scripts/ask/build-ask-projections.mjs`);
  process.exit(1);
}

const t0 = performance.now();
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));
assertAskVersion(manifest, "ask manifest");

fs.rmSync(OUT, { recursive: true, force: true });

let files = 0;
let bytes = 0;
let largest = { path: null, bytes: 0 };

/** Read a committed file back to text, un-gzipping the partitions that are stored compressed. */
const read = (rel) => {
  const abs = path.join(SRC, storedName(rel));
  const buf = fs.readFileSync(abs);
  return (askStoredGzipped(rel) ? zlib.gunzipSync(buf) : buf).toString("utf8");
};

// The emit enumerates from the projection's own receipt rather than from a directory walk, so a stray
// file left in the source tree can never be published. The manifest itself is not in its own file list
// and is therefore not published: no consumer reads it at runtime, and publishing a receipt that hashes
// every other asset would invite it to be trusted as one.
/*
 * The manifest lists the COMMITTED files; the daily artifacts are known by name and added here. That
 * split keeps the committed receipt stable — a forecast changing several times a day must not dirty
 * the file whose job is to describe what is in the repository.
 *
 * A daily file that is missing is a BUILD FAILURE, not a quiet omission: it means the projection step
 * did not run before this one, and publishing the site without forecasts would leave every forecast
 * question answering "not published" with no way to tell that from the truth.
 */
const emitPaths = [...manifest.files.map((f) => f.path), ...ASK_DAILY_FILES].sort();
for (const rel of emitPaths) {
  if (!fs.existsSync(path.join(SRC, storedName(rel)))) {
    throw new Error(`refused: ${rel} is missing — run scripts/ask/build-ask-projections.mjs before emitting`);
  }
  const publicPath = `${ASK_ASSET_PREFIX}/${rel}`;

  // The emit writes only paths the LOADER would accept. A file the endpoint could never read is a
  // file that should never have been published.
  if (!isAllowedAssetPath(publicPath)) throw new Error(`refused: ${publicPath} is not an allowed asset path`);

  const text = read(rel);
  assertAskVersion(JSON.parse(text), `ask ${rel}`);

  const n = Buffer.byteLength(text);
  if (n > ASK_BUDGET.maxAssetBytes) {
    throw new Error(
      `refused: ${rel} is ${(n / 1024).toFixed(0)} KB, over the loader's ${(ASK_BUDGET.maxAssetBytes / 1024).toFixed(0)} KB ceiling — ` +
      "pack the rows or split the partition rather than raising the ceiling",
    );
  }

  const abs = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
  files += 1;
  bytes += n;
  if (n > largest.bytes) largest = { path: rel, bytes: n };
}

console.log(
  `[emit-ask-assets] ${files} files · ${(bytes / 1024 / 1024).toFixed(1)} MB → public${ASK_ASSET_PREFIX} in ` +
  `${Math.round(performance.now() - t0)} ms (largest ${largest.path} ${(largest.bytes / 1024).toFixed(0)} KB)`,
);

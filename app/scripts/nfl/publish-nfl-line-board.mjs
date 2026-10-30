#!/usr/bin/env node
/**
 * PUBLISH the NFL sportsbook offers for the model-versus-line section (`gtp.nfl.prop-lines@1`, one ENCRYPTED artifact per
 * game) — the gated path from the private captures to what the NFL game pages render; the NFL mirror of
 * scripts/nba/publish-nba-line-board.mjs. Rules: lib/sports/nfl/line-publication-build.mjs (this file does I/O only).
 *
 * Reads:  the committed official boards  app/public/data/nfl/player-board/<event>.json         (verbatim)
 *         private captures              <private>/odds/nfl/<stamp>/capture-*.json            (capture CLI output)
 *         the capture receipt           --receipt: repo-relative docs/receipts/<file>.md, or an ABSOLUTE path to a
 *                                       docs/receipts/<file>.md in another worktree (e.g. the week-8 NFL receipt)
 * Writes: per game with at least one surviving offer, <eventId>.json.enc — ENCRYPTED (AES-256-GCM,
 *         lib/odds/display-crypto.mjs) under GTP_ODDS_DISPLAY_KEY from the environment (never an argument, never printed).
 *         default   <repo>/data/odds-display/nfl/lines/
 *         --out     an absolute directory OUTSIDE every git working tree (pass it to the build as GTP_NFL_LINES_DIR)
 *         Never under app/public/ or out/. Plaintext is never written anywhere.
 *
 * REFUSES — exit non-zero, writes nothing — when (in this order):
 *   2  the "site" display surface is not authorized for nfl (lib/odds/display-authorization.mjs) — the committed state;
 *   2  GTP_ODDS_DISPLAY_KEY is missing or malformed;
 *   2  bad arguments: --as-of (required: no wall-clock default) / --receipt / --events;
 *   2  --out inside a git tree, app/public or out/; no private directory;
 *   2  the receipt is not a docs/receipts/*.md file, does not parse, or restricts its output to private research;
 *   3  no committed official board for the captured games;
 *   4  a slate offer for a market off the receipt, an unknown market, or captured at/after kickoff; an invalid artifact;
 *   5  no offer survives the rules (eligible book, matched identity, PUBLISHED family, pre-kickoff, ≤ 12 h).
 * Spends nothing; calls nothing; reads no provider credential. stdout: counts only — never a line, price, book or player.
 *
 *   GTP_ODDS_DISPLAY_KEY=… npx tsx scripts/nfl/publish-nfl-line-board.mjs --as-of ISO --receipt /abs/docs/receipts/<file>.md \
 *       [--private-dir /abs/gtp-private] [--events 401872656,401872657] [--out /abs/private/nfl-lines]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { displayAuthorization } from "../../src/lib/odds/display-authorization.mjs";
import { encryptDisplayArtifact, ODDS_DISPLAY_ENC_EXT, readDisplayKey } from "../../src/lib/odds/display-crypto.mjs";
import { resolvePrivateDataDir, gitTreeContaining, PRIVATE_DIR_ENV } from "../../src/lib/ops/private-data-dir.mjs";
import { NFL_LINES_REPO_DIR, nflLinesAad } from "../../src/lib/sports/nfl/public-line-records.mjs";
import { buildNflLinePublication } from "../../src/lib/sports/nfl/line-publication-build.mjs";
import { nflOffersFromCapture } from "../../src/lib/sports/nfl/prop-line-adapter.mjs";

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i !== -1 && argv[i + 1] ? argv[i + 1] : null; };
const refuse = (code, msg) => { console.error(`REFUSED: ${msg}`); process.exit(code); };

// 1. Authorization first: with the committed record nothing else is even read.
const auth = displayAuthorization("nfl", "site");
if (!auth.ok) refuse(2, `NFL lines are not authorized for site display — nothing is written:\n  - ${auth.reasons.join("\n  - ")}`);

// 2. The display key (environment only). Without it nothing can be written: plaintext is never an option.
const KEY = readDisplayKey();
if (!KEY.ok) refuse(2, `${KEY.reason} — the artifact is committed only encrypted; nothing is written`);

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const AS_OF = arg("--as-of");
if (!AS_OF || !Number.isFinite(Date.parse(AS_OF))) refuse(2, "--as-of <ISO> required (no wall-clock default: the output is deterministic)");
const EVENTS = arg("--events") ? arg("--events").split(",").map((s) => s.trim()).filter(Boolean) : null;
if (EVENTS && !EVENTS.every((e) => /^\d{6,12}$/.test(e))) refuse(2, "--events must be comma-separated ESPN event ids");

// Output directory: the committed build-input default, or an absolute private directory outside every repository.
const outArg = arg("--out");
let outDir = path.join(ROOT, NFL_LINES_REPO_DIR);
if (outArg) {
  if (!path.isAbsolute(outArg)) refuse(2, "--out must be an absolute path");
  const o = path.resolve(outArg);
  if (gitTreeContaining(o)) refuse(2, `--out ${o} is inside a git working tree; use the default (${NFL_LINES_REPO_DIR}) or a private directory outside every repository`);
  outDir = o;
}
for (const forbidden of [path.join(APP, "public"), path.join(APP, "out")]) {
  if ((outDir + path.sep).startsWith(forbidden + path.sep)) refuse(2, `${outDir} is under ${path.relative(ROOT, forbidden)}/ — the export would serve prices as a downloadable file`);
}

const priv = resolvePrivateDataDir({ cliDir: arg("--private-dir") ?? (process.env[PRIVATE_DIR_ENV]?.trim() || path.join(os.homedir(), "gtp-private")), repoRoot: ROOT });
if (!priv.ok) refuse(2, `the private capture directory is required (${priv.reason})`);

// Receipt: repo-relative under docs/receipts/, or an absolute path whose parent is a docs/receipts/ directory.
const rel = arg("--receipt");
if (!rel) refuse(2, "--receipt <docs/receipts/<file>.md | /abs/…/docs/receipts/<file>.md> required (the capture's authorization)");
const receiptAbs = path.isAbsolute(rel) ? path.resolve(rel) : path.resolve(ROOT, rel);
const inReceipts = path.basename(path.dirname(receiptAbs)) === "receipts" && path.basename(path.dirname(path.dirname(receiptAbs))) === "docs";
if (!inReceipts || !receiptAbs.endsWith(".md") || !fs.existsSync(receiptAbs)) refuse(2, `receipt ${rel} is not an existing docs/receipts/*.md file`);
const receiptRel = `docs/receipts/${path.basename(receiptAbs)}`; // provenance never records a local absolute path

// Private captures → flat offer rows (field by field: nflOffersFromCapture).
const capDir = path.join(priv.dir, "odds", "nfl");
const captureFiles = [];
if (fs.existsSync(capDir)) {
  for (const stamp of fs.readdirSync(capDir).sort()) {
    const d = path.join(capDir, stamp);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d).filter((n) => /^capture-.*\.json$/.test(n)).sort()) {
      const bytes = fs.readFileSync(path.join(d, f));
      let doc;
      try { doc = JSON.parse(bytes.toString("utf8")); } catch { refuse(4, `capture ${stamp}/${f} is not readable JSON`); }
      if (doc.artifact !== "nfl-odds-capture" || doc.sport !== "nfl") continue;
      captureFiles.push({ name: `${stamp}/${f}`, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), offers: nflOffersFromCapture(doc) });
    }
  }
}

// Official boards for the captured (or requested) games.
const boardDir = path.join(APP, "public", "data", "nfl", "player-board");
const wanted = new Set(EVENTS ?? captureFiles.flatMap((f) => f.offers.map((o) => String(o.canonicalEventId ?? "").replace(/^nfl-/, ""))));
const boards = [...wanted].filter((e) => /^\d{6,12}$/.test(e)).sort().flatMap((e) => {
  const p = path.join(boardDir, `${e}.json`);
  if (!fs.existsSync(p)) return [];
  const bytes = fs.readFileSync(p);
  return [{ board: JSON.parse(bytes.toString("utf8")), path: path.relative(ROOT, p).split(path.sep).join("/"), sha256: crypto.createHash("sha256").update(bytes).digest("hex") }];
});

const res = buildNflLinePublication({ boards, captureFiles, asOf: AS_OF, receiptText: fs.readFileSync(receiptAbs, "utf8"), receiptRel });
if (!res.ok) refuse(res.code, res.reasons.join("\n  - "));

let written = 0, unchanged = 0;
for (const { eventId, text } of res.artifacts) {
  const out = path.join(outDir, `${eventId}${ODDS_DISPLAY_ENC_EXT}`);
  const sealed = encryptDisplayArtifact(text, KEY.key, nflLinesAad(eventId)); // deterministic: same inputs → same bytes
  if (fs.existsSync(out) && fs.readFileSync(out, "utf8") === sealed) { unchanged++; continue; }
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = `${out}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, sealed);
  fs.renameSync(tmp, out);
  written++;
}
// Counts only on stdout — never a line, a price, a book or a player.
console.log(JSON.stringify({
  asOf: new Date(Date.parse(AS_OF)).toISOString(), receipt: receiptRel, captureFiles: captureFiles.length,
  wrote: path.relative(ROOT, outDir).startsWith("..") ? "private --out directory" : path.relative(ROOT, outDir),
  files: { written, unchanged }, summary: res.summary,
}, null, 2));

#!/usr/bin/env node
/**
 * PUBLISH the NBA model-versus-line comparisons for one slate (`gtp.nba.line-comparisons@1`) — the gated path from the
 * private captures to what the site renders (lib/sports/nba/line-publication-build.mjs holds the rules, line-publication.mjs
 * the contract; this file does I/O).
 *
 * Reads:  the committed lane     app/public/data/nba/experimental-public/<date>.json   (frozen medians, verbatim)
 *         private price records  <private dir>/odds/nba/props/*.json                    (capture CLI output)
 *         the capture receipt    docs/receipts/<file>.md                                (committed)
 * Writes: ONE file, <date>.json.enc — the artifact ENCRYPTED (AES-256-GCM, lib/odds/display-crypto.mjs) under the
 *         display key from the environment (GTP_ODDS_DISPLAY_KEY; never an argument, never printed). Plaintext is never
 *         written anywhere. To
 *         default   <repo>/data/odds-display/nba/lines/   (a build input outside app/public — never a downloadable file)
 *         --out     an absolute directory OUTSIDE every repository (private build-time path; pass it to the build as
 *                   GTP_NBA_LINES_DIR)
 *         Never under app/public/ or out/ (provider terms forbid redistributing prices as downloadable files).
 *
 * REFUSES — exit non-zero, writes nothing — when (in this order):
 *   2  the "site" display surface is not authorized (lib/odds/display-authorization.mjs) — the committed state today;
 *   2  the display key GTP_ODDS_DISPLAY_KEY is missing or malformed (the value is never echoed);
 *   2  bad arguments: --date / --as-of (required: no wall-clock default, output is deterministic) / --receipt;
 *   2  --out inside a repository, app/public or out/; or no private input directory;
 *   2  the receipt is not a committed file under docs/receipts/, does not parse for NBA player props at every record's
 *      fetch instant, or restricts its output to private research;
 *   3  no committed lane for --date;
 *   4  a slate record that the adapter would never produce (ineligible book, market off the receipt, captured at/after
 *      tip, wrong schema/provider);
 *   5  no comparison survives the rules (pre-tip, ≤ 6 h, matched identity, same market).
 * Spends nothing; calls nothing; reads no credential.
 *
 *   npx tsx scripts/nba/publish-nba-line-board.mjs --date YYYY-MM-DD --as-of ISO --receipt docs/receipts/<file>.md \
 *       --private-dir /abs/private/dir [--out /abs/private/lines-dir]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { displayAuthorization } from "../../src/lib/odds/display-authorization.mjs";
import { resolvePrivateDataDir, gitTreeContaining } from "../../src/lib/ops/private-data-dir.mjs";
import { NBA_LINES_REPO_DIR } from "../../src/lib/sports/nba/line-publication.mjs";
import { nbaLinesAad } from "../../src/lib/sports/nba/public-line-records.mjs";
import { encryptDisplayArtifact, ODDS_DISPLAY_ENC_EXT, readDisplayKey } from "../../src/lib/odds/display-crypto.mjs";
import { buildNbaLinePublication } from "../../src/lib/sports/nba/line-publication-build.mjs";

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i !== -1 && argv[i + 1] ? argv[i + 1] : null; };
const refuse = (code, msg) => { console.error(`REFUSED: ${msg}`); process.exit(code); };

// 1. Authorization first: with the committed record nothing else is even read.
const auth = displayAuthorization("nba", "site");
if (!auth.ok) refuse(2, `NBA lines are not authorized for site display — nothing is written:\n  - ${auth.reasons.join("\n  - ")}`);

// 2. The display key (environment only). Without it nothing can be written: plaintext is never an option.
const KEY = readDisplayKey();
if (!KEY.ok) refuse(2, `${KEY.reason} — the artifact is committed only encrypted; nothing is written`);

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const DATE = arg("--date");
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE ?? "")) refuse(2, "--date YYYY-MM-DD required");
const AS_OF = arg("--as-of");
if (!AS_OF || !Number.isFinite(Date.parse(AS_OF))) refuse(2, "--as-of <ISO> required (no wall-clock default: the output is deterministic)");

// Output directory: the committed build-input default, or an absolute private directory outside every repository.
const outArg = arg("--out");
let outDir = path.join(ROOT, NBA_LINES_REPO_DIR);
if (outArg) {
  if (!path.isAbsolute(outArg)) refuse(2, "--out must be an absolute path");
  const o = path.resolve(outArg);
  if (gitTreeContaining(o)) refuse(2, `--out ${o} is inside a git working tree; use the default (${NBA_LINES_REPO_DIR}) or a private directory outside every repository`);
  outDir = o;
}
for (const forbidden of [path.join(APP, "public"), path.join(APP, "out")]) {
  if ((outDir + path.sep).startsWith(forbidden + path.sep)) refuse(2, `${outDir} is under ${path.relative(ROOT, forbidden)}/ — the export would serve prices as a downloadable file`);
}

const priv = resolvePrivateDataDir({ cliDir: arg("--private-dir"), repoRoot: ROOT });
if (!priv.ok) refuse(2, `the private capture directory is required (${priv.reason})`);

const rel = arg("--receipt");
if (!rel) refuse(2, "--receipt docs/receipts/<file>.md required (the capture's authorization)");
const receiptAbs = path.resolve(ROOT, rel);
if (!receiptAbs.startsWith(path.join(ROOT, "docs", "receipts") + path.sep) || !fs.existsSync(receiptAbs)) refuse(2, `receipt ${rel} is not a committed file under docs/receipts/`);

const lanePath = path.join(APP, "public", "data", "nba", "experimental-public", `${DATE}.json`);
if (!fs.existsSync(lanePath)) refuse(3, `no committed lane for ${DATE}`);
const laneBytes = fs.readFileSync(lanePath);

const capDir = path.join(priv.dir, "odds", "nba", "props");
const captureFiles = fs.existsSync(capDir)
  ? fs.readdirSync(capDir).filter((f) => f.endsWith(".json")).sort().map((name) => {
    const bytes = fs.readFileSync(path.join(capDir, name));
    return { name, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), records: JSON.parse(bytes.toString("utf8")).records ?? [] };
  })
  : [];

const res = buildNbaLinePublication({
  lane: JSON.parse(laneBytes.toString("utf8")), laneSha256: crypto.createHash("sha256").update(laneBytes).digest("hex"),
  asOf: AS_OF, receiptText: fs.readFileSync(receiptAbs, "utf8"), receiptRel: path.relative(ROOT, receiptAbs).split(path.sep).join("/"),
  captureFiles,
});
if (!res.ok) refuse(res.code, res.reasons.join("\n  - "));

const out = path.join(outDir, `${DATE}${ODDS_DISPLAY_ENC_EXT}`);
const sealed = encryptDisplayArtifact(res.text, KEY.key, nbaLinesAad(DATE)); // deterministic: same inputs → same bytes
const unchanged = fs.existsSync(out) && fs.readFileSync(out, "utf8") === sealed;
if (!unchanged) {
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = `${out}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, sealed);
  fs.renameSync(tmp, out);
}
// Counts only on stdout — never a line or a price in a log.
console.log(JSON.stringify({ date: DATE, asOf: res.artifact.asOf, wrote: unchanged ? "unchanged" : path.relative(ROOT, out).startsWith("..") ? "private --out directory" : path.relative(ROOT, out), coverage: res.artifact.coverage }, null, 2));

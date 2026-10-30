/**
 * I/O for the NBA line-comparison graphics edition (`gtp-graphics-export@2`, lib/social/nba-line-graphics-export.mjs).
 * Script-only (never imported by a page or component): reads the committed lane + official receipts (the @1 loader
 * nbaExportArgs) and, only when values may be included, the encrypted line artifact through THE build-time reader
 * (lib/sports/nba/public-line-records.mjs readNbaLinePublication, key from GTP_ODDS_DISPLAY_KEY in the environment —
 * never printed, never written).
 *
 * OUTPUT RULE: a document or image that carries a line, price, book or direction is written ONLY outside every git
 * repository (default ~/gtp-private/graphics/<date>/). assertPrivateOutDir refuses anything inside one.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { nbaExportArgs } from "./export-graphics.mjs";
import { buildNbaLineGraphicsExport, lineGraphicsExportViolations, PURPOSE, serializeLineGraphicsExport } from "../../src/lib/social/nba-line-graphics-export.mjs";
import { displayAuthorization } from "../../src/lib/odds/display-authorization.mjs";
import { readDisplayKey, ODDS_DISPLAY_KEY_ENV, ODDS_DISPLAY_ENC_EXT } from "../../src/lib/odds/display-crypto.mjs";
import { nbaLinesDir, readNbaLinePublication } from "../../src/lib/sports/nba/public-line-records.mjs";

export const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REPO = path.resolve(APP, "..");
export const DEFAULT_PRIVATE_ROOT = path.join(os.homedir(), "gtp-private", "graphics");

/** The nearest existing ancestor, symlinks resolved (so a symlink into the repo cannot slip through). */
function realAncestor(p) {
  let d = path.resolve(p);
  while (!fs.existsSync(d)) { const up = path.dirname(d); if (up === d) break; d = up; }
  const rest = path.relative(d, path.resolve(p));
  return path.join(fs.realpathSync(d), rest);
}

/** The git work tree containing `p` (any repository, not only this one), or null. */
export function gitRootOf(p) {
  let d = realAncestor(p);
  for (;;) {
    if (fs.existsSync(path.join(d, ".git"))) return d;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

/** Throws unless `dir` is outside every git repository (and outside this repository by path, symlinks resolved). */
export function assertPrivateOutDir(dir) {
  const abs = path.resolve(dir);
  const real = realAncestor(abs);
  const repoReal = fs.realpathSync(REPO);
  if (real === repoReal || real.startsWith(repoReal + path.sep) || abs === REPO || abs.startsWith(REPO + path.sep)) {
    throw new Error(`--out ${abs} is inside the repository: line values and prices are never written into the repo (use e.g. ~/gtp-private/graphics/<date>/)`);
  }
  const g = gitRootOf(abs);
  if (g) throw new Error(`--out ${abs} is inside the git repository ${g}: line values and prices are written only outside every repository`);
  return abs;
}

export const PURPOSE_ARG = Object.freeze({ "founder-review": PURPOSE.FOUNDER_REVIEW, social: PURPOSE.SOCIAL });

/**
 * Build (and validate) the @2 line edition from the committed files.
 * @param {{ date: string, asOf: string, purpose: "SOCIAL"|"FOUNDER_REVIEW_ONLY", env?: Record<string,string|undefined> }} o
 */
export function loadNbaLineGraphicsExport({ date, asOf, purpose, env = process.env }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ""))) throw new Error("--date YYYY-MM-DD is required");
  if (!asOf || !Number.isFinite(Date.parse(asOf)) || !/T.*(Z|[+-]\d\d:\d\d)$/.test(asOf)) throw new Error("--as-of <ISO instant with zone> is required (no clock is read)");
  const base = nbaExportArgs({ date, asOf });
  const needsValues = purpose === PURPOSE.FOUNDER_REVIEW || displayAuthorization("nba", "social").ok;
  let artifact = null;
  let artifactRef = null;
  if (needsValues) {
    const k = readDisplayKey(env);
    if (!k.ok) throw new Error(`${k.reason}. The line artifact is encrypted; ${purpose === PURPOSE.FOUNDER_REVIEW ? "founder-review" : "this"} mode needs ${ODDS_DISPLAY_KEY_ENV} in the environment (never on the command line). Nothing written.`);
    const dir = nbaLinesDir({ appRoot: APP, env });
    const file = path.join(dir, `${date}${ODDS_DISPLAY_ENC_EXT}`);
    if (!fs.existsSync(file)) throw new Error(`no line artifact ${path.relative(REPO, file).startsWith("..") ? file : path.relative(REPO, file)} for ${date}. Nothing written.`);
    artifact = readNbaLinePublication(date, { surface: "site", appRoot: APP, env });
    if (!artifact) throw new Error(`the line artifact for ${date} is encrypted under a different key than ${ODDS_DISPLAY_KEY_ENV}. Nothing written.`);
    const rel = path.relative(REPO, file);
    artifactRef = { path: rel.startsWith("..") ? `${"$"}GTP_NBA_LINES_DIR/${date}${ODDS_DISPLAY_ENC_EXT}` : rel, encSha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") };
  }
  const doc = buildNbaLineGraphicsExport({ ...base, artifact, artifactRef, purpose });
  const violations = lineGraphicsExportViolations(doc);
  if (violations.length) throw new Error(`contract violations:\n  - ${violations.slice(0, 20).join("\n  - ")}`);
  return { doc, lane: base.lane, artifact };
}

/** The default output directory for anything carrying values: ~/gtp-private/graphics/<date>/ (outside every repo). */
export function defaultOutDir(date) {
  return path.join(DEFAULT_PRIVATE_ROOT, date);
}

/**
 * `export-graphics.mjs --sport nba --edition lines`: write the @2 line edition. A document carrying values goes only
 * outside every repository; a withheld (no-values) SOCIAL document may use the git-ignored app/.graphics-export/.
 * @param {Record<string,string|undefined>} args
 */
export function runLineExport(args, env = process.env) {
  const purpose = PURPOSE_ARG[args.purpose ?? "social"];
  if (!purpose) throw new Error("--purpose founder-review|social");
  // The output rule is checked BEFORE anything is read: a review document never even gets built for a path in a repo.
  if (purpose === PURPOSE.FOUNDER_REVIEW) assertPrivateOutDir(args.out ? path.dirname(path.resolve(args.out)) : defaultOutDir(args.date));
  const { doc } = loadNbaLineGraphicsExport({ date: args.date, asOf: args["as-of"], purpose, env });
  const carriesValues = doc.authorization.valuesIncluded;
  const name = `nba-lines-${args.date}${purpose === PURPOSE.FOUNDER_REVIEW ? "-founder-review" : ""}.json`;
  let out;
  if (carriesValues || purpose === PURPOSE.FOUNDER_REVIEW) {
    out = path.join(assertPrivateOutDir(args.out ? path.dirname(path.resolve(args.out)) : defaultOutDir(args.date)), args.out ? path.basename(args.out) : name);
  } else {
    out = path.resolve(args.out ?? path.join(APP, ".graphics-export", name));
    for (const served of [path.join(APP, "public"), path.join(APP, "out"), path.join(APP, ".next")]) {
      if (out === served || out.startsWith(served + path.sep)) throw new Error(`--out ${out} is inside ${served}: the export is never served`);
    }
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, serializeLineGraphicsExport(doc));
  return { out, doc };
}

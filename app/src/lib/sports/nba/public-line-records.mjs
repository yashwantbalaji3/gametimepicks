/**
 * NBA LINE PUBLICATION READER — BUILD TIME / SERVER ONLY (fs). The one place pages and the social feed read published
 * model-versus-line comparisons (`gtp.nba.line-comparisons@1`, lib/sports/nba/line-publication.mjs).
 *
 * Returns null — and reads NOTHING — unless the surface is authorized in the display authorization record
 * (lib/odds/display-authorization.mjs) AND the display key GTP_ODDS_DISPLAY_KEY is in the environment. With both, it
 * reads and decrypts <date>.json.enc (AES-256-GCM, lib/odds/display-crypto.mjs — plaintext is never committed) from:
 *   GTP_NBA_LINES_DIR      when set: an absolute, private build-time directory (never inside out/ or app/public/);
 *   otherwise              <repo>/data/odds-display/nba/lines/ — a build input OUTSIDE app/public, so the static export
 *                          never serves it as a downloadable file (provider terms: display yes, redistribution no).
 * A missing file, or one encrypted under a different key → null (the section then renders nothing: the page is byte-identical to switch-off). A
 * tampered file (authentication fails under the right key) THROWS. A PRESENT file that fails validation (wrong
 * schema, the lane changed since publication, an ineligible book, a stale row…) THROWS: that is a release error, and the
 * guard test (nba-line-publication-guard.test.mjs) catches it in CI before any build.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DISPLAY_AUTHORIZATION, displayAuthorization } from "../../odds/display-authorization.mjs";
import { decryptDisplayArtifact, ODDS_DISPLAY_ENC_EXT, readDisplayKey } from "../../odds/display-crypto.mjs";
import {
  NBA_LINES_DIR_ENV, NBA_LINES_REPO_DIR, linePublicationToPriceRecords, linePublicationToSocialBoard, validateNbaLinePublication,
} from "./line-publication.mjs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The authenticated identity of one NBA artifact (bound into the ciphertext: a file renamed to another date fails). */
export const nbaLinesAad = (date) => `nba/lines/${date}`;

/** The directory the artifact is read from (see the header). `appRoot` is app/ (the build's cwd). */
export function nbaLinesDir({ appRoot = process.cwd(), env = process.env } = {}) {
  const v = env?.[NBA_LINES_DIR_ENV];
  if (v != null && String(v).trim() !== "") {
    const d = String(v).trim();
    if (!path.isAbsolute(d)) throw new Error(`${NBA_LINES_DIR_ENV} must be an absolute path (got ${JSON.stringify(d)})`);
    const pub = path.join(path.resolve(appRoot), "public") + path.sep, out = path.join(path.resolve(appRoot), "out") + path.sep;
    if ((path.resolve(d) + path.sep).startsWith(pub) || (path.resolve(d) + path.sep).startsWith(out)) throw new Error(`${NBA_LINES_DIR_ENV} may not point into app/public or out/ (the export would serve it as a file)`);
    return path.resolve(d);
  }
  return path.resolve(appRoot, "..", NBA_LINES_REPO_DIR);
}

const laneSha256 = (appRoot, date) => {
  try { return crypto.createHash("sha256").update(fs.readFileSync(path.join(appRoot, "public", "data", "nba", "experimental-public", `${date}.json`))).digest("hex"); } catch { return null; }
};

/**
 * The validated artifact for `date`, or null (unauthorized surface, bad date, or no file).
 * @param {string} date
 * @param {{ surface?: "site"|"social", appRoot?: string, env?: Record<string, string|undefined>, authorization?: any }} [opts]
 */
export function readNbaLinePublication(date, { surface = "site", appRoot = process.cwd(), env = process.env, authorization = DISPLAY_AUTHORIZATION } = {}) {
  if (!displayAuthorization("nba", surface, authorization).ok) return null;
  if (!DATE_RE.test(String(date ?? ""))) return null;
  const k = readDisplayKey(env);
  if (!k.ok) return null;
  const file = path.join(nbaLinesDir({ appRoot, env }), `${date}${ODDS_DISPLAY_ENC_EXT}`);
  if (!fs.existsSync(file)) return null;
  const text = decryptDisplayArtifact(fs.readFileSync(file, "utf8"), k.key, nbaLinesAad(date));
  if (text == null) return null; // encrypted under another key: not available to this build
  const artifact = JSON.parse(text);
  const v = validateNbaLinePublication(artifact, { date, laneSha256: laneSha256(appRoot, date) });
  if (!v.ok) throw new Error(`NBA line publication ${file} is invalid:\n  - ${v.errors.slice(0, 10).join("\n  - ")}`);
  return artifact;
}

/** Site pages: adapter-shaped price records from the authorized artifact for `date`, else null. */
export function nbaPublicLineRecords(date, opts = {}) {
  const a = readNbaLinePublication(date, { ...opts, surface: "site" });
  return a ? linePublicationToPriceRecords(a) : null;
}

/** Social feed: the line-board shape (rows + coverage) from the artifact, only when the "social" surface is authorized. */
export function nbaSocialLineBoard(date, opts = {}) {
  const a = readNbaLinePublication(date, { ...opts, surface: "social" });
  return a ? linePublicationToSocialBoard(a) : null;
}

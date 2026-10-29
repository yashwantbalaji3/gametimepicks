/**
 * NFL LINE READER — BUILD TIME / SERVER ONLY (fs). The one place an NFL page reads sportsbook offer rows (the NBA pattern:
 * lib/sports/nba/public-line-records.mjs).
 *
 * Returns null — and reads NOTHING — unless the "site" surface is authorized for "nfl" in the display authorization
 * record (lib/odds/display-authorization.mjs; all OFF in this commit). With authorization on, it reads
 * `<eventId>.json` (`gtp.nfl.prop-lines@1`: { schema, sport: "nfl", eventId, rows: [offer rows as
 * prop-line-adapter.mjs nflOffersFromCapture emits them] }) from:
 *   GTP_NFL_LINES_DIR   when set: an absolute, private build-time directory (never inside app/public or out/);
 *   otherwise           <repo>/data/odds-display/nfl/lines/ — a build input OUTSIDE app/public, so the static export never
 *                       serves it as a downloadable file (provider terms: display yes, redistribution no).
 * A missing file → null (the section says "Sportsbook lines: Unavailable"). A PRESENT file that fails validation (wrong
 * schema or event, an ineligible book, an unknown market, a row for another event) THROWS — a release error, never a
 * silently dropped row.
 */
import fs from "node:fs";
import path from "node:path";
import { DISPLAY_AUTHORIZATION, displayAuthorization } from "../../odds/display-authorization.mjs";
import { isEligibleOperator } from "../odds/eligible-operators.mjs";
import { NFL_FAMILY_BY_MARKET } from "./prop-line-adapter.mjs";

export const NFL_LINES_SCHEMA = "gtp.nfl.prop-lines@1";
export const NFL_LINES_REPO_DIR = "data/odds-display/nfl/lines";
export const NFL_LINES_DIR_ENV = "GTP_NFL_LINES_DIR";
const EVENT_RE = /^\d{6,12}$/;

/** The directory the artifact is read from. `appRoot` is app/ (the build's cwd). */
export function nflLinesDir({ appRoot = process.cwd(), env = process.env } = {}) {
  const v = env?.[NFL_LINES_DIR_ENV];
  if (v != null && String(v).trim() !== "") {
    const d = String(v).trim();
    if (!path.isAbsolute(d)) throw new Error(`${NFL_LINES_DIR_ENV} must be an absolute path (got ${JSON.stringify(d)})`);
    const inside = (root) => (path.resolve(d) + path.sep).startsWith(path.join(path.resolve(appRoot), root) + path.sep);
    if (inside("public") || inside("out")) throw new Error(`${NFL_LINES_DIR_ENV} may not point into app/public or out/ (the export would serve it as a file)`);
    return path.resolve(d);
  }
  return path.resolve(appRoot, "..", NFL_LINES_REPO_DIR);
}

/** Structural validation of one artifact for `eventId`. */
export function validateNflLineArtifact(a, eventId) {
  const errors = [];
  if (a?.schema !== NFL_LINES_SCHEMA) errors.push(`schema must be ${NFL_LINES_SCHEMA}`);
  if (a?.sport !== "nfl") errors.push("sport must be nfl");
  if (String(a?.eventId) !== String(eventId)) errors.push(`eventId ${JSON.stringify(a?.eventId)} ≠ ${JSON.stringify(eventId)}`);
  if (!Array.isArray(a?.rows)) errors.push("rows must be an array");
  for (const [n, r] of (a?.rows ?? []).entries()) {
    const id = `rows[${n}]`;
    if (String(r?.canonicalEventId) !== `nfl-${eventId}`) errors.push(`${id}: belongs to another event`);
    if (!/^nfl-athlete-\d+$/.test(String(r?.playerId ?? ""))) errors.push(`${id}: playerId is not a durable roster id`);
    if (!NFL_FAMILY_BY_MARKET[r?.market]) errors.push(`${id}: unknown market ${JSON.stringify(r?.market)}`);
    if (!isEligibleOperator(r?.book)) errors.push(`${id}: book not on the eligible-operator allowlist`);
    if (!Number.isFinite(Date.parse(r?.capturedAt))) errors.push(`${id}: capturedAt is not an instant`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Offer rows for one game, or null (unauthorized surface, bad id, or no file).
 * @param {string} eventId
 * @param {{ appRoot?: string, env?: Record<string, string|undefined>, authorization?: any }} [opts]
 */
export function nflPublicLineRecords(eventId, { appRoot = process.cwd(), env = process.env, authorization = DISPLAY_AUTHORIZATION } = {}) {
  if (!displayAuthorization("nfl", "site", authorization).ok) return null;
  if (!EVENT_RE.test(String(eventId ?? ""))) return null;
  const file = path.join(nflLinesDir({ appRoot, env }), `${eventId}.json`);
  if (!fs.existsSync(file)) return null;
  const a = JSON.parse(fs.readFileSync(file, "utf8"));
  const v = validateNflLineArtifact(a, String(eventId));
  if (!v.ok) throw new Error(`NFL line artifact ${file} is invalid:\n  - ${v.errors.slice(0, 10).join("\n  - ")}`);
  return a.rows;
}

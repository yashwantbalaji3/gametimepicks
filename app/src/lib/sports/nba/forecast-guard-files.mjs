/**
 * NBA FORECAST GUARD · PAGE-SIDE READ (node only). Reads the committed guard document beside a lane. Pages call
 * guardLane(); nothing here recomputes a verdict or reads a box score at page build (the builder,
 * forecast-guard-build.mjs, is the only reader of the internal box scores).
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { applyForecastGuard, FORECAST_GUARD, guardApplies } from "./forecast-guard-accessor.mjs";
import { FORECAST_GUARD_SCHEMA } from "./forecast-guard.mjs";

/**
 * CONTENT DIGEST (agreed with the betting engine 2026-11-04): `digest.sha256` is the sha256 of JSON.stringify(doc) with
 * the `digest` key removed (the builder's key order). A consumer verifies before it uses the document; a missing or
 * failing digest is unusable — the site then withholds (fail closed), the engine falls back to its own computation.
 */
export const guardDigestOf = (doc) => {
  const { digest, ...body } = doc ?? {};
  void digest;
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
};
/** Attach the digest (builder side). */
export const withGuardDigest = (doc) => ({ ...doc, digest: { alg: "sha256", of: "JSON.stringify(document without digest)", sha256: guardDigestOf(doc) } });
/** Problems that make a guard document unverifiable (empty = verified). */
export function verifyGuardDoc(doc) {
  if (!doc || typeof doc !== "object") return ["no document"];
  const p = [];
  if (doc.schema !== FORECAST_GUARD_SCHEMA) p.push(`schema ${doc.schema}`);
  if (doc.digest?.alg !== "sha256" || typeof doc.digest?.sha256 !== "string") p.push("no digest");
  else if (doc.digest.sha256 !== guardDigestOf(doc)) p.push("digest does not match the content");
  return p;
}

/** public/data/nba/forecast-guard/<date>.json under an app directory. */
export const guardFile = (appDir, date) => path.join(appDir, "public", "data", FORECAST_GUARD.dir, `${date}.json`);

/** The committed, VERIFIED guard document for a slate, or null (→ fail closed). Read only when the guard applies. */
export function readGuardDoc(appDir, date) {
  if (!guardApplies(date)) return null;
  let doc = null;
  try { doc = JSON.parse(fs.readFileSync(guardFile(appDir, date), "utf8")); } catch { return null; }
  return verifyGuardDoc(doc).length ? null : doc;
}

/** THE READ every NBA surface makes: the lane through the guard (the same object before the cut-over). */
export function guardLane(appDir, lane) {
  return lane ? applyForecastGuard(lane, readGuardDoc(appDir, lane.date)) : lane;
}

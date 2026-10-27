/**
 * SHARED PRIMITIVES — canonical JSON, digests, a deterministic clock, repo paths.
 *
 * Every artifact in the command center is addressed by the sha256 of its CANONICAL JSON (keys sorted, no
 * whitespace), so the same content always has the same digest no matter which process wrote it. Approvals bind
 * to these digests: a founder approves bytes, not a description of bytes.
 *
 * Time is injected, never read. `stepClock` hands out strictly increasing ISO instants from a fixed origin, which
 * is what makes a replay byte-identical; the console uses `wallClock` because a live demo should show real times.
 */
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = path.resolve(CC_ROOT, "..");

/** Stable stringify: object keys sorted recursively; arrays keep their order. */
export function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
  }
  return value;
}

export const sha256 = (bufOrString) => crypto.createHash("sha256").update(bufOrString).digest("hex");
export const digestOf = (value) => sha256(canonicalJson(value));
export const shortId = (prefix, value) => `${prefix}-${digestOf(value).slice(0, 12)}`;

/** Deterministic clock: each call returns origin + n seconds. */
export function stepClock(originIso = "2026-10-27T12:00:00.000Z") {
  let t = Date.parse(originIso);
  return () => {
    const iso = new Date(t).toISOString();
    t += 1000;
    return iso;
  };
}

export const wallClock = () => new Date().toISOString();

export const repoRelative = (abs) => path.relative(REPO_ROOT, abs).split(path.sep).join("/");

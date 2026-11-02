/**
 * Committed-input helpers for the v0.7 research scripts. NBA REGULAR SEASON — CANDIDATE (NOT ARMED) · PRIVATE_RESEARCH.
 * Reads committed data and git history. Writes nothing. No network, no paid API, no build.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const APP = path.resolve(HERE, "..", "..", "..");
export const ROOT = path.resolve(APP, "..");
export const NBA = path.join(ROOT, "data", "internal", "research", "nba");
export const LANES = path.join(APP, "public", "data", "nba", "experimental-public");

export const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
export const readBoxDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(dir, f))) : []);
export const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const git = (args, opts = {}) => execFileSync("git", args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, ...opts });

/** Refuses any output path inside the repository, so no script here can write a repo file. */
export function outDirOrRefuse(raw) {
  if (!raw) throw new Error("--out-dir <dir> required (outside the repository)");
  const out = path.resolve(raw);
  if (out === ROOT || out.startsWith(ROOT + path.sep)) throw new Error(`--out-dir ${out} is inside the repository`);
  return out;
}

const blobCache = new Map();
/** Every blob of a tracked file, keyed by sha256, walking history only until `wanted` are all found. */
export function blobIndex(rel, wanted) {
  const have = blobCache.get(rel) ?? new Map();
  blobCache.set(rel, have);
  if ([...wanted].every((w) => have.has(w))) return have;
  const commits = git(["log", "--format=%H", "--", rel], { encoding: "utf8" }).split("\n").filter(Boolean);
  const seen = new Set();
  for (const c of commits) {
    if ([...wanted].every((w) => have.has(w))) break;
    for (const ref of [c, `${c}^`]) {
      let b;
      try { b = git(["rev-parse", `${ref}:${rel}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { continue; }
      if (seen.has(b)) continue;
      seen.add(b);
      const buf = git(["cat-file", "blob", b]);
      have.set(sha(buf), buf.toString("utf8"));
    }
  }
  return have;
}

const parsed = new Map();
const parseBlob = (m, s) => { if (!m.has(s)) return null; if (!parsed.has(s)) parsed.set(s, JSON.parse(m.get(s))); return parsed.get(s); };

/** The roster and injury documents a frozen receipt hashed. Null if no git blob matches. */
export function receiptInputs(receipts) {
  const wantRoster = new Set(receipts.map((r) => r.inputs.rosters.sha256));
  const wantInj = new Set(receipts.map((r) => r.inputs.injuries.sha256));
  const rosterBlobs = blobIndex("data/internal/research/nba/rosters/latest.json", wantRoster);
  const injBlobs = blobIndex("data/internal/research/injuries/nba/latest.json", wantInj);
  return (receipt) => ({ rosters: parseBlob(rosterBlobs, receipt.inputs.rosters.sha256), injuries: parseBlob(injBlobs, receipt.inputs.injuries.sha256) });
}

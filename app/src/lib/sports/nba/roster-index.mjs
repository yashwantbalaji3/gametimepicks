/**
 * The committed NBA roster captures indexed by the sha256 of their bytes (node-only, read-only). A receipt names the
 * roster it was frozen on by sha256 (receipt.inputs.rosters.sha256); the dated captures under
 * data/internal/research/nba/rosters/<date>.json are byte-identical to the latest.json of their day, so the exact
 * pregame roster of any freeze is found — and PROVEN — by hash. Nothing is fetched; a hash no file matches is absent.
 *
 * RETAINED CAPTURES: a pregame re-capture can overwrite the dated file AFTER a forecast froze on it (2026-11-12: the 14:07Z
 * re-capture replaced the 07:07Z capture the v0.1 receipts pin). Before any capture is overwritten its exact bytes are
 * kept beside it as <capture day>.retained-<sha256>.json (`retainRosterCaptures`); the index reads them, checks the name's
 * hash against the bytes, and labels them with the dated file they were published as (the hash is the proof).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Map sha256 → { file (published label, no internal prefix), doc }. Dated files win over latest.json for the label. */
export function loadRosterIndex(repoRoot) {
  const dir = rosterDir(repoRoot);
  const out = new Map();
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => /^(\d{4}-\d{2}-\d{2}|latest)\.json$/.test(f) || RETAINED.test(f)).sort(); } catch { return out; }
  for (const f of names) {
    const bytes = fs.readFileSync(path.join(dir, f));
    const sha = sha256(bytes);
    const kept = RETAINED.exec(f);
    if (kept && kept[2] !== sha) continue; // a retained file whose bytes are not its name's hash proves nothing
    if (out.has(sha) && (f === "latest.json" || kept)) continue;
    try { out.set(sha, { file: `nba/rosters/${kept ? `${kept[1]}.json` : f}`, doc: JSON.parse(bytes.toString("utf8")) }); } catch { /* unreadable capture: absent */ }
  }
  return out;
}

const RETAINED = /^(\d{4}-\d{2}-\d{2})\.retained-([0-9a-f]{64})\.json$/;
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const rosterDir = (repoRoot) => path.join(repoRoot, "data", "internal", "research", "nba", "rosters");

/**
 * Keep the exact bytes of each named capture (default: every dated file and latest.json) before a writer overwrites it:
 * <day>.retained-<sha256>.json, day = the capture's own capturedAt (UTC, the dated file's naming). Idempotent; never
 * overwrites a retained file. Returns the paths it wrote (relative to `dir`) so a workflow can stage exactly those.
 */
export function retainRosterCaptures(dir, names = null) {
  const wrote = [];
  let list = names;
  if (!list) { try { list = fs.readdirSync(dir).filter((f) => /^(\d{4}-\d{2}-\d{2}|latest)\.json$/.test(f)); } catch { return wrote; } }
  for (const f of list) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    const bytes = fs.readFileSync(p);
    let day = null;
    try { day = String(JSON.parse(bytes.toString("utf8")).capturedAt ?? "").slice(0, 10); } catch { continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const name = `${day}.retained-${sha256(bytes)}.json`;
    if (fs.existsSync(path.join(dir, name))) continue;
    fs.writeFileSync(path.join(dir, name), bytes, { flag: "wx" });
    wrote.push(name);
  }
  return wrote;
}

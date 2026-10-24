/**
 * The committed NBA roster captures indexed by the sha256 of their bytes (node-only, read-only). A receipt names the
 * roster it was frozen on by sha256 (receipt.inputs.rosters.sha256); the dated captures under
 * data/internal/research/nba/rosters/<date>.json are byte-identical to the latest.json of their day, so the exact
 * pregame roster of any freeze is found — and PROVEN — by hash. Nothing is fetched; a hash no file matches is absent.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Map sha256 → { file (published label, no internal prefix), doc }. Dated files win over latest.json for the label. */
export function loadRosterIndex(repoRoot) {
  const dir = path.join(repoRoot, "data", "internal", "research", "nba", "rosters");
  const out = new Map();
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => /^(\d{4}-\d{2}-\d{2}|latest)\.json$/.test(f)).sort(); } catch { return out; }
  for (const f of names) {
    const bytes = fs.readFileSync(path.join(dir, f));
    const sha = crypto.createHash("sha256").update(bytes).digest("hex");
    if (out.has(sha) && f === "latest.json") continue;
    try { out.set(sha, { file: `nba/rosters/${f}`, doc: JSON.parse(bytes.toString("utf8")) }); } catch { /* unreadable capture: absent */ }
  }
  return out;
}

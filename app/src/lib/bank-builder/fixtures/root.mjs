/**
 * A pinned data root for the Bank Builder / Moonshot regressions.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────────────────────────
 * These regressions were written against `public/data` directly, which made the LIVE ladder double
 * as a test fixture. That is fine while a product is frozen and fatal once it runs: advancing a lane
 * to today's card broke 33 assertions that require the file to still contain July's state. The
 * product could not move without the tests failing, and the tests could not pass without the product
 * standing still — which is precisely why both lanes sat in review mode for weeks.
 *
 * The regressions themselves are worth keeping. "A same-day settled card renders WON with $0
 * exposure" and "a restarted lane shows a clean Step-1 path with no prior-cycle legs" are real
 * invariants. They are simply invariants about A PARTICULAR STATE, so they get that state pinned
 * here instead of reading whatever the product happens to be doing today.
 *
 * ── What it does ────────────────────────────────────────────────────────────────────────────────
 * Materialises a pinned copy of `public/data` with the three lane artifacts replaced by their
 * snapshots. Everything else — boards, settlements, the protected money files — is the genuine
 * article, so a test still exercises the true production readers end to end.
 *
 * ONE SHARED COPY, built once and reused by every test process, because:
 *   · a copy PER PROCESS filled the disk (public/data is 465 MB and the suite runs one process per
 *     test file), and
 *   · a symlink overlay is unsafe — several of these regressions copy the root and then WRITE into
 *     it to build their scenario, and a write through a symlink lands in live data. That is not
 *     hypothetical: it corrupted portfolio.json once while this helper was being written.
 *
 * Treat the returned root as READ-ONLY. A test that needs to mutate should copy from it first,
 * which is a real copy and therefore safe.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..", "..");

/** Which live paths each pinned snapshot stands in for. */
const OVERRIDES = [
  ["methodology/launch/dual-bank-builder-active.json", "dual-bank-builder-2026-07-21.json"],
  ["moonshot-lane/active.json", "moonshot-lane-2026-07-21.json"],
  ["mr-dub/daily-portfolio.json", "daily-portfolio-2026-08-15-pre-restart.json"],
];

let cached = null;

/**
 * @returns {string} absolute path to a data root pinned to the July-21 lane state.
 */
export function pinnedLaneRoot() {
  if (cached) return cached;
  const live = path.join(APP, "public", "data");
  const dest = path.join(APP, ".tmp", "pinned-lane-root");

  // A marker records which fixture contents the copy was built from, so it rebuilds when they change
  // and is reused when they have not. Concurrent test processes race benignly: the loser rebuilds
  // into a scratch dir and renames over the winner, and both end up with identical content.
  const stamp = OVERRIDES.map(([, f]) => crypto.createHash("sha256").update(fs.readFileSync(path.join(HERE, f))).digest("hex")).join("-");
  const marker = path.join(dest, ".fixture-stamp");
  try {
    if (fs.readFileSync(marker, "utf8") === stamp) { cached = dest; return dest; }
  } catch { /* not built yet, or built from different fixtures */ }

  const scratch = `${dest}.${process.pid}`;
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(scratch), { recursive: true });
  fs.cpSync(live, scratch, { recursive: true, dereference: true });
  for (const [rel, fixture] of OVERRIDES) {
    const target = path.join(scratch, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(HERE, fixture), target);
  }
  fs.writeFileSync(path.join(scratch, ".fixture-stamp"), stamp);
  fs.rmSync(dest, { recursive: true, force: true });
  try { fs.renameSync(scratch, dest); } catch { /* another process won the race; its copy is identical */ }
  fs.rmSync(scratch, { recursive: true, force: true });
  cached = dest;
  return dest;
}

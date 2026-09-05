/**
 * THE REPLAY HARNESS — Program 235 · Release A.
 *
 * Program 234 scoped a per-product idempotency harness and shipped without it, and said so. This is
 * that remainder. It runs the ACTUAL production settlement function — the one the scheduled job
 * runs — against a disposable snapshot of the data it reads, on a clock the test supplies, and
 * compares the business state that results.
 *
 * WHAT MAKES THIS A TEST RATHER THAN A WRAPPER. Three things, each of which the charter names as a
 * way this kind of harness goes hollow:
 *
 *   1. It invokes the real script through its real entry point, in a child process, with `--apply`.
 *      Nothing here reimplements grading. If the settler changes, this changes with it or fails.
 *   2. It compares BUSINESS STATE — the receipt's cards and their outcomes — not stdout, and not an
 *      exit code. A script can exit 0 having written two receipts.
 *   3. Volatile metadata is excluded EXPLICITLY and named, so "identical" is a claim about the
 *      record rather than about the bytes. `settledAt` and `completedAt` are wall-clock stamps that
 *      legitimately differ between two runs of the same settlement; everything else must not.
 *
 * The store is a real directory tree, so a process restart between runs is a genuine restart: the
 * second invocation learns nothing from the first except what is on disk, which is exactly the
 * question idempotency asks.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

/** The settler, addressed the way the scheduled job addresses it. */
export const SETTLE_LAB_CARDS = "scripts/parlays/settle-lab-cards.mjs";

/**
 * Fields that legitimately differ between two runs of the same settlement, and why.
 * Anything not listed here must be identical, or the run was not idempotent.
 */
export const VOLATILE_RECEIPT_FIELDS = Object.freeze({
  settledAt: "the wall-clock instant this run wrote the receipt",
  completedAt: "the wall-clock instant a later run completed a pending card",
  generatedAt: "producer stamp, present on some artifacts",
});

/**
 * A disposable tree. The caller seeds it with exactly the files the function under test reads.
 *
 * `node_modules` is SYMLINKED rather than copied so the child can run with its cwd inside the store.
 * That matters: the settler resolves most paths from `--app-root`, but the EPL results bridge
 * resolves from `process.cwd()`, and a harness that left the cwd pointing at the real repository
 * would silently read live EPL results into an isolated run. A symlink costs nothing, is removed
 * with the store, and makes the isolation complete rather than nearly complete.
 */
export function makeStore(prefix = "gtp-replay-", appDir = process.cwd()) {
  const store = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  /*
   * CODE is linked in; DATA is not. The child runs with its cwd inside the store, which is what
   * isolates the loaders that resolve from `process.cwd()` — the EPL results bridge among them —
   * so a run cannot silently read live results. But a cwd with no `tsconfig.json` cannot resolve the
   * project's `@/` aliases and no module loads at all, and one with no `node_modules` cannot find
   * tsx. Linking the source and copying the tsconfig makes the store resolvable while
   * `public/data` stays entirely the fixture tree the test seeded.
   */
  for (const entry of ["node_modules", "src", "scripts"]) {
    try { fs.symlinkSync(path.join(appDir, entry), path.join(store, entry), "dir"); } catch { /* best effort */ }
  }
  try { fs.copyFileSync(path.join(appDir, "tsconfig.json"), path.join(store, "tsconfig.json")); } catch { /* alias resolution will fail loudly */ }
  return store;
}

/** Write one JSON fixture into the store at a repo-relative path. */
export function seed(store, relPath, doc) {
  const full = path.join(store, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof doc === "string" ? doc : JSON.stringify(doc, null, 2) + "\n");
  return full;
}

/**
 * Copy a real committed artifact into the store, unchanged.
 *
 * Recorded fixtures beat synthesized ones wherever the repository already has the shape: a
 * hand-written receipt drifts from the producer the moment the producer changes, and the drift is
 * silent. Where a case needs values no live day produced, the tests synthesize deliberately and say
 * so; everything else is copied.
 */
export function copyInto(store, repoDir, relPath) {
  const from = path.join(repoDir, relPath);
  const to = path.join(store, relPath);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  return to;
}

export function readStore(store, relPath) {
  try { return JSON.parse(fs.readFileSync(path.join(store, relPath), "utf8")); } catch { return null; }
}

export const storeHas = (store, relPath) => fs.existsSync(path.join(store, relPath));

/**
 * Run the settler against the store.
 *
 * `--app-root` points its artifact paths at the snapshot and `cwd` points the loaders that resolve
 * from `process.cwd()` at the same place, so no read escapes to the real tree. The clock is the
 * test's, never the machine's.
 *
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
export function runSettler(store, { now, date, apply = true, appDir }) {
  if (!now) throw new Error("replay-harness: a controlled clock (`now`) is required");
  const args = [path.join(appDir, SETTLE_LAB_CARDS), "--now", now, "--app-root", store];
  if (date) args.push("--date", date);
  if (apply) args.push("--apply");
  const r = spawnSync("npx", ["tsx", ...args], { cwd: store, encoding: "utf8", env: { ...process.env } });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/**
 * The business state of a settled day: which cards exist and how each one and each of its legs
 * settled. Deliberately NOT the file — two runs may stamp different times and still be the same
 * settlement, and conflating those would make every idempotency assertion fail for the wrong reason.
 */
export function businessState(store, date) {
  const doc = readStore(store, `public/data/parlays/lab-settled/${date}.json`);
  if (!doc) return null;
  const cards = (doc.cards ?? []).map((c) => ({
    slipId: c.slipId, sport: c.sport, sports: c.sports, tier: c.tier,
    result: c.result, legs: c.legs, combinedDecimal: c.combinedDecimal,
  })).sort((a, b) => String(a.slipId).localeCompare(String(b.slipId)));
  return { date: doc.date, policyVersion: doc.policyVersion, cards };
}

/** Every receipt file in the store — used to prove a replay creates no second receipt. */
export function receiptFiles(store) {
  const dir = path.join(store, "public/data/parlays/lab-settled");
  try { return fs.readdirSync(dir).sort(); } catch { return []; }
}

/* ── END ZONE VAULT · a second product, a different lifecycle ─────────────────────────────────── */

export const SETTLE_NFL_EXPERIMENTAL = "app/scripts/nfl/settle-nfl-experimental.mjs";

/**
 * Run the NFL experimental-forecast settler against the store.
 *
 * Its roots differ from the parlay settler's: it addresses the REPOSITORY root, because its receipts
 * and ledger live under `data/internal/` rather than under `app/public/`. The store therefore mirrors
 * a repo, not an app — which is exactly the kind of per-product difference the charter warns against
 * assuming away.
 */
export function runVaultSettler(store, { now, date, repoDir }) {
  if (!now) throw new Error("replay-harness: a controlled clock (`now`) is required");
  const args = [path.join(repoDir, SETTLE_NFL_EXPERIMENTAL), "--now", now, "--repo-root", store];
  if (date) args.push("--date", date);
  const r = spawnSync("npx", ["tsx", ...args], { cwd: path.join(store, "app"), encoding: "utf8", env: { ...process.env } });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** A repo-shaped store: the vault settler reads `<root>/data` and `<root>/app/public`. */
export function makeRepoStore(prefix = "gtp-replay-repo-", appDir = process.cwd()) {
  const store = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(store, "app"), { recursive: true });
  for (const entry of ["node_modules", "src", "scripts"]) {
    try { fs.symlinkSync(path.join(appDir, entry), path.join(store, "app", entry), "dir"); } catch { /* best effort */ }
  }
  try { fs.copyFileSync(path.join(appDir, "tsconfig.json"), path.join(store, "app", "tsconfig.json")); } catch { /* alias resolution fails loudly */ }
  return store;
}

/**
 * The vault's business state: which events were graded and how. Excludes the settler's own wall-clock
 * stamps for the same reason the parlay comparison does.
 */
export function vaultState(store, date) {
  const doc = readStore(store, `data/internal/nfl/experimental-settlement/${date}.json`);
  if (!doc) return null;
  /* The receipt nests provenance under `lineage` and the outcome under `grade`. Reading them from
     the top level returned undefined for every event, which made the first version of the
     forecast-of-record test pass its comparison against two identical arrays of nothing. */
  const events = (doc.events ?? []).map((e) => ({
    providerEventId: e.providerEventId,
    receiptFile: e.lineage?.receiptFile ?? null,
    forecastGeneratedAt: e.lineage?.forecastGeneratedAt ?? null,
    inputHash: e.lineage?.inputHash ?? null,
    winnerHit: e.grade?.winnerHit ?? null,
    grade: e.grade ? JSON.stringify(e.grade) : null,
  })).sort((a, b) => String(a.providerEventId).localeCompare(String(b.providerEventId)));
  return { date: doc.date, ledger: doc.ledger, modelVersion: doc.modelVersion, events };
}

/** Count of cards by outcome. A population of zero is a test that proves nothing; callers assert on it. */
export function outcomeTally(state) {
  const tally = { win: 0, loss: 0, push: 0, void: 0, pending: 0, other: 0 };
  for (const c of state?.cards ?? []) {
    const r = String(c.result ?? "pending");
    if (r in tally) tally[r] += 1; else tally.other += 1;
  }
  return tally;
}

export function cleanup(store) {
  try { fs.rmSync(store, { recursive: true, force: true }); } catch { /* a temp dir we cannot remove is not a failure */ }
}

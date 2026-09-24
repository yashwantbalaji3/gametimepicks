/**
 * SOURCE-TREE READS THAT SURVIVE A CONCURRENT PROBE FILE.
 *
 * THE RACE. Two suites mutate a shipped module by writing a SIBLING COPY next to it and running a probe
 * against that copy (`identity/integrity.test.mjs`, `research/row-lineage.test.mjs`). The copy has to be a
 * sibling — a subdirectory would resolve the module's relative imports one level off — so for the length of
 * one child-process spawn there is an extra `<name>.mutation-probe.ts` inside `src/`.
 *
 * Meanwhile ~15 other guards walk `src/` and read what they enumerated. `node --test` runs those files in
 * parallel with the mutating suites, so a path can be listed by `readdirSync` and be gone by the time
 * `readFileSync` opens it. The guard then fails with an ENOENT that names a file nobody wrote and that no
 * longer exists — a red that says nothing about the property it was defending. The v1.8 integration drain
 * paid for this repeatedly, and `run-suite.mjs` already carries a note about the same shape biting
 * `founder-token-boundary` from the other direction.
 *
 * TWO LAYERS, AND THEY ARE NOT THE SAME FIX.
 *
 *   1. `isTransientSource` — do not enumerate the copy at all. This is the CORRECT fix, not merely the
 *      tolerant one: a mutation-probe sibling is a deliberately DEFECTIVE copy of a module, so a scanner
 *      that reads it is scanning a planted defect as though it were shipped source. `uiux/color-scan.mjs`
 *      and `launch/shared-blockers.test.mjs` already exclude it by name for exactly that reason, and the
 *      P211 release log records a colour-scan finding that came from reading one.
 *
 *   2. `readSourceIfPresent` — the residual layer, for anything that vanishes that we did not name. It
 *      tolerates ENOENT ONLY. A missing file returns null; every other errno still throws. That distinction
 *      is the whole point: the three ad-hoc readers this replaces (`legal/texts`, `analytics/sink-inline`,
 *      `accounts/schema-contract`) each spelled it `catch { return ""; }`, which also swallows EACCES and
 *      EISDIR — so an unreadable tree would have scanned as an empty one and every guard over it would have
 *      passed while looking at nothing. Tolerating the race must not buy a vacuous pass.
 *
 * WHAT STAYS LOUD. A permission error, a malformed read, a directory where a file was expected, and a file
 * the caller asserts must exist (callers that require content still assert on null) all still fail.
 */
import fs from "node:fs";
import path from "node:path";

/** The probe-file naming convention, written down once. Both mutating suites produce this shape. */
export const TRANSIENT_SOURCE = /\.mutation-probe\./;

/** True for a transient sibling copy written by a mutating suite — never a shipped module. */
export const isTransientSource = (name) => TRANSIENT_SOURCE.test(name);

/**
 * Read a file that an earlier `readdirSync` said was there.
 *
 * Returns the contents, or `null` if the file has since disappeared (ENOENT). Any other filesystem error
 * is rethrown unchanged — this tolerates a race, not a broken tree.
 */
export function readSourceIfPresent(file, encoding = "utf8") {
  try {
    return fs.readFileSync(file, encoding);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Walk a tree and return the files `keep(name)` accepts, skipping transient probe copies and the
 * directories no source scan wants. `keep` sees the basename, exactly as the hand-rolled walkers this
 * replaces did, so a call site's file set is unchanged apart from the probe copies it never meant to read.
 */
export function walkSourceFiles(dir, keep, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!["node_modules", ".next", "out"].includes(e.name)) walkSourceFiles(p, keep, acc);
    } else if (!isTransientSource(e.name) && keep(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}

#!/usr/bin/env node
/**
 * RELEASE-REGISTER CONSERVATION (Program 203 · Release A).
 *
 *   npx tsx scripts/ops/append-release-history.mjs           # report missing rows
 *   npx tsx scripts/ops/append-release-history.mjs --emit    # print row code to splice in
 *
 * The committed register (src/lib/launch/release-history.mjs) is the canonical row owner the
 * operating record renders from. This derives the CONVENTION-ERA release commits from git —
 * three subject conventions:  "P2xx R-y: …" / "(P19x Release Y)" / "(Release Y)" — and reports
 * any commit missing from the register. The guard test runs the same derivation, so a release
 * commit that never lands in the register fails the build instead of silently vanishing from
 * the record (the exact truncation class the P203 charter names).
 */
import { execSync } from "node:child_process";
import { RELEASE_HISTORY } from "../../src/lib/launch/release-history.mjs";

const RE = /\|P[0-9]{3} (R-[A-Z0-9]+|Phase 0|L)[ :]|\(P[0-9]{3} Releases? [A-Z0-9+]+\)|\(Release [A-Z0-9+/]+\)/;

/**
 * True when this clone does not carry full history. `git log` on a shallow clone returns whatever
 * few commits were fetched, so EVERY derivation below silently narrows to that window — the
 * conservation guard would find no convention commits and pass by absence. Callers must refuse
 * rather than report a clean register they did not actually check.
 */
export function isShallowRepository() {
  try {
    return execSync("git rev-parse --is-shallow-repository", { cwd: process.cwd(), encoding: "utf8" }).trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Is `abbrev` (a register row's stored sha) the same commit as `full`?
 *
 * ── WHY THIS IS NOT `===` ──────────────────────────────────────────────────────────────────────
 * Both sides used to be `%h`, and `%h` is not a stable identifier: git scales the abbreviation with
 * the object count, so the same commit prints 9 characters in a smaller repo and 10 in a larger one.
 * The register was written when `%h` gave 9 (185 of its 187 rows are 9 characters, two are 8) and
 * the repo has since crossed into 10, so a string compare stopped matching on EVERY row at once —
 * 119 convention-era releases all reading as missing from a register that in fact held them.
 *
 * The full sha is the identity. A register row holds a prefix of it, of whatever length was current
 * the day it was written, so the comparison is a prefix test against `%H` and stays correct however
 * the abbreviation moves again.
 */
export function shaMatches(abbrev, full) {
  return typeof abbrev === "string" && abbrev.length >= 7 && full.startsWith(abbrev);
}

/** Convention-era release commits, newest last, each carrying its FULL sha as identity. */
export function conventionCommits() {
  const log = execSync('git log --reverse --format="%H|%cs|%s|%p"', { cwd: process.cwd(), encoding: "utf8" });
  return log.split("\n").filter((l) => RE.test(l)).map((l) => {
    const [commit, date, subject, parents] = l.split("|");
    let program = null, release = null;
    let m = subject.match(/^P([0-9]{3}) (R-[A-Z0-9]+(?: fix)?|Phase 0(?: \+ Release [A-Z])?|L):/);
    if (m) { program = m[1]; release = m[2]; }
    if (!program && (m = subject.match(/\(P([0-9]{3}) Releases? ([A-Z0-9+]+)\)/))) { program = m[1]; release = m[2]; }
    if (!program && (m = subject.match(/\(Release ([A-Z0-9+/]+)\)/))) { release = m[1]; const pm = subject.match(/P(19[6-9])/); program = pm ? pm[1] : "196"; }
    return { commit, date, subject, program, release, rollbackParent: (parents ?? "").split(" ")[0] || null };
  });
}

/** Convention commits with no register row, by full-sha identity. Exported so the guard shares it. */
export function missingFromRegister(commits = conventionCommits(), register = RELEASE_HISTORY) {
  const rows = register.map((r) => r.commit).filter(Boolean);
  return commits.filter((c) => !rows.some((row) => shaMatches(row, c.commit)));
}

/*
 * CLI only. The guard test imports the helpers above, and deriving 119 commits from git on every
 * import — including the imports the test makes for other reasons — is a cost and a side effect
 * neither caller asked for.
 */
if (process.argv[1] && process.argv[1].endsWith("append-release-history.mjs")) {
  if (isShallowRepository()) {
    console.error("::error::shallow clone — `git log` cannot see the convention era, so nothing here can be verified. Fetch full history (actions/checkout with fetch-depth: 0).");
    process.exit(1);
  }
  const commits = conventionCommits();
  const missing = missingFromRegister(commits);

  if (process.argv.includes("--emit")) {
    for (const c of [...missing].reverse()) {
      const outcome = c.subject.replace(/^P[0-9]{3} (R-[A-Z0-9]+(?: fix)?|Phase 0|L): /, "").replace(/"/g, '\\"');
      console.log(`  { program: "${c.program}", release: "${c.release}", commit: "${c.commit}", date: "${c.date}", departments: [], outcome: "${outcome}", defectsFound: null, rollbackParent: ${c.rollbackParent ? `"${c.rollbackParent}"` : "null"} },`);
    }
  } else {
    console.log(`convention-era commits: ${commits.length} · in register: ${commits.length - missing.length} · MISSING: ${missing.length}`);
    for (const c of missing.slice(0, 5)) console.log(`  missing: ${c.commit.slice(0, 10)} ${c.subject.slice(0, 70)}`);
  }
}

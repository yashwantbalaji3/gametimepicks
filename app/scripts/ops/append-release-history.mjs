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

export function conventionCommits() {
  const log = execSync('git log --reverse --format="%h|%cs|%s|%p"', { cwd: process.cwd(), encoding: "utf8" });
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

const inRegister = new Set(RELEASE_HISTORY.map((r) => r.commit));
const missing = conventionCommits().filter((c) => !inRegister.has(c.commit));

if (process.argv.includes("--emit")) {
  for (const c of [...missing].reverse()) {
    const outcome = c.subject.replace(/^P[0-9]{3} (R-[A-Z0-9]+(?: fix)?|Phase 0|L): /, "").replace(/"/g, '\\"');
    console.log(`  { program: "${c.program}", release: "${c.release}", commit: "${c.commit}", date: "${c.date}", departments: [], outcome: "${outcome}", defectsFound: null, rollbackParent: ${c.rollbackParent ? `"${c.rollbackParent}"` : "null"} },`);
  }
} else {
  console.log(`convention-era commits: ${conventionCommits().length} · in register: ${conventionCommits().length - missing.length} · MISSING: ${missing.length}`);
  for (const c of missing.slice(0, 5)) console.log(`  missing: ${c.commit} ${c.subject.slice(0, 70)}`);
}

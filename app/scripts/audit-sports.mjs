/**
 * audit-sports — measure what each sport can ACTUALLY do, and compare it to what the registry claims.
 *
 * `sport-capability-registry.ts` is the single source of truth for per-sport capability, and its guard
 * test already checks that every cited evidence path EXISTS. Sprint 032 found the narrower gap: existence
 * is not capability. A directory can sit there, present and empty, while the registry keeps advertising
 * FULL_MODEL — the same green-but-broken shape as a passing health check reading a dead heartbeat.
 *
 * This reports the measurement rather than asserting a conclusion: for every sport, what evidence exists,
 * whether its dated artifact directories are populated, and how old the newest artifact is.
 *
 * It is a REPORT, not a gate, and deliberately so. Artifact age is a legitimate function of the calendar —
 * an off-season sport with month-old files is correct, not broken — so turning age into a pass/fail
 * assertion would produce a test that rots on the schedule rather than on the code. The non-rotting
 * invariant (a FULL_MODEL sport may not cite an EMPTY artifact directory) is enforced in
 * sport-capability-evidence.test.mjs instead.
 *
 * Read-only. Touches no files, no money, no data.
 *
 *   node scripts/audit-sports.mjs [--json]
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const asJson = process.argv.includes("--json");

const { SPORT_CAPABILITIES } = await import("../src/lib/sport-capability-registry.ts");

const etDate = (d) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

const DATED = /^(\d{4}-\d{2}-\d{2})\.json$/;

/** Inspect one cited evidence path without interpreting it. */
function inspect(rel) {
  const abs = path.join(REPO, rel);
  if (!fs.existsSync(abs)) return { path: rel, kind: "missing", exists: false };

  const stat = fs.statSync(abs);
  if (!stat.isDirectory()) return { path: rel, kind: "file", exists: true, bytes: stat.size };

  const entries = fs.readdirSync(abs);
  const dated = entries
    .map((e) => DATED.exec(e)?.[1])
    .filter(Boolean)
    .sort();
  return {
    path: rel,
    kind: "directory",
    exists: true,
    fileCount: entries.length,
    // An empty directory is the signal worth surfacing — it looks identical to a populated one
    // from the outside, and it is what "the UI exists so the sport must work" is built on.
    isEmpty: entries.length === 0,
    datedArtifacts: dated.length,
    newestArtifact: dated.length ? dated[dated.length - 1] : null,
  };
}

function daysBetween(fromIsoDate, toIsoDate) {
  const [fy, fm, fd] = fromIsoDate.split("-").map(Number);
  const [ty, tm, td] = toIsoDate.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

const today = etDate(new Date());

const report = SPORT_CAPABILITIES.map((cap) => {
  const evidence = cap.evidence.map(inspect);
  const newest = evidence
    .map((e) => e.newestArtifact)
    .filter(Boolean)
    .sort()
    .pop() ?? null;
  return {
    key: cap.key,
    label: cap.label,
    state: cap.state,
    reason: cap.reason,
    evidence,
    newestArtifact: newest,
    artifactAgeDays: newest ? daysBetween(newest, today) : null,
    missingEvidence: evidence.filter((e) => !e.exists).map((e) => e.path),
    emptyDirectories: evidence.filter((e) => e.isEmpty).map((e) => e.path),
  };
});

if (asJson) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), todayEt: today, sports: report }, null, 2));
} else {
  console.log(`\n  Sport capability audit — ${today} (ET)\n`);
  console.log(`  ${"SPORT".padEnd(8)}${"STATE".padEnd(18)}${"NEWEST".padEnd(13)}AGE`);
  console.log(`  ${"-".repeat(52)}`);
  for (const s of report) {
    const age = s.artifactAgeDays === null ? "—" : `${s.artifactAgeDays}d`;
    console.log(
      `  ${s.key.padEnd(8)}${s.state.padEnd(18)}${(s.newestArtifact ?? "—").padEnd(13)}${age}`,
    );
  }

  const problems = report.filter((s) => s.missingEvidence.length || s.emptyDirectories.length);
  if (problems.length) {
    console.log(`\n  Evidence problems:\n`);
    for (const s of problems) {
      for (const p of s.missingEvidence) console.log(`    ${s.key}: cited evidence MISSING — ${p}`);
      for (const p of s.emptyDirectories) console.log(`    ${s.key}: cited directory is EMPTY — ${p}`);
    }
  } else {
    console.log(`\n  Every cited evidence path exists and no cited directory is empty.`);
  }

  console.log(
    `\n  Artifact age is reported, not judged: an off-season sport with old files is correct.\n` +
      `  What would be wrong is a FULL_MODEL sport citing an empty directory — that is enforced\n` +
      `  as a test, not left to this report.\n`,
  );
}

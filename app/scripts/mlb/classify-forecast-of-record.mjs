#!/usr/bin/env node
/**
 * CLASSIFY every graded MLB game by the BEST publication evidence available (TRUTH-001, founder decisions 2 + 3).
 * READ-ONLY. Combines shadow runs of shadow-served-forecast-of-record.mjs:
 *
 *   npx tsx scripts/mlb/classify-forecast-of-record.mjs --exact <dir> --conservative <dir> [--typical <dir>] --out <file>
 *
 *   --exact         a run on an exact deployment record (Vercel API, ±5 s) — used inside its window
 *   --conservative  a run on GitHub's record with its worst observed clock (−600 s / +60 s) and FAILURE / status-less
 *                   records distrusted — used everywhere else
 *   --typical       optional: GitHub with a ±60 s clock. NEVER verifies anything; it is shown only as a hint of what
 *                   better evidence would probably find
 *
 * Classes: VERIFIED_AGREES (the graded revision is what the site served) · VERIFIED_DIFFERENT_REVISION · VERIFIED_NEVER_
 * PUBLIC (the serving build showed the game unavailable) · UNVERIFIED_<status> (fail closed: no claim either way).
 */
import fs from "node:fs";
import path from "node:path";

const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const rows = (dir) => (dir ? new Map(fs.readFileSync(path.join(dir, "shadow-rows.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.gamePk, r])) : new Map());
const summary = (dir) => (dir ? JSON.parse(fs.readFileSync(path.join(dir, "shadow-summary.json"), "utf8")) : null);
const exactDir = arg("--exact");
const consDir = arg("--conservative");
const typDir = arg("--typical");
const OUT = arg("--out");
if (!consDir || !OUT) { console.error("REFUSED: --conservative <dir> and --out <file> required"); process.exit(2); }
const E = rows(exactDir);
const C = rows(consDir);
const T = rows(typDir);

const classOf = (r) => (r.status === "SERVED" ? (r.agrees ? "VERIFIED_AGREES" : "VERIFIED_DIFFERENT_REVISION") : r.status === "NOT_SERVED" ? "VERIFIED_NEVER_PUBLIC" : `UNVERIFIED_${r.status}`);
const games = [...C.values()].map((c) => {
  const useExact = E.has(c.gamePk);
  const r = useExact ? E.get(c.gamePk) : c;
  const cls = classOf(r);
  const t = T.get(c.gamePk);
  return {
    gamePk: c.gamePk, date: c.date, evidence: useExact ? "EXACT_RECORD" : "GITHUB_CONSERVATIVE", class: cls, status: r.status, reason: r.reason,
    cutoff: r.cutoff ?? null, cutoffBasis: r.cutoffBasis ?? null,
    gradedSource: r.gradedSource, gradedHash: r.gradedHash, servedHash: r.servedHash, publishedAt: r.publishedAt, deployment: r.deployment,
    weakerEvidenceHint: !cls.startsWith("VERIFIED") && t ? (t.status === "SERVED" ? (t.agrees ? "TYPICAL_CLOCK_AGREES" : "TYPICAL_CLOCK_DIFFERS") : t.status === "NOT_SERVED" ? "TYPICAL_CLOCK_NOT_SERVED" : null) : null,
  };
}).sort((a, b) => a.date.localeCompare(b.date) || a.gamePk - b.gamePk);

const tally = {};
for (const g of games) tally[`${g.evidence}:${g.class}`] = (tally[`${g.evidence}:${g.class}`] ?? 0) + 1;
const doc = {
  schema: "gtp.mlb.forecast-of-record-classification@1",
  rule: "Exact record inside its window; GitHub with its worst observed clock elsewhere; start = the play-by-play first-pitch interval. A weaker-evidence hint never verifies.",
  runs: { exact: exactDir ? summary(exactDir) : null, conservative: summary(consDir), typical: typDir ? summary(typDir) : null },
  tally,
  verifiedDifferentRevision: games.filter((g) => g.class === "VERIFIED_DIFFERENT_REVISION").map((g) => ({ gamePk: g.gamePk, date: g.date })),
  verifiedNeverPublic: games.filter((g) => g.class === "VERIFIED_NEVER_PUBLIC").map((g) => ({ gamePk: g.gamePk, date: g.date })),
  games,
};
for (const k of ["exact", "conservative", "typical"]) if (doc.runs[k]) delete doc.runs[k].undecided;
fs.writeFileSync(path.resolve(OUT), JSON.stringify(doc, null, 1) + "\n");
console.log(JSON.stringify({ tally, verifiedDifferentRevision: doc.verifiedDifferentRevision.length, verifiedNeverPublic: doc.verifiedNeverPublic }, null, 2));

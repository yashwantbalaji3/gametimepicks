#!/usr/bin/env node
/**
 * The workflow's push job runs this before pushing. It trusts only what the WORKER cannot forge:
 *
 *   founder G3 "keep" decision (the worker's role can't write decisions)  →  approvedExactDigest
 *     = digest of the G3 decision-request's subject                       →  subject.verificationDigest
 *     = digest of the verification artifact                               →  patch.sha256 and workcopy.base
 *   and the bundle's tip must be a single commit on that base whose `git diff --binary base tip` hashes to that
 *   patch sha. So only the exact change set the founder approved at G3 can be pushed, under the G3 branch name.
 *
 * Uses the read-only gtp_cc_reader role. Exit 0 = push may proceed; anything else refuses.
 *   DATABASE_URL (reader) · JOB_ID · BRANCH · TIP
 */
import { execFileSync } from "node:child_process";
import { neon } from "../ledger/pg-adapters.mjs";
import { digestOf, sha256 } from "../lib/util.mjs";

export function checkKept({ entries, branch, tip, jobId, git }) {
  const problems = [];
  const by = (kind, pred) => entries.filter((e) => e.kind === kind && pred(e.data));
  const job = by("job", (d) => d.jobId === jobId && d.status === "requested")[0]?.data;
  if (!job || job.type !== "keep") return [`job ${jobId} is not a requested keep job`];
  const keep = by("decision", (d) => d.commandId === job.commandId && d.gate === "G3" && d.verdict === "keep");
  if (keep.length !== 1) return ["no single founder G3 keep decision for this command"];
  if (!keep[0].actorIsFounderWrite) problems.push("the keep decision was not written by the web app role");
  const request = by("decision-request", (d) => d.decisionId === keep[0].data.decisionId && d.gate === "G3")
    .find((e) => digestOf(e.data.subject) === keep[0].data.approvedExactDigest)?.data;
  if (!request) return [...problems, "no G3 request matches the digest the founder approved"];
  if (request.subject.branch !== branch) problems.push(`approved branch is ${request.subject.branch}, not ${branch}`);
  const verification = by("contribution", (d) => d.commandId === job.commandId && d.artifactType === "verification")
    .map((e) => e.data.artifact).find((a) => digestOf(a) === request.subject.verificationDigest);
  if (!verification?.patch?.sha256 || !verification.workcopy?.base) return [...problems, "no verification matches the approved digest"];
  const base = verification.workcopy.base;
  if (git(["rev-parse", `${tip}^`]).trim() !== base) problems.push("the tip is not a single commit on the approved base");
  if (sha256(git(["diff", "--binary", "--no-color", base, tip])) !== verification.patch.sha256) problems.push("the tip's change set differs from the patch approved at G3");
  return problems;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const { DATABASE_URL, JOB_ID, BRANCH, TIP } = process.env;
  if (!DATABASE_URL || !/^job-[0-9a-f]{12}$/.test(JOB_ID ?? "") || !/^cc\/[a-z0-9-]+$/.test(BRANCH ?? "") || !/^[0-9a-f]{40}$/.test(TIP ?? "")) {
    console.error("check-kept: missing or malformed input");
    process.exit(2);
  }
  const db = await neon(DATABASE_URL);
  const rows = (await db.query("SELECT kind, data, writer FROM ledger_entries WHERE kind IN ('job', 'decision', 'decision-request', 'contribution') ORDER BY seq")).rows;
  await db.close();
  const entries = rows.map((r) => ({ kind: r.kind, data: r.data, actorIsFounderWrite: r.kind !== "decision" || r.writer === "gtp_cc_app" }));
  const problems = checkKept({ entries, branch: BRANCH, tip: TIP, jobId: JOB_ID, git: (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }) });
  if (problems.length) {
    console.error(`check-kept: refusing to push — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(`check-kept: ${BRANCH} @ ${TIP.slice(0, 10)} is exactly the change set the founder kept at G3`);
}

// Chained replay of real `auto: nfl settlement receipts` commits on origin/main through the stamp gate under
// `--rules nfl-receipts` (read-only on the repo). Adapted from ../mlb-stamp-gate-2026-10-14/replay.mjs.
//
//   node docs/research/ops/nfl-receipts-stamp-gate-2026-10-16/replay.mjs <since-iso> [heartbeatHours|off]
//
// CHAINED: when a commit is suppressed its gated files are "restored" — the next receipts commit is judged
// against that virtual committed content, not the real parent, and the heartbeat ages from it. Any OTHER
// commit that writes the path resets it to the real content (the real writer committed it in both worlds).
//
// PUSH-LEVEL: nfl-event-window commits `auto: nfl event window` and then the receipts commit, and pushes both at
// once (COST-001 Stage A) — one push, one deployment. A suppressed receipts commit avoids a deployment ONLY
// if its paired window commit changed no build input either. Both counts are reported.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const REPO = process.cwd(); // run from the repo root
const { decide, buildInputPredicate, RULE_SETS } = await import(`${REPO}/app/src/lib/ops/stamp-only-gate.mjs`);
const RULES = RULE_SETS["nfl-receipts"];
const git = (...a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", maxBuffer: 512 << 20 });
const show = (rev, p) => { try { return git("show", `${rev}:${p}`); } catch { return null; } };
const NEW = buildInputPredicate(fs.readFileSync(`${REPO}/app/scripts/vercel-ignore-build.sh`, "utf8"));
const OLD = buildInputPredicate(git("show", `${process.env.BASE_REF ?? "origin/main"}:app/scripts/vercel-ignore-build.sh`));
const since = process.argv[2] ?? "2026-10-09T00:00:00Z";
const HB = process.argv[3] === "off" ? Infinity : Number(process.argv[3] ?? 6);
const RECEIPTS = /^auto: nfl settlement receipts\b/;
const WINDOW = /^auto: nfl event window\b/;
const log = git("log", "origin/main", "--first-parent", "--reverse", `--since=${since}`, "--format=%H\t%cI\t%s").trim().split("\n").map((l) => l.split("\t"));
const nameStatus = (sha) => git("diff-tree", "--no-commit-id", "-r", "--no-renames", "--name-status", sha).trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
const virtual = new Map(); const rows = [];
let prev = null;
for (const [sha, at, subj] of log) {
  const ns = nameStatus(sha);
  if (!RECEIPTS.test(subj)) { for (const [, p] of ns) virtual.delete(p); prev = [sha, at, subj, ns]; continue; }
  const changes = ns.map(([st, p]) => ({
    path: p, status: st[0],
    before: st === "A" ? null : (virtual.has(p) ? virtual.get(p) : show(`${sha}^`, p)),
    after: st === "D" ? null : show(sha, p),
    buildInput: NEW(p),
  }));
  const out = decide({ changes, nowMs: Date.parse(at), heartbeatHours: HB, rules: RULES });
  const oldBuild = ns.some(([, p]) => OLD(p));
  let newBuild;
  if (out.verdict === "SUPPRESS") {
    for (const p of out.restore) virtual.set(p, changes.find((x) => x.path === p).before);
    newBuild = ns.some(([, p]) => NEW(p) && !out.restore.includes(p));
  } else {
    for (const [, p] of ns) virtual.delete(p);
    newBuild = ns.some(([, p]) => NEW(p));
  }
  // The paired window commit: the first-parent predecessor, an `auto: nfl event window` commit pushed with it.
  const paired = prev && WINDOW.test(prev[2]) && Math.abs(Date.parse(at) - Date.parse(prev[1])) < 120_000 ? prev : null;
  const windowBuild = paired ? paired[3].some(([, p]) => NEW(p)) : false;
  rows.push({
    sha: sha.slice(0, 10), at, verdict: out.verdict,
    reasons: out.reasons, restored: out.restore,
    buildInputs: ns.filter(([, p]) => NEW(p)).map(([st, p]) => `${st} ${p}`),
    oldBuild, newBuild,
    window: paired ? { sha: paired[0].slice(0, 10), buildInput: windowBuild } : null,
    pushBuildBefore: oldBuild || windowBuild, pushBuildAfter: newBuild || windowBuild,
  });
  prev = [sha, at, subj, ns];
}
const OUT = process.env.OUT ?? ".";
fs.writeFileSync(`${OUT}/replay-${process.argv[3] ?? 6}.json`, JSON.stringify(rows, null, 1) + "\n");
const by = (f) => rows.filter(f).length;
const lines = [];
lines.push(`heartbeat=${HB}h since=${since} receipts commits=${rows.length} (paired with a window commit: ${by((r) => r.window)})`);
lines.push(`receipts commit changes a build input: before=${by((r) => r.oldBuild)} after=${by((r) => r.newBuild)} suppressed=${by((r) => r.verdict === "SUPPRESS")}`);
lines.push(`push (window+receipts) changes a build input: before=${by((r) => r.pushBuildBefore)} after=${by((r) => r.pushBuildAfter)} avoided=${by((r) => r.pushBuildBefore && !r.pushBuildAfter)}`);
lines.push(`suppressed receipts whose paired window commit still builds: ${by((r) => r.verdict === "SUPPRESS" && r.window?.buildInput)}`);
const cat = (reason) => reason
  .replace(/^app\/public\/data\/nfl\/live-props\/[^:]+:/, "live-props/<event>:")
  .replace(/^app\/public\/data\/nfl\/reconciliation\/(?!index)[^:]+:/, "reconciliation/<week>:")
  .replace(/^app\/public\/data\/nfl\/reconciliation\/index\.json:/, "reconciliation/index:")
  .replace(/^app\/public\/data\/nfl\/interval-calibration\.json:/, "interval-calibration:")
  .replace(/\d+\.\d+h old/, "Nh old");
const firstCats = {}, allCats = {};
for (const r of rows.filter((r) => r.verdict === "PUBLISH")) {
  const k = cat(r.reasons[0]); firstCats[k] = (firstCats[k] ?? 0) + 1;
  for (const k2 of new Set(r.reasons.map(cat))) allCats[k2] = (allCats[k2] ?? 0) + 1;
}
lines.push(`PUBLISH, first reason: ${JSON.stringify(firstCats, null, 1)}`);
lines.push(`PUBLISH, every reason (a commit counts once per category): ${JSON.stringify(allCats, null, 1)}`);
fs.writeFileSync(`${OUT}/summary-${process.argv[3] ?? 6}.txt`, lines.join("\n") + "\n");
console.log(lines.join("\n"));

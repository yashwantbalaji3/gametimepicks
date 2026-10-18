// Sequential replay of real MLB lineup/daily commits through the stamp gate (read-only on the repo).
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const REPO = process.cwd(); // run from the repo root
const { decide, buildInputPredicate, ruleFor } = await import(`${REPO}/app/src/lib/ops/stamp-only-gate.mjs`);
const git = (...a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", maxBuffer: 512 << 20 });
const show = (rev, p) => { try { return git("show", `${rev}:${p}`); } catch { return null; } };
const NEW = buildInputPredicate(fs.readFileSync(`${REPO}/app/scripts/vercel-ignore-build.sh`, "utf8"));
const OLD = buildInputPredicate(git("show", `${process.env.BASE_REF ?? "origin/main"}:app/scripts/vercel-ignore-build.sh`));
const since = process.argv[2] ?? "10 days ago";
const HB = process.argv[3] === "off" ? Infinity : Number(process.argv[3] ?? 6);
const log = git("log", "origin/main", "--first-parent", "--reverse", `--since=${since}`, "--format=%H\t%cI\t%s").trim().split("\n").map((l) => l.split("\t"));
const virtual = new Map(); const dropped = new Set(); const rows = [];
for (const [sha, at, subj] of log) {
  const ns = git("diff-tree", "--no-commit-id", "-r", "--no-renames", "--name-status", sha).trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
  const isMlb = /auto: mlb (lineup refresh|daily production)/.test(subj);
  if (!isMlb) { for (const [, p] of ns) virtual.delete(p); continue; }
  const changes = ns.map(([st, p]) => {
    const before = st === "A" ? null : (virtual.has(p) ? virtual.get(p) : show(`${sha}^`, p));
    const after = st === "D" ? null : show(sha, p);
    let priorSnapshot = null;
    if (st === "A" && ruleFor(p)?.snapshot) {
      const dir = p.slice(0, p.lastIndexOf("/"));
      const names = git("ls-tree", "--name-only", `${sha}^`, `${dir}/`).split("\n").filter((n) => /snapshot-\d{12}\.json$/.test(n) && !dropped.has(n)).sort();
      priorSnapshot = names.length ? show(`${sha}^`, names.at(-1)) : null;
    }
    return { path: p, status: st[0], before, after, buildInput: NEW(p), priorSnapshot };
  });
  const out = decide({ changes, nowMs: Date.parse(at), heartbeatHours: HB });
  const oldBuild = ns.some(([, p]) => OLD(p));
  let newBuild;
  if (out.verdict === "SUPPRESS") {
    for (const p of out.restore) { const c = changes.find((x) => x.path === p); virtual.set(p, c.before); }
    for (const p of out.drop) dropped.add(p);
    newBuild = ns.some(([, p]) => NEW(p) && !out.restore.includes(p) && !out.drop.includes(p));
  } else {
    for (const [, p] of ns) virtual.delete(p);
    newBuild = ns.some(([, p]) => NEW(p));
  }
  rows.push({ sha: sha.slice(0, 10), at, wf: /lineup/.test(subj) ? "lineup" : "daily", verdict: out.verdict, oldBuild, newBuild, reason: out.verdict === "PUBLISH" ? out.reasons[0] : "" });
}
fs.writeFileSync(`${process.env.OUT ?? "."}/replay-${process.argv[3] ?? 6}.json`, JSON.stringify(rows, null, 1));
const by = (f) => rows.filter(f).length;
console.log(`heartbeat=${HB}h commits=${rows.length} lineup=${by((r) => r.wf === "lineup")} daily=${by((r) => r.wf === "daily")}`);
for (const wf of ["lineup", "daily"]) console.log(`${wf}: build-triggering before=${by((r) => r.wf === wf && r.oldBuild)} after=${by((r) => r.wf === wf && r.newBuild)} suppressed=${by((r) => r.wf === wf && r.verdict === "SUPPRESS")}`);
const cats = {}; for (const r of rows.filter((r) => r.verdict === "PUBLISH")) { const k = r.reason.replace(/^[^:]*\/(\w[\w-]*)\/[^:]*:/, "$1:").replace(/\d+\.\d+h old/, "Nh old").replace(/\d{4}-\d{2}-\d{2}/g, "D"); cats[k] = (cats[k] ?? 0) + 1; }
console.log(cats);

// Build-cost audit 2026-10-19: per-push table + ignore-step replay + lever counterfactuals. Read-only (git on refs + cached GitHub GETs).
// usage: node analyze.mjs <headSha>
import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
const S = new URL(".", import.meta.url).pathname;
const WT = "/Users/yashwantbalaji/Downloads/gametimepicks-wt/cost-1019";
const HEAD = process.argv[2];
const START = "2026-10-12T00:00:00Z";
const git = (args) => execFileSync("git", ["-C", WT, ...args], { encoding: "utf8", maxBuffer: 1 << 30 });

// ---------- writer buckets (same regexes as docs/cost/scripts-2026-10-17/push-replay.mjs, + nba research/forecast window) ----------
const BUCKETS = [
  ["nfl event window", /nfl event window/], ["nfl settlement receipts", /nfl settlement receipts/], ["nfl sim v2 shadow", /nfl sim v2 shadow/],
  ["nfl results capture", /nfl results capture/], ["nfl other", /\bnfl|nflverse/i],
  ["mlb lineup refresh", /mlb lineup refresh/], ["mlb daily production", /mlb daily production/], ["mlb pregame archive metadata", /mlb pregame archive metadata/],
  ["nba results capture", /nba results capture/], ["nba pre-tip window", /nba pre-tip/], ["nba internal research", /nba (roster capture|experimental)/], ["nba other", /\bnba\b/i],
  ["daily products", /daily products/], ["nightly settle", /nightly settle/], ["forecast ledger", /forecast ledger/],
  ["auto-refresh (ops)", /^auto-refresh/], ["cron-slot coverage", /cron-slot coverage/], ["pregame weather", /pregame weather/],
  ["epl", /\bepl\b/i], ["soccer leagues", /soccer league forecasts/], ["soccer DC v2 shadow", /Dixon-Coles/], ["ufc", /\bufc\b/i],
  ["morning projections", /morning projections/], ["injuries facts", /injuries facts/], ["schedule capture", /schedule capture/], ["top boards", /top boards/],
  ["PR merge / human", /^Merge |^(?!auto)/],
];
const bucketOf = (s) => (BUCKETS.find(([, re]) => re.test(s)) ?? ["other auto"])[0];
const isNba = (b) => b.startsWith("nba");
const isNfl = (b) => b.startsWith("nfl");

// ---------- predicate, parsed per commit from that commit's own script (what Vercel ran for it) ----------
const predCache = new Map();
function pathspecsAt(sha) {
  const blob = git(["rev-parse", `${sha}:app/scripts/vercel-ignore-build.sh`]).trim();
  if (predCache.has(blob)) return predCache.get(blob);
  const sh = git(["cat-file", "-p", blob]);
  const arr = (name) => { const m = sh.match(new RegExp(`\\n${name}=\\(([\\s\\S]*?)\\n\\)`)); return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : []; };
  const specs = [...arr("BUILD_INPUTS"), ...arr("NON_BUILD_INPUTS").map((p) => `:(top,exclude)${p}`), ...arr("NON_BUILD_GLOBS").map((g) => `:(top,exclude,glob)${g}`)];
  const v = { blob: blob.slice(0, 8), specs, slo: sh.includes("publication-slo-public-changed.mjs") };
  predCache.set(blob, v);
  return v;
}
/** Replay of the script's decision for (base, head): "BUILD" | "SKIP", plus reason. */
function replay(base, head) {
  if (!base) return { v: "BUILD", why: "no base" };
  const p = pathspecsAt(head);
  const d = spawnSync("git", ["-C", WT, "diff", "--quiet", base, head, "--", ...p.specs]);
  if (d.status === 1) return { v: "BUILD", why: "path", pred: p.blob };
  if (d.status !== 0) return { v: "BUILD", why: "git error", pred: p.blob };
  if (p.slo) {
    const s = spawnSync("git", ["-C", WT, "diff", "--quiet", base, head, "--", ":(top)app/public/data/ops/publication-slo.json"]);
    if (s.status !== 0) {
      const h = spawnSync("node", [`${WT}/app/scripts/ops/publication-slo-public-changed.mjs`, base, head], { cwd: WT });
      if (h.status !== 0) return { v: "BUILD", why: "slo", pred: p.blob };
    }
  }
  return { v: "SKIP", why: "no input", pred: p.blob };
}
const inputFiles = (base, head) => { const p = pathspecsAt(head); return git(["diff", "--no-renames", "--name-status", base, head, "--", ...p.specs]).trim().split("\n").filter(Boolean).map((l) => l.split("\t")); };

// ---------- CLOCK_ONLY test: every changed input is JSON(L) and equal after masking ISO-8601 datetimes ----------
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g;
function blob(spec) { const r = spawnSync("git", ["-C", WT, "show", spec], { encoding: "utf8", maxBuffer: 1 << 30 }); return r.status === 0 ? r.stdout : null; }
function clockOnly(base, head, files) {
  if (!files.length || files.length > 300) return false;
  for (const [st, f] of files) {
    if (st !== "M" || !/\.jsonl?$/.test(f)) return false;
    const a = blob(`${base}:${f}`), b = blob(`${head}:${f}`);
    if (a == null || b == null || a.replace(ISO, "T") !== b.replace(ISO, "T")) return false;
  }
  return true;
}

// ---------- data ----------
const cst = JSON.parse(fs.readFileSync(S + "cstatus-cache.json", "utf8"));
const deps = JSON.parse(fs.readFileSync(S + "deployments.json", "utf8"));
const depBySha = new Map();
for (const d of deps) { (depBySha.get(d.sha) ?? depBySha.set(d.sha, []).get(d.sha)).push(d); }
const commits = git(["log", "--first-parent", "--format=%H%x09%cI%x09%an%x09%s", `--since=2026-10-11T23:00:00Z`, HEAD]).trim().split("\n").map((l) => { const [sha, t, an, s] = l.split("\t"); return { sha, t: new Date(t).toISOString(), an, s, b: bucketOf(s) }; }).reverse();
const outcomeOf = (sha) => {
  const v = (cst[sha] ?? []).filter((x) => x.ctx === "Vercel").sort((a, b) => a.at.localeCompare(b.at));
  if (!v.length) return null;
  const f = v.at(-1), d = f.d ?? "";
  const o = /completed/.test(d) ? "completed" : /Ignored/.test(d) ? "ignored" : /Dashboard/.test(d) ? "canceled" : /failed/.test(d) ? "failed" : f.state === "pending" ? "unresolved" : f.state;
  return { o, first: v[0].at, final: f.at, nStatus: v.length };
};
// Successful Production deployments (time = deployment record time = terminal event)
const okDeps = deps.filter((d) => d.statuses.some((s) => s.state === "success")).map((d) => ({ sha: d.sha, at: d.created_at })).sort((a, b) => a.at.localeCompare(b.at));
const lastOkBefore = (iso, not) => { let r = null; for (const d of okDeps) { if (d.at < iso) { if (d.sha !== not) r = d; } else break; } return r; };

// ---------- pushes ----------
const pushes = [];
let pending = [];
let prevHead = null;
for (const c of commits) {
  pending.push(c);
  const st = outcomeOf(c.sha);
  if (!st) continue;
  const push = { head: c.sha, t: c.t, day: c.t.slice(0, 10), commits: pending, ...st, prevHead: prevHead?.sha ?? null };
  pending = [];
  prevHead = c;
  if (c.t < START) continue;
  push.writers = [...new Set(push.commits.map((x) => x.b))];
  push.headWriter = c.b;
  push.touched = git(["diff", "--name-only", push.prevHead, push.head]).trim().split("\n").filter(Boolean);
  push.areas = [...new Set(push.touched.map((f) => f.split("/").slice(0, f.startsWith("app/public/data/") ? 4 : 2).join("/")))].slice(0, 8);
  // Inferred base = last successful Production deployment recorded before this head's first Vercel status (≈ when the ignore step can first run).
  const refT = push.first < push.final ? push.first : push.t; push.refT = refT; const ok = lastOkBefore(refT, push.head);
  push.base = ok?.sha ?? null;
  push.baseKind = ok ? "deployed" : "HEAD^";
  if (!push.base) push.base = push.prevHead;
  const r = replay(push.base, push.head);
  push.replay = r.v; push.replayWhy = r.why; push.pred = r.pred;
  const own = replay(push.prevHead, push.head);
  push.ownReplay = own.v; push.ownWhy = own.why;
  const inF = own.v === "BUILD" && own.why === "path" ? inputFiles(push.prevHead, push.head) : [];
  push.nInput = inF.length;
  push.clockOnly = own.v === "BUILD" && own.why === "path" ? clockOnly(push.prevHead, push.head, inF) : false;
  // which writers in the push touched an input
  if (inF.length) {
    const set = new Set(inF.map(([, f]) => f));
    const who = new Set();
    for (const x of push.commits) {
      const parent = git(["rev-parse", `${x.sha}^1`]).trim();
      const ch = git(["diff", "--name-only", parent, x.sha]).trim().split("\n");
      if (ch.some((f) => set.has(f))) who.add(x.b);
    }
    push.inputWriters = [...who];
  } else push.inputWriters = [];
  const dl = depBySha.get(c.sha) ?? [];
  push.deployments = dl.map((d) => ({ at: d.created_at, state: d.statuses.at(-1)?.state, desc: d.statuses.at(-1)?.description?.slice(0, 40) }));
  push.e2eMin = (Date.parse(push.final) - Date.parse(push.t)) / 60000;
  push.pendMin = (Date.parse(push.final) - Date.parse(push.first)) / 60000;
  pushes.push(push);
}
fs.writeFileSync(S + "pushes.json", JSON.stringify(pushes.map(({ commits, touched, ...p }) => ({ ...p, n: commits.length, subjects: commits.map((x) => x.s.slice(0, 70)) })), null, 1));
console.error("pushes", pushes.length, "commits in window", commits.filter((c) => c.t >= START).length, "trailing unpushed", pending.length, "predicates", [...predCache.values()].map((p) => p.blob));

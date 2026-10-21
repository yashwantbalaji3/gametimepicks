// Per-PUSH replay of Production deployments (read-only; git + already-fetched GitHub data).
// A "push" = the commits between the previous Production deployment's sha and this deployment's sha
// (first-parent). Pushes the ignore step skipped create no GitHub deployment, so their (non-input)
// files fold into the next push — which cannot add build inputs, by construction of the skip.
//
// Build-input predicate: a FAITHFUL re-implementation of origin/main app/scripts/vercel-ignore-build.sh
// (post-#1091): BUILD_INPUTS prefixes, minus NON_BUILD_INPUTS (app/public/data/ops/), minus
// NON_BUILD_GLOBS (app/**/*.test.mjs, app/e2e/**, app/scripts/ci/**). The arrays are PARSED from the
// script so the replay tracks whatever main says.
//
// usage: node push-replay.mjs <repo> <scratch> [sinceISO]
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const [REPO, S, SINCE = "2026-10-09T00:00:00Z"] = process.argv.slice(2);
const git = (args, input) => execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8", maxBuffer: 1 << 30, input });

// ---------- predicate parsed from main's script ----------
const sh = git(["show", "origin/main:app/scripts/vercel-ignore-build.sh"]);
const arr = (name) => { const m = sh.match(new RegExp(`\\n${name}=\\(([\\s\\S]*?)\\n\\)`)); return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null; };
const inputs = arr("BUILD_INPUTS").map((p) => p.replace(":(top)", ""));
const nonInputs = arr("NON_BUILD_INPUTS");
const globs = arr("NON_BUILD_GLOBS");
const globRe = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "\u0001").replace(/\*\*/g, "\u0002").replace(/\*/g, "[^/]*").replace(/\u0001/g, "(?:.*/)?").replace(/\u0002/g, ".*") + "$");
const globRes = globs.map(globRe);
const under = (f, p) => (p.endsWith("/") ? f.startsWith(p) : f === p || f.startsWith(p + "/"));
export const isInput = (f) => inputs.some((p) => under(f, p)) && !nonInputs.some((p) => under(f, p)) && !globRes.some((r) => r.test(f));
fs.writeFileSync(`${S}/predicate.json`, JSON.stringify({ inputs, nonInputs, globs }, null, 1));

// ---------- stamp test ----------
const BROAD = ["generatedAt", "ledgerGeneratedAt", "observedAt", "checkedAt", "builtAt", "lastRunAt", "updatedAt", "asOf", "capturedAt", "computedAt", "refreshedAt"];
const NARROW = ["generatedAt", "ledgerGeneratedAt", "builtAt", "lastRunAt", "computedAt", "refreshedAt"]; // excludes observation/capture clocks that drive "Updated Ns ago" style freshness
const strip = (v, keys, hit) => {
  if (Array.isArray(v)) return v.map((x) => strip(x, keys, hit));
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v).sort()) { if (keys.includes(k)) { hit?.add(k); continue; } o[k] = strip(v[k], keys, hit); } return o; }
  return v;
};
const same = (a, b, keys, hit) => { if (a == null || b == null) return false; try { const h = new Set(); const r = JSON.stringify(strip(JSON.parse(a), keys, h)) === JSON.stringify(strip(JSON.parse(b), keys, h)); if (r) h.forEach((k) => hit?.add(k)); return r; } catch { return false; } };

function blobs(specs) { // specs: ["sha:path", ...] -> Map spec -> text|null
  const out = new Map(); if (!specs.length) return out;
  const buf = execFileSync("git", ["-C", REPO, "cat-file", "--batch"], { input: specs.join("\n") + "\n", maxBuffer: 2 ** 31 - 1 });
  let i = 0;
  for (const spec of specs) {
    const nl = buf.indexOf(10, i); const hdr = buf.toString("utf8", i, nl); i = nl + 1;
    if (hdr.endsWith("missing")) { out.set(spec, null); continue; }
    const size = Number(hdr.split(" ")[2]); out.set(spec, buf.toString("utf8", i, i + size)); i += size + 1;
  }
  return out;
}

// ---------- trigger buckets ----------
const BUCKETS = [
  ["nfl event window", /nfl event window/], ["nfl settlement receipts", /nfl settlement receipts/], ["nfl sim v2 shadow", /nfl sim v2 shadow/],
  ["nfl results capture", /nfl results capture/], ["nfl other", /\bnfl|nflverse/i],
  ["mlb lineup refresh", /mlb lineup refresh/], ["mlb daily production", /mlb daily production/], ["mlb pregame archive metadata", /mlb pregame archive metadata/],
  ["nba results capture", /nba results capture/], ["nba pre-tip window", /nba pre-tip/], ["nba internal research", /nba (roster capture|experimental)/],
  ["daily products", /daily products/], ["nightly settle", /nightly settle/], ["forecast ledger", /forecast ledger/],
  ["auto-refresh (ops)", /^auto-refresh/], ["cron-slot coverage", /cron-slot coverage/], ["pregame weather", /pregame weather/],
  ["epl", /\bepl\b/], ["soccer leagues", /soccer league forecasts/], ["soccer DC v2 shadow", /Dixon-Coles/], ["ufc", /\bufc\b/i],
  ["morning projections", /morning projections/], ["injuries facts", /injuries facts/], ["schedule capture", /schedule capture/], ["top boards", /top boards/],
  ["PR merge / human", /^Merge |^(?!auto)/],
];
const bucketOf = (s) => (BUCKETS.find(([, re]) => re.test(s)) ?? ["other auto"])[0];

// ---------- data ----------
// Order = position on main's FIRST-PARENT history (push order), not created_at: Vercel creates queued deployments in
// bursts with identical timestamps and out of order. Deployments of SHAs not on first-parent main are dropped (counted).
const FP = new Map(fs.readFileSync(`${S}/fp-order.tsv`, "utf8").trim().split("\n").map((l) => { const [h, n] = l.split("\t"); return [h, Number(n)]; }));
const allDeps = fs.readFileSync(`${S}/deps-all.tsv`, "utf8").trim().split("\n").map((l) => l.split("\t"));
const deps = allDeps.filter((d) => FP.has(d[2])).sort((a, b) => FP.get(b[2]) - FP.get(a[2]));
console.error("dropped non-first-parent deployments:", allDeps.filter((d) => !FP.has(d[2]) && d[1] >= SINCE).map((d) => d[2].slice(0, 10) + "@" + d[1]).join(" "));
const vst = new Map();
for (const f of ["vstat.tsv", "vstat-new.tsv"]) for (const l of fs.readFileSync(`${S}/${f}`, "utf8").trim().split("\n")) { const [sha, a, b, st, d] = l.split("\t"); vst.set(sha, { a, b, st, d }); }
const outcome = (sha) => { const v = vst.get(sha); if (!v) return "unknown"; if (/completed/.test(v.d)) return "completed"; if (/Ignored/.test(v.d)) return "ignored"; if (/[Cc]ancel/.test(v.d)) return "canceled"; if (/failed/.test(v.d)) return "failed"; return v.st; };
const mins = (sha) => { const v = vst.get(sha); return v ? (Date.parse(v.b) - Date.parse(v.a)) / 60000 : null; };

const rows = [];
let lastOkSha = null, lastOkEnd = 0; const okHistory = []; // [endTime, sha]
for (let i = 1; i < deps.length; i++) {
  const [id, t, sha] = deps[i]; const P = deps[i - 1][2];
  const res = { id, t, sha, prev: P, outcome: outcome(sha), min: mins(sha) };
  if (t < SINCE) { if (outcome(P) === "completed") okHistory.push([Date.parse(vst.get(P)?.b ?? 0), P]); continue; }
  const commits = git(["log", "--first-parent", "--format=%H\t%s", `${P}..${sha}`]).trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
  res.ncommits = commits.length; res.buckets = [...new Set(commits.map((c) => bucketOf(c[1])))];
  const files = git(["diff", "--no-renames", "--name-status", P, sha]).trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
  const inFiles = files.filter(([, f]) => isInput(f));
  res.nfiles = files.length; res.ninput = inFiles.length;
  // Vercel's base: last COMPLETED deployment whose build ended before this one started
  const startT = Date.parse(vst.get(sha)?.a ?? t);
  for (let j = i - 1; j >= 0; j--) { const s = deps[j][2]; const v = vst.get(s); if (v && /completed/.test(v.d) && Date.parse(v.b) <= startT) { res.vercelBase = s; break; } }
  res.prevOutcome = outcome(P);
  if (!inFiles.length) { res.cls = "NO_INPUT"; rows.push(res); continue; }
  // stamp test per input file
  const specs = [];
  for (const [st, f] of inFiles) { if (st !== "A") specs.push(`${P}:${f}`); if (st !== "D") specs.push(`${sha}:${f}`); }
  const B = blobs(specs);
  const hitB = new Set(), hitN = new Set(); let allB = true, allN = true; const meaningful = [];
  for (const [st, f] of inFiles) {
    let okB = false, okN = false;
    if (st === "M" && f.endsWith(".json")) { okB = same(B.get(`${P}:${f}`), B.get(`${sha}:${f}`), BROAD, hitB); okN = okB && same(B.get(`${P}:${f}`), B.get(`${sha}:${f}`), NARROW, hitN); }
    if (!okB) allB = false; if (!okN) allN = false;
    if (!okB) meaningful.push([st, f]);
  }
  res.cls = allN ? "STAMP_ONLY_NARROW" : allB ? "STAMP_ONLY_BROAD" : "MEANINGFUL";
  res.stampKeys = [...hitB];
  // which buckets touched the meaningful files (attribution of the build's necessity)
  if (meaningful.length) {
    const who = new Set(); const perBucketFiles = {};
    const touched = git(["log", "--first-parent", "-m", "--name-only", "--format=@@%s", `${P}..${sha}`, "--", ...meaningful.slice(0, 400).map(([, f]) => f)]);
    let cur = null; const mset = new Set(meaningful.map(([, f]) => f));
    for (const l of touched.split("\n")) { if (l.startsWith("@@")) { cur = bucketOf(l.slice(2)); continue; } if (l && mset.has(l)) { who.add(cur); (perBucketFiles[cur] ??= new Set()).add(l); } }
    if (meaningful.length > 400) who.add("(truncated)");
    res.meaningfulBy = [...who];
    res.meaningfulSample = meaningful.slice(0, 6).map(([s, f]) => s + " " + f);
    res.meaningfulTop = Object.fromEntries(Object.entries(perBucketFiles).map(([k, v]) => [k, [...v].map((f) => f.split("/").slice(0, 5).join("/")).reduce((m, d) => (m[d] = (m[d] ?? 0) + 1, m), {})]));
    res.nmeaningful = meaningful.length;
  }
  rows.push(res);
}
fs.writeFileSync(`${S}/push-replay.json`, JSON.stringify(rows, null, 1));
console.log("pushes", rows.length);

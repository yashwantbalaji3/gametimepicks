// Refines push-replay.json: for each COMPLETED push with build-input changes, a leaf-level JSON diff.
// CLOCK_ONLY = every changed leaf in every changed build-input JSON is an ISO-8601 datetime string (either side),
// and every ADDED build-input JSON equals (clock leaves ignored) the newest sibling at the push base with the same
// name shape (digit runs ≥8 → #). Anything else (non-JSON, deletion, unparseable, one changed number) = MEANINGFUL.
// This is an UPPER BOUND on what a stamp gate could suppress: it does not know which clocks a reader renders.
import fs from "node:fs"; import { execFileSync } from "node:child_process";
const [REPO, S] = process.argv.slice(2);
const git = (a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", maxBuffer: 2 ** 31 - 1 });
const P = JSON.parse(fs.readFileSync(`${S}/predicate.json`, "utf8"));
const globRe = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "\u0001").replace(/\*\*/g, "\u0002").replace(/\*/g, "[^/]*").replace(/\u0001/g, "(?:.*/)?").replace(/\u0002/g, ".*") + "$");
const under = (f, p) => (p.endsWith("/") ? f.startsWith(p) : f === p || f.startsWith(p + "/"));
const G = P.globs.map(globRe);
const isInput = (f) => P.inputs.some((p) => under(f, p)) && !P.nonInputs.some((p) => under(f, p)) && !G.some((r) => r.test(f));
function blobs(specs) { const out = new Map(); if (!specs.length) return out;
  const buf = execFileSync("git", ["-C", REPO, "cat-file", "--batch"], { input: specs.join("\n") + "\n", maxBuffer: 2 ** 31 - 1 }); let i = 0;
  for (const s of specs) { const nl = buf.indexOf(10, i); const h = buf.toString("utf8", i, nl); i = nl + 1; if (h.endsWith("missing")) { out.set(s, null); continue; } const n = Number(h.split(" ")[2]); out.set(s, buf.toString("utf8", i, i + n)); i += n + 1; } return out; }
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
function flat(v, p, m) { if (Array.isArray(v)) { if (!v.length) m.set(p, "[]"); v.forEach((x, i) => flat(x, p + "[" + i + "]", m)); } else if (v && typeof v === "object") { const ks = Object.keys(v); if (!ks.length) m.set(p, "{}"); for (const k of ks) flat(v[k], p + "." + k, m); } else m.set(p, v); return m; }
const norm = (p) => p.replace(/\[\d+\]/g, "[]");
function leafDiff(a, b) { // returns {clockOnly, nonClock:[normPath]}
  let A, B; try { A = flat(JSON.parse(a), "", new Map()); B = flat(JSON.parse(b), "", new Map()); } catch { return { clockOnly: false, nonClock: ["<unparseable>"] }; }
  const non = new Set(); let any = false;
  for (const [k, v] of A) { const w = B.get(k); if (w === v) continue; any = true; const clk = (typeof v === "string" && ISO.test(v)) || (typeof w === "string" && ISO.test(w)); if (!clk || (B.has(k) !== A.has(k) && false)) non.add(norm(k)); }
  for (const [k, w] of B) { if (A.has(k)) continue; any = true; if (!(typeof w === "string" && ISO.test(w))) non.add(norm(k)); }
  return { clockOnly: non.size === 0, nonClock: [...non], any };
}
const shape = (f) => f.replace(/\d{8,}/g, "#");
const R = JSON.parse(fs.readFileSync(`${S}/push-replay.json`, "utf8"));
let n = 0;
for (const r of R) {
  if (r.cls === "NO_INPUT") { r.rcls = "NO_INPUT"; continue; }
  const files = git(["diff", "--no-renames", "--name-status", r.prev, r.sha]).trim().split("\n").filter(Boolean).map((l) => l.split("\t")).filter(([, f]) => isInput(f));
  const specs = []; const sib = new Map();
  for (const [st, f] of files) {
    if (st === "M") specs.push(`${r.prev}:${f}`, `${r.sha}:${f}`);
    if (st === "A" && f.endsWith(".json")) { specs.push(`${r.sha}:${f}`); const dir = f.slice(0, f.lastIndexOf("/") + 1);
      const ls = git(["ls-tree", "--name-only", r.prev, dir]).trim().split("\n").filter((x) => x && shape(x) === shape(f)).sort();
      if (ls.length) { sib.set(f, ls.at(-1)); specs.push(`${r.prev}:${ls.at(-1)}`); } }
  }
  const B = blobs(specs); const non = {}; let clock = true; const why = [];
  for (const [st, f] of files) {
    let d;
    if (st === "M" && f.endsWith(".json")) d = leafDiff(B.get(`${r.prev}:${f}`), B.get(`${r.sha}:${f}`));
    else if (st === "A" && sib.has(f)) d = leafDiff(B.get(`${r.prev}:${sib.get(f)}`), B.get(`${r.sha}:${f}`));
    else d = { clockOnly: false, nonClock: ["<" + st + (f.endsWith(".json") ? " new-no-sibling" : " non-json") + ">"] };
    if (!d.clockOnly) { clock = false; const dk = f.replace(/\d{4}-\d{2}-\d{2}/g, "<d>").replace(/\d{6,}/g, "#"); (non[dk] ??= new Set()); d.nonClock.slice(0, 12).forEach((p) => non[dk].add(p)); }
  }
  r.rcls = clock ? "CLOCK_ONLY" : "MEANINGFUL"; r.nonClock = Object.fromEntries(Object.entries(non).map(([k, v]) => [k, [...v].slice(0, 12)]));
  if (++n % 50 === 0) console.error(n);
}
fs.writeFileSync(`${S}/push-refined.json`, JSON.stringify(R));

// Per writer: how many of its commits (since 10-09) touched ANY build input under main's predicate, and which top dirs it writes.
import fs from "node:fs"; import { execFileSync } from "node:child_process";
const [REPO, S] = process.argv.slice(2);
const P = JSON.parse(fs.readFileSync(`${S}/predicate.json`, "utf8"));
const globRe = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "\u0001").replace(/\*\*/g, "\u0002").replace(/\*/g, "[^/]*").replace(/\u0001/g, "(?:.*/)?").replace(/\u0002/g, ".*") + "$");
const under = (f, p) => (p.endsWith("/") ? f.startsWith(p) : f === p || f.startsWith(p + "/")); const G = P.globs.map(globRe);
const isInput = (f) => P.inputs.some((p) => under(f, p)) && !P.nonInputs.some((p) => under(f, p)) && !G.some((r) => r.test(f));
const W = { "nfl sim v2 shadow": /nfl sim v2 shadow/, "mlb pregame archive metadata": /mlb pregame archive metadata/, "nba pre-tip window": /nba pre-tip/, "cron-slot coverage": /cron-slot coverage/, "auto-refresh (ops)": /^auto-refresh/, "soccer DC v2 shadow": /Dixon-Coles/, "nba internal research": /nba (roster capture|experimental)/, "injuries facts": /injuries facts/ };
const out = execFileSync("git", ["-C", REPO, "log", "origin/main", "--first-parent", "--since=2026-10-09T00:00Z", "--name-only", "--format=@@%H\t%s"], { encoding: "utf8", maxBuffer: 1 << 30 });
const st = {}; let cur = null;
for (const l of out.split("\n")) { if (l.startsWith("@@")) { const s = l.split("\t")[1]; const w = Object.keys(W).find((k) => W[k].test(s)); cur = w ? (st[w] ??= { commits: 0, withInput: 0, dirs: {} , _c: null}) : null; if (cur) { cur.commits++; cur._c = { input: false }; } continue; }
  if (!cur || !l) continue; if (isInput(l) && !cur._c.input) { cur._c.input = true; cur.withInput++; } const d = l.split("/").slice(0, 4).join("/"); cur.dirs[d] = (cur.dirs[d] ?? 0) + 1; }
for (const [k, v] of Object.entries(st)) console.log(k.padEnd(30), "commits", v.commits, "touching build inputs", v.withInput, "| top dirs:", Object.entries(v.dirs).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]).join(", "));

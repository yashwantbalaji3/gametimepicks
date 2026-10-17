// Would #1088's publication-SLO clause turn Ignored pushes into builds? For each ignored push head H, compare the
// public SLO fields at H vs at the last COMPLETED deployment before H (Vercel's base).
import fs from "node:fs"; import { execFileSync } from "node:child_process";
const [REPO, S] = process.argv.slice(2);
const show = (sha) => { try { return JSON.parse(execFileSync("git", ["-C", REPO, "show", `${sha}:app/public/data/ops/publication-slo.json`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); } catch { return null; } };
const F = ["date", "state", "platformState", "publishDeadlineUtc", "reason"]; const key = (d) => d && JSON.stringify(F.map((k) => d[k] ?? null));
const FP = new Map(fs.readFileSync(`${S}/fp-order.tsv`, "utf8").trim().split("\n").map((l) => { const [h, n] = l.split("\t"); return [h, +n]; }));
const vs = new Map(); for (const f of ["vstat.tsv", "vstat-new.tsv"]) for (const l of fs.readFileSync(`${S}/${f}`, "utf8").trim().split("\n")) { const [s, a, b, st, d] = l.split("\t"); vs.set(s, { a, b, d }); }
const done = [...vs].filter(([s, v]) => /completed/.test(v.d) && FP.has(s)).map(([s, v]) => [s, Date.parse(v.b)]).sort((x, y) => x[1] - y[1]);
let n = 0, wouldBuild = 0;
for (const l of fs.readFileSync(`${S}/vstat-nodep.tsv`, "utf8").trim().split("\n")) { const [h, a, , , d] = l.split("\t"); if (!/Ignored/.test(d ?? "") || a < "2026-10-09") continue; n++;
  const base = done.filter(([, t]) => t <= Date.parse(a)).at(-1)?.[0]; if (!base) continue;
  if (key(show(base)) !== key(show(h))) wouldBuild++; }
console.log("ignored pushes", n, "where publication-SLO public fields differ from Vercel base (would BUILD under #1088):", wouldBuild);

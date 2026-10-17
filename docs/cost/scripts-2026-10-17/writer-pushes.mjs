// Per-writer push accounting over the same window/data as COST_REDUCTION_PACKAGE (10-09 → 10-17 01:10Z).
// Every push head with a Vercel status (deployment or Ignored Build Step), ordered on main's first-parent history.
import fs from "node:fs"; import { execFileSync } from "node:child_process";
const [REPO, S, OUT] = process.argv.slice(2);
const git = (a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", maxBuffer: 1 << 30 });
const FP = new Map(fs.readFileSync(`${S}/fp-order.tsv`, "utf8").trim().split("\n").map((l) => { const [h, n] = l.split("\t"); return [h, +n]; }));
const vst = new Map();
for (const f of ["vstat.tsv", "vstat-new.tsv", "vstat-nodep.tsv"]) for (const l of fs.readFileSync(`${S}/${f}`, "utf8").trim().split("\n")) { const [sha, a, b, st, d] = l.split("\t"); if (d) vst.set(sha, { a, b, st, d }); }
const R = new Map(JSON.parse(fs.readFileSync(`${S}/push-refined.json`, "utf8")).map((r) => [r.sha, r]));
const heads = new Set();
for (const l of fs.readFileSync(`${S}/deps-all.tsv`, "utf8").trim().split("\n")) { const sha = l.split("\t")[2]; if (FP.has(sha)) heads.add(sha); }
for (const [sha, v] of vst) if (FP.has(sha) && v.d) heads.add(sha);
const order = [...heads].sort((x, y) => FP.get(y) - FP.get(x)); // old → new
const outcome = (sha) => { const v = vst.get(sha); if (!v) return "unknown"; if (/completed/.test(v.d)) return "completed"; if (/Ignored/.test(v.d)) return "ignored"; if (/[Cc]ancel/.test(v.d)) return "canceled"; if (/failed/.test(v.d)) return "failed"; return v.st; };
const W = { sim: /nfl sim v2 shadow/, archive: /mlb pregame archive metadata/, nbapretip: /nba pre-tip/, cronslot: /cron-slot coverage/, autorefresh: /^auto-refresh/, dcshadow: /Dixon-Coles/ };
const wOf = (s) => Object.keys(W).find((k) => W[k].test(s)) ?? "other";
const pushes = [];
for (let i = 1; i < order.length; i++) {
  const sha = order[i], prev = order[i - 1]; const v = vst.get(sha);
  if (!v || v.a < "2026-10-09T00:08") continue;
  if (v.a > "2026-10-17T01:11") continue;
  const commits = git(["log", "--first-parent", "--format=%H\t%cI\t%s", `${prev}..${sha}`]).trim().split("\n").filter(Boolean).map((l) => { const [h, t, s] = l.split("\t"); return { h, t, s, w: wOf(s) }; });
  const ws = [...new Set(commits.map((c) => c.w))];
  const r = R.get(sha);
  pushes.push({ sha, prev, t: v.a, outcome: outcome(sha), prevOutcome: outcome(prev), cls: r?.rcls ?? null, ws, n: commits.length, commits });
}
const days = (Date.parse(pushes.at(-1).t) - Date.parse(pushes[0].t)) / 864e5;
const res = { window: [pushes[0].t, pushes.at(-1).t], days: +days.toFixed(2), totals: {}, writers: {} };
const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});
res.totals = cnt(pushes, (p) => p.outcome);
for (const w of Object.keys(W)) {
  const commits = pushes.flatMap((p) => p.commits.filter((c) => c.w === w));
  const solo = pushes.filter((p) => p.ws.length === 1 && p.ws[0] === w);
  const mixed = pushes.filter((p) => p.ws.includes(w) && p.ws.length > 1);
  const soloOut = cnt(solo, (p) => p.outcome === "completed" ? `completed:${p.cls}:prev-${p.prevOutcome}` : p.outcome);
  res.writers[w] = { commits: commits.length, commitsPerDay: +(commits.length / days).toFixed(2), soloPushes: solo.length, soloOutcomes: soloOut, mixedPushes: mixed.length, mixedOutcomes: cnt(mixed, (p) => p.outcome),
    soloShas: solo.map((p) => [p.sha.slice(0, 10), p.t, p.outcome, p.cls, p.prevOutcome]) };
}
// all-six batched together: pushes whose commits are ALL from the six
const six = pushes.filter((p) => p.ws.every((w) => w !== "other"));
res.allSixSolo = cnt(six, (p) => p.outcome === "completed" ? `completed:${p.cls}:prev-${p.prevOutcome}` : p.outcome);
fs.writeFileSync(OUT, JSON.stringify({ res, pushes }, null, 1));
const { soloShas, ...x } = {}; for (const [k, v] of Object.entries(res.writers)) { const { soloShas, ...rest } = v; console.log(k, JSON.stringify(rest)); }
console.log("window", res.window, "days", res.days, "totals", res.totals); console.log("allSixSolo", res.allSixSolo);

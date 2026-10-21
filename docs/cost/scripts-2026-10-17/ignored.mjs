import fs from "node:fs"; import { execFileSync } from "node:child_process";
const [REPO, S] = process.argv.slice(2);
const git = (a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8" });
const FP = new Map(fs.readFileSync(`${S}/fp-order.tsv`, "utf8").trim().split("\n").map((l) => { const [h, n] = l.split("\t"); return [h, +n]; }));
const heads = new Map();
for (const l of fs.readFileSync(`${S}/deps-all.tsv`, "utf8").trim().split("\n")) { const [, t, sha] = l.split("\t"); if (FP.has(sha)) heads.set(sha, { kind: "deployment", t }); }
for (const l of fs.readFileSync(`${S}/vstat-nodep.tsv`, "utf8").trim().split("\n")) { const [sha, a, b, st, d] = l.split("\t"); if (d) heads.set(sha, { kind: /Ignored/.test(d) ? "ignored" : "other:" + d.slice(0, 20), t: a, b }); }
const order = [...heads.keys()].sort((x, y) => FP.get(y) - FP.get(x));
const BUCKETS = [["nfl sim v2 shadow", /nfl sim v2 shadow/], ["mlb pregame archive metadata", /mlb pregame archive metadata/], ["nba pre-tip window", /nba pre-tip/], ["auto-refresh (ops)", /^auto-refresh/], ["cron-slot coverage", /cron-slot coverage/], ["soccer DC v2 shadow", /Dixon-Coles/], ["nba internal research", /nba (roster capture|experimental)/], ["injuries facts", /injuries facts/], ["P300 props shadow", /P300/], ["PR merge / human", /^Merge |^(?!auto)/]];
const b = (s) => (BUCKETS.find(([, re]) => re.test(s)) ?? [s.replace(/\d{4}-\d{2}-\d{2}.*/, "").replace(/\(\d+ files\)/, "").trim()])[0];
const cnt = {}; let n = 0; const perDay = {};
for (let i = 1; i < order.length; i++) {
  const h = heads.get(order[i]); if (h.kind !== "ignored" || h.t < "2026-10-09") continue; n++;
  perDay[h.t.slice(0, 10)] = (perDay[h.t.slice(0, 10)] ?? 0) + 1;
  const subs = git(["log", "--first-parent", "--format=%s", `${order[i - 1]}..${order[i]}`]).trim().split("\n");
  const k = [...new Set(subs.map(b))].sort().join(" + "); cnt[k] = (cnt[k] ?? 0) + 1;
}
console.log("ignored pushes", n, perDay); console.log(Object.entries(cnt).sort((a, b) => b[1] - a[1]));
// all pushes (any status) per day
const all = {}; for (const [s, h] of heads) if (h.t >= "2026-10-09") all[h.t.slice(0, 10)] = (all[h.t.slice(0, 10)] ?? 0) + 1; console.log("push heads with a Vercel status per day", all);

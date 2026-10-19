// Read-only: GET commits/{sha}/statuses for every first-parent origin/main commit since 2026-10-12T00Z; keep the Vercel context.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const OUT = new URL(".", import.meta.url).pathname;
const WT = "/Users/yashwantbalaji/Downloads/gametimepicks-wt/cost-1019";
const R = "repos/yashwantbalaji3/gametimepicks";
const HEAD = process.argv[2] || "origin/main";
const shas = execFileSync("git", ["-C", WT, "rev-list", "--first-parent", "--since=2026-10-11T23:00:00Z", HEAD], { encoding: "utf8" }).trim().split("\n");
const cachePath = OUT + "cstatus-cache.json";
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
let n = 0;
for (const sha of shas) {
  if (cache[sha]) continue;
  const arr = JSON.parse(execFileSync("gh", ["api", `${R}/commits/${sha}/statuses?per_page=100`], { encoding: "utf8" }));
  cache[sha] = arr.filter((s) => /vercel/i.test(s.context)).map((s) => ({ ctx: s.context, state: s.state, at: s.created_at, d: s.description }));
  if (++n % 50 === 0) { fs.writeFileSync(cachePath, JSON.stringify(cache)); console.error(n); }
}
fs.writeFileSync(cachePath, JSON.stringify(cache));
console.error("commits", shas.length, "fetched", n);

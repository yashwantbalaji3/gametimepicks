// Read-only: GET Production deployments since 2026-10-11T20Z and each one's statuses.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const OUT = new URL(".", import.meta.url).pathname;
const R = "repos/yashwantbalaji3/gametimepicks";
const gh = (p) => JSON.parse(execFileSync("gh", ["api", p], { encoding: "utf8", maxBuffer: 64 << 20 }));
const CUT = "2026-10-11T20:00:00Z";
let deps = [];
for (let page = 1; page < 20; page++) {
  const arr = gh(`${R}/deployments?environment=Production&per_page=100&page=${page}`);
  deps.push(...arr);
  const last = arr.at(-1)?.created_at ?? "";
  console.error(page, arr.length, last);
  if (arr.length < 100 || last < CUT) break;
}
deps = deps.filter((d) => d.created_at >= CUT);
const cachePath = OUT + "statuses-cache.json";
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
let n = 0;
for (const d of deps) {
  if (!cache[d.id]) { cache[d.id] = gh(`${R}/deployments/${d.id}/statuses?per_page=100`); n++; }
  if (n % 100 === 0) fs.writeFileSync(cachePath, JSON.stringify(cache));
}
fs.writeFileSync(cachePath, JSON.stringify(cache));
const rows = deps.map((d) => ({
  id: d.id, sha: d.sha, ref: d.ref, creator: d.creator?.login, created_at: d.created_at, updated_at: d.updated_at,
  statuses: (cache[d.id] || []).map((s) => ({ state: s.state, created_at: s.created_at, updated_at: s.updated_at, description: s.description })),
}));
fs.writeFileSync(OUT + "deployments.json", JSON.stringify(rows, null, 1));
console.error("deployments", rows.length, "new status calls", n);

#!/usr/bin/env node
/**
 * audit-high-hit-rate-leg-filters — settled leg-level reliability by feature
 * bucket (market / confidence / side / edge band). Read-only research signal
 * from app/public/data/mlb/results/settled_leans.jsonl. Leakage-free (settled
 * outcomes only). Prints Wilson lower bounds so small samples are not trusted.
 *
 * Usage: node app/scripts/audit-high-hit-rate-leg-filters.mjs [--since YYYY-MM-DD]
 */
import { readFileSync } from "node:fs";
const since = (() => { const i = process.argv.indexOf("--since"); return i > 0 ? process.argv[i + 1] : null; })();
const path = new URL("../public/data/mlb/results/settled_leans.jsonl", import.meta.url);
const rows = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l))
  .filter((r) => !since || (r.date || "") >= since);
const wl = (rs) => { const w = rs.filter((r) => r.outcome === "Win").length, l = rs.filter((r) => r.outcome === "Loss").length; return { w, l, n: w + l, hr: w + l ? w / (w + l) : null }; };
const wilsonLo = (w, n, z = 1.96) => { if (!n) return 0; const p = w / n; return (p + z * z / (2 * n) - z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / (1 + z * z / n); };
function group(keyFn, title) {
  const m = new Map();
  for (const r of rows) { const k = keyFn(r); if (k == null) continue; (m.get(k) || m.set(k, []).get(k)).push(r); }
  console.log(`\n=== ${title} (n=${rows.length}${since ? `, since ${since}` : ""}) ===`);
  for (const [k, rs] of [...m.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const { w, l, n, hr } = wl(rs);
    if (!n) continue;
    console.log(`  ${String(k).padEnd(26)} ${String(w).padStart(4)}W-${String(l).padStart(4)}L  ${(hr * 100).toFixed(1).padStart(5)}%  wilsonLo ${(wilsonLo(w, n) * 100).toFixed(1)}%  (n=${n})`);
  }
}
const edgeBand = (e) => e == null ? "?" : e < 0 ? "edge <0" : e < 5 ? "edge 0-5" : e < 10 ? "edge 5-10" : e < 20 ? "edge 10-20" : "edge 20+";
group((r) => r.marketKey, "By MARKET");
group((r) => r.confidence, "By CONFIDENCE label");
group((r) => r.lean, "By SIDE");
group((r) => edgeBand(r.edgePct), "By EDGE band");
console.log("\nInterpretation: publish-eligible = wilsonLo >= 0.50; quarantine = wilsonLo < 0.41; high edge is overprojection (lower hit). Not a profit claim.");

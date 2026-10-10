#!/usr/bin/env node
/**
 * READ-ONLY capture of the canonical project's Production deployments in a window — the PUBLICATION EVIDENCE for
 * TRUTH-001's forecast recovery and the founder's forecast-of-record policy (Option B, 2026-10-09): a forecast
 * was publicly available when a Production deployment that served it was READY, not when it was committed.
 *
 * GET /v6/deployments only (same API, team and project as scripts/vercel-cost-report.mjs). Writes one immutable
 * evidence file under data/internal/ops/ (NOT a Vercel build input — app/scripts/vercel-ignore-build.sh), and
 * refuses to overwrite an existing capture: a later capture is a new file.
 *
 *   node scripts/capture-vercel-production-deployments.mjs --cli-auth --since 2026-09-01 --until 2026-10-09
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.vercel.com";
const TEAM = "team_Apd3fTXpVls1DK5CwAt0Uzd5";
const PROJECT = "prj_qaHS65v4G30tTy1s6MYbsLbKYvbh"; // gametime-picks (canonical; docs/VERCEL_CANONICAL_PROJECT.md)

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const since = Date.parse(`${opt("--since")}T00:00:00Z`);
const until = Date.parse(`${opt("--until")}T00:00:00Z`);
if (!Number.isFinite(since) || !Number.isFinite(until) || until <= since) {
  console.error("usage: --since YYYY-MM-DD --until YYYY-MM-DD [--cli-auth]");
  process.exit(2);
}

function token() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  if (argv.includes("--cli-auth")) {
    for (const p of [path.join(os.homedir(), "Library/Application Support/com.vercel.cli/auth.json"), path.join(os.homedir(), ".local/share/com.vercel.cli/auth.json")]) {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")).token;
    }
  }
  console.error("Set VERCEL_TOKEN, or pass --cli-auth after `npx vercel login`.");
  process.exit(1);
}
const TOKEN = token();

async function get(p, attempt = 0) {
  const res = await fetch(`${API}${p}&teamId=${TEAM}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    return get(p, attempt + 1);
  }
  if (!res.ok) throw new Error(`GET ${p} → ${res.status}`);
  return res.json();
}

const out = path.join(ROOT, "data/internal/ops/vercel-production-deployments", `${opt("--since")}_${opt("--until")}.json`);
if (fs.existsSync(out)) {
  console.error(`refusing to overwrite ${path.relative(ROOT, out)} — evidence captures are immutable; use a new window`);
  process.exit(3);
}

const rows = [];
for (let cursor = until; ; ) {
  const page = await get(`/v6/deployments?projectId=${PROJECT}&target=production&limit=100&until=${cursor}`);
  for (const d of page.deployments ?? []) {
    if (d.created < since || d.created >= until) continue;
    rows.push({
      uid: d.uid,
      state: d.state ?? d.readyState ?? null,
      created: new Date(d.created).toISOString(),
      ready: Number.isFinite(d.ready) ? new Date(d.ready).toISOString() : null,
      commitSha: d.meta?.githubCommitSha ?? null,
      commitRef: d.meta?.githubCommitRef ?? null,
      source: d.source ?? null,
    });
  }
  const last = page.deployments?.at(-1);
  if (!last || last.created < since || !page.pagination?.next) break;
  cursor = page.pagination.next;
}
rows.sort((a, b) => a.created.localeCompare(b.created));

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({
  schema: "gtp.ops.vercel-production-deployments@1",
  capturedAt: new Date().toISOString(),
  project: PROJECT,
  window: { since: opt("--since"), until: opt("--until") },
  method: "GET /v6/deployments?target=production (read-only); ready = when the deployment became READY and could serve",
  count: rows.length,
  deployments: rows,
}, null, 1) + "\n");
console.log(`wrote ${path.relative(ROOT, out)} — ${rows.length} production deployments (${rows.filter((r) => r.state === "READY").length} READY)`);

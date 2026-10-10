#!/usr/bin/env node
/**
 * PUBLICATION EVIDENCE · capture the Production deployment record from GitHub (TRUTH-001, founder decision 4).
 *
 *   node scripts/ops/capture-github-production-deployments.mjs --since 2026-09-01T00:00:00Z [--write]
 *
 * Vercel's GitHub integration records every Production deployment as a GitHub Deployment (creator vercel[bot],
 * environment "Production") with statuses. A `success` status means the deployment completed and serves. Validated
 * against the Vercel API capture in #1042 on 60 sampled deployments: the GitHub success status is 0.01–4.6 s AFTER
 * Vercel's READY time, never before, so it is a conservative READY time. It needs no Vercel credentials: the read
 * uses the repository's own GitHub token (`gh`, which uses GH_TOKEN / GITHUB_TOKEN in Actions).
 *
 * Output: data/internal/ops/production-deployments/github-<since>_<capturedAt>.json — internal, not a build input.
 * `window` is the interval this record is complete for: [since, capturedAt]. Nothing here is a timestamp we made up:
 * every readyAt is GitHub's own status time; a deployment that never reached success is recorded with its last state
 * and no readyAt.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const SINCE = arg("--since");
const WRITE = process.argv.includes("--write");
const REPO = arg("--repo") ?? execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], { cwd: ROOT }).toString().trim();
if (!SINCE || !Number.isFinite(Date.parse(SINCE))) { console.error("REFUSED: --since <ISO> required"); process.exit(2); }
const [owner, name] = REPO.split("/");

const QUERY = `query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){deployments(environments:["Production"],first:100,after:$after,orderBy:{field:CREATED_AT,direction:DESC}){pageInfo{hasNextPage endCursor}nodes{databaseId commitOid createdAt creator{login} state statuses(first:20){nodes{state createdAt environmentUrl}}}}}}`;
const page = (after) => JSON.parse(execFileSync("gh", ["api", "graphql", "-f", `query=${QUERY}`, "-F", `owner=${owner}`, "-F", `name=${name}`, ...(after ? ["-F", `after=${after}`] : [])], { cwd: ROOT, maxBuffer: 1 << 26 }).toString());

const capturedAt = new Date().toISOString();
const deployments = [];
let after = null;
for (;;) {
  const conn = page(after).data.repository.deployments;
  let older = false;
  for (const n of conn.nodes) {
    if (Date.parse(n.createdAt) < Date.parse(SINCE)) { older = true; continue; }
    const statuses = (n.statuses?.nodes ?? []).slice().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const success = statuses.find((s) => s.state === "SUCCESS") ?? null;
    deployments.push({
      id: `gh-${n.databaseId}`,
      sha: n.commitOid,
      creator: n.creator?.login ?? null,
      createdAt: n.createdAt,
      state: success ? "READY" : (statuses[statuses.length - 1]?.state ?? n.state ?? "UNKNOWN"),
      readyAt: success?.createdAt ?? null,
      url: success?.environmentUrl ?? null,
      statuses: statuses.map((s) => ({ state: s.state, at: s.createdAt })),
    });
  }
  if (older || !conn.pageInfo.hasNextPage) break;
  after = conn.pageInfo.endCursor;
}
deployments.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

const doc = {
  schema: "gtp.ops.production-deployments@1",
  source: "github-deployments",
  repo: REPO,
  environment: "Production",
  capturedAt,
  window: { from: new Date(Date.parse(SINCE)).toISOString(), to: capturedAt },
  method: "GitHub GraphQL repository.deployments(environments: [Production]); readyAt = first SUCCESS status (validated as 0–5 s after Vercel READY)",
  count: deployments.length,
  ready: deployments.filter((d) => d.state === "READY").length,
  deployments,
};
console.log(`[deployments] ${doc.count} Production deployments since ${doc.window.from} · ${doc.ready} reached READY`);
if (WRITE) {
  const dir = path.join(ROOT, "data/internal/ops/production-deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `github-${doc.window.from.slice(0, 10)}_${capturedAt.slice(0, 19).replace(/:/g, "-")}Z.json`);
  fs.writeFileSync(file, JSON.stringify(doc, null, 1) + "\n");
  console.log(`✓ wrote ${path.relative(ROOT, file)}`);
}

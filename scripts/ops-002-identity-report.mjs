#!/usr/bin/env node
/**
 * OPS-002 — bot commit identity / blocked-deployment report (READ-ONLY).
 *
 * Answers, from Vercel's own deployment records:
 *   - which GitHub account Vercel attributed each Production deployment to (`attribution.gitUser`),
 *     split by outcome (READY / BLOCKED / CANCELED / ERROR) and by repo visibility at push time;
 *   - every BLOCKED deployment and its `seatBlock.blockCode` (TEAM_ACCESS_REQUIRED is the OPS-002 defect);
 *   - automated data commits (`auto…` subjects) NOT authored as github-actions[bot] after the cutover;
 *   - Production freshness: the commit the live site was built from vs the newest commit on `main`.
 *
 * It never writes to Vercel or GitHub and creates no deployment. Endpoints: GET /v6/deployments;
 * GET <production>/data/build-info.json; `git ls-remote` for origin/main.
 *
 * Usage:
 *   node scripts/ops-002-identity-report.mjs --cli-auth [--days 7] [--since <ISO>] [--cutover <ISO>] [--json]
 *
 * The verdict (scripts/ops-002-acceptance.mjs) never passes on absence of evidence:
 *   exit 0 PASS     ≥ 7 days since --cutover, a READY github-actions[bot] data deployment in every 24 h,
 *                   no block or foreign identity, Production freshness positively verified;
 *   exit 2 FAIL     TEAM_ACCESS_REQUIRED, or a post-cutover data commit under another identity;
 *   exit 3 NOT_YET  no cutover / window incomplete / a day with no bot deployment to judge;
 *   exit 4 STALE    live build-info is not the newest READY build, main head undeployed, or a build stuck.
 * Run it daily through the OPS-002 window (docs/OPS_002_BOT_COMMIT_IDENTITY.md §6). --since defaults to
 * --cutover when given.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { acceptanceVerdict, normalize, BOT_LOGIN, BOT_EMAIL } from "./ops-002-acceptance.mjs";

const TEAM = "team_Apd3fTXpVls1DK5CwAt0Uzd5";
const PROJECT = "prj_qaHS65v4G30tTy1s6MYbsLbKYvbh"; // gametime-picks (canonical)
const PROD = "https://gametime-picks.vercel.app";
const API = "https://api.vercel.com";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
};
const cutover = opt("--cutover", null) ? Date.parse(opt("--cutover")) : null;
const since = opt("--since", null)
  ? Date.parse(opt("--since"))
  : cutover ?? Date.now() - Number(opt("--days", "7")) * 86_400_000;
if (cutover !== null && since > cutover) {
  console.error("--since must not be later than --cutover (the window must contain every post-cutover deployment)");
  process.exit(1);
}

function token() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  if (flag("--cli-auth")) {
    for (const p of [
      path.join(os.homedir(), "Library/Application Support/com.vercel.cli/auth.json"),
      path.join(os.homedir(), ".local/share/com.vercel.cli/auth.json"),
    ]) {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")).token;
    }
  }
  console.error("Set VERCEL_TOKEN, or pass --cli-auth after `npx vercel login`.");
  process.exit(1);
}
const TOKEN = token();

async function get(p, attempt = 0) {
  const res = await fetch(`${API}${p}${p.includes("?") ? "&" : "?"}teamId=${TEAM}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (res.status === 429 && attempt < 5) {
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    return get(p, attempt + 1);
  }
  if (!res.ok) throw new Error(`GET ${p} → ${res.status}`);
  return res.json();
}

const deps = [];
for (let until = null; ; ) {
  const page = await get(`/v6/deployments?projectId=${PROJECT}&target=production&limit=100${until ? `&until=${until}` : ""}`);
  deps.push(...page.deployments.filter((d) => d.created >= since));
  const last = page.deployments.at(-1);
  if (!last || last.created < since || !page.pagination?.next) break;
  until = page.pagination.next;
}
deps.sort((a, b) => a.created - b.created);

const iso = (t) => new Date(t).toISOString().replace(/\.\d+Z$/, "Z");
const who = (d) => `${d.attribution?.gitUser?.login ?? "(unresolved)"}/${d.attribution?.gitUser?.type ?? "-"}`;
const isData = (d) => /^auto[:\- ]/.test(d.meta?.githubCommitMessage ?? "");

const byWho = {};
for (const d of deps) {
  const k = `${who(d)} | ${d.meta?.githubRepoVisibility ?? "?"}`;
  byWho[k] ??= {};
  byWho[k][d.readyState] = (byWho[k][d.readyState] ?? 0) + 1;
}
const blocked = deps.filter((d) => d.readyState === "BLOCKED");
const teamAccess = blocked.filter((d) => d.seatBlock?.blockCode === "TEAM_ACCESS_REQUIRED");
const postCutoverData = cutover === null ? [] : deps.filter((d) => d.created >= cutover && isData(d));
const wrongIdentity = postCutoverData.filter(
  (d) => d.attribution?.gitUser?.login !== BOT_LOGIN || d.meta?.githubCommitAuthorEmail !== BOT_EMAIL,
);

let buildInfo = null;
try {
  buildInfo = await (await fetch(`${PROD}/data/build-info.json`, { cache: "no-store" })).json();
} catch {}
let mainSha = null;
try {
  mainSha = execFileSync("git", ["ls-remote", "origin", "refs/heads/main"], { encoding: "utf8" }).split(/\s/)[0];
} catch {}
const lastReady = deps.filter((d) => d.readyState === "READY").at(-1);

const acceptance = acceptanceVerdict({
  deployments: deps.map(normalize),
  cutover,
  now: Date.now(),
  buildInfoSha: buildInfo?.commit?.sha ?? null,
  mainSha,
  requiredDays: Number(opt("--required-days", "7")),
  maxLagMin: Number(opt("--max-lag-min", "30")),
});

const report = {
  acceptance,
  window: { since: iso(since), until: iso(Date.now()), cutover: cutover && iso(cutover) },
  productionDeployments: deps.length,
  attribution: byWho,
  blocked: blocked.map((d) => ({
    created: iso(d.created),
    uid: d.uid,
    blockCode: d.seatBlock?.blockCode ?? null,
    gitUser: who(d),
    visibility: d.meta?.githubRepoVisibility,
    sha: d.meta?.githubCommitSha?.slice(0, 10),
    message: d.meta?.githubCommitMessage?.slice(0, 70),
  })),
  postCutover: cutover === null ? null : {
    dataDeployments: postCutoverData.length,
    asGithubActionsBot: postCutoverData.length - wrongIdentity.length,
    otherIdentity: wrongIdentity.map((d) => `${iso(d.created)} ${who(d)} <${d.meta?.githubCommitAuthorEmail}> ${d.meta?.githubCommitMessage?.slice(0, 60)}`),
  },
  freshness: {
    originMain: mainSha?.slice(0, 10) ?? null,
    productionBuiltFrom: buildInfo?.commit?.shortSha ?? null,
    productionBuiltAt: buildInfo?.builtAt ?? null,
    productionIsMainHead: Boolean(mainSha && buildInfo?.commit?.sha === mainSha),
    lastReadyDeployment: lastReady ? `${iso(lastReady.ready ?? lastReady.created)} ${lastReady.meta?.githubCommitSha?.slice(0, 10)}` : null,
  },
};

if (flag("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`OPS-002 identity report — production deployments ${report.window.since} → ${report.window.until}: ${deps.length}`);
  console.log("\nAttribution (gitUser | repo visibility) → outcomes");
  for (const [k, v] of Object.entries(byWho).sort()) console.log(`  ${k.padEnd(44)} ${JSON.stringify(v)}`);
  console.log(`\nBLOCKED: ${blocked.length} (TEAM_ACCESS_REQUIRED: ${teamAccess.length})`);
  for (const b of report.blocked) console.log(`  ${b.created} ${b.blockCode} ${b.gitUser} ${b.visibility} ${b.sha} ${b.message}`);
  if (report.postCutover) {
    const p = report.postCutover;
    console.log(`\nSince cutover ${report.window.cutover}: ${p.dataDeployments} data-commit deployments, ${p.asGithubActionsBot} as ${BOT_LOGIN}`);
    for (const x of p.otherIdentity) console.log(`  other identity: ${x}`);
  }
  const f = report.freshness;
  console.log(`\nFreshness: origin/main ${f.originMain} · production built from ${f.productionBuiltFrom} at ${f.productionBuiltAt} · at main head: ${f.productionIsMainHead}`);
  const a = acceptance;
  console.log(`\nACCEPTANCE: ${a.verdict} — observed ${a.evidence.observedDays} d · ${a.evidence.postCutoverReadyAsBot} READY bot data deployments · per day ${JSON.stringify(a.evidence.readyAsBotPerDay)}`);
  for (const [k, list] of Object.entries(a.reasons)) for (const r of list) console.log(`  ${k}: ${r}`);
}

process.exit(acceptance.exit);

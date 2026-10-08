#!/usr/bin/env node
/**
 * COST-001 — Vercel build-cost report (READ-ONLY).
 *
 * Answers, from Vercel's own numbers rather than estimates:
 *   - what the current billing cycle has cost so far, by service (Build CPU Minutes dominates);
 *   - how many deployments ran in the window, split production/preview × built/ignored/manual;
 *   - the CPU-minutes Vercel BILLED for each (deployment `duration.cpuTimeForBilling`, which
 *     reconciled to the invoice within ~4% on 2026-09-25 → 10-06);
 *   - how many production builds overlapped another production build (the waste that the
 *     "one build per branch" queue setting removes);
 *   - a month-end projection from the trailing average.
 *
 * It never writes to Vercel. Endpoints: GET /v2/teams/{id}, GET /v1/billing/charges,
 * GET /v6/deployments, GET /v13/deployments/{id}.
 *
 * Usage:
 *   VERCEL_TOKEN=… node scripts/vercel-cost-report.mjs [--days 7] [--budget 100] [--out report.json]
 *   node scripts/vercel-cost-report.mjs --cli-auth          # reuse the local `vercel login` token
 *
 * --budget N  exits 2 when the projected cycle total exceeds $N (usable as a scheduled alert).
 * --no-per-deploy  skips the per-deployment billing fetch (one API call per deployment).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEAM = "team_Apd3fTXpVls1DK5CwAt0Uzd5";
const PROJECT = "prj_qaHS65v4G30tTy1s6MYbsLbKYvbh"; // gametime-picks (canonical; docs/VERCEL_CANONICAL_PROJECT.md)
const API = "https://api.vercel.com";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const DAYS = Number(opt("--days", "7"));
const BUDGET = opt("--budget", null) === null ? null : Number(opt("--budget"));
const OUT = opt("--out", null);

function token() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  if (flag("--cli-auth")) {
    const candidates = [
      path.join(os.homedir(), "Library/Application Support/com.vercel.cli/auth.json"),
      path.join(os.homedir(), ".local/share/com.vercel.cli/auth.json"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")).token;
    }
  }
  console.error("Set VERCEL_TOKEN, or pass --cli-auth after `npx vercel login`.");
  process.exit(1);
}
const TOKEN = token();

async function get(p, attempt = 0) {
  const url = `${API}${p}${p.includes("?") ? "&" : "?"}teamId=${TEAM}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (res.status === 429 && attempt < 5) {
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    return get(p, attempt + 1);
  }
  if (!res.ok) throw new Error(`GET ${p} → ${res.status}`);
  const text = await res.text();
  return p.startsWith("/v1/billing/charges")
    ? text.split("\n").filter(Boolean).map((l) => JSON.parse(l)) // JSONL (FOCUS rows)
    : JSON.parse(text);
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

const iso = (ms) => new Date(ms).toISOString();
const usd = (x) => `$${x.toFixed(2)}`;

// ── billing cycle ──────────────────────────────────────────────────────────────────────────────
const team = await get(`/v2/teams/${TEAM}`);
const cycleStart = team.billing?.period?.start;
const cycleEnd = team.billing?.period?.end;
const charges = await get(`/v1/billing/charges?from=${iso(cycleStart)}&to=${iso(Math.min(Date.now(), cycleEnd))}`);
const byService = {};
const buildByDay = {};
for (const c of charges) {
  byService[c.ServiceName] = (byService[c.ServiceName] ?? 0) + c.BilledCost;
  if (c.ServiceName === "Build CPU Minutes") {
    const d = c.ChargePeriodStart.slice(0, 10);
    buildByDay[d] ??= { cpuMinutes: 0, cost: 0 };
    buildByDay[d].cpuMinutes += c.ConsumedQuantity;
    buildByDay[d].cost += c.BilledCost;
  }
}
const cycleToDate = Object.values(byService).reduce((a, b) => a + b, 0);
const days = Object.keys(buildByDay).sort();
const trailing = days.slice(-DAYS);
const trailingDaily = trailing.reduce((a, d) => a + buildByDay[d].cost, 0) / Math.max(1, trailing.length);
const daysLeft = Math.max(0, (cycleEnd - Date.now()) / 86_400_000);
const projected = cycleToDate + trailingDaily * daysLeft;

// ── deployments in the window ──────────────────────────────────────────────────────────────────
const since = Date.now() - DAYS * 86_400_000;
const deps = [];
for (let until = null; ; ) {
  const page = await get(`/v6/deployments?projectId=${PROJECT}&limit=100${until ? `&until=${until}` : ""}`);
  deps.push(...page.deployments.filter((d) => d.created >= since));
  const last = page.deployments.at(-1);
  if (!last || last.created < since || !page.pagination?.next) break;
  until = page.pagination.next;
}

const billed = flag("--no-per-deploy")
  ? new Map()
  : new Map(
      await pool(deps, 6, async (d) => {
        const full = await get(`/v13/deployments/${d.uid}`);
        return [d.uid, (full.duration?.cpuTimeForBilling ?? 0) / 60_000];
      }),
    );

function category(d) {
  const target = d.target === "production" ? "production" : "preview";
  if (d.source && d.source !== "git") return `${target} · manual (${d.source})`;
  if (d.state === "CANCELED") return `${target} · ignored/canceled`;
  if (d.state === "READY" || d.state === "ERROR") return `${target} · built`;
  return `${target} · ${String(d.state).toLowerCase()}`;
}
const cats = {};
for (const d of deps) {
  const k = category(d);
  cats[k] ??= { count: 0, cpuMinutes: 0 };
  cats[k].count += 1;
  cats[k].cpuMinutes += billed.get(d.uid) ?? 0;
}

// Production builds that started while another production build was still running.
const prodBuilt = deps
  .filter((d) => d.target === "production" && d.buildingAt && d.ready && (d.state === "READY" || d.state === "ERROR"))
  .sort((a, b) => a.buildingAt - b.buildingAt);
let overlapped = 0;
let runningUntil = 0;
for (const d of prodBuilt) {
  if (d.buildingAt < runningUntil) overlapped += 1;
  runningUntil = Math.max(runningUntil, d.ready);
}

const PRICE = 0.0035; // $ per CPU-minute, every paid build machine (vercel.com/docs/pricing#builds)
const report = {
  generatedAt: iso(Date.now()),
  billingCycle: { start: iso(cycleStart), end: iso(cycleEnd), daysLeft: Number(daysLeft.toFixed(1)) },
  cycleToDate: Number(cycleToDate.toFixed(2)),
  byService: Object.fromEntries(
    Object.entries(byService)
      .filter(([, v]) => v >= 0.005)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, Number(v.toFixed(2))]),
  ),
  trailingDailyBuildCost: Number(trailingDaily.toFixed(2)),
  projectedCycleTotal: Number(projected.toFixed(2)),
  windowDays: DAYS,
  deployments: Object.fromEntries(
    Object.entries(cats)
      .sort((a, b) => b[1].cpuMinutes - a[1].cpuMinutes)
      .map(([k, v]) => [k, { count: v.count, perDay: Number((v.count / DAYS).toFixed(1)), cpuMinutes: Math.round(v.cpuMinutes), estCost: Number((v.cpuMinutes * PRICE).toFixed(2)) }]),
  ),
  productionBuildsOverlapping: { overlapped, of: prodBuilt.length },
  buildByDay,
};

console.log(`Vercel cost report — project gametime-picks — ${report.generatedAt}`);
console.log(`Cycle ${report.billingCycle.start.slice(0, 10)} → ${report.billingCycle.end.slice(0, 10)} (${report.billingCycle.daysLeft} days left)`);
console.log(`Cycle to date ${usd(cycleToDate)} · trailing ${trailing.length}-day build cost ${usd(trailingDaily)}/day · projected ${usd(projected)}`);
for (const [k, v] of Object.entries(report.byService)) console.log(`  ${k.padEnd(28)} ${usd(v)}`);
console.log(`\nDeployments, last ${DAYS} days${flag("--no-per-deploy") ? " (per-deploy billing skipped)" : ""}:`);
for (const [k, v] of Object.entries(report.deployments)) {
  console.log(`  ${k.padEnd(34)} n=${String(v.count).padStart(4)} (${String(v.perDay).padStart(5)}/day)  ${String(v.cpuMinutes).padStart(6)} CPU-min  ~${usd(v.estCost)}`);
}
console.log(`  production builds overlapping another production build: ${overlapped}/${prodBuilt.length}`);
if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

if (BUDGET !== null && projected > BUDGET) {
  console.error(`\n⚠ projected cycle total ${usd(projected)} exceeds budget ${usd(BUDGET)}`);
  process.exit(2);
}

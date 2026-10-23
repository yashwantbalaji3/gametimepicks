#!/usr/bin/env node
/**
 * PRODUCTION PAGE WEIGHT — the bytes Production actually serves, against the same budgets the post-build test uses
 * (lib/uiux/page-weight-budgets.mjs BUDGET_KB / FAMILY_BUDGET_KB). An ADDITION to CI's post-build page-weight test,
 * never a replacement: CI measures the export it built; this measures what the deployment serves, with whatever public
 * flags Production sets (2026-10-23: Production /nba served 253.0 KiB on a 12-game slate with the Theater ON while CI —
 * no GTP_NBA_THEATER_PUBLIC — measured a Theater-OFF export and passed).
 *
 * Read-only over the network (GET only). Touches no files, no money, no data.
 *
 *   node scripts/ops/check-production-page-weight.mjs [--url <origin>] [--json] [--family-cap 20]
 *
 * Sizes are the decoded HTML bytes (fetch decompresses), i.e. the exported file's size, in KiB (/1024) — exactly the
 * unit of page-weight.test.mjs. Family budgets (e.g. nba/simulation, nba/projections) are checked on the family pages the
 * parent page links to (e.g. /nba/simulation/<id>/ from /nba/), capped by --family-cap.
 *
 * NEVER A PASS ON "COULD NOT TELL": a Vercel bot challenge (403 + x-vercel-mitigated: challenge — isBotChallenge, the
 * deployment verifier's own rule) is UNKNOWN; a failed fetch is UNREACHABLE. Exit 0 only when every page is OK; 1 on any
 * OVER (a breach); otherwise 2 when any page is UNKNOWN or UNREACHABLE.
 */
import { fileURLToPath } from "node:url";
import { BUDGET_KB, FAMILY_BUDGET_KB } from "../../src/lib/uiux/page-weight-budgets.mjs";
import { isBotChallenge } from "../../src/lib/deployment-verification.mjs";

const DEFAULT_ORIGIN = "https://gametimepicks.yashwantbalaji.com";
const TIMEOUT_MS = 20_000;
export const OPS_USER_AGENT = "gametimepicks-ops-page-weight (bot@users.noreply.github.com)";

/** "nba/index.html" → "/nba/"; "index.html" → "/". Pure. */
export const urlPathOf = (rel) => (rel === "index.html" ? "/" : `/${rel.replace(/index\.html$/, "")}`);

/** The family's parent page and the hrefs on it that belong to the family ("nba/simulation" → "/nba/" + /nba/simulation/<x>/). Pure. */
export function familyPaths(dir, parentHtml, cap = 20) {
  const esc = dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const seen = new Set();
  for (const m of String(parentHtml ?? "").matchAll(new RegExp(`href="(/${esc}/[^/"#?]+/)"`, "g"))) seen.add(m[1]);
  return [...seen].sort().slice(0, cap);
}

/** 0 only when every page is OK; 1 on any breach; 2 when nothing breached but something could not be measured. Pure. */
export const exitCodeOf = (findings) => (findings.some((f) => f.state === "OVER") ? 1 : findings.every((f) => f.state === "OK") && findings.length ? 0 : 2);

/** One finding per measured page. Pure. */
export function verdict({ path, bytes, budgetKB, error = null, challenged = false }) {
  if (challenged) return { path, budgetKB, bytes: null, kib: null, state: "UNKNOWN", error: "Vercel bot challenge — says nothing about the page" };
  if (error != null || !Number.isFinite(bytes)) return { path, budgetKB, bytes: null, kib: null, state: "UNREACHABLE", error: String(error ?? "no body") };
  const kib = bytes / 1024;
  return { path, budgetKB, bytes, kib: Math.round(kib * 10) / 10, state: kib <= budgetKB ? "OK" : "OVER", error: null };
}

async function get(origin, p) {
  try {
    const r = await fetch(`${origin}${p}`, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "cache-control": "no-cache", "User-Agent": OPS_USER_AGENT } });
    if (isBotChallenge({ status: r.status, headers: Object.fromEntries(r.headers.entries()) })) return { challenged: true };
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const text = await r.text();
    return { text, bytes: Buffer.byteLength(text) };
  } catch (e) {
    return { error: e?.message ?? String(e) };
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const value = (n, f) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : f; };
  const origin = (value("--url", process.env.GTP_SITE_URL || DEFAULT_ORIGIN) || "").replace(/\/+$/, "");
  const cap = Number(value("--family-cap", "20"));
  const findings = [];
  const pages = new Map();
  for (const [rel, kb] of Object.entries(BUDGET_KB)) {
    const p = urlPathOf(rel);
    const r = await get(origin, p);
    pages.set(p, r);
    findings.push(verdict({ path: p, bytes: r.bytes, budgetKB: kb, error: r.error ?? null, challenged: !!r.challenged }));
  }
  for (const [dir, kb] of Object.entries(FAMILY_BUDGET_KB)) {
    // family pages are linked from the family's own index (/nba/projections/ → its dates) or its parent (/nba/ → Theater pages)
    const parents = [`/${dir}/`, `/${dir.split("/").slice(0, -1).join("/")}/`.replace(/\/+/g, "/")];
    let html = "";
    for (const p of parents) html += (pages.get(p) ?? await get(origin, p)).text ?? "";
    for (const p of familyPaths(dir, html, cap)) {
      const r = await get(origin, p);
      findings.push(verdict({ path: p, bytes: r.bytes, budgetKB: kb, error: r.error ?? null, challenged: !!r.challenged }));
    }
  }
  const bad = findings.filter((f) => f.state !== "OK");
  if (argv.includes("--json")) console.log(JSON.stringify({ origin, findings }, null, 1));
  else {
    console.log(`Production page weight · ${origin} · ${findings.length} pages`);
    for (const f of findings) console.log(`${f.state.padEnd(11)} ${f.path.padEnd(44)} ${f.kib == null ? "—" : `${f.kib} KiB`} / ${f.budgetKB} KiB${f.error ? ` (${f.error})` : ""}`);
    console.log(bad.length ? `${bad.length} page(s) OVER, UNKNOWN or UNREACHABLE` : "every page within its budget");
  }
  process.exitCode = exitCodeOf(findings);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();

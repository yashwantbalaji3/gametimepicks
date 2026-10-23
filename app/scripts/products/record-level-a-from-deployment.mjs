#!/usr/bin/env node
/**
 * RECORD WHAT ONE PRODUCTION DEPLOYMENT SHOWS → data/internal/products/level-a/suggestions.jsonl (append-only).
 *
 * Run by .github/workflows/level-a-record.yml on every successful Production deployment_status. It never evaluates
 * "now": it reads the deployment's own served Level A model (/data/level-a/v1/model.json, the same evaluation the
 * pages render at the build's stamped instant) and records it with shownAt = that instant.
 *
 * MISMATCH DETECTION (record vs page). Nothing is written unless all of these hold:
 *   1. /data/build-info.json names the deployment's commit (a superseded or not-yet-aliased deployment is refused);
 *   2. the served model's asOf is that build's builtAt, and its modelSha256 re-hashes exactly;
 *   3. every card and untiered pick about to be recorded is visibly on its page (/build/, /bank-builder/,
 *      /moonshot/): each leg's label and each card's "model joint probability X%" text.
 * A refused run writes nothing and exits non-zero, so the workflow goes red instead of recording a card readers
 * never saw. A bot-challenged response is refused the same way (it proves nothing either way).
 *
 *   npx tsx scripts/products/record-level-a-from-deployment.mjs --sha <deployment sha> [--origin URL] [--write]
 *   Default: dry run (prints what would be appended).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendRecord, recordEntries, recordViolations } from "../../src/lib/products/level-a/record.mjs";
import { LEVEL_A_SERVED_PATH, LEVEL_A_SERVED_SCHEMA, modelSha256 } from "../../src/lib/products/level-a/model.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const LEVEL_A_RECORD_PATH = path.join(APP, "..", "data", "internal", "products", "level-a", "suggestions.jsonl");
export const DEFAULT_ORIGIN = "https://gametimepicks.yashwantbalaji.com";
/** Which page shows which part of the model. */
export const PAGE_FOR = { "parlay-lab": "/build/", "bank-builder": "/bank-builder/", moonshot: "/moonshot/" };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const pct = (p) => `${(p * 100).toFixed(1)}%`;

/** The cards a model shows, with the page each one is on (pure). */
export function shownItems(model) {
  const items = [];
  for (const t of model.parlayLab ?? []) if (t.card) items.push({ page: PAGE_FOR["parlay-lab"], card: t.card });
  if (model.bankBuilder?.card) items.push({ page: PAGE_FOR["bank-builder"], card: model.bankBuilder.card });
  if (model.moonshot?.card) items.push({ page: PAGE_FOR.moonshot, card: model.moonshot.card });
  for (const l of model.untiered ?? []) items.push({ page: PAGE_FOR["parlay-lab"], leg: l });
  return items;
}

/**
 * The checks above, PURE. `served` is the parsed model file, `buildInfo` the parsed build marker, `pages` maps a
 * page path to its HTML. Returns { ok, problems }.
 */
export function verifyServed({ sha, buildInfo, served, pages }) {
  const problems = [];
  if (buildInfo?.commit?.sha !== sha) return { ok: false, commitMismatch: true, servedSha: buildInfo?.commit?.sha ?? null, problems: [`build-info names ${buildInfo?.commit?.sha ?? "no commit"}, not the deployment ${sha}`] };
  if (served?.schema !== LEVEL_A_SERVED_SCHEMA) problems.push(`the served model has schema ${served?.schema ?? "none"}`);
  if (served?.public !== true) problems.push("the served model says Level A is not public on this deployment");
  if (!served?.model || served.asOf !== buildInfo?.builtAt || served.model.asOf !== served.asOf) problems.push(`the served model's asOf ${served?.asOf} is not this build's instant ${buildInfo?.builtAt}`);
  if (served?.model && modelSha256(served.model) !== served.modelSha256) problems.push("the served model does not re-hash to its modelSha256");
  if (problems.length) return { ok: false, problems };
  for (const it of shownItems(served.model)) {
    /* React's server render separates adjacent text nodes with an empty comment; read the text a reader sees. */
    const html = typeof pages[it.page] === "string" ? pages[it.page].replace(/<!-- -->/g, "") : undefined;
    if (typeof html !== "string") { problems.push(`${it.page} was not readable`); continue; }
    const legs = it.card ? it.card.legs : [it.leg];
    for (const l of legs) if (!html.includes(esc(l.selection.label))) problems.push(`${it.page} does not show the leg "${l.selection.label}" (${l.sport}:${l.eventId})`);
    if (it.card && !html.includes(`model joint probability ${pct(it.card.jointProbability)}`)) problems.push(`${it.page} does not show "${it.card.tierLabel} · model joint probability ${pct(it.card.jointProbability)}"`);
  }
  return { ok: problems.length === 0, problems };
}

const CHALLENGE = /x-vercel-challenge|vercel-challenge|Checking your browser/i;
async function get(url) {
  const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}cb=${Date.now()}`, { redirect: "follow", headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  if (res.status !== 200 || res.headers.get("x-vercel-mitigated") || CHALLENGE.test(text.slice(0, 2000))) throw new Error(`${url}: HTTP ${res.status}${res.headers.get("x-vercel-mitigated") ? " (bot challenge)" : ""}`);
  return text;
}

/**
 * The Production domain can lag a just-finished deployment (alias not moved yet) or already serve a newer one.
 * Lagging: wait and re-read. Newer: that deployment's own run records what it shows, so this one is SUPERSEDED and
 * writes nothing. Its cards were shown only between the two builds; see the workflow note.
 */
export async function runFromDeployment({ sha, origin = DEFAULT_ORIGIN, write = false, file = LEVEL_A_RECORD_PATH, now = new Date().toISOString(), fetchText = get, attempts = 1, waitMs = 60_000, isNewer = () => false, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!/^[0-9a-f]{40}$/.test(sha ?? "")) throw new Error("--sha <40-hex deployment sha> required");
  let buildInfo = JSON.parse(await fetchText(`${origin}/data/build-info.json`));
  for (let a = 1; buildInfo?.commit?.sha !== sha; a++) {
    if (buildInfo?.commit?.sha && isNewer(buildInfo.commit.sha, sha)) return { ok: true, superseded: true, servedSha: buildInfo.commit.sha, problems: [], added: 0, wrote: false };
    if (a >= attempts) return { ok: false, problems: [`after ${attempts} reads Production still serves ${buildInfo?.commit?.sha ?? "no commit"}, not the deployment ${sha}`], added: 0, wrote: false };
    await sleep(waitMs);
    buildInfo = JSON.parse(await fetchText(`${origin}/data/build-info.json`));
  }
  const served = JSON.parse(await fetchText(`${origin}${LEVEL_A_SERVED_PATH}`));
  const pages = {};
  for (const p of new Set(Object.values(PAGE_FOR))) pages[p] = await fetchText(`${origin}${p}`);
  const v = verifyServed({ sha, buildInfo, served, pages });
  if (!v.ok) return { ok: false, problems: v.problems, added: 0, wrote: false };
  const beforeText = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const existing = beforeText.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const added = appendRecord(existing, recordEntries(served.model, { recordedAt: now, shownAt: served.asOf, source: { kind: "production-deployment", sha, origin, servedModelSha256: served.modelSha256 } }));
  const afterText = beforeText + added.map((e) => `${JSON.stringify(e)}\n`).join("");
  const violations = recordViolations({ beforeText, afterText });
  if (violations.length) throw new Error(`record guard: ${violations.join("; ")}`);
  if (write && added.length) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (beforeText) fs.appendFileSync(file, afterText.slice(beforeText.length));
    else fs.writeFileSync(file, afterText, { flag: "wx" });
    if (fs.readFileSync(file, "utf8") !== afterText) throw new Error("post-write check failed");
  }
  return { ok: true, problems: [], productDay: served.productDay, shownAt: served.asOf, added: added.length, wrote: write && added.length > 0, entries: added.map((e) => `${e.policy}/${e.tier}${e.revisionOf ? ` (revises ${e.revisionOf})` : ""}`) };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
  const { execFileSync } = await import("node:child_process");
  /* "Newer" = the served commit descends from the deployment's commit on this checkout's history. */
  const isNewer = (served, mine) => { try { execFileSync("git", ["merge-base", "--is-ancestor", mine, served], { stdio: "ignore" }); return served !== mine; } catch { return false; } };
  const out = await runFromDeployment({ sha: arg("--sha"), origin: arg("--origin") ?? DEFAULT_ORIGIN, write: process.argv.includes("--write"), attempts: Number(arg("--attempts") ?? 1), isNewer });
  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
}

#!/usr/bin/env node
/**
 * FREE DATA-FEED HEALTH RUNNER (P258) — fetches each feed (one retry), judges it with
 * src/lib/ops/feed-health.mjs, writes a report. Exit 0 always: a vendor outage is not our failure,
 * and the workflow decides what to surface from `state=`.
 *
 * Usage: node app/scripts/ops/feed-health.mjs [--now <iso>] [--json <out>]
 */
import fs from "node:fs";
import path from "node:path";

import { feedTargets, judgeFeed, summarizeFeeds } from "../../src/lib/ops/feed-health.mjs";
import { NWS_USER_AGENT } from "../../src/lib/sports/weather/nws.mjs";

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const nowIso = arg("now") ?? new Date().toISOString();
const etDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(nowIso));

async function fetchOnce(t) {
  const started = Date.now();
  try {
    const headers = { "User-Agent": t.nws ? NWS_USER_AGENT : "gametimepicks-feed-health (bot@users.noreply.github.com)" };
    const res = await fetch(t.url, { headers, signal: AbortSignal.timeout(20_000) });
    return { status: res.status, body: await res.text(), ms: Date.now() - started };
  } catch (e) {
    return { error: String(e?.message ?? e).slice(0, 120), ms: Date.now() - started };
  }
}

const results = [];
for (const t of feedTargets({ etDate })) {
  let r = judgeFeed(t, await fetchOnce(t));
  if (!r.ok) { await new Promise((ok) => setTimeout(ok, 3000)); r = judgeFeed(t, await fetchOnce(t)); }
  results.push(r);
  console.log(`${r.ok ? "OK  " : "FAIL"} ${t.id.padEnd(24)} ${String(r.ms ?? "-").padStart(6)}ms  ${r.detail}`);
}
const summary = summarizeFeeds(results);
console.log(`FEED_HEALTH state=${summary.state} failed=${summary.failed.join(",") || "none"}`);

const out = arg("json");
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ schemaVersion: "feed-health.v1", checkedAt: nowIso, etDate, summary, feeds: results }, null, 2) + "\n");
}
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `state=${summary.state}\nfailed=${summary.failed.join(",")}\n`);

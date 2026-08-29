#!/usr/bin/env node
/**
 * DAILY-OWNER SLO — did every owner's work actually happen today?
 *
 *   node app/scripts/ops/daily-owner-slo.mjs [--now <iso>] [--date <YYYY-MM-DD ET>] [--offline]
 *
 * The judgement lives in `src/lib/ops/daily-owners.mjs`; this only finds the receipts and the day's
 * schedule. It deliberately asks GitHub nothing: the failure class it exists for is a cron that
 * produced no run object at all, which every run-based check is blind to by construction.
 *
 * Cheap enough to ride every workflow that runs during the day — the same reasoning as
 * publication-slo, and it rides the same composite action.
 *
 * ITS ANSWER IS ONLY AS FRESH AS THE TREE IT READS. A receipt is a committed artifact, so a stale
 * checkout reports an owner as INCIDENT when the work ran and the commit simply has not been pulled.
 * The first local run of this script did exactly that: it opened an incident on the risk ladder
 * thirty seconds before the run that wrote it landed. In CI the checkout is fresh, which is where it
 * matters — but a local run should be reconciled against origin before it is believed, and the
 * artifact records `treeHead` so a reader can tell which tree produced the verdict.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DAILY_OWNERS, evaluateAll, previousDate } from "../../src/lib/ops/daily-owners.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(APP, "public", "data");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(n);

const NOW = arg("--now", new Date().toISOString());
const nowMs = Date.parse(NOW);
if (!Number.isFinite(nowMs)) { console.error("daily-owner-slo: --now must be an ISO instant"); process.exit(2); }

const etDate = (iso) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(iso));
const DATE = arg("--date", etDate(NOW));
const PREV = previousDate(DATE);
const OUT = arg("--json", path.join(DATA, "ops", "daily-owner-slo.json"));

const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")); } catch { return null; } };

/* ── THE DAY'S SCHEDULE ───────────────────────────────────────────────────────────────────────── */

/**
 * MLB's schedule from the free StatsAPI, falling back to the committed artifact, then to unknown.
 *
 * Unknown is never green: an owner whose day we cannot establish is UNKNOWN, because "no games" and
 * "we could not tell" justify opposite conclusions about a missing artifact.
 */
async function mlbDay() {
  if (!has("--offline")) {
    try {
      const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${DATE}`, { signal: AbortSignal.timeout(15_000) });
      if (res.ok) {
        const games = (await res.json())?.dates?.[0]?.games ?? [];
        const starts = games.map((g) => Date.parse(g.gameDate)).filter(Number.isFinite);
        return { count: games.length, earliest: starts.length ? Math.min(...starts) : NaN, source: "mlb-statsapi" };
      }
    } catch { /* fall through — a network blip is not evidence of an empty day */ }
  }
  const art = readJson(`mlb/schedule/${DATE}.json`);
  if (art && Array.isArray(art.games)) {
    const starts = art.games.map((g) => Date.parse(g.gameDate)).filter(Number.isFinite);
    return { count: art.games.length, earliest: starts.length ? Math.min(...starts) : NaN, source: "committed-artifact" };
  }
  return { count: null, earliest: NaN, source: "unknown" };
}

/* ── RECEIPTS ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * A receipt is the artifact itself, not a heartbeat and not a workflow conclusion — this repository
 * has seen a green run write nothing. `hasContent` refuses a file that exists but carries none of
 * the rows it is supposed to prove.
 */
function readReceipt(owner) {
  const rel = owner.receipt.path(DATE, PREV);
  const doc = readJson(rel);
  if (!doc) return null;
  const requires = owner.receipt.requires;
  const hasContent = requires ? Array.isArray(doc[requires]) && doc[requires].length > 0 : true;
  return { generatedAt: doc.generatedAt ?? doc.capturedAt ?? null, hasContent, path: rel };
}

/* ── MAIN ─────────────────────────────────────────────────────────────────────────────────────── */

const mlb = await mlbDay();
const receipts = Object.fromEntries(DAILY_OWNERS.map((o) => [o.id, readReceipt(o)]));

const { rows, state } = evaluateAll({
  date: DATE,
  nowMs,
  scheduledBySport: { mlb: mlb.count },
  earliestStartBySport: { mlb: mlb.earliest },
  // Owners with no sport (settlement, schedules) are always expected to have run.
  scheduledCountOverall: 1,
  earliestStartMs: mlb.earliest,
  receipts,
});

/* Which tree this verdict describes. See the freshness note in the header — a receipt-based answer
   read from a stale checkout is a statement about the checkout, not about the platform. */
let treeHead = null;
try {
  treeHead = fs.readFileSync(path.join(APP, "..", ".git", "HEAD"), "utf8").trim();
  if (treeHead.startsWith("ref: ")) {
    treeHead = fs.readFileSync(path.join(APP, "..", ".git", treeHead.slice(5)), "utf8").trim().slice(0, 9);
  }
} catch { treeHead = null; }

const payload = {
  kind: "daily-owner-slo",
  date: DATE,
  checkedAt: new Date(nowMs).toISOString(),
  treeHead,
  state,
  scheduleSource: mlb.source,
  scheduledMlb: mlb.count,
  owners: rows.map((r) => ({ ...r, receiptPath: receipts[r.id]?.path ?? null })),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);

const BAD = new Set(["INCIDENT", "STALE", "UNKNOWN"]);
for (const r of rows) {
  const line = `[daily-owner-slo] ${r.id.padEnd(16)} ${r.state.padEnd(9)} ${r.reason}${r.blockedUpstream ? ` · blocked by ${r.blockedUpstream.join(", ")}` : ""}`;
  if (BAD.has(r.state)) console.error(line); else console.log(line);
}
console.log(`[daily-owner-slo] ${DATE} · ${state} · schedule via ${mlb.source}`);
console.log(`[daily-owner-slo] wrote ${path.relative(process.cwd(), OUT)}`);

process.exit(has("--fail-on-incident") && state === "INCIDENT" ? 1 : 0);

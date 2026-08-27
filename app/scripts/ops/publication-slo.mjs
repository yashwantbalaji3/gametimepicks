#!/usr/bin/env node
/**
 * PUBLICATION SLO — "is today's slate late, and if so, by what standard?"
 *
 *   node app/scripts/ops/publication-slo.mjs [--now <iso>] [--date <YYYY-MM-DD ET>]
 *                                           [--lead-minutes 90] [--offline] [--fail-on-incident]
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-08-27 the whole daily generation chain — sport-schedules (13:00 UTC), morning-projections
 * (13:30), mlb-daily-production (14:15), cron-watchdog (14:30), daily-products (15:30) — received no
 * scheduled events at all. Jobs either side of that band ran normally, so this was not an outage
 * anyone could see from a green dashboard: it was five silent non-events. At 13:48 ET the homepage
 * still said "Today's slate isn't published yet", which is what it says at 6 AM too.
 *
 * Two separate defects made that possible, and this script answers both:
 *
 *   1. THERE WAS NO DEADLINE. "Not published yet" is true at 6 AM and true at 8 PM, and the site had
 *      no way to tell those apart. A deadline makes lateness a fact rather than a vibe — and it is
 *      derived from the earliest eligible event on the actual schedule, never a hardcoded hour, so a
 *      1:05 PM day and a 10:05 PM day get different deadlines without anyone maintaining a table.
 *
 *   2. THE WATCHDOG SHARED THE FAILURE MODE. cron-watchdog runs at 14:30 UTC — inside the dead band.
 *      The one job whose purpose is noticing that scheduled jobs did not run was itself a scheduled
 *      job that did not run. So this check is deliberately cheap and side-effect-light: it is meant
 *      to be pasted into EVERY workflow that runs during the day (lineup refresh, pregame capture,
 *      auto-refresh, settle), so detection rides on a dozen independent schedules instead of one.
 *      Any single one firing is enough.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not dispatch, spend, or fix anything, and it exits 0 unless explicitly asked otherwise. A
 * watchdog that can fail the run it is watching becomes its own outage — the same reasoning already
 * written into cron-slot-watchdog.mjs. Recovery is a separate, guarded decision.
 *
 * SOURCES
 * -------
 * Schedule comes from the free MLB StatsAPI (no key, no credits), falling back to the committed
 * schedule artifact, then to UNKNOWN. UNKNOWN is never green: not knowing whether games exist is a
 * different state from knowing there are none, and collapsing them is how a missed morning reads as
 * a quiet day.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classify } from "../../src/lib/ops/publication-slo.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(APP, "public", "data");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(n);

const NOW = arg("--now", new Date().toISOString());
const nowMs = Date.parse(NOW);
if (!Number.isFinite(nowMs)) { console.error("publication-slo: --now must be an ISO instant"); process.exit(2); }

/** Today in ET — the product's day boundary, not the runner's. */
function etDate(iso) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}
const DATE = arg("--date", etDate(NOW));
const LEAD_MIN = Number(arg("--lead-minutes", "90"));
const OUT = arg("--json", path.join(DATA, "ops", "publication-slo.json"));

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/* ── SCHEDULE ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * The day's official MLB starts. Free StatsAPI first, committed artifact second, UNKNOWN last.
 *
 * `source` is reported so a reader can tell a live-checked answer from a cached one — a schedule
 * read from an artifact that the broken pipeline was supposed to write is weaker evidence, and
 * saying so is the difference between a watchdog and a rumour.
 */
async function mlbStarts() {
  if (!has("--offline")) {
    try {
      const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${DATE}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const body = await res.json();
        const games = body?.dates?.[0]?.games ?? [];
        return {
          source: "mlb-statsapi",
          games: games.map((g) => ({
            gamePk: g.gamePk,
            startUtc: g.gameDate ?? null,
            away: g.teams?.away?.team?.name ?? null,
            home: g.teams?.home?.team?.name ?? null,
            detailedState: g.status?.detailedState ?? null,
          })),
        };
      }
    } catch { /* fall through to the artifact — a network blip is not evidence of an empty day */ }
  }
  const art = readJson(path.join(DATA, "mlb", "schedule", `${DATE}.json`));
  if (art && Array.isArray(art.games)) {
    return {
      source: "committed-schedule-artifact",
      games: art.games.map((g) => ({
        gamePk: g.gamePk ?? null,
        startUtc: g.gameDate ?? null,
        away: g.awayTeamName ?? null,
        home: g.homeTeamName ?? null,
        detailedState: null,
      })),
    };
  }
  return { source: "unknown", games: null };
}

/* ── ARTIFACT STATE ───────────────────────────────────────────────────────────────────────────── */

/** What exists on disk for the date, and whether it is a real board or a typed pending shell. */
function boardState() {
  const board = readJson(path.join(DATA, "mlb", "boards", `${DATE}.json`));
  if (!board) return { present: false, leans: 0, pendingReason: null, generatedAt: null };
  return {
    present: true,
    leans: Array.isArray(board.leans) ? board.leans.length : 0,
    pendingReason: board.pendingReason ?? null,
    generatedAt: board.generatedAt ?? null,
    scheduledGames: board.summary?.scheduledGames ?? board.games?.length ?? null,
    startedBeforeGeneration: board.coverage?.startedBeforeGeneration?.length ?? 0,
  };
}

/* ── MAIN ─────────────────────────────────────────────────────────────────────────────────────── */

const { source, games } = await mlbStarts();
const board = boardState();
const verdict = classify({ games, board, nowMs, leadMinutes: LEAD_MIN });

// How much of the day is already gone. This is what turns a late slate into a shrinking one: at
// 14:00 ET six of seven games are still recoverable; by 19:30 ET none are.
const pregameRemaining = games
  ? games.filter((g) => { const t = Date.parse(g.startUtc); return Number.isFinite(t) && t > nowMs; }).length
  : null;
const alreadyStarted = games === null ? null : games.length - (pregameRemaining ?? 0);

const payload = {
  kind: "publication-slo",
  date: DATE,
  checkedAt: new Date(nowMs).toISOString(),
  scheduleSource: source,
  leadMinutes: LEAD_MIN,
  state: verdict.state,
  reason: verdict.reason,
  publishDeadlineUtc: verdict.deadlineUtc,
  scheduledGames: games === null ? null : games.length,
  pregameRemaining,
  alreadyStarted,
  board,
  games: games === null ? null : games.map((g) => ({
    ...g,
    pregameAtCheck: Number.isFinite(Date.parse(g.startUtc)) ? Date.parse(g.startUtc) > nowMs : null,
  })),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);

const line = `[publication-slo] ${DATE} · ${verdict.state} · ${verdict.reason}`;
if (verdict.state === "INCIDENT" || verdict.state === "UNKNOWN") console.error(line);
else console.log(line);
if (games) {
  console.log(`[publication-slo] scheduled=${games.length} pregame=${pregameRemaining} started=${alreadyStarted} · schedule via ${source}`);
}
console.log(`[publication-slo] wrote ${path.relative(process.cwd(), OUT)}`);

process.exit(has("--fail-on-incident") && verdict.state === "INCIDENT" ? 1 : 0);

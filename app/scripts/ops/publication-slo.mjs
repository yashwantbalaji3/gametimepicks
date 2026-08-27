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

import { classify, classifySport, worstOf } from "../../src/lib/ops/publication-slo.mjs";

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

/* ── PER-SPORT HORIZONS ───────────────────────────────────────────────────────────────────────── */

/*
 * Each sport supplies its own forward horizon and its own definition of "published"; the judgement
 * is shared (classifySport). Every probe reads a COMMITTED artifact — no network, no key, no
 * credit — so this stays cheap enough to ride a dozen workflows.
 *
 * A probe that cannot establish a horizon returns `events: null`, which classifies as UNKNOWN. It
 * must never return `[]`, because "I could not tell" and "there is nothing on" are the two states
 * this whole program exists to keep apart.
 */
const sportProbe = {
  /* MLB's unit is the day. Published = the board carries rows for the game. */
  mlb(games) {
    if (games === null) return { events: null, published: new Set() };
    const board = readJson(path.join(DATA, "mlb", "boards", `${DATE}.json`));
    const leans = board?.leans ?? [];
    const covered = new Set(leans.map((l) => String(l.gamePk ?? "")).filter(Boolean));
    return {
      events: games.map((g) => ({ id: String(g.gamePk), startUtc: g.startUtc, label: `${g.away} @ ${g.home}` })),
      published: covered,
    };
  },

  /* NFL's unit is the game window. Published = the canonical index carries a forecast for it. */
  nfl() {
    const schedule = readJson(path.join(DATA, "nfl", "schedule", "latest.json"));
    const index = readJson(path.join(DATA, "nfl", "index.json"));
    if (!schedule || !Array.isArray(schedule.rows)) return { events: null, published: new Set() };
    // The horizon is the schedule's own scheduled rows inside the next week — not the index's, or a
    // stale index would define away the very events it is failing to cover.
    const horizonEnd = nowMs + 7 * 24 * 3600_000;
    const parsed = schedule.rows
      .filter((r) => r.statusRaw === "STATUS_SCHEDULED")
      .map((r) => ({ id: String(r.eventId ?? r.id ?? `${r.away?.abbr}-${r.home?.abbr}-${r.dateUtc}`), startUtc: r.dateUtc, label: `${r.away?.abbr ?? "?"} @ ${r.home?.abbr ?? "?"}` }))
      .filter((e) => Number.isFinite(Date.parse(e.startUtc)));
    // Rows that exist but do not parse are a field-name change, not an empty week. Refuse rather
    // than answer — an empty horizon and an unreadable one must never come out the same.
    if (schedule.rows.some((r) => r.statusRaw === "STATUS_SCHEDULED") && !parsed.length) {
      return { events: null, published: new Set() };
    }
    const events = parsed.filter((e) => Date.parse(e.startUtc) <= horizonEnd);
    const published = new Set((index?.events ?? []).map((e) => String(e.eventId ?? e.id ?? `${e.away?.abbr}-${e.home?.abbr}-${e.kickoffUtc}`)));
    return { events, published };
  },

  /* UFC's unit is the card. Published = the bout carries a projection. */
  ufc() {
    const card = readJson(path.join(DATA, "ufc", "card-latest.json"));
    if (!card || !Array.isArray(card.bouts)) return { events: null, published: new Set() };
    const odds = readJson(path.join(DATA, "ufc", "odds-latest.json"));
    const sameCard = odds?.event?.providerEventId === card.event?.providerEventId;
    const published = new Set(sameCard ? (odds?.bouts ?? []).map((b) => String(b.boutId)) : []);
    return {
      events: card.bouts.map((b) => ({
        id: String(b.boutId),
        startUtc: b.startUtc ?? card.event?.startUtc ?? null,
        label: `${b.red?.name ?? "?"} vs ${b.blue?.name ?? "?"}`,
      })),
      published,
    };
  },

  /* EPL's unit is the matchweek. Published = a forecast row exists for the fixture. */
  epl() {
    const dir = path.join(DATA, "soccer", "epl", "fixtures");
    let capture = null;
    try {
      const names = fs.readdirSync(dir).filter((n) => n.startsWith("capture-")).sort();
      if (names.length) capture = readJson(path.join(dir, names.at(-1)));
    } catch { /* no capture directory — horizon unknown, never empty */ }
    if (!capture) return { events: null, published: new Set() };
    const rows = capture.rows ?? capture.fixtures ?? [];
    const horizonEnd = nowMs + 10 * 24 * 3600_000;
    const parsed = rows
      .map((f) => ({
        id: String(f.eventId ?? f.id ?? f.fixtureId ?? ""),
        // `kickoffIso` is what the capture actually calls it. The first draft of this probe guessed
        // three other names, parsed nothing, and reported NO_EVENT for a matchweek with ten fixtures
        // three days out — the exact confusion the refusal below now makes impossible.
        startUtc: f.kickoffIso ?? f.kickoffUtc ?? f.startUtc ?? f.dateUtc ?? null,
        label: f.matchup ?? `${f.homeClub ?? "?"} v ${f.awayClub ?? "?"}`,
      }))
      .filter((e) => e.id && Number.isFinite(Date.parse(e.startUtc)));
    if (rows.length && !parsed.length) return { events: null, published: new Set() };
    const events = parsed.filter((e) => { const t = Date.parse(e.startUtc); return t > nowMs && t <= horizonEnd; });
    const fdir = path.join(DATA, "soccer", "epl", "forecasts");
    const published = new Set();
    try {
      for (const n of fs.readdirSync(fdir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
        for (const r of readJson(path.join(fdir, n))?.rows ?? []) published.add(String(r.eventId ?? r.id ?? ""));
      }
    } catch { /* no forecasts yet — every fixture reads as awaiting, which is the honest answer */ }
    return { events, published };
  },
};

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

/*
 * The matrix. MLB's day-level verdict above stays exactly as it was — it is the one this file was
 * written for, it runs against a LIVE schedule read, and it is what the recovery dispatch keys on.
 * The per-sport block sits beside it and covers the three sports the same outage took while nothing
 * was watching them.
 */
const sports = {};
for (const [key, probe] of Object.entries(sportProbe)) {
  const { events, published } = key === "mlb" ? probe(games) : probe();
  sports[key] = classifySport({ events, published, nowMs, leadMinutes: LEAD_MIN });
}
// Worst-of, never an average: one late sport makes the platform late.
const platformState = worstOf([verdict.state, ...Object.values(sports).map((s) => s.state)]);

const payload = {
  kind: "publication-slo",
  date: DATE,
  platformState,
  sports,
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
for (const [key, v] of Object.entries(sports)) {
  const c = v.counts;
  const line = `[publication-slo] ${key.padEnd(4)} ${v.state.padEnd(15)} ${c.scheduled === null ? "horizon unknown" : `${c.published}/${c.scheduled} published · ${c.awaiting} awaiting · ${c.missedCoverage} missed`}`;
  if (v.state === "INCIDENT" || v.state === "UNKNOWN") console.error(line); else console.log(line);
}
console.log(`[publication-slo] platform: ${platformState}`);
console.log(`[publication-slo] wrote ${path.relative(process.cwd(), OUT)}`);

process.exit(has("--fail-on-incident") && platformState === "INCIDENT" ? 1 : 0);

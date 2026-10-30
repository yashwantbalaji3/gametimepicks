#!/usr/bin/env node
/**
 * NBA FORECAST WINDOW — the free pre-check (Session 10 · G2). Plain node, no dependencies, no network.
 *
 * The NBA experimental forecasts were built only inside sport-schedules (cron 09:07Z), which GitHub delivered
 * 14:09Z–17:35Z over the 12 days before 2026-10-03. A game that tips before that run arrives — opening day's
 * 19:00Z BOS @ DET, the 17:00–21:00Z weekend and holiday tips, the 10:00Z / 12:00Z international preseason
 * games — was never forecast before tip. This answers one question, often: which ET dates have a scheduled
 * game tipping within the horizon that some family has not forecast yet? The workflow builds only those, and
 * the write-once builder (forecast-receipt.mjs) makes a repeated or overlapping run a no-op.
 *
 *   node scripts/nba/decide-nba-forecast-window.mjs --now <ISO> [--horizon-hours 8]   (overnight tips: 18 h)
 *
 * Writes `decision=BUILD|HOLD` and `dates=<space-separated ET dates>` to $GITHUB_OUTPUT when set.
 *
 * NEXT-SLATE PUBLICATION (founder 2026-10-30, lib/sports/nba/next-slate-publication.mjs): it also decides whether the
 * NEXT ET slate may be frozen whole now — once every game of the previous ET date is final / postponed / suspended, or
 * at 06:00 America/New_York on the slate date, whichever comes first. Then it writes `nextday=<date>` (the build step
 * freezes v0 + v0.1 (+ v0.3 aligned) for that whole date, no horizon) and `slate=<date>` (the lane publish step tries
 * that date as well as today ET). `decision` is BUILD when either the window or the next slate owes a forecast.
 * Exit 0 always on a decision (HOLD is a result); 1 on bad usage.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { etDateOf, FAMILIES } from "../../src/lib/sports/nba/experimental-forecast.mjs";
import { owedForecastDates, isOvernightTip, OVERNIGHT_FROM, OVERNIGHT_TO, OVERNIGHT_HORIZON_HOURS } from "../../src/lib/sports/nba/forecast-receipt.mjs";
import { decideNextSlate, inputReadiness, NEXT_SLATE } from "../../src/lib/sports/nba/next-slate-publication.mjs";
import { ROSTER_MAX_AGE_HOURS } from "../../src/lib/sports/nba/roster-gated-pool.mjs";

export const WINDOW_HORIZON_HOURS = 8;
/*
 * OVERNIGHT TIPS (Session 13 side lane). The clocks that reliably deliver are daytime: publication-watchdog's dense
 * 12–22Z ticks and daily-products' morning tick. The hourly cron delivered 4 of ~20 overnight slots, so a tip in the
 * overnight hole (the 10:00Z / 12:00Z international games: HOU @ DAL 10-09 12:00Z, DAL @ HOU 10-11 10:00Z) is owed
 * from OVERNIGHT_HORIZON_HOURS out, so the last dependable evening tick forecasts it. The rule lives in
 * forecast-receipt.mjs so the builder's planRun applies the same widened horizon (it did not until Session 14).
 */
export { OVERNIGHT_FROM, OVERNIGHT_TO, OVERNIGHT_HORIZON_HOURS, isOvernightTip };

/** Owed dates: the normal horizon for every tip, plus the overnight horizon for overnight tips. Pure. */
export function owedWithOvernight({ rows, storedIdsByDate, now, horizonHours = WINDOW_HORIZON_HOURS }) {
  const owedByDate = new Map();
  for (const o of [
    ...owedForecastDates({ scheduleRows: rows, etDateOf, storedIdsByDate, now, horizonHours }),
    ...owedForecastDates({ scheduleRows: rows.filter((r) => isOvernightTip(r?.dateUtc)), etDateOf, storedIdsByDate, now, horizonHours: Math.max(horizonHours, OVERNIGHT_HORIZON_HOURS) }),
  ]) {
    const prev = owedByDate.get(o.date);
    owedByDate.set(o.date, { date: o.date, eventIds: [...new Set([...(prev?.eventIds ?? []), ...o.eventIds])].sort() });
  }
  return [...owedByDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** The families whose missing forecast makes a game owed: every family except one that `alignsWith` an anchor. Pure. */
export function owingFamilies(families) {
  return Object.values(families ?? {}).filter((f) => !f.alignsWith);
}

/** Events every family has frozen (one Set per family). A game missing from any family stays owed. Pure. */
export function frozenByEveryFamily(idSets) {
  const [first, ...rest] = idSets ?? [];
  if (!first) return new Set();
  return new Set([...first].filter((id) => rest.every((s) => s.has(id))));
}

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const SCHEDULE = path.join(APP, "public", "data", "nba", "schedule", "latest.json");
const RESULTS = path.join(APP, "public", "data", "nba", "results");
const readJsonOr = (abs, fallback = null) => { try { return JSON.parse(fs.readFileSync(abs, "utf8")); } catch { return fallback; } };
/** Every finals row of every season record (finals-<season>.json `finals`). Missing record = no finals known. */
const readFinals = () => (fs.existsSync(RESULTS) ? fs.readdirSync(RESULTS).filter((f) => /^finals-.*\.json$/.test(f)).sort() : [])
  .flatMap((f) => readJsonOr(path.join(RESULTS, f), {})?.finals ?? []);

function main() {
  const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1] ?? null; };
  const NOW = arg("--now");
  const HORIZON = arg("--horizon-hours") != null ? Number(arg("--horizon-hours")) : WINDOW_HORIZON_HOURS;
  if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
  if (!(HORIZON > 0)) { console.error("REFUSED: --horizon-hours must be positive"); process.exit(1); }

  const emit = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };

  let schedule;
  try { schedule = JSON.parse(fs.readFileSync(SCHEDULE, "utf8")); } catch (e) {
    console.log(`decision=HOLD · no readable NBA schedule capture (${e.message}) — nothing to forecast from`);
    emit("decision", "HOLD"); emit("dates", ""); emit("nextday", ""); emit("slate", ""); process.exit(0);
  }

  /* Owed = ANY family has not forecast it (Stage 12-S1b). v0 is the preregistered record, v0.1 the champion (N1)
     and v0.2 the challenger (N3); the daily sport-schedules run builds only v0 and v0.1, so keying on v0 alone
     held every window once that run had landed and the challenger never got its game. A roster-gate refusal can
     re-fire BUILD on later ticks until tip; that costs a no-op run (the write-once builder adds nothing twice),
     never a forecast. */
  // A family that `alignsWith` an anchor (v0.3 → v0.1, founder 2026-10-22) is built only at its anchor's instant, in
  // the anchor's run, so it is never owed on its own: counting it would re-fire BUILD every tick for a game the
  // anchor froze earlier, which the aligned family must refuse anyway (it never freezes at another cutoff).
  const storedIdsByDate = (date) => frozenByEveryFamily(owingFamilies(FAMILIES).map((fam) => {
    try { return new Set((JSON.parse(fs.readFileSync(path.join(NBA, fam.dir, "forecasts", `${date}.json`), "utf8")).games ?? []).map((g) => String(g.providerEventId))); }
    catch { return new Set(); } // no file yet = that family has frozen nothing for the date
  }));

  const owed = owedWithOvernight({ rows: schedule.rows ?? [], storedIdsByDate, now: NOW, horizonHours: HORIZON });

  // NEXT SLATE: frozen whole once the previous ET slate is final, or at the 06:00 ET fallback. "Frozen" here means
  // the two families the build step freezes for the whole slate: v0 (preregistered record) and v0.1 (official players).
  const idsOf = (fam, date) => {
    try { return new Set((JSON.parse(fs.readFileSync(path.join(NBA, FAMILIES[fam].dir, "forecasts", `${date}.json`), "utf8")).games ?? []).map((g) => String(g.providerEventId))); }
    catch { return new Set(); }
  };
  const next = decideNextSlate({ scheduleRows: schedule.rows ?? [], finals: readFinals(), etDateOf, now: NOW, frozenIds: (date) => frozenByEveryFamily([idsOf("v0", date), idsOf("v0.1", date)]) });
  console.log(`next-slate=${next.action} · ${next.reason}${next.trigger ? ` · trigger ${next.trigger}` : ""}`);
  if (next.action === NEXT_SLATE.BUILD || next.action === NEXT_SLATE.FROZEN) {
    const rosters = readJsonOr(path.join(NBA, "rosters", "latest.json"));
    const injuries = readJsonOr(path.resolve(NBA, "..", "injuries", "nba", "latest.json"));
    const r = inputReadiness({ now: NOW, rosterAsOf: rosters?.asOf ?? rosters?.capturedAt ?? null, injuriesGeneratedAt: injuries?.generatedAt ?? null, scheduleGeneratedAt: schedule.generatedAt ?? null, rosterMaxAgeHours: ROSTER_MAX_AGE_HOURS });
    console.log(`  inputs · roster ${r.roster} · injuries ${r.injuries} · schedule capture ${r.schedule}`);
  }
  const nextday = next.action === NEXT_SLATE.BUILD ? next.slate : "";
  const slate = next.action === NEXT_SLATE.BUILD || next.action === NEXT_SLATE.FROZEN ? next.slate : "";
  // The next slate also rides the window loop (its v0.2 / v1 stay on the 8 h horizon; its Top Boards freeze there).
  const dates = [...new Set([...owed.map((o) => o.date), ...(nextday ? [nextday] : [])])].sort();
  if (!dates.length) {
    console.log(`decision=HOLD · ${NOW}: no NBA game tips within ${HORIZON} h without a forecast; next slate not owed`);
    emit("decision", "HOLD"); emit("dates", "");
  } else {
    for (const o of owed) console.log(`owed ${o.date}: ${o.eventIds.join(", ")}`);
    if (nextday) console.log(`owed next slate ${nextday} (whole slate, v0 + v0.1): ${next.owed.join(", ")}`);
    console.log(`decision=BUILD · ${dates.join(" ")}`);
    emit("decision", "BUILD"); emit("dates", dates.join(" "));
  }
  emit("nextday", nextday);
  emit("slate", slate);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

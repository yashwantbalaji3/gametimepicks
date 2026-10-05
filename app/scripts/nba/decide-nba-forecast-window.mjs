#!/usr/bin/env node
/**
 * NBA FORECAST WINDOW — the free pre-check (Session 10 · G2). Plain node, no dependencies, no network.
 *
 * The NBA experimental forecasts were built only inside sport-schedules (cron 09:07Z), which GitHub delivered
 * 14:09Z–17:35Z over the 12 days before 2026-10-03. A game that tips before that run arrives — opening day's
 * 19:00Z BOS @ DET, the 17:00–21:00Z weekend and holiday tips, the 10:00Z / 12:00Z international preseason
 * games — was never forecast before tip. This answers one question, often: which ET dates have a scheduled
 * game tipping within the horizon that neither family has forecast yet? The workflow builds only those, and
 * the write-once builder (forecast-receipt.mjs) makes a repeated or overlapping run a no-op.
 *
 *   node scripts/nba/decide-nba-forecast-window.mjs --now <ISO> [--horizon-hours 8]   (overnight tips: 18 h)
 *
 * Writes `decision=BUILD|HOLD` and `dates=<space-separated ET dates>` to $GITHUB_OUTPUT when set.
 * Exit 0 always on a decision (HOLD is a result); 1 on bad usage.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { etDateOf, FAMILIES } from "../../src/lib/sports/nba/experimental-forecast.mjs";
import { owedForecastDates, isOvernightTip, OVERNIGHT_FROM, OVERNIGHT_TO, OVERNIGHT_HORIZON_HOURS } from "../../src/lib/sports/nba/forecast-receipt.mjs";

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

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const SCHEDULE = path.join(APP, "public", "data", "nba", "schedule", "latest.json");

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
    emit("decision", "HOLD"); emit("dates", ""); process.exit(0);
  }

  /* Owed = v0 (the PREREGISTERED record) has not forecast it. v0.1 is research built alongside on the same run;
     keying on it too would re-fire every tick whenever its roster gate refuses (which is the gate working). */
  const V0_DIR = FAMILIES["v0"].dir;
  const storedIdsByDate = (date) => {
    try { return new Set((JSON.parse(fs.readFileSync(path.join(NBA, V0_DIR, "forecasts", `${date}.json`), "utf8")).games ?? []).map((g) => String(g.providerEventId))); }
    catch { return new Set(); }
  };

  const owed = owedWithOvernight({ rows: schedule.rows ?? [], storedIdsByDate, now: NOW, horizonHours: HORIZON });
  if (!owed.length) {
    console.log(`decision=HOLD · ${NOW}: no NBA game tips within ${HORIZON} h without a forecast`);
    emit("decision", "HOLD"); emit("dates", "");
  } else {
    for (const o of owed) console.log(`owed ${o.date}: ${o.eventIds.join(", ")}`);
    console.log(`decision=BUILD · ${owed.map((o) => o.date).join(" ")}`);
    emit("decision", "BUILD"); emit("dates", owed.map((o) => o.date).join(" "));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

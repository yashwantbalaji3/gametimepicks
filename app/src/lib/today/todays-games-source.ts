/**
 * TODAY'S GAMES — the build-time reader. Reads each sport's EXISTING schedule owner (the same files
 * `product-day.ts buildSportToday` counts from, so the list and the day count agree) and hands plain
 * rows to the pure `buildTodaysGames`. No new data path, nothing fetched, nothing inferred.
 *
 *   NFL      nfl/schedule/latest.json ∪ nfl/index.json events (forecast) · settled from graded-picks
 *   NBA      nba/schedule/latest.json (factual; no game page exists, rows link to /nba)
 *   MLB      mlb/statsapi-schedule/<today>.json · game page from full-game-simulations/<today>.json
 *   EPL      newest soccer/epl/fixtures capture ∪ forecast rows
 *   Ligue 1  soccer/ligue-1/forecasts/latest.json — FORECAST-ONLY, so it can list games but cannot
 *            prove a quiet day (`required: false`)
 *   UFC      ufc/card-latest.json — ONE row per card, not per bout
 *
 * Hrefs are given only where the route is known to exist for that event; otherwise the sport hub.
 */
import fs from "node:fs";
import path from "node:path";

import { buildTodaysGames, etDayOf } from "./todays-games.mjs";

type Json = Record<string, any> | null;
const readJson = (root: string, ...rel: string[]): Json => {
  try { return JSON.parse(fs.readFileSync(path.join(root, ...rel), "utf8")); } catch { return null; }
};
const newestCapture = (dir: string, prefix: string): Json => {
  try {
    const f = fs.readdirSync(dir).filter((x) => x.startsWith(prefix) && x.endsWith(".json")).sort().at(-1);
    return f ? JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) : null;
  } catch { return null; }
};

/** Sports the live gateway serves (`api/_live-core.mjs` SUPPORTED_SPORTS). Only these can be upgraded to Live. */
export const LIVE_FEED_SPORTS = new Set(["nfl", "mlb"]);

/** A schedule capture "knows" today when today falls inside its forward window (the NFL rule in product-day). */
function windowCovers(capture: Json, today: string): boolean {
  const capDay = typeof capture?.generatedAt === "string" ? etDayOf(capture.generatedAt) : null;
  if (!capDay || !Array.isArray(capture?.rows)) return false;
  const end = etDayOf(Date.parse(`${capDay}T12:00:00Z`) + Number(capture.windowDays ?? 7) * 86_400_000);
  return capDay <= today && today <= (end ?? capDay);
}

const team = (side: any): string | null => side?.name ?? side?.abbr ?? null;

export function loadTodaysGames(dataRoot: string, opts: { today: string; nowMs: number }) {
  const { today, nowMs } = opts;

  // NFL
  const nflSched = readJson(dataRoot, "nfl", "schedule", "latest.json");
  const nflIndex = readJson(dataRoot, "nfl", "index.json");
  const nflGraded = readJson(dataRoot, "nfl", "graded-picks.json");
  const nflForecast = new Set((nflIndex?.events ?? []).map((e: any) => String(e.providerEventId)));
  const nflSettled = new Set((nflGraded?.picks ?? []).map((p: any) => String(p.eventId ?? "").replace(/^nfl-/, "")));
  const nflRows = new Map<string, any>();
  for (const r of nflSched?.rows ?? []) {
    const id = String(r.providerEventId);
    nflRows.set(id, { eventId: `nfl:${id}`, startUtc: r.dateUtc, providerStatus: r.statusRaw, away: team(r.away), home: team(r.home) });
  }
  for (const e of nflIndex?.events ?? []) {
    const id = String(e.providerEventId);
    if (!nflRows.has(id)) nflRows.set(id, { eventId: `nfl:${id}`, startUtc: e.kickoffUtc, providerStatus: null, away: team(e.away), home: team(e.home) });
  }
  const nfl = [...nflRows.entries()].map(([id, r]) => ({
    ...r,
    hasForecast: nflForecast.has(id),
    settled: nflSettled.has(id),
    href: nflForecast.has(id) || nflSettled.has(id) ? `/nfl/game/${id}/` : "/nfl/",
    liveFeed: LIVE_FEED_SPORTS.has("nfl"),
  }));

  // NBA — factual schedule only; predictive NBA stays SHADOW, so nothing here is a forecast.
  const nbaSched = readJson(dataRoot, "nba", "schedule", "latest.json");
  const nba = (nbaSched?.rows ?? []).map((r: any) => ({
    eventId: `nba:${r.providerEventId}`, startUtc: r.dateUtc, providerStatus: r.statusRaw,
    away: team(r.away), home: team(r.home), hasForecast: false, settled: false, href: "/nba/", liveFeed: false,
  }));

  // MLB — the official schedule lists every game; the simulation file says which have a game page.
  const mlbOfficial = readJson(dataRoot, "mlb", "statsapi-schedule", `${today}.json`);
  const mlbSims = readJson(dataRoot, "mlb", "full-game-simulations", `${today}.json`);
  const slugByPk = new Map<string, string>();
  for (const g of mlbSims?.games ?? []) if (g?.gamePk != null && typeof g.slug === "string") slugByPk.set(String(g.gamePk), g.slug);
  const mlb = (mlbOfficial?.games ?? []).map((g: any) => {
    const slug = slugByPk.get(String(g.gamePk));
    return {
      eventId: `mlb:${g.gamePk}`, startUtc: g.gameDate, providerStatus: g.status,
      away: team(g.away), home: team(g.home),
      hasForecast: Boolean(slug), settled: false, href: slug ? `/games/mlb/${slug}/` : "/mlb/",
      liveFeed: LIVE_FEED_SPORTS.has("mlb"),
    };
  });

  // EPL
  const eplFixtures = newestCapture(path.join(dataRoot, "soccer", "epl", "fixtures"), "capture-");
  const eplForecasts = readJson(dataRoot, "soccer", "epl", "forecasts", "latest.json");
  const eplPublished = new Map<string, any>();
  for (const f of eplForecasts?.rows ?? []) if (f?.eventId && f.probs != null) eplPublished.set(String(f.eventId), f);
  const epl = (eplFixtures?.rows ?? eplFixtures?.fixtures ?? []).map((r: any) => {
    const id = String(r.eventId ?? "");
    const kick = r.kickoffIso ?? r.kickoffUtc ?? null;
    const slug = id.split(":")[2];
    const published = eplPublished.has(id);
    return {
      eventId: `epl:${id}`, startUtc: kick, providerStatus: r.lifecycle ?? null,
      away: r.awayClub ?? null, home: r.homeClub ?? null, hasForecast: published, settled: false,
      href: published && slug ? `/epl/match/${slug}-${String(kick ?? "").slice(0, 10)}/` : "/epl/",
      liveFeed: false,
    };
  });

  // Ligue 1 — forecast rows are the only source; they list games but cannot prove a quiet day.
  const l1 = readJson(dataRoot, "soccer", "ligue-1", "forecasts", "latest.json");
  const ligue1 = (l1?.rows ?? []).map((r: any) => ({
    eventId: String(r.eventId), startUtc: r.kickoffUtc, providerStatus: r.lifecycle ?? r.status ?? null,
    away: r.awayClub ?? null, home: r.homeClub ?? null, hasForecast: true, settled: false,
    href: "/soccer/ligue-1/", liveFeed: false,
  }));

  // UFC — one card, one row.
  const card = readJson(dataRoot, "ufc", "card-latest.json");
  const ev = card?.event;
  const ufc = ev?.providerEventId ? [{
    eventId: `ufc:${ev.providerEventId}`, startUtc: ev.startUtc ?? null, providerStatus: null,
    title: ev.name ?? "UFC card", boutCount: Array.isArray(card?.bouts) ? card.bouts.length : null,
    away: null, home: null, hasForecast: (card?.bouts ?? []).some((b: any) => b?.prediction), settled: false,
    href: "/ufc/", liveFeed: false,
  }] : [];

  return buildTodaysGames({
    today, nowMs,
    sports: [
      { sport: "nfl", known: windowCovers(nflSched, today), rows: nfl },
      { sport: "mlb", known: Array.isArray(mlbOfficial?.games), rows: mlb },
      { sport: "nba", known: windowCovers(nbaSched, today), rows: nba },
      { sport: "epl", known: Array.isArray(eplFixtures?.rows ?? eplFixtures?.fixtures) && (eplFixtures?.rows ?? eplFixtures?.fixtures).length > 0, rows: epl },
      { sport: "ligue-1", known: false, required: false, rows: ligue1 },
      { sport: "ufc", known: Boolean(ev), rows: ufc },
    ],
  });
}

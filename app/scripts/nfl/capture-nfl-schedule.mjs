/**
 * NFL schedule capture — ESPN public scoreboard → committed artifact (Program 148 · Release B/D).
 *
 * Source: site.api.espn.com public scoreboard JSON — no key, no cost. This repository already uses
 * ESPN public endpoints with attribution (the retired event hub's snapshots; espn_cdn identity
 * assets), and the source registry entry `espn_scoreboard` records the rights. The capture is a
 * POINT-IN-TIME SNAPSHOT: it stamps capturedAt on every row and never claims to be live.
 *
 * Honesty rules:
 *   - rows keep the provider's own event id (the contract's identity requirement) and RAW status
 *     string — normalization happens in the adapter through the closed taxonomy, never here;
 *   - the fetch window is explicit (--days from --now), so a capture can never silently imply
 *     "the whole season";
 *   - --now is required; the script refuses to read a live clock for its stamps.
 *
 * Run: node scripts/nfl/capture-nfl-schedule.mjs --now 2026-08-09T22:10:00Z --days 9
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(APP, "public", "data", "nfl", "schedule");

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const DAYS = Math.min(31, Math.max(1, Number(arg("--days", "9"))));

const d0 = new Date(NOW);
const fmt = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");
const d1 = new Date(d0.getTime() + DAYS * 86400_000);
const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${fmt(d0)}-${fmt(d1)}`;

const res = await fetch(url);
if (!res.ok) { console.error(`REFUSED: scoreboard fetch ${res.status}`); process.exit(1); }
const data = await res.json();

const rows = (data.events ?? []).map((e) => {
  const comp = e.competitions?.[0];
  const side = (role) => {
    const c = comp?.competitors?.find((x) => x.homeAway === role);
    return c ? { abbr: c.team?.abbreviation ?? null, name: c.team?.displayName ?? null, providerTeamId: c.team?.id ?? null } : null;
  };
  return {
    providerEventId: String(e.id),
    shortName: e.shortName ?? null,
    dateUtc: e.date,
    statusRaw: e.status?.type?.name ?? null,     // RAW — the adapter normalizes, never this file
    seasonType: e.season?.type ?? null,           // 1 = preseason, 2 = regular, 3 = post
    week: e.week?.number ?? null,
    home: side("home"),
    away: side("away"),
    venue: comp?.venue?.fullName ?? null,
    capturedAt: NOW,
  };
}).filter((r) => r.providerEventId && r.dateUtc && r.home?.name && r.away?.name);

if (rows.length === 0) { console.error("REFUSED: zero usable events — an empty capture would render as an empty slate"); process.exit(1); }

const artifact = {
  schemaVersion: 1,
  sport: "nfl",
  dataClass: "SCHEDULE_CAPTURE",
  generatedAt: NOW,
  windowDays: DAYS,
  source: {
    id: "espn_scoreboard",
    name: "ESPN public scoreboard (site.api.espn.com)",
    url,
    license: "public JSON endpoint, no key; used as a point-in-time snapshot with attribution — same class of usage as the repo's prior ESPN snapshot captures",
  },
  rows,
};

fs.mkdirSync(OUT, { recursive: true });
const file = `capture-${NOW.replace(/[:]/g, "").slice(0, 15)}.json`;
fs.writeFileSync(path.join(OUT, file), JSON.stringify(artifact, null, 1));
fs.writeFileSync(path.join(OUT, "latest.json"), JSON.stringify(artifact, null, 1));
console.log(`${file} written (+latest.json): ${rows.length} events, seasonTypes ${[...new Set(rows.map((r) => r.seasonType))].join(",")}`);

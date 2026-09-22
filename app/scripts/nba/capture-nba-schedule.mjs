/**
 * NBA schedule capture — ESPN public scoreboard → committed artifact (Program 150 · Release A).
 *
 * Captures ONLY genuinely published events in the window (today: the confirmed 2026-27 preseason
 * slate). The full season schedule is NOT inferred: what the provider has not released does not
 * exist here, and the artifact records its window so a partial calendar can never render as
 * complete. Season phase is kept per event (ESPN season.type: 1 preseason, 2 regular, 3 post) —
 * NBA Cup and international games arrive with their own provider event ids, which is what keeps
 * them from colliding with regular-season identities.
 *
 * Same contract as the NFL capture: raw provider statuses (adapter normalizes), --now pinned,
 * zero-event windows REFUSED so an empty capture can never look like an empty slate.
 *
 * Run: node scripts/nba/capture-nba-schedule.mjs --now 2026-08-10T02:30:00Z --days 70   (--dry-run: fetch, count, write nothing)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scoreboardMonthUrls, mergeWindowEvents } from "../../src/lib/sports/espn-scoreboard-window.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(APP, "public", "data", "nba", "schedule");
const DRY = process.argv.includes("--dry-run");

const arg = (name, fb = null) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const DAYS = Math.min(120, Math.max(1, Number(arg("--days", "70"))));

const d0 = new Date(NOW);
const fmt = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");
const d1 = new Date(d0.getTime() + DAYS * 86400_000);
// 2026-09-20: the provider began answering the RANGE form (`dates=A-B`) with 400 on every request
// (sport-schedules.yml refused "NBA schedule" daily). The month form still answers; the window is
// applied here, on the events, so the artifact's promise ("this window, never the season") holds.
const urls = scoreboardMonthUrls("basketball/nba", d0, d1);
const responses = [];
for (const u of urls) {
  const res = await fetch(u);
  if (!res.ok) { console.error(`REFUSED: scoreboard fetch ${res.status} (${u})`); process.exit(1); }
  responses.push(await res.json());
}
const data = { events: mergeWindowEvents(responses, d0, d1) };
const url = urls.join(" ");

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
    statusRaw: e.status?.type?.name ?? null,
    seasonType: e.season?.type ?? null,       // 1 preseason · 2 regular · 3 postseason
    neutralSite: comp?.neutralSite === true,
    home: side("home"),
    away: side("away"),
    venue: comp?.venue?.fullName ?? null,
    capturedAt: NOW,
  };
}).filter((r) => r.providerEventId && r.dateUtc && r.home?.name && r.away?.name);

if (rows.length === 0) { console.error("REFUSED: zero usable events — an empty capture would render as an empty slate"); process.exit(1); }
const dupes = rows.length - new Set(rows.map((r) => r.providerEventId)).size;
if (dupes > 0) { console.error(`REFUSED: ${dupes} duplicate provider event ids in one window`); process.exit(1); }

const artifact = {
  schemaVersion: 1,
  sport: "nba",
  dataClass: "SCHEDULE_CAPTURE",
  generatedAt: NOW,
  windowDays: DAYS,
  coverageNote: "confirmed published events only — the full 2026-27 schedule is captured as the provider releases it, never inferred",
  source: {
    id: "espn_scoreboard",
    name: "ESPN public scoreboard (site.api.espn.com)",
    url,
    license: "public JSON endpoint, no key; point-in-time snapshot with attribution",
  },
  rows,
};

if (DRY) { console.log(`dry-run: ${rows.length} events in window ${fmt(d0)}..${fmt(d1)} from ${urls.length} month request(s), neutral ${rows.filter((r) => r.neutralSite).length}; nothing written`); process.exit(0); }
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, `capture-${NOW.replace(/[:]/g, "").slice(0, 15)}.json`), JSON.stringify(artifact, null, 1));
fs.writeFileSync(path.join(OUT, "latest.json"), JSON.stringify(artifact, null, 1));
console.log(`captured ${rows.length} events, seasonTypes ${[...new Set(rows.map((r) => r.seasonType))].join(",")}, neutral ${rows.filter((r) => r.neutralSite).length}, window ${DAYS}d`);

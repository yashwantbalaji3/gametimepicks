/**
 * capture-mlb-pregame-travel-rest.mjs — INTERNAL pregame TRAVEL & REST features, derived STRICTLY from games dated
 * before the slate (leakage-safe). Immutable, timestamped, multi-cadence per gamePk+teamId+capturedAt. Free StatsAPI.
 * No modeling, no prediction, no money, no public product.
 *
 * Per (game, team): daysRest (days since the team's previous game), gamesLast7 / gamesLast10 (games in the prior 7/10
 * calendar days), travelDistanceKm (great-circle km between the previous venue and today's venue via venue coords).
 * Travel is NEVER fabricated — if either venue's coordinates are unavailable it is left null.
 * Output: data/internal/mlb/pregame-archive/pregame-features/travel-rest/<date>/<gamePk>-<teamId>-<capturedAt>.json.
 *
 *   node app/scripts/capture-mlb-pregame-travel-rest.mjs --date 2026-07-23            # dry-run
 *   node app/scripts/capture-mlb-pregame-travel-rest.mjs --date 2026-07-23 --write    # persist
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { teamUniverse } from "./capture-mlb-pregame-team-offensive-form.mjs";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const OUT = path.join(REPO, "data/internal/mlb/pregame-archive/pregame-features/travel-rest");
const HOST = "https://statsapi.mlb.com";
const SCHEMA_VERSION = "mlb-pregame-travel-rest-1";
const sha = (s) => crypto.createHash("sha256").update(typeof s === "string" ? s : JSON.stringify(s)).digest("hex");
const round = (x, d = 1) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);
const addDays = (ymd, delta) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + delta); return d.toISOString().slice(0, 10); };
const diffDays = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "gtp-pregame-travel-rest/1" } });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, 500 * (i + 1))); }
  }
}

// great-circle distance (km) between two {lat,lon}; null if either is missing (NEVER fabricated).
export function haversineKm(a, b) {
  if (!a || !b) return null;
  const R = 6371, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))), 1);
}

async function main() {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--write");
  const di = args.indexOf("--date");
  const date = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[di + 1] || "") ? args[di + 1] : new Date().toISOString().slice(0, 10);
  const capturedAt = new Date().toISOString();
  const start14 = addDays(date, -14), end1 = addDays(date, -1), cut7 = addDays(date, -7), cut10 = addDays(date, -10);

  let universe = [];
  try { universe = await teamUniverse(date); } catch (e) { console.log(`[travel-rest] schedule fetch failed for ${date}: ${e.message}`); return; }
  if (!universe.length) { console.log(`[travel-rest] no games scheduled for ${date}`); return; }

  // today's venue per gamePk (from the slate schedule) + cached venue coordinates (defaultCoordinates).
  const todayVenue = new Map();
  try { const s = await fetchJson(`${HOST}/api/v1/schedule?sportId=1&date=${date}`); for (const g of s.dates?.[0]?.games || []) todayVenue.set(g.gamePk, g.venue?.id ?? null); } catch {}
  const coordCache = new Map();
  async function venueCoords(id) {
    if (!id) return null;
    if (!coordCache.has(id)) {
      try { const j = await fetchJson(`${HOST}/api/v1/venues/${id}?hydrate=location`); const c = j.venues?.[0]?.location?.defaultCoordinates; coordCache.set(id, c && c.latitude != null && c.longitude != null ? { lat: Number(c.latitude), lon: Number(c.longitude) } : null); }
      catch { coordCache.set(id, null); }
    }
    return coordCache.get(id);
  }

  const outDir = path.join(OUT, date);
  let wrote = 0, eligible = 0, fetched = 0;
  const samples = [];
  for (const t of universe) {
    let prior = [];
    try {
      const j = await fetchJson(`${HOST}/api/v1/schedule?sportId=1&teamId=${t.teamId}&startDate=${start14}&endDate=${end1}`); fetched++;
      for (const dt of j.dates || []) for (const g of dt.games || []) {
        const od = g.officialDate || dt.date, st = g.status?.detailedState || "";
        if (od && od < date && !/cancel|postpone/i.test(st)) prior.push({ date: od, venueId: g.venue?.id ?? null });
      }
    } catch { prior = []; }
    prior.sort((a, b) => a.date.localeCompare(b.date));
    const previous = prior.length ? prior[prior.length - 1] : null;
    const previousGameDate = previous?.date ?? null;
    const previousVenueId = previous?.venueId ?? null;
    const daysRest = previousGameDate ? diffDays(previousGameDate, date) : null;
    const gamesLast7 = prior.filter((g) => g.date >= cut7).length;
    const gamesLast10 = prior.filter((g) => g.date >= cut10).length;
    const travelDistanceKm = haversineKm(await venueCoords(previousVenueId), await venueCoords(todayVenue.get(t.gamePk)));
    const researchEligible = t.eventStartTime ? capturedAt < t.eventStartTime : false;
    const record = {
      schemaVersion: SCHEMA_VERSION, public: false, approvedForProduction: false, productEligible: false,
      family: "travel_rest", gamePk: t.gamePk, teamId: t.teamId, name: t.name, side: t.side, date, capturedAt, availableAt: capturedAt, eventStartTime: t.eventStartTime,
      researchEligible,
      eligibilityReason: researchEligible ? "captured pregame; only games strictly earlier than the slate + static venue coordinates used" : "captured at/after first pitch (or no start time)",
      daysRest, gamesLast7, gamesLast10, travelDistanceKm, previousGameDate, previousVenueId,
      leakageRule: "only the team's games with officialDate < slate date are counted; venue coordinates are static; captured pregame",
      travelNote: travelDistanceKm == null ? "venue coordinates unavailable for one or both venues — travel left null (not fabricated)" : "great-circle km between previous and today's venue coordinates",
      provenance: { teamSchedule: `${HOST}/api/v1/schedule?sportId=1&teamId=${t.teamId}&startDate=${start14}&endDate=${end1}`, venueCoords: `${HOST}/api/v1/venues/{id}?hydrate=location`, capturedAt },
    };
    record.recordHash = sha({ ...record, capturedAt: undefined, availableAt: undefined, provenance: undefined, recordHash: undefined });
    if (researchEligible) { eligible++; if (samples.length < 4) samples.push(record); }
    if (WRITE && researchEligible) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, `${t.gamePk}-${t.teamId}-${capturedAt.replace(/[:.]/g, "-")}.json`), JSON.stringify(record, null, 2)); wrote++; }
  }
  console.log(`[travel-rest] ${WRITE ? "WROTE" : "DRY-RUN"} ${date}: ${universe.length} team-slots · fetched ${fetched} · eligible ${eligible}${WRITE ? ` · wrote ${wrote}` : ""}`);
  for (const r of samples) console.log(`[travel-rest]   sample ${r.name} (${r.side}) daysRest=${r.daysRest} gamesLast7=${r.gamesLast7} gamesLast10=${r.gamesLast10} travelKm=${r.travelDistanceKm} prevVenue=${r.previousVenueId} prevDate=${r.previousGameDate}`);
  if (!WRITE) console.log(`[travel-rest] dry-run — pass --write to persist pregame-features/travel-rest/${date}/`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main().catch((e) => { console.error("[travel-rest] fatal:", e); process.exit(1); });

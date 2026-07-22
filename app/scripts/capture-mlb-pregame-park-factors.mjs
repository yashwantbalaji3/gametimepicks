/**
 * capture-mlb-pregame-park-factors.mjs — INTERNAL pregame PARK/VENUE factors.
 *
 * Captures FACTUAL venue attributes (elevation, roof, turf, city) from StatsAPI — all static, pregame-safe — plus
 * a factor slot (runFactor / hrFactor / handednessEffect). To stay honest, the numeric park factors are NOT
 * fabricated: they default to a NEUTRAL 100 baseline and carry a documented source + update policy for loading real
 * published park factors later. A `runEnvironmentSignal` IS derived from the factual elevation (high elevation ⇒
 * more offense) — a factual directional note, not a modeled number. No prediction.
 *
 * Output: data/internal/mlb/pregame-archive/pregame-features/park-factors/<date>/<gamePk>.json (internal).
 *
 *   node app/scripts/capture-mlb-pregame-park-factors.mjs --date 2026-07-22            # dry-run
 *   node app/scripts/capture-mlb-pregame-park-factors.mjs --date 2026-07-22 --write    # persist
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const OUT = path.join(REPO, "data/internal/mlb/pregame-archive/pregame-features/park-factors");
const HOST = "https://statsapi.mlb.com";
const SCHEMA_VERSION = "mlb-pregame-park-factors-1";
const NEUTRAL = 100;
const sha = (s) => crypto.createHash("sha256").update(typeof s === "string" ? s : JSON.stringify(s)).digest("hex");

async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "gtp-pregame-park-factors/1" } });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, 500 * (i + 1))); }
  }
}

// FACTUAL directional signal from elevation only (no fabricated number).
export function runEnvironmentSignal(elevationFt) {
  if (elevationFt == null || elevationFt === "") return "unknown";
  const e = Number(elevationFt);
  if (!Number.isFinite(e)) return "unknown";
  if (e >= 3000) return `high-elevation (${e} ft)`;
  if (e >= 1000) return `moderate-elevation (${e} ft)`;
  return `sea-level-ish (${e} ft)`;
}

async function main() {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--write");
  const di = args.indexOf("--date");
  const date = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[di + 1] || "") ? args[di + 1] : new Date().toISOString().slice(0, 10);
  const capturedAt = new Date().toISOString();

  let sched;
  try { sched = await fetchJson(`${HOST}/api/v1/schedule?sportId=1&date=${date}&hydrate=venue`); }
  catch (e) { console.error(`[park] schedule fetch failed (${String(e).slice(0, 60)})`); return; }
  const games = sched?.dates?.[0]?.games || [];
  if (!games.length) { console.log(`[park] no games on ${date}`); return; }

  const venueCache = new Map();
  async function venueDetail(id) {
    if (!id) return null;
    if (!venueCache.has(id)) { try { const j = await fetchJson(`${HOST}/api/v1/venues/${id}?hydrate=location,fieldInfo`); venueCache.set(id, j.venues?.[0] ?? null); } catch { venueCache.set(id, null); } }
    return venueCache.get(id);
  }

  let wrote = 0, eligible = 0;
  for (const g of games) {
    const eventStartTime = g.gameDate;
    const researchEligible = eventStartTime ? capturedAt < eventStartTime : false;
    const vd = await venueDetail(g.venue?.id);
    const elevation = vd?.location?.elevation ?? null;
    const record = {
      schemaVersion: SCHEMA_VERSION, public: false, approvedForProduction: false, productEligible: false,
      family: "park_factors", gamePk: g.gamePk, date, capturedAt, availableAt: capturedAt, eventStartTime, researchEligible,
      eligibilityReason: researchEligible ? "static venue facts, captured pregame" : "captured at/after first pitch",
      venue: { id: g.venue?.id ?? null, name: g.venue?.name ?? vd?.name ?? null, city: vd?.location?.city ?? null, elevation, roofType: vd?.fieldInfo?.roofType ?? null, turfType: vd?.fieldInfo?.turfType ?? null },
      factors: { runFactor: NEUTRAL, hrFactor: NEUTRAL, handednessEffect: null, runEnvironmentSignal: runEnvironmentSignal(elevation) },
      source: "StatsAPI venue endpoint (FACTUAL: elevation/roof/turf/city). Numeric run/HR/handedness park factors are NOT loaded from any published source — runFactor/hrFactor default to a NEUTRAL 100 baseline; treat as neutral until a real source is loaded. Only runEnvironmentSignal is derived (from factual elevation).",
      updatePolicy: "Static per venue. Refresh factual attributes if a venue changes. Load numeric park factors annually from a published source (e.g. Statcast/FanGraphs park factors) in a SEPARATE internal reference; never fabricate.",
      leakageRule: "venue attributes are static/pregame; capturedAt recorded for provenance",
    };
    record.recordHash = sha({ ...record, capturedAt: undefined, availableAt: undefined, recordHash: undefined });
    if (researchEligible) eligible++;
    if (WRITE && researchEligible) { const dir = path.join(OUT, date); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${g.gamePk}.json`), JSON.stringify(record, null, 2)); wrote++; }
  }
  console.log(`[park] ${WRITE ? "WROTE" : "DRY-RUN"} ${date}: ${games.length} games · ${venueCache.size} venues · eligible ${eligible}${WRITE ? ` · wrote ${wrote}` : ""}`);
  if (!WRITE) console.log(`[park] dry-run — pass --write to persist pregame-features/park-factors/${date}/`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main().catch((e) => { console.error("[park] fatal:", e); process.exit(1); });

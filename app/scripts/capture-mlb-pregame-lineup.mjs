/**
 * capture-mlb-pregame-lineup.mjs — INTERNAL multi-cadence pregame LINEUP capture.
 *
 * Confirmed batting order + positions + availability + scratches, captured as immutable, TIMESTAMPED snapshots so
 * a game accumulates lineup states across the pregame windows (T-24h → T-15m) as the 8×/day cron fires. Each
 * snapshot records the window it fell in (minutesToFirstPitch) and is researchEligible ONLY if captured before
 * first pitch. NEVER uses postgame information; a snapshot at/after first pitch is marked ineligible, never dropped.
 *
 * Scratches are derived by diffing against the latest PRIOR lineup snapshot for the same game (a player who was in
 * a prior posted lineup but not the current one). No modeling, no prediction.
 *
 * Output (append-only): data/internal/mlb/pregame-archive/pregame-features/lineup/<date>/<gamePk>-<capturedAt>.json
 * Pure node builtins + free StatsAPI (no Odds credits). Dry-run by default; --write persists.
 *
 *   node app/scripts/capture-mlb-pregame-lineup.mjs --date 2026-07-22            # dry-run
 *   node app/scripts/capture-mlb-pregame-lineup.mjs --date 2026-07-22 --write    # persist a snapshot per game
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const OUT = path.join(REPO, "data/internal/mlb/pregame-archive/pregame-features/lineup");
const HOST = "https://statsapi.mlb.com";
const SCHEMA_VERSION = "mlb-pregame-lineup-1";
const sha = (s) => crypto.createHash("sha256").update(typeof s === "string" ? s : JSON.stringify(s)).digest("hex");

// map minutes-to-first-pitch to the nearest target window label (pregame only).
export function lineupWindow(minutes) {
  if (!Number.isFinite(minutes)) return "unknown";
  if (minutes < 0) return "postgame";
  if (minutes <= 22) return "T-15m";
  if (minutes <= 45) return "T-30m";
  if (minutes <= 120) return "T-1h";
  if (minutes <= 270) return "T-3h";
  if (minutes <= 540) return "T-6h";
  return "T-24h";
}

async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "gtp-pregame-lineup/1" } });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, 500 * (i + 1))); }
  }
}

function teamLineup(box) {
  const order = box?.battingOrder || [];
  const players = box?.players || {};
  const lineup = order.map((id, i) => {
    const p = players["ID" + id];
    return { playerId: id, name: p?.person?.fullName ?? null, position: p?.position?.abbreviation ?? null, battingOrderSlot: i + 1, battingOrderCode: p?.battingOrder ?? null };
  });
  return { posted: lineup.length >= 9, count: lineup.length, lineup };
}

// scratches: players present in the latest PRIOR posted snapshot but absent from the current lineup.
function detectScratches(outDir, gamePk, current) {
  if (!fs.existsSync(outDir)) return [];
  const priors = fs.readdirSync(outDir).filter((f) => f.startsWith(`${gamePk}-`) && f.endsWith(".json")).sort();
  if (!priors.length) return [];
  const prev = (() => { try { return JSON.parse(fs.readFileSync(path.join(outDir, priors[priors.length - 1]), "utf8")); } catch { return null; } })();
  if (!prev) return [];
  const curIds = new Set([...(current.home.lineup || []), ...(current.away.lineup || [])].map((p) => p.playerId));
  const prevIds = [...(prev.home?.lineup || []), ...(prev.away?.lineup || [])];
  const scratched = [];
  for (const p of prevIds) if (p.playerId && !curIds.has(p.playerId) && (current.home.posted || current.away.posted)) scratched.push({ playerId: p.playerId, name: p.name, wasSlot: p.battingOrderSlot });
  return scratched;
}

async function main() {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--write");
  const di = args.indexOf("--date");
  const date = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[di + 1] || "") ? args[di + 1] : new Date().toISOString().slice(0, 10);
  const capturedAt = new Date().toISOString();

  let sched;
  try { sched = await fetchJson(`${HOST}/api/v1/schedule?sportId=1&date=${date}`); }
  catch (e) { console.error(`[lineup] schedule fetch failed (${String(e).slice(0, 60)}) — nothing written`); return; }
  const games = sched?.dates?.[0]?.games || [];
  if (!games.length) { console.log(`[lineup] no games on ${date}`); return; }

  const outDir = path.join(OUT, date);
  let wrote = 0, posted = 0, eligible = 0, totalScratches = 0;
  const byWindow = {};
  for (const g of games) {
    const eventStartTime = g.gameDate;
    let feed;
    try { feed = await fetchJson(`${HOST}/api/v1.1/game/${g.gamePk}/feed/live`); }
    catch { console.log(`  [lineup] gamePk ${g.gamePk}: feed fetch failed — skipped`); continue; }
    const home = teamLineup(feed?.liveData?.boxscore?.teams?.home);
    const away = teamLineup(feed?.liveData?.boxscore?.teams?.away);
    const minutesToFirstPitch = eventStartTime ? Math.round((Date.parse(eventStartTime) - Date.parse(capturedAt)) / 60000) : null;
    const window = lineupWindow(minutesToFirstPitch);
    const researchEligible = minutesToFirstPitch != null && minutesToFirstPitch > 0;
    const scratches = detectScratches(outDir, g.gamePk, { home, away });
    byWindow[window] = (byWindow[window] || 0) + 1;
    if (home.posted || away.posted) posted++;
    if (researchEligible) eligible++;
    totalScratches += scratches.length;
    const record = {
      schemaVersion: SCHEMA_VERSION, public: false, approvedForProduction: false, productEligible: false,
      family: "confirmed_lineup", gamePk: g.gamePk, date, capturedAt, availableAt: capturedAt, eventStartTime,
      minutesToFirstPitch, window, researchEligible,
      eligibilityReason: researchEligible ? "captured before first pitch" : "captured at/after first pitch — ineligible",
      lineupPosted: home.posted && away.posted, home, away, scratches,
      leakageRule: "immutable timestamped snapshot; researchEligible requires capturedAt < eventStartTime; no postgame info",
      provenance: { source: `${HOST}/api/v1.1/game/${g.gamePk}/feed/live (boxscore.battingOrder)`, capturedAt },
    };
    record.recordHash = sha({ ...record, capturedAt: undefined, availableAt: undefined, minutesToFirstPitch: undefined, window: undefined, recordHash: undefined });
    // ONLY pregame-eligible snapshots are persisted — a postgame/in-progress capture is never stored (no leakage).
    if (WRITE && researchEligible) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, `${g.gamePk}-${capturedAt.replace(/[:.]/g, "-")}.json`), JSON.stringify(record, null, 2));
      wrote++;
    }
  }
  console.log(`[lineup] ${WRITE ? "WROTE" : "DRY-RUN"} ${date}: ${games.length} games · both-lineups-posted ${posted} · eligible ${eligible} · scratches ${totalScratches} · windows ${JSON.stringify(byWindow)}${WRITE ? ` · wrote ${wrote} (pregame-eligible only)` : ""}`);
  if (!WRITE) console.log(`[lineup] dry-run — pass --write to persist a timestamped snapshot per game`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main().catch((e) => { console.error("[lineup] fatal:", e); process.exit(1); });

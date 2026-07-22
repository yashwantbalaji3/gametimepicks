/**
 * capture-mlb-pregame-matchup.mjs — INTERNAL pregame BATTER-MATCHUP context (research-only).
 *
 * Probable-starter handedness + (when the lineup is posted) each batter's handedness, batting-order position, and
 * the platoon relationship vs the OPPOSING starter. All are static/pregame facts (handedness) or pregame states
 * (posted lineup) — never postgame. No prediction; this is context, not a projection.
 *
 * Reads the latest pregame-eligible LINEUP snapshot (from capture-mlb-pregame-lineup.mjs) for batter IDs, so it
 * fills in as lineups post across the pregame windows. Handedness is batch-fetched (people?personIds=) + cached.
 *
 * Output: data/internal/mlb/pregame-archive/pregame-features/matchup/<date>/<gamePk>.json (internal). Free StatsAPI.
 *
 *   node app/scripts/capture-mlb-pregame-matchup.mjs --date 2026-07-22            # dry-run
 *   node app/scripts/capture-mlb-pregame-matchup.mjs --date 2026-07-22 --write    # persist
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCH = path.join(REPO, "data/internal/mlb/pregame-archive");
const OUT = path.join(ARCH, "pregame-features/matchup");
const LINEUP = path.join(ARCH, "pregame-features/lineup");
const HOST = "https://statsapi.mlb.com";
const SCHEMA_VERSION = "mlb-pregame-matchup-1";
const sha = (s) => crypto.createHash("sha256").update(typeof s === "string" ? s : JSON.stringify(s)).digest("hex");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

// platoon relationship for a batter vs the opposing starter's throwing hand (research label, not a prediction).
export function platoon(batSide, pitchHand) {
  if (!batSide || !pitchHand) return "unknown";
  if (batSide === "S") return "switch-advantage";
  return batSide !== pitchHand ? "platoon-advantage" : "same-hand";
}

async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "gtp-pregame-matchup/1" } });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, 500 * (i + 1))); }
  }
}

function latestLineup(date, gamePk) {
  const dir = path.join(LINEUP, date);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(`${gamePk}-`) && f.endsWith(".json")).sort();
  for (let i = files.length - 1; i >= 0; i--) { const r = readJson(path.join(dir, files[i])); if (r && r.researchEligible) return r; }
  return null;
}

async function batchHandedness(ids) {
  const hand = new Map();
  const uniq = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 40) {
    const chunk = uniq.slice(i, i + 40);
    try { const j = await fetchJson(`${HOST}/api/v1/people?personIds=${chunk.join(",")}`); for (const p of j.people || []) hand.set(p.id, { batSide: p.batSide?.code ?? null, pitchHand: p.pitchHand?.code ?? null }); } catch { /* leave missing */ }
  }
  return hand;
}

async function main() {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--write");
  const di = args.indexOf("--date");
  const date = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[di + 1] || "") ? args[di + 1] : new Date().toISOString().slice(0, 10);
  const capturedAt = new Date().toISOString();

  let sched;
  try { sched = await fetchJson(`${HOST}/api/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher`); }
  catch (e) { console.error(`[matchup] schedule fetch failed (${String(e).slice(0, 60)})`); return; }
  const games = sched?.dates?.[0]?.games || [];
  if (!games.length) { console.log(`[matchup] no games on ${date}`); return; }

  // collect all ids needing handedness (probables + any posted lineup batters), then batch-fetch once.
  const ids = [];
  const perGame = games.map((g) => {
    const hp = g.teams?.home?.probablePitcher, ap = g.teams?.away?.probablePitcher;
    const lu = latestLineup(date, g.gamePk);
    const homeBatters = lu?.home?.lineup || [], awayBatters = lu?.away?.lineup || [];
    ids.push(hp?.id, ap?.id, ...homeBatters.map((b) => b.playerId), ...awayBatters.map((b) => b.playerId));
    return { g, hp, ap, lu, homeBatters, awayBatters };
  });
  const hand = await batchHandedness(ids);

  let wrote = 0, eligible = 0, withBatters = 0;
  for (const { g, hp, ap, homeBatters, awayBatters } of perGame) {
    const eventStartTime = g.gameDate;
    const researchEligible = eventStartTime ? capturedAt < eventStartTime : false;
    const homeSP = { id: hp?.id ?? null, name: hp?.fullName ?? null, pitchHand: hp?.id ? hand.get(hp.id)?.pitchHand ?? null : null };
    const awaySP = { id: ap?.id ?? null, name: ap?.fullName ?? null, pitchHand: ap?.id ? hand.get(ap.id)?.pitchHand ?? null : null };
    const mkBatters = (list, oppHand) => list.map((b) => { const bs = hand.get(b.playerId)?.batSide ?? null; return { playerId: b.playerId, name: b.name, battingOrderSlot: b.battingOrderSlot, batSide: bs, platoonVsOpposingSP: platoon(bs, oppHand) }; });
    const homeBattersM = mkBatters(homeBatters, awaySP.pitchHand);
    const awayBattersM = mkBatters(awayBatters, homeSP.pitchHand);
    if (homeBattersM.length || awayBattersM.length) withBatters++;
    if (researchEligible) eligible++;
    const record = {
      schemaVersion: SCHEMA_VERSION, public: false, approvedForProduction: false, productEligible: false,
      family: "batter_matchup", gamePk: g.gamePk, date, capturedAt, availableAt: capturedAt, eventStartTime,
      researchEligible, eligibilityReason: researchEligible ? "captured pregame; handedness is static, lineup is a pregame state" : "captured at/after first pitch",
      homeStartingPitcher: homeSP, awayStartingPitcher: awaySP,
      homeBatters: homeBattersM, awayBatters: awayBattersM,
      lineupPosted: homeBattersM.length >= 9 && awayBattersM.length >= 9,
      leakageRule: "handedness = static player fact; batting order + batters come from the pregame-eligible lineup snapshot; no postgame info",
      roadmap: "season vs-L/vs-R splits + recent hitting form are the next matchup additions (per-batter, best captured once per day after the lineup posts)",
      provenance: { source: `${HOST} schedule(hydrate=probablePitcher) + people?personIds= (handedness) + pregame lineup snapshot`, capturedAt },
    };
    record.recordHash = sha({ ...record, capturedAt: undefined, availableAt: undefined, provenance: undefined, recordHash: undefined });
    if (WRITE && researchEligible) { const dir = path.join(OUT, date); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${g.gamePk}.json`), JSON.stringify(record, null, 2)); wrote++; }
  }
  console.log(`[matchup] ${WRITE ? "WROTE" : "DRY-RUN"} ${date}: ${games.length} games · eligible ${eligible} · with-batters ${withBatters} (lineup-dependent)${WRITE ? ` · wrote ${wrote}` : ""}`);
  if (!WRITE) console.log(`[matchup] dry-run — pass --write to persist pregame-features/matchup/${date}/`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main().catch((e) => { console.error("[matchup] fatal:", e); process.exit(1); });

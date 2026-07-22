/**
 * capture-mlb-pregame-opponent-defense.mjs — INTERNAL pregame OPPONENT DEFENSIVE CONTEXT (team SEASON fielding).
 * For every team on the slate we capture that team's own season defense — this is the "opponent defensive context"
 * for the batters facing them (errors / fielding% / range / double plays / catcher control). Immutable, timestamped,
 * multi-cadence per gamePk+teamId+capturedAt. Free StatsAPI. No modeling, no prediction, no money.
 *
 * Season fielding is a season-to-date aggregate; captured strictly pregame it cannot include the game under study.
 * Output: pregame-features/opponent-defense/<date>/<gamePk>-<teamId>-<capturedAt>.json (internal, eligible-only).
 *
 *   node app/scripts/capture-mlb-pregame-opponent-defense.mjs --date 2026-07-23            # dry-run
 *   node app/scripts/capture-mlb-pregame-opponent-defense.mjs --date 2026-07-23 --write    # persist
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { teamUniverse } from "./capture-mlb-pregame-team-offensive-form.mjs";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCH = path.join(REPO, "data/internal/mlb/pregame-archive");
const OUT = path.join(ARCH, "pregame-features/opponent-defense");
const HOST = "https://statsapi.mlb.com";
const SCHEMA_VERSION = "mlb-pregame-opponent-defense-1";
const sha = (s) => crypto.createHash("sha256").update(typeof s === "string" ? s : JSON.stringify(s)).digest("hex");
/** parse a StatsAPI stat field: absent/empty → null (NEVER fabricate); string decimals like ".984" parse fine. */
const f = (o, k) => { const v = o?.[k]; if (v == null || v === "") return null; const num = Number(v); return Number.isFinite(num) ? num : null; };

async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "gtp-pregame-opp-defense/1" } });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, 500 * (i + 1))); }
  }
}

/** the team's season fielding split → capture reliable defensive metrics (absent fields recorded as null). */
function fielding(stat) {
  return {
    gamesPlayed: f(stat, "gamesPlayed"), games: f(stat, "games"), innings: f(stat, "innings"),
    errors: f(stat, "errors"), throwingErrors: f(stat, "throwingErrors"), fieldingPct: f(stat, "fielding"),
    assists: f(stat, "assists"), putOuts: f(stat, "putOuts"), chances: f(stat, "chances"),
    doublePlays: f(stat, "doublePlays"), triplePlays: f(stat, "triplePlays"),
    rangeFactorPerGame: f(stat, "rangeFactorPerGame"), rangeFactorPer9Inn: f(stat, "rangeFactorPer9Inn"),
    passedBall: f(stat, "passedBall"), wildPitches: f(stat, "wildPitches"), pickoffs: f(stat, "pickoffs"),
    // fielding-group baserunning = what the defense ALLOWS / suppresses
    caughtStealing: f(stat, "caughtStealing"), stolenBasesAllowed: f(stat, "stolenBases"),
    stolenBasePctAllowed: f(stat, "stolenBasePercentage"), caughtStealingPct: f(stat, "caughtStealingPercentage"),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--write");
  const di = args.indexOf("--date");
  const date = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[di + 1] || "") ? args[di + 1] : new Date().toISOString().slice(0, 10);
  const season = date.slice(0, 4);
  const capturedAt = new Date().toISOString();

  let universe = [];
  try { universe = await teamUniverse(date); } catch (e) { console.log(`[opp-defense] schedule fetch failed for ${date}: ${e.message}`); return; }
  if (!universe.length) { console.log(`[opp-defense] no games scheduled for ${date}`); return; }
  const outDir = path.join(OUT, date);

  let wrote = 0, eligible = 0, fetched = 0, withData = 0;
  for (const t of universe) {
    const key = `${t.gamePk}-${t.teamId}`;
    let stat = null;
    try { const j = await fetchJson(`${HOST}/api/v1/teams/${t.teamId}/stats?stats=season&group=fielding&season=${season}`); stat = j.stats?.[0]?.splits?.[0]?.stat || null; fetched++; } catch { stat = null; }
    const fld = fielding(stat);
    const hasData = stat != null && fld.gamesPlayed != null;
    if (hasData) withData++;
    // season-to-date aggregate captured strictly before first pitch cannot include the game under study.
    const researchEligible = t.eventStartTime ? capturedAt < t.eventStartTime : false;
    // leakage assert: an eligible record MUST have been captured strictly pregame.
    if (researchEligible && !(t.eventStartTime && capturedAt < t.eventStartTime)) throw new Error(`[opp-defense] leakage: ${key} marked eligible but not captured pregame`);
    const record = {
      schemaVersion: SCHEMA_VERSION, public: false, approvedForProduction: false, productEligible: false,
      family: "opponent_defense", gamePk: t.gamePk, teamId: t.teamId, name: t.name, side: t.side, date, capturedAt, availableAt: capturedAt, eventStartTime: t.eventStartTime,
      researchEligible, hasData,
      eligibilityReason: !t.eventStartTime ? "no event start time" : !researchEligible ? "captured at/after first pitch" : "captured pregame; season aggregate excludes the game under study",
      fielding: fld,
      leakageRule: "season-to-date fielding captured strictly before first pitch (capturedAt < eventStartTime); no future game included",
      provenance: { source: `${HOST}/api/v1/teams/<id>/stats?stats=season&group=fielding&season=${season}`, note: "fielding-group stolenBases/caughtStealing are allowed-by-defense; fieldingPct=stat.fielding", capturedAt },
    };
    record.recordHash = sha({ ...record, capturedAt: undefined, availableAt: undefined, provenance: undefined, recordHash: undefined });
    if (record.researchEligible) eligible++;
    // Multi-cadence, eligible-only: key by gamePk+teamId+capturedAt so multiple pregame captures are preserved and
    // the assembler can pick the FRESHEST eligible one. Only persist eligible.
    if (WRITE && record.researchEligible) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, `${key}-${capturedAt.replace(/[:.]/g, "-")}.json`), JSON.stringify(record, null, 2)); wrote++; }
  }
  console.log(`[opp-defense] ${WRITE ? "WROTE" : "DRY-RUN"} ${date}: ${universe.length} team-slots · fetched ${fetched} · withData ${withData} · eligible ${eligible}${WRITE ? ` · wrote ${wrote}` : ""}`);
  if (!WRITE) console.log(`[opp-defense] dry-run — pass --write to persist pregame-features/opponent-defense/${date}/`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main().catch((e) => { console.error("[opp-defense] fatal:", e); process.exit(1); });

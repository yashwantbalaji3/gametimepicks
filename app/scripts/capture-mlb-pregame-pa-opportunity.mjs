/**
 * capture-mlb-pregame-pa-opportunity.mjs — INTERNAL pregame PLATE-APPEARANCE OPPORTUNITY (research-only).
 *
 * A DERIVED family (no new StatsAPI fetches): combines the batter's historical PA/game (from the already-captured
 * batter_form family) with the batting-order slot (from the confirmed_lineup family, when posted) and a documented
 * league-average projected-PA-by-slot reference. No fabrication — projectedPA is null until the slot is known, and
 * the slot table is a documented reference (not a model output). No prediction.
 *
 * Output: data/internal/mlb/pregame-archive/pregame-features/pa-opportunity/<date>/<playerId>.json (internal).
 *
 *   node app/scripts/capture-mlb-pregame-pa-opportunity.mjs --date 2026-07-22 --write
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { batterUniverse } from "./capture-mlb-pregame-batter-splits.mjs";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCH = path.join(REPO, "data/internal/mlb/pregame-archive");
const FEAT = path.join(ARCH, "pregame-features");
const OUT = path.join(FEAT, "pa-opportunity");
const SCHEMA_VERSION = "mlb-pregame-pa-opportunity-1";
const sha = (s) => crypto.createHash("sha256").update(typeof s === "string" ? s : JSON.stringify(s)).digest("hex");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

// documented approximate league-average plate appearances by lineup slot (reference, NOT a model output).
export const PA_BY_SLOT = { 1: 4.65, 2: 4.55, 3: 4.45, 4: 4.35, 5: 4.25, 6: 4.1, 7: 4.0, 8: 3.9, 9: 3.75 };

function latestLineupSlot(date, gamePk, playerId) {
  const dir = path.join(FEAT, "lineup", date);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(`${gamePk}-`) && f.endsWith(".json")).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const r = readJson(path.join(dir, files[i]));
    if (!r?.researchEligible) continue;
    for (const side of ["home", "away"]) for (const b of r[side]?.lineup || []) if (b.playerId === playerId) return b.battingOrderSlot;
  }
  return null;
}

function main() {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--write");
  const di = args.indexOf("--date");
  const date = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[di + 1] || "") ? args[di + 1] : new Date().toISOString().slice(0, 10);
  const capturedAt = new Date().toISOString();

  const universe = batterUniverse(path.join(ARCH, "settlement-joins", date));
  if (!universe.size) { console.log(`[pa] no batter-market players for ${date}`); return; }
  const outDir = path.join(OUT, date);

  let wrote = 0, eligible = 0, withSlot = 0, withHist = 0;
  for (const b of universe.values()) {
    const form = readJson(path.join(FEAT, "batter-form", date, `${b.playerId}.json`));
    const l30 = form?.last30;
    const historicalPaPerGame = l30 && l30.games ? +(l30.pa / l30.games).toFixed(2) : null;
    const slot = latestLineupSlot(date, b.gamePk, b.playerId);
    const projectedPA = slot != null ? PA_BY_SLOT[slot] ?? null : null;
    const researchEligible = b.eventStartTime ? capturedAt < b.eventStartTime : false;
    if (historicalPaPerGame != null) withHist++;
    if (slot != null) withSlot++;
    const record = {
      schemaVersion: SCHEMA_VERSION, public: false, approvedForProduction: false, productEligible: false,
      family: "plate_appearance_opportunity", playerId: b.playerId, name: b.name, gamePk: b.gamePk, date, capturedAt, availableAt: capturedAt, eventStartTime: b.eventStartTime,
      researchEligible, eligibilityReason: researchEligible ? "derived from pregame families" : "captured at/after first pitch",
      battingOrderSlot: slot, projectedPA, historicalPaPerGame,
      availability: slot == null ? "slot pending (lineup not posted) — projectedPA null until posted" : "slot known",
      source: "DERIVED — historicalPaPerGame from batter_form (last 30 strictly-earlier games); projectedPA from a documented league-average PA-by-slot reference (PA_BY_SLOT); no fabrication.",
      updatePolicy: "recompute as the lineup posts; refine the PA-by-slot reference from historical data in a later pass.",
      leakageRule: "inputs are pregame families only (form = strictly-earlier games; slot = pregame lineup snapshot)",
    };
    record.recordHash = sha({ ...record, capturedAt: undefined, availableAt: undefined, recordHash: undefined });
    if (researchEligible) eligible++;
    if (WRITE && researchEligible) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, `${b.playerId}.json`), JSON.stringify(record, null, 2)); wrote++; }
  }
  console.log(`[pa] ${WRITE ? "WROTE" : "DRY-RUN"} ${date}: ${universe.size} batters · eligible ${eligible} · with-slot ${withSlot} · with-historical-PA ${withHist}${WRITE ? ` · wrote ${wrote}` : ""}`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();

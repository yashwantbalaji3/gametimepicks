#!/usr/bin/env node
/**
 * FORECAST INPUT STATE — did the team forecast and the player board see the same world?
 *
 *   node app/scripts/ops/forecast-input-state.mjs --now <ISO> [--json <path>]
 *
 * ⚠ THE FACT THIS EXISTS TO SURFACE (measured 2026-09-25).
 *
 * The NFL player boards read participation, rosters, injuries and role shares — 57 players are
 * currently excluded as Out or Injured Reserve, and the filter runs before depth ranking so the
 * backups move up. The NFL public TEAM forecast reads calibration, schedule, markets and history.
 * Every read call in that producer was enumerated: it opens no participation, injuries, roster or
 * role-share artifact at all.
 *
 * So the same game can be published twice from two different worlds. Jayden Daniels is Out in our
 * own injuries capture, removed from our own player board, and the Washington win probability was
 * computed without knowing it. The player row and the team number do not contradict each other
 * arithmetically — they simply are not about the same team.
 *
 * ⚠ AND THIS REPORT DOES NOT FIX IT, DELIBERATELY. The team heads are validated Elo models with
 * replay receipts; giving them an availability term is a model change that needs its own evidence,
 * and inventing a "QB out" adjustment here would be exactly the unvalidated edit the model-status
 * discipline forbids. What was missing was not the adjustment — it was anyone being able to SEE the
 * exposure per game. This measures it: which forecasts are blind, to whom, and how much of that
 * team's projected work those players held.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = path.resolve(APP, "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const NOW = arg("now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(2); }

/** Producers whose inputs decide whether a forecast can know a player is unavailable. */
const AVAILABILITY_INPUTS = /participation|injuries\/|rosters\/latest|role-shares/;
function consumesAvailability(scriptRel) {
  const p = path.join(APP, scriptRel);
  if (!fs.existsSync(p)) return null;
  const src = fs.readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  return AVAILABILITY_INPUTS.test(src);
}

/* Exclusions, by event, from the canonical participation artifacts. */
function exclusionsByEvent() {
  const base = path.join(ROOT, "data/internal/nfl/participation");
  const out = new Map();
  if (!fs.existsSync(base)) return out;
  for (const day of fs.readdirSync(base)) {
    const dd = path.join(base, day);
    if (!fs.statSync(dd).isDirectory()) continue;
    for (const f of fs.readdirSync(dd)) {
      if (!/^\d+\.json$/.test(f)) continue;
      const a = read(path.join(dd, f));
      if (!a?.providerEventId) continue;
      const byPlayer = new Map();
      for (const e of a.excludedIneligible ?? []) {
        const k = e.playerId;
        if (!byPlayer.has(k)) byPlayer.set(k, { playerId: e.playerId, name: e.name, team: e.team, state: e.status, statedAt: e.statedAt, families: [] });
        byPlayer.get(k).families.push(e.market);
      }
      out.set(a.providerEventId, { injuriesAsOf: a.injuriesAsOf ?? null, inputHash: a.inputHash ?? null, excluded: [...byPlayer.values()] });
    }
  }
  return out;
}

/*
 * ⚠ MATERIALITY IS A ROLE CLAIM, NOT A NAME. "A quarterback is out" matters because passAttempts is
 * the input the whole offence is projected through, not because the reader has heard of him — so it
 * is derived from the FAMILIES the participation artifact excluded him from, which is the same
 * evidence the boards used. No opinion about any player enters here.
 */
const MATERIAL_FAMILIES = new Set(["passAttempts"]);
const isMaterial = (p) => p.families.some((f) => MATERIAL_FAMILIES.has(f));

const teamBlind = consumesAvailability("scripts/nfl/build-nfl-public-forecasts.mjs") === false;
const boardsAware = consumesAvailability("scripts/nfl/build-nfl-player-board.mjs") === true;
const forecasts = read(path.join(APP, "public/data/nfl/forecasts/latest.json"));
const excl = exclusionsByEvent();

const events = [];
for (const f of forecasts?.forecasts ?? []) {
  if (Date.parse(f.kickoffUtc ?? "") <= Date.parse(NOW)) continue;
  const e = excl.get(f.providerEventId) ?? { injuriesAsOf: null, inputHash: null, excluded: [] };
  events.push({
    sport: "nfl",
    eventId: f.providerEventId,
    matchup: f.matchup,
    kickoffUtc: f.kickoffUtc,
    forecastSnapshot: { model: f.model?.id ?? null, version: f.model?.version ?? null, inputHash: f.model?.inputHash ?? null, simulations: f.model?.simulations ?? null, generatedAt: f.generatedAt ?? forecasts?.generatedAt ?? null },
    availability: {
      consumedByTeamForecast: !teamBlind,
      consumedByPlayerBoards: boardsAware,
      snapshotAsOf: e.injuriesAsOf,
      participationInputHash: e.inputHash,
      excludedCount: e.excluded.length,
      materialExclusions: e.excluded.filter(isMaterial).map((p) => ({ name: p.name, team: p.team, state: p.state, statedAt: p.statedAt, families: p.families })),
      excluded: e.excluded.map((p) => ({ name: p.name, team: p.team, state: p.state, families: p.families })),
    },
    coherent: !teamBlind || e.excluded.length === 0,
  });
}

const blind = events.filter((e) => !e.coherent);
const material = events.filter((e) => e.availability.materialExclusions.length > 0);
const report = {
  schemaVersion: 1,
  artifact: "forecast-input-state",
  dataClass: "INTERNAL_RESEARCH",
  generatedAt: NOW,
  question: "Do the team forecast and the player board for one game share an availability world?",
  nfl: {
    teamForecastConsumesAvailability: !teamBlind,
    playerBoardsConsumeAvailability: boardsAware,
    upcomingEvents: events.length,
    eventsWhereTeamForecastIsBlindToAnExclusion: blind.length,
    eventsWithAMaterialExclusion: material.length,
    note: teamBlind
      ? "The team head is an Elo family with replay receipts and no availability term. Giving it one is a model change requiring its own evidence; this records the exposure rather than inventing an adjustment."
      : "The team forecast consumes availability.",
  },
  events,
};

console.log(`nfl team forecast consumes availability: ${!teamBlind}  ·  player boards: ${boardsAware}`);
console.log(`upcoming events: ${events.length}  ·  blind to at least one exclusion: ${blind.length}  ·  carrying a MATERIAL exclusion: ${material.length}`);
for (const e of material) {
  const who = e.availability.materialExclusions.map((p) => `${p.name} (${p.team}, ${p.state})`).join("; ");
  console.log(`  ${e.matchup.padEnd(12)} ${who}`);
}

const out = arg("json");
if (out) { fs.mkdirSync(path.dirname(path.join(ROOT, out)), { recursive: true }); fs.writeFileSync(path.join(ROOT, out), `${JSON.stringify(report, null, 2)}\n`); console.log(`\nwrote ${out}`); }

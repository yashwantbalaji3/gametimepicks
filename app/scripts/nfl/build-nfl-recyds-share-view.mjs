#!/usr/bin/env node
/**
 * NFL RECEIVING-YARDS SHARE VIEW (ledger N8 parity fix). PRIVATE_RESEARCH.
 *
 * Writes data/internal/research/nfl/role-shares-v1/receiving-yards-view.json beside current.json: each team's target
 * shares as the role-share builder estimated them, BEFORE its roster-wide Σ>1 normalisation (the rule the props-v1
 * evaluator never applied). Only run-nfl-event-window.mjs reads it, for player_reception_yds alone; every other
 * consumer keeps reading current.json, which this script never writes.
 *
 * It does not edit or import build-nfl-role-shares.mjs (a frozen component of the served forward-test series): it
 * re-derives the raw list from the same committed corpus + roster and PROVES it, team by team — the builder's own
 * normalisation of the raw list must reproduce current.json's targets players exactly, or the team is left out
 * (unreproducedTeams) and its receiving yards are withheld by the event window.
 *
 * Usage: node scripts/nfl/build-nfl-recyds-share-view.mjs   (run right after build-nfl-role-shares.mjs; no clock read)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SHARE_FAMILIES, familyNumerator, teamGameTotals, decayedShare } from "../../src/lib/sports/nfl/role-shares.mjs";
import { viewFromCorpus } from "../../src/lib/sports/nfl/receiving-yards-share-view.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const readMaybe = (p) => { try { return read(p); } catch { return null; } };

const current = read(path.join(ROOT, "data/internal/research/nfl/role-shares-v1/current.json"));
const roster = read(path.join(APP, "public/data/nfl/rosters/latest.json"));
if ((roster.sourceAsOf ?? roster.generatedAt) !== current.rosterAsOf) {
  console.error(`REFUSED: roster capture ${roster.sourceAsOf ?? roster.generatedAt} is not the one current.json was built from (${current.rosterAsOf}) — run right after build-nfl-role-shares.mjs`);
  process.exit(2);
}
const historicalGames = [2023, 2024, 2025].flatMap((s) => read(path.join(ROOT, `data/internal/research/nfl/player-events-v1/${s}.json`)).games);
const currentPartition = readMaybe(path.join(ROOT, "data/internal/research/nfl/player-events-v1/2026.json"));
if ((currentPartition?.contentHash ?? null) !== (current.currentSeason?.contentHash ?? null)) {
  console.error(`REFUSED: 2026 partition ${currentPartition?.contentHash} is not the one current.json folded (${current.currentSeason?.contentHash})`);
  process.exit(2);
}
const view = viewFromCorpus({ current, historicalGames, currentGames: currentPartition?.games ?? [], roster, shares: { SHARE_FAMILIES, familyNumerator, teamGameTotals, decayedShare } });
fs.writeFileSync(path.join(ROOT, "data/internal/research/nfl/role-shares-v1/receiving-yards-view.json"), JSON.stringify(view, null, 1));
const normalised = Object.values(view.teams).filter((t) => t.targets.sharedArtifactNormalised).length;
console.log(`recyds share view: ${Object.keys(view.teams).length} team(s) reproduced, ${normalised} normalised in current.json; unreproduced: ${view.unreproducedTeams.join(", ") || "none"}`);
if (view.unreproducedTeams.length) console.log(`::error::RECYDS_VIEW_UNREPRODUCED receiving-yards view could not reproduce current.json for ${view.unreproducedTeams.join(", ")} — their receiving yards are withheld`);

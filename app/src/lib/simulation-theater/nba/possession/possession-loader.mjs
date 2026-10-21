/**
 * NBA SIMULATION THEATER · POSSESSION PLAYBACK · BUILD-TIME LOADER (server only: node:fs). READ ONLY. Fail closed.
 *
 * Reads the private possession artifact (artifact-contract.mjs path) and RE-VALIDATES EVERY STORED RUN before anything
 * renders — it trusts nothing the generator wrote:
 *   - schema / artifact / modelVersion / dataClass match the contract, else NO_ARTIFACT;
 *   - per run: the draw is rebuilt from the stored log (box = foldEvents(events), the stored engine ledger, final,
 *     linescore, OT, notes) and checked with checkPossessionDraw (P1–P11) — any violation → INVARIANT_VIOLATION;
 *     sha256(canonical JSON of the fold) must equal the stored boxDigest → BOX_DIGEST;
 *   - the official snapshot is rebuilt from the committed v0.1 file (the Theater loader's own call); its snapshotId
 *     must equal the one the runs were selected against → OFFICIAL_CHANGED (a new official forecast means the default
 *     run must be re-selected, never silently kept); the default run must be won by the official favoured side.
 * Then it returns the client payload (payload.mjs) and the team palettes. Nothing is written.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { POSSESSION_ARTIFACT, POSSESSION_ARTIFACT_SCHEMA, ledgerColumns, possessionArtifactPath } from "./artifact-contract.mjs";
import { buildPlaybackPayload } from "./payload.mjs";
import { POSSESSION_RUN_KIND } from "./selection.mjs";
import { POSSESSION_ENGINE_ID } from "./labels.mjs";
import { checkPossessionDraw } from "../../../sports/nba/research/possession-sim/invariants.mjs";
import { boxToJson, foldEvents } from "../../../sports/nba/research/possession-sim/events.mjs";
import { canonicalJson, sha256 } from "../../../sports/nba/forecast-receipt.mjs";
import { nbaOfficial } from "../../official-representative.mjs";
import { nbaPalette } from "../nba-team-colors.mjs";
import { NBA_THEATER_DATE, officialArtifactSource, readArtifact, readTeamColors, v1ArtifactSource } from "../loader.mjs";

export const MAX_POSSESSION_EVENTS = 3;

const fail = (eventId, code, reason) => ({ eventId: String(eventId), ok: false, error: { code, reason }, payload: null, palettes: null });

/** Rebuild a stored run as an engine draw (for the checker). */
export function drawFromStoredRun(run, rosters) {
  const cols = ledgerColumns();
  return {
    runIndex: run.runIndex, events: run.events, box: foldEvents(run.events, rosters),
    ledger: run.ledger.map((side) => side.map((row) => Object.fromEntries(cols.map((k, i) => [k, row[i]])))),
    final: run.final, periods: run.periods, overtimePeriods: run.overtimePeriods, notes: run.notes,
  };
}

/** Every problem with one stored run ([] = valid). */
export function storedRunProblems(run, rosters) {
  const out = [];
  let draw;
  try { draw = drawFromStoredRun(run, rosters); } catch (e) { return [`run ${run?.runIndex}: cannot rebuild (${e.message})`]; }
  for (const v of checkPossessionDraw(draw, rosters)) out.push(`run ${run.runIndex}: ${v}`);
  if (sha256(canonicalJson(boxToJson(draw.box))) !== run.boxDigest) out.push(`run ${run.runIndex}: BOX_DIGEST mismatch`);
  return out;
}

export function readPossessionArtifact(repoRoot, date = NBA_THEATER_DATE) {
  const rel = possessionArtifactPath(date);
  try {
    const bytes = fs.readFileSync(path.join(repoRoot, rel));
    return { file: rel, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), doc: JSON.parse(bytes.toString("utf8")), error: null };
  } catch (e) {
    return { file: rel, sha256: null, doc: null, error: e?.code ?? e?.message ?? "unreadable" };
  }
}

/**
 * @returns {{ eventId, ok, error: {code, reason}|null, payload: object|null, palettes: {team, neutral}|null }}
 */
export function loadNbaPossessionTheater(repoRoot, eventId, { date = NBA_THEATER_DATE, read = null, officialRead = null, supportingRead = null } = {}) {
  const id = String(eventId);
  const a = read ?? readPossessionArtifact(repoRoot, date);
  const doc = a.doc;
  if (!doc) return fail(id, "NO_ARTIFACT", `${a.file}: ${a.error}`);
  if (doc.schema !== POSSESSION_ARTIFACT_SCHEMA || doc.artifact !== POSSESSION_ARTIFACT || doc.modelVersion !== POSSESSION_ENGINE_ID || doc.dataClass !== "PRIVATE_RESEARCH" || doc.productEligible !== false) {
    return fail(id, "NO_ARTIFACT", `${a.file}: not a ${POSSESSION_ARTIFACT_SCHEMA} research artifact`);
  }
  const game = (doc.games ?? []).find((g) => String(g.providerEventId) === id);
  if (!game) return fail(id, "NO_POSSESSION_RUNS", `${id} is not in ${a.file}`);
  const rosters = [game.rosters.home.map((p) => String(p.providerAthleteId)), game.rosters.away.map((p) => String(p.providerAthleteId))];
  const problems = (game.runs ?? []).flatMap((r) => storedRunProblems(r, rosters));
  if (!game.runs?.length) problems.push("no stored runs");
  if (problems.length) return fail(id, "INVARIANT_VIOLATION", problems.slice(0, 6).join("; "));
  const o = officialRead ?? readArtifact(repoRoot, officialArtifactSource(date));
  const s = supportingRead ?? readArtifact(repoRoot, v1ArtifactSource(date));
  const official = nbaOfficial(id, {
    official: o?.artifact ? { doc: o.artifact, path: o.file, sha256: o.sha256 ?? undefined } : null,
    supporting: s?.artifact ? { doc: s.artifact, path: s.file, sha256: s.sha256 ?? undefined } : null,
  });
  const snapshot = official?.snapshot ?? null;
  if (snapshot && snapshot.snapshotId !== game.official?.snapshotId) {
    return fail(id, "OFFICIAL_CHANGED", `official snapshot ${snapshot.snapshotId} ≠ ${game.official?.snapshotId} the runs were selected against: regenerate the possession runs`);
  }
  const def = game.runs.find((r) => r.kind === POSSESSION_RUN_KIND.DEFAULT);
  const side = snapshot?.game?.winner?.side ?? null;
  if (def && side && (def.final[0] > def.final[1] ? "HOME" : "AWAY") !== side) return fail(id, "SIDE_CONSTRAINT", `default run ${def.runIndex} is not won by the official side ${side}`);
  const payload = buildPlaybackPayload(game, snapshot);
  const colors = readTeamColors(repoRoot);
  const palettes = { team: nbaPalette(colors, game.home.abbr, game.away.abbr), neutral: nbaPalette(colors, game.home.abbr, game.away.abbr, { neutral: true }) };
  return { eventId: id, ok: true, error: null, payload, palettes };
}

/** Event ids whose possession theater loads (capped). */
export function possessionRouteEvents(repoRoot, { date = NBA_THEATER_DATE } = {}) {
  const a = readPossessionArtifact(repoRoot, date);
  if (!a.doc) return [];
  return (a.doc.games ?? []).map((g) => String(g.providerEventId)).filter((id) => /^[0-9A-Za-z_-]+$/.test(id))
    .filter((id) => loadNbaPossessionTheater(repoRoot, id, { date, read: a }).ok).slice(0, MAX_POSSESSION_EVENTS);
}

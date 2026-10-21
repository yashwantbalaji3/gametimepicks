/**
 * NBA SIMULATION THEATER · POSSESSION RUNS · STORED-RUN VALIDATION + ARTIFACT READ (server only: node:fs, node:crypto).
 *
 * Shared by both build-time loaders (possession-loader.mjs for the dev route, public-loader.mjs for the public
 * candidate). A stored run is trusted only after it is rebuilt as an engine draw from its own log (box = foldEvents,
 * the stored engine ledger, final, linescore, OT, notes), passes checkPossessionDraw (P1–P11), and its fold hashes to
 * the stored boxDigest.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { POSSESSION_ARTIFACT, POSSESSION_ARTIFACT_SCHEMA, ledgerColumns, possessionArtifactPath } from "./artifact-contract.mjs";
import { POSSESSION_ENGINE_ID } from "./labels.mjs";
import { checkPossessionDraw } from "../../../sports/nba/research/possession-sim/invariants.mjs";
import { boxToJson, foldEvents } from "../../../sports/nba/research/possession-sim/events.mjs";
import { canonicalJson, sha256 } from "../../../sports/nba/forecast-receipt.mjs";

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

export const rostersOfGame = (game) => [game.rosters.home.map((p) => String(p.providerAthleteId)), game.rosters.away.map((p) => String(p.providerAthleteId))];

export function readPossessionArtifact(repoRoot, date) {
  const rel = possessionArtifactPath(date);
  try {
    const bytes = fs.readFileSync(path.join(repoRoot, rel));
    return { file: rel, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), doc: JSON.parse(bytes.toString("utf8")), error: null };
  } catch (e) {
    return { file: rel, sha256: null, doc: null, error: e?.code ?? e?.message ?? "unreadable" };
  }
}

/**
 * The artifact-level and run-level checks both loaders share.
 * @returns {{ ok: true, game, rosters } | { ok: false, code, reason }}
 */
export function validatedGame(read, eventId) {
  const doc = read?.doc;
  if (!doc) return { ok: false, code: "NO_ARTIFACT", reason: `${read?.file}: ${read?.error}` };
  if (doc.schema !== POSSESSION_ARTIFACT_SCHEMA || doc.artifact !== POSSESSION_ARTIFACT || doc.modelVersion !== POSSESSION_ENGINE_ID || doc.dataClass !== "PRIVATE_RESEARCH" || doc.productEligible !== false) {
    return { ok: false, code: "NO_ARTIFACT", reason: `${read.file}: not a ${POSSESSION_ARTIFACT_SCHEMA} research artifact` };
  }
  const game = (doc.games ?? []).find((g) => String(g.providerEventId) === String(eventId));
  if (!game) return { ok: false, code: "NO_POSSESSION_RUNS", reason: `${eventId} is not in ${read.file}` };
  const rosters = rostersOfGame(game);
  const problems = (game.runs ?? []).flatMap((r) => storedRunProblems(r, rosters));
  if (!game.runs?.length) problems.push("no stored runs");
  if (problems.length) return { ok: false, code: "INVARIANT_VIOLATION", reason: problems.slice(0, 6).join("; ") };
  return { ok: true, game, rosters };
}

/** The default run must be won by the official favoured side (the selection's side constraint, re-checked). */
export function sideConstraintProblem(game, favouredSide) {
  const def = (game.runs ?? []).find((r) => r.kind === "default");
  if (!def || !(favouredSide === "HOME" || favouredSide === "AWAY")) return null;
  return (def.final[0] > def.final[1] ? "HOME" : "AWAY") === favouredSide ? null : `default run ${def.runIndex} is not won by the official side ${favouredSide}`;
}

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

import { POSSESSION_ARTIFACT, POSSESSION_ARTIFACT_SCHEMA, POSSESSION_SLATE_HEADER, ledgerColumns, possessionArtifactPath } from "./artifact-contract.mjs";
import { POSSESSION_ENGINE_ID } from "./labels.mjs";
import { checkPossessionDraw } from "../../../sports/nba/research/possession-sim/invariants.mjs";
import { boxToJson, foldEvents } from "../../../sports/nba/research/possession-sim/events.mjs";
import { canonicalJson, sha256 } from "../../../sports/nba/forecast-receipt.mjs";
import { EVENT_CODEC_SCHEMA, unpackEvents } from "./event-codec.mjs";

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

/**
 * The slate's possession artifact, assembled from its per-game files (artifact-contract.mjs possessionGamePath): the
 * shared header + every game, in tip order. `sha256` is over the sorted per-file digests. A file whose header differs
 * from the slate's (another schema, engine or date) makes the whole slate unreadable — never a mixed slate.
 */
export function readPossessionArtifact(repoRoot, date) {
  const rel = possessionArtifactPath(date);
  try {
    const dir = path.join(repoRoot, rel);
    const names = fs.readdirSync(dir).filter((f) => /^[0-9A-Za-z_-]+\.json$/.test(f)).sort();
    if (!names.length) return { file: rel, sha256: null, doc: null, error: "ENOENT: no game files" };
    const files = names.map((f) => { const bytes = fs.readFileSync(path.join(dir, f)); return { f, sha: crypto.createHash("sha256").update(bytes).digest("hex"), doc: JSON.parse(bytes.toString("utf8")) }; });
    const head = files[0].doc;
    for (const x of files) {
      for (const k of POSSESSION_SLATE_HEADER) if (JSON.stringify(x.doc[k]) !== JSON.stringify(head[k])) return { file: rel, sha256: null, doc: null, error: `${x.f}: header ${k} differs from the slate` };
      if (x.doc.engine?.paramsSha256 !== head.engine?.paramsSha256) return { file: rel, sha256: null, doc: null, error: `${x.f}: engine params differ from the slate` };
      if (!x.doc.game || `${x.doc.game.providerEventId}.json` !== x.f) return { file: rel, sha256: null, doc: null, error: `${x.f}: not the file of its own game` };
    }
    const { game: _g, ...header } = head;
    // stored runs carry packed events (event-codec.mjs); every check below and every reader sees the unpacked log
    const unpack = (g) => ({ ...g, runs: (g.runs ?? []).map((r) => (r.events?.schema === EVENT_CODEC_SCHEMA ? { ...r, events: unpackEvents(r.events) } : r)) });
    const games = files.map((x) => unpack(x.doc.game)).sort((a, b) => String(a.dateUtc).localeCompare(String(b.dateUtc)) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
    const sha256 = crypto.createHash("sha256").update(files.map((x) => `${x.f}:${x.sha}`).join("\n")).digest("hex");
    return { file: rel, sha256, doc: { ...header, generatedAt: files.map((x) => x.doc.generatedAt).sort().at(-1), games }, error: null };
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

export const etDateOf = (iso) => (Number.isFinite(Date.parse(iso ?? "")) ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)) : null);

/**
 * THE REPLAY GATE (role C, founder decision 2026-10-21) — one game's stored replay runs, checked against that game's
 * CURRENT official snapshot. The consistency gate (audit.mjs theaterActivationGate) and the public loader both call
 * this, so the page can never publish a game the gate keeps closed. Read-only.
 *   REPLAY_ENGINE_NOT_APPROVED   the artifact's engine is not `approvedEngineId` (theater-gate-policy NBA_THEATER_REPLAY_ENGINE)
 *   NO_REPLAY_RUNS               no artifact / game / runs, or a stored run fails the P1–P11 checker or its digest
 *   REPLAY_POOL_UNCHECKED        the seed pool was not fully checked, or any pool draw violated an invariant
 *   REPLAY_OFFICIAL_CHANGED      the runs were selected against a different official snapshot
 *   REPLAY_SIDE_CONSTRAINT       the default run is not won by the official Elo side
 *   REPLAY_INPUTS_AFTER_FREEZE   the engine's inputs are dated after the OFFICIAL forecast's freeze for the game
 *                                (release owner 2026-10-21, NBA-CC requirement 1 "identical cutoffs": the replay may
 *                                never have later information than the official forecast it is compared with)
 * @param {object|null} read  a readPossessionArtifact result
 * @param {{ snapshotId?: string, frozenAt?: string }|null} snap
 * @returns {{ code: string, detail: string }[]}
 */
export function replayGateProblems(read, eventId, snap, { approvedEngineId }) {
  const id = String(eventId);
  if (!read) return [{ code: "NO_REPLAY_RUNS", detail: "no stored replay runs were read" }];
  if (read.doc && read.doc.modelVersion !== approvedEngineId) return [{ code: "REPLAY_ENGINE_NOT_APPROVED", detail: `${read.doc.modelVersion} is not the approved replay engine ${approvedEngineId}` }];
  const v = validatedGame(read, id);
  if (!v.ok) return [{ code: "NO_REPLAY_RUNS", detail: `${v.code}: ${v.reason}` }];
  const g = v.game, out = [];
  if (!(g.pool?.checkedDraws === g.poolSize && g.pool?.violations === 0)) out.push({ code: "REPLAY_POOL_UNCHECKED", detail: `pool ${g.pool?.checkedDraws ?? "?"} checked of ${g.poolSize ?? "?"}, ${g.pool?.violations ?? "?"} violations` });
  if (!snap?.snapshotId || g.official?.snapshotId !== snap.snapshotId) out.push({ code: "REPLAY_OFFICIAL_CHANGED", detail: `runs selected against ${g.official?.snapshotId ?? "none"}, official is ${snap?.snapshotId ?? "none"} — regenerate the replay runs` });
  const side = sideConstraintProblem(g, g.official?.winnerSide);
  if (side) out.push({ code: "REPLAY_SIDE_CONSTRAINT", detail: side });
  if (!(Date.parse(g.inputAsOf ?? "") <= Date.parse(snap?.frozenAt ?? ""))) out.push({ code: "REPLAY_INPUTS_AFTER_FREEZE", detail: `inputs as of ${g.inputAsOf ?? "?"} vs the official freeze ${snap?.frozenAt ?? "?"}` });
  return out;
}


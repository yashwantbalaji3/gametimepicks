/**
 * NBA SIMULATION THEATER · POSSESSION PLAYBACK · BUILD-TIME LOADER, FULL (dev route + tests; server only). READ ONLY.
 *
 * Re-validates every stored run (stored-run.mjs: rebuild → checkPossessionDraw P1–P11 → box digest), then REBUILDS the
 * official snapshot from the committed v0.1 file (the Theater loader's own call, lib/simulation-theater/nba/loader.mjs)
 * and requires, fail closed:
 *   - its snapshotId equals the one the runs were selected against → else OFFICIAL_CHANGED (a new official forecast
 *     means the default run must be re-selected, never silently kept);
 *   - the official panel embedded in the artifact (what the public candidate renders, public-loader.mjs) equals
 *     officialPanel(rebuilt snapshot) byte for byte → else OFFICIAL_PANEL_DRIFT;
 *   - the default run is won by the official favoured side → else SIDE_CONSTRAINT.
 * The payload's official panel is the REBUILT one. Nothing is written.
 */
import { buildPlaybackPayload, officialPanel } from "./payload.mjs";
import { readPossessionArtifact as readArtifactFile, sideConstraintProblem, validatedGame } from "./stored-run.mjs";
import { nbaOfficial } from "../../official-representative.mjs";
import { nbaPalette } from "../nba-team-colors.mjs";
import { NBA_THEATER_DATE, officialArtifactSource, readArtifact, readTeamColors, v1ArtifactSource } from "../loader.mjs";

export { drawFromStoredRun, storedRunProblems } from "./stored-run.mjs";
export const MAX_POSSESSION_EVENTS = 3;

const fail = (eventId, code, reason) => ({ eventId: String(eventId), ok: false, error: { code, reason }, payload: null, palettes: null });

export const readPossessionArtifact = (repoRoot, date = NBA_THEATER_DATE) => readArtifactFile(repoRoot, date);

/**
 * @returns {{ eventId, ok, error: {code, reason}|null, payload: object|null, palettes: {team, neutral}|null }}
 */
export function loadNbaPossessionTheater(repoRoot, eventId, { date = NBA_THEATER_DATE, read = null, officialRead = null, supportingRead = null } = {}) {
  const id = String(eventId);
  const v = validatedGame(read ?? readPossessionArtifact(repoRoot, date), id);
  if (!v.ok) return fail(id, v.code, v.reason);
  const { game } = v;
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
  const panel = officialPanel(snapshot);
  if (panel && JSON.stringify(panel) !== JSON.stringify(game.official?.panel ?? null)) return fail(id, "OFFICIAL_PANEL_DRIFT", "the official panel embedded in the artifact is not the rebuilt snapshot's");
  const side = sideConstraintProblem(game, panel?.favouredSide ?? null);
  if (side) return fail(id, "SIDE_CONSTRAINT", side);
  const payload = buildPlaybackPayload(game, panel);
  const colors = readTeamColors(repoRoot);
  const palettes = { team: nbaPalette(colors, game.home.abbr, game.away.abbr), neutral: nbaPalette(colors, game.home.abbr, game.away.abbr, { neutral: true }) };
  return { eventId: id, ok: true, error: null, payload, palettes };
}

/** Event ids whose possession theater loads (capped). */
export function possessionRouteEvents(repoRoot, { date = NBA_THEATER_DATE } = {}) {
  const a = readPossessionArtifact(repoRoot, date);
  if (!a.doc) return [];
  return (a.doc.games ?? []).map((g) => String(g.providerEventId)).filter((x) => /^[0-9A-Za-z_-]+$/.test(x))
    .filter((x) => loadNbaPossessionTheater(repoRoot, x, { date, read: a }).ok).slice(0, MAX_POSSESSION_EVENTS);
}

/**
 * NBA SIMULATION THEATER · POSSESSION PLAYBACK · BUILD-TIME LOADER FOR THE PUBLIC CANDIDATE (server only). READ ONLY.
 *
 * The public route reads ONE private file: the possession artifact. While the route is gated OFF it is classified
 * internal (lib/audits/route-inventory.mjs) and the artifact is NOT a build input; the activation commit must reclassify
 * the route public AND add data/internal/research/nba/theater-possession/ to BUILD_INPUTS in
 * scripts/vercel-ignore-build.sh (build-input-coverage.test.mjs enforces the pairing). Every stored run is re-validated exactly as the dev loader does
 * (stored-run.mjs). The OFFICIAL PANEL is the one the generator embedded verbatim from the official snapshot
 * (payload.mjs officialPanel) — the canonical snapshot's numbers, never computed from a run. Its equality with a fresh
 * rebuild from the committed v0.1 file is enforced by the full loader (possession-loader.mjs → OFFICIAL_PANEL_DRIFT)
 * and by possession-theater.test.mjs, so this module does not need the receipt files (which change on every forecast
 * window and are deliberately NOT build inputs).
 */
import fs from "node:fs";
import path from "node:path";

import { buildPlaybackPayload } from "./payload.mjs";
import { etDateOf, readPossessionArtifact, replayGateProblems, sideConstraintProblem, validatedGame } from "./stored-run.mjs";
import { NBA_THEATER_REPLAY_ENGINE } from "../../../consistency/theater-gate-policy.mjs";
import { nbaPalette } from "../nba-team-colors.mjs";

/**
 * THE CURRENT SLATE (release owner 2026-10-21): the public route follows the build's ET date, as the /nba lane does
 * (experimental-public-lane.mjs laneIsCurrent) — a past slate's artifact is never published as current. The possession
 * runs are built per game at its official freeze by the nba-forecast-window tick (build-theater-possession-runs.mjs
 * --incremental), so the day's artifact grows as games freeze. Every game of the slate may publish (NBA: ≤ 15 a night).
 */
export const MAX_PUBLIC_EVENTS = 15;
export const publicTheaterSlate = (now = new Date()) => etDateOf(now instanceof Date ? now.toISOString() : now);
/** A slate date is publishable only while it is the build's ET date or later (never a past slate). */
export const slateIsCurrent = (date, now = new Date()) => Boolean(date) && date >= publicTheaterSlate(now);
const COLORS = "app/src/lib/simulation-theater/nba/nba-team-colors.json";

const fail = (eventId, code, reason) => ({ eventId: String(eventId), ok: false, error: { code, reason }, payload: null, palettes: null });
const readColors = (repoRoot) => { try { return JSON.parse(fs.readFileSync(path.join(repoRoot, COLORS), "utf8")); } catch { return null; } };

export function loadPublicPossessionTheater(repoRoot, eventId, { date = publicTheaterSlate(), read = null } = {}) {
  const id = String(eventId);
  const r = read ?? readPossessionArtifact(repoRoot, date);
  const v = validatedGame(r, id);
  if (!v.ok) return fail(id, v.code, v.reason);
  const { game } = v;
  const panel = game.official?.panel ?? null;
  if (!panel || panel.snapshotId !== game.official?.snapshotId) return fail(id, "NO_OFFICIAL_PANEL", "the artifact carries no official panel for the snapshot its runs were selected against");
  // the SAME replay gate the consistency gate applies (role C, founder decision 2026-10-21), against the embedded panel;
  // its equality with the CURRENT official snapshot is the consistency gate's half (possession-theater.test.mjs pins
  // that every game this loader publishes has theaterActivationGate open)
  const problems = replayGateProblems(r, id, { snapshotId: panel.snapshotId, frozenAt: panel.frozenAt }, { approvedEngineId: NBA_THEATER_REPLAY_ENGINE.id });
  if (problems.length) return fail(id, problems[0].code, problems.map((x) => x.detail).join("; "));
  // and the side the PAGE will print (the embedded panel) must be the side the default run was selected for
  const side = sideConstraintProblem(game, panel.favouredSide);
  if (side) return fail(id, "SIDE_CONSTRAINT", side);
  const colors = readColors(repoRoot);
  return {
    eventId: id, ok: true, error: null,
    payload: buildPlaybackPayload(game, panel),
    palettes: { team: nbaPalette(colors, game.home.abbr, game.away.abbr), neutral: nbaPalette(colors, game.home.abbr, game.away.abbr, { neutral: true }) },
  };
}

export function publicPossessionEvents(repoRoot, { now = new Date(), date = publicTheaterSlate(now) } = {}) {
  if (!slateIsCurrent(date, now)) return [];
  const a = readPossessionArtifact(repoRoot, date);
  if (!a.doc || a.doc.date !== date) return [];
  return (a.doc.games ?? []).map((g) => String(g.providerEventId)).filter((x) => /^[0-9A-Za-z_-]+$/.test(x))
    .filter((x) => loadPublicPossessionTheater(repoRoot, x, { date, read: a }).ok).slice(0, MAX_PUBLIC_EVENTS);
}

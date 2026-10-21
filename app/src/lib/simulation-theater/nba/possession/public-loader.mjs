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
import { readPossessionArtifact, sideConstraintProblem, validatedGame } from "./stored-run.mjs";
import { nbaPalette } from "../nba-team-colors.mjs";

export const PUBLIC_THEATER_DATE = "2026-10-20";
export const MAX_PUBLIC_EVENTS = 3;
const COLORS = "app/src/lib/simulation-theater/nba/nba-team-colors.json";

const fail = (eventId, code, reason) => ({ eventId: String(eventId), ok: false, error: { code, reason }, payload: null, palettes: null });
const readColors = (repoRoot) => { try { return JSON.parse(fs.readFileSync(path.join(repoRoot, COLORS), "utf8")); } catch { return null; } };

export function loadPublicPossessionTheater(repoRoot, eventId, { date = PUBLIC_THEATER_DATE, read = null } = {}) {
  const id = String(eventId);
  const v = validatedGame(read ?? readPossessionArtifact(repoRoot, date), id);
  if (!v.ok) return fail(id, v.code, v.reason);
  const { game } = v;
  const panel = game.official?.panel ?? null;
  if (!panel || panel.snapshotId !== game.official?.snapshotId) return fail(id, "NO_OFFICIAL_PANEL", "the artifact carries no official panel for the snapshot its runs were selected against");
  const side = sideConstraintProblem(game, panel.favouredSide);
  if (side) return fail(id, "SIDE_CONSTRAINT", side);
  const colors = readColors(repoRoot);
  return {
    eventId: id, ok: true, error: null,
    payload: buildPlaybackPayload(game, panel),
    palettes: { team: nbaPalette(colors, game.home.abbr, game.away.abbr), neutral: nbaPalette(colors, game.home.abbr, game.away.abbr, { neutral: true }) },
  };
}

export function publicPossessionEvents(repoRoot, { date = PUBLIC_THEATER_DATE } = {}) {
  const a = readPossessionArtifact(repoRoot, date);
  if (!a.doc) return [];
  return (a.doc.games ?? []).map((g) => String(g.providerEventId)).filter((x) => /^[0-9A-Za-z_-]+$/.test(x))
    .filter((x) => loadPublicPossessionTheater(repoRoot, x, { date, read: a }).ok).slice(0, MAX_PUBLIC_EVENTS);
}

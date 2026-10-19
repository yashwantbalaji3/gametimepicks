/**
 * NBA SIMULATION THEATER · LOADER — the only I/O in the NBA theater library. Server side, build time only. READ ONLY.
 *
 * SOURCE SWITCH (one line). Until the nba-sim-v1-coherent engine lands, the theater reads a generated, schema-valid TEST
 * FIXTURE (marked `fixture: true`; rendered only under a "TEST FIXTURE — not model output" banner). To read real engine
 * output instead, change the single line marked SOURCE below to, e.g.:
 *
 *   export const NBA_THEATER_SOURCE = v1ArtifactSource("2026-10-20");
 *
 * which reads data/internal/research/nba/experimental-v1/forecasts/2026-10-20.json (the v0.2 artifact shape with the v1
 * additions). Nothing else changes: the adapter validates either the same way, and the fixture banner follows the
 * artifact's own `fixture` flag.
 */
import fs from "node:fs";
import path from "node:path";

import { adaptNbaArtifact } from "./adapter-nba-sim-v1.mjs";
import { nbaPalette } from "./nba-team-colors.mjs";

export const NBA_FIXTURE_SOURCE = Object.freeze({ kind: "fixture", path: "app/src/lib/simulation-theater/nba/__fixtures__/nba-sim-v1-fixture.json" });
export const v1ArtifactSource = (date) => Object.freeze({ kind: "artifact", path: `data/internal/research/nba/experimental-v1/forecasts/${date}.json` });

// SOURCE ↓ (the one line to change when real nba-sim-v1 output exists)
export const NBA_THEATER_SOURCE = NBA_FIXTURE_SOURCE;

export const NBA_COLORS_FILE = "app/src/lib/simulation-theater/nba/nba-team-colors.json";
export const MAX_NBA_EVENTS = 3;

export function readArtifact(repoRoot, source = NBA_THEATER_SOURCE) {
  const file = path.join(repoRoot, source.path);
  try {
    return { file: source.path, artifact: JSON.parse(fs.readFileSync(file, "utf8")), error: null };
  } catch (e) {
    return { file: source.path, artifact: null, error: { code: "NO_ARTIFACT", reason: `${source.path}: ${e?.code ?? e?.message ?? "unreadable"}` } };
  }
}

export function readTeamColors(repoRoot) {
  try { return JSON.parse(fs.readFileSync(path.join(repoRoot, NBA_COLORS_FILE), "utf8")); } catch { return null; }
}

/**
 * The theater for one event.
 * @returns {{ eventId: string, file: string, ok: boolean, error: object|null, manifest: object|null, palettes: {team: object, neutral: object}|null }}
 */
export function loadNbaTheater(repoRoot, eventId, { source = NBA_THEATER_SOURCE, read = null } = {}) {
  const r = read ?? readArtifact(repoRoot, source);
  if (!r.artifact) return { eventId: String(eventId), file: r.file, ok: false, error: r.error, manifest: null, palettes: null };
  const a = adaptNbaArtifact(r.artifact, eventId, { file: r.file });
  let palettes = null;
  if (a.ok) {
    const colors = readTeamColors(repoRoot);
    const { home, away } = a.manifest.teams;
    palettes = { team: nbaPalette(colors, home.abbr, away.abbr), neutral: nbaPalette(colors, home.abbr, away.abbr, { neutral: true }) };
  }
  return { eventId: String(eventId), file: r.file, ok: a.ok, error: a.error, manifest: a.manifest, palettes };
}

/** Event ids the dev route may emit: games of the source whose manifest adapts with ≥ 1 valid sample, capped. */
export function usableNbaEvents(repoRoot, { source = NBA_THEATER_SOURCE } = {}) {
  const r = readArtifact(repoRoot, source);
  if (!r.artifact || !Array.isArray(r.artifact.games)) return [];
  return r.artifact.games
    .map((g) => String(g?.providerEventId ?? ""))
    .filter((id) => id && /^[0-9A-Za-z_-]+$/.test(id))
    .filter((id) => { const t = loadNbaTheater(repoRoot, id, { source, read: r }); return t.ok && t.manifest.samples.some((s) => s.validation.ok); })
    .slice(0, MAX_NBA_EVENTS);
}

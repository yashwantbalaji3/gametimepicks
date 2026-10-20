/**
 * NBA SIMULATION THEATER · LOADER — the only I/O in the NBA theater library. Server side, build time only. READ ONLY.
 *
 * SOURCE SWITCH (one line). Three sources exist:
 *   NBA_REAL_DEV_SOURCE  (current) a byte-for-byte DEV COPY of REAL nba-sim-v1-coherent output for 2026-10-20, kept under
 *                        __fixtures__/ with a provenance sidecar; read only if the sidecar's sha256 matches the file.
 *                        Integration 2026-10-19: the copy is r2, rebuilt offline from main's committed inputs AFTER the
 *                        minutes-rounding fix (29722959e1); its sidecar declares `minutesExact`, so it is validated with
 *                        no rounding allowance. The pre-fix copy (sha 45df05d8…) is superseded and removed.
 *   NBA_FIXTURE_SOURCE   the generated synthetic TEST FIXTURE (`fixture: true`; rendered only under its banner). Used by
 *                        the validator mutation tests and the fixture-gate tests.
 *   v1ArtifactSource(d)  a committed experimental-v1 artifact: data/internal/research/nba/experimental-v1/forecasts/<d>.json
 * Once experimental-v1 artifacts are committed under data/, the one line marked SOURCE becomes:
 *
 *   export const NBA_THEATER_SOURCE = v1ArtifactSource("2026-10-20");
 *
 * Nothing else changes: the adapter validates every source the same way, and the fixture banner follows the artifact's
 * own `fixture` flag.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { adaptNbaArtifact } from "./adapter-nba-sim-v1.mjs";
import { nbaPalette } from "./nba-team-colors.mjs";

export const NBA_FIXTURE_SOURCE = Object.freeze({ kind: "fixture", path: "app/src/lib/simulation-theater/nba/__fixtures__/nba-sim-v1-fixture.json" });
export const NBA_REAL_DEV_SOURCE = Object.freeze({
  kind: "dev-copy",
  path: "app/src/lib/simulation-theater/nba/__fixtures__/nba-sim-v1-real-2026-10-20-r2.json",
  provenance: "app/src/lib/simulation-theater/nba/__fixtures__/nba-sim-v1-real-2026-10-20-r2.provenance.json",
});
export const v1ArtifactSource = (date) => Object.freeze({ kind: "artifact", path: `data/internal/research/nba/experimental-v1/forecasts/${date}.json` });

// SOURCE ↓ (the one line to change when real nba-sim-v1 output exists)
export const NBA_THEATER_SOURCE = NBA_REAL_DEV_SOURCE;

export const NBA_COLORS_FILE = "app/src/lib/simulation-theater/nba/nba-team-colors.json";
export const MAX_NBA_EVENTS = 3;

export function readArtifact(repoRoot, source = NBA_THEATER_SOURCE) {
  const file = path.join(repoRoot, source.path);
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch (e) {
    return { file: source.path, artifact: null, provenance: null, error: { code: "NO_ARTIFACT", reason: `${source.path}: ${e?.code ?? e?.message ?? "unreadable"}` } };
  }
  let provenance = null;
  if (source.provenance) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(repoRoot, source.provenance), "utf8"));
      const sha = crypto.createHash("sha256").update(bytes).digest("hex");
      provenance = { ...p, verified: p.sha256 === sha, actualSha256: sha };
    } catch {
      provenance = { verified: false };
    }
  }
  try {
    return { file: source.path, artifact: JSON.parse(bytes.toString("utf8")), provenance, error: null };
  } catch (e) {
    return { file: source.path, artifact: null, provenance, error: { code: "NO_ARTIFACT", reason: `${source.path}: ${e?.message ?? "not JSON"}` } };
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
  const a = adaptNbaArtifact(r.artifact, eventId, { file: r.file, provenance: r.provenance ?? null });
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

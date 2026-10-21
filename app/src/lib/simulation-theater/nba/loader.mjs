/**
 * NBA SIMULATION THEATER · LOADER — the only I/O in the NBA theater library. Server side, build time only. READ ONLY.
 *
 * SOURCE (Cross-Product Prediction Consistency, 2026-10-20). The Theater REPLAYS the COMMITTED PRIVATE v1 RECEIPT
 *   v1ArtifactSource(NBA_THEATER_DATE) = data/internal/research/nba/experimental-v1/forecasts/<date>.json
 * (the SUPPORTING simulation) and MEASURES its runs against the OFFICIAL snapshot, built from
 *   officialArtifactSource(NBA_THEATER_DATE) = data/internal/research/nba/experimental-v0.1/forecasts/<date>.json
 * (Elo side + v0.1 players — what the public /nba lane prints; lib/consistency/official-snapshot.mjs). It verifies each
 * game's `nba-forecast-receipt@1` stamp (receiptIntegrity, lib/sports/nba/forecast-receipt.mjs) BEFORE use. Fail closed:
 *   - file missing / unreadable / not JSON          → NO_ARTIFACT
 *   - game not in the committed file (e.g. it was OUTSIDE_HORIZON at the last pre-tip run) → NO_OFFICIAL_RECEIPT,
 *     rendered as "No official forecast receipt for this game yet". Never a fixture, never another date, in its place.
 *   - receipt stamp missing or broken                → RECEIPT_INTEGRITY
 *   - official v0.1 file missing / game absent / broken → the representative block says NO_OFFICIAL (every run is a
 *     hypothetical what-if); the runs still play, never labelled official.
 * The other sources exist ONLY for unit tests:
 *   NBA_REAL_TEST_FIXTURE_SOURCE  a byte-for-byte copy of real nba-sim-v1-coherent output for 2026-10-20 (r2), kept under
 *                                 __fixtures__/ with a provenance sidecar (read only if the sidecar's sha256 matches).
 *                                 Until 2026-10-20 the dev route rendered it; it is now a TEST FIXTURE only.
 *   NBA_FIXTURE_SOURCE            the generated synthetic TEST FIXTURE (`fixture: true`; rendered only under its banner).
 *
 * Every theater load carries `manifest.representative` (official-representative.mjs): the OFFICIAL REPRESENTATIVE
 * SIMULATION (the stored sample closest to the receipt's own official expectations) and the hypothetical what-ifs.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { adaptNbaArtifact } from "./adapter-nba-sim-v1.mjs";
import { nbaPalette } from "./nba-team-colors.mjs";
import { receiptIntegrity } from "../../sports/nba/forecast-receipt.mjs";
import { nbaOfficial, withNbaRepresentative } from "../official-representative.mjs";
import { NO_OFFICIAL_NBA } from "../representative-labels.mjs";

export const NBA_FIXTURE_SOURCE = Object.freeze({ kind: "fixture", path: "app/src/lib/simulation-theater/nba/__fixtures__/nba-sim-v1-fixture.json" });
/** TEST FIXTURE ONLY (unit tests): the verified copy of real engine output the dev route used before 2026-10-20. */
export const NBA_REAL_TEST_FIXTURE_SOURCE = Object.freeze({
  kind: "test-fixture-copy",
  path: "app/src/lib/simulation-theater/nba/__fixtures__/nba-sim-v1-real-2026-10-20-r2.json",
  provenance: "app/src/lib/simulation-theater/nba/__fixtures__/nba-sim-v1-real-2026-10-20-r2.provenance.json",
});
export const v1ArtifactSource = (date) => Object.freeze({ kind: "artifact", path: `data/internal/research/nba/experimental-v1/forecasts/${date}.json` });
/** The OFFICIAL NBA source (v0.1 players + the Elo side it carries). */
export const officialArtifactSource = (date) => Object.freeze({ kind: "artifact", path: `data/internal/research/nba/experimental-v0.1/forecasts/${date}.json` });

/** The slate the dev route renders. */
export const NBA_THEATER_DATE = "2026-10-20";
// SOURCE ↓ the committed private receipt (never a fixture)
export const NBA_THEATER_SOURCE = v1ArtifactSource(NBA_THEATER_DATE);
export const NBA_THEATER_OFFICIAL_SOURCE = officialArtifactSource(NBA_THEATER_DATE);

export const NBA_COLORS_FILE = "app/src/lib/simulation-theater/nba/nba-team-colors.json";
export const MAX_NBA_EVENTS = 3;

export function readArtifact(repoRoot, source = NBA_THEATER_SOURCE) {
  const file = path.join(repoRoot, source.path);
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch (e) {
    return { file: source.path, artifact: null, provenance: null, sha256: null, error: { code: "NO_ARTIFACT", reason: `${source.path}: ${e?.code ?? e?.message ?? "unreadable"}` } };
  }
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  let provenance = null;
  if (source.provenance) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(repoRoot, source.provenance), "utf8"));
      provenance = { ...p, verified: p.sha256 === sha, actualSha256: sha };
    } catch {
      provenance = { verified: false };
    }
  }
  try {
    return { file: source.path, artifact: JSON.parse(bytes.toString("utf8")), provenance, sha256: sha, error: null };
  } catch (e) {
    return { file: source.path, artifact: null, provenance, sha256: sha, error: { code: "NO_ARTIFACT", reason: `${source.path}: ${e?.message ?? "not JSON"}` } };
  }
}

export function readTeamColors(repoRoot) {
  try { return JSON.parse(fs.readFileSync(path.join(repoRoot, NBA_COLORS_FILE), "utf8")); } catch { return null; }
}

/** The last pre-tip run's outcome for an event the artifact does not hold (OUTSIDE_HORIZON, ...), or null. */
export function lastRunOutcome(artifact, eventId) {
  const id = String(eventId);
  let out = null;
  for (const run of Array.isArray(artifact?.runs) ? artifact.runs : []) {
    for (const o of Array.isArray(run?.outcomes) ? run.outcomes : []) if (String(o?.providerEventId) === id) out = { outcome: o.outcome ?? null, at: run.at ?? null, tipUtc: o.tipUtc ?? null };
  }
  return out;
}

/**
 * The theater for one event.
 * @returns {{ eventId: string, file: string, ok: boolean, error: object|null, manifest: object|null, palettes: {team: object, neutral: object}|null }}
 */
export function loadNbaTheater(repoRoot, eventId, { source = NBA_THEATER_SOURCE, read = null, officialSource = null, officialRead = null } = {}) {
  const id = String(eventId);
  const r = read ?? readArtifact(repoRoot, source);
  // the official source sits beside the replayed one: the dated v0.1 file for the receipt, none for test fixtures
  const offSrc = officialSource ?? (source.kind === "artifact" ? officialArtifactSource(String(source.path.match(/(\d{4}-\d{2}-\d{2})\.json$/)?.[1] ?? NBA_THEATER_DATE)) : null);
  const o = officialRead ?? (offSrc ? readArtifact(repoRoot, offSrc) : null);
  const fail = (code, reason) => ({ eventId: id, file: r.file, ok: false, error: { code, reason }, manifest: null, palettes: null });
  if (!r.artifact) return fail(r.error?.code ?? "NO_ARTIFACT", r.error?.reason ?? "no artifact");
  const game = Array.isArray(r.artifact.games) ? r.artifact.games.find((g) => String(g?.providerEventId) === id) : null;
  if (source.kind === "artifact") {
    // the committed receipt is the ONLY source: an absent game has no official receipt yet (never a fallback)
    if (!game) {
      const last = lastRunOutcome(r.artifact, id);
      return fail("NO_OFFICIAL_RECEIPT", `${NO_OFFICIAL_NBA}: ${id} is not in ${r.file}${last?.outcome ? ` (last pre-tip run ${last.at ?? "?"}: ${last.outcome})` : ""}`);
    }
    const integrity = receiptIntegrity(game);
    if (integrity.state !== "OK") return fail("RECEIPT_INTEGRITY", `receipt ${integrity.state}${integrity.problems ? `: ${integrity.problems.join("; ")}` : ""}`);
  }
  const a = adaptNbaArtifact(r.artifact, id, { file: r.file, provenance: r.provenance ?? null });
  if (!a.ok) return { eventId: id, file: r.file, ok: false, error: a.error, manifest: null, palettes: null };
  const official = nbaOfficial(id, {
    official: o?.artifact ? { doc: o.artifact, path: o.file, sha256: o.sha256 ?? undefined } : null,
    supporting: { doc: r.artifact, path: r.file, sha256: r.sha256 ?? undefined },
  });
  const manifest = withNbaRepresentative(a.manifest, game, official);
  const colors = readTeamColors(repoRoot);
  const { home, away } = manifest.teams;
  const palettes = { team: nbaPalette(colors, home.abbr, away.abbr), neutral: nbaPalette(colors, home.abbr, away.abbr, { neutral: true }) };
  return { eventId: id, file: r.file, ok: true, error: null, manifest, palettes };
}

/** Event ids of the source whose manifest adapts with ≥ 1 valid sample (and, for the receipt, an intact stamp), capped. */
export function usableNbaEvents(repoRoot, { source = NBA_THEATER_SOURCE } = {}) {
  const r = readArtifact(repoRoot, source);
  if (!r.artifact || !Array.isArray(r.artifact.games)) return [];
  const offSrc = source.kind === "artifact" ? officialArtifactSource(String(source.path.match(/(\d{4}-\d{2}-\d{2})\.json$/)?.[1] ?? NBA_THEATER_DATE)) : null;
  const officialRead = offSrc ? readArtifact(repoRoot, offSrc) : null;
  return r.artifact.games
    .map((g) => String(g?.providerEventId ?? ""))
    .filter((id) => id && /^[0-9A-Za-z_-]+$/.test(id))
    .filter((id) => { const t = loadNbaTheater(repoRoot, id, { source, read: r, officialSource: offSrc, officialRead }); return t.ok && t.manifest.samples.some((s) => s.validation.ok); })
    .slice(0, MAX_NBA_EVENTS);
}

/**
 * Event ids the dev route emits: the usable games, then the slate's games the committed receipt does NOT hold yet (named
 * by the artifact's own run log, e.g. OUTSIDE_HORIZON), which render "No official forecast receipt for this game yet".
 * Capped at MAX_NBA_EVENTS.
 */
export function nbaRouteEvents(repoRoot, { source = NBA_THEATER_SOURCE } = {}) {
  const r = readArtifact(repoRoot, source);
  if (!r.artifact) return [];
  const usable = usableNbaEvents(repoRoot, { source });
  const inFile = new Set((Array.isArray(r.artifact.games) ? r.artifact.games : []).map((g) => String(g?.providerEventId ?? "")));
  const absent = [];
  for (const run of Array.isArray(r.artifact.runs) ? r.artifact.runs : []) {
    for (const o of Array.isArray(run?.outcomes) ? run.outcomes : []) {
      const id = String(o?.providerEventId ?? "");
      if (id && /^[0-9A-Za-z_-]+$/.test(id) && !inFile.has(id) && !absent.includes(id)) absent.push(id);
    }
  }
  return [...usable, ...absent].slice(0, MAX_NBA_EVENTS);
}

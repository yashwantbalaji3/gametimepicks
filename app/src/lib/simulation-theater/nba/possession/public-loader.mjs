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

import { buildPlaybackPayload, officialPanelFromLane } from "./payload.mjs";
import { eloWinProbabilityOf, eloWinProbabilityText } from "../../../sports/nba/elo-win-probability.mjs";
import { etDateOf, readPossessionArtifact, replayGateProblems, sideConstraintProblem, validatedGame } from "./stored-run.mjs";
import { NBA_THEATER_REPLAY_ENGINE } from "../../../consistency/theater-replay-engine.mjs";
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

/**
 * ONE OFFICIAL SNAPSHOT (NBA engine audit 2026-10-29). Every other public NBA surface (hub, projections, settled page,
 * social feed, Level A) reads the committed lane file; this page prints the panel embedded in the possession artifact.
 * Before the page may print that panel as the Official Forecast it must be the SAME snapshot the lane published: the
 * artifact's v0.1 freeze receipt equals the lane game's receipt payloadSha256, the lane's favoured team is the panel's
 * side, and the panel's players and medians are the lane's (the lane rounds to one decimal). The lane is a public build
 * input (app/public/data/nba/experimental-public/), not a receipt file. Any disagreement refuses the page (LANE_MISMATCH),
 * so the route falls back to the settled page or the 404, never to a second official number.
 */
export const LANE_REL = (date) => `app/public/data/nba/experimental-public/${date}.json`;
export const readLaneDay = (repoRoot, date) => {
  try { return JSON.parse(fs.readFileSync(path.join(repoRoot, LANE_REL(date)), "utf8")); } catch { return null; }
};
const round1 = (x) => Math.round(Number(x) * 10) / 10;
export function laneAgreementProblem(game, panel, lane) {
  const id = String(game?.providerEventId);
  const lg = (lane?.games ?? []).find((g) => String(g.providerEventId) === id);
  if (!lg) return "the committed lane does not publish this game";
  const freeze = game?.inputs?.officialFreeze?.payloadSha256 ?? null;
  if (!freeze || lg.receipt?.payloadSha256 !== freeze) return `receipt ${String(freeze).slice(0, 12)} ≠ lane receipt ${String(lg.receipt?.payloadSha256).slice(0, 12)}`;
  const favTeam = panel.favouredSide === "HOME" ? lg.home?.abbr : panel.favouredSide === "AWAY" ? lg.away?.abbr : null;
  if ((lg.elo?.favoured ?? null) !== (favTeam ?? null)) return `lane favours ${lg.elo?.favoured ?? "none"}, panel ${panel.favouredSide ?? "none"}`;
  const laneRows = new Map(["home", "away"].flatMap((s) => (lg.players?.[s] ?? []).map((p) => [String(p.providerAthleteId), { s, p }])));
  const rows = panel.players ?? [];
  if (rows.length !== laneRows.size) return `panel lists ${rows.length} players, lane ${laneRows.size}`;
  for (const r of rows) {
    const l = laneRows.get(String(r.playerId));
    if (!l || l.s !== r.team) return `player ${r.playerId} is not on the lane's ${r.team} side`;
    for (const [f, v] of Object.entries(r.medians ?? {})) {
      if (Math.abs(round1(v) - Number(l.p.medians?.[f])) > 0.051) return `player ${r.playerId} ${f}: panel ${v} vs lane ${l.p.medians?.[f]}`;
    }
  }
  return null;
}

export function loadPublicPossessionTheater(repoRoot, eventId, { date = publicTheaterSlate(), read = null, lane = undefined } = {}) {
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
  // the panel must be the snapshot the lane published (one official forecast on every surface)
  const laneDoc = lane === undefined ? readLaneDay(repoRoot, r.doc?.date ?? date) : lane;
  const mismatch = laneAgreementProblem(game, panel, laneDoc);
  if (mismatch) return fail(id, "LANE_MISMATCH", mismatch);
  const colors = readColors(repoRoot);
  // the PRINTED official numbers are the lane's (the canonical accessor), never the artifact's embedded copy
  const laneGame = (laneDoc?.games ?? []).find((g) => String(g.providerEventId) === id) ?? null;
  const elo = eloWinProbabilityOf(laneGame);
  return {
    eventId: id, ok: true, error: null,
    payload: buildPlaybackPayload(game, officialPanelFromLane(panel, laneGame, elo, elo ? eloWinProbabilityText(elo) : null)),
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

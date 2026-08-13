/**
 * NFL participation & opportunity contract (Program 169 · Release D). PRIVATE.
 *
 * THE GATE every player market stands behind: no typed participation state, no prop, no
 * touchdown probability — a posted sportsbook line is never participation evidence.
 *
 * States (closed set):
 *   ACTIVE_CONFIRMED   official game-day actives — NO authorized source exists yet, so this
 *                      state is currently UNREACHABLE (stated; reaching it is a source release)
 *   ACTIVE_PROJECTED   on current roster + fresh injuries artifact carries no blocking status
 *   QUESTIONABLE       injuries artifact says questionable/doubtful
 *   ROLE_UNCERTAIN     playable but role/snap share unevidenced — ALWAYS the preseason default
 *                      unless a dated, sourced snap scenario exists
 *   INACTIVE           out/IR/suspended per the injuries artifact
 *   UNSUPPORTED        not on the canonical roster for this event's team
 *   UNKNOWN            the injuries input is missing or stale — absence of injury data is never
 *                      health (staleness widens, the P162 rule)
 *
 * ALLOCATION COHERENCE (the opportunity engine's contract, enforced before any prop model may
 * publish): targets ≤ team pass attempts; per-player receptions ≤ targets; share sums ≤ 1 with a
 * NAMED residual (never forced to 100% across the visible list); player TDs reconcile to team
 * offensive TDs. Violations refuse the whole allocation — partial coherence is incoherence.
 */
import { checkFreshness } from "./season-context.mjs";

export const NFL_PARTICIPATION_VERSION = 1;

export const PARTICIPATION_STATES = Object.freeze([
  "ACTIVE_CONFIRMED", "ACTIVE_PROJECTED", "QUESTIONABLE", "ROLE_UNCERTAIN", "INACTIVE", "UNSUPPORTED", "UNKNOWN",
]);

const BLOCKING = /^(out|injured.reserve|ir|suspend|pup|nfi)/i;
const QUESTION = /^(questionable|doubtful)/i;

/**
 * Classify ONE player for ONE event.
 * @param {object} p
 * @param {object|null} p.rosterPlayer   registry row for the event team (null = not on roster)
 * @param {object|null} p.injuryFact     normalized injuries-artifact entry for the player (or null)
 * @param {{state:"FRESH"|"STALE"|"UNDATED"|"CLOCK_DEFECT"}} p.injuriesFreshness
 * @param {number} p.seasonType
 * @param {object|null} p.snapScenario   dated+sourced expected-participation artifact (or null)
 * @param {string} p.nowIso
 */
export function classifyParticipation({ rosterPlayer, injuryFact = null, injuriesFreshness, seasonType, snapScenario = null, nowIso }) {
  if (!rosterPlayer) return { state: "UNSUPPORTED", reason: "not on the canonical roster for this event's team — roster-effective lineage refuses" };
  if (!injuriesFreshness || injuriesFreshness.state !== "FRESH") {
    return { state: "UNKNOWN", reason: `injuries input is ${injuriesFreshness?.state ?? "MISSING"} — absence of injury data is never health` };
  }
  const status = injuryFact?.status ?? injuryFact?.designation ?? null;
  if (status && BLOCKING.test(status)) return { state: "INACTIVE", reason: `injuries artifact: ${status}` };
  if (status && QUESTION.test(status)) return { state: "QUESTIONABLE", reason: `injuries artifact: ${status}` };
  if (seasonType === 1) {
    const sc = validateSnapScenario(snapScenario, nowIso);
    if (!sc.ok) return { state: "ROLE_UNCERTAIN", reason: `preseason requires a source-backed snap scenario: ${sc.reason} — a posted line never substitutes` };
    return { state: "ACTIVE_PROJECTED", reason: `preseason snap scenario on file (${snapScenario.source}, expected share ${snapScenario.expectedSnapShare})`, snapScenario: { expectedSnapShare: snapScenario.expectedSnapShare, source: snapScenario.source, asOf: snapScenario.asOf } };
  }
  return { state: "ACTIVE_PROJECTED", reason: "current roster + fresh injuries artifact carries no blocking status (ACTIVE_CONFIRMED needs an official-actives source that does not exist yet)" };
}

/** Snap scenarios and manual overrides share one discipline: dated, sourced, expiring, reviewed. */
export function validateSnapScenario(s, nowIso) {
  if (!s) return { ok: false, reason: "none on file" };
  for (const k of ["playerId", "expectedSnapShare", "source", "asOf", "expiresAt"]) {
    if (s[k] == null || s[k] === "") return { ok: false, reason: `missing ${k}` };
  }
  if (typeof s.expectedSnapShare !== "number" || s.expectedSnapShare < 0 || s.expectedSnapShare > 1) return { ok: false, reason: "expectedSnapShare must be a probability-like share in [0,1]" };
  const now = Date.parse(nowIso ?? "");
  if (!Number.isFinite(now)) return { ok: false, reason: "nowIso required" };
  if (Date.parse(s.expiresAt) <= now) return { ok: false, reason: `expired ${s.expiresAt}` };
  if (Date.parse(s.asOf) > now) return { ok: false, reason: "asOf is in the future" };
  return { ok: true };
}

export function validateOverride(o, nowIso) {
  const base = validateSnapScenario({ playerId: o?.playerId, expectedSnapShare: 0, source: o?.source, asOf: o?.asOf, expiresAt: o?.expiresAt }, nowIso);
  if (!base.ok && !/expectedSnapShare/.test(base.reason)) return base;
  if (!o?.reviewer) return { ok: false, reason: "missing reviewer — no anonymous overrides" };
  if (!o?.rationale || o.rationale.length < 10) return { ok: false, reason: "missing rationale — prose is required, anonymity is not" };
  if (!PARTICIPATION_STATES.includes(o?.state)) return { ok: false, reason: `override state ${o?.state} outside the closed set` };
  return { ok: true };
}

/** Build per-team active pools for one event. Population-exact accounting per team. */
export function buildActivePool({ event, registry, injuriesArtifact, snapScenarios = {}, nowIso }) {
  const freshness = checkFreshness("injuries", { sourceAsOf: injuriesArtifact?.sourceAsOf ?? injuriesArtifact?.generatedAt, fetchedAt: injuriesArtifact?.generatedAt }, nowIso);
  const factByPlayer = new Map();
  for (const e of injuriesArtifact?.entries ?? []) {
    if (e?.athleteId != null) factByPlayer.set(`nfl-athlete-${e.athleteId}`, e);
  }
  const pools = {};
  for (const side of ["home", "away"]) {
    const abbr = event?.[side]?.abbr;
    const players = [...registry.players.values()].filter((p) => p.teamAbbr === abbr);
    const rows = players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      position: p.position,
      ...classifyParticipation({ rosterPlayer: p, injuryFact: factByPlayer.get(p.playerId) ?? null, injuriesFreshness: freshness, seasonType: event?.seasonType, snapScenario: snapScenarios[p.playerId] ?? null, nowIso }),
    }));
    const counts = {};
    for (const r of rows) counts[r.state] = (counts[r.state] ?? 0) + 1;
    pools[abbr] = { teamAbbr: abbr, injuriesFreshness: freshness.state, players: rows, counts, accounting: { rosterSize: players.length, classified: rows.length, exact: players.length === rows.length } };
  }
  return { version: NFL_PARTICIPATION_VERSION, providerEventId: event?.providerEventId ?? null, seasonType: event?.seasonType ?? null, nowIso, pools };
}

/**
 * Allocation coherence — refuse-if-anything-disagrees. `alloc` shape:
 * { teamPassAttempts, teamRushAttempts, teamOffensiveTds,
 *   players: [{ playerId, targets?, receptions?, rushAttempts?, tdProbabilityShare? }],
 *   residual: { label, tdProbabilityShare } }
 */
export function validateAllocation(alloc) {
  const errors = [];
  const players = alloc?.players ?? [];
  const sum = (k) => players.reduce((s, p) => s + (p[k] ?? 0), 0);
  if (!(alloc?.teamPassAttempts >= 0) || !(alloc?.teamRushAttempts >= 0)) errors.push("team volumes missing");
  if (sum("targets") > alloc.teamPassAttempts + 1e-9) errors.push(`targets ${sum("targets").toFixed(2)} exceed team pass attempts ${alloc.teamPassAttempts}`);
  for (const p of players) {
    if ((p.receptions ?? 0) > (p.targets ?? 0) + 1e-9) errors.push(`${p.playerId}: receptions exceed targets`);
    for (const k of ["targets", "receptions", "rushAttempts", "tdProbabilityShare"]) {
      if (p[k] != null && p[k] < 0) errors.push(`${p.playerId}: negative ${k}`);
    }
  }
  if (sum("rushAttempts") > alloc.teamRushAttempts + 1e-9) errors.push("rush attempts exceed team volume");
  const tdShare = sum("tdProbabilityShare");
  const residual = alloc?.residual?.tdProbabilityShare;
  if (residual == null || residual < 0) errors.push("residual TD share missing — the visible list is never forced to 100%");
  else if (Math.abs(tdShare + residual - 1) > 1e-6) errors.push(`TD shares ${tdShare.toFixed(4)} + residual ${residual.toFixed(4)} must reconcile to 1`);
  return { ok: errors.length === 0, errors };
}

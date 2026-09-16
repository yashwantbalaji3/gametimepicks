/**
 * SINCE YOUR LAST VISIT — the pure delta engine (v1.1.4). Inputs only: no I/O, no React, no storage, no clock.
 *
 *   previous observation (observation-schema.mjs)
 * + current canonical owners (schedule read model, Live batch slate, settlement ledgers, Saved owner)
 * + current eligibility (what is followed and saved NOW, and was followed and saved THEN)
 * = typed, evidence-backed deltas
 *
 * ⚠ IF IT CANNOT BE PROVEN, IT IS NOT SAID. A delta needs a trustworthy PRIOR fact and a trustworthy CURRENT
 * fact. No prior document ⇒ baseline, zero deltas. A missing owner ⇒ unknown, zero deltas — never "unchanged",
 * never "ended". Absence from a list is never evidence.
 *
 * THE WHITELIST (nothing else is ever emitted):
 *   RESULT_SETTLED                     prior stage < SETTLED   → canonical settlement now exists
 *   SAVED_FORECAST_SETTLED             saved then and now, prior unresolved → the Saved owner's ledger resolves it
 *   FINAL_REPORTED_PENDING_SETTLEMENT  prior stage < FINAL     → provider FINAL, no settlement   (MLB only)
 *   GAME_STARTED                       prior stage = PRE       → provider LIVE / DELAYED          (MLB only)
 * One delta per game: the strongest current truth wins, so a settled game never also reads "grading pending".
 *
 * DEFERRED (documented in docs/RETENTION_ARCHITECTURE.md): NEW_PUBLISHED_FORECAST and NFL_PLAYER_FORECAST_CHANGED.
 * No published forecast or player projection carries a version identity — boards and forecasts regenerate with a
 * new generatedAt whether or not a number moved — so no change could be proven.
 *
 * ELIGIBILITY. A game counts only if one of its teams was followed in the prior observation AND is followed now;
 * a saved forecast only if it was saved then AND is saved now. A new follow or a new save is a new baseline.
 * Every join is an exact canonical id: `mlb-team-<id>`, `nfl-team-<id>`, gamePk, ESPN event id, the Saved id.
 */
import { gameKey, stageRank } from "./observation-schema.mjs";

export const DELTA_TYPES = Object.freeze(["RESULT_SETTLED", "SAVED_FORECAST_SETTLED", "FINAL_REPORTED_PENDING_SETTLEMENT", "GAME_STARTED"]);
const PRIORITY = Object.fromEntries(DELTA_TYPES.map((t, i) => [t, i]));

const PROVIDER_STAGE = { PRE: "PRE", LIVE: "LIVE", DELAYED: "LIVE", FINAL: "FINAL" };
const mlbTeam = (side) => (typeof side?.teamId === "string" && /^\d+$/.test(side.teamId) ? `mlb-team-${side.teamId}` : null);

/**
 * Current evidence for the games of currently followed teams, from the owners that are READY.
 *
 * @param {{
 *   upcoming: any[], results: any[],
 *   envelopesByGamePk: Record<string, any>|null,   // null when the Live slice is not ready (or not mounted)
 *   followedIds: string[], nowMs: number,
 * }} input
 * @returns {any[]} one row per game: { key, sport, eventId, teamIds, startUtc, stage|null, voided, names, href, result, reported }
 */
export function currentGameEvidence({ upcoming, results, envelopesByGamePk, followedIds, nowMs }) {
  const followed = new Set(followedIds ?? []);
  const rows = new Map();
  const row = (sport, eventId) => {
    const key = gameKey(sport, String(eventId));
    if (!rows.has(key)) rows.set(key, { key, sport, eventId: String(eventId), teamIds: [], startUtc: null, stages: [], voided: false, names: null, href: null, result: null, reported: null });
    return rows.get(key);
  };
  const involves = (ids) => ids.some((id) => followed.has(id));
  const addTeams = (r, ids) => { r.teamIds = [...new Set([...r.teamIds, ...ids])].sort(); };

  for (const g of Array.isArray(upcoming) ? upcoming : []) {
    const ids = [g?.homeId, g?.awayId].filter(Boolean);
    if ((g?.sport !== "MLB" && g?.sport !== "NFL") || !involves(ids)) continue;
    const r = row(g.sport, g.gameId);
    addTeams(r, ids);
    r.startUtc = r.startUtc ?? g.startUtc ?? null;
    r.names = r.names ?? { home: g.homeName, away: g.awayName };
    r.href = r.href ?? g.href ?? null;
    const start = Date.parse(g.startUtc ?? "");
    // Scheduled in the future on the READER's clock ⇒ it cannot have started. A past or unknown start says nothing.
    if (Number.isFinite(start) && start > nowMs) r.stages.push("PRE");
  }

  for (const x of Array.isArray(results) ? results : []) {
    const ids = [x?.homeId, x?.awayId].filter(Boolean);
    if ((x?.sport !== "MLB" && x?.sport !== "NFL") || !involves(ids)) continue;
    if (!Number.isInteger(x.homeScore) || !Number.isInteger(x.awayScore)) continue;
    const r = row(x.sport, x.gameId);
    addTeams(r, ids);
    r.startUtc = r.startUtc ?? x.resultAt ?? null; // the GAME's time (v1.1.3 RM7), never the grading time
    r.names = r.names ?? { home: x.homeName, away: x.awayName };
    r.href = r.href ?? x.href ?? null;
    r.result = { homeScore: x.homeScore, awayScore: x.awayScore, gameAt: x.resultAt ?? null };
    r.stages.push("SETTLED");
  }

  // Public dynamic Live is MLB only. Nothing else can arrive here as an envelope — and nothing else is read.
  for (const env of Object.values(envelopesByGamePk ?? {})) {
    if (env?.sport !== "MLB") continue;
    const ids = [mlbTeam(env?.competitors?.home), mlbTeam(env?.competitors?.away)].filter(Boolean);
    if (!involves(ids) || !/^\d{1,12}$/.test(String(env?.eventId ?? ""))) continue;
    const r = row("MLB", env.eventId);
    addTeams(r, ids);
    r.startUtc = r.startUtc ?? env.startTime ?? null;
    r.names = r.names ?? { home: env.competitors?.home?.name ?? env.competitors?.home?.abbr, away: env.competitors?.away?.name ?? env.competitors?.away?.abbr };
    if (env.state === "POSTPONED" || env.state === "CANCELLED") { r.voided = true; continue; }
    const stage = PROVIDER_STAGE[env.state];
    if (!stage) continue; // UNKNOWN proves nothing
    r.stages.push(stage);
    if (stage === "FINAL" && Number.isInteger(env.competitors?.home?.score) && Number.isInteger(env.competitors?.away?.score)) {
      r.reported = { home: { abbr: env.competitors.home.abbr, score: env.competitors.home.score }, away: { abbr: env.competitors.away.abbr, score: env.competitors.away.score } };
    }
  }

  return [...rows.values()].map(({ stages, ...r }) => ({
    ...r,
    // A postponed/cancelled game has no stage: it can never read as settled or final (the lifecycle's fail-closed rule).
    stage: r.voided || stages.length === 0 ? null : stages.reduce((a, b) => (stageRank(b) > stageRank(a) ? b : a)),
  }));
}

/** The facts to observe now, from current evidence: games with a known stage only. */
export function freshGameFacts(evidence) {
  return (evidence ?? []).filter((e) => e.stage && !e.voided).map((e) => ({ sport: e.sport, eventId: e.eventId, teamIds: e.teamIds, stage: e.stage, startUtc: e.startUtc }));
}

/** The canonical event a saved forecast belongs to, from its settlement key — so a result and a save can meet. */
export function savedEventKey(item) {
  const k = item?.settlement;
  if (k?.kind === "mlb-game" && Number.isInteger(k.gamePk)) return gameKey("MLB", String(k.gamePk));
  if (k?.kind === "nfl-event" && typeof k.providerEventId === "string") return gameKey("NFL", k.providerEventId);
  if (k?.kind === "epl-event" && typeof k.eventId === "string") return `EPL:${k.eventId}`;
  if (k?.kind === "ufc-bout") return `UFC:${k.date}:${k.red}|${k.blue}`;
  return null;
}

/**
 * Compute deltas.
 *
 * @param {{
 *   prior: any|null,                       // a normalized observation document, or null (EMPTY / CORRUPT / unavailable)
 *   followedIds: string[]|null,            // null when the Follow owner is not usable
 *   games: any[],                          // currentGameEvidence(...)
 *   savedItems: any[]|null,                // null when the Saved owner is not ready
 *   savedSettled: Map<string, boolean>|null // id → resolved?; null when the settlement ledger is not ready
 * }} input
 * @returns {{ mode: "BASELINE"|"COMPARED", deltas: any[] }}
 */
export function computeSinceDeltas({ prior, followedIds, games, savedItems, savedSettled }) {
  if (!prior) return { mode: "BASELINE", deltas: [] };
  const deltas = [];

  if (Array.isArray(followedIds)) {
    const now = new Set(followedIds);
    const eligible = new Set((prior.followedIds ?? []).filter((id) => now.has(id)));
    for (const e of games ?? []) {
      if (!e.stage || e.voided) continue;
      if (!e.teamIds.some((id) => eligible.has(id))) continue;
      const p = prior.games?.[e.key];
      if (!p) continue; // never observed ⇒ nothing to compare against
      const was = stageRank(p.stage), is = stageRank(e.stage);
      let type = null;
      if (e.stage === "SETTLED" && was < is) type = "RESULT_SETTLED";
      else if (e.sport === "MLB" && e.stage === "FINAL" && was < is) type = "FINAL_REPORTED_PENDING_SETTLEMENT";
      else if (e.sport === "MLB" && e.stage === "LIVE" && p.stage === "PRE") type = "GAME_STARTED";
      if (type) deltas.push({ type, key: `${type}:${e.key}`, eventKey: e.key, sport: e.sport, startUtc: e.startUtc, game: e });
    }
  }

  if (Array.isArray(savedItems) && savedSettled) {
    const before = new Set(prior.savedIds ?? []);
    for (const item of savedItems) {
      if (!before.has(item.id)) continue; // saved since the last visit ⇒ baseline
      if (prior.saved?.[item.id]?.settled !== false) continue; // prior resolution unknown or already graded
      if (savedSettled.get(item.id) !== true) continue; // current resolution unknown or still pending
      const eventKey = savedEventKey(item);
      deltas.push({ type: "SAVED_FORECAST_SETTLED", key: `SAVED_FORECAST_SETTLED:${item.id}`, eventKey, sport: String(item.sport).toUpperCase(), startUtc: item.startUtc ?? null, saved: item });
    }
  }

  deltas.sort(compareDeltas);
  return { mode: "COMPARED", deltas };
}

/** Priority, then the event's own start (chronological), then the stable key. Device time never orders anything. */
export function compareDeltas(a, b) {
  const p = PRIORITY[a.type] - PRIORITY[b.type];
  if (p) return p;
  const ta = Date.parse(a.startUtc ?? ""), tb = Date.parse(b.startUtc ?? "");
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
  if (Number.isFinite(ta) !== Number.isFinite(tb)) return Number.isFinite(ta) ? -1 : 1;
  return a.key.localeCompare(b.key);
}

/**
 * Present one card per event. A saved-forecast delta for a game whose result also just settled is folded into
 * that result card (`savedAlso`) instead of repeating the same game twice; otherwise it stands alone.
 */
export function groupDeltas(deltas) {
  const results = new Map(deltas.filter((d) => d.type === "RESULT_SETTLED").map((d) => [d.eventKey, d]));
  const out = [];
  for (const d of deltas) {
    if (d.type === "SAVED_FORECAST_SETTLED" && d.eventKey && results.has(d.eventKey)) {
      const r = results.get(d.eventKey);
      r.savedAlso = [...(r.savedAlso ?? []), d.saved];
      continue;
    }
    out.push(d);
  }
  return out;
}

/**
 * May this session commit its observation as the next baseline? (v1 "seen" rule)
 * A delta counts as seen when the Since module has rendered in a VISIBLE /my session and the commit succeeds.
 * Every owner that is mounted must have settled (ready or failed) — a still-loading owner would commit an
 * incomplete picture as if it were the whole one.
 */
export function commitGate({ visible, observationStatus, followSettled, savedSettledOwner, liveRequired, liveSettled, settlementsRequired, settlementsSettled }) {
  if (observationStatus === "UNAVAILABLE") return { allowed: false, reason: "STORAGE_UNAVAILABLE" };
  if (observationStatus === "UNSUPPORTED_VERSION") return { allowed: false, reason: "NEWER_SCHEMA" };
  if (observationStatus === "LOADING") return { allowed: false, reason: "OBSERVATION_LOADING" };
  if (!visible) return { allowed: false, reason: "HIDDEN" };
  const pending = pendingOwner({ followSettled, savedSettledOwner, liveRequired, liveSettled, settlementsRequired, settlementsSettled });
  if (pending) return { allowed: false, reason: pending };
  return { allowed: true, reason: null };
}

/**
 * Which mounted owner has not settled yet, or null. Separate from the commit gate on purpose: whether deltas can be
 * COMPUTED does not depend on visibility. (Browser QA found the page deriving "still loading" from the gate's
 * reason — which is HIDDEN first — so a background tab computed deltas without the saved-settlement slice.)
 */
export function pendingOwner({ followSettled, savedSettledOwner, liveRequired, liveSettled, settlementsRequired, settlementsSettled }) {
  if (!followSettled || !savedSettledOwner) return "OWNERS_LOADING";
  if (liveRequired && !liveSettled) return "LIVE_LOADING";
  if (settlementsRequired && !settlementsSettled) return "SETTLEMENTS_LOADING";
  return null;
}

/**
 * Which kinds of change could NOT be checked this visit, because their owner failed. Zero deltas with a gap is
 * "nothing could be confirmed", never "you're up to date" — unknown is not unchanged. (Browser QA: with the Live
 * gateway down the module first said "You're up to date" while a followed game's start could not be checked.)
 *
 * @param {{ followBroken: boolean, liveRequired: boolean, liveFailed: boolean, settlementsRequired: boolean, settlementsFailed: boolean }} input
 * @returns {Array<"FOLLOWING"|"LIVE"|"SAVED_RESULTS">}
 */
export function uncheckedSlices({ followBroken, liveRequired, liveFailed, settlementsRequired, settlementsFailed }) {
  const out = [];
  if (followBroken) out.push("FOLLOWING");
  if (liveRequired && liveFailed) out.push("LIVE");
  if (settlementsRequired && settlementsFailed) out.push("SAVED_RESULTS");
  return out;
}

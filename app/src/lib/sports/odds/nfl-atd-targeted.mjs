/**
 * TARGETED NFL ANYTIME-TOUCHDOWN CAPTURE — the narrow lane (founder-approved engineering change, 2026-11-15).
 *
 * WHY A SECOND LANE. The only other authorized NFL odds path (scripts/nfl/capture-nfl-odds.mjs) always buys the
 * bulk team-markets call first (h2h,spreads,totals × us = 3 credits) and its prop probe requests five prop keys
 * per event (5 credits each), choosing events earliest-first. Pricing anytime TD for two named Sunday games cost
 * ~23 credits through that path when the founder had authorized 2. The provider charges event odds as
 * (unique markets returned) × (regions), and the events index is free, so the cheapest honest question is:
 *
 *   free /sports/{key}/events → for each EXPLICITLY NAMED ESPN event, ONE
 *   /events/{oddsEventId}/odds?regions=us&markets=player_anytime_td  — worst case 1 credit per event.
 *
 * Nothing here spends. This module is pure planning, authorization reading, normalization and merging, plus an
 * orchestrator that is handed its `get` function — so every rule can be executed against recorded fixtures. The
 * capture-nfl-odds.mjs lane is unchanged; this one only REUSES its owners:
 *   p171-authorization.mjs  receipt parse, the ceiling gate, the ledger, duplicate breaker, result classes, leak guard
 *   event-join.mjs          provider event ↔ ESPN schedule identity (joinOddsBatch)
 *   prop-display-selection  the displayed book (DraftKings → FanDuel → most complete, eligible operators only)
 *   nfl/player-identity.mjs every outcome resolves to a durable athlete id or quarantines
 *
 * Run: npx tsx --test src/lib/sports/odds/nfl-atd-targeted.test.mjs
 */
import {
  parseAuthorizationReceipt,
  parseSportAuthorizationReceipt,
  propMarketsAuthorized,
  assertCallAllowed,
  recordRequest,
  isDuplicateRequest,
  classifyProviderResult,
} from "./p171-authorization.mjs";
import { joinOddsBatch } from "./event-join.mjs";
import { REFERENCE_BOOK, FALLBACK_ORDER, selectPropPrices } from "./prop-display-selection.mjs";
import { resolvePlayerRef } from "../nfl/player-identity.mjs";

export const NFL_ATD_TARGETED_VERSION = 1;
export const ATD_MARKET = "player_anytime_td";
/** The board's vocabulary for the same family (capture-nfl-odds.mjs maps it the same way). */
export const ATD_BOARD_FAMILY = "anytime_td";
export const ATD_REGIONS = Object.freeze(["us"]);
export const DEFAULT_FRESHNESS_MINUTES = 45;
export const ATD_PUBLIC_RELPATH = "app/public/data/nfl/markets/anytime-td-latest.json";
export const ATD_PRIVATE_DIR_RELPATH = "data/internal/research/odds/nfl";
export const NFL_REGULAR_KEY = "americanfootball_nfl";
export const NFL_PRESEASON_KEY = "americanfootball_nfl_preseason";

/** Duplicate-breaker fingerprint for one targeted call. Event-scoped, so two events never block each other. */
export const atdFingerprint = (oddsEventId, regions = ATD_REGIONS) => `atd:${oddsEventId}:${ATD_MARKET}:${[...regions].join(",")}`;

/** "401873063" or "nfl-401873063" → "401873063". */
export const espnIdOf = (eventId) => String(eventId ?? "").trim().replace(/^nfl-/, "");
export const canonicalIdOf = (eventId) => `nfl-${espnIdOf(eventId)}`;

/** The provider's credit formula for ONE event-odds call: unique markets × regions. Here markets = 1. */
export const perCallWorstCase = (regions = ATD_REGIONS) => 1 * regions.length;

// ------------------------------------------------------------------------------------------------ 1. plan

/**
 * Plan a targeted run. Pure. Refuses (ok:false) rather than shrinking a request into something else:
 *   - maxCredits must be an integer ≥ 1 (a budget is never inferred);
 *   - the event list must be explicit, non-empty and free of duplicates;
 *   - every id must be an ESPN providerEventId in the committed schedule, still STATUS_SCHEDULED and not started;
 *   - regions must be exactly ["us"];
 *   - worstCase = targets × 1 market × regions, and worstCase > maxCredits REFUSES the whole run.
 */
export function planTargetedAtd({ scheduleRows, eventIds, nowIso, maxCredits, regions = ATD_REGIONS }) {
  const errors = [];
  const nowMs = Date.parse(nowIso ?? "");
  if (!Number.isFinite(nowMs)) errors.push("now: a valid ISO instant is required");
  if (!(Number.isInteger(maxCredits) && maxCredits >= 1)) errors.push(`max-credits: must be an integer ≥ 1 (got ${JSON.stringify(maxCredits)})`);
  const regs = Array.isArray(regions) ? [...regions] : [];
  if (regs.length !== 1 || regs[0] !== "us") errors.push(`regions: this lane requests exactly ["us"] (got ${JSON.stringify(regions)})`);

  const ids = (Array.isArray(eventIds) ? eventIds : []).map((x) => String(x ?? "").trim());
  if (!ids.length || ids.some((x) => !x)) errors.push("events: an explicit, non-empty list of ESPN event ids is required — this lane never chooses events");
  const seen = new Set();
  for (const id of ids) {
    if (!id) continue;
    if (seen.has(espnIdOf(id))) errors.push(`events: ${id} is listed twice — a duplicate target would be bought twice`);
    seen.add(espnIdOf(id));
  }

  const byId = new Map((scheduleRows ?? []).map((r) => [String(r.providerEventId), r]));
  const targets = [];
  for (const raw of [...new Set(ids.filter(Boolean).map(espnIdOf))]) {
    if (!/^\d+$/.test(raw)) { errors.push(`events: ${raw} is not an ESPN providerEventId`); continue; }
    const row = byId.get(raw);
    if (!row) { errors.push(`events: ${raw} is not in the committed NFL schedule — unknown ids are refused, never guessed`); continue; }
    if (row.statusRaw !== "STATUS_SCHEDULED") { errors.push(`events: ${raw} (${row.shortName ?? ""}) is ${row.statusRaw}, not STATUS_SCHEDULED — refused`); continue; }
    const kick = Date.parse(row.dateUtc ?? "");
    if (!Number.isFinite(kick)) { errors.push(`events: ${raw} has no parseable kickoff — refused`); continue; }
    if (Number.isFinite(nowMs) && kick <= nowMs) { errors.push(`events: ${raw} (${row.shortName ?? ""}) kicked off at ${row.dateUtc}, at or before ${nowIso} — a started event is refused`); continue; }
    targets.push({
      providerEventId: raw,
      canonicalEventId: canonicalIdOf(raw),
      matchup: row.shortName ?? `${row.away?.abbr} @ ${row.home?.abbr}`,
      home: row.home?.name,
      away: row.away?.name,
      homeAbbr: row.home?.abbr,
      awayAbbr: row.away?.abbr,
      startTimeUtc: row.dateUtc,
      seasonType: row.seasonType,
      week: row.week,
    });
  }

  const seasonTypes = new Set(targets.map((t) => t.seasonType));
  let sportKey = null;
  if (seasonTypes.size > 1) errors.push("events: targets span preseason and regular/post — the provider keys differ; run them separately");
  else if (seasonTypes.has(1)) sportKey = NFL_PRESEASON_KEY;
  else if (targets.length) sportKey = NFL_REGULAR_KEY;

  const perCall = perCallWorstCase(regs.length ? regs : ATD_REGIONS);
  const worstCase = targets.length * perCall;
  if (Number.isInteger(maxCredits) && worstCase > maxCredits) {
    errors.push(`REFUSED: worst case ${targets.length} event(s) × 1 market × ${regs.length} region(s) = ${worstCase} credits exceeds --max-credits ${maxCredits}`);
  }
  return { ok: errors.length === 0, errors, targets, sportKey, markets: [ATD_MARKET], regions: regs, perCallWorstCase: perCall, worstCase, maxCredits };
}

// ------------------------------------------------------------------------------------------------ 2. authorization

/**
 * Read the receipt for THIS lane. Fail-closed on every term.
 *
 * The legacy NFL parser (parseAuthorizationReceipt) checks scope, ceiling, the no-floor term and no-blind-retry; it
 * refuses any DATED expiry because it takes no clock. The sport parser enforces a dated expiry against `now`. So:
 *   - legacy parse must be ok, OR its ONLY complaint is "dated expiry, read it with the sport parser" AND the sport
 *     parser (with the clock) accepts it — an expired dated receipt is therefore refused;
 *   - the receipt's own prop-market row must name `player_anytime_td` ("the receipt market row is a control");
 *   - maxCredits must fit inside the ceiling that is LEFT (ceiling − ledger.cumulativeCredits), and at least 1 must be left.
 */
export function readAtdAuthorization({ receiptText, nowIso, ledger, maxCredits }) {
  const errors = [];
  if (receiptText == null) return { ok: false, errors: ["receipt: none supplied — no receipt, no paid call"], authorization: { ok: false, errors: ["no receipt"] }, remaining: null };
  const legacy = parseAuthorizationReceipt(receiptText);
  let authorization = legacy;
  if (!legacy.ok) {
    const datedOnly = legacy.errors.length === 1 && /^expiry: .*read it with parseSportAuthorizationReceipt/.test(legacy.errors[0]);
    if (datedOnly) {
      const sport = parseSportAuthorizationReceipt(receiptText, "nfl", { now: nowIso });
      if (sport.ok) authorization = { ...sport, ok: true, ceiling: sport.ceiling, propMarkets: sport.propMarkets };
      else { errors.push(...sport.errors); authorization = { ok: false, errors: sport.errors }; }
    } else {
      errors.push(...legacy.errors);
    }
  }
  if (authorization.ok) {
    const props = propMarketsAuthorized(authorization, [ATD_MARKET]);
    if (!props.ok) {
      errors.push(`markets: the receipt does not authorize ${ATD_MARKET} — it names ${(authorization.propMarkets ?? []).length ? authorization.propMarkets.join(", ") : "no prop market at all"}`);
    }
  }
  const cumulative = ledger?.cumulativeCredits ?? 0;
  const remaining = authorization.ok ? authorization.ceiling - cumulative : null;
  if (authorization.ok) {
    if (!(remaining >= 1)) errors.push(`ceiling: cumulative ${cumulative} of ${authorization.ceiling} — ${remaining} left, not even one credit`);
    else if (Number.isInteger(maxCredits) && maxCredits > remaining) errors.push(`ceiling: --max-credits ${maxCredits} exceeds the ${remaining} credit(s) left under the receipt (${cumulative} of ${authorization.ceiling} spent)`);
  }
  return { ok: errors.length === 0, errors, authorization: errors.length ? { ...authorization, ok: false, errors } : authorization, remaining, cumulative };
}

// ------------------------------------------------------------------------------------------------ 3. cost reconciliation

/**
 * Compare the provider's own `x-requests-last` to what this call was planned to cost. If it charged MORE (or the
 * header is unreadable, so the cost cannot be shown to be within plan), the run must stop before the next call.
 */
export function reconcileCallCost({ headers, plannedWorstCase }) {
  const raw = headers?.["x-requests-last"];
  const charged = raw == null || raw === "" ? NaN : Number(raw);
  if (!Number.isFinite(charged)) return { ok: false, charged: null, planned: plannedWorstCase, reason: "x-requests-last missing or unreadable — the cost of this call cannot be shown to be within plan; stopping" };
  if (charged > plannedWorstCase) return { ok: false, charged, planned: plannedWorstCase, reason: `OVERRUN: provider charged ${charged} credit(s) for a call planned at worst ${plannedWorstCase} — stopping before the next call` };
  return { ok: true, charged, planned: plannedWorstCase, reason: null };
}

// ------------------------------------------------------------------------------------------------ 4. normalization

const isUnresolvedReason = (r) => /unresolved against either roster|ambiguous/.test(String(r ?? ""));

/**
 * Normalize ONE /events/{id}/odds response for the anytime-TD market. Pure.
 *
 * Semantics factored from capture-nfl-odds.mjs's anytime-TD branch, tightened:
 *   - every outcome resolves through the durable registry against BOTH team rosters; exactly one hit or quarantine;
 *   - only the "Yes" / single-sided outcome is a price. A "No" outcome is IGNORED (counted), never inverted;
 *     an unrecognised side ("Over", …) quarantines;
 *   - a non-numeric price quarantines; nothing is ever inferred from a model probability;
 *   - one book posting two different prices for one player quarantines both (no silent pick);
 *   - a response whose own id is not the requested odds event quarantines entirely (wrong-event guard).
 */
export function normalizeAtdEventResponse({ body, registry, teamAbbrs, capturedAt, canonicalEventId, oddsEventId = null }) {
  const rows = [];
  const quarantined = [];
  const offered = new Map();
  let ignoredNoOutcomes = 0;
  const stamp = (x) => ({ ...x, canonicalEventId });
  if (!Array.isArray(teamAbbrs) || teamAbbrs.length !== 2 || !teamAbbrs[0] || !teamAbbrs[1] || teamAbbrs[0] === teamAbbrs[1]) {
    return { rows: [], quarantined: [stamp({ reason: "both team rosters are required to resolve identity — nothing normalized" })], unresolvedIdentities: [], offeredMarkets: [], ignoredNoOutcomes: 0 };
  }
  if (oddsEventId != null && body?.id != null && String(body.id) !== String(oddsEventId)) {
    return { rows: [], quarantined: [stamp({ reason: `response is for provider event ${body.id}, not the requested ${oddsEventId} — wrong-event response quarantined whole` })], unresolvedIdentities: [], offeredMarkets: [], ignoredNoOutcomes: 0 };
  }
  for (const bk of body?.bookmakers ?? []) {
    for (const mkt of bk?.markets ?? []) {
      if (mkt?.key !== ATD_MARKET) continue;
      offered.set(mkt.key, (offered.get(mkt.key) ?? 0) + 1);
      for (const o of mkt.outcomes ?? []) {
        const side = String(o?.name ?? "").trim().toLowerCase();
        const hasDesc = o?.description != null && String(o.description).trim() !== "";
        let playerName;
        if (hasDesc) {
          if (side === "no") { ignoredNoOutcomes += 1; continue; }
          if (side !== "yes") { quarantined.push(stamp({ name: o.description, bookmaker: bk.key, reason: `unrecognised anytime-TD side "${o?.name}" — only Yes is a price` })); continue; }
          playerName = o.description;
        } else {
          if (side === "no" || side === "yes") { quarantined.push(stamp({ name: null, bookmaker: bk.key, reason: `"${o?.name}" outcome with no player label — unattributable` })); continue; }
          playerName = o?.name; // single-sided shape: the label IS the player
        }
        const price = Number(o?.price);
        if (o?.price == null || !Number.isFinite(price)) { quarantined.push(stamp({ name: playerName, bookmaker: bk.key, reason: "non-numeric price — never inferred" })); continue; }
        const results = teamAbbrs.map((abbr) => resolvePlayerRef(registry, { name: playerName, teamAbbr: abbr }));
        const hits = results.filter((r) => r.state === "RESOLVED");
        if (hits.length !== 1) {
          const ambiguous = hits.length > 1 || results.some((r) => r.state === "AMBIGUOUS");
          quarantined.push(stamp({
            name: playerName,
            bookmaker: bk.key,
            reason: ambiguous ? "ambiguous across both rosters — quarantined, never picked" : "unresolved against either roster — identity never minted from a prop label",
          }));
          continue;
        }
        rows.push(stamp({ playerId: hits[0].playerId, name: playerName, teamAbbr: teamAbbrs[results.indexOf(hits[0])], bookmaker: bk.key, price, capturedAt, sourceAsOf: mkt.last_update ?? bk.last_update ?? capturedAt }));
      }
    }
  }
  // one book, one player, two prices → neither is a price
  const byKey = new Map();
  for (const r of rows) {
    const k = `${r.bookmaker}|${r.playerId}`;
    (byKey.get(k) ?? byKey.set(k, []).get(k)).push(r);
  }
  const kept = [];
  for (const group of byKey.values()) {
    const prices = new Set(group.map((r) => r.price));
    if (prices.size > 1) {
      for (const r of group) quarantined.push(stamp({ name: r.name, bookmaker: r.bookmaker, reason: "one book posted conflicting prices for one player — neither is used" }));
    } else kept.push(group[0]);
  }
  const names = new Set();
  for (const q of quarantined) if (q.name && isUnresolvedReason(q.reason)) names.add(q.name);
  return {
    rows: kept,
    quarantined,
    unresolvedIdentities: [...names].sort().map((name) => ({ name, families: [ATD_BOARD_FAMILY] })),
    offeredMarkets: [...offered.keys()],
    ignoredNoOutcomes,
  };
}

// ------------------------------------------------------------------------------------------------ 5. orchestrator

/**
 * Execute a planned, authorized run with an injected `get(pathAndQuery) → {status, headers, body}`. The caller
 * has already verified --authorized, the receipt and the key; this function still re-checks every spend gate.
 *
 * Order: free events index → join to the ESPN schedule → per target: duplicate breaker, run budget (maxCredits),
 * ceiling gate (assertCallAllowed), ONE call, ledger, cost reconciliation. No retries. A gate refusal, a cost
 * overrun, or a provider failure other than 422 STOPS the whole run. A duplicate inside the freshness window is a
 * no-spend skip of that target. `onLedger` is called after EVERY ledger append so a crash can never lose a charge.
 */
export async function executeAtdRun({ plan, authorization, ledger, nowIso, get, scheduleRows, registry, freshnessMinutes = DEFAULT_FRESHNESS_MINUTES, onLedger = () => {}, log = () => {} }) {
  if (!plan?.ok) throw new Error("executeAtdRun: refused — plan did not pass");
  if (!authorization?.ok) throw new Error("executeAtdRun: refused — authorization did not pass");
  let L = ledger;
  const append = (entry) => { L = recordRequest(L, entry); onLedger(L); return L.requests[L.requests.length - 1]; };
  const results = [];
  const skipped = [];
  let stoppedReason = null;
  let spentThisRun = 0;
  let paidCalls = 0;

  // 0. free events index
  const evPath = `/sports/${plan.sportKey}/events`;
  let ev;
  try { ev = await get(evPath); } catch (e) {
    append({ at: nowIso, purpose: "atd-targeted: free events index (transport failure)", endpoint: evPath, status: null, headers: {}, charged: false });
    return { ledger: L, results, skipped, join: null, spentThisRun, paidCalls, stoppedReason: `events index transport failure (${e?.message ?? e}) — no paid call follows (no retries)` };
  }
  const evEntry = append({ at: nowIso, purpose: "atd-targeted: free events index", endpoint: evPath, events: Array.isArray(ev.body) ? ev.body.length : null, status: ev.status, headers: ev.headers ?? {}, charged: false });
  spentThisRun += evEntry.creditsUsed;
  if (evEntry.creditsUsed > 0) {
    return { ledger: L, results, skipped, join: null, spentThisRun, paidCalls, stoppedReason: `OVERRUN: the free events index charged ${evEntry.creditsUsed} credit(s) — stopping before any paid call` };
  }
  if (ev.status !== 200 || !Array.isArray(ev.body)) {
    return { ledger: L, results, skipped, join: null, spentThisRun, paidCalls, stoppedReason: `events index returned ${ev.status} — no paid call follows a failed preflight (no retries)` };
  }

  // 1. join every provider event against the WHOLE scheduled slate (so ambiguity is visible), then keep targets
  const canonicalRows = (scheduleRows ?? []).map((r) => ({ canonicalEventId: canonicalIdOf(r.providerEventId), home: r.home?.name, away: r.away?.name, startTimeUtc: r.dateUtc }));
  const oddsEvents = ev.body.map((e) => ({ providerEventId: String(e?.id ?? ""), home: e?.home_team, away: e?.away_team, scheduledStartUtc: e?.commence_time }));
  const join = joinOddsBatch(oddsEvents, canonicalRows);
  const byCanonical = new Map();
  for (const j of join.joined) (byCanonical.get(j.canonicalEventId) ?? byCanonical.set(j.canonicalEventId, []).get(j.canonicalEventId)).push(j);

  const perCall = plan.perCallWorstCase;
  for (const t of plan.targets) {
    const joins = byCanonical.get(t.canonicalEventId) ?? [];
    if (joins.length !== 1) {
      skipped.push({ canonicalEventId: t.canonicalEventId, reason: joins.length ? `${joins.length} provider events joined this game — ambiguous, no call` : "the provider's events index lists no event that joins this game — no call (NO_CAPTURE)" });
      continue;
    }
    const oddsEventId = joins[0].providerEventId;
    const fingerprint = atdFingerprint(oddsEventId, plan.regions);
    const dup = isDuplicateRequest(L, { fingerprint, nowIso, freshnessMinutes });
    if (dup.duplicate) { skipped.push({ canonicalEventId: t.canonicalEventId, oddsEventId, reason: `DUPLICATE: ${dup.reason}` }); log(`${t.matchup}: ${dup.reason}`); continue; }
    if (spentThisRun + perCall > plan.maxCredits) { stoppedReason = `REFUSED: ${spentThisRun} spent this run + worst case ${perCall} would exceed --max-credits ${plan.maxCredits}`; break; }
    const gate = assertCallAllowed({ authorization, ledger: L, worstCaseCredits: perCall, purpose: `atd-targeted ${t.matchup}` });
    if (!gate.ok) { stoppedReason = gate.errors.join("; "); break; }

    const callPath = `/sports/${plan.sportKey}/events/${oddsEventId}/odds?regions=${plan.regions.join(",")}&markets=${ATD_MARKET}&oddsFormat=american`;
    let res;
    paidCalls += 1;
    try { res = await get(callPath); } catch (e) {
      /* The request may have reached the provider and been charged with no headers to say so. Unaccounted spend is
         the failure mode, so it is recorded as charged (recordRequest's default of 1 when the header is unreadable). */
      const lost = append({ at: nowIso, purpose: `atd-targeted: ${ATD_MARKET} on ${t.matchup} (transport failure)`, endpoint: `/sports/${plan.sportKey}/events/${oddsEventId}/odds`, events: 1, markets: [ATD_MARKET], regions: plan.regions, status: null, headers: {}, charged: true, fingerprint, resultClass: "TRANSPORT_FAILURE" });
      spentThisRun += lost.creditsUsed;
      stoppedReason = `transport failure on ${t.matchup} (${e?.message ?? e}) — recorded as charged, no retry`;
      break;
    }
    const cls = classifyProviderResult({ status: res.status, body: res.body });
    const entry = append({
      at: nowIso,
      purpose: `atd-targeted: ${ATD_MARKET} on ${t.matchup}`,
      endpoint: `/sports/${plan.sportKey}/events/${oddsEventId}/odds`,
      events: 1,
      markets: [ATD_MARKET],
      regions: plan.regions,
      status: res.status,
      headers: res.headers ?? {},
      charged: res.status === 200,
      fingerprint,
      resultClass: res.status === 422 ? "NO_MARKET" : cls.class,
    });
    spentThisRun += entry.creditsUsed;
    const base = { canonicalEventId: t.canonicalEventId, providerEventId: t.providerEventId, oddsEventId, matchup: t.matchup, kickoffUtc: t.startTimeUtc, requestedMarkets: [ATD_MARKET], providerStatus: res.status, credits: entry.creditsUsed };
    if (res.status === 422 || (res.status === 200 && cls.class === "NO_MARKET")) {
      results.push({ ...base, state: "NOT_OFFERED", resultClass: "NO_MARKET", offeredMarkets: [], rows: [], quarantined: [], unresolvedIdentities: [], ignoredNoOutcomes: 0, note: "provider returned no anytime-TD market (422/absent) — typed evidence, never retried" });
    } else if (cls.class !== "OK") {
      stoppedReason = `${cls.class} (status ${res.status}) on ${t.matchup}: ${cls.action}`;
    } else {
      const teamAbbrs = [t.homeAbbr, t.awayAbbr];
      const n = normalizeAtdEventResponse({ body: res.body, registry, teamAbbrs, capturedAt: nowIso, canonicalEventId: t.canonicalEventId, oddsEventId });
      results.push({ ...base, state: n.offeredMarkets.includes(ATD_MARKET) ? "OFFERED" : "NOT_OFFERED", resultClass: "OK", ...n });
    }
    if (!stoppedReason) {
      const rec = reconcileCallCost({ headers: res.headers, plannedWorstCase: perCall });
      if (!rec.ok) stoppedReason = rec.reason;
    }
    if (stoppedReason) break;
  }
  return { ledger: L, results, skipped, join: { accounting: join.accounting, quarantined: join.quarantined.length }, spentThisRun, paidCalls, stoppedReason };
}

// ------------------------------------------------------------------------------------------------ 6. public derived file

export const ATD_PUBLIC_POLICY = "DraftKings first, FanDuel second, then the eligible returned book with the most complete markets (ties by provider key). One book per player, always named. No averaging, no consensus, never chosen by price, never inferred from a model probability.";

/**
 * Build the public derived file from this run's results, merged over the prior file. Pure.
 *
 * LAST-KNOWN-GOOD: an event this run did not fetch keeps its own earlier block and capturedAt; a run whose results
 * are empty returns null (write nothing). A NEW answer for an event (including NOT_OFFERED) replaces its block.
 * markets/latest.json is never touched by this lane: its propMarkets.probedEventIds would imply the other four
 * prop families were measured NOT_OFFERED for these events.
 */
export function buildAtdPublicFile({ prior, results, nowIso }) {
  const fresh = (results ?? []).filter((r) => r && (r.state === "OFFERED" || r.state === "NOT_OFFERED"));
  if (!fresh.length) return null;
  const events = new Map();
  for (const e of prior?.events ?? []) if (e?.canonicalEventId) events.set(e.canonicalEventId, e);
  for (const r of fresh) {
    const picks = selectPropPrices({ anytimeTd: { rows: r.rows ?? [] } });
    const rows = picks.map((p) => {
      const src = (r.rows ?? []).find((x) => x.playerId === p.playerId && x.bookmaker === p.sportsbook && x.canonicalEventId === p.canonicalEventId);
      return {
        canonicalEventId: p.canonicalEventId,
        playerId: p.playerId,
        name: src?.name ?? null,
        teamAbbr: src?.teamAbbr ?? null,
        book: p.sportsbook,
        price: p.yesOdds,
        capturedAt: p.capturedAt,
        sourceAsOf: src?.sourceAsOf ?? p.capturedAt,
        booksAvailable: p.booksAvailable,
      };
    }).filter((x) => x.canonicalEventId === r.canonicalEventId)
      .sort((a, b) => (a.playerId < b.playerId ? -1 : 1));
    events.set(r.canonicalEventId, {
      canonicalEventId: r.canonicalEventId,
      providerEventId: r.providerEventId,
      matchup: r.matchup,
      kickoffUtc: r.kickoffUtc,
      state: r.state,
      capturedAt: nowIso,
      requestedMarkets: [ATD_MARKET],
      offeredMarkets: r.offeredMarkets ?? [],
      unresolvedIdentities: r.unresolvedIdentities ?? [],
      rows,
    });
  }
  return {
    schemaVersion: 1,
    artifact: "nfl-anytime-td-prices",
    dataClass: "MARKET_CAPTURE_PUBLIC",
    sport: "nfl",
    updatedAt: nowIso,
    requestedMarkets: [ATD_MARKET],
    source: { id: "odds_api", name: "The Odds API", license: "paid plan; prices are market facts displayed with attribution" },
    referenceBook: REFERENCE_BOOK,
    fallbackOrder: FALLBACK_ORDER,
    policy: ATD_PUBLIC_POLICY,
    disclaimer: "Sportsbook anytime-touchdown prices captured pre-kickoff for comparison. Prices are market facts, not GameTimePicks predictions; no wager is suggested.",
    events: [...events.values()].sort((a, b) => String(a.kickoffUtc).localeCompare(String(b.kickoffUtc)) || (a.canonicalEventId < b.canonicalEventId ? -1 : 1)),
  };
}

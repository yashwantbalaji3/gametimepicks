/**
 * Reader + preflight for the targeted anytime-TD price file (app/public/data/nfl/markets/anytime-td-latest.json).
 *
 * The point of the preflight is ORDER: before any graphic is rendered, every candidate's model probability, its
 * availability and its price state are on one table, so a missing price is seen before founder review — not
 * discovered on a finished image. The model probability is read from the player board untouched; a price is only
 * ever a captured sportsbook number with its book named. Nothing here infers one from the other.
 *
 * Pure: callers pass the parsed files. Zero network.
 * Run: npx tsx --test src/lib/sports/nfl/atd-prices.test.mjs
 */

export const ATD_PRICE_STATES = Object.freeze(["PRICED", "NO_CAPTURE", "NOT_OFFERED", "IDENTITY_UNRESOLVED", "STALE", "STARTED"]);
export const DEFAULT_MAX_AGE_HOURS = 6;

const espnIdOf = (eventId) => String(eventId ?? "").trim().replace(/^nfl-/, "");
const normName = (n) => String(n ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/** Participation values that mean the player will not play, whatever eligibility says. */
const NOT_PLAYING = new Set(["OUT", "INACTIVE", "INJURED_RESERVE", "SUSPENDED", "DOUBTFUL_OUT"]);

/**
 * The price state for one player in one event.
 * @returns {{ state: string, price: number|null, book: string|null, capturedAt: string|null, sourceAsOf?: string|null, reason: string }}
 */
export function atdPriceFor({ file, eventId, playerId, nowIso, maxAgeHours = DEFAULT_MAX_AGE_HOURS, playerName = null }) {
  const none = (state, reason, extra = {}) => ({ state, price: null, book: null, capturedAt: null, reason, ...extra });
  const id = espnIdOf(eventId);
  const ev = (file?.events ?? []).find((e) => espnIdOf(e?.canonicalEventId) === id || String(e?.providerEventId) === id);
  if (!ev) return none("NO_CAPTURE", "no targeted anytime-TD capture exists for this event");
  const nowMs = Date.parse(nowIso ?? "");
  const kickMs = Date.parse(ev.kickoffUtc ?? "");
  if (Number.isFinite(nowMs) && Number.isFinite(kickMs) && nowMs >= kickMs) {
    return none("STARTED", `the event kicked off at ${ev.kickoffUtc}; a pregame price is not shown after kickoff`, { capturedAt: ev.capturedAt ?? null });
  }
  if (ev.state === "NOT_OFFERED") return none("NOT_OFFERED", `the provider returned no anytime-TD market for this event at ${ev.capturedAt}`, { capturedAt: ev.capturedAt ?? null });
  const row = (ev.rows ?? []).find((r) => r.playerId === playerId);
  if (!row) {
    const unresolved = playerName && (ev.unresolvedIdentities ?? []).some((u) => normName(u.name) === normName(playerName));
    if (unresolved) return none("IDENTITY_UNRESOLVED", `a book posted "${playerName}" but the label did not resolve to exactly one rostered player — never joined by name`, { capturedAt: ev.capturedAt ?? null });
    return none("NOT_OFFERED", `no eligible book posted an anytime-TD price for this player at ${ev.capturedAt}`, { capturedAt: ev.capturedAt ?? null });
  }
  const capMs = Date.parse(row.capturedAt ?? "");
  const priced = { price: row.price, book: row.book, capturedAt: row.capturedAt, sourceAsOf: row.sourceAsOf ?? null };
  if (!Number.isFinite(capMs) || (Number.isFinite(nowMs) && (nowMs - capMs) / 3.6e6 > maxAgeHours)) {
    return { state: "STALE", ...priced, reason: `captured ${row.capturedAt}, older than ${maxAgeHours}h — refresh before use` };
  }
  return { state: "PRICED", ...priced, reason: "captured pre-kickoff, one named book" };
}

/** The board's players ranked by model anytime-TD probability (desc, ties by playerId). Every player, OUT included. */
export function topAtdCandidates(board, n = 3) {
  return (board?.players ?? [])
    .filter((p) => Number.isFinite(p?.markets?.anytime_td?.probability))
    .sort((a, b) => b.markets.anytime_td.probability - a.markets.anytime_td.probability || (a.playerId < b.playerId ? -1 : 1))
    .slice(0, n)
    .map((p) => p.playerId);
}

/**
 * Preflight one game's candidates. `candidates` is a list of playerIds (or omitted → every board player with a
 * probability). Each row: model probability (untouched), eligibility, price state, and whether it is graphic-ready.
 */
export function atdPreflight({ file, board, eventId, candidates = null, nowIso, maxAgeHours = DEFAULT_MAX_AGE_HOURS }) {
  const ids = candidates ?? topAtdCandidates(board, Infinity);
  const byId = new Map((board?.players ?? []).map((p) => [p.playerId, p]));
  const rows = ids.map((playerId) => {
    const p = byId.get(playerId);
    const blockers = [];
    if (!p) blockers.push("NOT_ON_BOARD");
    const modelProbability = p?.markets?.anytime_td?.probability ?? null;
    if (!Number.isFinite(modelProbability)) blockers.push("NO_MODEL_PROBABILITY");
    const eligibilityState = p?.eligibility?.state ?? "UNKNOWN";
    const participation = p?.participation ?? null;
    const available = eligibilityState === "ELIGIBLE" && !NOT_PLAYING.has(String(participation ?? "").toUpperCase());
    if (!available) blockers.push(`UNAVAILABLE(${eligibilityState}${participation ? `/${participation}` : ""})`);
    const price = atdPriceFor({ file, eventId, playerId, nowIso, maxAgeHours, playerName: p?.name ?? null });
    if (price.state !== "PRICED") blockers.push(`PRICE_${price.state}`);
    return {
      playerId,
      name: p?.name ?? null,
      team: p?.team ?? null,
      modelProbability: Number.isFinite(modelProbability) ? modelProbability : null,
      eligibility: { state: eligibilityState, participation, reasons: p?.eligibility?.reasons ?? [] },
      available,
      price,
      ready: blockers.length === 0,
      blockers,
    };
  });
  return {
    eventId: espnIdOf(eventId),
    matchup: board?.matchup ?? null,
    kickoffUtc: board?.kickoffUtc ?? null,
    nowIso,
    allReady: rows.length > 0 && rows.every((r) => r.ready),
    missingPrice: rows.filter((r) => r.price.state !== "PRICED").map((r) => r.playerId),
    rows,
  };
}

/** Plain-text table for the CLI. */
export function formatPreflightTable(result) {
  const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
  const odds = (x) => (x == null ? "—" : x > 0 ? `+${x}` : String(x));
  const lines = [`ATD preflight · ${result.matchup ?? result.eventId} · kickoff ${result.kickoffUtc ?? "?"} · as of ${result.nowIso}`];
  lines.push(["player", "team", "model P(TD)", "eligibility", "price state", "price", "book", "capturedAt", "ready"].join(" | "));
  for (const r of result.rows) {
    lines.push([r.name ?? r.playerId, r.team ?? "—", pct(r.modelProbability), `${r.eligibility.state}${r.eligibility.participation ? `/${r.eligibility.participation}` : ""}`, r.price.state, odds(r.price.price), r.price.book ?? "—", r.price.capturedAt ?? "—", r.ready ? "YES" : `NO (${r.blockers.join(", ")})`].join(" | "));
  }
  lines.push(result.allReady ? "ALL READY" : `NOT READY: ${result.rows.filter((r) => !r.ready).length} of ${result.rows.length} candidate(s) blocked — a missing price is visible here, before any graphic`);
  return lines.join("\n");
}

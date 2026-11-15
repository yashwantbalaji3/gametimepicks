/**
 * Reader + preflight for the targeted anytime-TD display rows (data/internal/research/odds/nfl/anytime-td-latest.json —
 * never app/public: provider terms forbid downloadable price files; see ATD_DISPLAY_RELPATH in nfl-atd-targeted.mjs).
 *
 * The point of the preflight is ORDER: before any graphic is rendered, every candidate's model probability, its
 * availability and its price state are on one table, so a missing price is seen before founder review — not
 * discovered on a finished image. The model probability is read from the player board untouched; a price is only
 * ever a captured sportsbook number with its book named. Nothing here infers one from the other.
 *
 * Pure: callers pass the parsed files. Zero network.
 * Run: npx tsx --test src/lib/sports/nfl/atd-prices.test.mjs
 */

export const ATD_PRICE_STATES = Object.freeze(["PRICED", "NO_CAPTURE", "NOT_OFFERED", "IDENTITY_UNRESOLVED", "STALE", "STARTED", "UNVERIFIABLE"]);
export const DEFAULT_MAX_AGE_HOURS = 6;

const espnIdOf = (eventId) => String(eventId ?? "").trim().replace(/^nfl-/, "");
const normName = (n) => String(n ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/** Participation values that mean the player will not play, whatever eligibility says. */
const NOT_PLAYING = new Set(["OUT", "INACTIVE", "INJURED_RESERVE", "SUSPENDED", "DOUBTFUL_OUT"]);

/**
 * The price state for one player in one event. FAIL-CLOSED: anything that would let a stale or post-kickoff price
 * pass as current returns UNVERIFIABLE instead of PRICED —
 *   - an unparseable clock (`nowIso`) or a non-positive / non-finite `maxAgeHours`;
 *   - no parseable kickoff from EITHER the price file or the caller's own (board/schedule) `kickoffUtc`;
 *   - a row whose capturedAt is unparseable, later than now, or at/after kickoff.
 * STARTED uses the EARLIER of the price file's kickoff and the caller's kickoff, so a moved-up game cannot slip past.
 * IDENTITY_DEGRADED events (a refresh where the market was offered but our join attributed nothing) keep their prior
 * rows; a player with no row there is IDENTITY_UNRESOLVED, never NOT_OFFERED.
 * @returns {{ state: string, price: number|null, book: string|null, capturedAt: string|null, sourceAsOf?: string|null, reason: string }}
 */
export function atdPriceFor({ file, eventId, playerId, nowIso, maxAgeHours = DEFAULT_MAX_AGE_HOURS, playerName = null, kickoffUtc = null }) {
  const none = (state, reason, extra = {}) => ({ state, price: null, book: null, capturedAt: null, reason, ...extra });
  const nowMs = Date.parse(nowIso ?? "");
  if (!Number.isFinite(nowMs)) return none("UNVERIFIABLE", `the clock ${JSON.stringify(nowIso)} is not an instant — staleness and kickoff cannot be checked`);
  if (!(Number.isFinite(maxAgeHours) && maxAgeHours > 0)) return none("UNVERIFIABLE", `maxAgeHours ${JSON.stringify(maxAgeHours)} is not a positive number`);
  const id = espnIdOf(eventId);
  const ev = (file?.events ?? []).find((e) => espnIdOf(e?.canonicalEventId) === id || String(e?.providerEventId) === id);
  if (!ev) return none("NO_CAPTURE", "no targeted anytime-TD capture exists for this event");
  const kicks = [ev.kickoffUtc, kickoffUtc].map((k) => Date.parse(k ?? "")).filter(Number.isFinite);
  if (!kicks.length) return none("UNVERIFIABLE", "no parseable kickoff in the price file or the board/schedule — cannot show the price is pregame", { capturedAt: ev.capturedAt ?? null });
  const kickMs = Math.min(...kicks);
  const kickIso = new Date(kickMs).toISOString();
  if (nowMs >= kickMs) {
    return none("STARTED", `the event kicked off at ${kickIso}; a pregame price is not shown after kickoff`, { capturedAt: ev.capturedAt ?? null });
  }
  if (ev.state === "NOT_OFFERED") return none("NOT_OFFERED", `the provider returned no anytime-TD market for this event at ${ev.capturedAt}`, { capturedAt: ev.capturedAt ?? null });
  const row = (ev.rows ?? []).find((r) => r.playerId === playerId);
  if (!row) {
    const unresolved = playerName && (ev.unresolvedIdentities ?? []).some((u) => normName(u.name) === normName(playerName));
    if (unresolved || ev.state === "IDENTITY_DEGRADED") {
      return none("IDENTITY_UNRESOLVED", ev.state === "IDENTITY_DEGRADED" && !unresolved
        ? `the latest refresh (${ev.capturedAt}) could not attribute the books' labels to rostered players — our join failure, not a measured absence`
        : `a book posted "${playerName}" but the label did not resolve to exactly one rostered player — never joined by name`, { capturedAt: ev.capturedAt ?? null });
    }
    return none("NOT_OFFERED", `no eligible book posted an anytime-TD price for this player at ${ev.capturedAt}`, { capturedAt: ev.capturedAt ?? null });
  }
  const capMs = Date.parse(row.capturedAt ?? "");
  const priced = { price: row.price, book: row.book, capturedAt: row.capturedAt, sourceAsOf: row.sourceAsOf ?? null };
  if (!Number.isFinite(capMs)) return none("UNVERIFIABLE", `capturedAt ${JSON.stringify(row.capturedAt)} is not an instant`);
  if (capMs > nowMs) return none("UNVERIFIABLE", `capturedAt ${row.capturedAt} is later than now (${nowIso}) — an invalid stamp is never treated as fresh`);
  if (capMs >= kickMs) return none("UNVERIFIABLE", `capturedAt ${row.capturedAt} is at/after kickoff ${kickIso} — not a pregame price`);
  if ((nowMs - capMs) / 3.6e6 > maxAgeHours) {
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
    const price = atdPriceFor({ file, eventId, playerId, nowIso, maxAgeHours, playerName: p?.name ?? null, kickoffUtc: board?.kickoffUtc ?? null });
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

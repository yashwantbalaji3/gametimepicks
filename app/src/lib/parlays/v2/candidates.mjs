/**
 * PARLAY LAB V2 · NORMALISE PUBLISHED ENGINE CARDS INTO V2 CANDIDATES.
 *
 * Reads the JSON SHAPES of artifacts the existing engine already publishes; changes none of them.
 *
 *   MLB  parlays/risk-ladder/<date>.json — legs carry gameId/gamePk, player, market, side, line, odds, but NO book
 *        and NO capture time. The book and the capture instant are recovered by joining each leg to the same day's
 *        mlb/player-props/<date>.json board (gameId + market + player + line + side). That board stores ONE best
 *        price per prop with its provider and no per-prop timestamp, so the capture time is the board's own
 *        `generatedAt`. A leg with no board match keeps book/capturedAt null and is refused downstream; a leg whose
 *        card price differs from the board price is flagged `priceMismatch`.
 *   EPL / UFC / NFL  parlays/risk-ladder-<sport>/<date>.json — legs carry eventId, kickoff and price but only a
 *        COUNT of books, never which book, and no capture time. They are normalised as-is (book null) and refused by
 *        the operator / freshness gates, which is the honest answer for that data.
 *
 * Pure: the caller loads the documents.
 */

const str = (v) => (v == null || v === "" ? null : String(v));
const numOrNull = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function selectionLabel(l) {
  const who = l.player ?? l.team ?? null;
  const what = [l.marketLabel ?? l.market, l.side].filter(Boolean).join(" ");
  return [who, what].filter(Boolean).join(" — ") || null;
}

function boardIndex(board) {
  const m = new Map();
  for (const p of board?.props ?? []) {
    const side = String(p.selection ?? "").split(" ")[0].toLowerCase();
    m.set([p.gameId, p.market, String(p.player ?? "").toLowerCase(), p.point ?? "", side].join("|"), p);
  }
  return m;
}

/**
 * @param {any} ladder   parsed parlays/risk-ladder/<date>.json
 * @param {any} board    parsed mlb/player-props/<date>.json for the same date (or null)
 */
export function candidatesFromMlbLadder(ladder, board) {
  if (!ladder || !Array.isArray(ladder.cards)) return [];
  const date = str(ladder.date);
  const sameDayBoard = board && board.date === date ? board : null;
  const idx = boardIndex(sameDayBoard);
  return ladder.cards.map((c) => ({
    cardId: str(c.slipId),
    tier: str(c.tier),
    sport: "mlb",
    source: { artifact: `parlays/risk-ladder/${date}.json`, generatedAt: str(ladder.generatedAt) },
    legs: (c.legs ?? []).map((l) => {
      const p = idx.get([l.gameId, l.market, String(l.player ?? "").toLowerCase(), l.line ?? "", String(l.side ?? "").toLowerCase()].join("|")) ?? null;
      return {
        sport: "mlb",
        eventId: str(l.gamePk ?? l.gameId),
        eventLabel: p?.matchup ?? ([l.team, l.opponent].filter(Boolean).join(" vs ") || null),
        startUtc: str(p?.startTimeUtc),
        market: str(l.market),
        marketLabel: str(l.marketLabel),
        selection: selectionLabel(l),
        side: str(l.side),
        line: numOrNull(l.line),
        participant: str(l.player),
        team: str(l.team),
        book: str(p?.provider),
        price: numOrNull(l.odds),
        capturedAt: p ? str(sameDayBoard.generatedAt) : null,
        priceMismatch: !!p && numOrNull(p.americanOdds) !== numOrNull(l.odds),
        participantStatus: str(l.injuryStatus ?? l.playerStatus ?? l.participantStatus),
        forecastClass: str(l.forecastClass) ?? "MARKET_IMPLIED_NO_FORECAST",
        receipts: [`parlays/risk-ladder/${date}.json`, ...(p ? [`mlb/player-props/${date}.json`] : [])],
      };
    }),
  }));
}

/** @param {any} doc parsed parlays/risk-ladder-<sport>/<date>.json  @param {string} sport */
export function candidatesFromSportLadder(doc, sport) {
  if (!doc || !Array.isArray(doc.cards) || (doc.state && doc.state !== "PUBLISHED")) return [];
  const date = str(doc.date);
  const artifact = `parlays/risk-ladder-${sport}/${date}.json`;
  return doc.cards.map((c) => ({
    cardId: str(c.slipId),
    tier: str(c.tier),
    sport,
    source: { artifact, generatedAt: str(doc.generatedAt) },
    legs: (c.legs ?? []).map((l) => ({
      sport: str(l.sport) ?? sport,
      eventId: str(l.eventId ?? l.gameId),
      eventLabel: str(l.matchup),
      startUtc: str(l.kickoffUtc ?? l.startUtc ?? l.startTimeUtc),
      market: str(l.market),
      marketLabel: str(l.marketLabel),
      selection: selectionLabel(l),
      side: str(l.side),
      line: numOrNull(l.line),
      participant: str(l.player ?? l.fighter),
      team: str(l.team),
      book: str(l.book ?? l.bookmaker),
      price: numOrNull(l.odds),
      capturedAt: str(l.capturedAt),
      participantStatus: str(l.injuryStatus ?? l.playerStatus ?? l.participantStatus),
      forecastClass: str(l.forecastClass) ?? "MARKET_IMPLIED_NO_FORECAST",
      receipts: [artifact],
    })),
  }));
}

/** The ladder's own per-tier skip reasons, as engine notes for the adapter. */
export function engineNotesFrom(doc, sport) {
  return (doc?.skipped ?? []).filter((s) => s?.tier && s?.reason).map((s) => ({ tier: String(s.tier), sport, text: String(s.reason) }));
}

/** Distinct events on a props board that have not reached the 30-minute cutoff at `nowMs`. */
export function pricedEventsAhead(board, nowMs, cutoffMs = 30 * 60 * 1000) {
  const ev = new Set();
  for (const p of board?.props ?? []) {
    const t = Date.parse(p.startTimeUtc ?? "");
    if (Number.isFinite(t) && t - nowMs >= cutoffMs && p.gameId) ev.add(p.gameId);
  }
  return ev.size;
}

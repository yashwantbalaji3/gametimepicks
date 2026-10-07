/**
 * THE /ufc LIVE PANEL'S JOIN — the published card's bouts beside the gateway's bout states. Pure.
 *
 * What the panel may say, and nothing more:
 *   Upcoming            the bout has not started (walkouts and "pre-fight" are NOT started — the
 *                       ESPN MMA adapter already maps them to PRE)
 *   Round N · clock     the bout is in a round, in the provider's own round and clock
 *   Final               the provider says the bout is over, with the winner it names by athlete id —
 *                       provisional: the official result is what the post-card grader records
 *   Cancelled           the provider says the bout will not happen
 *   Unavailable         everything else: no feed, a refusal, a bout the feed does not list, or a
 *                       feed bout whose two fighters are not the card's two fighters
 *
 * NEVER the method: the scoreboard does not state one (see espn-mma.mjs). NEVER a guess: the join is
 * by ESPN bout id and then CHECKED against the card's two ESPN athlete ids, so a replaced opponent
 * (Gall v Dumas, 2026-09-26) reads Unavailable rather than borrowing another pairing's state.
 * Nothing here grades, settles or writes anything.
 */

export const UFC_LIVE_STATUS = Object.freeze({
  UPCOMING: "UPCOMING",
  IN_ROUND: "IN_ROUND",
  FINAL: "FINAL",
  CANCELLED: "CANCELLED",
  UNAVAILABLE: "UNAVAILABLE",
});

const S = UFC_LIVE_STATUS;

/** Poll from 30 minutes before the first bout to 6 hours after the last bout's scheduled start. */
export const UFC_WINDOW_LEAD_MS = 30 * 60_000;
export const UFC_WINDOW_TAIL_MS = 6 * 60 * 60_000;
export const UFC_POLL_MS = 60_000;

const t = (iso) => {
  const v = typeof iso === "string" ? Date.parse(iso) : NaN;
  return Number.isFinite(v) ? v : null;
};

/**
 * Where the reader's clock sits relative to the card: BEFORE, OPEN or AFTER. A card with no readable
 * bout start time is AFTER — the panel then shows nothing rather than inventing a window.
 */
export function ufcLiveWindow(bouts, nowMs) {
  const starts = (bouts ?? []).map((b) => t(b?.startUtc)).filter((x) => x !== null);
  if (!starts.length) return "AFTER";
  const open = Math.min(...starts) - UFC_WINDOW_LEAD_MS;
  const close = Math.max(...starts) + UFC_WINDOW_TAIL_MS;
  if (nowMs < open) return "BEFORE";
  if (nowMs > close) return "AFTER";
  return "OPEN";
}

function samePair(cardBout, feedBout) {
  const want = [cardBout?.red?.athleteId, cardBout?.blue?.athleteId].map((x) => (x == null ? null : String(x)));
  if (want.some((x) => !x) || want[0] === want[1]) return false;
  const got = (feedBout?.fighters ?? []).map((f) => (f?.athleteId == null ? null : String(f.athleteId)));
  if (got.length !== 2 || got.some((x) => !x)) return false;
  return got.includes(want[0]) && got.includes(want[1]);
}

function unavailable(cardBout, why) {
  return { boutId: cardBout?.boutId ?? null, status: S.UNAVAILABLE, round: null, clock: null, winnerName: null, why };
}

/** One card bout against the feed's bouts. */
export function joinUfcBout(cardBout, feedBouts) {
  const id = cardBout?.boutId == null ? null : String(cardBout.boutId);
  if (!id) return unavailable(cardBout, "NO_BOUT_ID");
  const matches = (feedBouts ?? []).filter((b) => b?.boutId === id);
  if (matches.length === 0) return unavailable(cardBout, "NOT_ON_FEED");
  if (matches.length > 1) return unavailable(cardBout, "AMBIGUOUS");
  const fb = matches[0];
  if (!samePair(cardBout, fb)) return unavailable(cardBout, "PAIRING_MISMATCH");

  const base = { boutId: id, round: null, clock: null, winnerName: null, why: null };
  switch (fb.state) {
    case "PRE":
      return { ...base, status: S.UPCOMING };
    case "LIVE":
      return { ...base, status: S.IN_ROUND, round: Number.isInteger(fb.round) && fb.round > 0 ? fb.round : null, clock: fb.clock ?? null };
    case "FINAL": {
      const w = fb.winnerAthleteId == null ? null : String(fb.winnerAthleteId);
      const corner = [cardBout.red, cardBout.blue].find((c) => w && String(c?.athleteId) === w);
      return { ...base, status: S.FINAL, winnerName: corner?.name ?? null };
    }
    case "POSTPONED":
    case "CANCELLED":
      return { ...base, status: S.CANCELLED };
    default:
      return unavailable(cardBout, "UNKNOWN_STATE");
  }
}

/**
 * The whole card. `payload` is the gateway's answer (a scoreboard body or a refusal) or null when
 * the request itself failed. A refusal, a malformed body, or (when `expectedDate` is given) a body
 * dated for another day leaves every bout Unavailable.
 *
 * @param {Array<any>} cardBouts
 * @param {any} payload
 * @param {string | null} [expectedDate]
 */
export function joinUfcCard(cardBouts, payload, expectedDate = null) {
  /* A body that names another date describes another card, and is treated as no answer at all. */
  const dateOk = !expectedDate || payload?.date === expectedDate;
  const feedOk = Boolean(payload && payload.unavailable !== true && Array.isArray(payload.events) && dateOk);
  const rows = (cardBouts ?? []).map((b) => (feedOk ? joinUfcBout(b, payload.events) : unavailable(b, "NO_FEED")));
  const fetchedAt = feedOk && typeof payload.fetchedAt === "string" ? payload.fetchedAt : null;
  return { feedOk, fetchedAt, rows };
}

/**
 * Keep polling while anything can still change: no feed yet, a bout upcoming or in a round, or a
 * feed that joined nothing at all. Stops once every joined bout is final or cancelled.
 */
export function ufcKeepPolling(joined) {
  if (!joined?.feedOk) return true;
  const rows = joined.rows ?? [];
  if (!rows.length) return false;
  if (rows.every((r) => r.status === S.UNAVAILABLE)) return true;
  return rows.some((r) => r.status === S.UPCOMING || r.status === S.IN_ROUND);
}

/** The words a row shows. Plain, provider-faithful, never a method, never a guess. */
export function ufcStatusText(row) {
  switch (row?.status) {
    case S.UPCOMING:
      return "Upcoming";
    case S.IN_ROUND:
      if (row.round == null) return "In progress";
      return row.clock ? `Round ${row.round} · ${row.clock}` : `Round ${row.round}`;
    case S.FINAL:
      return row.winnerName ? `Final · ${row.winnerName} won` : "Final · no winner stated by the feed";
    case S.CANCELLED:
      return "Cancelled";
    default:
      return "Unavailable";
  }
}

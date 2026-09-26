/**
 * THE LIVE-MARKET TRUTH CONTRACT (Phase H).
 *
 * The founder's amendment to the P171 receipt authorizes in-play NFL team-market capture on one
 * condition: that what comes back is actually a live market. This file is that condition, written
 * as six checks a response must pass before a single number from it may be recorded as live.
 *
 * ── WHY THE FIFTH CHECK IS THE ONE THAT MATTERS ─────────────────────────────────────────────────
 *
 * An odds feed that has stopped updating a started game does not say so. It keeps answering, with
 * the last price it had, and a `commence_time` in the past. Every superficial signal of liveness is
 * present: the event is in progress, the payload is well-formed, a book is named. The only thing
 * that distinguishes a live market from a frozen one replayed back is whether the VALUE has moved
 * against the pregame snapshot we already committed — or, failing that, whether the book's own
 * `last_update` is after kickoff.
 *
 * So this refuses on sameness. A response identical to the pregame capture is not evidence of a
 * live market; it is evidence of a feed that has not moved, and treating it as the former is how a
 * stale number gets published under a live label.
 *
 * ── AND IT REFUSES BY DEFAULT ───────────────────────────────────────────────────────────────────
 *
 * Every check returns a named failure rather than a boolean, because "the probe failed" is not an
 * actionable sentence and the founder asked for evidence either way. A missing field is a failure,
 * not a pass — an absent `last_update` cannot show freshness, and an unnamed book cannot show
 * attribution.
 */

import { splitMatchup } from "../nfl/matchup.mjs";

/** The only market keys this contract will consider. Props are refused in this phase, by name. */
export const IN_PLAY_TEAM_MARKETS = Object.freeze(["h2h", "spreads", "totals"]);

const parse = (iso) => {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? t : null;
};

/**
 * Is this event genuinely under way, from evidence that costs nothing?
 *
 * ⚠ CALLED BEFORE THE PAID CALL, NEVER AFTER. The founder authorized one probe "during a genuinely
 * live NFL game". Deciding that after spending the credit would mean the credit is spent either
 * way, and a probe fired at a pregame slate proves nothing while still costing the allowance.
 *
 * `state` comes from the free live gateway (ESPN), and kickoff from the committed board — two
 * independent sources, both free, and they must AGREE. A provider saying "in progress" for a game
 * whose kickoff is in the future is a contradiction, not a green light.
 */
export function eventIsGenuinelyLive({ liveState, kickoffUtc, nowIso }) {
  const now = parse(nowIso);
  const kick = parse(kickoffUtc);
  if (now == null) return { live: false, reason: "no usable clock" };
  if (kick == null) return { live: false, reason: "no usable kickoff instant on the board" };
  if (kick > now) return { live: false, reason: `kickoff ${kickoffUtc} is in the future — a pregame slate is not a live game` };
  if (liveState !== "LIVE" && liveState !== "DELAYED") {
    return { live: false, reason: `the free live feed reports ${liveState ?? "no state"}, not an in-progress game` };
  }
  return { live: true, reason: null, minutesSinceKickoff: Math.round((now - kick) / 60000) };
}

/**
 * Grade one provider event against the six-part contract.
 *
 * @param {object} args.providerEvent  the raw `/odds` event for this game
 * @param {object} args.pregame        the committed pregame snapshot for the same game, or null
 * @param {string} args.capturedAt     the instant WE made the call
 * @param {string} args.kickoffUtc     the game's kickoff
 */
export function gradeLiveMarketEvidence({ providerEvent, pregame, capturedAt, kickoffUtc }) {
  const checks = [];
  const fail = (id, detail) => checks.push({ id, pass: false, detail });
  const pass = (id, detail) => checks.push({ id, pass: true, detail });

  const capMs = parse(capturedAt);
  const kickMs = parse(kickoffUtc);

  // 1 — the event is already in progress, per the provider's own commence_time.
  const commence = providerEvent?.commence_time ?? null;
  const commenceMs = parse(commence);
  if (commenceMs == null) fail("eventInProgress", "the provider event carries no usable commence_time");
  else if (capMs != null && commenceMs <= capMs) pass("eventInProgress", `commence_time ${commence} precedes the capture`);
  else fail("eventInProgress", `commence_time ${commence} is after the capture — this is a pregame event`);

  // 2 — our capture instant is after kickoff.
  if (capMs == null || kickMs == null) fail("capturePostKickoff", "kickoff or capture instant unreadable");
  else if (capMs > kickMs) pass("capturePostKickoff", `captured ${Math.round((capMs - kickMs) / 60000)} min after kickoff`);
  else fail("capturePostKickoff", "the capture instant is at or before kickoff");

  // 3 — a NAMED sportsbook, never an aggregate.
  const books = (providerEvent?.bookmakers ?? []).filter((b) => b?.key && b?.title);
  if (!books.length) fail("sportsbookAttribution", "no named bookmaker in the response");
  else pass("sportsbookAttribution", `${books.length} named book(s): ${books.slice(0, 4).map((b) => b.key).join(", ")}`);

  // 4 — the provider's own market identity, and only the authorized team markets.
  const marketKeys = [...new Set(books.flatMap((b) => (b.markets ?? []).map((m) => m?.key).filter(Boolean)))];
  const authorized = marketKeys.filter((k) => IN_PLAY_TEAM_MARKETS.includes(k));
  const unauthorized = marketKeys.filter((k) => !IN_PLAY_TEAM_MARKETS.includes(k));
  if (!authorized.length) fail("marketIdentity", `no authorized team market returned (saw: ${marketKeys.join(", ") || "none"})`);
  else if (unauthorized.length) fail("marketIdentity", `response carries unauthorized markets: ${unauthorized.join(", ")}`);
  else pass("marketIdentity", `team markets present and only those: ${authorized.join(", ")}`);

  /*
   * 5 — THE VALUE IS NOT THE PREGAME SNAPSHOT REPLAYED.
   *
   * Two independent ways to show it, and either is enough. The stronger is a MOVED value against
   * the snapshot we already committed. The weaker, used when we hold no comparable pregame line, is
   * the book's own `last_update` landing after kickoff — the provider stating its own freshness.
   *
   * With neither, the check FAILS. An unchanged line and no freshness stamp is exactly what a feed
   * that stopped updating looks like, and it must not read as a live market.
   */
  const liveLines = linesOf(providerEvent);
  const pregameLines = pregame ? linesOf(pregame) : new Map();
  const moved = [];
  const same = [];
  for (const [key, value] of liveLines) {
    if (!pregameLines.has(key)) continue;
    (pregameLines.get(key) === value ? same : moved).push({ key, pregame: pregameLines.get(key), live: value });
  }
  const freshBooks = books.filter((b) => {
    const u = parse(b.last_update);
    return u != null && kickMs != null && u > kickMs;
  });
  if (moved.length) {
    pass("notPregameReplay", `${moved.length} line(s) moved since the pregame capture — e.g. ${moved[0].key} ${moved[0].pregame} → ${moved[0].live}`);
  } else if (freshBooks.length) {
    pass("notPregameReplay", `no comparable line moved, but ${freshBooks.length} book(s) stamp last_update after kickoff (e.g. ${freshBooks[0].key} ${freshBooks[0].last_update})`);
  } else if (!pregameLines.size) {
    fail("notPregameReplay", "no committed pregame line to compare against and no book stamps last_update after kickoff — freshness is unproven");
  } else {
    fail("notPregameReplay", `every comparable line is identical to the pregame capture (${same.length} checked) and no book stamps last_update after kickoff — this is a replayed snapshot, not a live market`);
  }

  // 6 — the frozen pregame block is untouched. Asserted by the caller over the committed bytes.
  return {
    checks,
    ok: checks.every((c) => c.pass),
    failed: checks.filter((c) => !c.pass).map((c) => c.id),
    moved,
    same,
    books: books.map((b) => ({ key: b.key, title: b.title, lastUpdate: b.last_update ?? null })),
    marketKeys,
  };
}

/**
 * Every priced line on an event, flattened to `book|market|outcome` → value.
 *
 * The VALUE is the point (a spread's point, a total's point, a moneyline's price), because that is
 * what moves in play. Keyed by book as well as market so two books disagreeing is not mistaken for
 * one book moving.
 */
export function linesOf(providerEvent) {
  const out = new Map();
  for (const b of providerEvent?.bookmakers ?? []) {
    for (const m of b?.markets ?? []) {
      for (const o of m?.outcomes ?? []) {
        if (!b?.key || !m?.key || !o?.name) continue;
        const value = m.key === "h2h" ? o.price : (o.point ?? o.price);
        if (value == null) continue;
        out.set(`${b.key}|${m.key}|${o.name}`, value);
      }
    }
  }
  return out;
}

/**
 * READ THE FREE LIVE GATEWAY — and keep "nothing is live" apart from "I could not ask".
 *
 * ⚠ COLLAPSING THOSE TWO IS HOW A SUNDAY PASSES WITH NOTHING FIRING AND THE LOG READING LIKE A QUIET
 * AFTERNOON. Both callers refuse to spend on either — an unestablished liveness is not a live game —
 * so the only thing at stake is whether a human can tell afterwards which one happened. Found by
 * pointing the probe at an unreachable host at 19:30Z on a Sunday, two and a half hours after
 * kickoff: it reported "NO LIVE NFL GAME" and nothing else.
 *
 * Returns a TYPED result rather than an empty Map, because an empty Map is the shape both answers
 * would otherwise take.
 *
 * @param {object} args.fetchImpl  injected for testing; defaults to global fetch
 * @returns {Promise<{ok: boolean, reason: string|null, states: Map<string,string>}>}
 */
export async function readLiveStates({ base, etDate, fetchImpl = globalThis.fetch, timeoutMs = 20_000 } = {}) {
  try {
    const res = await fetchImpl(`${base}?sport=nfl&date=${etDate}`, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    if (!res?.ok) return { ok: false, reason: `gateway HTTP ${res?.status ?? "?"}`, states: new Map() };
    const j = await res.json();
    /* A typed refusal from the gateway is an answer about the GATEWAY, not about the slate. */
    if (j?.unavailable) return { ok: false, reason: `gateway refused: ${j.reason}`, states: new Map() };
    return { ok: true, reason: null, states: new Map((j?.events ?? []).map((e) => [String(e.providerEventId ?? e.eventId), e.state])) };
  } catch (e) {
    return { ok: false, reason: `gateway unreachable: ${String(e?.message ?? e).slice(0, 60)}`, states: new Map() };
  }
}

/**
 * Fold several days' gateway reads into one answer.
 *
 * `UNKNOWN` only when EVERY read failed: one bad day beside a good one still tells us what is live,
 * and refusing on a partial failure would make the lane hostage to the quietest date in the window.
 */
export function foldLiveStates(results) {
  const states = new Map();
  const failures = [];
  for (const r of results ?? []) {
    if (!r?.ok) { failures.push(r?.reason ?? "unknown failure"); continue; }
    for (const [k, v] of r.states) states.set(k, v);
  }
  if (failures.length && !states.size) return { known: false, failures, states: new Map() };
  return { known: true, failures, states };
}

/**
 * DOES THIS PROVIDER EVENT NAME THE GAME WE ASKED ABOUT?
 *
 * ⚠ ONE JOIN, BECAUSE THERE WERE TWO AND BOTH WERE WRONG. The probe and the pilot each carried their
 * own copy, splitting the board's matchup label on `@`. ESPN writes a neutral-site game as
 * "BAL VS DAL" (Maracanã) and "IND VS WSH" (Tottenham), and on that form BOTH copies silently failed
 * to match: the label split to one part, so the comparison was `"baltimoreravens".includes("balvs")`.
 *
 * The consequence is not cosmetic. The ONE authorized 3-credit Phase H probe could be spent on a game
 * it then could not find, recording a false LIVE_MARKET_UNSUPPORTED — closing the whole lane on a
 * string format, with an explicit instruction not to probe again for a better answer.
 *
 * ⚠ AND THE PILOT'S COPY COULD THROW, though not on that form: it lacked the probe's both-halves
 * guard, so a label with NO separator ("BAL") left `home` undefined and reached `home.slice(0, 5)`
 * once the away name matched. `&&` short-circuited the `VS` case before it got there, which is
 * exactly why reading the code was not enough — I claimed a throw, ran it, and was wrong. The fix
 * covers both: unreadable labels return false, and nothing here can throw.
 *
 * ⚠ THE PROVIDER'S EVENT ID IS ITS OWN, not ESPN's, so the id path below almost never hits and the
 * name fallback is load-bearing rather than a safety net.
 */
export function providerEventMatches(providerEvent, target) {
  if (!providerEvent || !target) return false;
  if (target.id != null && String(providerEvent.id ?? "") === String(target.id)) return true;
  const { away, home } = splitMatchup(target.matchup);
  if (!away || !home) return false;
  const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const a = norm(away), h = norm(home);
  if (!a || !h) return false;
  return norm(providerEvent.away_team).includes(a.slice(0, 5)) && norm(providerEvent.home_team).includes(h.slice(0, 5));
}

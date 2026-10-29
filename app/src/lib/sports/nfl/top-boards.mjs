/**
 * NFL TOP BOARDS — the five founder boards (2026-10-29), weekly and per ET day. Pure: boards in, document out; no IO,
 * no clock (the instant is an argument, so a regeneration at the same --now is byte-identical).
 *
 *   Top 5 passing yards · Top 5 rushing yards · Top 5 receiving yards · Top 5 receptions · Top 5 anytime TD
 *
 * Rules (founder requirement 2026-10-29, "one canonical value everywhere"):
 *   - ONLY THE OFFICIAL FORECAST. Rows come from the per-game OFFICIAL player boards, ranked by the ONE shared rule
 *     (board-ranking.mjs `rankFamily`) on the family's official headline (`BOARD_METRIC`: the median for yards and
 *     receptions, the probability for anytime TD). Never a sportsbook price, a simulation or a fallback: a captured
 *     price may ride BESIDE a row (the typed slot the weekly boards already carry); it never orders or fills one.
 *   - A FAMILY THAT IS NOT PUBLICATION-QUALIFIED NEVER RANKS. ESTIMATE, WITHHELD or ABSENT on any board in scope → no
 *     rows, and a readiness entry that states the actual state ("Passing yards: not yet published — the model has not
 *     met its calibration standard (forward test 188/300)").
 *   - EXACT NUMBERS. `value`, `p10`, `p90` are the board's stored numbers, unrounded; surfaces round at render only
 *     (forecast-view.mjs `formatValue`), so a board row and the game page print the same digits.
 *   - TOP-N IS A MAXIMUM. Fewer cleared players publish fewer rows.
 *   - SCOPES. `weekly` = the period's events still to kick off (all of them pregame); `daily` = the same events grouped
 *     by the ET date of kickoff, one entry per date that still has a game to come.
 */

import { BOARD_METRIC, familyStateAcross, poolWithheldTeams, rankFamily } from "./board-ranking.mjs";
import { opponentIn } from "./matchup.mjs";

export const TOP_BOARDS_CONTRACT = "nfl-top-boards@1";
export const TOP_BOARD_SIZE = 5;
/** The one source every row comes from. A test fails if any surface ranks from another engine. */
export const TOP_BOARD_SOURCE = "OFFICIAL_PLAYER_BOARD";

/** The five boards, in display order. `method` is the official headline the family ranks by. */
export const TOP_BOARD_SPECS = Object.freeze(
  [
    { id: "top5_pass_yds", family: "player_pass_yds", label: "Passing yards" },
    { id: "top5_rush_yds", family: "player_rush_yds", label: "Rushing yards" },
    { id: "top5_reception_yds", family: "player_reception_yds", label: "Receiving yards" },
    { id: "top5_receptions", family: "player_receptions", label: "Receptions" },
    { id: "top5_anytime_td", family: "anytime_td", label: "Anytime touchdown" },
  ].map((s) => Object.freeze({ ...s, method: BOARD_METRIC[s.family], title: `Top ${TOP_BOARD_SIZE} · ${s.label}` })),
);

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const kickMs = (iso) => Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
/** ET calendar date (YYYY-MM-DD) of a kickoff instant. */
export const etDateOfKickoff = (iso) => ET_DAY.format(new Date(kickMs(iso)));

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
/** `text` is the whole line ("Passing yards: not yet published — …"); `detail` is the clause after the dash, for a
 *  surface that already names the family and the state (the FamilyTabs "Not published yet." panel). */
const say = (label, status, detail) => ({ text: `${label}: ${status} — ${detail}`, detail });

/**
 * The plain readiness line for a family that does not rank. Built only from the board's own state and reason and the
 * forward-test evidence of the model behind it — never a hand-typed status.
 * @param {{ label: string, state: string|null, reason?: string|null, forward?: any, poolWithheld?: { teams: number, of: number }|null }} o
 */
export function readinessFor({ label, state, reason = null, forward = null, poolWithheld = null }) {
  if (state === "PUBLISHED" && !poolWithheld) return { state: "PUBLISHED", boardState: "PUBLISHED", standard: null, forwardTest: null, text: null };
  const forwardTest = forward ? { state: forward.state ?? null, n: isNum(forward.n) ? forward.n : null, needed: isNum(forward.needed) ? forward.needed : null } : null;
  if (state === "PUBLISHED" && poolWithheld) {
    return {
      state: "NOT_PUBLISHED", boardState: "PUBLISHED", code: "TEAM_POOL_WITHHELD", standard: null, forwardTest,
      ...say(label, "not ranked", `on ${poolWithheld.teams} of ${poolWithheld.of} teams the players' modelled shares add up to more of the team's opportunity than exists, so a ranking would leave those teams out`),
    };
  }
  if (!state) {
    return { state: "NOT_PUBLISHED", boardState: "ABSENT", code: "NO_OFFICIAL_PROJECTION", standard: null, forwardTest, ...say(label, "not yet published", "there is no official projection for this statistic on these games' player boards") };
  }
  const standard = /calibrat|calOk|\bECE\b/i.test(String(reason ?? "")) ? "calibration" : "publication";
  let fwd = "";
  if (forwardTest?.state === "ACCUMULATING" && forwardTest.n != null && forwardTest.needed != null) fwd = ` (forward test ${forwardTest.n}/${forwardTest.needed})`;
  else if (forwardTest?.state === "FORWARD_BREACHED" && forwardTest.n != null) fwd = ` (forward test below its bars after ${forwardTest.n} graded player-games)`;
  else if (forwardTest?.n != null) fwd = ` (forward test: ${forwardTest.n} graded player-games)`;
  return { state: "NOT_PUBLISHED", boardState: state, code: state === "ESTIMATE" ? "BELOW_PUBLICATION_BAR" : "WITHHELD", reason: reason ?? null, standard, forwardTest, ...say(label, "not yet published", `the model has not met its ${standard} standard${fwd}`) };
}

/**
 * The five boards over one set of per-game boards.
 * @param {Array<any>} boards  per-game official player boards in scope
 * @param {{ now: string, slotFor: Function, forwardFor: Function }} ctx
 */
function scopeBoards(boards, { now, slotFor, forwardFor }) {
  return TOP_BOARD_SPECS.map((spec) => {
    const base = { id: spec.id, family: spec.family, method: spec.method, title: spec.title, label: spec.label, source: TOP_BOARD_SOURCE, topN: TOP_BOARD_SIZE };
    const st = familyStateAcross(boards, spec.family);
    const withheld = st?.state === "PUBLISHED" ? poolWithheldTeams(boards, spec.family) : [];
    const readiness = readinessFor({
      label: spec.label, state: st?.state ?? null, reason: st?.reason ?? null,
      forward: forwardFor(spec.family, st?.model ?? null),
      poolWithheld: withheld.length ? { teams: withheld.length, of: boards.length * 2 } : null,
    });
    if (readiness.state !== "PUBLISHED") return { ...base, state: "NOT_PUBLISHED", readiness };
    const blocked = [];
    const rows = rankFamily(boards, spec.family, spec.method, { asOf: now, blocked }).slice(0, TOP_BOARD_SIZE).map(({ board: b, player: p, market: m }, i) => ({
      rank: i + 1,
      playerId: p.playerId,
      name: p.name,
      team: p.team,
      opponent: opponentIn(b.matchup, p.team),
      providerEventId: String(b.providerEventId),
      kickoffUtc: b.kickoffUtc,
      etDate: etDateOfKickoff(b.kickoffUtc),
      participation: p.participation,
      value: m[spec.method],
      ...(spec.method === "probability" ? {} : { p10: isNum(m.p10) ? m.p10 : null, p90: isNum(m.p90) ? m.p90 : null }),
      ...slotFor(b.providerEventId, p.playerId, spec.family, p.name),
    }));
    return { ...base, state: "PUBLISHED", basis: st.basis ?? null, rows, availabilityExcluded: blocked.length };
  });
}

/**
 * The `topBoards` block of the weekly-boards artifact.
 * @param {{ weekBoards: Array<any>, now: string, slotFor: Function, forwardFor?: Function }} o
 *   weekBoards = every per-game board of the forecast period; slotFor = prop-price-lookup's typed slot;
 *   forwardFor(family, modelVersion) = the forward-test entry for that model (family-gate.mjs forwardEvidenceFor).
 */
export function buildTopBoards({ weekBoards, now, slotFor, forwardFor = () => null }) {
  if (!Number.isFinite(Date.parse(now ?? ""))) throw new Error("buildTopBoards: now (ISO) is required");
  const t = Date.parse(now);
  const ordered = [...weekBoards].sort((a, b) => kickMs(a.kickoffUtc) - kickMs(b.kickoffUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
  const upcoming = ordered.filter((b) => kickMs(b.kickoffUtc) > t);
  const weeklyIn = upcoming.length ? upcoming : ordered;
  const ctx = { now, slotFor, forwardFor };
  const ids = (bs) => bs.map((b) => String(b.providerEventId));

  const weekly = {
    scope: {
      kind: upcoming.length && upcoming.length < ordered.length ? "REMAINING_EVENTS" : "FULL_WEEK",
      eventsIncluded: weeklyIn.length,
      eventsDroppedAfterKickoff: upcoming.length ? ordered.length - upcoming.length : 0,
      events: ids(weeklyIn),
    },
    boards: scopeBoards(weeklyIn, ctx),
  };

  const byDate = new Map();
  for (const b of ordered) {
    const d = etDateOfKickoff(b.kickoffUtc);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(b);
  }
  const daily = [];
  for (const [etDate, all] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const left = all.filter((b) => kickMs(b.kickoffUtc) > t);
    if (!left.length) continue; // a finished day has no live board; its frozen Top-5 is the Results record
    daily.push({
      etDate,
      scope: { kind: left.length < all.length ? "REMAINING_EVENTS" : "FULL_DAY", eventsIncluded: left.length, eventsDroppedAfterKickoff: all.length - left.length, events: ids(left) },
      boards: scopeBoards(left, ctx),
    });
  }

  return {
    contract: TOP_BOARDS_CONTRACT,
    source: TOP_BOARD_SOURCE,
    size: TOP_BOARD_SIZE,
    ranking: "Official player board only, ranked by the official median (yards, receptions) or the official probability (anytime touchdown); cleared players only; a maximum, never a quota. Sportsbook prices, simulations and fallbacks never rank.",
    weekly,
    daily,
  };
}

/** Today's daily entry (ET date of `nowIso`), or null. */
export function dailyFor(topBoards, etDate) {
  return (topBoards?.daily ?? []).find((d) => d.etDate === etDate) ?? null;
}

/**
 * NFL LIVE ADAPTER — pure normalization of ESPN public scoreboard + summary JSON. NO network, NO fs.
 *
 * SOURCE POSTURE. `site.api.espn.com` is a public, key-free JSON surface this repository already
 * reads for schedules, results, rosters and injuries (`source-registry.mjs` → `espn_scoreboard`,
 * `espn_site_api_nfl`, both free / PUBLIC_DISPLAY). It is NOT a contracted developer API, so nothing
 * here may depend on a field being present and no component may see an ESPN field name. That is the
 * whole reason this module exists.
 *
 * VERIFIED 2026-09-15: scoreboard (200, 158 KB, 16 events) gives event.id · date ·
 * status.type.{state,detail,completed} · status.{period,displayClock} · competitors[].{homeAway,score,
 * team.{id,abbreviation,displayName}}. `competitions[0].situation` is ABSENT on finished games, so it
 * is read defensively and omitted rather than defaulted. summary?event=<id> (200, 567 KB — DETAIL
 * ONLY, never batch) gives boxscore.players[].statistics[{name,labels,athletes[]}].
 *
 * THE IDENTITY WIN. ESPN's event id IS GameTime's NFL event id (`/nfl/game/[eventId]`), and ESPN's
 * athlete id IS GameTime's player id with the `nfl-athlete-` prefix (`player-board/<eventId>.json`).
 * Both joins are exact and need no name matching — the failure mode §11 exists to prevent.
 */
import { makeCompetitor, makeEnvelope, makePlayerStat } from "../contract.mjs";

const num = (x) => {
  const n = typeof x === "string" ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/**
 * ESPN status → LIVE_STATES.
 *
 * The coarse `state` (pre|in|post) is not enough: a postponed game is `pre` and a cancelled one is
 * `post`, so the specific status NAME is consulted first. An unrecognized name with a known coarse
 * state still resolves; an unrecognized both resolves to UNKNOWN rather than to a plausible guess.
 */
export function mapNflState(status) {
  const name = status?.type?.name ?? "";
  if (name === "STATUS_POSTPONED") return "POSTPONED";
  if (name === "STATUS_CANCELED" || name === "STATUS_CANCELLED") return "CANCELLED";
  if (name === "STATUS_DELAYED" || name === "STATUS_RAIN_DELAY") return "DELAYED";
  if (name === "STATUS_HALFTIME" || name === "STATUS_END_PERIOD") return "LIVE";
  switch (status?.type?.state) {
    case "in":
      return "LIVE";
    case "post":
      // `completed` distinguishes a played-out game from a post-state that never produced one.
      return status?.type?.completed === false ? "UNKNOWN" : "FINAL";
    case "pre":
      return "PRE";
    default:
      return "UNKNOWN";
  }
}

/** Normalize ONE scoreboard `event`. An event with no id is refused rather than synthesized. */
export function normalizeNflEvent(event, fetchedAt) {
  const id = event?.id;
  if (typeof id !== "string" || id.length === 0) return null;

  const comp = event?.competitions?.[0] ?? {};
  const status = event?.status ?? comp?.status ?? {};
  const state = mapNflState(status);
  const scored = state !== "POSTPONED" && state !== "CANCELLED" && state !== "PRE";

  const sideOf = (homeAway) => {
    const c = (comp?.competitors ?? []).find((x) => x?.homeAway === homeAway) ?? {};
    return makeCompetitor({
      teamId: c?.team?.id ? String(c.team.id) : null,
      abbr: c?.team?.abbreviation ?? null,
      name: c?.team?.displayName ?? null,
      score: scored ? num(c?.score) : null,
    });
  };

  const periodNumber = num(status?.period);
  const period =
    periodNumber === null && !status?.type?.shortDetail
      ? null
      : {
          number: periodNumber,
          label: status?.type?.shortDetail ?? null,
          // The clock is meaningless once the game is over; "0:00" on a final reads as a live clock.
          clock: state === "LIVE" && typeof status?.displayClock === "string" ? status.displayClock : null,
          phase: status?.type?.name ?? null,
        };

  // Situation exists only while a game is in play. Verified absent on every finished event.
  const s = comp?.situation;
  const situation =
    state === "LIVE" && s
      ? {
          downDistance: s?.shortDownDistanceText ?? s?.downDistanceText ?? null,
          possessionTeamId: s?.possession ? String(s.possession) : null,
          yardLine: s?.possessionText ?? null,
        }
      : null;

  return makeEnvelope({
    eventId: id,
    sport: "NFL",
    provider: "espn-public",
    providerEventId: id,
    startTime: typeof event?.date === "string" ? event.date : (comp?.date ?? null),
    state,
    stateDetail: status?.type?.detail ?? null,
    sourceUpdatedAt: null, // ESPN's scoreboard publishes no update stamp — never fabricated
    fetchedAt,
    period,
    competitors: { home: sideOf("home"), away: sideOf("away") },
    situation,
    playerStats: null, // filled only by the per-event summary, never by the batch scoreboard
  });
}

/** Normalize a whole scoreboard payload. */
export function normalizeNflScoreboard(payload, fetchedAt) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  return events.map((e) => normalizeNflEvent(e, fetchedAt)).filter((e) => e !== null);
}

/**
 * ESPN box-score stat group + column label → the GameTime market key the player board already uses.
 *
 * ONLY families GameTime publishes are mapped. Passing yards is deliberately absent: the family is
 * ESTIMATE (below its own bar) and P318 is STOP, so there is no published range to compare against
 * and a live passing-yards row would be a number with nothing truthful beside it.
 */
/*
 * The PUBLISHED prop families, and only those. Each key is `<group name>:<column label>` as ESPN's
 * own box score spells them, verified against a real finished game (event 401872948, ATL @ GB, whose
 * groups are passing / rushing / receiving / fumbles / defensive / interceptions / kickReturns /
 * puntReturns / kicking / punting).
 *
 * ── WHY PASSING YARDS IS ABSENT THOUGH THE COLUMN IS RIGHT THERE ────────────────────────────────
 *
 * `passing:YDS` exists in every payload and is trivially mappable. It stays out because
 * `player_pass_yds` is an ESTIMATE family and P318 is STOP: the decomposed candidate failed at its
 * preregistered calibration bar, so there is no published range for a live value to be compared
 * against. A live number beside a forecast that was rejected at its own bar presents unvalidated
 * model output as a live comparison. `adapters.test.mjs` NFL 8 keeps the passing group in its fixture
 * precisely so this remains a live assertion rather than an accident.
 *
 * ── AND WHY ANYTIME TOUCHDOWN IS NOT HERE ──────────────────────────────────────────────────────
 *
 * There is no single TD column to map. A player's touchdowns are spread across `rushing:TD`,
 * `receiving:TD`, `defensive:TD`, `interceptions:TD`, `kickReturns:TD` and `puntReturns:TD`, and two
 * of those OVERLAP — a pick-six is counted by both `defensive` and `interceptions` — while
 * `passing:TD` is touchdowns THROWN, which the thrower did not score.
 *
 * The exact fix would be event-level scoring plays, and that is checked, not assumed: on the same
 * real payload `scoringPlays[].athletesInvolved` is EMPTY and each play carries only prose
 * ("Christian Watson 4 Yd pass from Jordan Love"). Reading a scorer out of that means matching a
 * name, which is the one thing this adapter exists to avoid. So ATD stays out of the live row until a
 * feed states the scorer by id, rather than shipping a count assembled from overlapping columns.
 */
const MARKET_BY_GROUP_LABEL = Object.freeze({
  "receiving:YDS": "player_reception_yds",
  "receiving:REC": "player_receptions",
  "rushing:YDS": "player_rush_yds",
});

/**
 * Extract factual cumulative player stats from a `summary?event=` payload.
 *
 * Every value is read out of the box score by its own column label — never by column POSITION, which
 * would silently mis-read the day ESPN inserts a column. A label we do not map is skipped.
 */
export function normalizeNflPlayerStats(summary, { eventId, fetchedAt }) {
  const teams = summary?.boxscore?.players;
  if (!Array.isArray(teams)) return [];
  const out = [];
  for (const team of teams) {
    const teamAbbr = team?.team?.abbreviation ?? null;
    for (const group of team?.statistics ?? []) {
      const labels = Array.isArray(group?.labels) ? group.labels : [];
      for (const row of group?.athletes ?? []) {
        const espnId = row?.athlete?.id;
        if (!espnId) continue; // identity is never minted from a name
        const stats = Array.isArray(row?.stats) ? row.stats : [];
        labels.forEach((label, i) => {
          const market = MARKET_BY_GROUP_LABEL[`${group?.name}:${label}`];
          if (!market) return;
          const value = num(stats[i]);
          if (value === null) return; // a blank cell is absent, never 0
          out.push(
            makePlayerStat({
              playerId: `nfl-athlete-${espnId}`,
              providerPlayerId: String(espnId),
              name: row?.athlete?.displayName ?? null,
              teamAbbr,
              market,
              value,
            }),
          );
        });
      }
    }
  }
  return out;
}

/** The event id ESPN's summary payload says it describes — used to refuse a mismatched response. */
export function summaryEventId(summary) {
  const id = summary?.header?.id ?? summary?.boxscore?.id ?? null;
  return id ? String(id) : null;
}

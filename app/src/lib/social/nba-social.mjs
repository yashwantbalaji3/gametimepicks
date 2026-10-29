/**
 * NBA SOCIAL DATA CONTRACT — `gtp-social-nba@1` (launch program 2026-10-28, NBA Phase G).
 *
 * A read-only, versioned day file for consumers outside this site (the CEO Command Center's social drafts). It is built
 * from EXACTLY the published inputs the NBA pages render — the dated public lane file and the /results/nba record — through
 * the same accessors, so it can never become a second official forecast:
 *   - the favoured side, frozen time and receipt are the lane's own fields;
 *   - the Elo-derived estimate goes through eloWinProbabilityOf (the one accessor; null when the switch is off or the
 *     field fails provenance) and is otherwise reported WITHHELD with a reason;
 *   - player medians are the lane's published medians, with the market definition of each family;
 *   - finals and the side's result are the official record's rows (nba-forecast-vs-actual), never recomputed.
 * Nothing here is a pick, a price, a ranking or an accuracy claim. Pure: no fs, no clock (the build date is passed in).
 *
 * ADDITIVE FIELDS (Batch 1 fix #9, 2026-10-29 — schemaVersion stays gtp-social-nba@1: nothing renamed, removed or
 * re-meant; the new keys are appended after every existing key, so the existing fields' bytes are unchanged). All are
 * derived from the file's own data and `builtForEtDate` (the build's ET date — the SAME date `stale` is computed
 * against); no new clock read.
 *   isLatest    boolean — true only on the newest day file this build ships (latest.json is that file). An archived day
 *               carries `stale: true` (its slate is before the build's date); `isLatest: false` says it is simply an
 *               archive, not a broken "today".
 *   slateState  "UPCOMING" | "IN_PROGRESS" | "SETTLED" | null — from the events' own `result.final` (the official
 *               record's finals) as of the build: every event has a final → SETTLED; some do, or none do but the slate's
 *               date is before builtForEtDate → IN_PROGRESS (played, finals not all recorded); none do and the date is
 *               builtForEtDate or later → UPCOMING. null when the file has no events. Never a live status.
 *   today       (latest.json and index.json only) { etDate, status } — etDate is builtForEtDate; status is
 *               "PUBLISHED" (a lane file for etDate is committed with games — then latest.json IS that day),
 *               "NOT_YET_PUBLISHED" (the schedule has NBA games on etDate; its Official Forecast is not in this build —
 *               latest.json is then an earlier slate, `stale: true`), "NO_GAMES" (no NBA game on the schedule on etDate),
 *               or "DISABLED" (the lane's rollback switch is off). The /nba hub's own today state (nba-hub
 *               nbaTodaySlate.forecast), mapped one-to-one.
 */
import { eloWinProbabilityOf, ELO_WIN_PROBABILITY_LABEL } from "../sports/nba/elo-win-probability.mjs";
import { NBA_LINE_DISPLAY } from "../sports/nba/line-board.mjs";
import { publicDirectionGate } from "../odds/display-authorization.mjs";
import { DIRECTION_WITHHELD_TEXT } from "../odds/prop-line-view.mjs";
import { COMPARISON_LEGEND, LINE_COMPARISON_RULE, LINE_MAX_AGE_HOURS, UNAVAILABLE_REASON, USER_SIDE } from "../sports/nba/line-comparison.mjs";

export const NBA_SOCIAL_SCHEMA = "gtp-social-nba@1";
export const NBA_SOCIAL_BASE = "/data/social/nba/v1/";
export const NBA_RECORD_MIN_FOR_CLAIM = 300;

/** Market definitions of the published player families (lane STATS + COMBO_STATS), in plain words. */
export const PLAYER_FAMILIES = Object.freeze([
  { key: "pts", label: "PTS", definition: "points — median of 10,000 simulated games" },
  { key: "reb", label: "REB", definition: "total rebounds — median of 10,000 simulated games" },
  { key: "ast", label: "AST", definition: "assists — median of 10,000 simulated games" },
  { key: "threePm", label: "3PM", definition: "three-pointers made — median of 10,000 simulated games" },
  { key: "pra", label: "PRA", combo: true, definition: "points + rebounds + assists — median of the per-game sum (not the sum of the medians)" },
  { key: "ptsReb", label: "P+R", combo: true, definition: "points + rebounds — median of the per-game sum" },
  { key: "ptsAst", label: "P+A", combo: true, definition: "points + assists — median of the per-game sum" },
]);

export const USAGE_RULES = Object.freeze([
  "Quote only fields present in this file; a field marked withheld or absent must not be stated or estimated.",
  "The favoured side is the Official Forecast; the Elo-derived estimate is an estimate (accuracy not established), never a validated probability.",
  "Player figures are medians, not lines, picks or predictions to bet; never pair them with sportsbook prices.",
  "No 'lock', 'edge', 'value', 'best bet' or accuracy claims; the record is counts only until the minimum graded games is reached.",
  "Game Simulations are hypothetical and never a forecast; this file carries none.",
  "Refuse a day whose `publication.status` is not PUBLISHED, or whose `stale` is true, for any 'tonight' claim.",
]);

/** Replaces USAGE_RULES[2] only when line comparisons are authorized for this feed (the default rules are unchanged). */
export const USAGE_RULE_LINES_AUTHORIZED = "Player figures are medians, not picks or predictions to bet; pair a median with a sportsbook line only through its lineComparison when status is COMPARED, with the legend beside it.";

export const NBA_SOCIAL_SLATE_STATES = Object.freeze(["UPCOMING", "IN_PROGRESS", "SETTLED"]);
export const NBA_SOCIAL_TODAY_STATUSES = Object.freeze(["PUBLISHED", "NOT_YET_PUBLISHED", "NO_GAMES", "DISABLED"]);

/**
 * The slate's state from the file's own events (see the header): finals recorded by the official record, and the slate
 * date against the build's ET date. Null when there are no events.
 * @param {{ result?: { final?: unknown } }[]} events
 * @param {string|null} date
 * @param {string|null} buildEtDate
 */
export function nbaSocialSlateState(events, date, buildEtDate) {
  if (!events?.length) return null;
  const finals = events.filter((e) => e?.result?.final != null).length;
  if (finals === events.length) return "SETTLED";
  if (finals > 0) return "IN_PROGRESS";
  return date && buildEtDate && date < buildEtDate ? "IN_PROGRESS" : "UPCOMING";
}

/** The hub's today state (lib/sport-hub/nba-hub.ts NbaForecastState) in the feed's words. */
const TODAY_STATUS = Object.freeze({ PUBLISHED: "PUBLISHED", PENDING: "NOT_YET_PUBLISHED", NO_GAMES: "NO_GAMES", DISABLED: "DISABLED" });
/**
 * `today` for latest.json / index.json.
 * @param {string} buildEtDate
 * @param {"PUBLISHED"|"PENDING"|"NO_GAMES"|"DISABLED"} hubForecast
 */
export function nbaSocialToday(buildEtDate, hubForecast) {
  const status = TODAY_STATUS[hubForecast];
  if (!status) throw new Error(`nbaSocialToday: unknown hub state ${hubForecast}`);
  return { etDate: buildEtDate, status };
}

const etTime = (iso) => {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t)) + " ET" : null;
};
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * `reasonText` is the NBA pages' own unavailable-reason wording (components/nba/official-predictions.tsx), passed in by the
 * server loader — products never read the Theater library (research boundary), and this pure module imports no component.
 * `latestDate` is the newest date this build ships a day file for (nba-social-data nbaSocialDates().at(-1)); `isLatest` is
 * true only when it equals the lane's date.
 * `lineDirections` is the social surface's direction gate (lib/odds/display-authorization.mjs publicDirectionGate("nba",
 * "social")): a COMPARED row of a family that is not direction-qualified becomes status DIRECTION_WITHHELD — line and
 * capture time only, no direction, side or difference (founder 2026-10-29; every family unqualified today).
 * @param {{ lane: any, recordGames: any[], buildEtDate: string, latestDate?: string|null, laneSha256?: string|null, eloEnabled?: boolean, recordCounts?: { matched: number, missed: number, graded: number }|null, reasonText?: (reason: string|null, status: string|null) => string, lineBoard?: { rows: any[], coverage?: any, attribution?: string|null }|null, lineDisplay?: { public?: boolean, social?: boolean, socialPrices?: boolean, reason?: string|null }, lineDirections?: { scope?: string, shows: (family: string) => boolean } }} input
 */
export function buildNbaSocialDay({ lane, recordGames = [], buildEtDate, latestDate = null, laneSha256 = null, eloEnabled, recordCounts = null, reasonText = (r) => String(r ?? ""), lineBoard = null, lineDisplay = NBA_LINE_DISPLAY, lineDirections = publicDirectionGate("nba", "social") }) {
  /* Model-versus-line (launch program P0): per player and family, from the published comparison artifact
     (lib/sports/nba/public-line-records.mjs nbaSocialLineBoard — the SAME artifact the pages render) — only when the social
     display switch allows it. Otherwise the block says so and carries NO line, price, book or difference. */
  const lineRow = new Map((lineBoard?.rows ?? []).map((r) => [`${r.eventId}|${r.athleteId}|${r.family}`, r]));
  const lineComparison = (eventId, athleteId, family) => {
    if (!lineDisplay?.social) return { status: "NOT_AUTHORIZED", displayPermission: "PRIVATE", reason: lineDisplay?.reason ?? "Not authorized for display." };
    const r = lineRow.get(`${eventId}|${athleteId}|${family}`);
    if (!r) return { status: "UNAVAILABLE", displayPermission: "PUBLIC", direction: "UNAVAILABLE", reason: "NO_LINE", reasonText: UNAVAILABLE_REASON.NO_LINE };
    if (r.direction === "UNAVAILABLE") return { status: "UNAVAILABLE", displayPermission: "PUBLIC", direction: "UNAVAILABLE", reason: r.reason, reasonText: UNAVAILABLE_REASON[r.reason] ?? null };
    /* Prices and book names are a SEPARATE permission (lineDisplay.socialPrices — the provider's written confirmation that
       a public JSON feed may carry them; lib/odds/display-authorization.mjs). Without it a COMPARED row carries the
       side, difference, line and capture time only. */
    const priced = lineDisplay?.socialPrices === true ? { overPrice: r.overPrice, underPrice: r.underPrice, book: r.book } : {};
    if (lineDirections?.shows?.(family) !== true) {
      return {
        status: "DIRECTION_WITHHELD", displayPermission: "PUBLIC", rule: LINE_COMPARISON_RULE,
        line: r.line, ...priced, marketKey: r.marketKey, capturedAt: r.capturedAt,
        reason: "DIRECTION_NOT_QUALIFIED", reasonText: DIRECTION_WITHHELD_TEXT, freshness: `captured before tip, within ${LINE_MAX_AGE_HOURS} h`,
      };
    }
    return {
      status: "COMPARED", displayPermission: "PUBLIC", rule: LINE_COMPARISON_RULE,
      line: r.line, ...priced, marketKey: r.marketKey, capturedAt: r.capturedAt,
      difference: r.difference, direction: r.direction, side: USER_SIDE[r.direction] ?? null, freshness: `captured before tip, within ${LINE_MAX_AGE_HOURS} h`,
    };
  };
  // Prices + books in this feed: only with the separate socialPrices permission AND published rows to carry them.
  const feedPrices = lineDisplay?.socialPrices === true && lineDisplay?.social === true && !!lineBoard;
  const byId = new Map((recordGames ?? []).map((r) => [String(r.providerEventId), r]));
  const games = lane?.games ?? [];
  const events = games.map((g) => {
    const id = String(g.providerEventId);
    const rec = byId.get(id) ?? null;
    const est = eloWinProbabilityOf(g, eloEnabled === undefined ? undefined : { enabled: eloEnabled });
    const fav = g.elo?.state === "FAVOURED" ? (g.elo.favoured === g.home?.abbr ? "home" : g.elo.favoured === g.away?.abbr ? "away" : null) : null;
    const player = (p, team) => ({
      id: String(p.providerAthleteId), name: p.name ?? null, team, position: p.position ?? null,
      expectedMinutes: num(p.expectedMinutes), injuryStatus: p.injuryStatus ?? null,
      medians: Object.fromEntries(PLAYER_FAMILIES.map((f) => [f.key, num(f.combo ? p.comboMedians?.[f.key] : p.medians?.[f.key])])),
      lineComparison: Object.fromEntries(PLAYER_FAMILIES.map((f) => [f.key, lineComparison(id, String(p.providerAthleteId), f.key)])),
    });
    const unavailable = ["away", "home"].flatMap((side) => (g.players?.unavailable?.[side] ?? []).map((u) => ({
      id: String(u.providerAthleteId), name: u.name ?? null, team: g[side]?.abbr ?? null, reason: u.reason ?? null,
      reasonText: reasonText(u.reason ?? null, u.status ?? null),
    })));
    const withheld = [
      { family: "teamScores", reason: "Team score, margin and total are not published: the player-sum score ignores the opponent and has not met its historical checks." },
      { family: "playerRanges", reason: "Medians only: the model's ranges have not yet shown reliable coverage." },
      ...(feedPrices ? [] : [{ family: "prices", reason: "No sportsbook prices are published for NBA." }]),
      ...(est ? [] : [{ family: "eloEstimate", reason: eloEnabled === false ? "The Elo-derived estimate is switched off." : "No Elo-derived estimate was published with this game's frozen forecast." }]),
    ];
    return {
      eventId: id,
      etDate: g.etDate ?? lane?.date ?? null,
      tipUtc: g.tipUtc ?? null,
      tipEt: etTime(g.tipUtc),
      away: { abbr: g.away?.abbr ?? null, name: g.away?.name ?? null },
      home: { abbr: g.home?.abbr ?? null, name: g.home?.name ?? null },
      frozenAt: g.frozenAt ?? null,
      receipt: { modelVersion: g.receipt?.modelVersion ?? null, payloadSha256: g.receipt?.payloadSha256 ?? null },
      // The snapshot every projection in this event belongs to: one frozen receipt (never a re-run).
      snapshotId: g.receipt?.payloadSha256 && g.frozenAt ? `${g.receipt.payloadSha256.slice(0, 16)}@${g.frozenAt}` : null,
      official: {
        favouredSide: fav,
        favouredTeam: fav ? g[fav]?.abbr ?? null : null,
        sideState: g.elo?.state ?? null,
        eloEstimate: est ? { label: ELO_WIN_PROBABILITY_LABEL, home: est.home, away: est.away, homePct: est.homePct, awayPct: est.awayPct, accuracyEstablished: false } : null,
      },
      withheld,
      players: [...(g.players?.away ?? []).map((p) => player(p, g.away?.abbr ?? null)), ...(g.players?.home ?? []).map((p) => player(p, g.home?.abbr ?? null))],
      unavailable,
      result: rec ? { state: rec.state, final: rec.final ? { away: rec.final.away, home: rec.final.home, winnerSide: rec.final.winnerSide ?? null } : null } : { state: "NOT_IN_RECORD", final: null },
    };
  });
  const stale = !(lane?.date && buildEtDate && lane.date >= buildEtDate);
  return {
    schemaVersion: NBA_SOCIAL_SCHEMA,
    date: lane?.date ?? null,
    publication: {
      status: games.length ? "PUBLISHED" : "NO_GAMES",
      laneGeneratedAt: lane?.generatedAt ?? null,
      laneSha256,
      source: "app/public/data/nba/experimental-public/<date>.json (the file /nba and /nba/projections render)",
      excluded: (lane?.excluded ?? []).map((e) => ({ eventId: String(e.providerEventId ?? e.eventId ?? ""), reason: e.reason ?? null })),
    },
    builtForEtDate: buildEtDate,
    stale,
    contract: {
      favouredSide: "OFFICIAL",
      eloEstimate: events.some((e) => e.official.eloEstimate) ? "SHOWN_ACCURACY_NOT_ESTABLISHED" : "WITHHELD",
      playerMedians: "OFFICIAL",
      teamScores: "WITHHELD", playerRanges: "WITHHELD", prices: feedPrices ? "COMPARED_ROWS_ONLY" : "NOT_PUBLISHED",
      simulations: "NOT_INCLUDED", topBoards: "NOT_AUTHORIZED",
    },
    playerFamilies: PLAYER_FAMILIES,
    lineComparisons: {
      rule: LINE_COMPARISON_RULE,
      displayPermission: lineDisplay?.social ? "PUBLIC" : "PRIVATE",
      reason: lineDisplay?.social ? null : lineDisplay?.reason ?? null,
      legend: COMPARISON_LEGEND,
      graphicRule: "Colour a stat only when its lineComparison.status is COMPARED; otherwise use the projections-only graphic. Always print the legend beside coloured stats.",
      coverage: lineDisplay?.social && lineBoard ? lineBoard.coverage : null,
      // additive, only when the social surface is authorized and the authorization carries an attribution sentence
      ...(lineDisplay?.social && lineBoard?.attribution ? { attribution: lineBoard.attribution } : {}),
    },
    events,
    record: recordCounts ? { ...recordCounts, minForClaim: NBA_RECORD_MIN_FOR_CLAIM, accuracyClaim: false, href: "/results/nba/" } : null,
    usageRules: lineDisplay?.social && lineBoard ? USAGE_RULES.map((r, i) => (i === 2 ? USAGE_RULE_LINES_AUTHORIZED : r)) : USAGE_RULES,
    // additive (2026-10-29), appended last — see the header
    isLatest: !!(lane?.date && latestDate && lane.date === latestDate),
    slateState: nbaSocialSlateState(events, lane?.date ?? null, buildEtDate ?? null),
  };
}

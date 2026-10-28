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
 */
import { eloWinProbabilityOf, ELO_WIN_PROBABILITY_LABEL } from "../sports/nba/elo-win-probability.mjs";
import { unavailableReasonText } from "../simulation-theater/nba/possession/labels.mjs";

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

const etTime = (iso) => {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t)) + " ET" : null;
};
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * @param {{ lane: any, recordGames: any[], buildEtDate: string, laneSha256?: string|null, eloEnabled?: boolean, recordCounts?: { matched: number, missed: number, graded: number }|null }} input
 */
export function buildNbaSocialDay({ lane, recordGames = [], buildEtDate, laneSha256 = null, eloEnabled, recordCounts = null }) {
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
    });
    const unavailable = ["away", "home"].flatMap((side) => (g.players?.unavailable?.[side] ?? []).map((u) => ({
      id: String(u.providerAthleteId), name: u.name ?? null, team: g[side]?.abbr ?? null, reason: u.reason ?? null,
      reasonText: unavailableReasonText(u.reason, u.status ?? null),
    })));
    const withheld = [
      { family: "teamScores", reason: "Team score, margin and total are not published: the player-sum score ignores the opponent and has not met its historical checks." },
      { family: "playerRanges", reason: "Medians only: the model's ranges have not yet shown reliable coverage." },
      { family: "prices", reason: "No sportsbook prices are published for NBA." },
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
      teamScores: "WITHHELD", playerRanges: "WITHHELD", prices: "NOT_PUBLISHED",
      simulations: "NOT_INCLUDED", topBoards: "NOT_AUTHORIZED",
    },
    playerFamilies: PLAYER_FAMILIES,
    events,
    record: recordCounts ? { ...recordCounts, minForClaim: NBA_RECORD_MIN_FOR_CLAIM, accuracyClaim: false, href: "/results/nba/" } : null,
    usageRules: USAGE_RULES,
  };
}

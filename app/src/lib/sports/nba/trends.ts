/**
 * NBA PLAYER TRENDS (trends slice, 2026-11-09) — SERVER ONLY: reads committed box scores at BUILD time, like
 * /nba/projections' actuals (projection-board-actuals.ts). Never import from a "use client" module.
 *
 * For every player on the CURRENT official lane (app/public/data/nba/experimental-public — the one canonical NBA
 * projection), the last 5 / 10 / 20 regular-season games he played, stat by stat (PTS, REB, AST), against ONE reference:
 * that player's official v0.1 MODEL PROJECTION median for tonight. No sportsbook line or price is read or written.
 *
 * WHAT COUNTS AS A GAME (the graders' own rules, not re-decided here):
 *   - regular season (phase 2), tipped on an ET date BEFORE the slate;
 *   - the official final is in the write-once finals record (FINAL — never FINAL_UNDER_REVIEW);
 *   - the box score is the graders' (gradedBoxscore: the newest stored correction, else the first capture), is FINAL,
 *     and its team points equal that final;
 *   - the player's line is MEASURED (integer minutes > 0 and integer stats) by the shared line reader. DNP, no row or a
 *     non-integer value is not a game for him — never a 0.
 * "Above" = the game's stat is strictly greater than the reference median. Counts are HISTORY, never a probability.
 *
 * AVAILABILITY — ONE source, eligibility@1 (lib/availability/eligibility.mjs resolveEligibility, sport "nba"), over the
 * NBA injury report and roster captures at the build instant (6 h freshness). The lane's own injuryStatus is not read.
 *   eligible      ELIGIBLE and featurable (no QUESTIONABLE / SOURCES_DISAGREE flag — the featured-surface rule)
 *   not-verified  UNKNOWN (stale or missing source, no roster record, …) or ELIGIBLE with a not-featurable flag
 *   ineligible    INELIGIBLE (ruled out, long-term designation, not on the roster)
 * A lane that is not tonight's slate ranks nobody (its projection is not tonight's). UNKNOWN is never ranked.
 *
 * NBA-MIN-01 (Harden 46.8 expected minutes, 2026-11-10): the model is not changed. A row whose expected minutes exceed
 * MINUTES_REVIEW_ABOVE stays on the page with the note "minutes projection under review" and is left out of the
 * minutes-ordered numbered list.
 *
 * ORDER: eligible players (minutes not under review) are numbered by tonight's EXPECTED MINUTES (the projections board's own order), never by how
 * often they beat the median. Sorting by "games above" would put the players the v0.1 model under-projects on top — a
 * list that reads as "overs", which a history count must never become.
 */
import fs from "node:fs";
import path from "node:path";

import type { Snapshot } from "@/components/nba/experimental-lane";
import { eligibilityRecord, eligibilityText, featurable, resolveEligibility } from "@/lib/availability/eligibility.mjs";
import { boxscoreAthlete, isFinalBoxscore, LINE_STATE, measureAthlete } from "@/lib/sports/nba/boxscore-line.mjs";
import { boxscorePointsCheck } from "@/lib/sports/nba/experimental-grading-ledger.mjs";
import { etDateOf, finalFor, nbaSeasonLabel } from "@/lib/sports/nba/finals-record.mjs";
import { BOX_DIRS, gradedBoxscore } from "@/lib/sports/nba/projection-board-actuals";

export const TRENDS_STATS = Object.freeze([["pts", "PTS"], ["reb", "REB"], ["ast", "AST"]] as const);
export type TrendStat = (typeof TRENDS_STATS)[number][0];
export const TRENDS_WINDOWS = Object.freeze([5, 10, 20] as const);
export const TRENDS_REFERENCE_LABEL = "MODEL PROJECTION";
export const TRENDS_HISTORY_NOTE = "Counts of past games above tonight's MODEL PROJECTION median. History, not a probability.";

/** NBA-MIN-01: expected minutes above this are a projection under review (not ranked). */
export const MINUTES_REVIEW_ABOVE = 42;
export const MINUTES_REVIEW_NOTE = "minutes projection under review";

export type TrendAvailability = "eligible" | "not-verified" | "ineligible";
export type TrendGame = { eventId: string; dateEt: string; team: string; opp: string; home: boolean; minutes: number; pts: number; reb: number; ast: number };
export type TrendWindow = { size: number; played: number; above: Record<TrendStat, number> | null };
export type TrendRow = {
  playerId: string; name: string; team: string; opp: string;
  /** tonight: true = at home ("vs"), false = away ("@") */
  home: boolean;
  availability: TrendAvailability; availabilityNote: string;
  /** tonight's official medians (the lane's own 1-dp figures); null when the lane publishes no projection for him */
  reference: Record<TrendStat, number> | null;
  windows: TrendWindow[];
  /** newest first, at most the largest window */
  games: TrendGame[];
  /** 1-based, eligible players only (by expected minutes) */
  rank: number | null;
  /** tonight's official expected minutes (the lane's own figure), for the order only */
  expectedMinutes: number | null;
  /** NBA-MIN-01: expected minutes > MINUTES_REVIEW_ABOVE — shown, never numbered */
  minutesUnderReview: boolean;
  /** the eligibility@1 record this row's availability came from */
  eligibility: ReturnType<typeof eligibilityRecord>;
};
/** eligibility@1 inputs: the build instant and the two NBA captures (null = missing → UNKNOWN). */
export type TrendEligibilityInputs = { asOf: string; injuries: { generatedAt: string; entries: object[] } | null; roster: { teams?: { providerTeamId?: string | number; espnAbbr?: string }[] } | null };
export type NbaTrends = { slateDate: string | null; slateIsToday: boolean; gamesRead: number; rows: TrendRow[] };

type BoxDoc = { providerEventId?: string; phase?: number; dateUtc?: string; status?: string; boxscoreAvailable?: boolean; teams?: { providerTeamId: string; abbr: string; homeAway: string }[]; players?: { providerAthleteId: string }[] };
type Final = { state: string; ftHome?: number; ftAway?: number };
/** A game the graders would read: its box score and its official final. */
export type TrendSourceGame = { doc: BoxDoc; final: Final };

/** One player's availability, from eligibility@1 only. */
export function trendAvailabilityOf(rec: ReturnType<typeof resolveEligibility>): TrendAvailability {
  return featurable(rec) ? "eligible" : rec.state === "INELIGIBLE" ? "ineligible" : "not-verified";
}

/** One game's eligibility for trends: regular season, before the slate, FINAL on the record, points agree. */
export function gameCounts(g: TrendSourceGame, slateDate: string): boolean {
  const { doc, final } = g;
  if (doc?.phase !== 2 || !doc.dateUtc) return false;
  const day = etDateOf(doc.dateUtc) as string | null;
  if (!day || day >= slateDate) return false;
  if (final?.state !== "FINAL" || !isFinalBoxscore(doc)) return false;
  const home = doc.teams?.find((t) => t.homeAway === "home"), away = doc.teams?.find((t) => t.homeAway === "away");
  if (!home || !away) return false;
  const pts = boxscorePointsCheck(doc, { homeTeamId: home.providerTeamId, awayTeamId: away.providerTeamId, ftHome: final.ftHome, ftAway: final.ftAway });
  return pts?.agrees !== false;
}

/** The player's measured line in one game (null = not a game for him: DNP, no row, zero or non-integer values). */
export function trendGameOf(doc: BoxDoc, playerId: string): TrendGame | null {
  const a = boxscoreAthlete(doc, playerId) as { providerTeamId?: string } | null;
  const m = measureAthlete(a, TRENDS_STATS.map(([k]) => k));
  if (m.state !== LINE_STATE.MEASURED || !((m.minutes as number) > 0)) return null;
  const team = doc.teams?.find((t) => String(t.providerTeamId) === String(a?.providerTeamId));
  const opp = doc.teams?.find((t) => t !== team);
  if (!team || !opp) return null;
  const v = m.values as Record<TrendStat, number>;
  return { eventId: String(doc.providerEventId), dateEt: etDateOf(doc.dateUtc) as string, team: team.abbr, opp: opp.abbr, home: team.homeAway === "home", minutes: m.minutes as number, pts: v.pts, reb: v.reb, ast: v.ast };
}

const windowsOf = (games: TrendGame[], ref: Record<TrendStat, number> | null): TrendWindow[] =>
  TRENDS_WINDOWS.map((size) => {
    const w = games.slice(0, size);
    const above = ref ? Object.fromEntries(TRENDS_STATS.map(([k]) => [k, w.filter((g) => g[k] > ref[k]).length])) as Record<TrendStat, number> : null;
    return { size, played: w.length, above };
  });

/**
 * PURE: the trends rows for a lane, a set of source games and the eligibility@1 inputs. `slateIsToday` false → nobody
 * is ranked (the lane's projection is not tonight's).
 */
export function buildTrends(lane: Snapshot | null, sources: readonly TrendSourceGame[], { slateIsToday, eligibility }: { slateIsToday: boolean; eligibility: TrendEligibilityInputs }): NbaTrends {
  if (!lane?.date || !lane.games.length) return { slateDate: lane?.date ?? null, slateIsToday, gamesRead: 0, rows: [] };
  const slate = lane.date;
  const counted = sources.filter((g) => gameCounts(g, slate)).sort((a, b) => String(b.doc.dateUtc).localeCompare(String(a.doc.dateUtc)));
  const max = Math.max(...TRENDS_WINDOWS);
  const historyOf = (id: string) => {
    const out: TrendGame[] = [];
    for (const g of counted) { const t = trendGameOf(g.doc, id); if (t) out.push(t); if (out.length === max) break; }
    return out;
  };
  const teamIdOf = new Map((eligibility.roster?.teams ?? []).map((t) => [String(t.espnAbbr ?? ""), t.providerTeamId == null ? null : String(t.providerTeamId)]));
  const eligibilityOf = (playerId: string, team: string) => {
    const rec = resolveEligibility({ sport: "nba", playerId, teamId: teamIdOf.get(team) ?? null, asOf: eligibility.asOf, injuries: eligibility.injuries, roster: eligibility.roster });
    const availability = trendAvailabilityOf(rec);
    const note = availability === "not-verified" && rec.state === "ELIGIBLE" ? `${eligibilityText(rec)} · flagged ${rec.flags.join(", ").toLowerCase().replace(/_/g, " ")}, so not ranked` : eligibilityText(rec);
    return { availability, note, record: eligibilityRecord(rec) };
  };
  const rows: TrendRow[] = [];
  for (const g of lane.games) {
    for (const side of ["away", "home"] as const) {
      const team = g[side].abbr ?? "", opp = (side === "home" ? g.away : g.home).abbr ?? "";
      for (const p of g.players[side]) {
        const id = String(p.providerAthleteId);
        const reference = Object.fromEntries(TRENDS_STATS.map(([k]) => [k, Number(p.medians?.[k])])) as Record<TrendStat, number>;
        const hasRef = TRENDS_STATS.every(([k]) => Number.isFinite(reference[k]));
        const e = eligibilityOf(id, team);
        const games = historyOf(id);
        const em = Number((p as { expectedMinutes?: number }).expectedMinutes);
        const minutesUnderReview = Number.isFinite(em) && em > MINUTES_REVIEW_ABOVE;
        rows.push({ playerId: id, name: p.name ?? id, team, opp, home: side === "home", availability: e.availability, availabilityNote: e.note, reference: hasRef ? reference : null, windows: windowsOf(games, hasRef ? reference : null), games, rank: null, expectedMinutes: Number.isFinite(em) ? em : null, minutesUnderReview, eligibility: e.record });
      }
      for (const u of g.players.unavailable?.[side] ?? []) {
        const id = String(u.providerAthleteId);
        const e = eligibilityOf(id, team);
        const games = historyOf(id);
        rows.push({
          playerId: id, name: u.name ?? id, team, opp, home: side === "home",
          availability: e.availability, availabilityNote: `${e.note} · no official projection tonight`,
          reference: null, windows: windowsOf(games, null), games, rank: null, expectedMinutes: null, minutesUnderReview: false, eligibility: e.record,
        });
      }
    }
  }
  // number ONLY eligible players on tonight's slate with a reference and minutes not under review, by expected minutes
  // (then name) — never by the history counts
  const ranked = rows.filter((r) => slateIsToday && r.availability === "eligible" && r.reference && !r.minutesUnderReview)
    .sort((a, b) => (b.expectedMinutes ?? -1) - (a.expectedMinutes ?? -1) || a.name.localeCompare(b.name));
  ranked.forEach((r, i) => { r.rank = i + 1; });
  const order: Record<TrendAvailability, number> = { eligible: 0, "not-verified": 1, ineligible: 2 };
  const rest = rows.filter((r) => r.rank == null).sort((a, b) => order[a.availability] - order[b.availability] || a.name.localeCompare(b.name));
  return { slateDate: slate, slateIsToday, gamesRead: counted.length, rows: [...ranked, ...rest] };
}

/* ── loader (build time) ───────────────────────────────────────────────────────────────────────────────────────── */
const readJson = (f: string) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

/** Every stored box score of the fetch cache (the current season lives there), as source games with their finals. */
export function loadTrendSources(slateDate: string): TrendSourceGame[] {
  const season = nbaSeasonLabel(slateDate);
  const record = season ? readJson(path.join(process.cwd(), "public", "data", "nba", "results", `finals-${season}.json`)) : null;
  const dir = path.resolve(process.cwd(), "..", BOX_DIRS[1]);
  let ids: string[] = [];
  try { ids = fs.readdirSync(dir).filter((n) => /^\d+\.json$/.test(n)).map((n) => n.slice(0, -5)); } catch { ids = []; }
  const out: TrendSourceGame[] = [];
  for (const id of ids) {
    const doc = gradedBoxscore(id) as BoxDoc | null;
    if (doc) out.push({ doc, final: finalFor(record, id) as Final });
  }
  return out;
}

/**
 * eligibility@1's NBA inputs at the build instant: the injury report and roster captures (data/internal/research,
 * PRIVATE_RESEARCH — read only while /trends is gated OFF/internal; they become BUILD_INPUTS, and the roster capture's
 * neverReadBy note is resolved, before the route is reclassified public).
 */
export function loadTrendEligibilityInputs(asOf: string): TrendEligibilityInputs {
  const root = path.resolve(process.cwd(), "..", "data", "internal", "research");
  return { asOf, injuries: readJson(path.join(root, "injuries", "nba", "latest.json")), roster: readJson(path.join(root, "nba", "rosters", "latest.json")) };
}

/** The page's model: the current lane (tonight's slate, else the newest committed one, marked not current). */
export function loadNbaTrends(lane: Snapshot | null, todayEt: string, asOf: string = new Date().toISOString()): NbaTrends {
  if (!lane?.date) return { slateDate: null, slateIsToday: false, gamesRead: 0, rows: [] };
  return buildTrends(lane, loadTrendSources(lane.date), { slateIsToday: lane.date === todayEt, eligibility: loadTrendEligibilityInputs(asOf) });
}

/** The drawer file: per player, the reference and the games — the same rows the table counts. No price field exists. */
export type TrendsDrawerPayload = { schema: "gtp.nba-trends-drawer@1"; slateDate: string | null; reference: string; note: string; players: Record<string, { name: string; team: string; opp: string; home: boolean; availability: TrendAvailability; availabilityNote: string; minutesUnderReview: boolean; reference: Record<TrendStat, number> | null; games: TrendGame[] }> };
export function trendsDrawerPayload(t: NbaTrends): TrendsDrawerPayload {
  return {
    schema: "gtp.nba-trends-drawer@1", slateDate: t.slateDate, reference: TRENDS_REFERENCE_LABEL, note: TRENDS_HISTORY_NOTE,
    players: Object.fromEntries(t.rows.map((r) => [r.playerId, { name: r.name, team: r.team, opp: r.opp, home: r.home, availability: r.availability, availabilityNote: r.availabilityNote, minutesUnderReview: r.minutesUnderReview, reference: r.reference, games: r.games }])),
  };
}

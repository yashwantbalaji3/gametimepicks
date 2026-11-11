/**
 * NFL QB TRENDS — THE NFL ADAPTER for the shared Trends board (trends-shared, 2026-11-11; checklist row F). SERVER ONLY:
 * reads committed files at BUILD time. Gated OFF (GTP_NFL_TRENDS_PUBLIC): no page imports this outside the flag branch.
 *
 * PLAYERS      each upcoming game's projected QB per team (qb-props-grade projectedQbs: the largest pass-attempt
 *              median) from that game's simulation receipt of record (sim-v2 public-receipt simulationOfRecord) — the
 *              same receipt #1302's QB research section reads.
 * PROJECTION   the receipt's MODEL PROJECTION median per stat: passing yards, TDs, completions, attempts, interceptions.
 *              With no authorized line it is also the THRESHOLD the history is counted against, labelled "model
 *              threshold, not a sportsbook line".
 * GAME LOGS    the QB's last 5 / 10 games played (≥ 1 attempt) before kickoff, from the committed player-events box
 *              scores (data/internal/research/nfl/player-events-v1, finals only), with opponent and home/away.
 * ELIGIBILITY  eligibility@1 (resolveEligibility, sport nfl, `starter: true` — a Doubtful starting QB is INELIGIBLE) over
 *              the NFL injury report and roster captures, PLUS R5: a game whose official forecast is blind to its
 *              starting-QB situation (or has no team-input record) shows no projection and ranks nobody. Only a
 *              featurable ELIGIBLE QB in an R5-allowed game is ranked; UNKNOWN never is.
 * LINES        the line-gate hook (lib/trends/lines.ts) over nflPublicLineRecords: only passing yards has an NFL line
 *              family (pass_yds), and it is unqualified for a direction today, so no NFL line is shown.
 * ORDER        ranked QBs by projected attempts (then name) — never by the history counts.
 * STATUS       #1302's QB markets are under forward evaluation (EXPERIMENTAL), so the page says so beside every figure.
 * GROUPS       the adapter is a set of stat groups (NflTrendsGroup); QB ships first, rushing / receiving plug into the same
 *              slot when #1311 lands (founder 2026-11-11).
 */
import fs from "node:fs";
import path from "node:path";

import { eligibilityRecord, eligibilityText, featurable, resolveEligibility } from "@/lib/availability/eligibility.mjs";
import { r5Allows } from "@/lib/sports/nfl/qb-props-markets.mjs";
import { projectedQbs } from "@/lib/sports/nfl/qb-props-grade.mjs";
import { teamIdsFromRoster } from "@/lib/sports/nfl/participation-eligibility.mjs";
import { ESPN_TO_NFLVERSE_TEAM } from "@/lib/sports/nfl/snap-share.mjs";
import type { TrendsAvailability, TrendsGame, TrendsModel, TrendsPanelPayload, TrendsRow } from "@/lib/trends/contract";
import { gatedLines, hitsAtLine, type GatedLineMap, type LineRecordIn } from "@/lib/trends/lines";

export const NFL_TRENDS_STATS = Object.freeze([["passYds", "PASS YDS"], ["passTd", "PASS TD"], ["passCmp", "CMP"], ["passAtt", "ATT"], ["passInt", "INT"]] as const);
export type NflTrendStat = (typeof NFL_TRENDS_STATS)[number][0];
export const NFL_TRENDS_WINDOWS = Object.freeze([5, 10] as const);
export const NFL_THRESHOLD_NOTE = "model threshold, not a sportsbook line";
export const NFL_TRENDS_HISTORY_NOTE = "Counts of past games above the MODEL PROJECTION — a model threshold, not a sportsbook line. History, not a probability.";
/** The NFL line family per stat (prop-line-adapter NFL_FAMILIES); a stat without one never carries a line. */
export const NFL_LINE_FAMILY: Partial<Record<NflTrendStat, string>> = { passYds: "pass_yds" };
export const NFL_R5_NOTE = "the official forecast does not know this game's starting-QB situation (R5), so no projection is shown";
/** #1302's market status (qb-props-markets QB_MARKET_STATUS): every QB market is under forward evaluation, not validated. */
export const NFL_QB_STATUS_NOTE = "EXPERIMENTAL · under forward evaluation, not validated";

type Quant = { p50?: number };
type ReceiptPlayer = { playerId: string; name?: string | null; team: string; stats?: Record<string, Quant> };
export type NflReceipt = { eventId: string | number; eventStart: string; home: { abbr: string }; away: { abbr: string }; playerStatDistributions?: ReceiptPlayer[] };
type BoxPlayer = { playerId: string; teamAbbr?: string } & Record<string, unknown>;
export type NflBoxGame = { providerEventId: string; seasonType?: number; dateUtc: string; home: string; away: string; ftHome?: number | null; ftAway?: number | null; players?: BoxPlayer[] };

/**
 * A STAT GROUP — the NFL adapter's slot (founder 2026-11-11: QB ships first; rushing and receiving plug in here when
 * #1311's PMFs land). A group names its stats (box-score keys, also the trends keys), the receipt's names for them, its
 * players in one receipt, when a past game counts, its line families and its order; the board needs no change.
 */
export type NflTrendsGroup = {
  key: "qb" | "rush" | "rec";
  position: string;
  stats: readonly (readonly [string, string])[];
  /** trends stat key → the receipt's stat name */
  receiptStat: Record<string, string>;
  /** the group's players in one receipt */
  players: (r: NflReceipt) => ReceiptPlayer[];
  /** a past box-score row counts as a game for him */
  played: (p: BoxPlayer) => boolean;
  /** the stat ranked players are ordered by (its projection) */
  orderStat: string;
  /** R5 (the starting-QB rule) and the Doubtful-starter rule apply */
  starterRules: boolean;
};
export const NFL_QB_GROUP: NflTrendsGroup = Object.freeze({
  key: "qb", position: "QB", stats: NFL_TRENDS_STATS,
  receiptStat: { passYds: "passYds", passTd: "passTd", passCmp: "cmp", passAtt: "passAtt", passInt: "int" },
  players: (r: NflReceipt) => Object.values(projectedQbs(r)) as ReceiptPlayer[],
  played: (p: BoxPlayer) => ((p.passAtt as number) ?? 0) >= 1,
  orderStat: "passAtt", starterRules: true,
});
/** The groups shipped (QB only). Rushing / receiving: add their NflTrendsGroup here once #1311 lands. */
export const NFL_TRENDS_GROUPS: readonly NflTrendsGroup[] = Object.freeze([NFL_QB_GROUP]);
export type NflEligibilityInputs = { asOf: string; injuries: { generatedAt: string; entries: object[] } | null; roster: { teams?: { teamAbbr?: string; providerTeamId?: string | number }[] } | null };

const ms = (iso: unknown) => { const t = Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")); return Number.isFinite(t) ? t : NaN; };
const etDate = (iso: string) => new Date(ms(iso)).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const bare = (id: string) => String(id).replace(/^nfl-athlete-/, "");
/** player-events writes a game's sides in nflverse codes (LA, WAS) and its player rows in ESPN codes (LAR, WSH). */
const ESPN_OF = Object.freeze({ ...Object.fromEntries(Object.entries(ESPN_TO_NFLVERSE_TEAM as Record<string, string>).map(([e, n]) => [n, e])), JAC: "JAX" }) as Record<string, string>;
const espnCode = (t: string) => ESPN_OF[t] ?? t;

/** PURE: one QB's games played (≥ 1 attempt) before `kickoff`, newest first, finals only, regular season + postseason. */
export function nflQbGameLogs(games: readonly NflBoxGame[], playerId: string, kickoff: string, n = Math.max(...NFL_TRENDS_WINDOWS)): TrendsGame[] {
  return nflGameLogs(games, playerId, kickoff, NFL_QB_GROUP, n);
}

/** PURE: one player's games played (the group's rule) before `kickoff`, newest first, finals only, regular + postseason. */
export function nflGameLogs(games: readonly NflBoxGame[], playerId: string, kickoff: string, group: NflTrendsGroup, n = Math.max(...NFL_TRENDS_WINDOWS)): TrendsGame[] {
  const k = ms(kickoff), pid = `nfl-athlete-${bare(playerId)}`;
  const out: TrendsGame[] = [];
  const past = games.filter((g) => ms(g.dateUtc) < k && Number.isFinite(g.ftHome) && Number.isFinite(g.ftAway) && (g.seasonType === 2 || g.seasonType === 3))
    .sort((a, b) => ms(b.dateUtc) - ms(a.dateUtc));
  for (const g of past) {
    const p = g.players?.find((x) => x.playerId === pid && group.played(x));
    if (!p || !p.teamAbbr) continue;
    const team = espnCode(p.teamAbbr), gh = espnCode(g.home), ga = espnCode(g.away);
    const home = team === gh;
    if (!home && team !== ga) continue; // a row whose team is neither side is not a game for him
    const vals = Object.fromEntries(group.stats.map(([k]) => [k, p[k]]));
    if (!Object.values(vals).every((v) => Number.isInteger(v))) continue; // unmeasured is not a game — never a 0
    out.push({ eventId: String(g.providerEventId), dateEt: etDate(g.dateUtc), team, opp: home ? ga : gh, home, ...vals });
    if (out.length === n) break;
  }
  return out;
}

const availabilityOf = (rec: ReturnType<typeof resolveEligibility>): TrendsAvailability => (featurable(rec) ? "eligible" : rec.state === "INELIGIBLE" ? "ineligible" : "not-verified");

/**
 * PURE: the NFL QB trends for a set of receipts of record (one upcoming week). `teamInputsOf` gives each game's official
 * forecast team-input record (R5); `slateIsCurrent` false ranks nobody.
 */
export function buildNflTrends({ receipts, games, eligibility, teamInputsOf, lines = null, slateIsCurrent = true, group = NFL_QB_GROUP }: {
  receipts: readonly NflReceipt[]; games: readonly NflBoxGame[]; eligibility: NflEligibilityInputs;
  teamInputsOf: (eventId: string) => { state?: string } | null; lines?: GatedLineMap | null; slateIsCurrent?: boolean; group?: NflTrendsGroup;
}): TrendsModel {
  const STATS = group.stats;
  if (!receipts.length) return { slateDate: null, slateIsToday: false, gamesRead: 0, rows: [] };
  const teamIdByAbbr = teamIdsFromRoster(eligibility.roster) as Record<string, string>;
  const rows: (TrendsRow & { orderValue: number | null; eventId: string; kickoff: string })[] = [];
  for (const r of [...receipts].sort((a, b) => ms(a.eventStart) - ms(b.eventStart) || String(a.eventId).localeCompare(String(b.eventId)))) {
    const eventId = String(r.eventId);
    const r5 = group.starterRules ? r5Allows(teamInputsOf(eventId)) : true;
    for (const qb of group.players(r)) {
      const id = bare(qb.playerId);
      const home = qb.team === r.home.abbr;
      const rec = resolveEligibility({ sport: "nfl", playerId: `nfl-athlete-${id}`, teamId: teamIdByAbbr[qb.team] ?? null, asOf: eligibility.asOf, injuries: eligibility.injuries, roster: eligibility.roster, starter: group.starterRules });
      const proj = Object.fromEntries(STATS.map(([k]) => [k, Number(qb.stats?.[group.receiptStat[k]]?.p50)]));
      const reference = r5 && STATS.every(([k]) => Number.isFinite(proj[k])) ? proj : null;
      const games10 = nflGameLogs(games, id, r.eventStart, group);
      const windows = NFL_TRENDS_WINDOWS.map((size) => {
        const w = games10.slice(0, size);
        return { size, played: w.length, above: reference ? Object.fromEntries(STATS.map(([k]) => [k, w.filter((g) => (g[k] as number) > reference[k]).length])) : null };
      });
      const rowLines = lines && reference ? STATS.flatMap(([k]) => {
        const l = lines.get(`${id}|${k}`);
        return l ? [{ stat: k, line: l.line, capturedAt: l.capturedAt, hits: hitsAtLine(games10, k, l.line, NFL_TRENDS_WINDOWS) }] : [];
      }) : [];
      rows.push({
        playerId: id, name: qb.name ?? id, team: qb.team, opp: home ? r.away.abbr : r.home.abbr, home,
        availability: availabilityOf(rec), availabilityNote: [
          eligibilityText(rec),
          ...(rec.state === "ELIGIBLE" && !featurable(rec) ? [`flagged ${rec.flags.join(", ").toLowerCase().replace(/_/g, " ")}, so not ranked`] : []),
          ...(r5 ? [] : [NFL_R5_NOTE]),
        ].join(" · "),
        reference, windows, games: games10, rank: null, position: group.position, lines: rowLines, minutesUnderReview: false,
        orderValue: reference ? reference[group.orderStat] : null, eventId, kickoff: r.eventStart, eligibility: eligibilityRecord(rec),
      });
    }
  }
  const ranked = rows.filter((x) => slateIsCurrent && x.availability === "eligible" && x.reference)
    .sort((a, b) => (b.orderValue ?? -1) - (a.orderValue ?? -1) || a.name.localeCompare(b.name));
  ranked.forEach((x, i) => { x.rank = i + 1; });
  const order: Record<TrendsAvailability, number> = { eligible: 0, "not-verified": 1, ineligible: 2 };
  const rest = rows.filter((x) => x.rank == null).sort((a, b) => order[a.availability] - order[b.availability] || a.name.localeCompare(b.name));
  const read = new Set(rows.flatMap((x) => x.games.map((g) => g.eventId)));
  return { slateDate: etDate(receipts.map((x) => x.eventStart).sort()[0]), slateIsToday: slateIsCurrent, gamesRead: read.size, rows: [...ranked, ...rest] };
}

/** The drawer file: per QB, the projection and the games. No line, no price, no odds. */
export function nflTrendsPanelPayload(t: TrendsModel): TrendsPanelPayload {
  return {
    schema: "gtp.nfl-trends-drawer@1", slateDate: t.slateDate, reference: "MODEL PROJECTION", note: NFL_TRENDS_HISTORY_NOTE,
    players: Object.fromEntries(t.rows.map((r) => [r.playerId, { name: r.name, team: r.team, opp: r.opp, home: r.home, availability: r.availability, availabilityNote: r.availabilityNote, minutesUnderReview: false, position: r.position, expectedMinutes: null, rank: r.rank, reference: r.reference, games: r.games }])),
  };
}

/* ── loader (build time) ───────────────────────────────────────────────────────────────────────────────────────── */
const REPO = () => path.resolve(process.cwd(), "..");
const readJson = (f: string) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

/** The committed player-events box scores, the two newest seasons (enough for L10 at any point of a season). */
export const PLAYER_EVENTS_REL = "data/internal/research/nfl/player-events-v1";
function readBoxGames(root: string): NflBoxGame[] {
  const dir = path.join(root, PLAYER_EVENTS_REL);
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d{4}\.json$/.test(f)).sort().slice(-2); } catch { files = []; }
  return files.flatMap((f) => (readJson(path.join(dir, f))?.games ?? []) as NflBoxGame[]);
}

/** The line-gate hook's NFL input: each game's authorized captured rows, normalized (stat only where a family exists). */
export function nflTrendLineRecords(rows: readonly { playerId?: string; market?: string; line?: unknown; capturedAt?: unknown }[] | null, familyByMarket: Record<string, string>): LineRecordIn[] | null {
  if (!rows) return null;
  const statOf = Object.fromEntries(Object.entries(NFL_LINE_FAMILY).map(([s, f]) => [f, s]));
  return rows.map((r) => { const family = familyByMarket[String(r.market)] ?? null; return { athleteId: bare(String(r.playerId ?? "")), family, stat: family ? statOf[family] ?? null : null, line: r.line, capturedAt: r.capturedAt }; });
}

/** The page's model: the upcoming week's receipts of record (kickoff after `nowIso`, within 8 days). */
export async function loadNflTrends(nowIso: string = new Date().toISOString()): Promise<TrendsModel> {
  const { readShadowReceipts, showableSimulationEvents, simulationOfRecord } = await import("@/lib/sports/nfl/sim-v2/public-receipt.mjs");
  const { nflOfficialOfRecord } = await import("@/lib/sports/nfl/official-of-record.mjs");
  const { nflPublicLineRecords } = await import("@/lib/sports/nfl/public-line-records.mjs");
  const { NFL_FAMILY_BY_MARKET } = await import("@/lib/sports/nfl/prop-line-adapter.mjs");
  const root = REPO(), now = ms(nowIso);
  const entries = readShadowReceipts(root);
  const receipts = showableSimulationEvents(entries).map((id: string) => simulationOfRecord(entries, id)!.receipt as NflReceipt)
    .filter((r: NflReceipt) => ms(r.eventStart) > now && ms(r.eventStart) - now <= 8 * 864e5);
  const publicDir = path.join(process.cwd(), "public");
  const lineRows = receipts.flatMap((r: NflReceipt) => nflPublicLineRecords(String(r.eventId)) ?? []);
  return buildNflTrends({
    receipts, games: readBoxGames(root),
    eligibility: { asOf: nowIso, injuries: readJson(path.join(root, "data", "internal", "research", "injuries", "nfl", "latest.json")), roster: readJson(path.join(publicDir, "data", "nfl", "rosters", "latest.json")) },
    teamInputsOf: (id) => (nflOfficialOfRecord(publicDir, id)?.forecast as { teamInputs?: { state?: string } } | undefined)?.teamInputs ?? null,
    lines: gatedLines(nflTrendLineRecords(lineRows, NFL_FAMILY_BY_MARKET), { sport: "nfl", stats: NFL_TRENDS_STATS.map(([k]) => k) }),
  });
}

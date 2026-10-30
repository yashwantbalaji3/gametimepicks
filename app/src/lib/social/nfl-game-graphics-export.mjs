/**
 * NFL PER-GAME PLAYER GRAPHICS EXPORT — `gtp-graphics-export@1`, edition NFL_GAME_PLAYERS (Week 8, 2026-10-30).
 *
 * One document per game: the two teams' modeled players in position groups (QB / RB / WR-TE), one row per displayed
 * (player, statistic) cell, in the SAME row shape as the @1 Top-5 export (lib/social/graphics-export.mjs) so the same
 * contract validator (graphicsExportViolations) checks it. It never computes a forecast:
 *
 *   value        the game page's view row (forecast-view-load.mjs loadForecastViews → forecast-view.mjs playerRows, which
 *                reads the official snapshot nflOfficialSnapshot). Exact stored number; the printed digits come from
 *                forecast-view.mjs formatValue (the site's one rounding rule). Each value is ALSO checked against the raw
 *                committed player board (median for yards and receptions, probability for anytime TD) and the builder
 *                REFUSES on any difference, so a card can never show a second forecast.
 *   position     the roster capture (public/data/nfl/rosters/latest.json), joined by the exact ESPN athlete id, as the
 *                game page's all-players table does (components/game/nfl-all-players-table.tsx).
 *   availability the view's availability (the board's participation); OUT / INACTIVE never appear; QUESTIONABLE and
 *                DOUBTFUL print the site's own label (view availabilityLabel).
 *   order        role first (QB, RB, WR/TE), then usage the board itself carries (QB passing, RB rushing, WR/TE receiving
 *                volume, as the board's mean), then the official anytime-TD chance, then name. The usage numbers ORDER
 *                rows only; they are never printed. One QB per team: the board's starter (largest passing volume);
 *                other QBs are listed in `excluded` as BACKUP_QB.
 *
 * STATUS PER CELL:
 *   OFFICIAL           the family is PUBLISHED on this game's board and the view carries the player → value + display.
 *   OFFICIAL_ESTIMATE  the board marks the family ESTIMATE (not cleared). ESTIMATE_DISPLAY below decides: today NOT shown
 *                      (no value, the card prints "—" with a footnote), matching the game page ("Not published yet",
 *                      forecast-view.mjs NOT_CLEARED_GAME) and @1 (OFFICIAL_ESTIMATE is never graphic-eligible).
 *   UNAVAILABLE        no official number for that player and statistic → "—".
 *
 * SPORTSBOOK: the row's market block is graphics-export.mjs marketFields (surface "social"): every NFL family is
 * direction-unqualified and NFL social display is not authorized, so line / price / direction are WITHHELD and the card's
 * market slot (scripts/social/nfl-game-cards.mjs marketSlot) stays empty. Anytime TD is a YES_NO market (never OVER/UNDER).
 *
 * Pure: documents in, document out; no fs, no clock (`asOf` is an input). Same inputs → byte-identical output.
 */
import { MODEL_STATUS, marketFields, instantMs, ExportRefusal, socialAuthorization, GRAPHICS_EXPORT_SCHEMA } from "./graphics-export.mjs";
import { PLAYER_FAMILIES, MARKET_KEY, formatValue, NO_OFFICIAL_PROJECTION } from "../sports/nfl/forecast-view.mjs";
import { DISPLAY_AUTHORIZATION } from "../odds/display-authorization.mjs";

export const EDITION_KIND = "NFL_GAME_PLAYERS";
export const PURPOSE = Object.freeze({ FOUNDER_REVIEW: "FOUNDER_REVIEW_ONLY", SOCIAL: "SOCIAL" });

/**
 * ESTIMATE families on the cards. family-publication.mjs describes an ESTIMATE family as "displayed as an unvalidated
 * estimate" (a status-page headline), but the decision that governs what an official surface may print is the P0 of
 * 2026-10-28 in forecast-view.mjs: an ESTIMATE family carries NO number among the official projections ("Not published
 * yet"). The game page prints none, so the card prints none: "—" with the footnote below.
 */
export const ESTIMATE_DISPLAY = Object.freeze({
  allowed: false,
  label: "Not published yet",
  footnote: "Passing and rushing yards are not published yet: the official player board has not cleared them for publication this week, so no number is shown.",
  basis: "forecast-view.mjs NOT_CLEARED_GAME (P0 2026-10-28): an ESTIMATE family has no row among the official projections; graphics-export@1: OFFICIAL_ESTIMATE is never graphic-eligible",
});

/** Position groups and their columns (view family keys), in card order. Anytime TD is always the last column. */
export const GROUPS = Object.freeze([
  Object.freeze({ key: "QB", label: "Quarterback", positions: Object.freeze(["QB"]), columns: Object.freeze(["passingYards", "rushingYards", "anytimeTd"]) }),
  Object.freeze({ key: "RB", label: "Running backs", positions: Object.freeze(["RB", "FB"]), columns: Object.freeze(["rushingYards", "receptions", "receivingYards", "anytimeTd"]) }),
  Object.freeze({ key: "WRTE", label: "Receivers and tight ends", positions: Object.freeze(["WR", "TE"]), columns: Object.freeze(["receptions", "receivingYards", "anytimeTd"]) }),
]);
const GROUP_OF = new Map(GROUPS.flatMap((g) => g.positions.map((p) => [p, g])));
export const FAMILY = Object.freeze(Object.fromEntries(PLAYER_FAMILIES.filter((f) => MARKET_KEY[f.key]).map((f) => [f.key, f])));
/** Board market key → the direction-qualification key in the authorization record (same as graphics-export.mjs). */
const DIRECTION_KEY = Object.freeze({ player_receptions: "receptions", player_reception_yds: "reception_yds", player_pass_yds: "pass_yds", player_rush_yds: "rush_yds" });
const MARKET_TYPE = Object.freeze({ anytime_td: "YES_NO", player_receptions: "OVER_UNDER", player_reception_yds: "OVER_UNDER", player_pass_yds: "OVER_UNDER", player_rush_yds: "OVER_UNDER" });
/** Never on a card: ruled out of the game. */
export const EXCLUDED_AVAILABILITY = Object.freeze(["OUT", "INACTIVE", "INJURED_RESERVE", "SUSPENDED"]);
export const TARGET_PER_TEAM = 5;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
/** The raw board's stored number for a view family: the median for yards/receptions, the probability for anytime TD. */
const boardNumber = (bp, fam) => (fam === "anytimeTd" ? bp?.markets?.anytime_td?.probability : bp?.markets?.[MARKET_KEY[fam]]?.median);
const usage = (bp, group) => {
  const m = bp?.markets ?? {};
  if (group === "QB") return m.player_pass_yds?.mean ?? -1;
  if (group === "RB") return m.player_rush_yds?.mean ?? m.player_reception_yds?.mean ?? -1;
  return m.player_reception_yds?.mean ?? m.player_receptions?.mean ?? -1;
};

/** ET calendar weekday of a kickoff ("Sun", "Mon", …). */
export const etWeekday = (kickoffUtc) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date(instantMs(kickoffUtc)));

/**
 * One game's document.
 * @param {{ view: any, board: any, positions: Map<string,string>, asOf: string, purpose?: string, boardSha256?: string|null,
 *           rosterRef?: {ref: string, sha256: string|null}|null, authorizationRecord?: object, inputs?: Array<{ref: string, sha256: string|null}> }} o
 */
export function buildNflGameGraphicsExport({ view, board, positions, asOf, purpose = PURPOSE.FOUNDER_REVIEW, boardSha256 = null, authorizationRecord = DISPLAY_AUTHORIZATION, inputs = [] }) {
  const t = Date.parse(asOf ?? "");
  if (!Number.isFinite(t)) throw new ExportRefusal("asOf (ISO instant) is required");
  if (!Object.values(PURPOSE).includes(purpose)) throw new ExportRefusal(`unknown purpose ${purpose}`);
  if (!view) throw new ExportRefusal("no game page view");
  const eventId = String(view.providerEventId);
  if (!board || String(board.providerEventId) !== eventId) throw new ExportRefusal(`${eventId}: no committed player board for this game`);
  if (board.kickoffUtc !== view.kickoffUtc) throw new ExportRefusal(`${eventId}: board kickoff ${board.kickoffUtc} ≠ view kickoff ${view.kickoffUtc}`);
  if (!(instantMs(view.kickoffUtc) > t)) throw new ExportRefusal(`${eventId} ${view.matchup}: the game has started at ${asOf} (kickoff ${view.kickoffUtc}); a started game is never a pregame graphic`);
  const snapshotId = view.official?.snapshotId ?? null;
  if (!snapshotId) throw new ExportRefusal(`${eventId}: no official snapshot (${view.official?.refusal ?? "NO_OFFICIAL_SNAPSHOT"}); no number on this game is official`);
  if (!(positions instanceof Map) || positions.size === 0) throw new ExportRefusal("no roster positions (public/data/nfl/rosters/latest.json)");

  const away = view.away.abbr; const home = view.home.abbr;
  const editionKey = `${view.seasonType}-${String(view.week).padStart(2, "0")}`;
  const boardRow = new Map((board.players ?? []).map((p) => [String(p.playerId), p]));
  const familyState = (fam) => board.families?.[MARKET_KEY[fam]]?.state ?? "ABSENT";
  const excluded = [];

  // Candidates: every player the view (the official snapshot) projects, ruled-out players removed.
  const candidates = [];
  for (const p of view.players) {
    const bp = boardRow.get(p.playerId) ?? null;
    const states = p.availability.map((a) => a.state);
    if (bp?.participation) states.push(bp.participation);
    if (states.some((s) => EXCLUDED_AVAILABILITY.includes(s))) { excluded.push({ playerId: p.playerId, name: p.name, team: p.team, reason: `AVAILABILITY_${states.find((s) => EXCLUDED_AVAILABILITY.includes(s))}` }); continue; }
    if (p.team !== away && p.team !== home) throw new ExportRefusal(`${eventId} ${p.playerId}: team ${p.team} is not in ${view.matchup}`);
    const position = positions.get(p.playerId.replace(/^nfl-athlete-/, "")) ?? null;
    const group = position ? GROUP_OF.get(position) ?? null : null;
    if (!group) { excluded.push({ playerId: p.playerId, name: p.name, team: p.team, reason: position ? `POSITION_${position}_NOT_CARDED` : "NO_ROSTER_POSITION" }); continue; }
    candidates.push({ p, bp, position, group });
  }

  const teams = [away, home].map((team) => {
    const mine = candidates.filter((c) => c.p.team === team);
    const ordered = [];
    for (const g of GROUPS) {
      const inGroup = mine.filter((c) => c.group.key === g.key).sort((a, b) =>
        usage(b.bp, g.key) - usage(a.bp, g.key) || (b.p.families.anytimeTd?.value ?? 0) - (a.p.families.anytimeTd?.value ?? 0) || a.p.name.localeCompare(b.p.name));
      const keep = g.key === "QB" ? inGroup.slice(0, 1) : inGroup;
      for (const c of inGroup.slice(keep.length)) excluded.push({ playerId: c.p.playerId, name: c.p.name, team, reason: "BACKUP_QB" });
      ordered.push(...keep);
    }
    return { team, homeAway: team === away ? "away" : "home", players: ordered };
  });

  const rows = [];
  const teamsOut = teams.map(({ team, homeAway, players }) => ({
    team, homeAway,
    players: players.map(({ p, bp, position, group }, i) => {
      const cells = group.columns.map((fam) => {
        const f = FAMILY[fam];
        const mk = MARKET_KEY[fam];
        const entry = p.families[fam] ?? null;
        const fs = familyState(fam);
        let status; let value = null; let reason = null;
        if (entry) {
          if (fs !== "PUBLISHED") throw new ExportRefusal(`${eventId} ${p.playerId} ${fam}: view row present but the board family is ${fs}`);
          if (entry.snapshotId !== snapshotId) throw new ExportRefusal(`${eventId} ${p.playerId} ${fam}: row from snapshot ${entry.snapshotId}, not ${snapshotId}`);
          const raw = boardNumber(bp, fam);
          if (raw !== entry.value) throw new ExportRefusal(`${eventId} ${p.playerId} ${fam}: view value ${entry.value} ≠ player board ${raw}`);
          status = MODEL_STATUS.OFFICIAL; value = entry.value;
        } else if (fs === "ESTIMATE") {
          status = MODEL_STATUS.OFFICIAL_ESTIMATE; reason = "NOT_CLEARED_FOR_PUBLICATION";
          if (ESTIMATE_DISPLAY.allowed) throw new ExportRefusal("ESTIMATE_DISPLAY.allowed is true but no estimate value path is implemented (the view carries none)");
        } else {
          status = MODEL_STATUS.UNAVAILABLE; reason = fs === "PUBLISHED" ? "NO_OFFICIAL_PROJECTION_FOR_PLAYER" : `FAMILY_${fs}`;
        }
        const rowId = `nfl:${editionKey}:${eventId}:${p.playerId}:${mk}`;
        const extra = [];
        if (!(instantMs(view.kickoffUtc) > t)) extra.push("GAME_STARTED");
        const reasons = [...(status === MODEL_STATUS.OFFICIAL ? [] : [`MODEL_STATUS_${status}`]), ...(value == null ? ["NO_VALUE"] : []), ...extra];
        rows.push({
          rowId,
          kind: "PLAYER_PROP",
          identity: {
            sport: "nfl", seasonType: view.seasonType, week: view.week, eventId, matchup: view.matchup, kickoffUtc: view.kickoffUtc,
            playerId: p.playerId, playerName: p.name, team, opponent: p.opponent, position, group: group.key,
            market: mk, marketLabel: f.title, short: f.short, metric: fam === "anytimeTd" ? "probability" : "median",
          },
          officialForecast: { id: "nfl-official-player-board", modelVersion: entry?.modelVersion ?? view.official.modelVersions?.[mk] ?? null, gameRecordModel: view.record?.modelId ?? null },
          snapshot: { id: snapshotId, boardGeneratedAt: view.official.boardGeneratedAt ?? board.generatedAt ?? null, recordGeneratedAt: view.record?.generatedAt ?? null, lockAt: view.kickoffUtc },
          model: { status, value, kind: f.kind, display: value == null ? null : formatValue(f.kind, value), reason, familyState: fs, availability: p.availabilityLabel ?? null },
          checks: { gamePageValue: entry ? "EQUAL" : "NOT_FOUND", playerBoardValue: entry ? "EQUAL" : "NOT_APPLICABLE", officialSnapshot: "GAME_PAGE_READS_SNAPSHOT" },
          ...marketFields({ sport: "nfl", directionKey: DIRECTION_KEY[mk] ?? null, marketType: MARKET_TYPE[mk], record: authorizationRecord }),
          graphicEligibility: { eligible: reasons.length === 0, reasons },
          provenance: { playerBoard: `app/public/data/nfl/player-board/${eventId}.json`, playerBoardSha256: boardSha256, gamePage: `/nfl/game/${eventId}/ (forecast-view-load.mjs loadForecastViews)`, position: "app/public/data/nfl/rosters/latest.json" },
        });
        return { family: fam, rowId };
      });
      return { order: i + 1, playerId: p.playerId, name: p.name, position, group: group.key, availability: p.availabilityLabel ?? null, rowIds: cells.map((c) => c.rowId) };
    }),
  }));

  const counts = Object.fromEntries(teamsOut.map((x) => [x.team, x.players.length]));
  return {
    schemaVersion: GRAPHICS_EXPORT_SCHEMA,
    sport: "nfl",
    edition: { kind: EDITION_KIND, key: `${editionKey}:${eventId}`, seasonType: view.seasonType, week: view.week, eventId },
    asOf,
    purpose,
    socialAuthorized: false,
    publication: { status: "PUBLISHED", snapshotId },
    game: { eventId, matchup: view.matchup, kickoffUtc: view.kickoffUtc, etWeekday: etWeekday(view.kickoffUtc), away, home, awayName: view.away.name ?? null, homeName: view.home.name ?? null },
    scope: {
      rule: "Every player the official snapshot projects for this game, ruled-out players removed, one QB per team (the board's starter); a game that has kicked off at asOf is refused.",
      eventsIncluded: [{ eventId, matchup: view.matchup, kickoffUtc: view.kickoffUtc }],
      eventsExcludedStarted: [],
      targetPerTeam: TARGET_PER_TEAM,
      playersPerTeam: counts,
      belowTarget: Object.entries(counts).filter(([, n]) => n < TARGET_PER_TEAM).map(([k]) => k),
    },
    families: Object.fromEntries(Object.keys(FAMILY).map((fam) => [MARKET_KEY[fam], familyState(fam)])),
    estimateDisplay: { allowed: ESTIMATE_DISPLAY.allowed, basis: ESTIMATE_DISPLAY.basis },
    authorization: socialAuthorization("nfl", authorizationRecord),
    teams: teamsOut,
    excluded,
    rows,
    inputs: [...inputs].map((i) => ({ ref: String(i.ref), sha256: i.sha256 ?? null })).sort((a, b) => a.ref.localeCompare(b.ref)),
    usageRules: [
      "Print model.display exactly; a cell whose status is not OFFICIAL prints the missing-number mark and is never filled from another source.",
      "No sportsbook line, price, side or colour: NFL families are not direction-qualified and NFL social display is not authorized.",
      `A game that has kicked off is never posted as a pregame forecast. ${NO_OFFICIAL_PROJECTION} is never replaced by a simulation number.`,
    ],
  };
}

export const serializeNflGameGraphicsExport = (doc) => `${JSON.stringify(doc, null, 2)}\n`;

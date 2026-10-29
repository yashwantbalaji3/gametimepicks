/**
 * NBA DAILY TOP BOARDS FROM THE OFFICIAL LANE (Track D, 2026-10-29). PURE, no I/O.
 *
 * One board per supported statistic — points, rebounds, assists, threes, PRA, P+R, P+A — over ONE published lane
 * snapshot (`nba-experimental-public-snapshot@1`, app/public/data/nba/experimental-public/<date>.json: the v0.1 player
 * medians the official NBA composition prints). Nothing else is read: never the internal v0.1 forecast file, never the
 * v1 supporting simulation, never a private `nba-top-boards` edition (those rank by a MEAN on discrete boards, which is
 * not the median the lane prints), never a price.
 *
 * RANKING METHOD (stated on every board): the lane's projected MEDIAN, highest first; ties on expected minutes, then the
 * athlete id — so the order is the model's and never the file's. A median is the middle of the simulated range; it is
 * never relabelled as a chance to go over a line, and no line, side, edge or probability exists here.
 *
 * ELIGIBILITY: a lane row (the lane already applies its roster gate and the 10-minute cut) with no injury designation
 * and a finite median for the statistic. A Day-To-Day player is listed in `excluded`, never ranked (the NFL boards' rule:
 * only a clearly available player ranks). A missing median is not a zero: the player is simply not on that board, and
 * an empty board says why.
 *
 * PREGAME ONLY: a game whose tip is at or before `nowIso` (or unknown — fail closed) is out of scope.
 *
 * PUBLICATION GATE. The lane snapshot itself says it publishes no rankings (`withheld.markets`), and §13 amendment A
 * allows only a READER's sort on /nba/projections ("no position number"). A published NBA ranking therefore needs a
 * founder decision first. `NBA_LANE_TOP_BOARDS_PUBLICATION.public` is false, every board carries that status, and no
 * public route imports this module (lane-top-boards.test.mjs pins it). Flipping it is a founder decision, not a code fix.
 */
import { LANE_SNAPSHOT_SCHEMA, PROJECTION_BOARD_STATS } from "./experimental-public-lane.mjs";

export const NBA_LANE_TOP_BOARDS_SCHEMA = "nba-lane-top-boards@1";
export const NBA_LANE_TOP_BOARD_SIZE = 5;
export const NBA_LANE_TOP_BOARD_SOURCE = "NBA_PUBLIC_LANE_V0_1_MEDIANS";

export const NBA_LANE_TOP_BOARDS_PUBLICATION = Object.freeze({
  public: false,
  state: "GATED_PENDING_FOUNDER_DECISION",
  reason: "The public NBA lane states that it publishes no rankings (it lists players by expected minutes and allows only a reader's own sort on /nba/projections). A published NBA Top board needs a founder decision and a lane amendment first.",
});

const LABEL = Object.freeze({ pts: "Points", reb: "Rebounds", ast: "Assists", threePm: "Threes made", pra: "Points + rebounds + assists", ptsReb: "Points + rebounds", ptsAst: "Points + assists" });
const COMBO = new Set(["pra", "ptsReb", "ptsAst"]);

/** The stated ranking method per statistic. */
export const NBA_LANE_BOARD_METHOD = Object.freeze(Object.fromEntries(PROJECTION_BOARD_STATS.map(([k]) => [k, Object.freeze({
  metric: "median",
  text: COMBO.has(k)
    ? `Ranked by projected median ${LABEL[k].toLowerCase()} (the middle of the official player model's simulated range for the per-draw sum). Not a chance to go over any line.`
    : `Ranked by projected median ${LABEL[k].toLowerCase()} (the middle of the official player model's simulated range). Not a chance to go over any line.`,
})])));

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const tipMs = (iso) => Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
/** The lane value a reader sees for (row, stat): the median, or the combo median. Null when absent. */
export const laneValue = (row, k) => (row?.medians && k in row.medians ? row.medians[k] : row?.comboMedians?.[k]) ?? null;

/**
 * The daily boards over one lane snapshot, or null when there is no lane.
 * @param {any} lane  a committed lane snapshot
 * @param {{ nowIso: string, size?: number }} o
 */
export function buildLaneTopBoards(lane, { nowIso, size = NBA_LANE_TOP_BOARD_SIZE } = /** @type {any} */ ({})) {
  if (!lane) return null;
  if (lane.schema !== LANE_SNAPSHOT_SCHEMA) throw new Error(`buildLaneTopBoards: not a lane snapshot (${lane.schema})`);
  const now = Date.parse(nowIso ?? "");
  if (!Number.isFinite(now)) throw new Error("buildLaneTopBoards: nowIso (ISO) is required");
  const games = lane.games ?? [];
  const live = games.filter((g) => { const t = tipMs(g.tipUtc); return Number.isFinite(t) && t > now; });
  const started = games.filter((g) => !live.includes(g)).map((g) => String(g.providerEventId));

  const pool = [];
  const excluded = [];
  for (const g of live) for (const side of ["away", "home"]) {
    const team = g[side]?.abbr ?? null;
    const opponent = g[side === "away" ? "home" : "away"]?.abbr ?? null;
    for (const r of g.players?.[side] ?? []) {
      const base = { providerEventId: String(g.providerEventId), providerAthleteId: String(r.providerAthleteId), name: r.name ?? "", team, opponent, tipUtc: g.tipUtc, expectedMinutes: isNum(r.expectedMinutes) ? r.expectedMinutes : null, receiptPayloadSha256: g.receipt?.payloadSha256 ?? null };
      if (r.injuryStatus != null) { excluded.push({ ...base, reason: `INJURY_DESIGNATION:${r.injuryStatus}` }); continue; }
      pool.push({ base, row: r });
    }
  }

  const boards = PROJECTION_BOARD_STATS.map(([k, short]) => {
    const head = { key: k, short, label: LABEL[k], method: NBA_LANE_BOARD_METHOD[k].metric, methodText: NBA_LANE_BOARD_METHOD[k].text, source: NBA_LANE_TOP_BOARD_SOURCE, topN: size, publication: NBA_LANE_TOP_BOARDS_PUBLICATION.state };
    const ranked = pool
      .map(({ base, row }) => ({ base, value: laneValue(row, k) }))
      .filter((x) => isNum(x.value))
      .sort((a, b) => b.value - a.value || (b.base.expectedMinutes ?? -1) - (a.base.expectedMinutes ?? -1) || a.base.providerAthleteId.localeCompare(b.base.providerAthleteId))
      .slice(0, size)
      .map((x, i) => ({ rank: i + 1, ...x.base, value: x.value }));
    if (!live.length) return { ...head, state: "UNAVAILABLE", reason: "NO_PREGAME_GAMES", text: `${LABEL[k]}: unavailable — every game on this slate has tipped off.`, rows: [] };
    if (!ranked.length) return { ...head, state: "UNAVAILABLE", reason: "NO_PROJECTED_PLAYER", text: `${LABEL[k]}: unavailable — no cleared player on this slate has an official projection for this statistic.`, rows: [] };
    return { ...head, state: "RANKED", rows: ranked };
  });

  return {
    schema: NBA_LANE_TOP_BOARDS_SCHEMA,
    publication: NBA_LANE_TOP_BOARDS_PUBLICATION,
    date: lane.date,
    source: { laneSchema: lane.schema, laneGeneratedAt: lane.generatedAt ?? null, family: lane.source?.family ?? null, file: lane.source?.file ?? null, commit: lane.source?.commit ?? null },
    scope: { eventsIncluded: live.length, events: live.map((g) => String(g.providerEventId)), eventsStarted: started },
    boards,
    excluded,
  };
}

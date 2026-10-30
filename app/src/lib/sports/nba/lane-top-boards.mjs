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
 * PUBLICATION (founder 2026-10-29 + 2026-10-30, recorded as §13 amendment B in experimental-public-lane.mjs). The lane
 * files say they publish no rankings and are frozen, so the decision lives in code: `NBA_LANE_TOP_BOARDS_PUBLICATION`
 * follows AMENDMENT_B.enabled. A board reaches a page ONLY through `gateLaneTopBoards`, which renders the boards when
 *   (1) PROVENANCE — the lane is the current slate's committed snapshot (latest.json byte-equal to <date>.json), on the
 *       lane schema, naming its official v0.1 source file and commit, every game carrying a well-formed v0.1 forecast
 *       receipt (schema, family, 64-hex payload hash) frozen strictly before its tip-off; and
 *   (2) CROSS-PAGE — every ranked row's value is the lane row's median AND the /nba/projections row's value
 *       (projection-board-ops boardRows, the board's only source) with the same display digits, the same player id,
 *       team and receipt payload hash;
 * otherwise the whole section is one explicit unavailable state — never a partial board, never a fabricated row.
 * The receipt-hash RE-DERIVATION against the official forecast file (receiptIntegrity + snapshotMatchesSource, the
 * publisher's own check) needs data/internal, which is not a build input; it runs at publish (the publisher refuses the
 * whole slate on any failure) and over every committed date in lane-top-boards.test.mjs, together with board ==
 * official snapshot (nbaOfficialSnapshot, 1 dp).
 */
import { AMENDMENT_A, AMENDMENT_B, LANE, LANE_SNAPSHOT_SCHEMA, PROJECTION_BOARD_STATS } from "./experimental-public-lane.mjs";
import { boardRows } from "./projection-board-ops.mjs";

export const NBA_LANE_TOP_BOARDS_SCHEMA = "nba-lane-top-boards@1";
export const NBA_LANE_TOP_BOARD_SIZE = 5;
export const NBA_LANE_TOP_BOARD_SOURCE = "NBA_PUBLIC_LANE_V0_1_MEDIANS";

export const NBA_LANE_TOP_BOARDS_PUBLICATION = Object.freeze({
  public: AMENDMENT_B.enabled,
  state: AMENDMENT_B.enabled ? "PUBLIC_GATED" : "APPROVED_FOR_PREPARATION",
  amendment: AMENDMENT_B.id,
  surface: AMENDMENT_B.surface,
  decisions: AMENDMENT_B.decisions,
  reason: "Public on /nba/projections behind the provenance + cross-page gate (gateLaneTopBoards): titles name the ranked metric (projected median points, rebounds, …); a failing gate renders an explicit unavailable state.",
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
 * @param {{ nowIso: string, size?: number, startedIds?: Iterable<string> }} o  `startedIds`: games the schedule / finals
 *   record says have started, finished or been postponed (projection-board-context boardGames) — out of scope whatever
 *   the frozen tip-off says (a rescheduled game; the NFL pregameScope rule's kickoffOf).
 */
export function buildLaneTopBoards(lane, { nowIso, size = NBA_LANE_TOP_BOARD_SIZE, startedIds = [] } = /** @type {any} */ ({})) {
  if (!lane) return null;
  if (lane.schema !== LANE_SNAPSHOT_SCHEMA) throw new Error(`buildLaneTopBoards: not a lane snapshot (${lane.schema})`);
  const now = Date.parse(nowIso ?? "");
  if (!Number.isFinite(now)) throw new Error("buildLaneTopBoards: nowIso (ISO) is required");
  const games = lane.games ?? [];
  const off = new Set([...(startedIds ?? [])].map(String));
  const live = games.filter((g) => { const t = tipMs(g.tipUtc); return Number.isFinite(t) && t > now && !off.has(String(g.providerEventId)); });
  const started = games.filter((g) => !live.includes(g)).map((g) => String(g.providerEventId));

  const pool = [];
  const excluded = [];
  for (const g of live) for (const side of ["away", "home"]) {
    const team = g[side]?.abbr ?? null;
    const opponent = g[side === "away" ? "home" : "away"]?.abbr ?? null;
    for (const r of g.players?.[side] ?? []) {
      const base = { providerEventId: String(g.providerEventId), providerAthleteId: String(r.providerAthleteId), name: r.name ?? "", team, opponent, matchup: `${g.away?.abbr ?? ""} @ ${g.home?.abbr ?? ""}`, tipUtc: g.tipUtc, frozenAt: g.frozenAt ?? null, expectedMinutes: isNum(r.expectedMinutes) ? r.expectedMinutes : null, receiptPayloadSha256: g.receipt?.payloadSha256 ?? null };
      if (r.injuryStatus != null) { excluded.push({ ...base, reason: `INJURY_DESIGNATION:${r.injuryStatus}` }); continue; }
      pool.push({ base, row: r });
    }
  }

  const boards = PROJECTION_BOARD_STATS.map(([k, short]) => {
    const head = { key: k, short, label: LABEL[k], title: `Highest projected ${LABEL[k].toLowerCase()} (model median)`, method: NBA_LANE_BOARD_METHOD[k].metric, methodText: NBA_LANE_BOARD_METHOD[k].text, source: NBA_LANE_TOP_BOARD_SOURCE, topN: size, publication: NBA_LANE_TOP_BOARDS_PUBLICATION.state };
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
    publication: NBA_LANE_TOP_BOARDS_PUBLICATION.state,
    date: lane.date,
    builtAt: new Date(now).toISOString(),
    source: { laneSchema: lane.schema, laneGeneratedAt: lane.generatedAt ?? null, family: lane.source?.family ?? null, file: lane.source?.file ?? null, commit: lane.source?.commit ?? null },
    scope: { eventsIncluded: live.length, events: live.map((g) => String(g.providerEventId)), eventsStarted: started },
    boards,
    excluded,
  };
}

/** The display digits: the lane's own number, as /nba/projections and the /nba lane print it (String, never re-rounded). */
export const laneDisplay = (v) => (v == null ? "—" : String(v));

const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const RECEIPT_SCHEMA = "nba-forecast-receipt@1";

/**
 * (1) PROVENANCE, from build inputs only. `dated` is the committed <date>.json for the lane's own date (loadLaneForDate):
 * the current view reads latest.json, so the two must be the same document — a latest.json that drifted from its write-once
 * dated file is not the frozen slate. Returns the list of problems (empty = verified).
 */
export function laneProvenance(lane, dated) {
  const p = [];
  if (!lane) return ["no lane snapshot"];
  if (lane.schema !== LANE_SNAPSHOT_SCHEMA) p.push(`schema ${lane.schema}`);
  if (lane.lane !== LANE.id) p.push(`lane ${lane.lane}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(lane.date ?? ""))) p.push(`date ${lane.date}`);
  if (lane.source?.family !== LANE.sourceFamily) p.push(`source family ${lane.source?.family}`);
  if (lane.source?.file !== `nba/experimental-${LANE.sourceFamily}/forecasts/${lane.date}.json`) p.push(`source file ${lane.source?.file}`);
  if (!HEX40.test(String(lane.source?.commit ?? ""))) p.push("source commit is not a 40-hex sha");
  if (!dated) p.push(`no committed ${lane.date}.json`);
  else if (JSON.stringify(dated) !== JSON.stringify(lane)) p.push(`latest.json differs from the committed ${lane.date}.json`);
  const seen = new Set();
  for (const g of lane.games ?? []) {
    const id = String(g.providerEventId ?? "");
    if (!id || seen.has(id)) p.push(`game id ${id || "missing"} missing or repeated`);
    seen.add(id);
    const r = g.receipt ?? {};
    if (r.schema !== RECEIPT_SCHEMA) p.push(`${id}: receipt schema ${r.schema}`);
    if (r.family !== lane.source?.family) p.push(`${id}: receipt family ${r.family}`);
    if (!HEX64.test(String(r.payloadSha256 ?? ""))) p.push(`${id}: receipt payload hash is not a 64-hex sha256`);
    if (g.etDate !== lane.date) p.push(`${id}: etDate ${g.etDate} is not the slate date`);
    const frozen = Date.parse(g.frozenAt ?? ""), tip = tipMs(g.tipUtc);
    if (!(Number.isFinite(frozen) && Number.isFinite(tip) && frozen < tip)) p.push(`${id}: frozen ${g.frozenAt} is not strictly before tip-off ${g.tipUtc}`);
  }
  if (!seen.size) p.push("the lane has no games");
  return p;
}

/**
 * (2) CROSS-PAGE: every ranked row against the lane row and the /nba/projections row (boardRows — that page's only
 * source), by player id: value, display digits, team, receipt hash. Returns the list of problems (empty = consistent).
 */
export function crossPageProblems(doc, lane) {
  const p = [];
  const proj = new Map(boardRows(lane, PROJECTION_BOARD_STATS).map((r) => [r.id, r]));
  const games = new Map((lane?.games ?? []).map((g) => [String(g.providerEventId), g]));
  for (const b of doc?.boards ?? []) {
    const idx = PROJECTION_BOARD_STATS.findIndex(([k]) => k === b.key);
    if (idx < 0) { p.push(`${b.key}: not a /nba/projections statistic`); continue; }
    for (const r of b.rows ?? []) {
      const at = `${b.key} #${r.rank} ${r.providerAthleteId}`;
      const g = games.get(r.providerEventId);
      const side = g && ["away", "home"].find((s) => (g.players?.[s] ?? []).some((x) => String(x.providerAthleteId) === r.providerAthleteId));
      const lr = side ? g.players[side].find((x) => String(x.providerAthleteId) === r.providerAthleteId) : null;
      const pr = proj.get(`${r.providerEventId}:${r.providerAthleteId}`);
      if (!lr || !pr) { p.push(`${at}: not on the lane / not on /nba/projections`); continue; }
      if (!isNum(r.value) || r.value !== laneValue(lr, b.key)) p.push(`${at}: board ${r.value} ≠ lane ${laneValue(lr, b.key)}`);
      if (r.value !== pr.v[idx] || laneDisplay(r.value) !== laneDisplay(pr.v[idx])) p.push(`${at}: board ${r.value} ≠ /nba/projections ${pr.v[idx]}`);
      if (r.team !== (g[side]?.abbr ?? null) || pr.team !== (r.team ?? "")) p.push(`${at}: team ${r.team} ≠ ${g[side]?.abbr}`);
      if (r.name !== pr.name) p.push(`${at}: name ${r.name} ≠ ${pr.name}`);
      if (r.receiptPayloadSha256 !== g.receipt?.payloadSha256) p.push(`${at}: receipt ${r.receiptPayloadSha256} ≠ ${g.receipt?.payloadSha256}`);
    }
  }
  return p;
}

export const NBA_TOP_BOARDS_UNAVAILABLE_TEXT = Object.freeze({
  PROVENANCE: "Top Boards: unavailable — this slate's Official Forecast snapshot could not be verified in this build, so no ranking is shown.",
  CROSS_PAGE: "Top Boards: unavailable — a ranked figure did not match the Predicted Player Statistics table, so no ranking is shown.",
  NO_PREGAME_GAMES: "Top Boards: unavailable — every game on this slate had tipped off when this page was built.",
});

/**
 * THE ONE ENTRY a page uses. null = no section (switch off, or no current lane: the page already says the forecast is
 * unavailable). Otherwise PUBLISHED with the boards, or UNAVAILABLE with one reason — all boards or none.
 * @param {any} lane     the current view's snapshot (latest.json through loadCurrentLane)
 * @param {{ dated: any, nowIso: string, startedIds?: Iterable<string>, enabled?: boolean }} o
 */
export function gateLaneTopBoards(lane, { dated, nowIso, startedIds = [], enabled = NBA_LANE_TOP_BOARDS_PUBLICATION.public && AMENDMENT_A.enabled } = /** @type {any} */ ({})) {
  if (!enabled || !lane || !(lane.games?.length)) return null;
  const provenance = laneProvenance(lane, dated);
  if (provenance.length) return { state: "UNAVAILABLE", reason: "PROVENANCE", text: NBA_TOP_BOARDS_UNAVAILABLE_TEXT.PROVENANCE, problems: provenance };
  const doc = buildLaneTopBoards(lane, { nowIso, startedIds });
  if (!doc.scope.eventsIncluded) return { state: "UNAVAILABLE", reason: "NO_PREGAME_GAMES", text: NBA_TOP_BOARDS_UNAVAILABLE_TEXT.NO_PREGAME_GAMES, problems: [] };
  const cross = crossPageProblems(doc, lane);
  if (cross.length) return { state: "UNAVAILABLE", reason: "CROSS_PAGE", text: NBA_TOP_BOARDS_UNAVAILABLE_TEXT.CROSS_PAGE, problems: cross };
  return { state: "PUBLISHED", doc };
}

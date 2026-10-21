/**
 * CROSS-PRODUCT PREDICTION CONSISTENCY · THE OFFICIAL FORECAST SNAPSHOT (founder requirement, approved 2026-10-20).
 *
 * ONE authoritative, versioned snapshot per NFL / NBA game. Every product surface (Simulation Theater default run and
 * projected box score, game previews, Top 10 boards, Bank Builder, Moonshot, Parlay Lab, Smart Betslip, Live Hub frozen
 * pregame forecasts, Results) must read its numbers from this object — never from a supporting simulation, never from
 * a re-derived copy. Products differ only in qualification / payout / diversification / correlation controls.
 *
 * Schema `gtp.contract.official-forecast-snapshot@1`:
 *   { schema, sport, eventId (canonical provider id), snapshotId (sha256 of the canonical JSON of everything else),
 *     modelVersions { game, players { family → "id@version" } }, inputAsOf, generatedAt, frozenAt, lockAt,
 *     publication PUBLIC | PRIVATE, capability { state, canShowLiveProjections, canEnterPredictionProducts },
 *     game { pHome, pAway, pTie, pHomePublished, winner, projectedScore, home, away, margin, total },
 *     players [ { playerId, team, displayName, participation, families { family → { state, distribution, expected,
 *                 median, support } } } ],
 *     sources [ { role OFFICIAL | SUPPORTING_SIMULATION | SHADOW, path, sha256, hashBasis, modelVersion, generatedAt,
 *                 inputRef, alignedWithOfficial } ],
 *     excluded [ { playerId|null, reason } ] }
 *
 * IDENTITY. Players are keyed by owner ids only (NFL `nfl-athlete-<espnId>`, NBA providerAthleteId). `displayName` is
 * carried for presentation and is NEVER an identity: `playerOf` refuses to look a player up by anything but the id,
 * and a board row with no id is excluded (recorded), never matched by name.
 *
 * SOURCES OF RECORD.
 *   NFL game     the forecast of record — latest receipt generated strictly before kickoff (`forecastOfRecord`, the
 *                owner's rule in forecast-ledger/adapters/nfl.mjs), model nfl-regular-season-public-v1.
 *   NFL players  the player board for the same event (the families the prop ledger freezes and grades).
 *   NFL World Model V2 → SUPPORTING_SIMULATION; NFL sim-v2 drive engine → SHADOW. Both are attached as sources with
 *                their own versions and input references, and their numbers are NEVER merged into the official ones.
 *   NBA game     the Elo favoured side carried in the v0.1 receipt (founder N2) — the side and its Elo pHome only.
 *                Team scores / margin / total have NO official value (WITHHELD): the v0.1 team score ignores the
 *                opponent and contradicts the Elo side, and the coherent v1 engine is not anchored to Elo yet.
 *   NBA players  the v0.1 roster-gated family (founder N1, player champion) — the same receipt the public /nba lane
 *                (#1146) publishes medians from, so the lane, the Theater and every product read ONE source.
 *   NBA v1 (nba-sim-v1-coherent) → SUPPORTING_SIMULATION: attached as a source with its own version and input
 *                hashes (alignedWithOfficial = same injury + roster inputs); its numbers are NEVER merged in.
 *                Every NBA receipt must pass `receiptIntegrity` (a broken or receipt-less game never becomes official);
 *                the snapshot stays PRIVATE until the registry lets NBA show live projections.
 *
 * EXACT NUMBERS. Values are copied exactly as the owner stored them (unrounded where the owner kept an unrounded copy,
 * e.g. NFL `winProbability.homeUnrounded`). Nothing here rounds.
 *
 * Pure: parsed documents in, snapshot out. No fs, no clock.
 */
import { canonicalJson, receiptIntegrity, sha256 } from "../sports/nba/forecast-receipt.mjs";
import { forecastOfRecord } from "../forecast-ledger/adapters/nfl.mjs";
import { canEnterPredictionProducts, canShowLiveProjections, capabilityState } from "../sport-capability-registry.ts";
import { LANE, MIN_EXPECTED_MINUTES as LANE_MIN_EXPECTED_MINUTES, STATS as LANE_STATS, WITHHELD as LANE_WITHHELD } from "../sports/nba/experimental-public-lane.mjs";

export const OFFICIAL_SNAPSHOT_SCHEMA = "gtp.contract.official-forecast-snapshot@1";

export const SOURCE_ROLE = Object.freeze({
  OFFICIAL: "OFFICIAL",
  SUPPORTING_SIMULATION: "SUPPORTING_SIMULATION",
  SHADOW: "SHADOW",
});

export const PUBLICATION = Object.freeze({ PUBLIC: "PUBLIC", PRIVATE: "PRIVATE" });

/** Typed refusal codes — every way a snapshot can fail closed. */
export const SNAPSHOT_REFUSAL = Object.freeze({
  NO_EVENT_ID: "NO_EVENT_ID",
  NO_PRE_LOCK_RECORD: "NO_PRE_LOCK_RECORD",
  RECORD_NO_SUMMARY: "RECORD_NO_SUMMARY",
  NO_PLAYER_BOARD: "NO_PLAYER_BOARD",
  BOARD_EVENT_MISMATCH: "BOARD_EVENT_MISMATCH",
  BOARD_AFTER_LOCK: "BOARD_AFTER_LOCK",
  NO_ARTIFACT: "NO_ARTIFACT",
  GAME_NOT_IN_ARTIFACT: "GAME_NOT_IN_ARTIFACT",
  RECEIPT_INTEGRITY: "RECEIPT_INTEGRITY",
  NO_GAME_DISTRIBUTION: "NO_GAME_DISTRIBUTION",
  NOT_OFFICIAL_FAMILY: "NOT_OFFICIAL_FAMILY",
  NOT_PRE_TIP: "NOT_PRE_TIP",
  NO_WINNER_HEAD: "NO_WINNER_HEAD",
});

export class SnapshotRefusal extends Error {
  constructor(code, message, detail = null) {
    super(`${code}: ${message}`);
    this.name = "SnapshotRefusal";
    this.code = code;
    this.detail = detail;
  }
}

/** Why a player row is not in the snapshot (recorded in `excluded`). */
export const EXCLUSION = Object.freeze({
  NO_PLAYER_ID: "NO_PLAYER_ID",
  DUPLICATE_PLAYER_ID: "DUPLICATE_PLAYER_ID",
  NO_FAMILIES: "NO_FAMILIES",
});

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const iso = (s) => {
  const t = Date.parse(s ?? "");
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** Distribution kinds the evaluator understands. Integer `support` drives the continuity rule (market-evaluator). */
export const DISTRIBUTION_KIND = Object.freeze({
  QUANTILES: "quantiles",
  NORMAL: "normal",
  EMPIRICAL: "empirical",
  BERNOULLI: "bernoulli",
});

const QUANTILE_KEYS = Object.freeze([["p05", 0.05], ["p10", 0.1], ["p25", 0.25], ["p50", 0.5], ["median", 0.5], ["p75", 0.75], ["p90", 0.9], ["p95", 0.95]]);

/** {p10, p25, median|p50, ...} → sorted [{q, v}] (exact values; duplicates of q collapse to the first seen). */
export function quantilePoints(d) {
  const seen = new Map();
  for (const [k, q] of QUANTILE_KEYS) if (isNum(d?.[k]) && !seen.has(q)) seen.set(q, d[k]);
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([q, v]) => ({ q, v }));
}

/**
 * `inputRef` is what the source says it was built from; `expectedInputRef` is what the official record is
 * (record inputHash for World Model V2, record file for sim-v2, record generatedAt for the player board).
 * `alignedWithOfficial` = they are equal (null when there is nothing to compare).
 */
const sourceEntry = ({ role, path, doc, sha256: given, modelVersion, generatedAt, inputRef = null, expectedInputRef = null }) => ({
  role,
  path: path ?? null,
  sha256: given ?? (doc ? sha256(canonicalJson(doc)) : null),
  hashBasis: given ? "file-bytes" : "canonical-json",
  modelVersion: modelVersion ?? null,
  generatedAt: generatedAt ?? null,
  inputRef,
  expectedInputRef,
  alignedWithOfficial: expectedInputRef == null ? null : inputRef === expectedInputRef,
});

function capability(sport) {
  return {
    state: capabilityState(sport),
    canShowLiveProjections: canShowLiveProjections(sport),
    canEnterPredictionProducts: canEnterPredictionProducts(sport),
  };
}

/** Seal: snapshotId = sha256(canonical JSON of the snapshot without its id). Deterministic. */
export function sealSnapshot(body) {
  const { snapshotId: _drop, ...rest } = body;
  return Object.freeze({ ...rest, snapshotId: sha256(canonicalJson(rest)) });
}

/** Look a player up by owner id ONLY. A name, or anything that is not an exact id, never matches. */
export function playerOf(snapshot, playerId) {
  if (playerId == null) return null;
  const id = String(playerId);
  return snapshot?.players?.find((p) => p.playerId === id) ?? null;
}

/* ────────────────────────────────────────────── NFL ────────────────────────────────────────────── */

export const NFL_PLAYER_ID = /^nfl-athlete-\d+$/;

/** Player-board family keys → the model id the board names (or a stable fallback when the board does not name one). */
const NFL_BOARD_FAMILIES = Object.freeze(["player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions", "anytime_td"]);

function nflFamilyModel(board, family) {
  const f = board?.families?.[family] ?? {};
  const id = f.model ?? (family === "anytime_td" ? "nfl-anytime-td-opportunity-v1" : `nfl-player-board:${family}`);
  // The board carries no per-family model version; its schema version is the only version stamp it has.
  return `${id}@board-schema-${board?.schemaVersion ?? "unknown"}`;
}

/**
 * @param {string} eventId  ESPN provider event id
 * @param {{ receipts: Array<{file: string, receipt: object, sha256?: string}>,
 *           playerBoard: {path?: string, doc: object, sha256?: string} | null,
 *           worldModel?: {path?: string, doc: object, sha256?: string} | null,
 *           simReceipt?: {path?: string, doc: object, sha256?: string} | null }} inputs
 */
export function nflOfficialSnapshot(eventId, { receipts = [], playerBoard = null, worldModel = null, simReceipt = null } = {}) {
  if (eventId == null || String(eventId) === "") throw new SnapshotRefusal(SNAPSHOT_REFUSAL.NO_EVENT_ID, "no event id");
  const id = String(eventId);
  const rec = forecastOfRecord(receipts.filter((r) => String(r?.receipt?.providerEventId) === id)).get(id);
  if (!rec) throw new SnapshotRefusal(SNAPSHOT_REFUSAL.NO_PRE_LOCK_RECORD, `no receipt generated strictly before kickoff for ${id}`);
  const r = rec.receipt;
  const s = r.forecastSummary;
  if (!s?.winProbability || !s.margin || !s.total) throw new SnapshotRefusal(SNAPSHOT_REFUSAL.RECORD_NO_SUMMARY, `${rec.file} has no forecastSummary`);
  const lockAt = iso(r.kickoffUtc);

  const board = playerBoard?.doc ?? null;
  if (!board) throw new SnapshotRefusal(SNAPSHOT_REFUSAL.NO_PLAYER_BOARD, `no player board for ${id}`);
  if (String(board.providerEventId) !== id) throw new SnapshotRefusal(SNAPSHOT_REFUSAL.BOARD_EVENT_MISMATCH, `board is for ${board.providerEventId}, not ${id}`);
  if (!(Date.parse(board.generatedAt) < Date.parse(lockAt))) {
    throw new SnapshotRefusal(SNAPSHOT_REFUSAL.BOARD_AFTER_LOCK, `board generatedAt ${board.generatedAt} is not before lock ${lockAt}`, { generatedAt: board.generatedAt, lockAt });
  }

  const recordVersion = `${r.model?.id ?? "unknown"}@v${r.model?.version ?? "?"}`;
  const dist = s.distribution ?? {};
  const pHome = isNum(s.winProbability.homeUnrounded) ? s.winProbability.homeUnrounded : s.winProbability.home;
  const normal = (mean, sd, q) => ({
    distribution: isNum(mean) && isNum(sd)
      ? { kind: DISTRIBUTION_KIND.NORMAL, mean, sd, source: dist.source ?? null }
      : { kind: DISTRIBUTION_KIND.QUANTILES, points: quantilePoints(q) },
    expected: isNum(mean) ? mean : null,
    median: isNum(q?.median) ? q.median : null,
    p10: q?.p10 ?? null,
    p90: q?.p90 ?? null,
    support: "integer",
  });
  // Joint normal over (margin, total) with independent heads ⇒ home = (T+M)/2, away = (T−M)/2.
  const teamNormal = (sign) => {
    if (!(isNum(dist.marginMean) && isNum(dist.totalMean) && isNum(dist.marginSigma) && isNum(dist.totalSigma))) return null;
    return {
      distribution: { kind: DISTRIBUTION_KIND.NORMAL, mean: (dist.totalMean + sign * dist.marginMean) / 2, sd: Math.sqrt(dist.totalSigma ** 2 + dist.marginSigma ** 2) / 2, source: `${dist.source ?? "joint-normal"} (derived: (total ${sign > 0 ? "+" : "−"} margin)/2)` },
      expected: (dist.totalMean + sign * dist.marginMean) / 2,
      median: null,
      published: sign > 0 ? s.projectedScore?.home ?? null : s.projectedScore?.away ?? null,
      support: "integer",
    };
  };

  const players = [];
  const excluded = [];
  const seen = new Set();
  for (const p of board.players ?? []) {
    const pid = p?.playerId == null ? null : String(p.playerId);
    if (!pid || !NFL_PLAYER_ID.test(pid)) { excluded.push({ playerId: pid, reason: EXCLUSION.NO_PLAYER_ID }); continue; }
    if (seen.has(pid)) { excluded.push({ playerId: pid, reason: EXCLUSION.DUPLICATE_PLAYER_ID }); continue; }
    seen.add(pid);
    const families = {};
    for (const fam of NFL_BOARD_FAMILIES) {
      const m = p.markets?.[fam];
      if (!m) continue;
      const state = board.families?.[fam]?.state ?? null;
      if (fam === "anytime_td") {
        if (!isNum(m.probability)) continue;
        families[fam] = { state, distribution: { kind: DISTRIBUTION_KIND.BERNOULLI, p: m.probability }, expected: m.probability, median: null, support: "binary", modelVersion: nflFamilyModel(board, fam) };
        continue;
      }
      const points = quantilePoints(m);
      if (!points.length) continue;
      families[fam] = {
        state,
        distribution: { kind: DISTRIBUTION_KIND.QUANTILES, points, mean: isNum(m.mean) ? m.mean : null, lowerBound: 0 },
        expected: isNum(m.mean) ? m.mean : null,
        median: isNum(m.median) ? m.median : null,
        support: "integer",
        modelVersion: nflFamilyModel(board, fam),
      };
    }
    if (!Object.keys(families).length) { excluded.push({ playerId: pid, reason: EXCLUSION.NO_FAMILIES }); continue; }
    players.push({ playerId: pid, team: p.team ?? null, displayName: p.name ?? null, participation: p.participation ?? null, families });
  }
  players.sort((a, b) => a.playerId.localeCompare(b.playerId));

  const familyVersions = {};
  for (const fam of NFL_BOARD_FAMILIES) if (board.families?.[fam]) familyVersions[fam] = nflFamilyModel(board, fam);

  const sources = [
    sourceEntry({ role: SOURCE_ROLE.OFFICIAL, path: rec.file, doc: r, sha256: rec.sha256, modelVersion: recordVersion, generatedAt: r.generatedAt, inputRef: r.model?.inputHash ?? null, expectedInputRef: r.model?.inputHash ?? null }),
    sourceEntry({ role: SOURCE_ROLE.OFFICIAL, path: playerBoard.path, doc: board, sha256: playerBoard.sha256, modelVersion: `nfl-player-board@schema-${board.schemaVersion}`, generatedAt: board.generatedAt, inputRef: iso(board.sourceGeneratedAt), expectedInputRef: iso(r.generatedAt) }),
  ];
  if (worldModel?.doc) {
    const w = worldModel.doc;
    sources.push(sourceEntry({
      role: SOURCE_ROLE.SUPPORTING_SIMULATION, path: worldModel.path, doc: w, sha256: worldModel.sha256,
      modelVersion: `${w.model?.id ?? "nfl-world-model-v2"}@${w.model?.version ?? "?"}`, generatedAt: w.run?.generatedAt ?? null,
      inputRef: w.run?.inputs?.forecastInputHash ?? null, expectedInputRef: r.model?.inputHash ?? null,
    }));
  }
  if (simReceipt?.doc) {
    const x = simReceipt.doc;
    sources.push(sourceEntry({
      role: SOURCE_ROLE.SHADOW, path: simReceipt.path, doc: x, sha256: simReceipt.sha256,
      modelVersion: `${x.simulationEngine ?? "nfl-drive-sim-v2"}@${x.simulationEngineVersion ?? "?"}`, generatedAt: x.generatedAt ?? null,
      inputRef: x.inputSnapshotIds?.forecastReceipt ?? null, expectedInputRef: rec.file,
    }));
  }

  const cap = capability("nfl");
  return sealSnapshot({
    schema: OFFICIAL_SNAPSHOT_SCHEMA,
    sport: "NFL",
    eventId: id,
    matchup: r.matchup ?? null,
    home: { abbr: r.home?.abbr ?? null }, away: { abbr: r.away?.abbr ?? null },
    modelVersions: { game: recordVersion, players: familyVersions },
    inputAsOf: iso(r.evidence?.strengthCutoff ?? r.generatedAt),
    generatedAt: iso(r.generatedAt),
    frozenAt: iso(r.sideDecision?.frozenAt ?? r.generatedAt),
    lockAt,
    publication: cap.canShowLiveProjections ? PUBLICATION.PUBLIC : PUBLICATION.PRIVATE,
    capability: cap,
    game: {
      pHome,
      pAway: s.winProbability.away ?? null,
      pTie: s.winProbability.tieMass ?? null,
      pHomePublished: s.winProbability.home ?? null,
      winner: { side: r.sideDecision?.publishedSide ?? null, rule: r.sideDecision?.rule ?? null },
      projectedScore: { home: s.projectedScore?.home ?? null, away: s.projectedScore?.away ?? null, convention: s.projectedScore?.convention ?? null },
      home: teamNormal(+1),
      away: teamNormal(-1),
      margin: normal(dist.marginMean, dist.marginSigma, s.margin),
      total: normal(dist.totalMean, dist.totalSigma, s.total),
    },
    players,
    excluded,
    sources,
  });
}

/* ────────────────────────────────────────────── NBA ────────────────────────────────────────────── */

/**
 * WHICH NBA MODEL IS OFFICIAL (founder decisions N1 + N2, made public by #1146 on 2026-10-20). One composition, named
 * and versioned, so the public /nba lane, the Simulation Theater, the boards and every product read the same numbers:
 *   game     the Elo favoured side the v0.1 receipt publishes (`publishedSide`, rule nba-winner-side@1, head elo) and
 *            that head's pHome. The probability is NOT published (preregistration §13).
 *   teams    NO official home / away / margin / total. The v0.1 team score is a sum of its own players' points that
 *            ignores the opponent (it contradicted the Elo side in 2 of 3 opening-night games), and the coherent v1
 *            engine's win probability sat 0.04–0.05 below Elo in all three. Kept null with state WITHHELD until a
 *            model is reconciled — never filled from a supporting simulation, never adjusted to agree with Elo.
 *   players  the v0.1 roster-gated family (player champion): pts, reb, ast, threePm, the same-draw combos pra / ptsReb /
 *            ptsAst, and minutes. rebAst, steals, blocks and turnovers are NOT modelled by any family.
 *   v1       nba-sim-v1-coherent is a SUPPORTING_SIMULATION source (the Theater replays its stored runs); it is
 *            checked against this snapshot (audit `nbaSimAnchorCheck`), never merged into it.
 */
export const NBA_OFFICIAL_FAMILY = LANE.sourceFamily;
export const NBA_SUPPORTING_FAMILY = "v1";
export const NBA_PLAYER_FAMILIES = Object.freeze(["pts", "reb", "ast", "threePm", "pra", "ptsReb", "ptsAst", "minutes"]);
/** Families the public lane prints (median, 1 dp) for players who pass the lane's row rule. */
export const NBA_LANE_FAMILIES = Object.freeze(LANE_STATS.map(([k]) => k));
export const NBA_NOT_MODELLED = Object.freeze(["rebAst", "stl", "blk", "tov"]);
export const NBA_COMPOSITION = Object.freeze({
  id: "nba-official-composition@1",
  game: "Elo favoured side from the v0.1 receipt (founder N2); probability not published",
  teams: "WITHHELD — no official team score, margin or total",
  players: "v0.1 roster-gated player simulation (founder N1)",
  supporting: "v1 nba-sim-v1-coherent — SUPPORTING_SIMULATION, never merged",
});
// NBA top-board roles live in a dependency-free module (board producers run under plain node); re-exported here.
export { NBA_BOARD_ROLE, NBA_BOARD_ROLES } from "./nba-board-roles.mjs";

/**
 * v0's draws are not whole numbers (a points median of 21.38): counting stats are read as the law of an integer by the
 * evaluator's continuity rule (market-evaluator.mjs), exactly as NFL yards are; minutes are genuinely continuous.
 */
export const NBA_SUPPORT = Object.freeze({ minutes: "continuous" });
export const NBA_V01_SUPPORT_NOTE = "continuous draws of a counting stat, read as the law of an integer (continuity rule)";

/** The injury + roster inputs a receipt was frozen on (equal refs ⇒ two families saw the same availability). */
export function nbaReceiptInputRef(receipt) {
  const i = receipt?.inputs ?? {};
  const inj = i.injuries?.sha256 ?? null;
  const ros = i.rosters?.sha256 ?? null;
  return inj || ros ? `injuries:${inj ?? "-"}|rosters:${ros ?? "-"}` : null;
}

const preTipOk = (g) => g?.receipt?.preTip === true && Date.parse(g.receipt.generatedAt) < Date.parse(g.dateUtc);
const lanePrints = (p) => p?.availability !== "out" && isNum(p?.expectedMinutes) && p.expectedMinutes >= LANE_MIN_EXPECTED_MINUTES;

/**
 * The supporting v1 game for an event, verified (receipt intact, frozen pre-tip), or the reason it is not usable.
 * @param {{doc?: object}|null} supporting the v1 day file
 * @returns {{ state: "ATTACHED"|"NO_ARTIFACT"|"NOT_SUPPORTING_FAMILY"|"GAME_NOT_IN_ARTIFACT"|"RECEIPT_INTEGRITY"|"NOT_PRE_TIP", game: object|null }}
 */
export function nbaSupportingGame(supporting, eventId) {
  const doc = supporting?.doc ?? null;
  if (!doc) return { state: "NO_ARTIFACT", game: null };
  if (doc.family !== NBA_SUPPORTING_FAMILY) return { state: "NOT_SUPPORTING_FAMILY", game: null };
  const g = doc.games?.find((x) => String(x.providerEventId) === String(eventId)) ?? null;
  if (!g) return { state: "GAME_NOT_IN_ARTIFACT", game: null };
  if (receiptIntegrity(g).state !== "OK") return { state: "RECEIPT_INTEGRITY", game: null };
  if (!preTipOk(g)) return { state: "NOT_PRE_TIP", game: null };
  return { state: "ATTACHED", game: g };
}

/**
 * @param {string} eventId providerEventId
 * @param {{ official: {doc: object, path?: string, sha256?: string}, supporting?: {doc: object, path?: string, sha256?: string}|null }} sources
 *   official    the committed v0.1 forecasts day file (experimental-v0.1/forecasts/<date>.json)
 *   supporting  the committed v1 forecasts day file (experimental-v1/forecasts/<date>.json), optional
 */
export function nbaOfficialSnapshot(eventId, { official = null, supporting = null } = {}) {
  if (eventId == null || String(eventId) === "") throw new SnapshotRefusal(SNAPSHOT_REFUSAL.NO_EVENT_ID, "no event id");
  const doc = official?.doc ?? null;
  if (!doc) throw new SnapshotRefusal(SNAPSHOT_REFUSAL.NO_ARTIFACT, "no NBA official (v0.1) forecast artifact");
  if (doc.family !== NBA_OFFICIAL_FAMILY) {
    throw new SnapshotRefusal(SNAPSHOT_REFUSAL.NOT_OFFICIAL_FAMILY, `the official NBA family is ${NBA_OFFICIAL_FAMILY}, not ${JSON.stringify(doc.family)}`);
  }
  const id = String(eventId);
  const g = doc.games?.find((x) => String(x.providerEventId) === id);
  if (!g) throw new SnapshotRefusal(SNAPSHOT_REFUSAL.GAME_NOT_IN_ARTIFACT, `${id} not in artifact ${official.path ?? ""}`);
  const integrity = receiptIntegrity(g);
  if (integrity.state !== "OK") throw new SnapshotRefusal(SNAPSHOT_REFUSAL.RECEIPT_INTEGRITY, `receipt ${integrity.state}`, integrity);
  if (!preTipOk(g)) throw new SnapshotRefusal(SNAPSHOT_REFUSAL.NOT_PRE_TIP, `${id} receipt ${g.receipt.generatedAt} is not strictly before tip ${g.dateUtc}`);
  const f = g.forecast;
  const r = g.receipt;
  if (!isNum(f?.elo?.pHome)) throw new SnapshotRefusal(SNAPSHOT_REFUSAL.NO_WINNER_HEAD, `${id} has no Elo head`);

  const version = `${r.modelVersion}@${doc.simEngineVersion ?? "?"}`;
  const players = [];
  const excluded = [];
  const seen = new Set();
  for (const side of ["home", "away"]) {
    for (const p of f.players?.[side] ?? []) {
      const pid = p?.providerAthleteId == null ? null : String(p.providerAthleteId);
      if (!pid || !/^\d+$/.test(pid)) { excluded.push({ playerId: pid, reason: EXCLUSION.NO_PLAYER_ID }); continue; }
      if (seen.has(pid)) { excluded.push({ playerId: pid, reason: EXCLUSION.DUPLICATE_PLAYER_ID }); continue; }
      seen.add(pid);
      const families = {};
      for (const fam of NBA_PLAYER_FAMILIES) {
        const d = p[fam];
        if (!d || !isNum(d.p50)) continue;
        families[fam] = {
          state: "PRIVATE_SHADOW",
          distribution: { kind: DISTRIBUTION_KIND.QUANTILES, points: quantilePoints(d), mean: d.mean ?? null, lowerBound: 0 },
          expected: d.mean ?? null, sd: d.sd ?? null, median: d.p50,
          support: NBA_SUPPORT[fam] ?? "integer",
          supportNote: NBA_SUPPORT[fam] ? null : NBA_V01_SUPPORT_NOTE,
          conditioning: "AS_SIMULATED",
          playRate: null,
          publicDisplay: NBA_LANE_FAMILIES.includes(fam) && lanePrints(p) ? "MEDIAN_1DP" : null,
          modelVersion: version,
        };
      }
      if (!Object.keys(families).length) { excluded.push({ playerId: pid, reason: EXCLUSION.NO_FAMILIES }); continue; }
      players.push({
        playerId: pid, team: g[side]?.abbr ?? null, side, displayName: p.name ?? null,
        participation: p.availability ?? null, injuryStatus: p.injuryStatus ?? null,
        expectedMinutes: p.expectedMinutes ?? null, families,
      });
    }
  }
  players.sort((a, b) => a.playerId.localeCompare(b.playerId));

  const sup = nbaSupportingGame(supporting, id);
  const sources = [
    sourceEntry({ role: SOURCE_ROLE.OFFICIAL, path: official.path ?? null, doc: official.sha256 ? null : g, sha256: official.sha256, modelVersion: version, generatedAt: r.generatedAt, inputRef: r.payloadSha256, expectedInputRef: r.payloadSha256 }),
  ];
  if (sup.game) {
    sources.push(sourceEntry({
      role: SOURCE_ROLE.SUPPORTING_SIMULATION, path: supporting.path ?? null, doc: supporting.sha256 ? null : sup.game, sha256: supporting.sha256,
      modelVersion: `${sup.game.receipt.modelVersion}@${supporting.doc.profileVersion ?? supporting.doc.simEngineVersion ?? "?"}`,
      generatedAt: sup.game.receipt.generatedAt,
      inputRef: nbaReceiptInputRef(sup.game.receipt), expectedInputRef: nbaReceiptInputRef(r),
    }));
  }

  const cap = capability("nba");
  const isPublic = cap.canShowLiveProjections && doc.dataClass !== "PRIVATE_RESEARCH";
  const side = f.publishedSide === "HOME" || f.publishedSide === "AWAY" ? f.publishedSide : null;
  return sealSnapshot({
    schema: OFFICIAL_SNAPSHOT_SCHEMA,
    sport: "NBA",
    eventId: id,
    matchup: `${g.away?.abbr ?? "?"} @ ${g.home?.abbr ?? "?"}`,
    home: { abbr: g.home?.abbr ?? null }, away: { abbr: g.away?.abbr ?? null },
    composition: NBA_COMPOSITION,
    modelVersions: { game: `${f.sideRule?.id ?? "?"}:${f.sideRule?.head ?? "?"}(${r.modelVersion})`, players: Object.fromEntries(NBA_PLAYER_FAMILIES.map((k) => [k, version])) },
    inputAsOf: iso(f.inputAsOf ?? doc.inputAsOf),
    generatedAt: iso(r.generatedAt),
    frozenAt: iso(r.generatedAt), // write-once: the receipt instant is the freeze
    lockAt: iso(g.dateUtc),
    publication: isPublic ? PUBLICATION.PUBLIC : PUBLICATION.PRIVATE,
    capability: cap,
    game: {
      probabilityHead: f.sideRule?.head ?? "elo",
      pHome: f.elo.pHome,
      pAway: isNum(f.elo.pAway) ? f.elo.pAway : null,
      pTie: 0,
      pHomePublished: null,
      winner: { side, rule: f.sideRule?.id ?? null, head: f.sideRule?.head ?? null, pHome: f.elo.pHome },
      projectedScore: { home: null, away: null, state: "WITHHELD", reason: LANE_WITHHELD.teamScores, convention: null },
      home: null,
      away: null,
      margin: null,
      total: null,
      withheld: { ...LANE_WITHHELD },
    },
    players,
    excluded,
    notModelled: NBA_NOT_MODELLED,
    supporting: { family: NBA_SUPPORTING_FAMILY, state: sup.state },
    sources,
  });
}

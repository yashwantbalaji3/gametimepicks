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
 *   NBA          the v1 experimental forecast receipt (nba-forecast-receipt@1). Always PRIVATE until the sport
 *                capability registry lets NBA show live projections AND the artifact stops being PRIVATE_RESEARCH.
 *                Refused unless `receiptIntegrity` is OK (a broken or receipt-less game never becomes official).
 *
 * EXACT NUMBERS. Values are copied exactly as the owner stored them (unrounded where the owner kept an unrounded copy,
 * e.g. NFL `winProbability.homeUnrounded`). Nothing here rounds.
 *
 * Pure: parsed documents in, snapshot out. No fs, no clock.
 */
import { canonicalJson, receiptIntegrity, sha256 } from "../sports/nba/forecast-receipt.mjs";
import { forecastOfRecord } from "../forecast-ledger/adapters/nfl.mjs";
import { canEnterPredictionProducts, canShowLiveProjections, capabilityState } from "../sport-capability-registry.ts";

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

export const NBA_PLAYER_FAMILIES = Object.freeze(["pts", "reb", "ast", "threePm"]);

const histogramDist = (hist) => (Array.isArray(hist) && hist.length
  ? { kind: DISTRIBUTION_KIND.EMPIRICAL, support: hist.map((b) => ({ value: b.value, probability: b.probability })) }
  : null);

/**
 * @param {string} eventId providerEventId
 * @param {object} artifact the committed experimental-v1 forecasts day file
 * @param {{path?: string, sha256?: string}} [ref] where the artifact came from (file-bytes hash when known)
 */
export function nbaOfficialSnapshot(eventId, artifact, ref = {}) {
  if (eventId == null || String(eventId) === "") throw new SnapshotRefusal(SNAPSHOT_REFUSAL.NO_EVENT_ID, "no event id");
  if (!artifact) throw new SnapshotRefusal(SNAPSHOT_REFUSAL.NO_ARTIFACT, "no NBA forecast artifact");
  const id = String(eventId);
  const g = artifact.games?.find((x) => String(x.providerEventId) === id);
  if (!g) throw new SnapshotRefusal(SNAPSHOT_REFUSAL.GAME_NOT_IN_ARTIFACT, `${id} not in artifact ${ref.path ?? ""}`);
  const integrity = receiptIntegrity(g);
  if (integrity.state !== "OK") throw new SnapshotRefusal(SNAPSHOT_REFUSAL.RECEIPT_INTEGRITY, `receipt ${integrity.state}`, integrity);
  const f = g.forecast;
  const sim = f?.sim;
  if (!sim || !isNum(sim.pHome)) throw new SnapshotRefusal(SNAPSHOT_REFUSAL.NO_GAME_DISTRIBUTION, `${id} has no sim distribution`);

  const version = `${g.receipt.modelVersion}@${artifact.profileVersion ?? artifact.simEngineVersion ?? "?"}`;
  const team = (d, hist = null) => ({
    distribution: histogramDist(hist) ?? { kind: DISTRIBUTION_KIND.QUANTILES, points: quantilePoints(d), mean: d?.mean ?? null },
    expected: d?.mean ?? null, sd: d?.sd ?? null, median: d?.p50 ?? null, p10: d?.p10 ?? null, p90: d?.p90 ?? null, support: "integer",
  });

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
          support: "integer",
          conditioning: p.conditioning ? "CONDITIONAL_ON_PLAYING" : "AS_SIMULATED",
          playRate: p.playRate ?? null,
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

  const cap = capability("nba");
  const isPublic = cap.canShowLiveProjections && artifact.dataClass !== "PRIVATE_RESEARCH";
  const playerVersions = Object.fromEntries(NBA_PLAYER_FAMILIES.map((k) => [k, version]));
  return sealSnapshot({
    schema: OFFICIAL_SNAPSHOT_SCHEMA,
    sport: "NBA",
    eventId: id,
    matchup: `${g.away?.abbr ?? "?"} @ ${g.home?.abbr ?? "?"}`,
    home: { abbr: g.home?.abbr ?? null }, away: { abbr: g.away?.abbr ?? null },
    modelVersions: { game: version, players: playerVersions },
    inputAsOf: iso(f.inputAsOf ?? artifact.inputAsOf),
    generatedAt: iso(g.receipt.generatedAt),
    frozenAt: iso(g.receipt.generatedAt), // write-once: the receipt instant is the freeze
    lockAt: iso(g.dateUtc),
    publication: isPublic ? PUBLICATION.PUBLIC : PUBLICATION.PRIVATE,
    capability: cap,
    game: {
      pHome: sim.pHome,
      pAway: sim.pAway ?? null,
      pTie: sim.tieMass ?? 0,
      pHomePublished: sim.pHome,
      // The receipt's published side comes from its Elo head, not from the simulation's pHome (kept apart, exact).
      winner: { side: f.publishedSide ?? null, rule: f.sideRule?.id ?? null, head: f.sideRule?.head ?? null, pHome: f.elo?.pHome ?? null },
      projectedScore: { home: sim.home?.p50 ?? null, away: sim.away?.p50 ?? null, convention: "per-team simulated median" },
      home: team(sim.home),
      away: team(sim.away),
      margin: team(sim.margin, sim.marginHistogram),
      total: team(sim.total, sim.totalHistogram),
    },
    players,
    excluded,
    sources: [
      sourceEntry({ role: SOURCE_ROLE.OFFICIAL, path: ref.path ?? null, doc: ref.sha256 ? null : g, sha256: ref.sha256, modelVersion: version, generatedAt: g.receipt.generatedAt, inputRef: g.receipt.payloadSha256, expectedInputRef: g.receipt.payloadSha256 }),
    ],
  });
}

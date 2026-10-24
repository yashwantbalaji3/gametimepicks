/**
 * NBA EXPERIMENTAL PUBLIC LANE (founder decision 2026-10-20 · preregistration §12 look 5 · §13). PURE, no I/O.
 *
 * WHAT THIS IS. A separate, surface-scoped public lane that shows the FROZEN PRE-TIP outputs of the NBA shadow models as
 * clearly labelled UNVALIDATED EXPERIMENTAL SIMULATION analytics. It is NOT the preregistered SHADOW → PUBLIC FORECAST
 * promotion (§7–§8): no bar is met, nothing here counts toward validation, and the capability registry keeps NBA
 * HISTORICAL_ONLY so no prediction product (Bank Builder, Moonshot, Parlay Lab, Smart Betslip, Ask, Top-10 picks) can
 * read it.
 *
 * ONE CANONICAL SNAPSHOT (founder consistency requirement). Every public NBA surface that shows these numbers reads the
 * snapshot this module builds — `nba-experimental-public-snapshot@1` — and nothing else. Each component carries its own
 * source label; they are never presented as one validated engine:
 *   - game information: the Elo winner side (founder N2) — the FAVOURED TEAM only, never a probability;
 *   - player figures: the v0.1 roster-gated family (founder N1, player champion) — MEDIANS only; under §13 amendment A
 *     also the PRA / P+R / P+A medians the receipt stores (per-draw sums over the same draws), for /nba/projections.
 *
 * WHAT IS WITHHELD, AND WHY (each a pinned test):
 *   - win probabilities / confidence: unvalidated (n = 0 regular-season games; v0.1 preseason sim ECE 0.218).
 *     EXCEPTION (founder decision 2026-10-23, behind ELO_WIN_PROBABILITY.enabled, default off): the Elo rating's
 *     game-winner probability, copied verbatim from the receipt into `elo.winProbability` with its provenance
 *     (elo-win-probability.mjs). It is the rating's number, separately identified; the withheld note is then dropped
 *     for that slate only, and everything below stays withheld.
 *   - projected team scores: the v0.1 team score is the sum of its own players' simulated points and ignores the
 *     opponent; on 2026-10-20 it contradicts the Elo side in 2 of 3 games, and v0's historical margin/total checks failed
 *     (§12 look 2). Not eligible. (The coherent v1 candidate is consistent with Elo but is not the founder-chosen source.)
 *   - player ranges (p10–p90): preseason 80 % coverage was 0.73 for points — the interval is not yet interpretable.
 *   - odds, lines, edges, picks, rankings: no authorized NBA price exists; players are listed by expected minutes,
 *     never ranked by projection.
 *
 * IMMUTABILITY. Only games whose forecast receipt verifies (`receiptIntegrity` → OK: payload hash matches, generated
 * strictly before tip) are published, exactly as frozen; a game without a verified pre-tip receipt is EXCLUDED and
 * listed with its reason. Nothing is recomputed: every published number is copied from the receipt's stored payload.
 */
import { receiptIntegrity } from "./forecast-receipt.mjs";
import { ELO_WIN_PROBABILITY, ELO_SOURCE_WITH_PROBABILITY, laneEloWinProbability } from "./elo-win-probability.mjs";

/**
 * Schema stays @1 under amendment A: the change is ADDITIVE only (`comboMedians` per player row, `comboSource` per
 * game) — no @1 key is renamed, removed or re-valued, so every @1 reader (the /nba lane) is unaffected.
 */
export const LANE_SNAPSHOT_SCHEMA = "nba-experimental-public-snapshot@1";
/**
 * §13 AMENDMENT A (founder decision 2026-10-20 — conditional approval; activation via the release-owner gate):
 * projection-only player boards at /nba/projections — filters (matchup / team / player / stat) and a reader's sort over
 * the SAME snapshot, plus PRA / P+R / P+A medians copied from the same receipt (joint sums over the same simulated
 * draws, never sums of component medians). Still no lines, odds, edges, EV, probabilities, ranges or picks.
 */
export const AMENDMENT_A = Object.freeze({
  id: "nba-experimental-public@1/amendment-A",
  /** Amendment A's rollback switch: false drops the combo fields from the next snapshot and blanks /nba/projections. */
  enabled: true,
  recorded: "2026-10-20",
  doc: "docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md §13 amendment A",
  surface: "/nba/projections",
});
export const LANE = Object.freeze({
  id: "nba-experimental-public@1",
  /** The rollback switch: false removes every lane surface from the next build (one-line revert). */
  enabled: true,
  amendment: "docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md §12 look 5 + §13 (founder decision 2026-10-20)",
  label: "UNVALIDATED EXPERIMENTAL SIMULATION",
  sourceFamily: "v0.1",
  surfaces: Object.freeze(AMENDMENT_A.enabled ? ["/nba", AMENDMENT_A.surface] : ["/nba"]),
});
/** Players shown per team: active (not Out), at least this many expected minutes, by expected minutes. */
export const MIN_EXPECTED_MINUTES = 10;
/** The /nba lane card columns (unchanged by amendment A). */
export const STATS = Object.freeze([["pts", "PTS"], ["reb", "REB"], ["ast", "AST"], ["threePm", "3PM"]]);
/**
 * Amendment A combo stats and their components. Each is the median of the per-draw SUM over the same simulated draws
 * (game-sim.mjs comboDraws / COMBO_KEYS) — copied from the receipt's own p50, never recomputed from component medians.
 * R+A, steals, blocks and turnovers are not modelled and never appear.
 */
export const COMBO_COMPONENTS = Object.freeze({ pra: Object.freeze(["pts", "reb", "ast"]), ptsReb: Object.freeze(["pts", "reb"]), ptsAst: Object.freeze(["pts", "ast"]) });
export const COMBO_STATS = Object.freeze([["pra", "PRA"], ["ptsReb", "P+R"], ["ptsAst", "P+A"]]);
/** Every stat a /nba/projections board can show: the four lane medians, then the three combo medians. */
export const PROJECTION_BOARD_STATS = Object.freeze([...STATS, ...COMBO_STATS]);
export const COMBO_LABEL = "sum over the same simulated draws (v0 engine; components independent within a player)";
/** Draw additivity: a combo's mean must equal the sum of its components' means within this (2-dp rounding slack). */
export const COMBO_MEAN_TOLERANCE = 0.02;
/**
 * PROJECTION-UNAVAILABLE PLAYERS (founder mandate 2026-10-24, P1(b): rookies and returning players). A rostered,
 * not-Out player the official v0.1 pool could not project (no usable NBA minutes history in the data — a rookie, or a
 * player who missed the window) is listed per side with state PROJECTION_UNAVAILABLE and a reason, so a surface can say
 * "projection unavailable" — NEVER a zero, and never a number of any kind. Source: the receipt's own pregame
 * availability record (forecast.assumptions.availability.<side>.excludedNoMinutes), frozen before tip; nothing is
 * inferred. Additive; behind its switch (default OFF); a published slate keeps what it was published with
 * (unavailablePlayersForPublish), exactly like the Elo estimate.
 */
// Release H1a (2026-10-24): ON so the 10-24 publish (~14:15Z) is the first slate to carry it. Published slates keep what they
// were published with (unavailablePlayersForPublish). Rollback: false.
export const UNAVAILABLE_PLAYERS = Object.freeze({ id: "nba-lane-unavailable-players@1", enabled: true });
/*
 * POSITION (release owner 2026-10-24, the one producer for boards): under the SAME switch and rule, each published player
 * row and each unavailable entry carries `position` from the EXACT roster the receipt was frozen on — found by the
 * receipt's own roster sha256 (roster-index.mjs), so it is pregame and proven; `players.positionSource` names that
 * capture ({ file, sha256 }), or is null when no committed capture matches (then every position is null — never guessed).
 */
/** athlete id → { position, experienceYears } from one roster capture (the receipt's own, by sha256). Pure. */
export function rosterFacts(rosterDoc) {
  const m = new Map();
  for (const t of rosterDoc?.teams ?? []) for (const p of t?.players ?? []) {
    if (p?.providerAthleteId == null) continue;
    m.set(String(p.providerAthleteId), { position: typeof p.position === "string" && p.position ? p.position : null, experienceYears: Number.isInteger(p.experienceYears) ? p.experienceYears : null });
  }
  return m;
}
/** athlete id → position code (or null). Pure. */
export const rosterPositions = (rosterDoc) => new Map([...rosterFacts(rosterDoc)].map(([id, f]) => [id, f.position]));
const positionsFor = (receipt, rosters) => {
  const sha = receipt?.inputs?.rosters?.sha256 ?? null;
  const ro = sha && rosters?.get?.(sha);
  const facts = ro ? rosterFacts(ro.doc) : new Map();
  return { source: ro ? { file: ro.file, sha256: sha } : null, facts, positions: new Map([...facts].map(([id, f]) => [id, f.position])) };
};
export const UNAVAILABLE_STATE = "PROJECTION_UNAVAILABLE";
/*
 * REASONS (founder 2026-10-24: "every rostered player accounted for — if a player cannot be projected, show why"; the
 * Top Boards session's parked coverage branch claude/nba-lane-coverage-alt-parked proved the receipt fields):
 *   RULED_OUT            in the receipt's pre-cutoff availability as Out (assumptions.availability.<side>.excludedOut, or
 *                        a pool player marked out); `status` is that pre-cutoff status text — never a later update
 *   BELOW_PUBLISH_CUT    projected, but under the lane's MIN_EXPECTED_MINUTES publish cut — the projection is not
 *                        published, and no number is shown here
 *   ROOKIE               no usable NBA minutes in the data, and the receipt's roster capture says experienceYears 0
 *   INSUFFICIENT_HISTORY no usable NBA minutes in the data (not a rookie, or no roster capture to tell)
 *   NO_EXPECTED_MINUTES  excluded from the pool for any other no-minutes basis
 * One entry per athlete (priority in that order). No minutes, medians or any other number travels.
 */
export const UNAVAILABLE_REASONS = Object.freeze(["RULED_OUT", "BELOW_PUBLISH_CUT", "ROOKIE", "INSUFFICIENT_HISTORY", "NO_EXPECTED_MINUTES"]);
/** The lane's per-side list, copied from the receipt (+ the receipt's own roster capture for position / rookie). Pure. */
export function laneUnavailable(forecast, facts = null) {
  const side = (k) => {
    const av = forecast?.assumptions?.availability?.[k] ?? {};
    const byId = new Map();
    const add = (p, reason, extra = {}) => {
      const id = p?.providerAthleteId == null ? null : String(p.providerAthleteId);
      if (id == null || byId.has(id)) return;
      const fact = facts?.get(id) ?? null;
      byId.set(id, { providerAthleteId: id, name: p.name ?? null, ...(facts ? { position: fact?.position ?? null } : {}), state: UNAVAILABLE_STATE, reason, ...extra });
    };
    for (const p of av.excludedOut ?? []) add(p, "RULED_OUT", { status: p.injuryStatus ?? null });
    for (const p of forecast?.players?.[k] ?? []) if (p?.availability === "out") add(p, "RULED_OUT", { status: p.injuryStatus ?? null });
    for (const p of forecast?.players?.[k] ?? []) if (p?.availability !== "out" && Number.isFinite(p?.expectedMinutes) && p.expectedMinutes < MIN_EXPECTED_MINUTES) add(p, "BELOW_PUBLISH_CUT");
    for (const p of av.excludedNoMinutes ?? []) {
      const rookie = facts?.get(String(p?.providerAthleteId))?.experienceYears === 0;
      add(p, p?.basis === "insufficient" ? (rookie ? "ROOKIE" : "INSUFFICIENT_HISTORY") : "NO_EXPECTED_MINUTES");
    }
    return [...byId.values()].sort((a, b) => a.providerAthleteId.localeCompare(b.providerAthleteId));
  };
  return { away: side("away"), home: side("home") };
}
/** Does a rebuild of a slate carry the list? A published slate: exactly what it was published with; otherwise the switch. */
export function unavailablePlayersForPublish(committedDay, { enabled = UNAVAILABLE_PLAYERS.enabled } = {}) {
  if (committedDay && typeof committedDay === "object") return (committedDay.games ?? []).some((g) => g?.players && Object.prototype.hasOwnProperty.call(g.players, "unavailable"));
  return Boolean(enabled);
}

/** The withheld notes a slate publishes: with the Elo game-winner probability on, its `winProbability` note is not
 * published (that number is shown, separately identified); team scores, ranges and markets stay withheld. */
export const withheldFor = ({ eloWinProbability = false } = {}) => Object.freeze(Object.fromEntries(Object.entries(WITHHELD).filter(([k]) => !(eloWinProbability && k === "winProbability"))));
export const WITHHELD = Object.freeze({
  winProbability: "Not shown: no NBA game-outcome chance has been validated (0 graded regular-season games).",
  teamScores: "Not shown: this model's team score is a sum of player simulations that ignores the opponent, can contradict the Elo side, and has not met its historical checks.",
  playerRanges: "Medians only: the model's ranges have not yet shown reliable coverage.",
  markets: "No sportsbook prices, lines, edges, picks or rankings: there is no authorized NBA price, and these figures are not betting recommendations.",
});

const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

function sideRows(players, positions = null) {
  return (Array.isArray(players) ? players : [])
    .filter((p) => p?.availability !== "out" && Number.isFinite(p?.expectedMinutes) && p.expectedMinutes >= MIN_EXPECTED_MINUTES)
    .sort((a, b) => b.expectedMinutes - a.expectedMinutes || String(a.providerAthleteId).localeCompare(String(b.providerAthleteId)))
    .map((p) => ({
      providerAthleteId: String(p.providerAthleteId),
      name: p.name ?? null,
      ...(positions ? { position: positions.get(String(p.providerAthleteId)) ?? null } : {}),
      expectedMinutes: r1(p.expectedMinutes),
      injuryStatus: p.injuryStatus ?? null,
      medians: Object.fromEntries(STATS.map(([k]) => [k, r1(p?.[k]?.p50)])),
      ...(AMENDMENT_A.enabled ? { comboMedians: Object.fromEntries(COMBO_STATS.map(([k]) => [k, r1(p?.[k]?.p50)])) } : {}),
    }));
}

/**
 * SOURCE RECONCILIATION (amendment A) for one receipt player: every combo exists, and its mean equals the sum of its
 * components' means within COMBO_MEAN_TOLERANCE — the draws were summed per draw (means are additive across draws;
 * medians are not). Returns the problems found (empty = reconciles). Pure.
 */
export function comboReconciliation(player) {
  const problems = [];
  for (const [k, parts] of Object.entries(COMBO_COMPONENTS)) {
    const c = player?.[k];
    if (!Number.isFinite(c?.p50) || !Number.isFinite(c?.mean)) { problems.push(`${k}: missing p50/mean`); continue; }
    if (parts.some((q) => !Number.isFinite(player?.[q]?.mean))) { problems.push(`${k}: a component mean is missing`); continue; }
    const sum = parts.reduce((a, q) => a + player[q].mean, 0);
    if (!(Math.abs(sum - c.mean) <= COMBO_MEAN_TOLERANCE + 1e-9)) problems.push(`${k}: mean ${c.mean} differs from the sum of component means ${Math.round(sum * 100) / 100}`);
  }
  return problems;
}

/**
 * @param {object} a
 * @param {object} a.forecastDoc  the committed v0.1 forecast artifact for the date (experimental-v0.1/forecasts/<date>.json)
 * @param {string} a.sourceFile   repo-relative label of that file (no internal path prefix is published)
 * @param {string|null} a.sourceCommit  the git commit that holds that file, when known
 * @param {string} a.generatedAt  when this snapshot was assembled (never a forecast time)
 */
function buildExperimentalSnapshotWithAudit({ forecastDoc, sourceFile, sourceCommit = null, generatedAt, eloWinProbability = ELO_WIN_PROBABILITY.enabled, unavailablePlayers = UNAVAILABLE_PLAYERS.enabled, rosters = null }) {
  if (forecastDoc?.family !== LANE.sourceFamily) throw new Error(`REFUSED: lane reads family ${LANE.sourceFamily}, got ${JSON.stringify(forecastDoc?.family)}`);
  const games = [];
  const excluded = [];
  const audit = [];
  for (const g of forecastDoc.games ?? []) {
    const integrity = receiptIntegrity(g);
    const r = g.receipt ?? {};
    if (integrity.state !== "OK" || r.preTip !== true || !(Date.parse(r.generatedAt) < Date.parse(g.dateUtc))) {
      excluded.push({ providerEventId: String(g.providerEventId), reason: integrity.state === "OK" ? "NOT_PRE_TIP" : `RECEIPT_${integrity.state}`, problems: integrity.problems ?? [] });
      continue;
    }
    const f = g.forecast ?? {};
    if (AMENDMENT_A.enabled) {
      // A published combo must come from the same draws as its components: any player that fails refuses the build.
      for (const p of [...(f.players?.away ?? []), ...(f.players?.home ?? [])]) {
        const bad = comboReconciliation(p);
        if (bad.length) throw new Error(`REFUSED: ${g.providerEventId} player ${p?.providerAthleteId} combos do not reconcile with their source draws — ${bad.join("; ")}`);
      }
    }
    const side = f.publishedSide === "HOME" ? g.home : f.publishedSide === "AWAY" ? g.away : null;
    // founder decision 2026-10-23: the receipt's own Elo pHome / pAway, verbatim, with provenance — only while switched on
    const wp = eloWinProbability ? laneEloWinProbability(f, r) : null;
    const pos = unavailablePlayers ? positionsFor(r, rosters) : null;
    // PRIVATE audit facts (never in the public snapshot): which side the withheld v0.1 team median favours, and the seed.
    audit.push({
      providerEventId: String(g.providerEventId),
      seed: f.seed ?? null,
      teamScoreContradictsElo: side != null && Number.isFinite(f.sim?.home?.p50) && Number.isFinite(f.sim?.away?.p50) && f.sim.home.p50 !== f.sim.away.p50
        ? (f.sim.home.p50 > f.sim.away.p50 ? "HOME" : "AWAY") !== f.publishedSide
        : null,
    });
    games.push({
      providerEventId: String(g.providerEventId),
      etDate: g.etDate,
      tipUtc: g.dateUtc,
      away: { abbr: g.away?.abbr ?? null, name: g.away?.name ?? null },
      home: { abbr: g.home?.abbr ?? null, name: g.home?.name ?? null },
      frozenAt: r.generatedAt,
      receipt: { schema: r.schema, family: r.family, modelVersion: r.modelVersion, payloadSha256: r.payloadSha256 },
      engine: { simulation: f.modelVersion ?? null, simulations: f.simulations ?? null },
      elo: {
        favoured: side?.abbr ?? null,
        state: side ? "FAVOURED" : "TOO_CLOSE",
        rule: f.sideRule?.id ?? null,
        source: wp ? ELO_SOURCE_WITH_PROBABILITY : "Elo team rating — the published winner side (founder N2); no probability is shown",
        ...(wp ? { winProbability: wp } : {}),
      },
      teamScores: { state: "WITHHELD", reason: WITHHELD.teamScores },
      players: {
        source: `v0.1 roster-gated player simulation (${r.modelVersion}) — medians of ${f.simulations ?? "?"} simulated games`,
        ...(AMENDMENT_A.enabled ? { comboSource: `PRA, P+R and P+A: ${COMBO_LABEL}` } : {}),
        ...(pos ? { positionSource: pos.source } : {}),
        away: sideRows(f.players?.away, pos?.positions ?? null),
        home: sideRows(f.players?.home, pos?.positions ?? null),
        ...(pos ? { unavailable: laneUnavailable(f, pos.facts) } : {}),
      },
    });
  }
  const snapshot = {
    schema: LANE_SNAPSHOT_SCHEMA,
    lane: LANE.id,
    label: LANE.label,
    amendment: LANE.amendment,
    dataClass: "PUBLIC_EXPERIMENTAL",
    validation: "NOT_VALIDATED — the preregistered shadow bars are unmet; this lane never counts toward them",
    productEligible: false,
    date: forecastDoc.date ?? null,
    generatedAt,
    source: { family: LANE.sourceFamily, file: sourceFile, commit: sourceCommit },
    withheld: { ...withheldFor({ eloWinProbability: Boolean(eloWinProbability) }) },
    games,
    excluded,
  };
  return { snapshot, audit };
}

/** The PUBLIC snapshot (what every lane surface reads). */
export function buildExperimentalSnapshot(args) {
  return buildExperimentalSnapshotWithAudit(args).snapshot;
}

/**
 * The private audit companion of a snapshot (data/internal/research/nba/experimental-public-audit/<date>.json): the facts
 * that justify a withholding but must not travel publicly. Same inputs, same order.
 */
export function buildExperimentalAudit({ forecastDoc, generatedAt }) {
  const snap = buildExperimentalSnapshotWithAudit({ forecastDoc, sourceFile: "", generatedAt });
  return { schema: "nba-experimental-public-audit@1", dataClass: "PRIVATE_RESEARCH", date: forecastDoc?.date ?? null, generatedAt, games: snap.audit };
}

/** Is a snapshot the CURRENT slate at `buildEtDate`? A past slate is never shown as current (the page hides it). */
export function laneIsCurrent(snapshot, buildEtDate) {
  return Boolean(snapshot?.date && buildEtDate && snapshot.date >= buildEtDate);
}

/** Every number in a snapshot game must be the receipt's stored value — re-derive and compare. Pure. */
export function snapshotMatchesSource(snapshotGame, sourceGame, { rosters = null } = {}) {
  const f = sourceGame?.forecast ?? {};
  // P1(b) detail (positions + unavailable list): re-derived from the receipt's own roster capture, found by its sha256
  const detail = snapshotGame.players?.positionSource !== undefined;
  const pos = detail ? positionsFor(sourceGame?.receipt, rosters) : null;
  if (detail && JSON.stringify(snapshotGame.players.positionSource) !== JSON.stringify(pos.source)) return false;
  for (const side of ["away", "home"]) {
    const src = new Map((f.players?.[side] ?? []).map((p) => [String(p.providerAthleteId), p]));
    for (const row of snapshotGame.players[side]) {
      const p = src.get(row.providerAthleteId);
      if (!p) return false;
      for (const [k] of STATS) if (row.medians[k] !== r1(p?.[k]?.p50)) return false;
      // Amendment A: combos re-derive from the receipt's OWN combo p50 (not a sum of medians) and reconcile by draws.
      if (row.comboMedians !== undefined || AMENDMENT_A.enabled) {
        if (!row.comboMedians || Object.keys(row.comboMedians).length !== COMBO_STATS.length) return false;
        for (const [k] of COMBO_STATS) if (row.comboMedians[k] !== r1(p?.[k]?.p50)) return false;
        if (comboReconciliation(p).length) return false;
      }
      if (row.expectedMinutes !== r1(p.expectedMinutes)) return false;
      if (detail ? row.position !== (pos.positions.get(row.providerAthleteId) ?? null) : row.position !== undefined) return false;
    }
  }
  // P1(b): a published unavailable list must be exactly the receipt's own pregame record
  if (snapshotGame.players?.unavailable !== undefined && JSON.stringify(snapshotGame.players.unavailable) !== JSON.stringify(laneUnavailable(f, detail ? pos.facts : null))) return false;
  // founder decision 2026-10-23: a published Elo game-winner probability must be the receipt's own numbers and provenance
  const wp = snapshotGame.elo?.winProbability;
  if (wp !== undefined && JSON.stringify(wp) !== JSON.stringify(laneEloWinProbability(f, sourceGame.receipt))) return false;
  return snapshotGame.frozenAt === sourceGame.receipt?.generatedAt && snapshotGame.receipt.payloadSha256 === sourceGame.receipt?.payloadSha256;
}

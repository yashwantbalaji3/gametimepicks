/**
 * NBA TOP 10 PLAYER BOARDS (points · rebounds · assists · 3PM) — PRIVATE shadow artifact. PURE, no I/O.
 *
 * WHAT A BOARD IS. A ranking, by the shadow model's frozen MEDIAN projection (p50), of the players who pass every
 * eligibility rule below, built from ONE committed forecast artifact of ONE family at ONE instant (the freeze). It is
 * a model projection only: there is no authorized NBA price (no odds authorization; `nba-market-probe` is paid and
 * manual), so every row carries `marketLine: null, marketOdds: null, edge: null` with reason NO_AUTHORIZED_PRICE, and
 * `confidence: null` until the preregistered bars (docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md §6–§8) are met.
 * Nothing here computes an over/under probability, a line, an edge or a "value"; none of those can exist without a line.
 *
 * NEVER FILLED TO 10. A board is a maximum, not a quota: it lists only rows that pass every rule, and every player who
 * was considered and not listed is in that board's `withheld` list with every reason that applied. An empty board says
 * why (`emptyReason`).
 *
 * PRIVATE. dataClass PRIVATE_RESEARCH, productEligible false, publicState PRIVATE. sport-capability-registry keeps NBA
 * HISTORICAL_ONLY; nothing under a public route imports this module (guarded by top-board-route-gating.test.mjs).
 *
 * WRITE-ONCE (same discipline as forecast-receipt.mjs). A day file holds `editions[]`. An edition is frozen at one
 * instant and covers only games that (a) have a forecast written at or before that instant, (b) had not tipped, and
 * (c) are on no earlier edition. An edition, once written, is never rewritten (`frozenEditionViolations`), so a later
 * freeze can ADD late games in a new edition but can never re-rank or change a row already frozen.
 */
import { canonicalJson, receiptIntegrity, sha256 } from "./forecast-receipt.mjs";
import { canonicalTricodeFromEspnAbbr } from "./boxscore-parse.mjs";

export const TOP_BOARD_ARTIFACT = "nba-top-boards";
export const TOP_BOARD_SCHEMA = "nba-top-board@1";
export const BOARD_MAX_ROWS = 10;
export const DEFAULT_BOARD_FAMILY = "v0.1"; // founder N1: v0.1 is the player champion

export const CATEGORIES = Object.freeze([
  Object.freeze({ key: "points", stat: "pts", label: "Points" }),
  Object.freeze({ key: "rebounds", stat: "reb", label: "Rebounds" }),
  Object.freeze({ key: "assists", stat: "ast", label: "Assists" }),
  Object.freeze({ key: "threes", stat: "threePm", label: "3PM" }),
]);
export const categoryByKey = (key) => CATEGORIES.find((c) => c.key === key) ?? null;

export const NO_MARKET = Object.freeze({
  marketLine: null,
  marketOdds: null,
  edge: null,
  marketReason: "NO_AUTHORIZED_PRICE",
});
export const NO_CONFIDENCE = Object.freeze({
  confidence: null,
  confidenceReason: "no calibrated confidence until the preregistered bars are met",
});

/**
 * THRESHOLDS — each one documented, each one pinned by a test with a mutation probe.
 *
 * minExpectedMinutes 20: the preregistration's graded player population (§6: "matched player-games with
 *   expectedMinutes ≥ 20"). A board never ranks a player the validation sample would not even count.
 * maxMinutesCv 0.35: minutesSd / expectedMinutes. Measured on the committed v0.1 preseason forecasts (2026-10-03…16):
 *   among otherwise-eligible rows (trailing10 basis, ≥ 20 expected minutes, n = 397) the ratio's median is 0.197 and its
 *   90th percentile 0.346; 0.35 withholds the top decile — the rows whose minutes the model itself says it does not know
 *   (a ±1 SD swing of more than a third of the minutes). A row with no measured minutes spread is withheld the same way.
 */
export const ELIGIBILITY = Object.freeze({
  version: "nba-top-board-eligibility@1",
  minExpectedMinutes: 20,
  maxMinutesCv: 0.35,
  tradedHistoryPolicy: "INCLUDE_WITH_FLAG",
});

export const RANKING = Object.freeze({
  id: "nba-top-board-ranking@1",
  metric: "MODEL_MEDIAN_P50",
  rule: "frozen p50 desc, then frozen mean desc, then providerAthleteId asc (deterministic, no clock)",
});

/** Game-level exclusions: the whole game is off the board, recorded in `games[]` with this reason. */
export const GAME_REASON = Object.freeze({
  GAME_STARTED_AT_FREEZE: "GAME_STARTED_AT_FREEZE",
  FORECAST_AFTER_FREEZE: "FORECAST_AFTER_FREEZE",
  RECEIPT_BROKEN: "RECEIPT_BROKEN",
  FAMILY_MISMATCH: "FAMILY_MISMATCH",
  ON_EARLIER_EDITION: "ON_EARLIER_EDITION",
});

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const ms = (iso) => Date.parse(iso ?? "");
const r2 = (x) => (isNum(x) ? Number(x.toFixed(2)) : null);

/**
 * PLAYER ELIGIBILITY RULES — evaluated in order; EVERY failing rule is recorded (the first is the primary reason).
 * Each rule: { id, scope: "player" | "category", description, fails(player, ctx) → boolean }.
 * ctx: { stat, otherTeamIds: Set<string> }.
 */
export const ELIGIBILITY_RULES = Object.freeze([
  Object.freeze({
    id: "MISSING_ATHLETE_ID", scope: "player",
    description: "no providerAthleteId — the row could never be joined to a box score",
    fails: (p) => p?.providerAthleteId == null || String(p.providerAthleteId) === "",
  }),
  Object.freeze({
    id: "AVAILABILITY_OUT", scope: "player",
    description: "ruled Out by the injury feed at the forecast instant",
    fails: (p) => p?.availability === "out",
  }),
  Object.freeze({
    id: "INJURY_DESIGNATION", scope: "player",
    description: "ANY injury designation, including Day-To-Day — an unresolved status is withheld (founder rule)",
    fails: (p) => typeof p?.injuryStatus === "string" ? p.injuryStatus.trim() !== "" : p?.injuryStatus != null,
  }),
  Object.freeze({
    id: "INSUFFICIENT_HISTORY", scope: "player",
    description: "minutes basis \"insufficient\" (fewer than 3 appearances in the season window)",
    fails: (p) => p?.basis === "insufficient",
  }),
  Object.freeze({
    id: "NULL_MINUTES", scope: "player",
    description: "expected minutes absent (never read as zero)",
    fails: (p) => !isNum(p?.expectedMinutes),
  }),
  Object.freeze({
    id: "AVAILABILITY_UNVERIFIED", scope: "player",
    description: "availability not read from an injury feed (\"unknown\" or absent) — unknown is not active",
    fails: (p) => p?.availability !== "active" && p?.availability !== "out",
  }),
  Object.freeze({
    id: "TEAM_POOL_FALLBACK_RATES", scope: "player",
    description: "per-minute rates borrowed from the team pool, not the player's own window",
    fails: (p) => p?.ratesBasis !== "player-window",
  }),
  Object.freeze({
    id: "LOW_EXPECTED_MINUTES", scope: "player",
    description: `expected minutes below ${ELIGIBILITY.minExpectedMinutes} (the preregistered graded population)`,
    fails: (p) => isNum(p?.expectedMinutes) && p.expectedMinutes < ELIGIBILITY.minExpectedMinutes,
  }),
  Object.freeze({
    id: "MINUTES_TOO_UNCERTAIN", scope: "player",
    description: `minutesSd / expectedMinutes above ${ELIGIBILITY.maxMinutesCv}, or no measured minutes spread`,
    fails: (p) => isNum(p?.expectedMinutes) && p.expectedMinutes > 0 && (!isNum(p?.minutesSd) || p.minutesSd / p.expectedMinutes > ELIGIBILITY.maxMinutesCv),
  }),
  Object.freeze({
    id: "MISSING_DISTRIBUTION", scope: "category",
    description: "the category's frozen distribution (mean, p10, p50, p90) is incomplete",
    fails: (p, ctx) => { const d = p?.[ctx.stat]; return !(isNum(d?.mean) && isNum(d?.p10) && isNum(d?.p50) && isNum(d?.p90)); },
  }),
]);

/**
 * FLAGS — conditions that do NOT withhold a row but are shown on it.
 *
 * TRADED_HISTORY_OTHER_TEAM (decision: INCLUDE WITH FLAG). The roster-gated pool looks a player's history up on his
 * CURRENT team first and falls back to his LAST team only when he has none yet (roster-gated-pool.mjs). The fallback
 * therefore decays by itself once he plays for the new club; excluding it would remove ~42 % of the simulated
 * preseason pool (147 of 347 on 2026-10-16) — mostly rotation players whose minutes and rates are real, just earned
 * elsewhere. Their minutes are still subject to MINUTES_TOO_UNCERTAIN and every other rule. The flag is on the row,
 * in the UI, and in the daily report's slice so the decision can be revisited on evidence.
 */
export const FLAGS = Object.freeze({
  TRADED_HISTORY_OTHER_TEAM: "TRADED_HISTORY_OTHER_TEAM",
  LEGACY_NO_RECEIPT: "LEGACY_NO_RECEIPT",
});

/** Every failing rule id for one player in one category (empty = eligible). */
export function eligibilityReasons(player, ctx, rules = ELIGIBILITY_RULES) {
  const reasons = [];
  for (const r of rules) if (r.fails(player, ctx)) reasons.push(r.id);
  return reasons;
}

/** Deterministic ranking comparator over candidate rows ({ dist, id }). */
export function compareCandidates(a, b) {
  return (b.dist.p50 - a.dist.p50) || ((b.dist.mean ?? 0) - (a.dist.mean ?? 0)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

const teamView = (t) => (t ? {
  name: t.name ?? null,
  abbr: canonicalTricodeFromEspnAbbr(t.abbr) ?? t.abbr ?? null,
  espnAbbr: t.abbr ?? null,
  providerTeamId: t.providerTeamId != null ? String(t.providerTeamId) : null,
} : null);

/** The instant a game's forecast was written: its receipt's, else (legacy) the artifact's. */
function gameForecastInstant(game, artifact) {
  return game?.receipt?.generatedAt ?? game?.forecast?.inputAsOf ?? artifact?.generatedAt ?? null;
}

/**
 * Game-level decision for one edition.
 * @returns {{ onBoard: boolean, reason: string|null, flags: string[] }}
 */
export function gameBoardDecision(game, { artifact, frozenAt, family, earlierEventIds = new Set() }) {
  const id = String(game?.providerEventId);
  const flags = [];
  if (earlierEventIds.has(id)) return { onBoard: false, reason: GAME_REASON.ON_EARLIER_EDITION, flags };
  if (!(ms(frozenAt) < ms(game?.dateUtc))) return { onBoard: false, reason: GAME_REASON.GAME_STARTED_AT_FREEZE, flags };
  const instant = gameForecastInstant(game, artifact);
  if (!(ms(instant) <= ms(frozenAt))) return { onBoard: false, reason: GAME_REASON.FORECAST_AFTER_FREEZE, flags };
  const integrity = receiptIntegrity(game);
  if (integrity.state === "BROKEN") return { onBoard: false, reason: GAME_REASON.RECEIPT_BROKEN, flags, problems: integrity.problems };
  if (integrity.state === "LEGACY_NO_RECEIPT") flags.push(FLAGS.LEGACY_NO_RECEIPT);
  if (game?.receipt?.family != null && family != null && String(game.receipt.family) !== String(family)) return { onBoard: false, reason: GAME_REASON.FAMILY_MISMATCH, flags };
  return { onBoard: true, reason: null, flags };
}

/** Every player considered for one side: the simulated rows plus the gate's Out / no-history lists (not simulated). */
function sidePlayers(game, side) {
  const rows = (game?.forecast?.players?.[side] ?? []).map((p) => ({ ...p, _source: "simulated" }));
  const seen = new Set(rows.map((p) => String(p.providerAthleteId)));
  const gate = game?.[side]?.pool;
  for (const o of gate?.out ?? []) {
    const id = String(o.providerAthleteId);
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({ providerAthleteId: id, name: o.name ?? null, availability: "out", injuryStatus: o.injuryStatus ?? "Out", expectedMinutes: null, _source: "gate-out" });
  }
  for (const o of gate?.insufficientHistory ?? []) {
    const id = String(o.providerAthleteId);
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({ providerAthleteId: id, name: o.name ?? null, availability: null, injuryStatus: null, basis: "insufficient", expectedMinutes: null, _source: "gate-insufficient-history" });
  }
  const otherTeamIds = new Set((gate?.otherTeamHistory ?? []).map((o) => String(o.providerAthleteId)));
  return { rows, otherTeamIds };
}

/**
 * Build ONE edition of the four boards from one forecast artifact at one instant.
 *
 * @param {{ artifact: object, sourceSha256: string, sourcePath?: string, frozenAt: string, family: string,
 *           earlierEventIds?: Set<string>, edition?: number, rules?: object[] }} o
 */
export function buildBoardEdition({ artifact, sourceSha256, sourcePath = null, frozenAt, family, earlierEventIds = new Set(), edition = 1, rules = ELIGIBILITY_RULES }) {
  if (!Number.isFinite(ms(frozenAt))) throw new Error("buildBoardEdition: frozenAt (ISO) is required");
  if (typeof sourceSha256 !== "string" || !/^[0-9a-f]{64}$/.test(sourceSha256)) throw new Error("buildBoardEdition: sourceSha256 (hex sha256 of the forecast file) is required");
  if (artifact?.family != null && family != null && String(artifact.family) !== String(family)) throw new Error(`REFUSED: forecast declares family ${artifact.family}, not ${family}`);

  const games = [];
  const onBoard = [];
  for (const g of [...(artifact?.games ?? [])].sort((a, b) => ms(a.dateUtc) - ms(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)))) {
    const d = gameBoardDecision(g, { artifact, frozenAt, family, earlierEventIds });
    games.push({
      eventId: String(g.providerEventId), tipoffUtc: g.dateUtc ?? null, label: g.label ?? null,
      home: teamView(g.home), away: teamView(g.away),
      forecastGeneratedAt: gameForecastInstant(g, artifact), forecastInputAsOf: g.forecast?.inputAsOf ?? null,
      gamePayloadSha256: g.receipt?.payloadSha256 ?? null,
      state: d.onBoard ? "ON_BOARD" : d.reason, flags: d.flags, ...(d.problems ? { problems: d.problems } : {}),
    });
    if (d.onBoard) onBoard.push({ game: g, flags: d.flags });
  }

  const boards = {};
  for (const cat of CATEGORIES) {
    const candidates = [];
    const withheld = [];
    for (const { game: g, flags: gameFlags } of onBoard) {
      for (const side of ["home", "away"]) {
        const team = teamView(g[side]);
        const opponent = teamView(g[side === "home" ? "away" : "home"]);
        const { rows, otherTeamIds } = sidePlayers(g, side);
        for (const p of rows) {
          const reasons = eligibilityReasons(p, { stat: cat.stat, otherTeamIds }, rules);
          const id = p?.providerAthleteId != null ? String(p.providerAthleteId) : null;
          if (reasons.length) {
            withheld.push({ providerAthleteId: id, name: p?.name ?? null, team: team?.abbr ?? null, eventId: String(g.providerEventId), reasons, primaryReason: reasons[0] });
            continue;
          }
          const flags = [...gameFlags];
          if (otherTeamIds.has(id) || p.historyBasis === "other-team") flags.push(FLAGS.TRADED_HISTORY_OTHER_TEAM);
          candidates.push({ g, id, p, dist: p[cat.stat], team, opponent, side, flags });
        }
      }
    }
    candidates.sort(compareCandidates);
    const rows = candidates.slice(0, BOARD_MAX_ROWS).map((c, i) => ({
      rank: i + 1,
      rowId: `${artifact?.date ?? "?"}|${family}|e${edition}|${cat.key}|${c.g.providerEventId}|${c.id}`,
      category: cat.key,
      stat: cat.stat,
      player: { name: c.p.name ?? null, providerAthleteId: c.id },
      team: c.team,
      opponent: c.opponent,
      homeAway: c.side,
      eventId: String(c.g.providerEventId),
      tipoffUtc: c.g.dateUtc,
      projection: { p50: c.dist.p50, mean: c.dist.mean },
      range: { p10: c.dist.p10, p90: c.dist.p90 },
      expectedMinutes: r2(c.p.expectedMinutes),
      minutesSd: r2(c.p.minutesSd),
      injuryStatus: c.p.injuryStatus ?? null,
      ...NO_MARKET,
      ...NO_CONFIDENCE,
      updated: { inputAsOf: c.g.forecast?.inputAsOf ?? artifact?.inputAsOf ?? null, generatedAt: gameForecastInstant(c.g, artifact) },
      modelVersion: c.g.receipt?.modelVersion ?? artifact?.modelVersion ?? null,
      family,
      receipt: { forecastSha256: sourceSha256, gamePayloadSha256: c.g.receipt?.payloadSha256 ?? null },
      flags: c.flags,
      sortKeys: { projection: c.dist.p50, expectedMinutes: r2(c.p.expectedMinutes), p90: c.dist.p90 },
    }));
    const byReason = {};
    for (const w of withheld) for (const r of w.reasons) byReason[r] = (byReason[r] ?? 0) + 1;
    const byPrimaryReason = {};
    for (const w of withheld) byPrimaryReason[w.primaryReason] = (byPrimaryReason[w.primaryReason] ?? 0) + 1;
    withheld.sort((a, b) => a.eventId.localeCompare(b.eventId) || String(a.providerAthleteId).localeCompare(String(b.providerAthleteId)));
    let emptyReason = null;
    if (!rows.length) {
      if (!onBoard.length) emptyReason = games.length ? `no game was eligible at the freeze (${[...new Set(games.map((g) => g.state))].join(", ")})` : "no game in the forecast artifact";
      else emptyReason = `no player passed every eligibility rule (${withheld.length} considered and withheld)`;
    }
    boards[cat.key] = {
      category: cat.key, label: cat.label, stat: cat.stat,
      rows,
      eligibleCount: candidates.length,
      shownCount: rows.length,
      withheld: { count: withheld.length, byPrimaryReason, byReason, players: withheld },
      emptyReason,
    };
  }

  return {
    edition,
    frozenAt,
    source: {
      path: sourcePath,
      sha256: sourceSha256,
      artifactGeneratedAt: artifact?.generatedAt ?? null,
      artifactInputAsOf: artifact?.inputAsOf ?? null,
      runs: Array.isArray(artifact?.runs) ? artifact.runs.length : null,
      modelVersion: artifact?.modelVersion ?? null,
    },
    gamesOnBoard: onBoard.length,
    games,
    boards,
  };
}

/** A fresh (empty) day document. */
export function emptyBoardDoc({ date, family, modelVersion }) {
  return {
    schemaVersion: 1,
    artifact: TOP_BOARD_ARTIFACT,
    schema: TOP_BOARD_SCHEMA,
    dataClass: "PRIVATE_RESEARCH",
    productEligible: false,
    publicState: "PRIVATE",
    neverReadBy: "public routes under app/src/app/** — private artifact; sport-capability-registry keeps NBA HISTORICAL_ONLY",
    date,
    family,
    modelVersion: modelVersion ?? null,
    categories: CATEGORIES.map((c) => ({ key: c.key, stat: c.stat, label: c.label })),
    maxRows: BOARD_MAX_ROWS,
    eligibility: { ...ELIGIBILITY, rules: ELIGIBILITY_RULES.map((r) => ({ id: r.id, scope: r.scope, description: r.description })), flags: Object.values(FLAGS) },
    ranking: RANKING,
    market: { state: "NO_AUTHORIZED_PRICE", note: "no NBA odds authorization exists; no line, odds, edge or over/under probability is ever recorded" },
    confidence: { value: null, reason: NO_CONFIDENCE.confidenceReason },
    writeOnce: { rule: "an edition, once written, is never rewritten; a later freeze only adds a new edition for games on no earlier edition that have not tipped" },
    editions: [],
  };
}

/** Event ids already on a board in any edition of the document. */
export function frozenEventIds(doc) {
  const ids = new Set();
  for (const e of doc?.editions ?? []) for (const g of e.games ?? []) if (g.state === "ON_BOARD") ids.add(String(g.eventId));
  return ids;
}

/**
 * Freeze: append a new edition to the day document (or create it). Pure.
 * @returns {{ ok: true, doc: object, edition: object|null, added: string[], note?: string } | { ok: false, errors: string[] }}
 */
export function freezeBoards({ existing, artifact, sourceSha256, sourcePath, frozenAt, family, date }) {
  const errors = [];
  if (existing) {
    if (existing.family !== family) errors.push(`stored board family ${existing.family} ≠ ${family}`);
    if (existing.date !== date) errors.push(`stored board date ${existing.date} ≠ ${date}`);
    if (artifact?.modelVersion && existing.modelVersion && existing.modelVersion !== artifact.modelVersion) errors.push(`stored modelVersion ${existing.modelVersion} ≠ forecast ${artifact.modelVersion} — a day file never mixes versions`);
    const lastFrozen = Math.max(...(existing.editions ?? []).map((e) => ms(e.frozenAt)), -Infinity);
    if (Number.isFinite(lastFrozen) && !(ms(frozenAt) > lastFrozen)) errors.push(`freeze instant ${frozenAt} is not after the last edition's ${new Date(lastFrozen).toISOString()}`);
  }
  if (artifact?.date && artifact.date !== date) errors.push(`forecast artifact is for ${artifact.date}, not ${date}`);
  if (errors.length) return { ok: false, errors };
  const doc = existing ? JSON.parse(JSON.stringify(existing)) : emptyBoardDoc({ date, family, modelVersion: artifact?.modelVersion });
  const earlier = frozenEventIds(doc);
  const edition = buildBoardEdition({ artifact, sourceSha256, sourcePath, frozenAt, family, earlierEventIds: earlier, edition: (doc.editions?.length ?? 0) + 1 });
  if (!edition.gamesOnBoard) return { ok: true, doc: existing ?? null, edition: null, added: [], note: "no game is newly eligible at this instant — nothing frozen (an edition is never written empty)" };
  doc.editions.push(edition);
  const added = edition.games.filter((g) => g.state === "ON_BOARD").map((g) => g.eventId);
  const v = frozenEditionViolations({ before: existing, after: doc });
  if (v.length) return { ok: false, errors: v };
  return { ok: true, doc, edition, added };
}

/** Post-write guard: every edition present BEFORE is canonically identical AFTER, none removed, no game on two editions. */
export function frozenEditionViolations({ before, after }) {
  const v = [];
  const b = before?.editions ?? [];
  const a = after?.editions ?? [];
  if (a.length < b.length) v.push(`editions removed (${b.length} → ${a.length})`);
  for (let i = 0; i < b.length; i += 1) {
    if (!a[i]) continue;
    if (canonicalJson(a[i]) !== canonicalJson(b[i])) v.push(`edition ${b[i].edition} was rewritten after it was frozen`);
  }
  const seen = new Map();
  for (const e of a) for (const g of e.games ?? []) {
    if (g.state !== "ON_BOARD") continue;
    if (seen.has(g.eventId)) v.push(`event ${g.eventId} is on editions ${seen.get(g.eventId)} and ${e.edition}`);
    else seen.set(g.eventId, e.edition);
  }
  return v;
}

/** sha256 of the exact bytes of a source file (string or Buffer). */
export const sourceSha256Of = (bytes) => sha256(bytes);

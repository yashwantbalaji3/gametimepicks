/**
 * NFL → Forecast Ledger rows. Pure: the build script reads files and passes parsed objects in.
 *
 * GAME FORECASTS (owner: build-nfl-public-forecasts → immutable receipts; settle-nfl-experimental grades them).
 *   One published game forecast prints five claims, so it is five observations:
 *     nfl_game_winner  BINARY      P(home wins)             — settled by the owner's grade; a tie is VOID (the owner
 *                                                             excludes ties from the decisive denominator)
 *     nfl_game_total   CONTINUOUS  total median + p10–p90
 *     nfl_game_margin  CONTINUOUS  home margin median + p10–p90
 *     nfl_team_score   CONTINUOUS  ×2, home and away projected score + its printed p10–p90
 *   Settled rows use the receipt the OWNER graded (`lineage.receiptFile`). Unsettled rows use the latest pre-kickoff
 *   receipt (the same rule the owner applies) and stay PENDING.
 *
 * PLAYER PROPS (owner: the append-only prop-settlement ledger — frozen at the pregame freeze, settled
 * PROVISIONAL → CANONICAL with corrections recorded). Volume families are CONTINUOUS (median + p10–p90);
 * anytime_td is BINARY. The owner's `forecastResult` (did the side our published projection implied land against
 * the frozen line) is carried as the directional word with that basis; NOT_APPLICABLE / NOT_PUBLISHED are not.
 *
 * TOP-5 BOARDS (owner: freeze-daily-top-boards, write-once). A Top-5 entry is the same forecast as the player-board
 * row (identical id), so it never adds an observation when the prop ledger holds that forecast. When it does not —
 * e.g. a player frozen on the Top-5 and later withdrawn before kickoff, so never frozen by the prop ledger — the
 * Top-5 receipt is the only publication, and it becomes the row. A withdrawal event (append-only sidecar) marks the
 * row WITHDRAWN: never a loss, never pending.
 */
import { FORECAST_KIND, RECOVERABILITY } from "../contract.mjs";
import { measureBinary, measureContinuous, withDirectional } from "../measure.mjs";
import { makeRow, marketBlock } from "../row.mjs";

const SPORT = "NFL";

/** NFL season label from a kickoff: Jan/Feb games belong to the previous September's season. */
export function nflSeason(kickoffUtc) {
  const d = new Date(Date.parse(kickoffUtc));
  const y = d.getUTCFullYear();
  return String(d.getUTCMonth() < 6 ? y - 1 : y);
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Latest pre-kickoff receipt per event across every receipt folder — the owner's forecast-of-record rule. */
export function forecastOfRecord(receipts) {
  const best = new Map();
  for (const { file, receipt: r } of receipts) {
    if (!r?.providerEventId || !r.generatedAt || !r.kickoffUtc) continue;
    if (!(Date.parse(r.generatedAt) < Date.parse(r.kickoffUtc))) continue;
    const prev = best.get(r.providerEventId);
    if (!prev || r.generatedAt > prev.receipt.generatedAt || (r.generatedAt === prev.receipt.generatedAt && file > prev.file)) {
      best.set(r.providerEventId, { file, receipt: r });
    }
  }
  return best;
}

function gameRows({ file, receipt: r, grade, settledAt, resultSource, notes = [], teamIds = new Map() }) {
  const s = r.forecastSummary;
  if (!s) return [];
  const base = {
    sport: SPORT,
    competition: "NFL",
    season: nflSeason(r.kickoffUtc),
    eventId: String(r.providerEventId),
    eventStart: r.kickoffUtc,
    matchup: r.matchup ?? null,
    modelId: r.model?.id ?? null,
    modelVersion: r.model?.version != null ? String(r.model.version) : null,
    modelStatusAtPublish: r.model?.launchState ?? r.state ?? null,
    publicationSurface: "nfl-game-forecast",
    receiptId: file,
    publishedAt: r.generatedAt,
    recoverability: RECOVERABILITY.EXACT_FROZEN,
    provenance: notes.length ? { notes } : null,
  };
  const a = grade?.actual ?? null;
  const settled = a != null && Number.isInteger(a.home) && Number.isInteger(a.away);
  const settlement = (finalValue, extra = {}) =>
    settled
      ? { state: "SETTLED", finalValue, settledAt: settledAt ?? null, finality: "CANONICAL", source: resultSource ?? null, ...extra }
      : { state: "PENDING" };
  const mc = r.marketComparison?.state === "MARKET_VIEW" ? r.marketComparison : null;
  const provider = mc ? `consensus of ${mc.books ?? "?"} books` : null;
  const rows = [];

  // Winner — P(home wins), exactly as published (the owner grades the rounded published value).
  const pHome = s.winProbability?.home;
  if (isNum(pHome)) {
    let settlementW = settlement(null);
    let measurement = {};
    if (settled) {
      if (a.home === a.away) {
        settlementW = { ...settlementW, state: "VOID", finalCategory: "TIE", reason: "TIE_NO_WINNER" };
      } else {
        const homeWon = a.home > a.away;
        settlementW = { ...settlementW, finalValue: homeWon ? 1 : 0, finalCategory: homeWon ? "HOME" : "AWAY" };
        measurement = measureBinary({ probability: pHome, observed: homeWon ? 1 : 0 });
        if (pHome !== 0.5) {
          measurement = withDirectional(measurement, {
            result: (pHome > 0.5) === homeWon ? "WIN" : "LOSS",
            basis: "HIGHER_WIN_PROBABILITY_SIDE",
          });
        }
      }
    }
    rows.push(makeRow({
      ...base,
      subjectType: "GAME",
      subjectId: String(r.canonicalEventId ?? `nfl-${r.providerEventId}`),
      subjectDisplay: r.matchup ?? null,
      family: "nfl_game_winner",
      forecastKind: FORECAST_KIND.BINARY,
      probability: pHome,
      probabilityType: "MODEL",
      direction: "HOME_WIN",
      categoryPrediction: pHome > 0.5 ? "HOME" : pHome < 0.5 ? "AWAY" : "EVEN",
      market: mc ? marketBlock({ impliedProbability: mc.marketHomeWinPct ?? null, provider, capturedAt: mc.capturedAt ?? null }) : null,
      settlement: settlementW,
      measurement,
    }));
  }

  const continuous = (family, subjectType, subjectId, subjectDisplay, teamId, dist, finalValue, market) => {
    if (!dist || !isNum(dist.median)) return;
    const rangeLow = isNum(dist.p10) ? dist.p10 : null;
    const rangeHigh = isNum(dist.p90) ? dist.p90 : null;
    rows.push(makeRow({
      ...base,
      subjectType,
      subjectId,
      subjectDisplay,
      teamId,
      family,
      forecastKind: FORECAST_KIND.CONTINUOUS,
      projection: dist.median,
      rangeLow,
      rangeHigh,
      rangeCoverage: rangeLow != null ? 0.8 : null,
      market,
      settlement: settlement(settled ? finalValue : null),
      measurement: settled ? measureContinuous({ projection: dist.median, rangeLow, rangeHigh, finalValue }) : {},
    }));
  };
  const gameId = String(r.canonicalEventId ?? `nfl-${r.providerEventId}`);
  continuous("nfl_game_total", "GAME", gameId, r.matchup ?? null, null, s.total, settled ? a.home + a.away : null,
    mc && isNum(mc.marketTotal) ? marketBlock({ line: mc.marketTotal, provider, capturedAt: mc.capturedAt ?? null }) : null);
  // The market spread's sign convention is not restated here; the margin row carries no market block rather than a guessed sign.
  continuous("nfl_game_margin", "GAME", gameId, r.matchup ?? null, null, s.margin, settled ? a.home - a.away : null, null);
  const ps = s.projectedScore;
  const sr = s.scoreRange ?? {};
  /* Team subjects use the platform's canonical team id (research-projection index: nfl-team-<ESPN id>), found by the
     team's abbreviation — one exact match or the team row is not emitted (fail closed, never a guessed id). */
  const homeId = r.home?.abbr ? teamIds.get(r.home.abbr) : null;
  const awayId = r.away?.abbr ? teamIds.get(r.away.abbr) : null;
  if (homeId && ps && isNum(ps.home)) {
    continuous("nfl_team_score", "TEAM", homeId, r.home.name ?? r.home.abbr, r.home.abbr,
      { median: ps.home, p10: sr.homeP10, p90: sr.homeP90 }, settled ? a.home : null, null);
  }
  if (awayId && ps && isNum(ps.away)) {
    continuous("nfl_team_score", "TEAM", awayId, r.away.name ?? r.away.abbr, r.away.abbr,
      { median: ps.away, p10: sr.awayP10, p90: sr.awayP90 }, settled ? a.away : null, null);
  }
  return rows;
}

/**
 * @param settledEvents  [{ event, receipt }] — owner-graded events with the receipt they graded
 * @param receiptsOfRecord Map<providerEventId, {file, receipt}> — for events not yet graded
 */
export function nflGameRows({ settledEvents = [], receiptsOfRecord = new Map(), now, teamIds = new Map() }) {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("nflGameRows: now is required");
  const rows = [];
  const graded = new Set();
  /* The owner settles per receipt-date FOLDER, and a game kicking off just after 00:00Z has receipts in two UTC
     folders — so it was graded twice, once against an earlier, superseded receipt (3 games through 2026-10-04:
     401874392, 401873300, 401872962). The forecast of record is the LATEST pre-kickoff receipt; only that grade
     becomes a row, and the superseded grade is named in the row's provenance notes, never counted. */
  const best = new Map();
  for (const item of settledEvents) {
    if (!item.receipt) continue;
    const id = String(item.event.providerEventId);
    const prev = best.get(id);
    const at = item.event.lineage?.forecastGeneratedAt ?? "";
    if (!prev) { best.set(id, { item, superseded: [] }); continue; }
    const prevAt = prev.item.event.lineage?.forecastGeneratedAt ?? "";
    if (at > prevAt) best.set(id, { item, superseded: [...prev.superseded, prev.item.event.lineage?.receiptFile ?? null] });
    else prev.superseded.push(item.event.lineage?.receiptFile ?? null);
  }
  for (const { item: { event: e, receipt }, superseded } of best.values()) {
    graded.add(String(e.providerEventId));
    const notes = superseded.length ? [`owner also graded superseded receipt(s) ${superseded.join(", ")} — not of record, not counted`] : [];
    rows.push(...gameRows({ notes, teamIds,
      file: e.lineage?.receiptFile ?? null,
      receipt,
      grade: e.grade,
      settledAt: e.lineage?.settledAt ?? null,
      resultSource: e.lineage?.resultSource ?? null,
    }));
  }
  for (const [id, rec] of receiptsOfRecord) {
    if (graded.has(String(id))) continue;
    // Before kickoff the forecast of record can still be revised; only a started event's forecast is final.
    if (!(Date.parse(rec.receipt.kickoffUtc) <= nowMs)) continue;
    rows.push(...gameRows({ file: rec.relPath ?? rec.file, receipt: rec.receipt, grade: null, teamIds }));
  }
  return rows;
}

const PROP_FAMILIES = new Set(["player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions", "anytime_td"]);

function propSettlement(row) {
  const corrections = Array.isArray(row.corrections) ? row.corrections.length : 0;
  if (row.measurementState === "OBSERVED") {
    return {
      state: "SETTLED",
      finalValue: isNum(row.finalStat) ? row.finalStat : null,
      finalCategory: row.lineResult ?? null,
      settledAt: row.settledAt ?? null,
      finality: row.finality ?? null,
      corrections,
      source: row.source ?? null,
    };
  }
  if (row.measurementState === "NO_MEASUREMENT") {
    return { state: "NO_MEASUREMENT", settledAt: row.settledAt ?? null, finality: row.finality ?? null, corrections, source: row.source ?? null, reason: "NO_STAT_ROW_AT_FINAL" };
  }
  return { state: "PENDING" };
}

export function nflPropRows(propSettlementRows = []) {
  const out = [];
  for (const r of propSettlementRows) {
    if (!PROP_FAMILIES.has(r.family)) continue;
    if (r.familyState !== "PUBLISHED" && r.familyState !== "ESTIMATE") continue; // only what the board printed
    const f = r.frozen ?? {};
    const proj = f.projection ?? {};
    const isTd = r.family === "anytime_td";
    const settlement = propSettlement(r);
    const m = f.market ?? null;
    const market = m
      ? marketBlock({
        line: isNum(m.line) ? m.line : null,
        price: isTd ? (m.yesOdds != null ? { yes: m.yesOdds } : null) : (m.overOdds != null || m.underOdds != null ? { over: m.overOdds ?? null, under: m.underOdds ?? null } : null),
        provider: m.sportsbook ?? null,
        capturedAt: m.capturedAt ?? null,
      })
      : null;
    let measurement = {};
    if (settlement.state === "SETTLED") {
      if (isTd) {
        const observed = r.lineResult === "YES" ? 1 : r.lineResult === "NO" ? 0 : null;
        measurement = observed == null ? {} : measureBinary({ probability: proj.probability, observed });
      } else {
        measurement = measureContinuous({ projection: proj.median, rangeLow: proj.p10, rangeHigh: proj.p90, finalValue: settlement.finalValue });
      }
      if (["WIN", "LOSS", "PUSH"].includes(r.forecastResult)) {
        measurement = withDirectional(measurement, { result: r.forecastResult, basis: "IMPLIED_SIDE_OF_FROZEN_LINE" });
      }
    }
    const base = {
      sport: SPORT,
      competition: "NFL",
      season: r.kickoffUtc ? nflSeason(r.kickoffUtc) : null,
      eventId: String(r.eventId),
      eventStart: r.kickoffUtc ?? null,
      matchup: r.matchup ?? null,
      subjectType: "PLAYER",
      subjectId: r.playerId,
      subjectDisplay: r.playerName ?? null,
      teamId: r.teamAbbr ?? null,
      family: r.family,
      modelId: null, // the prop ledger does not record the family's model id; never back-filled from today's registry
      modelVersion: null,
      modelStatusAtPublish: r.familyState,
      publicationSurface: "nfl-player-board",
      receiptId: `${r.settlementId}#${r.frozenIdentity ?? "?"}`,
      publishedAt: f.forecastGeneratedAt ?? null,
      recoverability: RECOVERABILITY.EXACT_FROZEN,
      market,
      settlement,
      measurement,
    };
    if (isTd) {
      if (!isNum(proj.probability)) continue;
      out.push(makeRow({ ...base, forecastKind: FORECAST_KIND.BINARY, probability: proj.probability, probabilityType: "MODEL", direction: "SCORES_TD" }));
    } else {
      if (!isNum(proj.median)) continue;
      const lo = isNum(proj.p10) ? proj.p10 : null;
      const hi = isNum(proj.p90) ? proj.p90 : null;
      out.push(makeRow({ ...base, forecastKind: FORECAST_KIND.CONTINUOUS, projection: proj.median, rangeLow: lo, rangeHigh: hi, rangeCoverage: lo != null && hi != null ? 0.8 : null }));
    }
  }
  return out;
}

/**
 * Top-5 frozen boards → rows ONLY for forecasts the prop ledger does not hold (see header). `withdrawals` is the
 * append-only sidecar's event list; the last event per forecast decides (WITHDRAWN / REINSTATED).
 */
/** A Top-5-only forecast enters the ledger this long after kickoff (never pending): VOID if withdrawn, else UNMEASURED. */
const NO_OWNER_GRACE_MS = 72 * 3600 * 1000;

export function nflTopBoardRows({ boards = [], withdrawals = [], heldIds = new Set(), now }) {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("nflTopBoardRows: now is required");
  const lastEvent = new Map();
  for (const ev of withdrawals) lastEvent.set(ev.forecastId, ev);
  const out = [];
  for (const { file, board } of boards) {
    for (const b of board?.boards ?? []) {
      if (String(b.sport).toLowerCase() !== "nfl" || !PROP_FAMILIES.has(b.propFamily)) continue;
      for (const e of b.rows ?? []) {
        const isTd = b.propFamily === "anytime_td";
        const p = e.projection ?? {};
        const ev = lastEvent.get(e.forecastId);
        const withdrawn = ev?.status === "WITHDRAWN";
        const base = {
          sport: SPORT,
          competition: "NFL",
          season: e.kickoffUtc ? nflSeason(e.kickoffUtc) : null,
          eventId: String(e.providerEventId),
          eventStart: e.kickoffUtc ?? null,
          matchup: e.opponent && e.team ? `${e.team} vs ${e.opponent}` : null,
          subjectType: "PLAYER",
          subjectId: e.playerId,
          subjectDisplay: e.name ?? null,
          teamId: e.team ?? null,
          family: b.propFamily,
          modelId: b.model ?? null,
          modelVersion: b.modelVersion != null ? String(b.modelVersion) : null,
          modelStatusAtPublish: "PUBLISHED",
          publicationStatus: withdrawn ? "WITHDRAWN" : "PUBLISHED",
          publicationSurface: "results-top-board",
          receiptId: `${file}#${e.forecastId}`,
          publishedAt: e.boardGeneratedAt ?? board.publishedAt ?? null,
          recoverability: RECOVERABILITY.EXACT_FROZEN,
          market: e.market
            ? marketBlock({
              line: isNum(e.line) ? e.line : null,
              price: isTd ? (e.market.yesOdds != null ? { yes: e.market.yesOdds } : null) : (e.market.overOdds != null || e.market.underOdds != null ? { over: e.market.overOdds ?? null, under: e.market.underOdds ?? null } : null),
              provider: e.market.sportsbook ?? null,
              capturedAt: e.market.capturedAt ?? null,
            })
            : null,
          withdrawal: withdrawn ? { status: "WITHDRAWN", reason: ev.reason ?? null, effectiveAt: ev.effectiveAt ?? null, recordedAt: ev.recordedAt ?? null, source: ev.source ?? null } : null,
          // A Top-5 receipt is not a settlement owner; these rows stay PENDING (or WITHDRAWN) until a settlement owner holds them.
          settlement: withdrawn
            ? { state: "VOID", reason: "WITHDRAWN_BEFORE_START" }
            : { state: "NO_MEASUREMENT", reason: "NO_SETTLEMENT_OWNER_ROW" },
          measurement: withdrawn ? { directionalResult: "WITHDRAWN" } : {},
        };
        const row = isTd
          ? (isNum(p.probability) ? makeRow({ ...base, forecastKind: FORECAST_KIND.BINARY, probability: p.probability, probabilityType: "MODEL", direction: "SCORES_TD" }) : null)
          : (isNum(p.median) ? makeRow({ ...base, forecastKind: FORECAST_KIND.CONTINUOUS, projection: p.median, rangeLow: isNum(p.p10) ? p.p10 : null, rangeHigh: isNum(p.p90) ? p.p90 : null, rangeCoverage: isNum(p.p10) && isNum(p.p90) ? 0.8 : null }) : null);
        // Only once the prop ledger has had its chance (kickoff + grace): before that the forecast may still
        // be frozen there, and a row that later changed source would break append-only.
        if (!(Date.parse(e.kickoffUtc) + NO_OWNER_GRACE_MS < nowMs)) continue;
        if (row && !heldIds.has(row.forecastId)) out.push(row);
      }
    }
  }
  return out;
}

/* ───────────────────────── NFL props, Weeks 1–2 (Session 13 · Phase G backfill) ───────────────────────── */

/**
 * Before the prop-settlement ledger existed (first day 2026-09-20), published player forecasts were graded only in the
 * week reconciliation, which records each row by player NAME and team — exactly as printed (values rounded the way the
 * page rounded them), against the official box score. Those rows join the ledger here through an EXACT crosswalk: the
 * latest roster capture before the game's kickoff, the row's team, and a full-name string match that is unique on that
 * team. Zero or several matches → the row stays UNRESOLVED (counted, never guessed).
 *
 * Only games kicking off before PROP_LEDGER_START: from then on the prop ledger owns these forecasts (frozen, raw values),
 * and a forecast that could later switch source would break append-only.
 */
export const PROP_LEDGER_START = "2026-09-20T00:00:00Z";
const RECON_FAMILIES = new Set(["player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions"]);

/** @param captures [{ stampMs, doc }] roster captures (doc.teams[].teamAbbr, .players[].id/.fullName) */
export function rosterCrosswalk(captures) {
  const sorted = [...captures].filter((c) => Number.isFinite(c.stampMs)).sort((a, b) => a.stampMs - b.stampMs);
  const indexes = new Map();
  const indexOf = (cap) => {
    if (!indexes.has(cap)) {
      const byTeam = new Map();
      for (const t of cap.doc?.teams ?? []) {
        const m = new Map();
        for (const p of t.players ?? []) {
          if (!p?.id || !p?.fullName) continue;
          const a = m.get(p.fullName) ?? [];
          a.push(`nfl-athlete-${p.id}`);
          m.set(p.fullName, a);
        }
        byTeam.set(t.teamAbbr, m);
      }
      indexes.set(cap, byTeam);
    }
    return indexes.get(cap);
  };
  return (name, team, beforeMs) => {
    let cap = null;
    for (const c of sorted) { if (c.stampMs < beforeMs) cap = c; else break; }
    if (!cap) return null;
    const ids = indexOf(cap).get(team)?.get(name) ?? [];
    return ids.length === 1 ? ids[0] : null;
  };
}

export function nflReconciliationRows({ weeks = [], captures = [] }) {
  const resolve = rosterCrosswalk(captures);
  const cutoff = Date.parse(PROP_LEDGER_START);
  const rows = [];
  const unresolved = [];
  for (const { file, doc } of weeks) {
    for (const g of doc?.games ?? []) {
      const kick = Date.parse(g.kickoffUtc);
      if (!Number.isFinite(kick) || !(kick < cutoff) || !g.providerEventId) continue;
      const base = (name, team) => ({
        sport: SPORT,
        competition: "NFL",
        season: nflSeason(g.kickoffUtc),
        eventId: String(g.providerEventId),
        eventStart: g.kickoffUtc,
        matchup: g.matchup ?? null,
        subjectType: "PLAYER",
        subjectDisplay: name,
        teamId: team ?? null,
        modelId: null,
        modelVersion: null,
        publicationSurface: "nfl-player-board",
        publishedAt: null, // the reconciliation records the board's values, not its publication instant (graded only if before kickoff)
        recoverability: RECOVERABILITY.OWNER_GRADED_LOG,
        provenance: { notes: ["values as printed on the pre-kickoff board (rounded the way the page rounded them); id by exact roster crosswalk"] },
      });
      for (const p of g.players ?? []) {
        if (!RECON_FAMILIES.has(p.prop) || (p.status !== "PUBLISHED" && p.status !== "ESTIMATE") || !isNum(p.median)) continue;
        const subjectId = resolve(p.name, p.team, kick);
        if (!subjectId) { unresolved.push({ eventId: String(g.providerEventId), name: p.name, team: p.team, family: p.prop }); continue; }
        const lo = isNum(p.low) ? p.low : null;
        const hi = isNum(p.high) ? p.high : null;
        const settled = (p.outcome === "HIT" || p.outcome === "MISS") && isNum(p.actual);
        rows.push(makeRow({
          ...base(p.name, p.team),
          subjectId,
          family: p.prop,
          forecastKind: FORECAST_KIND.CONTINUOUS,
          modelStatusAtPublish: p.status,
          receiptId: `${file}#${g.providerEventId}:${subjectId}:${p.prop}`,
          projection: p.median,
          rangeLow: lo,
          rangeHigh: hi,
          rangeCoverage: lo != null && hi != null ? 0.8 : null,
          settlement: settled
            ? { state: "SETTLED", finalValue: p.actual, finality: "CANONICAL", source: "nfl-week-reconciliation" }
            : p.outcome === "VOID" ? { state: "VOID", reason: "NOT_IN_OFFICIAL_BOX_SCORE", source: "nfl-week-reconciliation" }
              : { state: "NO_MEASUREMENT", reason: `OWNER_OUTCOME_${String(p.outcome).toUpperCase()}` },
          measurement: settled ? measureContinuous({ projection: p.median, rangeLow: lo, rangeHigh: hi, finalValue: p.actual }) : {},
        }));
      }
      for (const t of g.touchdowns ?? []) {
        if (!isNum(t.probability)) continue;
        const subjectId = resolve(t.name, t.team, kick);
        if (!subjectId) { unresolved.push({ eventId: String(g.providerEventId), name: t.name, team: t.team, family: "anytime_td" }); continue; }
        const observed = t.outcome === "SCORED" ? 1 : t.outcome === "DID_NOT_SCORE" ? 0 : null;
        rows.push(makeRow({
          ...base(t.name, t.team),
          subjectId,
          family: "anytime_td",
          forecastKind: FORECAST_KIND.BINARY,
          modelStatusAtPublish: "PUBLISHED",
          receiptId: `${file}#${g.providerEventId}:${subjectId}:anytime_td`,
          probability: t.probability,
          probabilityType: "MODEL",
          direction: "SCORES_TD",
          settlement: observed != null
            ? { state: "SETTLED", finalValue: observed, finalCategory: t.outcome, finality: "CANONICAL", source: "nfl-week-reconciliation" }
            : t.outcome === "VOID" ? { state: "VOID", reason: "DID_NOT_PLAY", source: "nfl-week-reconciliation" } : { state: "NO_MEASUREMENT" },
          measurement: observed != null ? measureBinary({ probability: t.probability, observed }) : {},
        }));
      }
    }
  }
  return { rows, unresolved };
}

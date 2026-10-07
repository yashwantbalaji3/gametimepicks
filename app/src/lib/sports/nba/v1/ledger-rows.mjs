/**
 * PREP · Stage 12 (NBA V1), NBA department, local only. NOT WIRED: nothing composes these rows into the public
 * Forecast Ledger, and the default publication status keeps them out of it.
 *
 * NBA FROZEN RECEIPT → FORECAST LEDGER ROWS. One receipt game (`data/internal/research/nba/experimental/forecasts/
 * <date>.json` games[], `nba-forecast-receipt@1`) becomes one ledger-shaped row per (subject, family), built with the
 * ledger's own `makeRow`, so the row is the universal prediction object Stage 5 builds on (Forecast Ledger row +
 * board receipt joined by forecastId). Nothing is re-predicted and nothing is re-settled:
 *   - every number is the receipt's own frozen value (the median `p50` for continuous families, like the NFL adapter;
 *     the head's `pHome` for the winner);
 *   - game outcomes come only from the write-once finals record (`finalFor`); player outcomes only from the captured
 *     box score. A game the record does not hold is PENDING; a conflicted final is PENDING (under review).
 *
 * SHADOW BY DEFAULT. NBA predictive output is founder-gated (prereg §7, registry HISTORICAL_ONLY). Rows carry
 * `publicationStatus: "SHADOW"`, which `validateRow` / `composeLedger` refuse — the public ledger cannot ingest them
 * by accident. A promoted family would be re-emitted with PUBLISHED only after the founder's promotion receipt.
 *
 * ONE FORECAST OF RECORD PER QUESTION. The ledger identity excludes the model version, so v0 and the roster-gated
 * v0.1 (and any later challenger) forecasting the same player/family/game share one forecastId. Only the champion's
 * receipt may be emitted into a ledger; challengers stay in their own private ledger (experimental-v0.1/…). The
 * `assertOneChampion` guard below enforces that a caller never feeds two model families for one question.
 *
 * Player outcome words (missing stays missing, never zero, never a loss):
 *   played with minutes and the stat recorded → SETTLED · DNP → VOID (DNP) · not in the box score → VOID
 *   (NOT_IN_BOXSCORE) · played but ESPN gave no minutes / no stat → NO_MEASUREMENT · box score not captured → PENDING.
 *
 * Pure: inputs passed in, no fs, no clock.
 */
import { FORECAST_KIND, RECOVERABILITY } from "../../../forecast-ledger/contract.mjs";
import { makeRow } from "../../../forecast-ledger/row.mjs";
import { measureBinary, measureContinuous, withDirectional } from "../../../forecast-ledger/measure.mjs";
import { NBA_V1_FAMILIES } from "./families.mjs";
import { frozenWinnerSide, TOO_CLOSE } from "./winner-side.mjs";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const PLAYER_FAMILIES = NBA_V1_FAMILIES.filter((f) => f.subject === "PLAYER" && f.source != null);

/** "2026-27" for a tip in Oct 2026 – Jun 2027. */
export function nbaSeasonOf(tipUtc) {
  const d = new Date(Date.parse(tipUtc));
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const start = m >= 8 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Preseason is a separate population end to end (prereg §3): it never shares a competition with the regular season. */
export const competitionOf = (seasonType) => (seasonType === 1 ? "NBA_PRESEASON" : "NBA");

export function assertOneChampion(games) {
  const seen = new Map();
  for (const g of games ?? []) {
    const id = String(g?.providerEventId ?? "");
    const fam = g?.receipt?.family ?? null;
    if (seen.has(id) && seen.get(id) !== fam) {
      throw new Error(`nba ledger rows: event ${id} has receipts from two model families (${seen.get(id)}, ${fam}); only the champion may be emitted`);
    }
    seen.set(id, fam);
  }
}

/**
 * @param game         one receipt game (games[] entry)
 * @param file         the receipt file's repo path (provenance)
 * @param final        `finalFor(record, eventId)` result, or null
 * @param canonicalEventId  the finals record's canonicalEventId for the game (null → `nba-<eventId>`)
 * @param boxscore     the captured box-score doc for the game, or null
 * @param winnerHead   "sim" | "elo" — which frozen head is the winner forecast of record (founder decision)
 * @param publicationStatus  "SHADOW" (default) — PUBLISHED only after a founder promotion receipt
 * @returns {{ rows, skipped }}  skipped = player forecasts the receipt left without a distribution (listed, never zero)
 */
export function nbaReceiptGameRows({ game, file, final = null, canonicalEventId = null, boxscore = null, winnerHead, publicationStatus = "SHADOW" }) {
  const g = game ?? {};
  const r = g.receipt ?? {};
  const f = g.forecast ?? {};
  const eventId = String(g.providerEventId ?? "");
  if (!eventId || !r.payloadSha256 || !r.generatedAt) throw new Error(`nba ledger rows: game ${eventId || "?"} has no frozen receipt`);
  if (!(Date.parse(r.generatedAt) < Date.parse(g.dateUtc))) throw new Error(`nba ledger rows: receipt for ${eventId} is not before tip`);

  const matchup = `${g.away?.abbr ?? "?"} @ ${g.home?.abbr ?? "?"}`;
  const base = {
    sport: "NBA",
    competition: competitionOf(g.seasonType),
    season: nbaSeasonOf(g.dateUtc),
    eventId,
    eventStart: g.dateUtc,
    matchup,
    modelId: `nba-game-sim:${r.family ?? "?"}`,
    modelVersion: r.modelVersion ?? f.modelVersion ?? null,
    modelStatusAtPublish: "SHADOW",
    publicationStatus,
    publicationSurface: "nba-forecast-receipt",
    receiptId: `${file ?? "?"}#${r.payloadSha256}`,
    publishedAt: r.generatedAt,
    frozenAt: r.generatedAt,
    recoverability: RECOVERABILITY.EXACT_FROZEN,
    provenance: { notes: [`population:${g.population ?? "?"}`, `receipt:${r.schema ?? "?"}`] },
  };

  const final_ = final?.state === "FINAL" && Number.isInteger(final.ftHome) && Number.isInteger(final.ftAway) ? final : null;
  const underReview = final?.state === "FINAL_UNDER_REVIEW";
  const gameSettlement = (finalValue, extra = {}) =>
    final_ ? { state: "SETTLED", finalValue, finality: "CANONICAL", source: "nba-finals-record", ...extra }
      : { state: "PENDING", reason: underReview ? "FINAL_UNDER_REVIEW" : null };

  const rows = [];
  const gameId = canonicalEventId ?? `nba-${eventId}`;

  // Winner — the head of record's P(home), and the side frozen in the receipt if (and only if) the receipt froze one.
  // A v0/v0.1 receipt froze no side, so these rows are measured by Brier / log loss only (Stage 3 Q3: never inferred).
  const side = frozenWinnerSide(f, { head: winnerHead, generation: base.modelVersion });
  if (isNum(side.pHome)) {
    const frozen = typeof f.publishedSide === "string" ? f.publishedSide : null; // future receipt field (slice 12-S1)
    let measurement = {};
    let settlement = gameSettlement(null);
    if (final_) {
      if (final_.ftHome === final_.ftAway) {
        settlement = { state: "VOID", reason: "TIE_NO_WINNER", finalCategory: "TIE", source: "nba-finals-record" };
      } else {
        const homeWon = final_.ftHome > final_.ftAway;
        settlement = gameSettlement(homeWon ? 1 : 0, { finalCategory: homeWon ? "HOME" : "AWAY" });
        measurement = measureBinary({ probability: side.pHome, observed: homeWon ? 1 : 0 });
        if (frozen === "HOME" || frozen === "AWAY") {
          measurement = withDirectional(measurement, { result: (frozen === "HOME") === homeWon ? "WIN" : "LOSS", basis: "FROZEN_PUBLISHED_SIDE" });
        }
      }
    }
    rows.push(makeRow({
      ...base,
      subjectType: "GAME", subjectId: gameId, subjectDisplay: matchup, teamId: null,
      family: "nba_game_winner", forecastKind: FORECAST_KIND.BINARY,
      probability: side.pHome, probabilityType: "MODEL", direction: "HOME_WIN",
      categoryPrediction: frozen === "HOME" || frozen === "AWAY" || frozen === TOO_CLOSE ? frozen : null,
      settlement, measurement,
    }));
  }

  const continuous = ({ family, subjectType, subjectId, subjectDisplay, teamId, dist, finalValue, settlement }) => {
    if (!dist || !isNum(dist.p50)) return false;
    const rangeLow = isNum(dist.p10) ? dist.p10 : null;
    const rangeHigh = isNum(dist.p90) ? dist.p90 : null;
    const settled = settlement.state === "SETTLED" && isNum(finalValue);
    rows.push(makeRow({
      ...base, subjectType, subjectId, subjectDisplay, teamId, family,
      forecastKind: FORECAST_KIND.CONTINUOUS,
      projection: dist.p50, rangeLow, rangeHigh, rangeCoverage: rangeLow != null && rangeHigh != null ? 0.8 : null,
      settlement,
      measurement: settled ? measureContinuous({ projection: dist.p50, rangeLow, rangeHigh, finalValue }) : {},
    }));
    return true;
  };

  const sim = f.sim ?? {};
  const fh = final_?.ftHome, fa = final_?.ftAway;
  continuous({ family: "nba_game_margin", subjectType: "GAME", subjectId: gameId, subjectDisplay: matchup, teamId: null,
    dist: sim.margin, finalValue: final_ ? fh - fa : null, settlement: gameSettlement(final_ ? fh - fa : null) });
  continuous({ family: "nba_game_total", subjectType: "GAME", subjectId: gameId, subjectDisplay: matchup, teamId: null,
    dist: sim.total, finalValue: final_ ? fh + fa : null, settlement: gameSettlement(final_ ? fh + fa : null) });
  for (const [sideKey, team, pts] of [["home", g.home, fh], ["away", g.away, fa]]) {
    if (!team?.providerTeamId) continue; // team identity is never inferred from a name
    continuous({ family: "nba_team_score", subjectType: "TEAM", subjectId: `nba-team-${team.providerTeamId}`,
      subjectDisplay: team.name ?? team.abbr ?? null, teamId: team.abbr ?? null,
      dist: sim[sideKey], finalValue: final_ ? pts : null, settlement: gameSettlement(final_ ? pts : null) });
  }

  // Players.
  const skipped = [];
  const box = boxscore && boxscore.boxscoreAvailable === true && String(boxscore.providerEventId) === eventId ? boxscore : null;
  const byAthlete = new Map((box?.players ?? []).filter((p) => p.providerAthleteId).map((p) => [String(p.providerAthleteId), p]));
  const playerSettlement = (athleteId, stat) => {
    if (!final_) return { s: { state: "PENDING", reason: underReview ? "FINAL_UNDER_REVIEW" : null }, v: null };
    if (!box) return { s: { state: "PENDING", reason: "BOXSCORE_NOT_CAPTURED" }, v: null };
    const p = byAthlete.get(athleteId);
    if (!p) return { s: { state: "VOID", reason: "NOT_IN_BOXSCORE", source: "nba-boxscore" }, v: null };
    if (p.didNotPlay) return { s: { state: "VOID", reason: "DNP", source: "nba-boxscore" }, v: null };
    if (!isNum(p.minutes)) return { s: { state: "NO_MEASUREMENT", reason: "NULL_MINUTES", source: "nba-boxscore" }, v: null };
    if (!isNum(p[stat])) return { s: { state: "NO_MEASUREMENT", reason: "STAT_NOT_RECORDED", source: "nba-boxscore" }, v: null };
    return { s: { state: "SETTLED", finalValue: p[stat], finality: "CANONICAL", source: "nba-boxscore" }, v: p[stat] };
  };
  for (const [sideKey, team] of [["home", g.home], ["away", g.away]]) {
    for (const pl of f.players?.[sideKey] ?? []) {
      const athleteId = pl?.providerAthleteId != null ? String(pl.providerAthleteId) : null;
      if (!athleteId) { skipped.push({ eventId, name: pl?.name ?? null, reason: "NO_ATHLETE_ID" }); continue; }
      for (const fam of PLAYER_FAMILIES) {
        const { s, v } = playerSettlement(athleteId, fam.stat);
        const ok = continuous({ family: fam.family, subjectType: "PLAYER", subjectId: athleteId, subjectDisplay: pl.name ?? null,
          teamId: team?.abbr ?? null, dist: pl[fam.stat], finalValue: v, settlement: s });
        if (!ok) skipped.push({ eventId, subjectId: athleteId, family: fam.family, reason: pl.availability === "out" ? "OUT" : "NO_DISTRIBUTION" });
      }
    }
  }
  return { rows, skipped };
}

/**
 * NBA ELO SHADOW — the corrected update pipeline as a functional shadow (founder 2026-11-11: "build and ship the
 * corrected update pipeline as a functional shadow now; promotion is separate"). PURE, deterministic, no I/O.
 * dataClass PRIVATE_RESEARCH · productEligible: false · NOT a public surface and NOT a build input
 * (data/internal/research/nba/elo-shadow/). The official Elo, its frozen forecasts and every published lane are unchanged.
 *
 *   shadowForecastDoc   for one slate date: per upcoming game whose official v0.1 forecast is frozen, the two
 *                       pre-registered challengers (docs/NBA_ELO_WALKFORWARD_PREREGISTRATION_V2.md) computed at the
 *                       official forecast's own instant and FROZEN before tip. Write-once per game: an entry already in
 *                       the existing file is carried byte-for-byte, never recomputed; a game at or after tip is never added.
 *   challengerLedger    after finals: one row per confirmatory game (tip strictly after the approval instant, regular
 *                       season, official frozen pre-tip, shadow frozen pre-tip, official FINAL not under review), a running
 *                       n against the §7 minimum, and the verdict — null until the SINGLE look at the first build with
 *                       n ≥ 300, then frozen: carried unchanged by every later build. No interim score is computed.
 */
import {
  CHALLENGER_ID, INSEASON_CHALLENGER_ID, PREREG_DOC, APPROVED_PREREG_SHA256, PREREG_APPROVED_AT, MIN_PAIRED_N,
  historySamples, seasonSamples, challengerForecast, officialPreseasonRatings, inseasonForecast, scoreChallengers,
} from "./elo-ha-walkforward.mjs";
import { finalFor } from "./finals-record.mjs";
import { LABELS } from "./experimental-forecast.mjs";

export const SHADOW_SCHEMA = "nba-elo-shadow-forecast@1";
export const LEDGER_SCHEMA = "nba-elo-challenger-ledger@1";
const SHA = APPROVED_PREREG_SHA256[0];

const byTipThenId = (a, b) => Date.parse(a.tipUtc) - Date.parse(b.tipUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId));

/**
 * @param date            ET slate date (YYYY-MM-DD)
 * @param now             ISO instant of this build (an entry is frozen only when now < tip)
 * @param slateGames      the official v0.1 frozen forecast games of `date`
 * @param officialGames   every official v0.1 frozen forecast game of the season (start ratings + current-season samples)
 * @param corpusRows      corpus-v1 rows (the official fold's history)
 * @param finalsRecord    the season's official finals record
 * @param existing        the committed shadow file for `date`, or null
 * @returns { doc, added, refused } — `doc` depends only on its frozen entries (no build-time field), so an unchanged
 *          slate rewrites byte-identical bytes
 */
export function shadowForecastDoc({ date, now, slateGames, officialGames, corpusRows, finalsRecord, existing = null }) {
  const kept = new Map((existing?.games ?? []).map((g) => [String(g.providerEventId), g]));
  const start = officialPreseasonRatings(officialGames);
  const history = historySamples(corpusRows, { throughDateUtc: now });
  const season = seasonSamples(officialGames, finalsRecord);
  const added = [], refused = [];
  for (const g of slateGames ?? []) {
    const id = String(g.providerEventId);
    if (kept.has(id)) continue;
    if (g.label !== LABELS[2]) continue;
    if (!(Date.parse(now) < Date.parse(g.dateUtc))) { refused.push({ providerEventId: id, reason: "AT_OR_AFTER_TIP" }); continue; }
    if (!start.ok) { refused.push({ providerEventId: id, reason: start.reason }); continue; }
    const ha = challengerForecast(g, [...history, ...season]);
    const ins = inseasonForecast(g, { history, startRatings: start.ratings, finalsRecord });
    if (!ins.ok) { refused.push({ providerEventId: id, reason: ins.reason }); continue; }
    added.push({
      providerEventId: id,
      tipUtc: g.dateUtc,
      neutralSite: g.neutralSite === true,
      home: { providerTeamId: String(g.home?.providerTeamId), abbr: g.home?.abbr ?? null },
      away: { providerTeamId: String(g.away?.providerTeamId), abbr: g.away?.abbr ?? null },
      frozenAt: now,
      official: { inputAsOf: g.forecast.inputAsOf, pHome: g.forecast.elo.pHome },
      inseason: { challenger: INSEASON_CHALLENGER_ID, pHome: ins.pHome, homeAdvantage: ins.homeAdvantage, ratingHome: ins.ratingHome, ratingAway: ins.ratingAway, updates: ins.updates, fitN: ins.fit.n },
      haOnly: ha.ok ? { challenger: CHALLENGER_ID, pHome: ha.pHome, homeAdvantage: ha.homeAdvantage, fitN: ha.fit.n } : { challenger: CHALLENGER_ID, refused: ha.reason },
    });
  }
  const doc = {
    schema: SHADOW_SCHEMA,
    dataClass: "PRIVATE_RESEARCH",
    productEligible: false,
    publicSurface: false,
    note: "SHADOW — never published, never a build input; the official Elo is unchanged. Each game entry is frozen once, before its tip.",
    preregistration: { doc: PREREG_DOC, sha256: SHA },
    date,
    games: [...kept.values(), ...added].sort(byTipThenId),
  };
  return { doc, added: added.length, refused };
}

/**
 * @param shadowDocs     every committed shadow file
 * @param officialGames  every official v0.1 frozen forecast game of the season
 * @param finalsRecord   the season's official finals record
 * @param previous       the committed ledger, or null
 */
export function challengerLedger({ shadowDocs, officialGames, finalsRecord, previous = null }) {
  const opens = Date.parse(PREREG_APPROVED_AT[SHA]);
  const official = new Map();
  for (const g of officialGames ?? []) {
    if (g?.label !== LABELS[2] || !(Date.parse(g.forecast?.inputAsOf) < Date.parse(g.dateUtc))) continue;
    const id = String(g.providerEventId);
    const prev = official.get(id);
    if (!prev || Date.parse(g.forecast.inputAsOf) > Date.parse(prev.forecast.inputAsOf)) official.set(id, g);
  }
  const rows = [];
  const counts = { exploratory: 0, pendingFinal: 0, finalUnderReview: 0, noOfficial: 0, shadowNotPreTip: 0, officialMismatch: 0 };
  const seen = new Set();
  for (const doc of shadowDocs ?? []) for (const s of doc?.games ?? []) {
    const id = String(s.providerEventId);
    if (seen.has(id)) continue;
    seen.add(id);
    if (!(Date.parse(s.tipUtc) > opens)) { counts.exploratory += 1; continue; }
    const o = official.get(id);
    if (!o) { counts.noOfficial += 1; continue; }
    if (!(Date.parse(s.frozenAt) < Date.parse(s.tipUtc)) || s.tipUtc !== o.dateUtc) { counts.shadowNotPreTip += 1; continue; }
    if (s.official?.pHome !== o.forecast.elo.pHome) { counts.officialMismatch += 1; continue; }
    const fin = finalFor(finalsRecord, id);
    if (fin.state === "PENDING") { counts.pendingFinal += 1; continue; }
    if (fin.state !== "FINAL") { counts.finalUnderReview += 1; continue; }
    rows.push({ providerEventId: id, tipUtc: s.tipUtc, homeWon: fin.ftHome > fin.ftAway ? 1 : 0, official: o.forecast.elo.pHome, inseason: s.inseason?.pHome ?? null, haOnly: Number.isFinite(s.haOnly?.pHome) ? s.haOnly.pHome : null });
  }
  rows.sort(byTipThenId);
  const eligible = rows.filter((r) => Number.isFinite(r.inseason));
  const n = eligible.length;
  let verdict = previous?.verdict ?? null;
  if (verdict == null && n >= MIN_PAIRED_N) {
    const look = scoreChallengers(eligible, { preregSha256: SHA });
    verdict = { lookAtN: n, rowIds: eligible.map((r) => r.providerEventId), result: look };
  }
  return {
    schema: LEDGER_SCHEMA,
    dataClass: "PRIVATE_RESEARCH",
    productEligible: false,
    promotes: false,
    preregistration: { doc: PREREG_DOC, sha256: SHA, approvedAt: PREREG_APPROVED_AT[SHA], confirmatoryFromExclusive: PREREG_APPROVED_AT[SHA] },
    rule: "one row per confirmatory game; the verdict is computed ONCE, at the first build with n ≥ 300, then frozen and carried unchanged; no interim score is computed",
    n,
    minN: MIN_PAIRED_N,
    progress: `${n}/${MIN_PAIRED_N}`,
    counts,
    verdict,
    rows,
  };
}

/**
 * NFL RUSHING / RECEIVING v0 · GRADER + STATUSES (EXPERIMENTAL; NFL completion row C, PD 2026-11-11). PURE: no fs,
 * no clock, no network. Reuses the #1302 grader: the receipt of record (receiptsOfRecord), the verified-final rule, the
 * game-clustered bootstrap and the approval-gate pattern.
 *
 * BLIND. Before the founder approves a pre-registration for these families nothing here joins a receipt to a real
 * outcome: rushRecForwardCounts() reads receipts only, and gradeRushRec() REFUSES unless its pre-registration sha256 is
 * approved and timestamped AND every "founder to set" value in RUSH_REC_BARS is filled. Tests use synthetic rows only.
 *
 *   FAMILIES   rushAtt, rushYds, rushTd, rec, recYds, recTd (one row per receipt player row × family; OTHER excluded)
 *   MODEL      the receipt's exact run counts (simulation-receipt@2.3); TD families also accept the count PMF (@2.1).
 *              A row with neither has no model distribution (counted, never approximated from quantiles).
 *   ACTUAL     the verified final's box score; a player in the box with no field for the family recorded 0; a player
 *              absent from the box did not play (excluded, counted).
 *   BASELINE   POSITIONAL (market review §3 item 2), as proposed in the draft: the mean of the family over every
 *              earlier player-game (same season, strictly earlier week) of players at the same position (from the
 *              receipts' role shares) who had ≥ 1 opportunity (a carry for rush families, a target for receiving).
 *   METRICS    n, model MAE (|y − model median|), positional MAE, paired difference with a game-clustered 95% interval,
 *              ECE at the lines (once the founder sets them).
 */
import { BOOTSTRAP, FROM_DATE, clusteredCi, receiptsOfRecord } from "./qb-props-grade.mjs";
import { ece, empirical, fromCountPmf, pOver, quantile } from "./qb-props-scores.mjs";
import { MARKET_STATUS } from "./qb-props-markets.mjs";
import { MKT02_CHALLENGER, weekKey } from "./sim-v2/yardage-split.mjs";

export const RUSH_REC_LEDGER_SCHEMA = "gtp.nfl.rush-rec-ledger@0";
export const RUSH_REC_COUNTS_SCHEMA = "gtp.nfl.rush-rec-forward-counts@1";
/** A pre-registration value the founder has not set yet. Grading refuses while any remains. */
export const FOUNDER_TO_SET = null;

export const RUSH_REC_FAMILIES = Object.freeze([
  { family: "rushAtt", stat: "rushAtt", actual: "rushAtt", opportunity: "rushAtt", td: false },
  { family: "rushYds", stat: "rushYds", actual: "rushYds", opportunity: "rushAtt", td: false },
  { family: "rushTd", stat: "rushTd", actual: "rushTd", opportunity: "rushAtt", td: true },
  { family: "rec", stat: "rec", actual: "rec", opportunity: "targets", td: false },
  { family: "recYds", stat: "recYds", actual: "recYds", opportunity: "targets", td: false },
  { family: "recTd", stat: "recTd", actual: "recTd", opportunity: "targets", td: true },
]);
export const RUSH_REC_POSITIONS = Object.freeze(["QB", "RB", "FB", "WR", "TE"]);

/**
 * The bars. Copied from the 2026-11-09 market review §3 item 2 ("n ≥ 400 lines per family; ECE ≤ 0.03 plus MAE vs
 * positional baseline"); everything that review does not fix is FOUNDER_TO_SET.
 */
export const RUSH_REC_BARS = Object.freeze({
  minN: 400,
  eceMax: 0.03,
  maeVsPositional: "model MAE below the positional baseline's MAE",
  eceLines: FOUNDER_TO_SET, // per family, e.g. { rushYds: [...], recYds: [...], rec: [...], rushAtt: [...], rushTd: [0.5], recTd: [0.5] }
  maeComparisonRule: FOUNDER_TO_SET, // e.g. "paired 95% game-clustered CI of (model − positional) MAE excludes 0 below"
  eceAndMaeBothRequired: FOUNDER_TO_SET,
});
/** Weeks looked at, or graded descriptively, before any rush / receiving threshold exists: exploratory forever. */
export const RUSH_REC_SEEN_WEEKS = Object.freeze([5, 6, 7, 8, 9, 10]);

/** Every family starts IMPLEMENTED_EXPERIMENTAL; a status moves only by a reviewed commit after its gate. */
export const RUSH_REC_MARKET_STATUS = Object.freeze(Object.fromEntries(RUSH_REC_FAMILIES.map((f) => [f.family, MARKET_STATUS.IMPLEMENTED_EXPERIMENTAL])));

/**
 * The challenger slot: versioned challengers graded beside the incumbent on the same rows (paired: same seed, same
 * inputs), never able to change a status by itself. MKT-02 writes only when the shadow builder runs with
 * --challenger mkt02-yardage-split; no workflow does yet.
 */
export const RUSH_REC_CHALLENGERS = Object.freeze([Object.freeze({ ...MKT02_CHALLENGER, receiptDir: "data/internal/research/nfl/sim-v2/challengers/mkt02-yardage-split", registeredAt: "2026-11-11" })]);

/** sha256 of an APPROVED rush / receiving pre-registration. Empty: the draft is not approved; nothing may be graded. */
export const RUSH_REC_APPROVED_PREREG_SHA256 = Object.freeze([]);
export const RUSH_REC_PREREG_APPROVED_AT = Object.freeze({});

/** The values still unset in a bars object (names). */
export const unsetBars = (bars = RUSH_REC_BARS) => Object.entries(bars).filter(([, v]) => v === FOUNDER_TO_SET).map(([k]) => k);

/** Why grading refuses (null ⇒ it may run). */
export function rushRecGradeRefusal(preregSha256, { approvals = RUSH_REC_APPROVED_PREREG_SHA256, approvedAt = RUSH_REC_PREREG_APPROVED_AT, bars = RUSH_REC_BARS } = {}) {
  if (!(typeof preregSha256 === "string" && approvals.includes(preregSha256))) return "no approved rush / receiving pre-registration";
  if (!approvedAt[preregSha256]) return "the approved pre-registration has no approval timestamp";
  const unset = unsetBars(bars);
  if (unset.length) return `pre-registration values still founder-to-set: ${unset.join(", ")}`;
  return null;
}

const ms = (iso) => { const t = Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")); return Number.isFinite(t) ? t : null; };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
const pid = (id) => (String(id).startsWith("nfl-athlete-") ? String(id) : `nfl-athlete-${id}`);

/** The model distribution for one family from one receipt player row: exact run counts, else the count PMF for TDs. */
export function rushRecModelDist(row, f) {
  const exact = row.exactCounts?.[f.stat];
  if (exact) return empirical(exact);
  if (f.td && Array.isArray(row.countPmf?.[f.stat])) return fromCountPmf(row.countPmf[f.stat]);
  return null;
}

/** Graded receipt player rows: named players at a graded position with the family's stat in some run. */
function playerRows(receipt) {
  return (receipt.playerStatDistributions ?? []).filter((p) => p.playerId !== "OTHER" && RUSH_REC_POSITIONS.includes(p.position));
}

/**
 * COUNTS ONLY (allowed before approval): forward rows per family from the receipts of record — never a final.
 */
export function rushRecForwardCounts({ entries, from = FROM_DATE }) {
  const { records, excluded } = receiptsOfRecord(entries, { from });
  const total = Object.fromEntries(RUSH_REC_FAMILIES.map((f) => [f.family, 0]));
  const withModel = { ...total };
  for (const { receipt } of records) {
    for (const row of playerRows(receipt)) for (const f of RUSH_REC_FAMILIES) {
      if (!row.stats?.[f.stat]) continue;
      total[f.family] += 1;
      if (rushRecModelDist(row, f)) withModel[f.family] += 1;
    }
  }
  return { schema: RUSH_REC_COUNTS_SCHEMA, receiptsOfRecord: records.length, excluded, total, withModelDistribution: withModel, statuses: RUSH_REC_MARKET_STATUS };
}

/**
 * The positional baseline for one family: mean over earlier player-games (same season, strictly earlier week) at the
 * position, among players with ≥ 1 opportunity. `positions`: playerId → position. Null with fewer than 2 player-games.
 */
export function positionalBaseline(games, positions, { season, key, position, f }) {
  const xs = [];
  for (const g of games) {
    if (g.season !== season || !(weekKey(g.season, g.seasonType ?? 2, g.week) < key)) continue;
    for (const p of g.players ?? []) {
      if (positions.get(p.playerId) !== position || !((p[f.opportunity] ?? 0) >= 1)) continue;
      xs.push(p[f.actual] ?? 0);
    }
  }
  return xs.length >= 2 ? { kind: "positional", mean: mean(xs), n: xs.length } : null;
}

/**
 * Grade (ONLY under an approved, fully set pre-registration). Throws REFUSED otherwise — before reading any outcome
 * argument. `games`: player-events-v1 games; `verified`: eventId → { teamPassYds } (the #1302 settlement cross-check);
 * `positions`: playerId → position.
 */
export function gradeRushRec({ entries, games, verified, positions, approvedAt = null, from = FROM_DATE, preregSha256 = null, approvals = RUSH_REC_APPROVED_PREREG_SHA256, approvalTimes = RUSH_REC_PREREG_APPROVED_AT, bars = RUSH_REC_BARS }) {
  const refused = rushRecGradeRefusal(preregSha256, { approvals, approvedAt: approvalTimes, bars });
  if (refused) throw new Error(`REFUSED: ${refused}`);
  const { records, excluded } = receiptsOfRecord(entries, { from });
  const gameById = new Map(games.map((g) => [String(g.providerEventId), g]));
  const counts = { eventsWithReceipt: records.length, ...excluded, notFinal: 0, unverifiedFinal: 0, didNotPlay: 0 };
  const rows = [];
  const seen = new Set();
  for (const { file, receipt } of records) {
    const id = String(receipt.eventId);
    const g = gameById.get(id);
    const v = verified.get(id);
    if (!g || !v) { counts.notFinal += 1; continue; }
    const teamPass = (team) => g.players.filter((p) => p.teamAbbr === team && p.passAtt != null).reduce((a, p) => a + (p.passYds ?? 0), 0);
    if (Object.entries(v.teamPassYds ?? {}).some(([team, y]) => y !== teamPass(team))) { counts.unverifiedFinal += 1; continue; }
    const key = weekKey(g.season, g.seasonType ?? 2, g.week);
    for (const row of playerRows(receipt)) {
      const playerId = pid(row.playerId);
      const actual = g.players.find((p) => p.playerId === playerId) ?? null;
      if (!actual) { counts.didNotPlay += 1; continue; }
      const k = `${id}|${row.team}|${playerId}`;
      if (seen.has(k)) throw new Error(`REFUSED: duplicate player-game outcome ${k}`);
      seen.add(k);
      const seenWeek = g.season === 2026 && RUSH_REC_SEEN_WEEKS.includes(g.week);
      const confirmatory = approvedAt != null && ms(receipt.eventStart) > ms(approvedAt) && !seenWeek;
      rows.push({
        eventId: id, season: g.season, week: g.week, team: row.team, playerId, position: row.position, receipt: file, eventStart: receipt.eventStart,
        window: confirmatory ? "CONFIRMATORY" : seenWeek ? "EXPLORATORY_SEEN_WEEKS_5_10" : "EXPLORATORY", confirmatory,
        families: Object.fromEntries(RUSH_REC_FAMILIES.map((f) => {
          if (!row.stats?.[f.stat]) return [f.family, null];
          const y = actual[f.actual] ?? 0;
          const d = rushRecModelDist(row, f);
          const base = positionalBaseline(games, positions, { season: g.season, key, position: row.position, f });
          const lines = bars.eceLines?.[f.family] ?? [];
          const model = d ? { median: quantile(d, 0.5), absError: Math.abs(y - quantile(d, 0.5)), pOver: Object.fromEntries(lines.map((l) => [l, pOver(d, l)])) } : null;
          return [f.family, { actual: y, model, positional: base ? { mean: r4(base.mean), absError: r4(Math.abs(y - base.mean)), n: base.n } : null }];
        })),
      });
    }
  }
  return { rows, counts };
}

/** Metrics for one family over a set of graded rows. */
export function rushRecFamilyMetrics(rows, family, bars = RUSH_REC_BARS) {
  const xs = rows.map((r) => ({ eventId: r.eventId, f: r.families[family] })).filter((x) => x.f?.model);
  const paired = xs.filter((x) => x.f.positional);
  const byGame = new Map();
  for (const x of paired) (byGame.get(x.eventId) ?? byGame.set(x.eventId, []).get(x.eventId)).push(x.f.model.absError - x.f.positional.absError);
  const lines = bars.eceLines?.[family] ?? [];
  return {
    n: xs.length, pairedN: paired.length, games: new Set(xs.map((x) => x.eventId)).size,
    noModelDistribution: rows.filter((r) => r.families[family] && !r.families[family].model).length,
    modelMae: r4(mean(xs.map((x) => x.f.model.absError))),
    positionalMae: paired.length ? r4(mean(paired.map((x) => x.f.positional.absError))) : null,
    modelMinusPositionalMae: paired.length ? r4(mean(paired.map((x) => x.f.model.absError - x.f.positional.absError))) : null,
    modelMinusPositionalCi95: clusteredCi(byGame),
    bootstrap: BOOTSTRAP,
    ece: Object.fromEntries(lines.map((l) => [l, r4(ece(xs.map((x) => ({ p: x.f.model.pOver[l], y: x.f.actual > l ? 1 : 0 }))))])),
  };
}

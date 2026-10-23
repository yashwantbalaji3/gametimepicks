/**
 * HOMER NUKES · PUBLIC RECORD vs PUBLICATION STATUS UNKNOWN (release owner 2026-10-23, after the A-T07 provenance
 * audit). Pure.
 *
 * THE DEFECT. The forecast-provenance audit (docs/audits/FORECAST_RECORD_PROVENANCE_2026-10-23.md) found 15 graded
 * Homer Nukes picks for which NO revision of the day file carrying the exact graded probability was both generated
 * and committed before first pitch. Nothing shows those probabilities were public before the game, yet /homer-nukes
 * counted them in its track record and its "N of M graded picks homered against X expected" line.
 *
 * THE RULE — the same one /results applies to MLB game calls (mlb-call-publication.mjs): a row whose publication
 * before the start cannot be established is never counted in a public record. It stays on the record, graded, in its
 * own "publication status unknown (legacy)" population. Nothing is regraded or deleted.
 *
 * ONE SOURCE. Which picks are unknown is the Universal Forecast Ledger's own provenance verdict — no pre-start
 * publication evidence (`hasPrestartPublicationEvidence`, below) on the `mlb_homer_nukes` rows — the same predicate
 * the Forecast Record uses to leave such rows out of its scores. This module only matches those rows to the settled picks and splits the counts the settlement owner wrote.
 * Over all picks it reproduces homer-nukes/record.json exactly (pinned in the test), so it is a split, not a fork.
 */
import { fieldProvenance, PROVENANCE_STATE } from "../forecast-ledger/provenance.mjs";

/*
 * THE PREDICATE IS THE FORECAST RECORD'S: `hasPrestartPublicationEvidence` in provenance.mjs (the export owner's
 * claude/forecast-unpublished-unscored) — publishedAt and eventStart both known (RECEIPT or GIT_HISTORY) and
 * publishedAt < eventStart. It is not on main yet, and the bundler refuses even a guarded read of a missing export, so
 * the same rule is written here over `fieldProvenance`; the test compares the two row for row as soon as main has
 * the export, so /homer-nukes and the Forecast Record cannot count differently. Swap to the import once it merges.
 */
export function prestartEvidenceFallback(row) {
  const pub = fieldProvenance(row, "publishedAt");
  const start = fieldProvenance(row, "eventStart");
  if (pub.state === PROVENANCE_STATE.LEGACY_UNKNOWN || start.state === PROVENANCE_STATE.LEGACY_UNKNOWN) return false;
  return Number.isFinite(Date.parse(pub.value)) && Number.isFinite(Date.parse(start.value)) && Date.parse(pub.value) < Date.parse(start.value);
}
const hasPrestartPublicationEvidence = prestartEvidenceFallback;

export const HOMER_NUKES_FAMILY = "mlb_homer_nukes";

/** A settled pick's identity: its slate date, game and player. */
export const homerNukesKey = (date, gamePk, playerId) => `${date}|${gamePk}|${playerId}`;

/**
 * The settled picks whose publication before first pitch the ledger cannot establish (no pre-start evidence).
 * @param {Array<Record<string, any>>} ledgerRows  Forecast Ledger rows (any sports / families)
 * @returns {Set<string>} homerNukesKey()s
 */
export function unknownPublicationKeys(ledgerRows) {
  const out = new Set();
  for (const r of ledgerRows ?? []) {
    if (r?.family !== HOMER_NUKES_FAMILY) continue;
    if (hasPrestartPublicationEvidence(r)) continue;
    const date = /settled-(\d{4}-\d{2}-\d{2})\.json/.exec(String(r.receiptId ?? ""))?.[1];
    const player = /(\d+)$/.exec(String(r.subjectId ?? ""))?.[1];
    if (date && player && r.eventId != null) out.add(homerNukesKey(date, String(r.eventId), player));
  }
  return out;
}

const empty = () => ({ gradedPicks: 0, actual: 0, predicted: 0, sq: 0 });
const close = (c) => ({
  gradedPicks: c.gradedPicks, actual: c.actual,
  predicted: Math.round(c.predicted * 1e4) / 1e4,
  brier: c.gradedPicks ? Math.round((c.sq / c.gradedPicks) * 1e4) / 1e4 : null,
});

/**
 * Split the settled record. Graded = the owner's `result` is "hit" or "miss"; an ungraded pick is in no denominator.
 * @param {Array<{ date: string, picks?: Array<{ playerId?: number|string, gamePk?: number|string, player?: string, probability?: number, result?: string }> }>} settledDays
 * @param {Set<string>} unknown  unknownPublicationKeys()
 */
export function homerNukesRecordSplit(settledDays, unknown) {
  const pub = empty();
  const unk = empty();
  const days = [];
  const unknownPicks = [];
  for (const d of [...(settledDays ?? [])].sort((a, b) => String(b.date).localeCompare(String(a.date)))) {
    const day = { date: d.date, graded: 0, hits: 0, unknownGraded: 0, unknownHits: 0 };
    for (const p of d.picks ?? []) {
      if (p?.result !== "hit" && p?.result !== "miss") continue;
      const y = p.result === "hit" ? 1 : 0;
      const isUnknown = unknown.has(homerNukesKey(d.date, String(p.gamePk), String(p.playerId)));
      const c = isUnknown ? unk : pub;
      c.gradedPicks += 1; c.actual += y;
      if (typeof p.probability === "number") { c.predicted += p.probability; c.sq += (p.probability - y) ** 2; }
      if (isUnknown) { day.unknownGraded += 1; day.unknownHits += y; unknownPicks.push({ date: d.date, player: p.player ?? null, gamePk: p.gamePk ?? null, probability: p.probability ?? null, result: p.result }); }
      else { day.graded += 1; day.hits += y; }
    }
    days.push(day);
  }
  return { public: { ...close(pub), slates: days.length, days }, unknown: { ...close(unk), picks: unknownPicks } };
}

/**
 * Reality-gated watches — work whose next receipt only REALITY can supply (Program 162 · Release C).
 *
 * A watch is not a blocker and not idle time: each card names the next observation moment, the
 * evidence to inspect when it arrives, and the productive work that can proceed before then. The
 * board renders these in their own REALITY_GATED state so a time-gated receipt can never be
 * confused with a stalled engineering card — and none of them may ever be closed by anything other
 * than the named real-world evidence landing in a committed artifact.
 *
 * `withCountdown(nowIso)` is the only clock-aware view and takes its clock as a parameter; the
 * data itself is committed and pure.
 */

export const WATCHES_VERSION = 1;

export const REALITY_GATED_WATCHES = Object.freeze([
  {
    id: "watch-nfl-first-joined-final",
    sport: "nfl",
    title: "NFL · first JOINED preseason final flows through the deployed results path (DET@CIN)",
    observeAtUtc: "2026-08-14T14:15:00Z", // DET@CIN kicks 2026-08-13T23:00Z; the final can only LAND in the artifact via the 13:00 UTC cadence (observed drift ~14:11) — the watch opens when evidence can exist, not when the game ends
    evidenceToInspect: "public/data/nfl/results/latest.json after the Aug 14 cadence run — expect state RESULTS with 401873272 JOINED (not quarantined) and reconciliation exact. Precedent: the first captured final (CAR@ARI 33-30, Aug 7) correctly QUARANTINED for missing pre-event schedule lineage (captures began Aug 9) — the lineage gate is proven live; DET@CIN has pre-event lineage in four committed captures, so it must join",
    productiveBefore: "results-correction monitoring and injury-input source evaluation proceed now; nothing about the join waits",
  },
  {
    id: "watch-epl-first-ft",
    sport: "epl",
    title: "EPL · first real full-time result of 2026-27 (opening day)",
    observeAtUtc: "2026-08-21T21:00:00Z", // opener Coventry City at Arsenal 19:00Z + 2h
    evidenceToInspect: "public/data/soccer/epl/results/latest.json — PRESEASON must flip to RESULTS via the scheduled capture with canonical join and zero quarantines; friendlies never grade",
    productiveBefore: "correction runbook and settlement corruption cases can harden now against prior-season shapes",
  },
  {
    id: "watch-ufc-aug29-card",
    sport: "ufc",
    title: "UFC · Aug-29 card: results availability + post-card grading",
    observeAtUtc: "2026-08-30T09:00:00Z", // ~1h after the post-card job (08:00) following the Aug-29 card — with the in-job results refresh it grades the morning after
    evidenceToInspect: "model-vs-market/summary.json reconciliation for 2026-08-29 (frozen 6+ = graded + void + pending, pending → 0), lane status postCardLag CLEAR, cumulative block includes the card; lineage receipts (data/internal/research/ufc/lineage/) show any late replacement was recorded the day it happened",
    productiveBefore: "the pre-card loop is fully receipted (population-exact, lineage NO_CHANGE cadence, prices under the receipt, snapshot armed); nothing waits on the card",
  },
  {
    id: "watch-daily-cadence",
    sport: "shared",
    title: "Daily sport-schedules cadence (4 schedules + NFL/NBA/EPL results steps)",
    observeAtUtc: "2026-08-13T14:15:00Z", // cron 13:00 UTC, observed drift ~14:11; Aug 12 run 31605451090 VERIFIED (10 classes, zero failures)
    evidenceToInspect: "ONE COMMAND after pulling the run's commits: npx tsx scripts/ops/verify-cadence-receipts.mjs --run <id> --before <pre-pull sha> — per-sport verdicts against committed expectations (P163-C); plus the run's own step log for discard-day acquisition proof",
    productiveBefore: "everything — the cadence needs no attendance, only next-day verification",
  },
  {
    id: "watch-nba-first-joined-final",
    sport: "nba",
    title: "NBA · first joined final (preseason opener MIA@TOR)",
    observeAtUtc: "2026-10-04T04:00:00Z", // 2026-10-03T23:00Z tip + capture on the next cadence run
    evidenceToInspect: "public/data/nba/results/latest.json — OFF_SEASON (or NO_RESULTS_YET in-season) must flip to RESULTS with seasonType 1 preserved and population-exact reconciliation",
    productiveBefore: "injuries/lineups source evaluation and settlement corruption hardening proceed through the off-season",
  },
]);

/** Clock-aware view: sorted soonest-first with due flags. Pure — the clock is a parameter. */
export function withCountdown(nowIso) {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) throw new Error("withCountdown: nowIso required");
  return [...REALITY_GATED_WATCHES]
    .map((w) => {
      const at = Date.parse(w.observeAtUtc);
      const hours = (at - now) / 3_600_000;
      // due = the observation window opened; overdue = it opened >24h ago and nobody recorded the
      // result — an ops-hygiene state distinct from DUE, so a missed inspection cannot rot quietly.
      return { ...w, due: hours <= 0, overdue: hours <= -24, hoursUntil: Number(hours.toFixed(1)) };
    })
    .sort((a, b) => Date.parse(a.observeAtUtc) - Date.parse(b.observeAtUtc));
}

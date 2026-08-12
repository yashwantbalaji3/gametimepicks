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
    title: "NFL · first JOINED preseason final flows through the deployed results path",
    observeAtUtc: "2026-08-14T03:30:00Z", // DET@CIN kicks 2026-08-13T23:00Z; final expected ~3.5h later, captured by the next cadence run
    evidenceToInspect: "public/data/nfl/results/latest.json after the Aug 14 cadence run — expect state RESULTS with the final joined (not quarantined) and reconciliation exact",
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
    id: "watch-ufc-replacement-lineage",
    sport: "ufc",
    title: "UFC · replacement/cancellation lineage from a real card change",
    observeAtUtc: "2026-08-16T14:15:00Z", // post-UFC-330 capture (card Aug 15) — the Aug 12 post-card observation recorded a valid NO-CHANGE lineage receipt (zero replacements)
    evidenceToInspect: "consecutive ufc/schedule captures diffed via classifyUfcLineage — a swap/removal-with-status is the receipt; the Aug 12 observation classified 66 window-slides + 17 UNCHANGED with zero replacements (valid no-change)",
    productiveBefore: "UFC 330 (Makhachev vs Machado Garry, Aug 15) is the next real replacement-risk window; nothing waits on it",
  },
  {
    id: "watch-daily-cadence",
    sport: "shared",
    title: "Daily sport-schedules cadence (4 schedules + NFL/NBA/EPL results steps)",
    observeAtUtc: "2026-08-12T14:15:00Z", // cron 13:00 UTC with observed drift to ~14:11
    evidenceToInspect: "ONE COMMAND after pulling the run's commits: npx tsx scripts/ops/verify-cadence-receipts.mjs --run <id> --before <pre-pull sha> — per-sport verdicts against committed expectations (P163-C); plus the run's own step log for discard-day acquisition proof",
    productiveBefore: "everything — the cadence needs no attendance, only next-day verification",
  },
  {
    id: "watch-nba-first-joined-final",
    sport: "nba",
    title: "NBA · first joined final (preseason opener MIA@TOR)",
    observeAtUtc: "2026-10-04T04:00:00Z", // 2026-10-03T23:00Z tip + capture on the next cadence run
    evidenceToInspect: "public/data/nba/results/latest.json — NO_RESULTS_YET must flip to RESULTS with seasonType 1 preserved and population-exact reconciliation",
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
      return { ...w, due: hours <= 0, hoursUntil: Number(hours.toFixed(1)) };
    })
    .sort((a, b) => Date.parse(a.observeAtUtc) - Date.parse(b.observeAtUtc));
}

/**
 * CRON-PUNCTUALITY CORE — a run that happened is not a run that happened on time.
 *
 * WHY THIS EXISTS SEPARATELY FROM cron-slots.mjs. That module asks whether a slot got a run, with a
 * deliberately generous ±2h tolerance so that GitHub's best-effort scheduler would not be reported
 * as an outage. The tolerance was the right call and it is also the blind spot: from 2026-08-27 the
 * whole repo's scheduled dispatch drifted to 2.5–5 HOURS late, and a drift larger than the
 * tolerance comes out of that module labelled MISSED — indistinguishable from "never fired". So the
 * board showed missed slots, everyone read them as GitHub's usual flakiness, and the real condition
 * — the morning band arriving after lunch, every single day — had no name and no number for three
 * weeks. Meanwhile publication-slo stayed green throughout, because it asks whether the board beats
 * the first pitch (~19:00 ET) and a 13:00 ET board does.
 *
 * Neither instrument was wrong. They answer "did it run?" and "did it beat the deadline?". Nobody
 * was answering "did it arrive when we told readers it would", so this module answers exactly that
 * and nothing else.
 *
 * ATTRIBUTION IS THE HARD PART, AND IT REFUSES RATHER THAN GUESSES. To measure a delay you must know
 * which slot a run belongs to. For a once-daily workflow that is unambiguous: the slots are 24h
 * apart, so a run four hours after the 13:30 slot is obviously that slot's run, late. For a workflow
 * that fires hourly it is genuinely undecidable — a run at 22:05 could be the 22:00 slot five
 * minutes late or the 21:00 slot sixty-five minutes late, and there is no evidence in the run list
 * that separates them. So attribution is capped by the gap to the NEXT slot, and any workflow whose
 * gap is smaller than the delays we are trying to measure is reported `attributable: false` with no
 * delay figure at all.
 *
 * That refusal matters more than the measurement. The first version of this analysis took the
 * minimum distance to any expected slot, which made the hourly workflows look punctual (5m, 50m)
 * while the once-daily ones showed 200m+ — and the obvious reading of that table, that the problem
 * was confined to a few morning jobs, was an artifact of the arithmetic. Every once-daily workflow
 * in the repo was 2.5–5h late; the hourly ones simply could not be measured.
 *
 * Pure and clock-injected: every function takes its time bounds, so the tests do not depend on when
 * they run.
 */

/** Delay bands, in minutes. Chosen from the pre-drift baseline, not from the drift. */
export const PUNCTUALITY_BANDS = Object.freeze({
  /* Aug 22–26, before the drift: morning-projections fired 19–41 min after its slot. Sub-hour
     lateness is what GitHub's scheduler has always cost this repo and is not a finding. */
  ON_TIME_MAX_MIN: 60,
  /* Beyond an hour the schedule is no longer describing when things happen, but a reader is
     unlikely to notice a 90-minute board. */
  DEGRADED_MAX_MIN: 120,
  /* Past two hours a morning job is not a morning job. This is also cron-slots' tolerance, which
     is where a late run starts being reported as an absent one. */
});

/**
 * The longest a run may arrive after its slot and still be counted as that slot's run.
 *
 * ONE VALUE SERVES TWO PURPOSES, AND IT HAS TO. It caps attribution (a run later than this belongs
 * to no slot) and it sets when an unserved slot is finally declared missed. Using two different
 * numbers here is a real bug: judge at 2h and attribute up to 24h, and a run arriving at 4h gets
 * credited to a slot the board already called MISSED, so the same slot holds two answers.
 *
 * Eight hours is chosen to sit clearly beyond the worst drift observed here (313 min) so that a
 * late run is still recognised as late rather than flipping to missed, while keeping the newest
 * row on the board judgeable the same day. Capping also fixes the opposite failure: with a daily
 * job's natural 24h gap as the horizon, TODAY is never judgeable and the board is permanently a
 * day stale — which is how an instrument ends up unable to report the outage it is watching for.
 */
export const MAX_ATTRIBUTION_MS = 8 * 3600_000;

/** The horizon actually used: the schedule's own gap, never longer than we are willing to wait. */
export function effectiveHorizonMs(slots) {
  return Math.min(attributionHorizonMs(slots), MAX_ATTRIBUTION_MS);
}

/**
 * Classify one delay. `null` delay means the slot got no run at all.
 *
 * MISSED and SEVERE are deliberately different words for different facts. A slot with no run is a
 * job that did not happen; a slot whose run arrived five hours late is a job that happened at the
 * wrong time. Conflating them is the bug this module exists to fix, so it never re-conflates them.
 */
export function classifyDelay(delayMin) {
  if (delayMin === null || delayMin === undefined) return "MISSED";
  if (!Number.isFinite(delayMin)) return "UNKNOWN";
  if (delayMin <= PUNCTUALITY_BANDS.ON_TIME_MAX_MIN) return "ON_TIME";
  if (delayMin <= PUNCTUALITY_BANDS.DEGRADED_MAX_MIN) return "DEGRADED";
  return "SEVERE";
}

/**
 * The largest delay this workflow's schedule can express without ambiguity.
 *
 * Returns the smallest gap between consecutive expected slots. A run later than this cannot be
 * attributed to a slot, because the next slot's run is an equally good explanation.
 *
 * Fewer than two slots means no gap can be computed. That is `Infinity`, not zero: a single
 * observed slot places no upper bound on attribution, and returning 0 would silently mark every
 * such workflow unmeasurable.
 */
export function attributionHorizonMs(slots) {
  if (!Array.isArray(slots) || slots.length < 2) return Infinity;
  const sorted = [...slots].sort((a, b) => a - b);
  let min = Infinity;
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > 0 && gap < min) min = gap;
  }
  return min;
}

/**
 * Pair each expected slot with the run that served it, and report the delay.
 *
 * Greedy and in order: a run serves the earliest unserved slot it could belong to. A run is never
 * claimed twice, so a workflow that fired once for two slots reports one served slot and one missed
 * one rather than crediting the same run to both.
 *
 * `nowMs` excludes slots too recent to judge — a slot whose horizon has not yet elapsed has not
 * been missed, it just has not happened yet, and reporting it would put a permanent false finding
 * on the newest row of every board.
 */
export function attributeRuns(slots, runMs, { nowMs, horizonMs } = {}) {
  const sortedSlots = [...(slots ?? [])].sort((a, b) => a - b);
  const runs = [...(runMs ?? [])].sort((a, b) => a - b);
  const horizon = Number.isFinite(horizonMs) ? horizonMs : effectiveHorizonMs(sortedSlots);
  const used = new Set();
  const out = [];

  for (const slot of sortedSlots) {
    // Not judgeable yet: the run may still be coming.
    if (Number.isFinite(nowMs) && Number.isFinite(horizon) && slot > nowMs - horizon) continue;

    let served = null;
    for (let i = 0; i < runs.length; i += 1) {
      if (used.has(i)) continue;
      const r = runs[i];
      if (r < slot) continue;
      if (Number.isFinite(horizon) && r - slot > horizon) break;
      served = i;
      break;
    }

    if (served === null) {
      out.push({ slotMs: slot, runMs: null, delayMin: null, state: "MISSED" });
    } else {
      used.add(served);
      const delayMin = Math.round((runs[served] - slot) / 60000);
      out.push({ slotMs: slot, runMs: runs[served], delayMin, state: classifyDelay(delayMin) });
    }
  }
  return out;
}

/** Median of a numeric list, or null when empty. Even-length takes the lower middle — this feeds an
 *  alarm threshold, and interpolating invents a delay nobody observed. */
export function median(values) {
  const v = [...(values ?? [])].filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.floor((v.length - 1) / 2)];
}

/**
 * Summarise one workflow.
 *
 * `attributable` is the honest gate. A workflow whose slots are closer together than
 * `PUNCTUALITY_BANDS.DEGRADED_MAX_MIN` cannot distinguish a punctual run from a badly late one, so
 * it reports no delay rather than a flattering one. Its slots still count toward `missed`, because
 * "no run at all within the horizon" stays decidable however tight the schedule is.
 */
export function summariseWorkflow({ workflow, crons, slots, runMs, nowMs }) {
  // `attributable` is judged on the schedule's OWN gap, not the capped horizon: whether two runs
  // can be told apart is a property of how often the workflow fires, not of how long we wait.
  const gap = attributionHorizonMs(slots);
  const minGapMin = Number.isFinite(gap) ? Math.round(gap / 60000) : null;
  const attributable = !Number.isFinite(gap) || minGapMin > PUNCTUALITY_BANDS.DEGRADED_MAX_MIN;
  const runs = [...(runMs ?? [])];
  const pairs = attributeRuns(slots, runs, { nowMs, horizonMs: effectiveHorizonMs(slots) });
  const served = pairs.filter((p) => p.runMs !== null);
  const delays = served.map((p) => p.delayMin);

  /*
   * COVERAGE, NOT MISSES, FOR THE WORKFLOWS WE CANNOT ATTRIBUTE.
   *
   * The first version of this function reported `missedSlots` for every workflow, and on the real
   * fleet that produced 221 "missed" slots — a number that was pure arithmetic. A workflow firing
   * every 30 minutes gets a 30-minute horizon, so during a 4-hour drift NO run lands close enough
   * to any slot to be attributed, and every slot reads MISSED even though every run happened. That
   * is precisely the late-vs-absent conflation this module was written to end, reintroduced one
   * layer up.
   *
   * A slot-level answer is genuinely unavailable at this cadence. A window-level one is not: count
   * the scheduled runs against the slots expected in the same window. It cannot say WHICH slot went
   * unserved, and it does not pretend to — but a workflow that owed 77 runs and produced 3 is an
   * outage by any reading, and one that produced 75 is fine however the pairing shakes out.
   */
  const judgeableSlots = pairs.length;
  const coverage = judgeableSlots > 0 ? Math.min(1, runs.length / judgeableSlots) : null;

  return {
    workflow,
    crons,
    minGapMinutes: minGapMin,
    attributable,
    judgedSlots: judgeableSlots,
    servedSlots: attributable ? served.length : null,
    // null, not 0: "we cannot tell" is a different claim from "none were missed".
    missedSlots: attributable ? judgeableSlots - served.length : null,
    observedRuns: runs.length,
    coverageRatio: coverage === null ? null : Math.round(coverage * 100) / 100,
    medianDelayMinutes: attributable ? median(delays) : null,
    maxDelayMinutes: attributable && delays.length ? Math.max(...delays) : null,
    state: attributable
      ? classifyDelay(median(delays))
      : coverage !== null && coverage < 0.5
        ? "UNDER_COVERED"
        : "NOT_ATTRIBUTABLE",
    samples: attributable
      ? pairs.slice(-5).map((p) => ({
          slot: new Date(p.slotMs).toISOString(),
          run: p.runMs === null ? null : new Date(p.runMs).toISOString(),
          delayMinutes: p.delayMin,
          state: p.state,
        }))
      : [],
  };
}

/**
 * Roll the per-workflow rows into one verdict.
 *
 * The verdict is driven by the MEASURABLE rows only, and by their median rather than their worst.
 * One workflow having one bad morning is GitHub being GitHub; the median of every once-daily job in
 * the repo sitting past two hours is a different claim, and it is the one that was true here and
 * had nobody making it.
 */
export function rollUp(rows) {
  const measurable = rows.filter((r) => r.attributable && r.medianDelayMinutes !== null);
  const medians = measurable.map((r) => r.medianDelayMinutes);
  const fleetMedian = median(medians);
  // Only attributable rows contribute a miss count. Summing `null` as zero would quietly restate
  // "we cannot tell" as "nothing was missed" — the flattering direction, and the wrong one.
  const missedTotal = rows.reduce((n, r) => n + (Number.isFinite(r.missedSlots) ? r.missedSlots : 0), 0);
  const underCovered = rows.filter((r) => r.state === "UNDER_COVERED").map((r) => r.workflow);
  return {
    measurableWorkflows: measurable.length,
    unmeasurableWorkflows: rows.length - measurable.length,
    fleetMedianDelayMinutes: fleetMedian,
    worstWorkflow: measurable.length
      ? measurable.reduce((a, b) => (b.medianDelayMinutes > a.medianDelayMinutes ? b : a)).workflow
      : null,
    missedTotal,
    underCoveredWorkflows: underCovered,
    state: fleetMedian === null ? "UNKNOWN" : classifyDelay(fleetMedian),
  };
}

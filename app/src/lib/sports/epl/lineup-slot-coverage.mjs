/**
 * DOES EVERY KICKOFF CLUSTER HAVE A SLOT CLOSE ENOUGH TO SEE A LINEUP?
 *
 * The EPL player model has two modes and they are not equivalent. Before a lineup is published it
 * can only answer a CONDITIONAL question — P(scores | he starts) — because it does not know who is
 * playing. Once ESPN posts the XI, the match simulation allocates the team's goal distribution
 * across the named eleven, and the player rows become coherent with the team forecast by
 * construction: the shares sum to one, so the players sum to the team.
 *
 * That upgrade is entirely a function of WHEN THE JOB RUNS. Lineups appear about an hour before
 * kickoff. A refresh three hours early is not early — it is a run that can never produce the real
 * product, and it looks identical in the logs to one that can. Matchweek 1 already lost every
 * fixture but one to this shape: a Thursday capture was 36 hours stale by the Friday opener, the
 * engine worked perfectly, and it published nothing.
 *
 * So the coverage is derived and checked rather than eyeballed. Clusters come from the COMMITTED
 * FIXTURE CAPTURE — never the weekday, which goes quiet in exactly the weeks a schedule is unusual
 * — and slots come from the WORKFLOW'S OWN CRON LINES, never a second copy of the cadence kept here
 * that would drift from the real one silently.
 *
 * WHAT THIS CANNOT PROVE. A cron is a request, not a promise: GitHub's scheduler is best-effort
 * and has drifted well over an hour in this repository. A covered cluster is one whose refresh was
 * ASKED FOR in the right window, and a late fire is refused by the engine rather than published
 * against a match already under way. Coverage is a precondition, not a receipt.
 */

/** Crons of the form `- cron: "M H * * D"`. Anything else is deliberately not matched. */
export function parseCronSlots(workflowSrc) {
  return [...String(workflowSrc ?? "").matchAll(/-\s*cron:\s*"(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+(\d)"/g)]
    .map((m) => ({ minute: Number(m[1]), hour: Number(m[2]), dow: Number(m[3]) }));
}

/**
 * Distinct kickoff instants in a window, with how many fixtures share each.
 * Three matches at 14:00 are ONE cluster: one refresh serves all three, and counting them as three
 * would report a single uncovered slot as three separate failures.
 */
export function kickoffClusters(fixtures, { fromIso, toIso }) {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  const byInstant = new Map();
  for (const f of fixtures ?? []) {
    const t = Date.parse(f?.kickoffIso ?? "");
    if (!Number.isFinite(t) || t < from || t > to) continue;
    if (!byInstant.has(t)) byInstant.set(t, []);
    byInstant.get(t).push(f.eventId ?? null);
  }
  return [...byInstant.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, ids]) => ({ kickoffIso: new Date(t).toISOString(), kickoffMs: t, fixtures: ids.length, eventIds: ids }));
}

/**
 * The latest instant this weekly slot fires at or before `kickoffMs`, or null within a week.
 *
 * Walks back day by day rather than assuming the slot is on the kickoff's own weekday. An early
 * kickoff can legitimately be served by a slot the previous evening, and hard-coding same-day would
 * silently report such a cluster as uncovered — the kind of assumption that holds for the current
 * fixture list and breaks the first time a schedule is unusual.
 */
export function latestSlotBefore(kickoffMs, slot) {
  const k = new Date(kickoffMs);
  for (let back = 0; back <= 7; back += 1) {
    const d = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - back, slot.hour, slot.minute, 0, 0));
    if (d.getUTCDay() === slot.dow && d.getTime() <= kickoffMs) return d.getTime();
  }
  return null;
}

/**
 * Per cluster: the closest preceding slot, its lead in hours, and whether that lead is inside the
 * window in which a lineup can exist.
 *
 * `maxLeadHours` defaults to 2. Lineups land around T-1h, so a slot at T-2h may still miss one —
 * the bound is the outer limit of "could plausibly see it", not a promise that it did. A lead of
 * exactly zero is NOT coverage: a run at kickoff is refused by the engine, correctly.
 */
export function lineupSlotCoverage(clusters, slots, { maxLeadHours = 2 } = {}) {
  const rows = (clusters ?? []).map((c) => {
    let best = null;
    for (const s of slots ?? []) {
      const at = latestSlotBefore(c.kickoffMs, s);
      if (at == null) continue;
      const leadHours = (c.kickoffMs - at) / 3_600_000;
      if (leadHours <= 0) continue;
      if (best == null || leadHours < best.leadHours) best = { leadHours, slot: s, atIso: new Date(at).toISOString() };
    }
    return {
      kickoffIso: c.kickoffIso,
      fixtures: c.fixtures,
      nearestLeadHours: best ? Number(best.leadHours.toFixed(2)) : null,
      nearestSlotIso: best?.atIso ?? null,
      covered: Boolean(best && best.leadHours <= maxLeadHours),
    };
  });
  const uncovered = rows.filter((r) => !r.covered);
  return {
    maxLeadHours,
    clusters: rows,
    coveredClusters: rows.length - uncovered.length,
    totalClusters: rows.length,
    // Fixtures, not clusters, is the number that matters to a reader: one uncovered 14:00 slot is
    // three matches without a lineup-aware simulation, and reporting it as "1 gap" understates it.
    uncoveredFixtures: uncovered.reduce((n, r) => n + r.fixtures, 0),
    uncovered,
  };
}

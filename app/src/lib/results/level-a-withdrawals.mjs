/**
 * RESULTS · LEVEL A CARDS WITHDRAWN BEFORE START (release owner 2026-10-26). Pure.
 *
 * The Level A recorder appends to its own withdrawn.jsonl (lib/products/level-a/record.mjs, gtp.level-a.withdrawal@1)
 * when a recorded card stops being served before its publication cutoff, and a `reinstated` event when it is served
 * again. An entry whose LATEST event (file order is append order) is `withdrawn` gets a note — when it was served,
 * servedFrom → firstNotServedFrom — that the page shows beside the card.
 *
 * A NOTE, NEVER A RE-GRADE. This module only annotates the view lib/results/level-a-record.mjs already built: the
 * record module never reads the withdrawal file (level-a-withdrawals.test pins that), so no count, grade or
 * denominator can depend on it. The card was shown, so it is graded exactly as recorded.
 */

/** id → the latest `withdrawn` event, for entries not reinstated since. */
export function latestWithdrawals(events) {
  const latest = new Map();
  for (const w of events ?? []) if (w?.id && (w.event === "withdrawn" || w.event === "reinstated")) latest.set(w.id, w);
  return new Map([...latest].filter(([, w]) => w.event === "withdrawn"));
}

/**
 * The record view with each withdrawn entry annotated. Counts, groups and grades are returned untouched.
 * @template {{ entries: Array<{ id: string, servedFrom?: string|null, shownAt?: string|null }> }} V
 * @param {V} view    levelARecord(...)
 * @param {Array<Record<string, any>>} events  withdrawn.jsonl rows, file order
 */
export function withWithdrawals(view, events) {
  const w = latestWithdrawals(events);
  const ids = new Set(view.entries.map((e) => e.id));
  return {
    ...view,
    entries: view.entries.map((e) => {
      const x = w.get(e.id);
      return { ...e, withdrawn: x ? { servedFrom: x.servedFrom ?? e.servedFrom ?? e.shownAt ?? null, until: x.firstNotServedFrom ?? null, reason: x.reason ?? null } : null };
    }),
    orphanWithdrawals: (events ?? []).filter((x) => !ids.has(x?.id)).length,
  };
}

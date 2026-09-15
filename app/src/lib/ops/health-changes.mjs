/**
 * MODEL-HEALTH STATE TRANSITIONS (P311) — the scorecard remembers what changed, so "what changed?" is never invented.
 *
 * The builder overwrites public/data/admin/model-health.json on every run; before it does, it compares each family's
 * new state with the state the previous artifact held and records every transition with the run's own timestamp.
 * Transitions ride on the artifact (`changes`) for CHANGE_WINDOW_DAYS, newest first, so any surface can say "this
 * family went from WATCH to PAUSED on Sep 14" from the file alone — no git, no guessing, and a family whose state did
 * not change produces nothing. Pure.
 */

export const CHANGE_WINDOW_DAYS = 14;

/**
 * @param {{ families?: Array<{id:string,state:string,label?:string,sport?:string}>, changes?: Array<object> }|null} previous
 * @param {Array<{id:string,state:string,label?:string,sport?:string}>} families  the new families
 * @param {string} nowIso
 * @returns {Array<{ id: string, sport: string|null, label: string|null, from: string|null, to: string, at: string }>}
 */
export function healthTransitions(previous, families, nowIso) {
  const prevById = new Map((previous?.families ?? []).map((f) => [f.id, f]));
  const fresh = [];
  for (const f of families) {
    const before = prevById.get(f.id);
    if (!before) continue;                       // a family seen for the first time is not a change
    if (before.state === f.state) continue;
    fresh.push({ id: f.id, sport: f.sport ?? null, label: f.label ?? null, from: before.state, to: f.state, at: nowIso });
  }
  const cutoff = Date.parse(nowIso) - CHANGE_WINDOW_DAYS * 86_400_000;
  const carried = (previous?.changes ?? []).filter((c) => Number.isFinite(Date.parse(c?.at ?? "")) && Date.parse(c.at) >= cutoff);
  return [...fresh, ...carried].sort((a, b) => b.at.localeCompare(a.at));
}

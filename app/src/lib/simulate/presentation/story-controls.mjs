/**
 * SIMULATION STORY CONTROLS (P308) — the pure rules behind the inline story: how long a chapter holds, what
 * reduced motion changes, and how a chapter's bars are described in words. No react, no timers, so the component has
 * nothing to decide and the rules can be tested without a browser.
 *
 *   holdFor(chapter, { reduced })   ms the chapter holds during auto-play; null under reduced motion (no auto-advance —
 *                                   the reader steps through by hand and nothing moves on its own)
 *   revealDuration({ reduced })     ms a bar takes to grow to its value; 0 under reduced motion (the value is simply shown)
 *   describeBars(bars, unit)        one sentence a screen reader gets instead of a drawn chart — the same numbers, in words
 *   narrationFor(manifest)          the reveal lines: what the page is DOING, never "running" a simulation the artifact
 *                                   already ran offline
 */

export const REVEAL_MS = 700;
export const MAX_HOLD_MS = 9000;

export function holdFor(chapter, { reduced = false } = {}) {
  if (reduced) return null;
  const hold = Number(chapter?.holdMs);
  if (!Number.isFinite(hold) || hold <= 0) return 5000;
  return Math.min(hold, MAX_HOLD_MS);
}

export function revealDuration({ reduced = false } = {}) {
  return reduced ? 0 : REVEAL_MS;
}

const pct = (p) => `${Math.round(p * 100)}%`;

/** The chart in words. Highlighted bars first, then the rest, so the point of the chart comes first. */
export function describeBars(bars, unit = "") {
  const list = (bars ?? []).filter((b) => Number.isFinite(b?.p));
  if (!list.length) return "";
  const top = [...list].sort((a, b) => (b.highlight ? 1 : 0) - (a.highlight ? 1 : 0) || b.p - a.p).slice(0, 4);
  const suffix = unit ? ` ${unit}` : "";
  return `${top.map((b) => `${b.label}${suffix}: ${pct(b.p)}`).join(", ")}${list.length > top.length ? `, and ${list.length - top.length} more` : ""}.`;
}

/**
 * The opening lines. The artifact was produced offline; the browser reads it. Saying so is the whole point: a reveal
 * that pretended to "run 10,000 simulations" in the page would be theatre.
 */
export function narrationFor(manifest) {
  const runs = Number.isInteger(manifest?.provenance?.runCount) && manifest.provenance.runCount > 0 ? manifest.provenance.runCount : null;
  return [
    "Loading the matchup model",
    runs ? `Reading the outcome distribution from ${runs.toLocaleString()} simulated games` : "Reading the outcome distribution",
    "Preparing the score scenarios",
  ];
}

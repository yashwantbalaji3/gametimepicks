/**
 * Home's sport lanes, said in one plain line each (W4 · 2026-10-28).
 *
 * The Command Center renders each lane's model statuses as a stack of uppercase chips ("GAME FORECASTS · NOT
 * MARKET-VALIDATED", "PLAYER RANGES · PAUSED"). On the front door that read as an engineering dashboard. This keeps the
 * meaning and says it once, as a sentence appended to the lane's own context line, using the SAME public labels the
 * chips use (PUBLIC_STATE_LABEL) — nothing is re-derived, no state is dropped, and the full explanation stays one tap
 * away (the hub's "what the statuses mean" link to /methodology#model-status, and each sport's hub).
 *
 * Presentation only: the lane's state, freshness, featured forecast and links pass through untouched.
 */
import type { CommandCenterLane } from "@/lib/command-center/command-center";
import { PUBLIC_STATE_LABEL } from "@/lib/command-center/contract";

type Status = CommandCenterLane["statuses"][number];

/** "Game forecasts: not market-validated · Player ranges: paused" — family, then its public label, lower-cased. */
export function plainStatusLine(statuses: readonly Status[]): string | null {
  const parts = statuses.map((s) => {
    const label = PUBLIC_STATE_LABEL[s.state] ?? String(s.state);
    /* "Forward test · Forward test running" says the family twice — the label alone carries it. */
    return label.toLowerCase().startsWith(s.family.toLowerCase()) ? label : `${s.family}: ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  });
  return parts.length ? `Model status — ${parts.join(" · ")}` : null;
}

/** The lanes with their status chips folded into one sentence on the context line. */
export function withPlainStatus(lanes: readonly CommandCenterLane[]): CommandCenterLane[] {
  return lanes.map((l) => {
    const line = plainStatusLine(l.statuses);
    return line ? { ...l, contextLine: `${l.contextLine}${/[.!?]$/.test(l.contextLine) ? "" : "."} ${line}.`, statuses: [] } : l;
  });
}

/**
 * ModelStatusChip — one status, in the public vocabulary, never by colour alone: the label is the state, the tone
 * only echoes it. The evidence sentence rides in the title so a hover or a screen reader gets it without the
 * homepage paying for it in copy; the sport hub prints it in full.
 *
 * W6 (2026-10-28): the calm chip (globals.css `.gtp-calm-chip`) — sentence case at 12px in muted text, the tone on a
 * small dot. It was 8.5px uppercase in the tone colour, and a lane of them read as a wall of alarms
 * ("NOT MARKET-VALIDATED"). Same labels (PUBLIC_STATE_LABEL), same states, same title.
 */
import type { PublicModelState } from "@/lib/command-center/contract";

/** One tone per meaning: good standing, being tested, needs watching, withdrawn, and "nothing to judge yet". */
export const MODEL_STATE_TONE: Record<PublicModelState, string> = {
  VALIDATED: "var(--vault-success)",
  FORWARD_TEST: "var(--vault-info)",
  HOLDING: "var(--vault-success)",
  WATCH: "var(--vault-warn)",
  PAUSED: "var(--gtp-bank-heat)",
  ESTIMATE: "var(--vault-warn)",
  TOO_EARLY: "var(--vault-text-faint)",
  EXPERIMENTAL: "var(--vault-text-mute)",
  SHADOW: "var(--vault-text-faint)",
  UNKNOWN: "var(--vault-text-faint)",
};

export default function ModelStatusChip({ state, label, family, title }: { state: PublicModelState; label: string; family?: string; title?: string }) {
  return (
    <span
      className="gtp-status-chip gtp-calm-chip"
      style={{ ["--chip-tone" as string]: MODEL_STATE_TONE[state] }}
      title={title}
      data-state={state}
    >
      {family ? <span style={{ color: "var(--vault-text-faint)" }}>{family} ·</span> : null}
      <span>{label}</span>
    </span>
  );
}

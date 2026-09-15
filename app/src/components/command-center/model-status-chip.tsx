/**
 * ModelStatusChip — one status, in the public vocabulary, never by colour alone: the label is the state, the tone
 * only echoes it. The evidence sentence rides in the title so a hover or a screen reader gets it without the
 * homepage paying for it in copy; the sport hub prints it in full.
 */
import type { PublicModelState } from "@/lib/command-center/contract";

const TONE: Record<PublicModelState, string> = {
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
      className="gtp-status-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em] whitespace-nowrap"
      style={{ fontSize: 8.5, color: TONE[state], border: "1px solid var(--vault-rule)" }}
      title={title}
      data-state={state}
    >
      {family ? <span style={{ color: "var(--vault-text-faint)" }}>{family} ·</span> : null}
      <span>{label}</span>
    </span>
  );
}

/**
 * StatusPill — one consistent state chip across every ticket surface. Covers card-level and
 * leg-level states so a user can scan status the same way everywhere. Pure presentation.
 */
export type TicketStatus =
  | "active" | "pending" | "settled" | "hit" | "miss" | "void"
  | "archived" | "data_pending" | "stopped" | "won" | "lost" | "candidate";

const META: Record<TicketStatus, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: "var(--gtp-bank-heat)", bg: "var(--gtp-bank-heat-dim)" },
  pending: { label: "Pending", color: "var(--vault-gold-bright)", bg: "var(--vault-gold-dim)" },
  settled: { label: "Settled", color: "var(--vault-text-mute)", bg: "var(--vault-wash)" },
  hit: { label: "Hit ✓", color: "var(--gtp-success-on-dark)", bg: "color-mix(in srgb, var(--gtp-success-on-dark) 12%, transparent)" },
  won: { label: "Won ✓", color: "var(--gtp-success-on-dark)", bg: "color-mix(in srgb, var(--gtp-success-on-dark) 12%, transparent)" },
  miss: { label: "Miss ✗", color: "var(--gtp-bank-heat)", bg: "var(--gtp-bank-heat-dim)" },
  lost: { label: "Lost ✗", color: "var(--gtp-bank-heat)", bg: "var(--gtp-bank-heat-dim)" },
  void: { label: "Void", color: "var(--vault-text-faint)", bg: "var(--vault-wash-soft)" },
  archived: { label: "Archived", color: "var(--vault-text-faint)", bg: "var(--vault-wash-soft)" },
  data_pending: { label: "Data pending", color: "var(--vault-text-faint)", bg: "var(--vault-wash-soft)" },
  stopped: { label: "Stopped", color: "var(--vault-text-mute)", bg: "var(--vault-wash)" },
  candidate: { label: "Candidate", color: "var(--vault-moonshot-bright)", bg: "color-mix(in srgb, var(--vault-moonshot) 14%, transparent)" },
};

export default function StatusPill({
  status, dot = false, className = "",
}: { status: TicketStatus; dot?: boolean; className?: string }) {
  const m = META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono font-bold uppercase tracking-[0.06em] ${className}`}
      style={{ color: m.color, background: m.bg, border: `1px solid color-mix(in srgb, ${m.color} 40%, transparent)`, fontSize: 9.5 }}
    >
      {dot ? <span aria-hidden style={{ width: 5, height: 5, borderRadius: 999, background: m.color }} /> : null}
      {m.label}
    </span>
  );
}

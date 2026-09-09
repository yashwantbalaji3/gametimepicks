"use client";
/**
 * The star (P251 · F9). One control, one job: follow this club, or stop.
 *
 * It never changes a number. Following reorders what a reader is shown first and nothing else —
 * the same figures, the same order within a ranking, the same published record.
 */
import { useFollowedTeams } from "@/lib/follow/follow-store";

export default function FollowToggle({ team, size = 14 }: { team: string; size?: number }) {
  const { isFollowed, toggle, ready } = useFollowedTeams();
  const on = ready && isFollowed(team);
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(team); }}
      aria-pressed={on}
      aria-label={on ? `Stop following ${team}` : `Follow ${team}`}
      title={on ? `Stop following ${team}` : `Follow ${team}`}
      className="gtp-follow-toggle inline-flex items-center justify-center shrink-0"
      style={{
        background: "transparent", border: 0, cursor: "pointer", padding: 2, lineHeight: 1,
        color: on ? "var(--vault-gold)" : "var(--vault-text-faint)", fontSize: size,
      }}
    >
      <span aria-hidden>{on ? "★" : "☆"}</span>
    </button>
  );
}

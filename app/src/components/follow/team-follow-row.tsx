/**
 * A game's two clubs, each with its own Follow control (v1.1.2). Server-renderable shell; the controls
 * are the client islands.
 *
 * A team follow is keyed on the TEAM, never on "a team in this game": following the Mariners from
 * tonight's game follows the Mariners, and survives the game ending, being postponed, or having no
 * forecast at all. A side whose canonical id does not resolve gets no control rather than a guessed one.
 */
import FollowToggle from "./follow-toggle";
import type { FollowRef } from "@/lib/follow/follow-store";

export default function TeamFollowRow({ away, home }: { away: FollowRef | null; home: FollowRef | null }) {
  if (!away && !home) return null;
  return (
    <div
      role="group"
      aria-label="Follow these teams on this device"
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, margin: "0 0 16px" }}
    >
      {[away, home].filter((r): r is FollowRef => r !== null).map((ref) => (
        <span key={ref.id} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>{ref.label}</span>
          <FollowToggle entity={ref} variant="labeled" />
        </span>
      ))}
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--vault-text-faint)" }}>
        Saved on this device
      </span>
    </div>
  );
}

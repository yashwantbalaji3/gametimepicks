"use client";
/**
 * THE FOLLOW CONTROL (v1.1.2; originally P251 · F9). One control, one job: follow this entity, or stop.
 *
 * It never changes a number. Following decides what a reader is shown first — never what is
 * published, forecast, evaluated or settled.
 *
 * IDENTITY IS THE REF. The control receives a canonical ref (`mlb-team-147`, `nfl-team-2`,
 * `nfl-athlete-4429795`) resolved on the server from published artifacts. A page that cannot resolve
 * one passes nothing and gets nothing: there is no display-name fallback, by design.
 *
 * ACCESSIBILITY
 *   - a real <button>, `aria-pressed` for the state, and an accessible name that always contains the
 *     entity: "Follow Buffalo Bills" / "Unfollow Buffalo Bills". Never just "★".
 *   - state is carried by WORDS (labelled variant) or by the accessible name (compact variant) as well
 *     as by the glyph and colour — never colour alone.
 *   - before the store has loaded it renders a neutral, non-interactive placeholder of the SAME size,
 *     so it neither flashes a wrong state nor shifts the row when it resolves.
 *   - when storage is blocked or holds a newer schema it stays visible but disabled and says why,
 *     rather than accepting a click that could not persist.
 */
import { type FollowRef, useFollowing } from "@/lib/follow/follow-store";

export interface FollowToggleProps {
  /** The canonical ref. `label` supplies the entity's display name for the accessible name. */
  entity: FollowRef | null | undefined;
  /** `compact`: star only (dense boards). `labeled`: star + Follow/Following text. */
  variant?: "compact" | "labeled";
  size?: number;
}

export default function FollowToggle({ entity, variant = "labeled", size = 14 }: FollowToggleProps) {
  const { isFollowing, toggle, ready, writable } = useFollowing();
  if (!entity?.id) return null; // no canonical id ⇒ no control. Never a name fallback.

  const name = entity.label ?? "this team";
  const on = ready && isFollowing(entity);
  const disabled = !ready || !writable;
  const actionLabel = on ? `Unfollow ${name}` : `Follow ${name}`;
  const why = !ready ? undefined : !writable ? "Following is unavailable in this browser" : actionLabel;

  const labeled = variant === "labeled";
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!disabled) toggle(entity); }}
      aria-pressed={on}
      aria-label={on ? `Unfollow ${name}` : `Follow ${name}`}
      aria-disabled={disabled || undefined}
      title={why}
      className="gtp-follow-toggle inline-flex items-center justify-center shrink-0"
      style={{
        background: "transparent",
        border: labeled ? `1px solid ${on ? "var(--vault-gold)" : "var(--vault-border)"}` : 0,
        borderRadius: labeled ? 999 : 0,
        cursor: disabled ? "default" : "pointer",
        /* 44px touch target on BOTH variants — the repository's own convention (52 controls use 44).
           The compact star stays visually small; its HIT AREA is not. */
        minHeight: 44,
        minWidth: labeled ? 104 : 44,
        /* The compact star lives inside dense rows (chip bars, player tables). A negative block margin
           lets its 44px hit area extend past the row without making every row 44px tall. */
        margin: labeled ? undefined : "-10px -6px",
        padding: labeled ? "4px 10px" : 4,
        gap: 6,
        lineHeight: 1,
        opacity: ready && !writable ? 0.55 : 1,
        color: on ? "var(--vault-gold)" : "var(--vault-text-mute)",
        fontFamily: "var(--font-mono)",
        fontSize: labeled ? 11 : size,
        letterSpacing: labeled ? "0.06em" : undefined,
      }}
    >
      <span aria-hidden style={{ fontSize: size }}>{on ? "★" : "☆"}</span>
      {labeled && (
        /* Fixed-width word slot: "Follow" and "Following" occupy the same box, so toggling never
           reflows the row it sits in. */
        <span aria-hidden style={{ display: "inline-block", minWidth: "8.5ch", textAlign: "left", textTransform: "uppercase" }}>
          {!ready ? " " : on ? "Following" : "Follow"}
        </span>
      )}
    </button>
  );
}

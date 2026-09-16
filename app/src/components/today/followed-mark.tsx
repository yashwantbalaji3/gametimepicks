"use client";
/**
 * FollowedMark (P323; v1.1.2 ids) — a small "following" mark beside a row whose team the reader follows.
 * Browser-only, renders nothing on the server and for a reader who follows nobody, so the row's words and
 * layout are unchanged for everyone else. Matches on canonical ids resolved server-side, never on names.
 */
import { type FollowRef, useFollowing } from "@/lib/follow/follow-store";

export default function FollowedMark({ entities }: { entities: FollowRef[] }) {
  const { isFollowing, ready } = useFollowing();
  if (!ready) return null;
  const mine = entities.filter((e) => isFollowing(e));
  if (!mine.length) return null;
  const names = mine.map((e) => e.label ?? "a team you follow");
  return (
    <span className="font-mono uppercase tracking-[0.1em] whitespace-nowrap" style={{ fontSize: 8.5, color: "var(--vault-gold)" }} aria-label={`You follow ${names.join(" and ")}`}>
      ★ following
    </span>
  );
}

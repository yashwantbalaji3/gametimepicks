"use client";
/**
 * FollowedMark (P323) — a small "following" mark beside a slate row whose team the reader follows. Browser-only
 * (the follow store lives in localStorage), renders nothing on the server and for a reader who follows nobody,
 * so the row's words and layout are unchanged for everyone else.
 */
import { useFollowedTeams } from "@/lib/follow/follow-store";

export default function FollowedMark({ teams }: { teams: string[] }) {
  const { teams: followed, ready } = useFollowedTeams();
  if (!ready) return null;
  const mine = teams.filter((t) => followed.includes(t));
  if (!mine.length) return null;
  return (
    <span className="font-mono uppercase tracking-[0.1em] whitespace-nowrap" style={{ fontSize: 8.5, color: "var(--vault-gold)" }} aria-label={`You follow ${mine.join(" and ")}`}>
      ★ following
    </span>
  );
}

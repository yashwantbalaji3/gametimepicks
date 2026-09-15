"use client";
/**
 * YourBrief (P311) — the reader's own layer, from the browser only: saved forecasts starting within the day, saved
 * forecasts that have started and await a result, and the teams they follow. Renders nothing for a reader with no
 * local data, so a first visit shows only the general brief.
 */
import Link from "next/link";
import { useSavedForecasts } from "@/lib/saved/saved-store";
import { useFollowedTeams } from "@/lib/follow/follow-store";

const DAY_MS = 86_400_000;

export default function YourBrief() {
  const { items, ready } = useSavedForecasts();
  const { teams, ready: teamsReady } = useFollowedTeams();
  if (!ready || !teamsReady) return null;
  if (!items.length && !teams.length) return null;
  const now = Date.now();
  const soon = items.filter((s) => s.startUtc && Date.parse(s.startUtc) > now && Date.parse(s.startUtc) - now <= DAY_MS);
  const started = items.filter((s) => s.startUtc && Date.parse(s.startUtc) <= now && now - Date.parse(s.startUtc) <= 2 * DAY_MS);
  return (
    <div className="flex flex-col gap-1 rounded-[10px] px-3 py-2" style={{ border: "1px dashed var(--vault-rule)" }} aria-label="Your brief">
      <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Your brief · from this browser only</span>
      {soon.length ? <span className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>{soon.length} saved forecast{soon.length === 1 ? "" : "s"} start{soon.length === 1 ? "s" : ""} in the next 24 hours: {soon.slice(0, 3).map((s) => s.matchup).join(" · ")}{soon.length > 3 ? " · …" : ""}</span> : null}
      {started.length ? <span className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>{started.length} saved forecast{started.length === 1 ? " has" : "s have"} started — the result appears on <Link href="/saved/" style={{ color: "var(--vault-gold-bright)" }}>your saved page</Link> once graded.</span> : null}
      {!soon.length && !started.length && items.length ? <span className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>{items.length} saved forecast{items.length === 1 ? "" : "s"}, none starting in the next day. <Link href="/saved/" style={{ color: "var(--vault-gold-bright)" }}>Open saved →</Link></span> : null}
      {teams.length ? <span className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>Following {teams.slice(0, 4).join(", ")}{teams.length > 4 ? ` and ${teams.length - 4} more` : ""} — their games lead the lists below when they play.</span> : null}
    </div>
  );
}

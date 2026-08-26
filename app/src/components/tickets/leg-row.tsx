/**
 * LegRow — one betting-slip-style leg, shared across ticket surfaces. Shows the matchup, selection,
 * market/line, kickoff ET, odds, and the official HIT/MISS/PENDING status (+ official evidence).
 * Player legs render a real headshot/portrait (PlayerAvatar, photo when present else initials);
 * team legs render real country flags (FlagBadge). Never a fabricated logo/portrait.
 */
import FlagBadge from "@/components/flag-badge";
import PlayerAvatar from "@/components/ui/player-avatar";
import OddsPill from "./odds-pill";
import StatusPill, { type TicketStatus } from "./status-pill";
import type { LegResult } from "./settlement-badge";

export interface TicketLeg {
  selection: string;
  market?: string | null;
  line?: number | null;
  matchup?: string | null;
  flagHome?: string | null;
  flagAway?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  /** Player name for a player-prop leg → renders a portrait (with photoUrl when available). */
  player?: string | null;
  photoUrl?: string | null;
  kickoffEt?: string | null;
  odds?: number | null;
  result?: LegResult;
  official?: string | null;
  source?: string | null;
}

export default function LegRow({ leg }: { leg: TicketLeg }) {
  const r = leg.result ?? "pending";
  const settled = r === "hit" || r === "miss" || r === "void";
  const status: TicketStatus = r === "hit" ? "hit" : r === "miss" ? "miss" : r === "void" ? "void" : "pending";
  const hasFlag = !!(leg.flagHome || leg.flagAway);
  return (
    <div className="flex items-start gap-2.5 py-2.5" style={{ borderTop: "1px solid var(--vault-border)" }}>
      <span className="mt-0.5 flex shrink-0 items-center gap-0.5">
        {leg.player ? (
          // Player-prop leg: real portrait + the player's country flag when known.
          <>
            <PlayerAvatar name={leg.player} photo={leg.photoUrl ?? null} size={18} />
            {leg.flagHome ? <FlagBadge code={leg.flagHome} size="sm" ariaLabel={leg.homeTeam ?? ""} /> : null}
          </>
        ) : hasFlag ? (
          <>
            {leg.flagHome ? <FlagBadge code={leg.flagHome} size="sm" ariaLabel={leg.homeTeam ?? ""} /> : null}
            {leg.flagAway ? <FlagBadge code={leg.flagAway} size="sm" ariaLabel={leg.awayTeam ?? ""} /> : null}
          </>
        ) : (
          <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] text-[11px]"
            style={{ background: "color-mix(in srgb, var(--vault-wash-base) 6%, transparent)", border: "1px solid var(--vault-border)" }} aria-hidden>⚽</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        {leg.matchup ? <span className="block truncate text-[11px] font-semibold" style={{ color: "var(--vault-text)" }}>{leg.matchup}</span> : null}
        <span className="block text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
          {leg.selection}{leg.market ? ` · ${leg.market}` : ""}{leg.line != null ? ` ${leg.line}` : ""}
        </span>
        {leg.kickoffEt ? <span className="block font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>Kickoff {leg.kickoffEt}</span> : null}
        {settled && leg.official ? <span className="block font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>Official: {leg.official}</span> : null}
        {leg.source ? (
          <span className="mt-0.5 inline-block rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.05em]" style={{ color: "var(--vault-text-faint)", background: "var(--vault-wash)" }}>
            settlement-supported · {leg.source}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <OddsPill odds={leg.odds} size="sm" tone="mute" />
        <StatusPill status={status} />
      </span>
    </div>
  );
}

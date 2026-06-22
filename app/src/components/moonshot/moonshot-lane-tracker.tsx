/**
 * MoonshotLaneTracker — the dedicated day-by-day Moonshot journey (like Bank Builder, but its own
 * separate, higher-volatility paper lane). Shows current status, the record (separate from the core
 * Bank Builder record), each run as a sportsbook ticket with HIT/MISS/PENDING legs, current exposure,
 * and the restart state. Renders only KNOWN runs — never fabricates missing history.
 *
 * Server component; reads no data itself (the host passes the lane + record + exposure).
 */
import Link from "next/link";

import TicketCard from "@/components/tickets/ticket-card";
import LegRow, { type TicketLeg } from "@/components/tickets/leg-row";
import StatusPill, { type TicketStatus } from "@/components/tickets/status-pill";
import { normalizeLegResult } from "@/components/tickets/settlement-badge";
import type { MoonshotLane, MoonshotCard } from "@/lib/moonshot/moonshot-lane";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function cardToLegs(card: MoonshotCard): TicketLeg[] {
  return (card.legs ?? []).map((l) => ({
    selection: l.participant,
    market: l.marketLabel,
    matchup: l.fixture,
    flagHome: l.countryCode ?? undefined,
    homeTeam: l.team ?? undefined,
    kickoffEt: l.kickoffEt,
    odds: l.odds,
    result: normalizeLegResult(l.settlement?.result, l.settlementStatus),
    official: l.settlement?.official ?? undefined,
  }));
}

function laneStatusPill(status: MoonshotLane["status"]): TicketStatus {
  if (status === "stopped") return "stopped";
  if (status === "active") return "active";
  if (status === "awaiting") return "pending";
  if (status === "completed") return "settled";
  return "pending";
}

function cardStatusPill(result?: string): TicketStatus {
  if (result === "lost") return "lost";
  if (result === "won") return "won";
  return "pending";
}

export default function MoonshotLaneTracker({
  lane, record, exposure, mode = "full", maxCards, showHistory = true,
}: {
  lane: MoonshotLane;
  record?: { wins: number; losses: number; voids: number; pending: number };
  exposure?: number;
  /** "full" = standalone /moonshot page; "compact" = embedded preview (e.g. Mr. Dub) with a CTA. */
  mode?: "full" | "compact";
  maxCards?: number;
  showHistory?: boolean;
}) {
  const compact = mode === "compact";
  const currentStep = lane.ladder.find((s) => s.step === lane.currentStep) ?? lane.ladder[0];
  const currentCard = currentStep?.card ?? null;
  const rec = record ?? { wins: 0, losses: 0, voids: 0, pending: 0 };
  const exp = exposure ?? 0;
  const recordStr = `${rec.wins}–${rec.losses}${rec.voids ? `–${rec.voids}` : ""}`;

  // Daily history: KNOWN runs only (current lane card + the recorded prior run). Never fabricated.
  const allRuns: Array<{ key: string; label: string; card: MoonshotCard; note?: string }> = [];
  if (currentCard) allRuns.push({ key: "current", label: `Step ${lane.currentStep} · ${currentCard.slateLabel ?? "cross-slate restart"}`, card: currentCard, note: lane.stopNote });
  if (lane.priorRun?.card && showHistory) allRuns.push({ key: "prior", label: "Prior run · June 19", card: lane.priorRun.card, note: lane.priorRun.note });
  const runs = allRuns.slice(0, maxCards ?? (compact ? 1 : allRuns.length));

  const summary: Array<[string, string]> = [
    ["Record", recordStr],
    ["Exposure", usd(exp)],
    ["Step", `${lane.currentStep} of ${lane.ladder.length}`],
    ["Target", usd(lane.targetReturn)],
  ];

  return (
    <section aria-label="Moonshot Lane Tracker" className="flex flex-col gap-4">
      <div className="rounded-2xl px-5 py-4" style={{ border: "1px solid #8b7bf0", background: "linear-gradient(135deg, rgba(139,123,240,0.10), rgba(26,16,11,0.42))" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "#b9a8ff", fontSize: 10 }}>🌙 Moonshot Lane · daily tracker</span>
          <StatusPill status={laneStatusPill(lane.status)} dot />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {summary.map(([k, v]) => (
            <div key={k} className="rounded-[10px] px-3 py-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-rule)" }}>
              <div className="font-mono tabular" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{v}</div>
              <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{k}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
          A separate, higher-volatility paper lane — <strong style={{ color: "var(--vault-text)" }}>not</strong> part of the core Dual Bank Builder, and its record never blends into the core. $25 → $3,000 ladder · paper-only.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {runs.length > 0 ? runs.map((r) => (
          <TicketCard
            key={r.key}
            accent="violet"
            title={r.label}
            subtitle={r.card.cardId}
            sport="World Cup"
            risk={r.card.risk}
            status={cardStatusPill(r.card.result)}
            odds={r.card.combinedOdds}
            oddsTone="violet"
            stake={r.card.stake}
            projectedReturn={r.card.projectedReturn}
            footer={r.note ? <span className="text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>{r.note}</span> : undefined}
          >
            {cardToLegs(r.card).map((leg, j) => <LegRow key={j} leg={leg} />)}
          </TicketCard>
        )) : (
          <div className="rounded-xl px-4 py-6 text-center" style={{ border: "1px dashed var(--vault-border)", background: "rgba(255,255,255,0.02)" }}>
            <p style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>No Moonshot card on record yet</p>
            <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>A qualified higher-volatility card will appear here once one clears the gates.</p>
          </div>
        )}
      </div>

      <div className="rounded-xl px-4 py-3" style={{ border: "1px dashed var(--vault-border)", background: "rgba(255,255,255,0.02)" }}>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Next</span>
        <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
          {lane.restartCandidate
            ? `${lane.restartCandidate.headline} — ${lane.restartCandidate.reason}`
            : "Awaiting a qualified higher-volatility card. Nothing is active; current exposure is $0.00."}
        </p>
      </div>

      {compact ? (
        <Link href="/moonshot" className="inline-flex items-center gap-1 self-start rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ border: "1px solid color-mix(in srgb, #8b7bf0 45%, transparent)", color: "#b9a8ff", textDecoration: "none" }}>
          Open the full Moonshot daily tracker →
        </Link>
      ) : (
        <p className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>
          Daily tracker shows known Moonshot runs only — earlier history before June 19 is not backfilled (no fabricated cards). Settlement-supported by official sources.
        </p>
      )}
    </section>
  );
}

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
import type { MoonshotLane, MoonshotCard, MoonshotCandidateLeg } from "@/lib/moonshot/moonshot-lane";
import { publicMoonshotCandidates } from "@/lib/moonshot/moonshot-lane";
import { candidateReadiness } from "@/lib/moonshot/activation-rules";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The sport badge for a Moonshot ticket, derived from its legs (never hardcoded). Moonshot now runs current
 *  MLB player-prop legs; a legacy World Cup card in history still labels correctly from its own legs. */
function legsSportLabel(legs?: ReadonlyArray<{ sport?: string }>): string {
  const s = new Set((legs ?? []).map((l) => String(l.sport ?? "").toUpperCase()).filter(Boolean));
  if (s.size !== 1) return s.size > 1 ? "Mixed" : "Paper";
  const only = [...s][0];
  return only === "MLB" ? "MLB" : only === "SOCCER" || only === "WORLD_CUP" ? "World Cup" : only.charAt(0) + only.slice(1).toLowerCase();
}

function cardToLegs(card: MoonshotCard): TicketLeg[] {
  return (card.legs ?? []).map((l) => ({
    selection: l.participant,
    market: l.marketLabel,
    matchup: l.fixture,
    flagHome: l.countryCode ?? undefined,
    homeTeam: l.team ?? undefined,
    player: l.kind === "player" ? l.participant : undefined,
    photoUrl: l.photoUrl ?? undefined,
    kickoffEt: l.kickoffEt,
    odds: l.odds,
    result: normalizeLegResult(l.settlement?.result, l.settlementStatus),
    official: l.settlement?.official ?? undefined,
  }));
}

function candidateLegToTicket(l: MoonshotCandidateLeg): TicketLeg {
  return {
    selection: l.participant,
    market: l.marketLabel,
    matchup: l.fixture,
    flagHome: l.countryCode ?? undefined,
    kickoffEt: l.kickoffEt,
    odds: l.odds,
    result: "pending",
    source: l.settlement?.source,
  };
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
  lane, record, exposure, mode = "full", maxCards, showHistory = true, nowIso,
}: {
  lane: MoonshotLane;
  record?: { wins: number; losses: number; voids: number; pending: number };
  exposure?: number;
  /** "full" = standalone /moonshot page; "compact" = embedded preview (e.g. Mr. Dub) with a CTA. */
  mode?: "full" | "compact";
  maxCards?: number;
  showHistory?: boolean;
  nowIso?: string;
}) {
  const compact = mode === "compact";
  const now = nowIso ?? new Date().toISOString();
  // Public candidate pool excludes settlement-pending player props (product-ineligible) — never imply props are eligible.
  const pubCandidates = publicMoonshotCandidates(lane);
  const currentStep = lane.ladder.find((s) => s.step === lane.currentStep) ?? lane.ladder[0];
  const currentCard = currentStep?.card ?? null;
  const rec = record ?? { wins: 0, losses: 0, voids: 0, pending: 0 };
  const exp = exposure ?? 0;
  const recordStr = `${rec.wins}–${rec.losses}${rec.voids ? `–${rec.voids}` : ""}`;

  // Daily history: KNOWN runs only (current lane card + the recorded prior run). Never fabricated.
  const allRuns: Array<{ key: string; label: string; card: MoonshotCard; note?: string }> = [];
  if (currentCard) allRuns.push({ key: "current", label: `Step ${lane.currentStep} · ${currentCard.slateLabel ?? "cross-slate restart"}`, card: currentCard, note: lane.stopNote });
  // Only surface a prior run whose card is settlement-supported (team markets). A historical card that contains a
  // settlement-pending player prop (goalscorer/shots) is NOT shown publicly, so the product surface never visually
  // implies player props are eligible — the record summary still reflects it; the leg detail is just not displayed.
  const priorHasPendingProp = (lane.priorRun?.card?.legs ?? []).some((l) => /^player_/i.test(l.market));
  if (lane.priorRun?.card && showHistory && !priorHasPendingProp) allRuns.push({ key: "prior", label: "Prior run · June 19", card: lane.priorRun.card, note: lane.priorRun.note });
  const runs = allRuns.slice(0, maxCards ?? (compact ? 1 : allRuns.length));

  // Moonshot is NOT a ladder — it publishes independent high-upside cards. Track its own record + exposure
  // (no step/target progression).
  const summary: Array<[string, string]> = [
    ["Record", recordStr],
    ["Exposure", usd(exp)],
    ["Style", "High-upside longshots"],
  ];

  return (
    <section aria-label="Moonshot Lane Tracker" className="flex flex-col gap-4">
      <div className="rounded-2xl px-5 py-4" style={{ border: "1px solid var(--vault-moonshot)", background: "linear-gradient(135deg, color-mix(in srgb, var(--vault-moonshot) 10%, transparent), color-mix(in srgb, var(--vault-scrim-base) 42%, transparent))" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--vault-moonshot-bright)", fontSize: 10 }}>🌙 Moonshot Lane · daily tracker</span>
          <StatusPill status={laneStatusPill(lane.status)} dot />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {summary.map(([k, v]) => (
            <div key={k} className="rounded-[10px] px-3 py-2" style={{ background: "var(--vault-wash-soft)", border: "1px solid var(--vault-rule)" }}>
              <div className="font-mono tabular" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{v}</div>
              <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{k}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
          A separate, higher-volatility product — <strong style={{ color: "var(--vault-text)" }}>not</strong> part of the core Dual Bank Builder, and its record never blends into the core. Two independent high-upside cards daily · paper-only.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {runs.length > 0 ? runs.map((r) => (
          <TicketCard
            key={r.key}
            accent="violet"
            title={r.label}
            subtitle={r.card.cardId}
            sport={legsSportLabel(r.card.legs)}
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
          <div className="rounded-xl px-4 py-6 text-center" style={{ border: "1px dashed var(--vault-border)", background: "var(--vault-wash-faint)" }}>
            <p style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>No Moonshot card on record yet</p>
            <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>A qualified higher-volatility card will appear here once one clears the gates.</p>
          </div>
        )}
      </div>

      {pubCandidates.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-moonshot-bright)", fontSize: 11 }}>Moonshot Candidates · {pubCandidates.length}</span>
            <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>evaluated pre-event · not activated · $0 exposure</span>
          </div>
          {lane.candidatesNote && !compact ? <p className="text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>{lane.candidatesNote}</p> : null}
          {(compact ? pubCandidates.slice(0, 1) : pubCandidates).map((c) => {
            const readiness = candidateReadiness(c, now);
            const readinessColor = readiness.state === "ready" ? "var(--vault-success)" : readiness.state === "expired" ? "var(--gtp-bank-heat)" : "var(--vault-gold-bright)";
            return (
              <TicketCard key={c.cardId} accent="violet" title={c.label} subtitle={c.subtitle} sport={legsSportLabel(c.legs as ReadonlyArray<{ sport?: string }>)} risk={c.risk} status="candidate" odds={c.combinedOdds} oddsTone="violet" stake={c.stake} projectedReturn={c.projectedReturn}
                footer={
                  <span className="flex flex-col gap-1 text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
                    <span className="font-mono uppercase tracking-[0.06em]" style={{ color: readinessColor, fontSize: 10, fontWeight: 700 }}>{readiness.reason}</span>
                    {!compact && c.note ? <span>{c.note}</span> : null}
                  </span>
                }>
                {c.legs.map((l, i) => <LegRow key={i} leg={candidateLegToTicket(l)} />)}
              </TicketCard>
            );
          })}
        </div>
      ) : null}

      <div className="rounded-xl px-4 py-3" style={{ border: "1px dashed var(--vault-border)", background: "var(--vault-wash-faint)" }}>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Next</span>
        <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
          {lane.restartCandidate
            ? `${lane.restartCandidate.headline} — ${lane.restartCandidate.reason}`
            : "Awaiting a qualified higher-volatility card. Nothing is active; current exposure is $0.00."}
        </p>
      </div>

      {compact ? (
        <Link href="/moonshot" className="inline-flex items-center gap-1 self-start rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ border: "1px solid color-mix(in srgb, var(--vault-moonshot) 45%, transparent)", color: "var(--vault-moonshot-bright)", textDecoration: "none" }}>
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

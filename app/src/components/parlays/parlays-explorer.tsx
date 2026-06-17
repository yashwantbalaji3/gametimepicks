"use client";
/**
 * Parlays explorer — mobile-first showcase of the methodology engine output: suggested parlays by
 * sport + risk level, game-specific parlays, the eligible-leg marketplace, and honest no-qualified
 * states. Reads engine display data (props) — never fabricates a card.
 */
import { useState } from "react";
import PlayerAvatar from "@/components/player-avatar";
import TeamLogo from "@/components/team-logo";
import FlagBadge from "@/components/flag-badge";
import type {
  TodaySlateView, SuggestedParlayCard, ParlayLegDisplay, SportSlateStatus,
} from "@/lib/parlays/ui-loader";
import type { RiskLevel } from "@/lib/parlays/types";

const RISK_LABEL: Record<RiskLevel, string> = { low: "Low", medium: "Medium", high: "High", longshot: "Longshot" };
const RISK_ORDER: RiskLevel[] = ["low", "medium", "high", "longshot"];
const SPORT_LABEL: Record<string, string> = { MLB: "MLB", NBA: "NBA", UFC: "UFC", WORLD_CUP: "World Cup" };

function americanStr(o: number | null): string {
  if (o == null) return "—";
  return o > 0 ? `+${o}` : `${o}`;
}
function pctStr(p: number | null): string {
  return p == null ? "—" : `${Math.round(p * 100)}%`;
}

function LegIdentity({ leg, size = "sm" }: { leg: ParlayLegDisplay; size?: "xs" | "sm" | "md" }) {
  const id = leg.identity;
  if (id.kind === "player" && id.playerId != null) {
    return <PlayerAvatar playerId={id.playerId} playerName={leg.participant} team={id.teamAbbr ?? undefined} sport={id.avatarSport} size={size} flat />;
  }
  if (id.kind === "player" && id.photoUrl) {
    // World Cup photo (API-Football) — plain img with graceful fallback to a flag/initial.
    return <img src={id.photoUrl} alt={leg.participant} width={size === "md" ? 44 : 32} height={size === "md" ? 44 : 32} loading="lazy" className="rounded-full object-cover" style={{ width: size === "md" ? 44 : 32, height: size === "md" ? 44 : 32 }} />;
  }
  if (leg.sport === "WORLD_CUP" && id.countryCode) {
    return <FlagBadge code={id.countryCode} size={size === "md" ? "lg" : "md"} ariaLabel={leg.participant} />;
  }
  if (id.kind === "team" && id.teamAbbr && (leg.sportKey === "mlb" || leg.sportKey === "nba")) {
    return <TeamLogo team={id.teamAbbr} sport={leg.sportKey} size={size === "md" ? "md" : "sm"} />;
  }
  // Fallback monogram (UFC fighters, missing ids) — never a fabricated photo.
  return <PlayerAvatar playerName={leg.participant} size={size} flat />;
}

function Chip({ label, tone = "mute" }: { label: string; tone?: "mute" | "good" | "warn" | "text" }) {
  const color = tone === "good" ? "var(--vault-success)" : tone === "warn" ? "var(--gtp-bank-heat)" : tone === "text" ? "var(--vault-text)" : "var(--vault-text-faint)";
  return (
    <span className="inline-flex items-center rounded-[5px] px-1.5 py-0.5 font-mono text-[11px]" style={{ color, background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-border)" }}>
      {label}
    </span>
  );
}

function qualityTone(tier: string): "good" | "text" | "warn" | "mute" {
  return tier === "elite" ? "good" : tier === "strong" ? "text" : tier === "thin" ? "warn" : "mute";
}

function LegRow({ leg }: { leg: ParlayLegDisplay }) {
  return (
    <div className="flex items-start gap-2.5 py-2" style={{ borderTop: "1px solid var(--vault-border)" }}>
      <div className="shrink-0 pt-0.5"><LegIdentity leg={leg} /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[13.5px] font-medium truncate" style={{ color: "var(--vault-text)" }}>{leg.participant}</span>
          <span className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>{leg.market}{leg.line != null ? ` ${leg.line}` : ""}</span>
          <span className="font-mono text-[12.5px]" style={{ color: "var(--vault-text)" }}>{americanStr(leg.odds)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Chip label={leg.confidenceTier} tone={leg.confidenceTier === "High" ? "good" : leg.confidenceTier === "No Bet" ? "warn" : "mute"} />
          <Chip label={`${leg.legQualityTier} ${leg.legQualityScore}`} tone={qualityTone(leg.legQualityTier)} />
          {leg.edge != null && <Chip label={`${leg.edge >= 0 ? "+" : ""}${leg.edge.toFixed(1)}pp`} tone={leg.edge > 0 ? "good" : "mute"} />}
          {leg.modelProbability != null && <Chip label={`model ${pctStr(leg.modelProbability)}`} />}
        </div>
        {(leg.topPositiveFactors[0] || leg.topNegativeFactors[0]) && (
          <div className="mt-1 space-y-0.5 text-[11.5px]">
            {leg.topPositiveFactors[0] && <div style={{ color: "var(--vault-text-faint)" }}>+ {leg.topPositiveFactors[0]}</div>}
            {leg.topNegativeFactors[0] && <div style={{ color: "var(--vault-text-faint)" }}>− {leg.topNegativeFactors[0]}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export function ParlayCard({ card }: { card: SuggestedParlayCard }) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: "var(--vault-surface, rgba(255,255,255,0.02))", border: "1px solid var(--vault-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Chip label={RISK_LABEL[card.riskLevel]} tone="text" />
          <Chip label={card.sport === "MIXED" ? "Mixed" : SPORT_LABEL[card.sport] ?? card.sport} />
          {card.parlayType === "same_game" && <Chip label="same game" />}
        </div>
        <div className="text-right">
          <div className="font-mono text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>{americanStr(card.combinedOdds)}</div>
          <div className="text-[11px]" style={{ color: "var(--vault-text-faint)" }}>model {pctStr(card.estimatedHitProbability)} · {card.legs.length} legs</div>
        </div>
      </div>
      <div className="mt-1.5">
        {card.legs.map((l) => <LegRow key={l.legId} leg={l} />)}
      </div>
      {(card.whyThisParlay[0] || card.whyItCouldFail[0]) && (
        <div className="mt-2 space-y-1 text-[12px]" style={{ borderTop: "1px solid var(--vault-border)", paddingTop: 8 }}>
          {card.whyThisParlay[0] && <div style={{ color: "var(--vault-text-mute)" }}><span style={{ color: "var(--vault-success)" }}>Why:</span> {card.whyThisParlay[0]}</div>}
          {card.whyItCouldFail[0] && <div style={{ color: "var(--vault-text-mute)" }}><span style={{ color: "var(--gtp-bank-heat)" }}>Risk:</span> {card.whyItCouldFail[0]}</div>}
        </div>
      )}
    </div>
  );
}

function NoQualified({ status }: { status: SportSlateStatus }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)" }}>
      <div className="text-[13px] font-medium" style={{ color: "var(--vault-text)" }}>No Qualified Parlays</div>
      <div className="mt-1 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>{status.noQualified?.message}</div>
      <div className="mt-1 font-mono text-[11px]" style={{ color: "var(--vault-text-faint)" }}>extractor: {status.extractorStatus} · candidates: {status.totalCandidates}</div>
    </div>
  );
}

function Accordion({ title, subtitle, children, defaultOpen = false }: { title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--vault-border)" }}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3.5 py-3 text-left" style={{ background: "rgba(255,255,255,0.02)" }}>
        <span>
          <span className="text-[13.5px] font-medium" style={{ color: "var(--vault-text)" }}>{title}</span>
          {subtitle && <span className="ml-2 text-[12px]" style={{ color: "var(--vault-text-faint)" }}>{subtitle}</span>}
        </span>
        <span aria-hidden style={{ color: "var(--vault-text-faint)" }}>{open ? "−" : "+"}</span>
      </button>
      {open && <div className="space-y-3 p-3">{children}</div>}
    </div>
  );
}

export default function ParlaysExplorer({ slate }: { slate: TodaySlateView }) {
  const sportsWithLegs = slate.sports.filter((s) => s.eligibleCount > 0);
  const firstSport = (sportsWithLegs[0] ?? slate.sports[0])?.sport ?? "MLB";
  const [sport, setSport] = useState<string>(firstSport);
  const [view, setView] = useState<"suggested" | "game" | "legs">("suggested");

  const active = slate.sports.find((s) => s.sport === sport);
  const byRisk = slate.suggestedBySportRisk[sport] ?? {};
  const gameGroups = slate.gameSpecific.filter((g) => g.sport === sport);
  const sportLegs = slate.eligibleLegs.filter((l) => l.sport === sport);

  return (
    <div className="space-y-4">
      {/* sport selector */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: "none" }}>
        {slate.sports.map((s) => (
          <button key={s.sport} onClick={() => setSport(s.sport)}
            className="shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium"
            style={{
              background: s.sport === sport ? "var(--vault-gold-bright, #d9a441)" : "rgba(255,255,255,0.04)",
              color: s.sport === sport ? "#170f0a" : "var(--vault-text-mute)",
              border: "1px solid var(--vault-border)",
            }}>
            {SPORT_LABEL[s.sport] ?? s.sport}{s.eligibleCount > 0 ? ` · ${s.eligibleCount}` : ""}
          </button>
        ))}
      </div>

      {!active || active.eligibleCount === 0 ? (
        active ? <NoQualified status={active} /> : null
      ) : (
        <>
          {/* view tabs */}
          <div className="flex gap-2">
            {([["suggested", "Suggested"], ["game", `Same-game (${gameGroups.length})`], ["legs", `Legs (${sportLegs.length})`]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)} className="rounded-lg px-3 py-1.5 text-[12.5px]"
                style={{ background: view === v ? "rgba(255,255,255,0.06)" : "transparent", color: view === v ? "var(--vault-text)" : "var(--vault-text-faint)", border: "1px solid var(--vault-border)" }}>
                {label}
              </button>
            ))}
          </div>

          {view === "suggested" && (
            <div className="space-y-4">
              {RISK_ORDER.map((lvl) => {
                const cards = byRisk[lvl] ?? [];
                if (cards.length === 0) return null;
                return (
                  <div key={lvl} className="space-y-2.5">
                    <div className="text-[12.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--vault-text-faint)" }}>{RISK_LABEL[lvl]} risk · {cards.length}</div>
                    {cards.map((c) => <ParlayCard key={c.parlayId} card={c} />)}
                  </div>
                );
              })}
            </div>
          )}

          {view === "game" && (
            <div className="space-y-3">
              {gameGroups.length === 0 && <div className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No non-conflicting same-game parlays today.</div>}
              {gameGroups.map((g) => (
                <Accordion key={g.gameId} title={`Game ${g.label}`} subtitle={`${g.parlays.length} parlay${g.parlays.length === 1 ? "" : "s"}`}>
                  {g.parlays.map((c) => <ParlayCard key={c.parlayId} card={c} />)}
                </Accordion>
              ))}
            </div>
          )}

          {view === "legs" && (
            <Accordion title="Eligible-leg marketplace" subtitle={`${sportLegs.length} legs`} defaultOpen>
              {sportLegs.slice(0, 60).map((l) => (
                <div key={l.legId} className="rounded-lg px-2" style={{ background: "rgba(255,255,255,0.02)" }}><LegRow leg={l} /></div>
              ))}
              {sportLegs.length > 60 && <div className="text-center text-[12px]" style={{ color: "var(--vault-text-faint)" }}>+{sportLegs.length - 60} more eligible legs</div>}
            </Accordion>
          )}
        </>
      )}
    </div>
  );
}

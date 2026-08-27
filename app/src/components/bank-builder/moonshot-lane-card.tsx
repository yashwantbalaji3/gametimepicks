/**
 * Moonshot Lane — public card for the SEPARATE high-volatility World-Cup-forward paper challenge.
 * Visually distinct (moon/indigo glow) from the disciplined Dual Bank Builder so the two are never
 * confused. Renders the 3-step ladder, the active Step-1 card (exact legs, flags/photos, opponent +
 * kickoff), and "Why this card" / "Why it can fail" / correlation drawers. Always framed as higher-variance.
 */
import Link from "next/link";
import FlagBadge from "@/components/flag-badge";
import type { MoonshotLane, MoonshotLeg, MoonshotStep } from "@/lib/moonshot/moonshot-lane";
import PlayerAvatar from "@/components/ui/player-avatar";

// Enriched, betting-slip-style fields the committed Moonshot artifact carries on each leg / card but
// the shared MoonshotLeg/MoonshotCard types don't expose. The loader casts the raw JSON, so these
// are present at runtime; we read them through these optional extensions (all guarded).
type EnrichedMoonLeg = MoonshotLeg & {
  displaySelection?: string;
  kickoffEt?: string;
  eventDate?: string;
  settlementSource?: string;
};
type EnrichedMoonCard = { crossSlate?: boolean; slateLabel?: string };

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const american = (o: number) => (o > 0 ? `+${o}` : `${o}`);
const shortStart = (iso: string | null) => {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }) + " UTC";
};
/** "Jun 22" from an ISO date (YYYY-MM-DD), UTC-noon math to avoid an off-by-one. */
const shortEventDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

const MOON = "var(--moonshot-accent, var(--vault-moonshot))";

function LegAvatar({ leg }: { leg: MoonshotLeg }) {
  if (leg.kind === "player" && leg.photoUrl) {
    return (
      <span className="relative inline-block" style={{ width: 26, height: 26 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <PlayerAvatar name={leg.participant} photo={leg.photoUrl} size={26} />
        {leg.countryCode && (
          <span className="absolute -bottom-1 -right-1" style={{ transform: "scale(0.62)", transformOrigin: "bottom right" }}>
            <FlagBadge code={leg.countryCode} size="sm" ariaLabel={leg.team ?? ""} />
          </span>
        )}
      </span>
    );
  }
  if (leg.countryCode) return <FlagBadge code={leg.countryCode} size="sm" ariaLabel={leg.participant} />;
  return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "color-mix(in srgb, var(--vault-wash-base) 6%, transparent)", color: "var(--vault-text-mute)" }}>{leg.participant.slice(0, 2).toUpperCase()}</span>;
}

function MoonLegRow({ leg }: { leg: MoonshotLeg }) {
  const e = leg as EnrichedMoonLeg;
  const pick = `${leg.marketLabel}${leg.side ? ` ${leg.side}` : ""}${leg.line != null ? ` ${leg.line}` : ""}`.trim();
  // Selection: prefer displaySelection (carries "{matchup} — {market}: {pick}"); else compose the
  // matchup (fixture) + the pick so a leg never reads as a bare market with no game.
  const selection = e.displaySelection || pick;
  // Matchup line: prefer the explicit fixture; kickoff prefers ET (+ event date) over the raw UTC time.
  const koDate = shortEventDate(e.eventDate);
  const kickoff = e.kickoffEt ? [e.kickoffEt, koDate].filter(Boolean).join(" · ") : shortStart(leg.startTime);
  const matchup = [leg.fixture || (leg.opponent ? `vs ${leg.opponent}` : null), kickoff ? `Kickoff ${kickoff}` : null].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-2 py-1.5" style={{ borderTop: "1px solid var(--vault-border)" }}>
      <span className="shrink-0"><LegAvatar leg={leg} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium" style={{ color: "var(--vault-text)" }}>{leg.participant}</span>
        <span className="block truncate text-[11px]" style={{ color: "var(--vault-text-mute)" }}>{selection}</span>
        {matchup && <span className="block truncate font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>{matchup}</span>}
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-[12px]" style={{ color: "var(--vault-text)" }}>{american(leg.odds)}</span>
        <span className="block font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>model {Math.round(leg.modelProbability * 100)}%</span>
      </span>
    </div>
  );
}

function StepRow({ step }: { step: MoonshotStep }) {
  const active = step.status === "active";
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ border: `1px solid ${active ? MOON : "var(--vault-rule)"}`, background: active ? "color-mix(in srgb, var(--vault-moonshot) 7%, transparent)" : "color-mix(in srgb, var(--vault-wash-base) 1.5%, transparent)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}>
          Step {step.step} · {usd(step.stake)} <span style={{ color: "var(--vault-text-faint)" }}>→</span> {usd(step.targetReturn)}
        </span>
        <span className="rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em]"
          style={{ color: active ? MOON : "var(--vault-text-faint)", background: "var(--vault-wash)", border: `1px solid ${active ? MOON : "var(--vault-rule)"}` }}>
          {active ? "active" : step.status} · ~{step.requiredMultiple.toFixed(1)}×
        </span>
      </div>
      {active && step.card && (
        <div className="mt-2">
          <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-mono text-[12px]" style={{ color: MOON }}>{american(step.card.combinedOdds)} combined</span>
            <span className="font-mono text-[11px]" style={{ color: "var(--vault-text-mute)" }}>{usd(step.card.stake)} → {usd(step.card.projectedReturn)}</span>
            <span className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>· {step.card.distinctGames} games · model {Math.round(step.card.jointModelProbability * 100)}% all-hit</span>
          </div>
          {((step.card as EnrichedMoonCard).crossSlate || (step.card as EnrichedMoonCard).slateLabel) && (
            <div className="mb-1.5 flex flex-wrap gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.06em]">
              {(step.card as EnrichedMoonCard).crossSlate ? <span className="rounded px-1.5 py-0.5" style={{ color: MOON, background: "color-mix(in srgb, var(--vault-moonshot) 14%, transparent)", border: `1px solid ${MOON}` }}>Cross-slate</span> : null}
              {(step.card as EnrichedMoonCard).slateLabel ? <span className="rounded px-1.5 py-0.5 normal-case" style={{ color: "var(--vault-text-faint)", background: "var(--vault-wash-soft)", letterSpacing: 0 }}>{(step.card as EnrichedMoonCard).slateLabel}</span> : null}
            </div>
          )}
          <div>{step.card.legs.map((l) => <MoonLegRow key={l.legId} leg={l} />)}</div>
          <details className="mt-2"><summary className="cursor-pointer font-mono text-[10.5px]" style={{ color: MOON, listStyle: "none" }}>Why this card · correlation · how it fails ▾</summary>
            <div className="mt-1.5 space-y-1 text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
              {step.card.whyThisCard.map((w, i) => <div key={`w${i}`}><span style={{ color: "var(--vault-success)" }}>Why:</span> {w}</div>)}
              <div><span className="font-mono text-[10px] uppercase" style={{ color: MOON }}>correlation:</span> {step.card.correlationProfile.replace(/_/g, " ")} — disclosed, not hidden.</div>
              {step.card.whyItCanFail.map((w, i) => <div key={`f${i}`}><span style={{ color: "var(--gtp-bank-heat)" }}>Risk:</span> {w}</div>)}
              <div style={{ color: "var(--vault-text-faint)" }}>Settles from official sources only (90-minute regulation results + official goal records). Player props are limited-data / market-implied.</div>
            </div>
          </details>
        </div>
      )}
      {!active && step.status === "upcoming" && (
        <div className="mt-1 font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>Upcoming · target {step.targetOddsBand}</div>
      )}
    </div>
  );
}

export default function MoonshotLaneCard({ lane }: { lane: MoonshotLane | null }) {
  if (!lane || lane.publicVisible === false) return null;
  return (
    <section className="gtp-fade-up mb-6" aria-label="Moonshot Lane">
      <div className="overflow-hidden rounded-2xl p-4 sm:p-5" style={{ border: `1px solid ${MOON}`, background: "linear-gradient(135deg, color-mix(in srgb, var(--vault-moonshot) 10%, transparent), color-mix(in srgb, var(--vault-scrim-base) 30%, transparent))" }}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800 }}>🌙 {lane.name}</h2>
            <p className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>{lane.subtitle}</p>
          </div>
          <span className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: MOON, background: "color-mix(in srgb, var(--vault-moonshot) 12%, transparent)", border: `1px solid ${MOON}` }}>
            High-volatility · {usd(lane.startingStake)} → {usd(lane.targetReturn)}
          </span>
        </div>
        <p className="mb-3 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>
          A separate, aggressive paper path — <strong style={{ color: "var(--vault-text-mute)" }}>not</strong> part of the core Dual Bank Builder. Higher variance by design. Paper-only · tracked in Mr. Dub.
        </p>
        {lane.status === "stopped" && lane.restartCandidate && (
          <div className="mb-3 rounded-xl px-3 py-2.5" style={{ border: `1px solid ${MOON}`, background: "color-mix(in srgb, var(--vault-moonshot) 7%, transparent)" }}>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: MOON }}>{lane.restartCandidate.headline}</span>
            <p className="mt-1 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{lane.restartCandidate.reason}</p>
          </div>
        )}
        <div className="flex flex-col gap-2">{lane.ladder.map((s) => <StepRow key={s.step} step={s} />)}</div>
        <Link href="/moonshot" className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: MOON }}>
          Open the Moonshot Lane daily tracker →
        </Link>
      </div>
    </section>
  );
}

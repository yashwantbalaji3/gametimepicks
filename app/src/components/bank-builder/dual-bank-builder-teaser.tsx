/**
 * DualBankBuilderTeaser — the next Bank Builder experience: TWO parallel paper ladders.
 *
 * Two states, one component:
 *   - LIVE (data present): renders the two launched lanes (Lane A / Lane B) with their
 *     real, odds-backed 2-leg cards, combined price, $100 → projected return, and a
 *     PENDING badge. The bankroll only changes after official settlement.
 *   - TEASER (no data): the "coming next / not started yet" hype panel.
 *
 * Pure presentation; lava V1 visuals reuse the global prefers-reduced-motion guard.
 * No real-money copy; no fabricated progress — lanes come from the public artifact.
 */
import { formatAmerican } from "@/lib/odds-math";
import FlagBadge from "@/components/flag-badge";
import type { DualBankBuilder, DualLane, DualLaneLeg } from "@/lib/data-dual-bank-builder";

const GOAL = 10000;
const BASE = 100;

function usd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

const LANE_ACCENT: Record<string, { accent: string; glow: string }> = {
  A: { accent: "var(--gtp-bank-heat)", glow: "rgba(242, 54, 69, 0.25)" },
  B: { accent: "var(--vault-gold)", glow: "rgba(212, 175, 55, 0.22)" },
};

function LegVisual({ leg }: { leg: DualLaneLeg }) {
  if (leg.sport === "world_cup" && (leg.homeCode || leg.awayCode)) {
    return (
      <span className="inline-flex items-center gap-1 shrink-0">
        <FlagBadge code={leg.homeCode || "--"} size="sm" />
        <FlagBadge code={leg.awayCode || "--"} size="sm" />
      </span>
    );
  }
  const id = leg.sportLabel === "MLB" ? "⚾" : leg.sportLabel === "World Cup" ? "⚽" : "•";
  return <span className="shrink-0" style={{ fontSize: 14 }} aria-hidden>{id}</span>;
}

/** Compact 5-step ladder path: Step 1 (live, real $100→return) → … → $10K crown.
 *  Future steps are unfabricated placeholders (no fake projected dollar amounts). */
function StepLadder({ lane, accent }: { lane: DualLane; accent: string }) {
  const steps = [
    { n: 1, label: `$100→$${Math.round(lane.projectedReturn)}`, active: true },
    { n: 2, label: "Step 2" },
    { n: 3, label: "Step 3" },
    { n: 4, label: "Step 4" },
    { n: 5, label: "👑 $10K", crown: true },
  ];
  return (
    <div className="mt-2.5 flex items-center gap-1 overflow-x-auto" aria-label="Ladder path: Step 1 of 5 toward the $10,000 crown">
      {steps.map((s, i) => (
        <span key={s.n} className="flex items-center gap-1 shrink-0">
          <span
            className="font-mono rounded px-1.5 py-1 whitespace-nowrap"
            style={{
              fontSize: 8.5, letterSpacing: "0.04em",
              color: s.active ? "#120A07" : s.crown ? "var(--vault-gold)" : "var(--vault-text-faint)",
              background: s.active ? accent : s.crown ? "rgba(212,175,55,0.12)" : "rgba(26,16,11,0.6)",
              border: s.crown ? "1px solid rgba(212,175,55,0.4)" : "1px solid var(--vault-rule)",
              fontWeight: s.active || s.crown ? 700 : 500,
              boxShadow: s.active ? `0 0 8px ${accent}55` : "none",
            }}
          >
            {s.active ? `① ${s.label}` : s.label}
          </span>
          {i < steps.length - 1 ? <span aria-hidden style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>→</span> : null}
        </span>
      ))}
    </div>
  );
}

function LaneCard({ lane }: { lane: DualLane }) {
  const { accent, glow } = LANE_ACCENT[lane.lane] ?? LANE_ACCENT.A;
  return (
    <div className="relative overflow-hidden rounded-[12px] px-4 py-4" style={{ border: `1px solid ${glow}`, background: "rgba(12,8,6,0.55)" }}>
      <div aria-hidden className="gtp-heat-pulse absolute right-0 top-0 h-20 w-20 translate-x-6 -translate-y-6 rounded-full" style={{ background: `radial-gradient(circle, ${glow}, transparent 70%)`, filter: "blur(8px)" }} />
      <div className="relative flex items-center justify-between gap-2">
        <span className="font-display font-bold tracking-tight" style={{ color: accent, fontSize: 16 }}>{lane.name}</span>
        <span className="rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--gtp-bank-heat)", background: "var(--gtp-bank-heat-dim)" }}>
          Step {/* step */}1 · pending
        </span>
      </div>
      <div className="relative mt-0.5 font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
        {lane.thesis} · {lane.riskTier}
      </div>
      <div className="relative mt-2 flex items-baseline gap-2">
        <span className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 20, fontWeight: 700 }}>
          {usd(lane.stake)} <span style={{ color: "var(--vault-text-faint)", fontWeight: 400 }}>→</span> {usd(Math.round(lane.projectedReturn))}
        </span>
        <span className="font-mono tabular" style={{ color: "var(--vault-success)", fontSize: 12 }}>{formatAmerican(lane.combinedAmericanOdds)}</span>
      </div>
      <div className="relative mt-2.5 flex flex-col gap-1.5">
        {lane.legs.map((l, i) => (
          <div key={i} className="flex items-center gap-2 rounded-[8px] px-2.5 py-2" style={{ background: "rgba(26,16,11,0.5)", border: "1px solid var(--vault-rule)" }}>
            <LegVisual leg={l} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 12 }}>{l.pick}</span>
              <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                {l.sportLabel} · {l.gameLabel} · model {Math.round(l.modelProbability * 100)}%{l.recentForm ? ` · form ${l.recentForm}` : ""}
              </span>
            </span>
            <span className="shrink-0 font-mono tabular" style={{ color: "var(--vault-text)", fontSize: 12 }}>{formatAmerican(l.americanOdds)}</span>
          </div>
        ))}
      </div>
      <StepLadder lane={lane} accent={accent} />
      <p className="relative mt-2 text-[10.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
        {lane.whyThisLane} Joint model probability {Math.round(lane.combinedModelProbability * 100)}% — a two-leg parlay is uncertain. Paper-only; settles on official results.
      </p>
    </div>
  );
}

export default function DualBankBuilderTeaser({ data }: { data?: DualBankBuilder | null }) {
  const live = data && data.status === "pending" && data.lanes.length > 0;
  return (
    <section
      className="gtp-fade-up relative mt-6 overflow-hidden rounded-2xl px-5 py-6 sm:px-7"
      aria-label={live ? "Dual Bank Builder — two live paper lanes" : "Coming next — Dual Bank Builder"}
      style={{
        border: "1px solid var(--lava-border-strong)",
        background:
          "radial-gradient(130% 160% at 0% 100%, rgba(225, 29, 42,0.16) 0%, transparent 55%)," +
          "radial-gradient(130% 160% at 100% 0%, rgba(212, 175, 55,0.10) 0%, transparent 55%)," +
          "linear-gradient(135deg, rgba(26,20,14,0.96) 0%, var(--vault-bg) 72%)",
      }}
    >
      <div aria-hidden className="gtp-heat-pulse absolute -left-8 bottom-0 h-40 w-40 rounded-full" style={{ background: "var(--gtp-bank-lava)", filter: "blur(14px)", opacity: 0.4 }} />

      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 10 }}>
          {live ? "Dual Bank Builder · Step 1 live" : "Coming next"}
        </span>
        <span className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: live ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)", background: live ? "var(--gtp-bank-heat-dim)" : "rgba(255,255,255,0.04)", border: "1px solid var(--vault-rule)" }}>
          {live ? "Two lanes · pending" : "Not started yet"}
        </span>
      </div>

      <h2 className="relative mt-2 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(24px,5vw,38px)", fontWeight: 800, lineHeight: 1.02 }}>
        Dual Bank Builder
      </h2>
      <p className="relative mt-1.5 text-[13.5px]" style={{ color: "var(--vault-text-mute)", maxWidth: 680 }}>
        {live
          ? `Two paper ladders launched today — completely different legs, separate theses, each ${usd(BASE)} chasing the ${usd(GOAL)} crown. Step 1 targets ~${usd(200)}. Paper-only, educational; the bankroll only moves after official settlement.`
          : `Two paper ladders climbing the ${usd(GOAL)} crown at the same time — completely different legs each day, separate risk profiles, separate records. The lanes stay idle until the next run is officially started.`}
      </p>

      {live ? (
        <div className="relative mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data!.lanes.map((lane) => <LaneCard key={lane.lane} lane={lane} />)}
        </div>
      ) : (
        <div className="relative mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(["A", "B"] as const).map((k) => {
            const { accent, glow } = LANE_ACCENT[k];
            return (
              <div key={k} className="relative overflow-hidden rounded-[12px] px-4 py-4" style={{ border: `1px solid ${glow}`, background: "rgba(12,8,6,0.55)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-bold tracking-tight" style={{ color: accent, fontSize: 16 }}>Lane {k}</span>
                  <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>Step 0 · idle</span>
                </div>
                <div className="mt-1 font-display tabular" style={{ color: "var(--vault-text)", fontSize: 22, fontWeight: 700 }}>{usd(BASE)} <span style={{ color: "var(--vault-text-faint)", fontWeight: 400 }}>→</span> {usd(GOAL)}</div>
                <div className="mt-2.5 font-mono uppercase tracking-[0.1em]" style={{ color: accent, fontSize: 9.5 }}>Awaiting kickoff</div>
              </div>
            );
          })}
        </div>
      )}

      <div className="relative mt-4 rounded-[8px] px-3.5 py-2.5" style={{ background: "rgba(212,175,55,0.06)", border: "1px solid var(--vault-rule)" }}>
        <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold)", fontSize: 9.5 }}>Run #1 · completed</span>
        <span className="ml-2 font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>$100 → $10,376.17 · 5–0 · the crown was reached</span>
      </div>
    </section>
  );
}

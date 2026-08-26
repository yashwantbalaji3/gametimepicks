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
import PlayerAvatar from "@/components/player-avatar";
import TeamLogo from "@/components/team-logo";
import type { DualBankBuilder, DualLane, DualLaneLeg } from "@/lib/data-dual-bank-builder";
import type { CrownSummary } from "@/lib/bank-builder/crown-summary";

const GOAL = 10000;
const BASE = 100;

function usd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

const LANE_ACCENT: Record<string, { accent: string; glow: string }> = {
  A: { accent: "var(--gtp-bank-heat)", glow: "color-mix(in srgb, var(--gtp-bank-heat) 25%, transparent)" },
  B: { accent: "var(--vault-gold)", glow: "color-mix(in srgb, var(--vault-gold) 22%, transparent)" },
};

function ResultChip({ result }: { result: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    won: { label: "WON", color: "var(--vault-success)", bg: "color-mix(in srgb, var(--vault-accent-mint-deep) 16%, transparent)" },
    lost: { label: "LOST", color: "var(--gtp-bank-heat)", bg: "var(--gtp-bank-heat-dim)" },
    void: { label: "VOID", color: "var(--vault-text-faint)", bg: "color-mix(in srgb, var(--vault-wash-base) 6%, transparent)" },
    needs_review: { label: "REVIEW", color: "var(--vault-warn)", bg: "color-mix(in srgb, var(--vault-wash-base) 6%, transparent)" },
  };
  const m = map[result] ?? map.needs_review;
  return (
    <span className="shrink-0 rounded px-1.5 py-0.5 font-mono font-bold uppercase tracking-[0.08em]"
      style={{ fontSize: 8.5, color: m.color, background: m.bg, border: "1px solid var(--vault-rule)" }}>
      {m.label}
    </span>
  );
}

function LegVisual({ leg }: { leg: DualLaneLeg }) {
  if (leg.sport === "world_cup" && (leg.homeCode || leg.awayCode)) {
    return (
      <span className="inline-flex items-center gap-1 shrink-0">
        <FlagBadge code={leg.homeCode || "--"} size="sm" />
        <FlagBadge code={leg.awayCode || "--"} size="sm" />
      </span>
    );
  }
  if ((leg.sport === "mlb" || leg.sport === "nba") && leg.playerName) {
    // Real player portrait (MLB Stats / NBA CDN) with initials fallback, + team logo.
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        <PlayerAvatar playerId={leg.playerId ?? null} playerName={leg.playerName} team={leg.team ?? undefined} sport={leg.sport} size="sm" />
        {leg.team ? <TeamLogo team={leg.team} sport={leg.sport} size="sm" ariaLabel={`${leg.team} logo`} /> : null}
      </span>
    );
  }
  const id = leg.sportLabel === "MLB" ? "⚾" : leg.sportLabel === "World Cup" ? "⚽" : "•";
  return <span className="shrink-0" style={{ fontSize: 14 }} aria-hidden>{id}</span>;
}

/** A clickable leg row — summary shows portrait/flags + prop + model prediction + odds;
 *  expanding reveals recent-5 (MLB) or 3-way + both team forms (WC) + the "why" bullets. */
function LegRow({ leg }: { leg: DualLaneLeg }) {
  const hits = leg.recentGames ?? [];
  const line = leg.line ?? 0;
  const over = leg.side === "Over";
  return (
    <details className="group rounded-[8px]" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 50%, transparent)", border: "1px solid var(--vault-rule)" }}>
      <summary className="flex cursor-pointer items-center gap-2 px-2.5 py-2 list-none">
        <LegVisual leg={leg} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 12 }}>{leg.pick}</span>
          <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
            {leg.sportLabel} · {leg.gameLabel}{leg.marketLabel ? ` · ${leg.marketLabel}` : ""} · model {Math.round(leg.modelProbability * 100)}%
          </span>
        </span>
        {leg.result && leg.result !== "pending" ? <ResultChip result={leg.result} /> : null}
        <span className="shrink-0 font-mono tabular flex items-center gap-1" style={{ color: "var(--vault-text)", fontSize: 12 }}>
          {formatAmerican(leg.americanOdds)}
          <span aria-hidden className="transition-transform group-open:rotate-90" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>›</span>
        </span>
      </summary>
      <div className="px-2.5 pb-2.5 flex flex-col gap-2" style={{ borderTop: "1px solid var(--vault-rule)" }}>
        {leg.final ? (
          <div className="mt-2 font-mono" style={{ fontSize: 10.5, color: "var(--vault-text)" }}>
            <span style={{ color: leg.result === "won" ? "var(--vault-success)" : leg.result === "void" ? "var(--vault-text-faint)" : "var(--gtp-bank-heat)" }}>Official:</span> {leg.final}
          </div>
        ) : null}
        {leg.modelPredict ? (
          <div className="mt-2 font-mono" style={{ fontSize: 10.5, color: "var(--vault-text-mute)" }}>
            <span style={{ color: "var(--gtp-bank-heat)" }}>Model read:</span> {leg.modelPredict}
            {leg.opponent ? ` · vs ${leg.opponent}` : ""}
          </div>
        ) : null}

        {/* MLB: recent 5 games vs the line (hit/miss pills) */}
        {leg.sport !== "world_cup" && hits.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>last 5 · {leg.marketLabel ?? "stat"} vs {line}</span>
            <div className="flex flex-wrap gap-1">
              {hits.map((g, i) => {
                const win = over ? g.value > line : g.value < line;
                return (
                  <span key={i} className="font-mono rounded px-1.5 py-0.5" style={{ fontSize: 9, color: "var(--vault-scrim-espresso)", background: win ? "var(--vault-success)" : "var(--gtp-bank-heat)" }}
                    title={`${g.date} ${g.isHome ? "vs" : "@"} ${g.opponent}: ${g.value}`}>
                    {g.value}{win ? "✓" : "✗"}
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* WC: 3-way outcomes + both teams' recent form */}
        {leg.sport === "world_cup" ? (
          <div className="flex flex-col gap-1">
            {(leg.outcomes ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono" style={{ fontSize: 10, color: "var(--vault-text-mute)" }}>
                {(leg.outcomes ?? []).map((o, i) => (
                  <span key={i}>{o.label} {Math.round(o.modelProbability * 100)}%</span>
                ))}
              </div>
            ) : null}
            {[["homeTeam", "homeForm"], ["awayTeam", "awayForm"]].map(([tk, fk]) => {
              const team = leg[tk as "homeTeam" | "awayTeam"];
              const form = leg[fk as "homeForm" | "awayForm"];
              if (!team || !form) return null;
              return (
                <div key={tk} className="flex items-center justify-between font-mono" style={{ fontSize: 10, color: "var(--vault-text-mute)" }}>
                  <span className="truncate">{team}</span>
                  <span className="flex gap-0.5">
                    {form.formString.split("").map((r, i) => (
                      <span key={i} className="inline-flex items-center justify-center font-bold" style={{ width: 11, height: 11, fontSize: 7, borderRadius: 2, color: "var(--vault-scrim-espresso)", background: r === "W" ? "var(--vault-success)" : r === "L" ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)" }}>{r}</span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Why: model reason bullets */}
        {(leg.reasonBullets ?? []).length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {(leg.reasonBullets ?? []).map((b, i) => (
              <li key={i} className="font-mono" style={{ fontSize: 10, color: "var(--vault-text-faint)" }}>
                · <span style={{ color: "var(--vault-text-mute)" }}>{b.label}:</span> {b.text}
              </li>
            ))}
          </ul>
        ) : null}
        <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
          settles on official results · {leg.dataQuality === "A" ? "data A" : "limited data"}
        </span>
      </div>
    </details>
  );
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
              color: s.active ? "var(--vault-scrim-espresso)" : s.crown ? "var(--vault-gold)" : "var(--vault-text-faint)",
              background: s.active ? accent : s.crown ? "color-mix(in srgb, var(--vault-gold) 12%, transparent)" : "color-mix(in srgb, var(--vault-scrim-base) 60%, transparent)",
              border: s.crown ? "1px solid color-mix(in srgb, var(--vault-gold) 40%, transparent)" : "1px solid var(--vault-rule)",
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
  const settled = lane.status === "lost" || lane.status === "won";
  const won = lane.status === "won";
  const statusColor = won ? "var(--vault-success)" : "var(--gtp-bank-heat)";
  const shownReturn = settled ? (typeof lane.return === "number" ? lane.return : 0) : lane.projectedReturn;
  return (
    <div className="relative overflow-hidden rounded-[12px] px-4 py-4" style={{ border: `1px solid ${settled && !won ? "var(--vault-rule)" : glow}`, background: "color-mix(in srgb, var(--lava-bg) 55%, transparent)", opacity: settled && !won ? 0.92 : 1 }}>
      <div aria-hidden className="gtp-heat-pulse absolute right-0 top-0 h-20 w-20 translate-x-6 -translate-y-6 rounded-full" style={{ background: `radial-gradient(circle, ${glow}, transparent 70%)`, filter: "blur(8px)", opacity: settled ? 0.4 : 1 }} />
      <div className="relative flex items-center justify-between gap-2">
        <span className="font-display font-bold tracking-tight" style={{ color: accent, fontSize: 16 }}>{lane.name}</span>
        <span className="rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: statusColor, background: won ? "color-mix(in srgb, var(--vault-accent-mint-deep) 16%, transparent)" : "var(--gtp-bank-heat-dim)" }}>
          Step 1 · {settled ? lane.status : "pending"}
        </span>
      </div>
      <div className="relative mt-0.5 font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
        {lane.thesis} · {lane.riskTier}
      </div>
      <div className="relative mt-2 flex items-baseline gap-2">
        <span className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 20, fontWeight: 700 }}>
          {usd(lane.stake)} <span style={{ color: "var(--vault-text-faint)", fontWeight: 400 }}>→</span> {usd(Math.round(shownReturn))}
        </span>
        <span className="font-mono tabular" style={{ color: settled ? statusColor : "var(--vault-success)", fontSize: 12 }}>{settled ? lane.status.toUpperCase() : formatAmerican(lane.combinedAmericanOdds)}</span>
      </div>
      <div className="relative mt-2.5 flex flex-col gap-1.5">
        {lane.legs.map((l, i) => <LegRow key={i} leg={l} />)}
      </div>
      <span className="relative mt-1 block font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
        {settled ? "tap a leg for the official result, model read & why" : "tap a leg for the model read, recent form & why"}
      </span>
      {settled ? (
        <span className="relative mt-2 block font-mono uppercase tracking-[0.1em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 9 }}>
          Step 1 closed · lane did not advance
        </span>
      ) : (
        <StepLadder lane={lane} accent={accent} />
      )}
      <p className="relative mt-2 text-[10.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
        {lane.whyThisLane} Joint model probability {Math.round(lane.combinedModelProbability * 100)}% — a two-leg parlay is uncertain. Paper-only; settled on official results.
      </p>
    </div>
  );
}

export default function DualBankBuilderTeaser({ data, crown }: { data?: DualBankBuilder | null; crown?: CrownSummary | null }) {
  const live = !!data && data.status === "pending" && data.lanes.length > 0;
  const settled = !!data && (data.status === "settled" || data.status === "closed") && data.lanes.length > 0;
  const show = live || settled;
  const survived = data?.lanesSurvived ?? 0;
  const total = data?.lanes.length ?? 2;
  return (
    <section
      className="gtp-fade-up relative mt-6 overflow-hidden rounded-2xl px-5 py-6 sm:px-7"
      aria-label={live ? "Dual Bank Builder — two live paper lanes" : settled ? "Dual Bank Builder — Step 1 closed, results" : "Coming next — Dual Bank Builder"}
      style={{
        border: "1px solid var(--lava-border-strong)",
        background:
          "radial-gradient(130% 160% at 0% 100%, color-mix(in srgb, var(--gtp-bank-heat) 16%, transparent) 0%, transparent 55%)," +
          "radial-gradient(130% 160% at 100% 0%, color-mix(in srgb, var(--vault-gold) 10%, transparent) 0%, transparent 55%)," +
          "linear-gradient(135deg, color-mix(in srgb, var(--vault-scrim-pine) 96%, transparent) 0%, var(--vault-bg) 72%)",
      }}
    >
      <div aria-hidden className="gtp-heat-pulse absolute -left-8 bottom-0 h-40 w-40 rounded-full" style={{ background: "var(--gtp-bank-lava)", filter: "blur(14px)", opacity: 0.4 }} />

      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 10 }}>
          {live ? "Dual Bank Builder · Step 1 live" : settled ? "Dual Bank Builder · Step 1 closed" : "Coming next"}
        </span>
        <span className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: live ? "var(--gtp-bank-heat)" : settled ? "var(--vault-text-mute)" : "var(--vault-text-faint)", background: live ? "var(--gtp-bank-heat-dim)" : settled ? "color-mix(in srgb, var(--vault-wash-base) 5%, transparent)" : "color-mix(in srgb, var(--vault-wash-base) 4%, transparent)", border: "1px solid var(--vault-rule)" }}>
          {live ? "Two lanes · pending" : settled ? `${survived}/${total} advanced · closed` : "Not started yet"}
        </span>
      </div>

      <h2 className="relative mt-2 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(24px,5vw,38px)", fontWeight: 800, lineHeight: 1.02 }}>
        Dual Bank Builder
      </h2>
      <p className="relative mt-1.5 text-[13.5px]" style={{ color: "var(--vault-text-mute)", maxWidth: 680 }}>
        {live
          ? `Two paper ladders launched today — completely different legs, separate theses, each ${usd(BASE)} chasing the ${usd(GOAL)} crown. Step 1 targets ~${usd(200)}. Paper-only, educational; the bankroll only moves after official settlement.`
          : settled
            ? `The closed test ladder (Step 1) has been officially settled — and ${survived === 0 ? "both lanes lost" : `${survived} of ${total} lanes advanced`}. We show the real outcome of every leg below, including the misses, exactly as the official box scores and match results landed. No lane advances; the run is closed. Tap any leg for the official result and what our model read.`
            : `Two paper ladders climbing the ${usd(GOAL)} crown at the same time — completely different legs each day, separate risk profiles, separate records. The lanes stay idle until the next run is officially started.`}
      </p>

      {show ? (
        <div className="relative mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data!.lanes.map((lane) => <LaneCard key={lane.lane} lane={lane} />)}
        </div>
      ) : (
        <div className="relative mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(["A", "B"] as const).map((k) => {
            const { accent, glow } = LANE_ACCENT[k];
            return (
              <div key={k} className="relative overflow-hidden rounded-[12px] px-4 py-4" style={{ border: `1px solid ${glow}`, background: "color-mix(in srgb, var(--lava-bg) 55%, transparent)" }}>
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

      {settled ? (
        <div className="relative mt-5 rounded-[10px] px-4 py-3.5" style={{ background: "color-mix(in srgb, var(--gtp-bank-heat) 6%, transparent)", border: "1px solid var(--lava-border-strong)" }}>
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 10 }}>What we learned</span>
          <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
            The closed test ladder went {survived}/{total}. The legs cleared our model thresholds but still missed:
            a low-line hitter went hitless, a star beat a low Under, and one prop voided when the
            player was rested (DNP). The honest takeaway — a high model probability on a single
            volatile player prop is not enough to anchor a ladder.
          </p>
          <ul className="mt-2 space-y-1 text-[11.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            <li>• Player-prop legs carry <strong style={{ color: "var(--vault-text-mute)" }}>DNP risk</strong> — no lineup confirmation, no leg.</li>
            <li>• Low-variance team markets (double chance / DNB) held up better than single-hitter props.</li>
            <li>• Two-leg parlays are still coin-flips at these odds; survival needs a stricter eligibility gate.</li>
          </ul>
          <p className="mt-2 text-[11px]" style={{ color: "var(--vault-text-faint)" }}>
            Next run is paused until the Bank Builder V2 eligibility model (volatility + DNP + lineup
            gates) is in place. Full breakdown in the failure audit.
          </p>
        </div>
      ) : null}

      <div className="relative mt-4 rounded-[8px] px-3.5 py-2.5" style={{ background: "color-mix(in srgb, var(--vault-gold) 6%, transparent)", border: "1px solid var(--vault-rule)" }}>
        <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold)", fontSize: 9.5 }}>Completed ladder</span>
        <span className="ml-2 font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>{crown ? `${crown.pathLabel} · ${crown.recordLabel} · ` : ""}the crown was reached</span>
      </div>
    </section>
  );
}

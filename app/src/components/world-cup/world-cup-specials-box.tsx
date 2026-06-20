/**
 * World Cup Specials — homepage feature box of 5 Moonshot-style, World-Cup-ONLY paper parlays.
 * Visually distinct (gold/lava "trophy" treatment) from the Moonshot Lane (moon/indigo) and the
 * Dual Bank Builder, so the three are never confused. Renders each card's exact legs (player photos
 * / team flags / opponent / kickoff), the $10 projected return, combined odds, the team/player mix,
 * and a drawer with why-this-card / correlation-disclosure / why-it-can-fail / settlement / data
 * quality. Higher-variance by design — never framed as lower-risk. Paper-only. Server-rendered;
 * the expand drawers use native <details> (no client JS, static-export compatible).
 */
import Link from "next/link";
import FlagBadge from "@/components/flag-badge";
import type { SpecialLeg, WorldCupSpecialCard, WorldCupSpecialsResult } from "@/lib/world-cup/world-cup-specials";

const GOLD = "var(--vault-gold, #D4AF37)";
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const american = (o: number) => (o > 0 ? `+${o}` : `${o}`);
const shortStart = (iso: string | null) => {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }) + " UTC";
};

function LegAvatar({ leg }: { leg: SpecialLeg }) {
  if (leg.kind === "player" && leg.photoUrl) {
    return (
      <span className="relative inline-block shrink-0" style={{ width: 26, height: 26 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={leg.photoUrl} alt={leg.participant} width={26} height={26} loading="lazy" className="rounded-full object-cover"
          style={{ width: 26, height: 26, border: "1px solid var(--vault-border)", background: "rgba(255,255,255,0.04)" }} />
        {leg.countryCode && (
          <span className="absolute -bottom-1 -right-1" style={{ transform: "scale(0.6)", transformOrigin: "bottom right" }}>
            <FlagBadge code={leg.countryCode} size="sm" ariaLabel={leg.team ?? ""} />
          </span>
        )}
      </span>
    );
  }
  if (leg.countryCode) return <span className="shrink-0"><FlagBadge code={leg.countryCode} size="sm" ariaLabel={leg.participant} /></span>;
  // Match-level market (Total Goals / Both Teams To Score) — no single team → a neutral match chip.
  return (
    <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-[11px]"
      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--vault-border)" }} aria-label="Match market">⚽</span>
  );
}

function LegRow({ leg }: { leg: SpecialLeg }) {
  const pick = `${leg.marketLabel}${leg.kind === "player" && leg.side && leg.side !== "Yes" ? ` ${leg.side}` : ""}${leg.line != null ? ` ${leg.line}` : ""}`.trim();
  // Player / single-team legs show "vs {opponent}"; match-level legs show the fixture.
  const where = leg.opponent ? `vs ${leg.opponent}` : leg.fixture;
  const matchup = [where, shortStart(leg.startTime)].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-2 py-1.5" style={{ borderTop: "1px solid var(--vault-border)" }}>
      <LegAvatar leg={leg} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium" style={{ color: "var(--vault-text)" }}>{leg.participant}</span>
          {leg.kind === "player" && leg.roleTier === "confirmed_starter" && (
            <span className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.05em]" style={{ color: "var(--vault-success)", background: "rgba(110,231,168,0.2)", border: "1px solid rgba(110,231,168,0.6)" }}>Confirmed starter</span>
          )}
          {leg.kind === "player" && leg.roleTier === "key_attacker" && (
            <span className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.05em]" style={{ color: "var(--vault-success)", background: "rgba(110,231,168,0.12)", border: "1px solid rgba(110,231,168,0.4)" }}>Key attacker</span>
          )}
          {leg.kind === "player" && leg.roleTier === "projected_starter" && (
            <span className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.05em]" style={{ color: "var(--vault-success)", background: "rgba(110,231,168,0.1)", border: "1px solid rgba(110,231,168,0.3)" }}>Projected starter</span>
          )}
        </span>
        <span className="block truncate text-[11px]" style={{ color: "var(--vault-text-mute)" }}>{pick}</span>
        {matchup && <span className="block truncate font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>{matchup}</span>}
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-[12px]" style={{ color: "var(--vault-text)" }}>{american(leg.odds)}</span>
        <span className="block font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>model {Math.round(leg.modelProbability * 100)}%</span>
      </span>
    </div>
  );
}

function SpecialCard({ card, index }: { card: WorldCupSpecialCard; index: number }) {
  return (
    <div className="overflow-hidden rounded-xl px-3.5 py-3" style={{ border: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.015)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}>
          <span style={{ color: GOLD }}>Special #{index + 1}</span> · {card.title}
        </span>
        <span className="font-mono text-[12px]" style={{ color: GOLD }}>{american(card.combinedOdds)} combined</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
        <span style={{ color: "var(--vault-text-mute)" }}>{usd(card.stakePreview)} → {usd(card.projectedReturn)}</span>
        <span>· {card.legs.length} legs · {card.games.length} games</span>
        <span>· {card.teamPropCount} team / {card.playerPropCount} player</span>
        <span>· model {Math.round(card.jointModelProbability * 100)}% all-hit</span>
      </div>
      {card.roleQualitySummary && (
        <div className="mt-1 rounded-md px-2 py-1 text-[10.5px]" style={{ background: "rgba(110,231,168,0.06)", color: "var(--vault-text-mute)" }}>
          <span className="font-mono uppercase tracking-[0.06em]" style={{ color: "var(--vault-success)", fontSize: 9 }}>role-screened</span> · {card.roleQualitySummary}
        </div>
      )}
      <div className="mt-1.5">{card.legs.map((l) => <LegRow key={l.legId} leg={l} />)}</div>
      <details className="mt-2">
        <summary className="cursor-pointer font-mono text-[10.5px]" style={{ color: GOLD, listStyle: "none" }}>
          Why this card · correlation · how it fails ▾
        </summary>
        <div className="mt-1.5 space-y-1 text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
          {card.whyThisCard.map((w, i) => <div key={`w${i}`}><span style={{ color: "var(--vault-success)" }}>Why:</span> {w}</div>)}
          <div>
            <span className="font-mono text-[10px] uppercase" style={{ color: GOLD }}>correlation:</span>{" "}
            {card.correlationProfile.replace(/_/g, " ")} — correlation-disclosed, not hidden.
          </div>
          {card.whyItCanFail.map((w, i) => <div key={`f${i}`}><span style={{ color: "var(--gtp-bank-heat)" }}>Risk:</span> {w}</div>)}
          <div style={{ color: "var(--vault-text-faint)" }}>
            Data quality: {card.dataQuality}. Player props are limited-data / market-implied (lineups not yet posted).
          </div>
          <div style={{ color: "var(--vault-text-faint)" }}>Official settlement: {card.settlementNotes.join(" · ")}.</div>
        </div>
      </details>
    </div>
  );
}

export default function WorldCupSpecialsBox({ data }: { data: WorldCupSpecialsResult | null }) {
  const cards = data?.cards ?? [];
  return (
    <section className="gtp-fade-up" aria-label="World Cup Specials">
      <div className="overflow-hidden rounded-2xl p-4 sm:p-5"
        style={{ border: `1px solid ${GOLD}`, background: "linear-gradient(135deg, rgba(212,175,55,0.10), rgba(225,29,42,0.06) 55%, rgba(26,16,11,0.30))" }}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800 }}>🏆 World Cup Specials</h2>
            <p className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
              Moonshot-style World Cup parlays built from role-screened player props and team anchors.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["High-volatility", "Paper-only", "Role-screened", "Odds-backed"].map((b) => (
              <span key={b} className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{ color: GOLD, background: "rgba(212,175,55,0.12)", border: `1px solid ${GOLD}` }}>{b}</span>
            ))}
          </div>
        </div>
        <p className="mb-3 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>
          A separate, World-Cup-only set of high-volatility paper longshots — <strong style={{ color: "var(--vault-text-mute)" }}>not</strong> the Moonshot Lane and{" "}
          <strong style={{ color: "var(--vault-text-mute)" }}>not</strong> the Dual Bank Builder. Model-ranked · combined {american(data?.config.minCombinedOdds ?? 700)}..{american(data?.config.maxCombinedOdds ?? 3000)} ·
          per-leg {american(data?.config.minLegOdds ?? -250)}..{american(data?.config.maxLegOdds ?? 200)}. Higher variance by design.
        </p>

        {cards.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {cards.map((c, i) => <SpecialCard key={c.id} card={c} index={i} />)}
          </div>
        ) : (
          <div className="rounded-xl px-3.5 py-4 text-[12px]" style={{ border: "1px dashed var(--vault-rule)", color: "var(--vault-text-mute)" }}>
            <p className="font-semibold" style={{ color: "var(--vault-text)" }}>No World Cup Specials available yet.</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4" style={{ color: "var(--vault-text-faint)" }}>
              {(data?.diagnostics.notes ?? ["World Cup markets are not currently available."]).map((n, i) => <li key={i}>{n}</li>)}
              {data && (
                <li>Eligible pool: {data.diagnostics.eligibleTeamLegs} team + {data.diagnostics.eligiblePlayerLegs} player legs across {data.diagnostics.preEventGames} pre-event game{data.diagnostics.preEventGames === 1 ? "" : "s"}.</li>
              )}
            </ul>
          </div>
        )}

        <Link href="/world-cup" className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: GOLD }}>
          More World Cup projections &amp; cards →
        </Link>
      </div>
    </section>
  );
}

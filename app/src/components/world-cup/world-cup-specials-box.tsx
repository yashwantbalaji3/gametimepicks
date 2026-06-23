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

/** Per-leg settlement badge: HIT (green ✓) · MISS (red ✗) · PENDING (grey ◷). */
const LEG_STATUS_META: Record<NonNullable<SpecialLeg["settlementStatus"]>, { label: string; glyph: string; color: string; bg: string; border: string }> = {
  hit: { label: "Hit", glyph: "✓", color: "var(--vault-success)", bg: "rgba(110,231,168,0.16)", border: "rgba(110,231,168,0.5)" },
  miss: { label: "Miss", glyph: "✗", color: "var(--gtp-bank-heat)", bg: "rgba(242,54,69,0.14)", border: "rgba(242,54,69,0.45)" },
  pending: { label: "Pending", glyph: "◷", color: "var(--vault-text-faint)", bg: "rgba(255,255,255,0.05)", border: "var(--vault-rule)" },
};

function LegStatusBadge({ status }: { status: NonNullable<SpecialLeg["settlementStatus"]> }) {
  const m = LEG_STATUS_META[status];
  return (
    <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.05em]"
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.border}` }}>
      <span aria-hidden>{m.glyph}</span>{m.label}
    </span>
  );
}

function LegRow({ leg }: { leg: SpecialLeg }) {
  const pick = `${leg.marketLabel}${leg.kind === "player" && leg.side && leg.side !== "Yes" ? ` ${leg.side}` : ""}${leg.line != null ? ` ${leg.line}` : ""}`.trim();
  // Player / single-team legs show "vs {opponent}"; match-level legs show the fixture.
  const where = leg.opponent ? `vs ${leg.opponent}` : leg.fixture;
  const matchup = [where, shortStart(leg.startTime)].filter(Boolean).join(" · ");
  const status = leg.settlementStatus;
  return (
    <div className="flex items-center gap-2 py-1.5" style={{ borderTop: "1px solid var(--vault-border)" }}>
      <LegAvatar leg={leg} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium" style={{ color: "var(--vault-text)" }}>{leg.participant}</span>
          {status && <LegStatusBadge status={status} />}
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
        {leg.settlementReason && (
          <span className="block truncate font-mono text-[10px]" style={{ color: status ? LEG_STATUS_META[status].color : "var(--vault-text-faint)", opacity: 0.85 }}>
            {leg.settlementReason}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-[12px]" style={{ color: "var(--vault-text)" }}>{american(leg.odds)}</span>
        <span className="block font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>model {Math.round(leg.modelProbability * 100)}%</span>
      </span>
    </div>
  );
}

/** Card-level status pill: WON (green) · LOST (red/muted) · PENDING (amber). */
const CARD_STATUS_META: Record<NonNullable<WorldCupSpecialCard["cardStatus"]>, { label: string; color: string; bg: string; border: string }> = {
  won: { label: "Won", color: "var(--vault-success)", bg: "rgba(110,231,168,0.16)", border: "rgba(110,231,168,0.5)" },
  lost: { label: "Lost", color: "var(--gtp-bank-heat)", bg: "rgba(242,54,69,0.12)", border: "rgba(242,54,69,0.4)" },
  pending: { label: "Pending", color: GOLD, bg: "rgba(212,175,55,0.12)", border: GOLD },
};

function SpecialCard({ card, index }: { card: WorldCupSpecialCard; index: number }) {
  const cardStatus = card.cardStatus;
  const settled = cardStatus === "won" || cardStatus === "lost";
  const sm = cardStatus ? CARD_STATUS_META[cardStatus] : null;
  // Count graded legs so a settled card reads as a reviewed result, not a pre-event longshot.
  const hits = card.legs.filter((l) => l.settlementStatus === "hit").length;
  const misses = card.legs.filter((l) => l.settlementStatus === "miss").length;
  const pendingLegs = card.legs.filter((l) => l.settlementStatus === "pending").length;
  return (
    <div className="overflow-hidden rounded-xl px-3.5 py-3" style={{ border: `1px solid ${settled ? sm!.border : "var(--vault-rule)"}`, background: "rgba(255,255,255,0.015)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}>
          <span style={{ color: GOLD }}>Special #{index + 1}</span> · {card.title}
        </span>
        <span className="flex items-center gap-2">
          {sm && (
            <span className="rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.07em]"
              style={{ color: sm.color, background: sm.bg, border: `1px solid ${sm.border}` }}>{sm.label}</span>
          )}
          <span className="font-mono text-[12px]" style={{ color: GOLD }}>{american(card.combinedOdds)} combined</span>
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
        <span style={{ color: "var(--vault-text-mute)" }}>{usd(card.stakePreview)} → {usd(card.projectedReturn)}</span>
        <span>· {card.legs.length} legs · {card.games.length} games</span>
        <span>· {card.teamPropCount} team / {card.playerPropCount} player</span>
        {settled
          ? <span>· {hits} hit / {misses} miss{pendingLegs ? ` / ${pendingLegs} pending` : ""}</span>
          : <span>· model {Math.round(card.jointModelProbability * 100)}% all-hit</span>}
      </div>
      {settled && (
        <div className="mt-1 rounded-md px-2 py-1 text-[10.5px]" style={{ background: sm!.bg, color: "var(--vault-text-mute)" }}>
          <span className="font-mono uppercase tracking-[0.06em]" style={{ color: sm!.color, fontSize: 9 }}>official result</span>
          {" · "}Settled card shown for review — graded leg-by-leg from the official 90-minute result, not a pre-event pick.
        </div>
      )}
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

/** "Jun 21" from an ISO date (YYYY-MM-DD) — UTC-noon math avoids off-by-one. */
function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function WorldCupSpecialsBox({ data }: { data: WorldCupSpecialsResult | null }) {
  const cards = data?.cards ?? [];
  // When every card is settled (won/lost), the header reads honestly as a settled review rather than
  // implying upcoming pre-event picks. A card with no cardStatus counts as still pre-event.
  const settledCards = cards.filter((c) => c.cardStatus === "won" || c.cardStatus === "lost");
  const allSettled = cards.length > 0 && settledCards.length === cards.length;
  const dateLabel = shortDate(data?.date);
  const headerTitle = allSettled
    ? `🏆 World Cup Specials${dateLabel ? ` — ${dateLabel}` : ""} (settled)`
    : "🏆 World Cup Specials";
  const headerSub = allSettled
    ? "Settled review — every card graded leg-by-leg from the official 90-minute result. Paper-only."
    : "Moonshot-style World Cup parlays built from role-screened player props and team anchors.";
  const badges = allSettled
    ? ["Settled", "Paper-only", "Official result", "Higher-volatility"]
    : ["High-volatility", "Paper-only", "Role-screened", "Odds-backed"];
  return (
    <section className="gtp-fade-up" aria-label="World Cup Specials">
      <div className="overflow-hidden rounded-2xl p-4 sm:p-5"
        style={{ border: `1px solid ${GOLD}`, background: "linear-gradient(135deg, rgba(212,175,55,0.10), rgba(225,29,42,0.06) 55%, rgba(26,16,11,0.30))" }}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800 }}>{headerTitle}</h2>
            <p className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>{headerSub}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <span key={b} className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{ color: GOLD, background: "rgba(212,175,55,0.12)", border: `1px solid ${GOLD}` }}>{b}</span>
            ))}
          </div>
        </div>
        <p className="mb-3 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>
          A separate, World-Cup-only set of high-volatility paper longshots — <strong style={{ color: "var(--vault-text-mute)" }}>not</strong> the Moonshot Lane and{" "}
          <strong style={{ color: "var(--vault-text-mute)" }}>not</strong> the Dual Bank Builder. {allSettled ? "Graded from official sources · " : "Model-ranked · "}combined {american(data?.config.minCombinedOdds ?? 700)}..{american(data?.config.maxCombinedOdds ?? 3000)} ·
          per-leg {american(data?.config.minLegOdds ?? -250)}..{american(data?.config.maxLegOdds ?? 200)}. Higher variance by design.
        </p>
        <Link href="/world-cup-specials" className="mb-3 inline-flex items-center gap-1 rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{ border: `1px solid ${GOLD}`, color: GOLD, textDecoration: "none" }}>
          Open the World Cup Specials tracker →
        </Link>

        {cards.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {cards.map((c, i) => <SpecialCard key={c.id} card={c} index={i} />)}
          </div>
        ) : (
          <div className="rounded-xl px-3.5 py-4 text-[12px]" style={{ border: "1px dashed var(--vault-rule)", color: "var(--vault-text-mute)" }}>
            <p className="font-semibold" style={{ color: "var(--vault-text)" }}>No eligible World Cup Specials for the current slate.</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4" style={{ color: "var(--vault-text-faint)" }}>
              <li>World Cup Specials need at least two pre-event games — they post once the next multi-game slate&apos;s odds and player props are available.</li>
              {data && Number(data.diagnostics.preEventGames) > 0 && (
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

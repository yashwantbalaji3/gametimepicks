/**
 * GameDetailPage — one fixture, presented like a premium betting-analytics card (paper-only):
 *   Hero → Model spotlight (top team pick · top player model pick · best lower-variance + higher-return
 *   card) → Suggested parlays (prominent) → Player model picks (full inventory secondary) → Team props
 *   → Markets. Tabbed (SportShell), mobile-first, shared kit only. All real data — honest empty states
 *   where a market/prop/card isn't offered; never fabricated.
 */
import Link from "next/link";
import type { PublicGameDetail } from "@/lib/game-detail";
import type { PublicProjection } from "@/lib/normalize";
import SportShell, { type ShellTab } from "@/components/ui/sport-shell";
import TeamMark from "@/components/ui/team-mark";
import CompetitionBadge from "@/components/ui/competition-badge";
import { getSportIdentity } from "@/lib/sport-identity";
import { teamByName } from "@/lib/data-world-cup";
import SectionHeader from "@/components/section-header";
import SuggestedCard from "@/components/ui/suggested-card";
import ProjectionCard from "@/components/ui/projection-card";
import PlayerPropsExplorer from "@/components/ui/player-props-explorer";
import PlayerPropCard from "@/components/ui/player-prop-card";
import PlayerAvatar from "@/components/ui/player-avatar";
import StatusChip from "@/components/ui/status-chip";
import { ParlayCard } from "@/components/parlays/parlays-explorer";
import type { GameSpecificCards } from "@/lib/world-cup/game-specific-cards";
import { worldCupPlayerModelPicks, isLimitedDataProps } from "@/lib/world-cup/player-model-picks";

import { RISK_LABELS } from "@/lib/parlays/risk-taxonomy";
const RISK_LABEL: Record<string, string> = RISK_LABELS;
const RISK_ORDER = ["low", "medium", "high", "longshot"] as const;
const STATUS_LABEL: Record<string, string> = { live: "Live", pending: "Pending", unavailable: "Market unavailable", model_only: "Model only" };
const MODEL_PICKS_N = 8;

const american = (o?: number | null) => (o == null ? "—" : o > 0 ? `+${o}` : `${o}`);
const pct = (n?: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

/** A compact spotlight tile — the single strongest read of a kind, with a "where to find the rest" hint. */
function SpotlightTile({ eyebrow, title, sub, meta, accent, foot }: {
  eyebrow: string; title: string; sub?: string; meta?: React.ReactNode; accent?: string; foot?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[12px] px-4 py-3.5" style={{ background: "rgba(26, 16, 11,0.6)", border: `1px solid ${accent ?? "var(--vault-border)"}` }}>
      <span className="font-mono uppercase tracking-[0.13em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>{eyebrow}</span>
      <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700, lineHeight: 1.1 }}>{title}</span>
      {sub ? <span style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>{sub}</span> : null}
      {meta ? <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{meta}</span> : null}
      {foot ? <span className="mt-0.5 font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{foot}</span> : null}
    </div>
  );
}

function EmptyTile({ eyebrow, note }: { eyebrow: string; note: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[12px] px-4 py-3.5" style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed var(--vault-border)" }}>
      <span className="font-mono uppercase tracking-[0.13em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{eyebrow}</span>
      <span style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>{note}</span>
    </div>
  );
}

export default function GameDetailPage({ detail, engineCards, multiGameCards }: { detail: PublicGameDetail; engineCards?: GameSpecificCards | null; multiGameCards?: GameSpecificCards | null }) {
  const identity = getSportIdentity(detail.sport);
  const homeCode = detail.sport === "world_cup" && detail.homeTeam ? teamByName(detail.homeTeam)?.code ?? "" : "";
  const awayCode = detail.sport === "world_cup" && detail.awayTeam ? teamByName(detail.awayTeam)?.code ?? "" : "";

  // ── Model spotlight inputs (real data only) ──
  const topProj = [...detail.teamProjections].sort((a, b) => Math.abs(b.edgePct ?? 0) - Math.abs(a.edgePct ?? 0))[0] ?? null;
  const modelPicks = worldCupPlayerModelPicks(detail.playerProps, MODEL_PICKS_N);
  const topPlayer = modelPicks[0] ?? null;
  const limitedData = isLimitedDataProps(detail.playerProps);
  const allCards = engineCards?.cards ?? [];
  const bestLowCard = (engineCards?.byRisk.low ?? [])[0] ?? (engineCards?.byRisk.medium ?? [])[0] ?? null;
  const bestReturnCard = allCards.length
    ? [...allCards].sort((a, b) => (b.combinedOdds ?? -1e9) - (a.combinedOdds ?? -1e9))[0]
    : null;
  const engineTotal = engineCards?.total ?? 0;
  const marketLabels = [...new Set(detail.playerProps.map((p) => p.marketLabel))];

  const spotlight = (
    <section className="flex flex-col gap-2.5">
      <SectionHeader eyebrow="Model spotlight" title="The strongest reads for this match" sub="Model-ranked, paper-only — pulled from the current odds and the model gates. Full detail in the tabs below." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {topProj ? (
          <SpotlightTile eyebrow={`Top team model pick · ${topProj.marketLabel}`} title={topProj.pickLabel}
            meta={`${american(topProj.americanOdds)} · model ${pct(topProj.modelProbability)} · market ${pct(topProj.marketProbability)} · edge ${(topProj.edgePct ?? 0) >= 0 ? "+" : ""}${(topProj.edgePct ?? 0).toFixed(1)}%`}
            accent="rgba(242,54,69,0.35)" foot="Team & game props tab" />
        ) : <EmptyTile eyebrow="Top team model pick" note="No team projection posted for this fixture yet." />}

        {topPlayer ? (
          <div className="flex items-center gap-3 rounded-[12px] px-4 py-3.5" style={{ background: "rgba(26, 16, 11,0.6)", border: "1px solid rgba(217,164,65,0.35)" }}>
            <PlayerAvatar name={topPlayer.player?.name ?? "—"} photo={topPlayer.player?.photo} size={40} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-mono uppercase tracking-[0.13em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>Top player model pick · {topPlayer.marketLabel}</span>
              <span className="font-display truncate" style={{ color: "var(--vault-text)", fontSize: 15.5, fontWeight: 700 }}>{topPlayer.player?.name}</span>
              <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{topPlayer.pickLabel}{topPlayer.line != null ? ` ${topPlayer.line}` : ""} · {american(topPlayer.americanOdds)} · market {pct(topPlayer.marketProbability)}{limitedData ? " · limited-data" : ""}</span>
            </div>
          </div>
        ) : <EmptyTile eyebrow="Top player model pick" note="No odds-backed player props posted for this fixture yet." />}

        {bestLowCard ? (
          <SpotlightTile eyebrow={`Best lower-variance card · ${RISK_LABEL[bestLowCard.riskLevel] ?? bestLowCard.riskLevel}`} title={`${bestLowCard.legs.length} legs · ${american(bestLowCard.combinedOdds)}`}
            sub={bestLowCard.whyThisParlay?.[0]} meta={bestLowCard.payoutMultiple ? `${bestLowCard.payoutMultiple.toFixed(2)}x payout · paper` : "paper-only"} foot="Suggested parlays tab" />
        ) : <EmptyTile eyebrow="Best lower-variance card" note="No lower-variance card passed the model gates for this match." />}

        {bestReturnCard ? (
          <SpotlightTile eyebrow={`Best higher-return card · ${RISK_LABEL[bestReturnCard.riskLevel] ?? bestReturnCard.riskLevel}`} title={`${bestReturnCard.legs.length} legs · ${american(bestReturnCard.combinedOdds)}`}
            sub={bestReturnCard.whyThisParlay?.[0]} meta={bestReturnCard.payoutMultiple ? `${bestReturnCard.payoutMultiple.toFixed(2)}x payout · paper` : "paper-only"} foot="Suggested parlays tab" />
        ) : <EmptyTile eyebrow="Best higher-return card" note="No higher-return card passed the model gates for this match." />}
      </div>
      {detail.caveats.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-1">
          {detail.caveats.map((c, i) => <li key={i} className="text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>· {c}</li>)}
        </ul>
      ) : null}
    </section>
  );

  // ── Tab: Suggested parlays (prominent, by risk) ──
  const cardsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow={`Model-built cards · ${engineTotal}`} title="Model-built cards for this match" sub="Paper-only cards generated from current odds and model gates, by risk. Tap any leg for model + market detail." />
      {engineTotal > 0 ? (
        RISK_ORDER.map((lvl) => {
          const cards = engineCards?.byRisk[lvl] ?? [];
          return (
            <div key={lvl} className="flex flex-col gap-2.5">
              <div className="text-[12.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--vault-text-faint)" }}>{RISK_LABEL[lvl]} · {cards.length}</div>
              {cards.length > 0
                ? cards.map((c) => <ParlayCard key={c.parlayId} card={c} />)
                : <div className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)", color: "var(--vault-text-faint)" }}>No {RISK_LABEL[lvl].toLowerCase()} card passed the gates for this match.</div>}
            </div>
          );
        })
      ) : (
        <div className="rounded-xl px-4 py-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)" }}>
          <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No game-specific cards passed the gate for this match{detail.homeTeam ? ` (${detail.homeTeam} vs ${detail.awayTeam})` : ""}. Build your own from this game&apos;s eligible legs, or browse all of today&apos;s cards on <Link href="/parlays" style={{ color: "var(--vault-gold-bright)" }}>Parlays</Link>.</p>
          <Link href={detail.buildUrl} className="mt-2 inline-flex font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>Build from this game →</Link>
        </div>
      )}
      {multiGameCards && multiGameCards.total > 0 ? (
        <div className="flex flex-col gap-2.5">
          <SectionHeader eyebrow={`Across the slate · ${multiGameCards.total}`} title="This game in multi-game cards" sub="Today's World Cup multi-game cards that include this match, by risk. Full set on Parlay Lab." />
          {RISK_ORDER.map((lvl) => {
            const cards = multiGameCards!.byRisk[lvl] ?? [];
            if (cards.length === 0) return null;
            return (
              <div key={`mg-${lvl}`} className="flex flex-col gap-2.5">
                <div className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--vault-text-faint)" }}>{RISK_LABEL[lvl]} · {cards.length}</div>
                {cards.map((c) => <ParlayCard key={`mg-${c.parlayId}`} card={c} />)}
              </div>
            );
          })}
          <Link href="/parlays?sport=world_cup" className="inline-flex font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>All World Cup multi-game cards →</Link>
        </div>
      ) : null}
      {detail.suggestedCards.length > 0 ? (
        <div className="flex flex-col gap-3">
          <SectionHeader eyebrow={`Also · ${detail.suggestedCards.length}`} title="Fixture cards" sub="Cards built from this fixture's positive-edge projections." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {detail.suggestedCards.map((c) => <SuggestedCard key={c.id} card={c} />)}
          </div>
        </div>
      ) : null}
    </div>
  );

  // ── Tab: Player props — model picks default, full inventory secondary ──
  const playerPropsTab = (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <SectionHeader eyebrow={`Model player props · ${modelPicks.length}`} title="Top model player props" sub="The recommended side per player, model-ranked. One pick per market — not the full both-sides inventory." />
        {marketLabels.length > 0 ? (
          <p className="text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>
            Markets posted for this fixture: {marketLabels.join(" · ")}. {limitedData ? "Limited-data — market-implied prices, no independent model edge yet. " : ""}Additional player markets (assists, shots, cards, …) appear here automatically when the books post odds — never shown without real prices.
          </p>
        ) : null}
        {modelPicks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {modelPicks.map((p) => <PlayerPropCard key={p.id} p={p} />)}
          </div>
        ) : (
          <div className="rounded-[10px] px-4 py-8 text-center" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
            <p style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>No model player picks yet</p>
            <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>Player props are not posted from the current books for this fixture yet. Soccer player props post near lineup time.</p>
          </div>
        )}
      </div>
      {detail.playerProps.length > modelPicks.length ? (
        <details className="rounded-[10px]" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid var(--vault-border)" }}>
          <summary className="cursor-pointer px-4 py-3 font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11, listStyle: "none" }}>
            View full prop inventory · {detail.playerProps.length} ▾
          </summary>
          <div className="px-3 pb-3 pt-1">
            <PlayerPropsExplorer props={detail.playerProps} />
          </div>
        </details>
      ) : null}
    </div>
  );

  // ── Tab: Team & game props ──
  const projectionsTab = (
    <div className="flex flex-col gap-3">
      <SectionHeader eyebrow={`Projections · ${detail.teamProjections.length}`} title="Team & game projections" sub="Model probability vs the market price, with edge, for this fixture." />
      {detail.teamProjections.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {detail.teamProjections.map((p) => <ProjectionCard key={p.id} p={p} />)}
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>This sport is player-prop based — see the Player props tab for this game&apos;s projections.</p>
      )}
    </div>
  );

  // ── Tab: Markets ──
  const marketsTab = (
    <div className="flex flex-col gap-3">
      <SectionHeader eyebrow="Markets" title="What's available for this game" sub="We only show markets a real book is pricing. Pending/unavailable markets are labeled, never faked." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {detail.dataStatus.map((d) => (
          <div key={d.label} className="flex items-center justify-between gap-2 rounded-[8px] px-3 py-2.5" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
            <div className="flex flex-col min-w-0">
              <span style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{d.label}</span>
              {d.detail ? <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{d.detail}</span> : null}
            </div>
            <StatusChip label={STATUS_LABEL[d.status] ?? d.status} />
          </div>
        ))}
      </div>
      <Link href="/learn#sports" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>How soccer markets work →</Link>
    </div>
  );

  const tabs: ShellTab[] = [
    { key: "cards", label: "Suggested parlays", badge: (engineTotal + detail.suggestedCards.length) || null, content: cardsTab },
    { key: "player-props", label: "Player props", badge: detail.playerProps.length || null, content: playerPropsTab },
    { key: "projections", label: "Team & game props", badge: detail.teamProjections.length || null, content: projectionsTab },
    { key: "markets", label: "Markets", content: marketsTab },
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-10 overflow-x-hidden">
      <div className="mb-2">
        <Link href="/games" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>← All games</Link>
      </div>
      {/* Hero / matchup */}
      <section className="relative overflow-hidden rounded-[14px] px-5 py-6 mb-5" style={{ border: "1px solid var(--vault-border-strong)", background: "radial-gradient(120% 150% at 0% 0%, rgba(242, 54, 69,0.10) 0%, transparent 55%), linear-gradient(135deg, rgba(22,30,62,0.94) 0%, rgba(26, 16, 11,0.97) 100%)" }}>
        <span className="flex items-center gap-2">
          <span className="gtp-sport-orb shrink-0" style={{ width: 26, height: 26, fontSize: 14, ["--orb-grad" as string]: identity.gradient }} role="img" aria-label={identity.ballLabel}>{identity.icon}</span>
          <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>{detail.date}{detail.venue ? " · " + detail.venue : ""}</span>
          <CompetitionBadge sport={detail.sport} size="sm" />
        </span>
        <div className="mt-1.5 flex items-center gap-3 min-w-0">
          {homeCode || awayCode || detail.homeLogo || detail.awayLogo ? (
            <span className="inline-flex items-center gap-1.5 shrink-0" aria-label={`${detail.homeTeam} versus ${detail.awayTeam}`}>
              <TeamMark name={detail.homeTeam} logoUrl={detail.homeLogo} flagCode={homeCode} size="lg" />
              <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>v</span>
              <TeamMark name={detail.awayTeam} logoUrl={detail.awayLogo} flagCode={awayCode} size="lg" />
            </span>
          ) : null}
          <h1 className="font-display tracking-tight truncate" style={{ color: "var(--vault-text)", fontSize: "clamp(22px,4.5vw,32px)", fontWeight: 700, lineHeight: 1.05 }}>{detail.title}</h1>
        </div>
        {detail.regulationNote ? <p className="mt-1 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>{detail.regulationNote}</p> : null}
        {/* Hero quick reads */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {topProj ? <span className="rounded-full px-2.5 py-1 font-mono" style={{ background: "rgba(242,54,69,0.12)", border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 10.5 }}>Top pick · {topProj.pickLabel} {american(topProj.americanOdds)}</span> : null}
          {topPlayer ? <span className="rounded-full px-2.5 py-1 font-mono" style={{ background: "rgba(217,164,65,0.12)", border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 10.5 }}>Top prop · {topPlayer.player?.name} {american(topPlayer.americanOdds)}</span> : null}
          {bestReturnCard ? <span className="rounded-full px-2.5 py-1 font-mono" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 10.5 }}>Best card · {american(bestReturnCard.combinedOdds)} ({bestReturnCard.legs.length} legs)</span> : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link href={detail.buildUrl} className="gtp-cta-lava vault-press rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ fontSize: 11, fontWeight: 700, textDecoration: "none" }}>Build from this game</Link>
          <Link href="/parlays" className="vault-press rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 11, textDecoration: "none" }}>View all parlays</Link>
          <Link href={`/${detail.sport === "world_cup" ? "world-cup" : detail.sport}`} className="vault-press rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 11, textDecoration: "none" }}>View {detail.sportLabel}</Link>
        </div>
      </section>

      {/* Model spotlight — the strongest reads, above the tabs */}
      <div className="mb-5">{spotlight}</div>

      <SportShell tabs={tabs} />
    </div>
  );
}

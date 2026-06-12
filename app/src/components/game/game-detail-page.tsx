/**
 * GameDetailPage — one fixture, everything we predict for it: team projections, player props,
 * suggested cards, and market availability, with a Build-from-this-game CTA. Tabbed (SportShell),
 * mobile-first, shared kit only. All real data — empty states where a market/prop isn't offered.
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
import StatusChip from "@/components/ui/status-chip";

const STATUS_LABEL: Record<string, string> = {
  live: "Live", pending: "Pending", unavailable: "Market unavailable", model_only: "Model only",
};

export default function GameDetailPage({ detail }: { detail: PublicGameDetail }) {
  const identity = getSportIdentity(detail.sport);
  // Real ISO flag codes for soccer fixtures (teams.json); empty string → no flag row.
  const homeCode = detail.sport === "world_cup" && detail.homeTeam ? teamByName(detail.homeTeam)?.code ?? "" : "";
  const awayCode = detail.sport === "world_cup" && detail.awayTeam ? teamByName(detail.awayTeam)?.code ?? "" : "";
  const propsByMarket = new Map<string, PublicProjection[]>();
  for (const p of detail.playerProps) {
    propsByMarket.set(p.marketLabel, [...(propsByMarket.get(p.marketLabel) ?? []), p]);
  }
  const topProj = [...detail.teamProjections].sort((a, b) => Math.abs(b.edgePct ?? 0) - Math.abs(a.edgePct ?? 0))[0];

  const overviewTab = (
    <div className="flex flex-col gap-6">
      {topProj ? (
        <div className="rounded-[10px] px-4 py-4 flex flex-col gap-2" style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}>
          <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>Model read · {topProj.marketLabel}</span>
          <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700 }}>{topProj.pickLabel}</span>
          <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
            Model {topProj.modelProbability != null ? Math.round(topProj.modelProbability * 100) + "%" : "—"} · Market {topProj.marketProbability != null ? Math.round(topProj.marketProbability * 100) + "%" : "—"} · Edge {(topProj.edgePct ?? 0) >= 0 ? "+" : ""}{(topProj.edgePct ?? 0).toFixed(1)}%
          </span>
        </div>
      ) : null}
      {detail.caveats.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {detail.caveats.map((c, i) => <li key={i} className="text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>· {c}</li>)}
        </ul>
      ) : null}
    </div>
  );

  const projectionsTab = (
    <div className="flex flex-col gap-3">
      <SectionHeader eyebrow={`Projections · ${detail.teamProjections.length}`} title="Team & game projections" sub="Model probability vs the market price, with edge, for this fixture." />
      {detail.teamProjections.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {detail.teamProjections.map((p) => <ProjectionCard key={p.id} p={p} />)}
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>This sport is player-prop based — see the Player Props tab for this game&apos;s projections.</p>
      )}
    </div>
  );

  const playerPropsTab = (
    <div className="flex flex-col gap-6">
      <SectionHeader eyebrow={`Player props · ${detail.playerProps.length}`} title="Player props for this game" sub="From the current books — top recommendations first, with market tabs, team filter, and player search." />
      {detail.playerProps.length > 0 ? (
        <PlayerPropsExplorer props={detail.playerProps} />
      ) : (
        <div className="rounded-[10px] px-4 py-8 text-center" style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}>
          <p style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>No player props yet</p>
          <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>Player props are not available from the current books for this fixture yet. They appear once the books post them (soccer player props post near lineup time).</p>
        </div>
      )}
    </div>
  );

  const cardsTab = (
    <div className="flex flex-col gap-3">
      <SectionHeader eyebrow={`Suggested cards · ${detail.suggestedCards.length}`} title="Suggested cards for this game" sub="Cards built from this fixture's positive-edge projections. Enter any stake for the projected paper return." />
      {detail.suggestedCards.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {detail.suggestedCards.map((c) => <SuggestedCard key={c.id} card={c} />)}
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No suggested cards for this game yet — browse all of today&apos;s cards on <Link href="/picks" style={{ color: "var(--vault-gold-bright)" }}>Picks</Link>, or build your own below.</p>
      )}
    </div>
  );

  const marketsTab = (
    <div className="flex flex-col gap-3">
      <SectionHeader eyebrow="Markets" title="What's available for this game" sub="We only show markets a real book is pricing. Pending/unavailable markets are labeled, never faked." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {detail.dataStatus.map((d) => (
          <div key={d.label} className="flex items-center justify-between gap-2 rounded-[8px] px-3 py-2.5" style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}>
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
    { key: "overview", label: "Overview", content: overviewTab },
    { key: "projections", label: detail.sport === "world_cup" ? "Team Projections" : "Projections", badge: detail.teamProjections.length || null, content: projectionsTab },
    { key: "player-props", label: "Player Props", badge: detail.playerProps.length || null, content: playerPropsTab },
    { key: "cards", label: "Suggested Cards", badge: detail.suggestedCards.length || null, content: cardsTab },
    { key: "markets", label: "Markets", content: marketsTab },
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-10 overflow-x-hidden">
      <div className="mb-2">
        <Link href="/games" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>← All games</Link>
      </div>
      {/* Hero / matchup */}
      <section className="relative overflow-hidden rounded-[14px] px-5 py-6 mb-5" style={{ border: "1px solid var(--vault-border-strong)", background: "radial-gradient(120% 150% at 0% 0%, rgba(240,199,94,0.10) 0%, transparent 55%), linear-gradient(135deg, rgba(22,30,62,0.94) 0%, rgba(7,11,26,0.97) 100%)" }}>
        <span className="flex items-center gap-2">
          <span
            className="gtp-sport-orb shrink-0"
            style={{ width: 26, height: 26, fontSize: 14, ["--orb-grad" as string]: identity.gradient }}
            role="img"
            aria-label={identity.ballLabel}
          >
            {identity.icon}
          </span>
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
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link href={detail.buildUrl} className="gtp-cta-lava vault-press rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ fontSize: 11, fontWeight: 700, textDecoration: "none" }}>Build from this game</Link>
          <Link href={`/${detail.sport === "world_cup" ? "world-cup" : detail.sport}`} className="vault-press rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 11, textDecoration: "none" }}>View {detail.sportLabel}</Link>
          <Link href="/learn#projections" className="vault-press rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 11, textDecoration: "none" }}>Learn markets</Link>
        </div>
      </section>

      <SportShell tabs={tabs} />
    </div>
  );
}

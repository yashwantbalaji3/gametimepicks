/**
 * /games/[sport]/[gameId] — fixture detail page. Statically generated for every game on the active board
 * (generateStaticParams). The `[gameId]` segment carries the game's UNIQUE public slug (for a doubleheader the
 * slug includes the disambiguating gamePk). Renders the shared GameDetailPage from real artifacts only.
 *
 * A legacy AMBIGUOUS base slug (a doubleheader's shared team-pair+date) is ALSO statically generated, but it
 * resolves to no single game — it renders a disambiguation page that links to each real game. We NEVER silently
 * pick one game for an ambiguous URL.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGameDetail, getGameDisambiguation, gameDetailParams } from "@/lib/game-detail";
import { getGameSpecificCardsForGame, getWorldCupMultiGameCardsForGame } from "@/lib/world-cup/game-specific-cards";
import { buildGamePropParlays } from "@/lib/world-cup/game-prop-parlays";
import GameDetailPage from "@/components/game/game-detail-page";

export const dynamicParams = false;

export function generateStaticParams() {
  return gameDetailParams();
}

export function generateMetadata({ params }: { params: { sport: string; gameId: string } }) {
  const d = getGameDetail(params.sport, params.gameId);
  if (d) {
    return {
      title: `${d.title} · ${d.sportLabel} · GameTime Picks`,
      description: `${d.title} — projections, player props, suggested cards, and market availability. Educational, paper-only.`,
      // Canonical points at THIS game's unique route (one gameId ↔ one URL).
      alternates: { canonical: `/games/${params.sport}/${params.gameId}` },
    };
  }
  // Ambiguous legacy base slug (doubleheader) → a disambiguation page, deliberately non-canonical + noindex.
  const dis = getGameDisambiguation(params.sport, params.gameId);
  if (dis) {
    return {
      title: `Two games share this matchup · GameTime Picks`,
      description: "This matchup has more than one game on this date. Pick the game you want. Educational, paper-only.",
      robots: { index: false, follow: true },
    };
  }
  return { title: "Game · GameTime Picks", description: "Game detail — educational, paper-only." };
}

/** Honest disambiguation view for a doubleheader's shared (legacy) base slug — never silently resolves one game. */
function GameDisambiguation({ sport, options }: { sport: string; options: Array<{ slug: string; urlSport: string; title: string; simReady: boolean }> }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <p className="font-mono uppercase tracking-[0.12em] mb-2" style={{ fontSize: 10, color: "var(--vault-text-faint)" }}>
        Two games · one matchup
      </p>
      <h1 className="text-[22px] font-semibold mb-1" style={{ color: "var(--vault-text)" }}>Which game?</h1>
      <p className="text-[13px] mb-6" style={{ color: "var(--vault-text-mute)" }}>
        These teams play more than once on this date (a doubleheader), so this link maps to more than one game. Pick one:
      </p>
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <Link
            key={o.slug}
            href={`/games/${o.urlSport}/${o.slug}`}
            className="vault-glow-hover flex items-center justify-between gap-3 rounded-[8px]"
            style={{ padding: "14px 16px", border: "1px solid var(--vault-border)", background: "rgba(11, 18, 14,0.55)", color: "inherit", textDecoration: "none" }}
          >
            <span className="text-[14px]" style={{ color: "var(--vault-text)" }}>{o.title}</span>
            <span className="font-mono uppercase tracking-[0.06em]" style={{ fontSize: 9.5, color: o.simReady ? "var(--vault-success)" : "var(--vault-text-faint)" }}>
              {o.simReady ? "Simulation ready →" : "Open →"}
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-6">
        <Link href={`/${sport === "world-cup" ? "world-cup" : sport}`} className="text-[12px]" style={{ color: "var(--vault-gold)" }}>← Back to the {sport === "world-cup" ? "World Cup" : sport.toUpperCase()} board</Link>
      </p>
    </main>
  );
}

export default function GameDetailRoute({ params }: { params: { sport: string; gameId: string } }) {
  const detail = getGameDetail(params.sport, params.gameId);
  if (!detail) {
    // Not a unique game — is it an ambiguous doubleheader base slug? If so, disambiguate; never guess.
    const dis = getGameDisambiguation(params.sport, params.gameId);
    if (dis) return <GameDisambiguation sport={params.sport} options={dis.options} />;
    notFound();
  }
  // Engine game-specific suggested cards mapped to this fixture (World Cup only for now).
  const fixture = { matchId: detail.matchId, homeTeam: detail.homeTeam, awayTeam: detail.awayTeam };
  const engineCards = detail.sport === "world_cup" ? getGameSpecificCardsForGame(fixture) : null;
  // World Cup multi-game cards that include this fixture ("this game in multi-game cards").
  const multiGameCards = detail.sport === "world_cup" ? getWorldCupMultiGameCardsForGame(fixture) : null;
  // Per-fixture player-prop + team-prop parlays (Safe / Balanced / Longshot + same-game team combos).
  const propParlays = detail.sport === "world_cup" ? buildGamePropParlays(detail) : null;
  return (
    <GameDetailPage
      detail={detail}
      engineCards={engineCards}
      multiGameCards={multiGameCards}
      playerPropParlays={propParlays?.playerParlays}
      teamPropParlays={propParlays?.teamParlays}
    />
  );
}

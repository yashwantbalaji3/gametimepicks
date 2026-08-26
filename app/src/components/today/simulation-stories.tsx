/**
 * TodaySimulationStories (Sprint 015 · Phase 2) — the four slate-wide headlines that answer "what's worth
 * opening today?": the matchup the simulation is most sure about, the one it is least sure about, the one it
 * expects to score most, and the single player outcome it is most confident in.
 *
 * Presentational ONLY. Every card arrives fully formed from `buildSlateStories`, which ranks the canonical
 * prediction objects — this component performs no comparison, no maths, and no formatting of probabilities.
 * A category with no qualifying game is simply absent, so nothing here can render a fabricated headline.
 */
import Link from "next/link";
import { TeamLogo, PlayerPortrait } from "@/components/entity";
import type { SlateStory } from "@/lib/mlb/prediction/slate";

function StoryCard({ story }: { story: SlateStory }) {
  return (
    <Link
      href={story.href}
      className="rounded-[12px] px-3.5 py-3 flex flex-col gap-2 no-underline"
      style={{ background: "var(--vault-wash-faint)", border: "1px solid var(--vault-border)", minHeight: 44 }}
    >
      <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold)", fontSize: 8.5 }}>
        {story.label}
      </span>

      <div className="flex items-center gap-2 min-w-0">
        {story.player ? (
          <PlayerPortrait
            playerId={story.player.playerId}
            name={story.player.name}
            team={story.player.team}
            sport="mlb"
            size="sm"
          />
        ) : (
          <span className="flex items-center gap-1 shrink-0">
            <TeamLogo name={story.awayTeam} logoUrl={story.awayLogo} size="sm" />
            <TeamLogo name={story.homeTeam} logoUrl={story.homeLogo} size="sm" />
          </span>
        )}
        <span className="min-w-0 flex flex-col">
          <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>
            {story.headline}
          </span>
          <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
            {story.player
              ? `${story.player.team}${story.player.opponent ? ` vs ${story.player.opponent}` : ""} · ${story.awayTeam} @ ${story.homeTeam}`
              : `${story.awayTeam} @ ${story.homeTeam}`}
          </span>
        </span>
      </div>

      {story.detail ? (
        <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 9.5 }}>
          {story.detail}
        </span>
      ) : null}
    </Link>
  );
}

export default function TodaySimulationStories({ stories }: { stories: SlateStory[] }) {
  if (stories.length === 0) return null;
  return (
    <section aria-labelledby="today-sim-stories-h" className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2
          id="today-sim-stories-h"
          className="font-mono uppercase tracking-[0.14em] m-0"
          style={{ color: "var(--vault-gold)", fontSize: 11 }}
        >
          Today&rsquo;s simulation stories
        </h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
          ranked from today&rsquo;s simulations
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {stories.map((s) => (
          <StoryCard key={s.kind} story={s} />
        ))}
      </div>
    </section>
  );
}

"use client";

/**
 * FeaturedHeadliners — "Star spotlight" strip rendered above the main
 * board grid.
 *
 * Why this exists:
 *
 * The main grid sorts player cards by absolute edge desc. That means
 * a role player with a 40%+ R5_suspicious_edge anomaly outranks a
 * star with a moderate clean edge. Users repeatedly looked for
 * Anthony Edwards, Cade Cunningham, Donovan Mitchell, Wembanyama and
 * saw role players first.
 *
 * This component spotlights star players when their props are actually
 * loaded on the current slate. It never fabricates a missing player —
 * if a configured star isn't in the prop feed for tonight, an honest
 * "props not in the loaded feed" note is rendered instead.
 *
 * The star list is intentionally hard-coded as a small local constant
 * (not pulled from data) so it's transparent and easy to revise. It is
 * a curated visibility heuristic, not a prediction or a recommendation.
 */
import type { PlayerCard } from "@/lib/grouping";
import VaultPlayerCard from "./vault-player-card";

interface Props {
  /** All player cards on the visible slate. */
  playerCards: PlayerCard[];
  /** Team abbreviations of the games on tonight's slate, e.g. new Set(["DET","CLE","SAS","MIN"]). */
  slateTeams: Set<string>;
}

// Curated star list. Order is the rendering priority when multiple are
// loaded. Each entry includes the player's primary team so that the
// "props missing" callout only fires when the player's team is actually
// on tonight's slate — otherwise the player is simply off-slate, not
// missing.
const STAR_PRIORITY: Array<{ name: string; team: string }> = [
  { name: "Anthony Edwards", team: "MIN" },
  { name: "Victor Wembanyama", team: "SAS" },
  { name: "Donovan Mitchell", team: "CLE" },
  { name: "Cade Cunningham", team: "DET" },
  { name: "Evan Mobley", team: "CLE" },
  { name: "Jarrett Allen", team: "CLE" },
  { name: "Jalen Duren", team: "DET" },
  { name: "Julius Randle", team: "MIN" },
  { name: "Rudy Gobert", team: "MIN" },
  { name: "De'Aaron Fox", team: "SAS" },
];

export default function FeaturedHeadliners({
  playerCards,
  slateTeams,
}: Props) {
  const cardByName = new Map<string, PlayerCard>();
  for (const c of playerCards) cardByName.set(c.playerName, c);

  const loaded: PlayerCard[] = [];
  const missingOnSlate: string[] = [];
  for (const star of STAR_PRIORITY) {
    const c = cardByName.get(star.name);
    if (c) {
      loaded.push(c);
    } else if (slateTeams.has(star.team)) {
      missingOnSlate.push(star.name);
    }
  }

  if (loaded.length === 0 && missingOnSlate.length === 0) {
    return null;
  }

  return (
    <section className="mb-8" aria-label="Star headliner spotlight">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 10px rgba(240, 199, 94, 0.7)",
            }}
          />
          <div>
            <div
              className="font-mono uppercase tracking-[0.18em]"
              style={{
                color: "var(--vault-gold)",
                fontSize: 10,
              }}
            >
              Headliners · star spotlight
            </div>
            <h2
              className="mt-1 vault-display-h3"
              style={{ color: "var(--vault-text)" }}
            >
              Star players on tonight&apos;s slate
            </h2>
          </div>
        </div>
        <span
          className="text-[11px]"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {loaded.length} loaded · curated visibility
        </span>
      </div>

      {loaded.length > 0 && (
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns:
              "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
          }}
        >
          {loaded.map((card) => (
            <VaultPlayerCard key={`star-${card.cardKey}`} card={card} />
          ))}
        </div>
      )}

      {missingOnSlate.length > 0 && (
        <p
          className="mt-4 px-3 py-2.5 rounded-[3px] text-[12px] leading-relaxed"
          style={{
            background: "var(--vault-panel)",
            border: "1px solid var(--vault-rule)",
            color: "var(--vault-text-mute)",
          }}
        >
          <span
            style={{
              color: "var(--vault-text-faint)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Not in feed ·
          </span>{" "}
          <span style={{ color: "var(--vault-text)" }}>
            {missingOnSlate.join(", ")}
          </span>{" "}
          props were not in the loaded sportsbook feed for this slate.
        </p>
      )}
    </section>
  );
}

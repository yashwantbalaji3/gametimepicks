import LevelACopy from "@/components/products/level-a-copy";
import { nbaGameWinnerCopyText } from "@/lib/products/level-a/nba-game-winner-tiers.mjs";
import { jointShownFor } from "@/lib/products/level-a/suggestions.mjs";
import { etStamp } from "@/lib/et-stamp.mjs";

/* LEVEL A · NBA GAME WINNERS (nba-game-winner-tiers@1; docs/LEVEL_A_NBA_GAME_WINNER_TIERING_RULE.md). Server component,
   Parlay Center only. Renders what level-a/model.mjs decided and computes nothing: each leg's % is the NBA display's own
   text, the joint is Level A's one joint text (jointShownFor), the accuracy disclosure is the display's, once. No price,
   no odds, no payout, no sportsbook link. */

type GwLeg = { eventId: string; eventLabel: string; startUtc: string; selection: { code: string; label: string }; shownPct: string; label: string; display: { frozenAt: string } };
type GwCard = { tier: string; tierLabel: string; legs: GwLeg[]; jointProbability: number; dependency: string; whySelected: string; label: string; disclosure: string | null };
export type NbaGameWinnersBlock = { public: boolean; tiers: Array<{ tier: string; tierLabel: string; card: GwCard | null; reason: string | null }>; disclosure: string | null };

export default function NbaGameWinners({ block }: { block: NbaGameWinnersBlock | null | undefined }) {
  if (!block?.public) return null;
  return (
    <section aria-labelledby="level-a-nba-game-winners" className="flex flex-col gap-2">
      <h3 id="level-a-nba-game-winners" className="m-0 font-semibold" style={{ color: "var(--vault-text)", fontSize: 14 }}>NBA game winners</h3>
      <p className="m-0 text-[12px]" style={{ color: "var(--vault-text-mute)", maxWidth: "72ch" }}>
        NBA-only cards from the official sides, tiered by the published Elo game-winner probability. One leg per game.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {block.tiers.map((t) => (
          <article key={t.tier} className="flex flex-col gap-2 rounded-[10px] px-4 py-3" style={{ border: "1px solid var(--vault-border)" }} aria-label={`NBA game winners · ${t.tierLabel}`}>
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="m-0 font-semibold" style={{ color: "var(--vault-text)", fontSize: 13.5 }}>{t.tierLabel}</h4>
              {t.card ? <span style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>{t.card.tierLabel} · model joint probability {jointShownFor(t.card.jointProbability, t.card.tier)}</span> : null}
            </header>
            {t.card ? (
              <>
                <ul className="m-0 flex flex-col gap-1 p-0" role="list">
                  {t.card.legs.map((l) => (
                    <li key={l.eventId} className="flex flex-col gap-0.5 text-[12.5px]" style={{ borderTop: "1px solid var(--vault-border)", paddingTop: 6 }}>
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>{l.selection.label}</span>
                        <span style={{ color: "var(--vault-text-mute)" }}>{l.label}: {l.shownPct}</span>
                      </span>
                      <span style={{ color: "var(--vault-text-faint)", fontSize: 11.5 }}>NBA · {l.eventLabel} · tips {etStamp(l.startUtc) ?? l.startUtc} · frozen {etStamp(l.display.frozenAt) ?? l.display.frozenAt} · no sportsbook price · settles on the official final</span>
                    </li>
                  ))}
                </ul>
                <p className="m-0 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>{t.card.dependency} Unpriced: no sportsbook price, so no payout is shown.</p>
                <LevelACopy text={nbaGameWinnerCopyText(t.card)} />
              </>
            ) : (
              <p className="m-0 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>No card: {t.reason}.</p>
            )}
          </article>
        ))}
      </div>
      {block.disclosure ? <p className="m-0 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>{block.disclosure}</p> : null}
    </section>
  );
}

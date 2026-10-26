import LevelACopy from "@/components/products/level-a-copy";
import { AddToSlip } from "@/components/products/level-a-slip";
import { slipLegOf } from "@/lib/products/level-a/slip-legs.mjs";
import { nbaGameWinnerCardKey, nbaGameWinnerCopyText } from "@/lib/products/level-a/nba-game-winner-tiers.mjs";
import { jointShownFor } from "@/lib/products/level-a/suggestions.mjs";
import { etStamp } from "@/lib/et-stamp.mjs";

/* LEVEL A · NBA GAME WINNERS (nba-game-winner-tiers@1; docs/LEVEL_A_NBA_GAME_WINNER_TIERING_RULE.md). Server component.
   The Parlay Center shows a card per tier; Bank Builder its conservative card (2 legs, Low or Medium); Moonshot its
   Longshot card (up to 5 legs) — one engine, rendered here and computed nowhere else. Each leg's % is the NBA display's
   own text, the joint is Level A's one joint text (jointShownFor), the display's disclosure appears once. No price, no
   odds, no payout, no sportsbook link. Each card carries data-level-a-card, the key the recorder matches exactly. */

type GwLeg = { eventId: string; eventLabel: string; startUtc: string; selection: { code: string; label: string }; shownPct: string; label: string; display: { frozenAt: string } };
type GwCard = { policy: string; tier: string; tierLabel: string; legs: GwLeg[]; jointProbability: number; dependency: string; whySelected: string; label: string; disclosure: string | null };
type GwSlot = { card: GwCard | null; reason: string | null };
export type NbaGameWinnersBlock = { public: boolean; tiers: Array<GwSlot & { tier: string; tierLabel: string }>; bankBuilder: GwSlot; moonshot: GwSlot; disclosure: string | null };

function GwCardBox({ title, slot }: { title: string; slot: GwSlot }) {
  const c = slot.card;
  return (
    <article className="flex flex-col gap-2 rounded-[10px] px-4 py-3" style={{ border: "1px solid var(--vault-border)" }} aria-label={`NBA game winners · ${title}`} data-level-a-card={c ? nbaGameWinnerCardKey(c) : undefined}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="m-0 font-semibold" style={{ color: "var(--vault-text)", fontSize: 13.5 }}>{title}</h4>
        {c ? <span style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>{c.tierLabel} · model joint probability {jointShownFor(c.jointProbability, c.tier)}</span> : null}
      </header>
      {c ? (
        <>
          <ul className="m-0 flex flex-col gap-1 p-0" role="list">
            {c.legs.map((l) => (
              <li key={l.eventId} className="flex flex-col gap-0.5 text-[12.5px]" style={{ borderTop: "1px solid var(--vault-border)", paddingTop: 6 }}>
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>{l.selection.label}</span>
                  <span style={{ color: "var(--vault-text-mute)" }}>{l.label}: {l.shownPct}</span>
                </span>
                <span style={{ color: "var(--vault-text-faint)", fontSize: 11.5 }}>NBA · {l.eventLabel} · tips {etStamp(l.startUtc) ?? l.startUtc} · frozen {etStamp(l.display.frozenAt) ?? l.display.frozenAt} · no sportsbook price · settles on the official final</span>
                <span><AddToSlip keys={[slipLegOf(l as never).key]} name={`${l.selection.label}, ${l.eventLabel}`} /></span>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>{c.dependency} No sportsbook price. Settles on the official final.</p>
          <span className="flex flex-wrap items-center gap-2">
            <AddToSlip keys={c.legs.map((l) => slipLegOf(l as never).key)} label="Add card to slip" name={`NBA game winners ${title} (${c.legs.length} legs)`} />
            <LevelACopy text={nbaGameWinnerCopyText(c)} />
          </span>
        </>
      ) : (
        <p className="m-0 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>No card: {slot.reason}.</p>
      )}
    </article>
  );
}

export default function NbaGameWinners({ block, mode }: { block: NbaGameWinnersBlock | null | undefined; mode: "parlay-lab" | "bank-builder" | "moonshot" }) {
  if (!block?.public) return null;
  return (
    <section aria-labelledby={`level-a-nba-game-winners-${mode}`} className="flex flex-col gap-2" data-level-a-nba-game-winners={mode}>
      <h3 id={`level-a-nba-game-winners-${mode}`} className="m-0 font-semibold" style={{ color: "var(--vault-text)", fontSize: 14 }}>NBA game winners</h3>
      <p className="m-0 text-[12px]" style={{ color: "var(--vault-text-mute)", maxWidth: "72ch" }}>
        NBA-only cards from the official sides, tiered by the published Elo-derived game-winner estimate. One leg per game.
      </p>
      {mode === "parlay-lab" ? (
        <div className="grid gap-3 lg:grid-cols-2">{block.tiers.map((t) => <GwCardBox key={t.tier} title={t.tierLabel} slot={t} />)}</div>
      ) : mode === "bank-builder" ? (
        <GwCardBox title="Bank Builder · 2 games, Low or Medium band, highest joint" slot={block.bankBuilder} />
      ) : (
        <GwCardBox title="Moonshot · Longshot band, up to 5 games, highest joint" slot={block.moonshot} />
      )}
      {block.disclosure ? <p className="m-0 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>{block.disclosure}</p> : null}
    </section>
  );
}

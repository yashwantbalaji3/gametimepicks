/**
 * What a placed ladder card puts at risk, in words (TRUTH-001, 2026-10-09). Pure; safe in client components.
 *
 * A lane's card carries two different amounts:
 *   stake     the ROLLED balance at this step — the seed plus every won step rolled into it;
 *   exposure  what a loss costs the core bankroll — the lane's seed (Bank Builder $100, Moonshot $25), because
 *             under Rule S (lib/mr-dub/protected-fold.mjs) a won step rolls and is never credited, so it cannot
 *             be lost from the bankroll.
 * The cards printed the STAKE as "at risk · open exposure": a Moonshot lane at step 3 read "$400.22 at risk"
 * while the ledger's exposure was $25.
 */

const money = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

export function laneRiskLabel(card: { status: string; stake: number; exposure: number | null }): string {
  if (card.status !== "active") return "$0 placed · not activated";
  if (typeof card.exposure !== "number" || !Number.isFinite(card.exposure)) {
    return `${money(card.stake)} stake · at-risk amount not published`;
  }
  if (Math.abs(card.stake - card.exposure) < 0.005) return `${money(card.exposure)} at risk · the lane seed`;
  return `${money(card.exposure)} seed at risk · ${money(card.stake)} stake includes rolled wins`;
}

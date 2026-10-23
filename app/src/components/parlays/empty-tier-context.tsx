import Link from "next/link";
import EligibleUniverse from "@/components/products/eligible-universe";
import type { ProductAvailability } from "@/lib/products/availability";
import { surfaceHref } from "@/lib/nav/date-sport-route";
import { etDayLabel } from "@/lib/et-stamp.mjs";

type TierLast = { tier: string; tierLabel: string; last: null | { date: string; result: string; combinedAmerican: number | null; legs: number } };

const RESULT_WORD: Record<string, string> = { won: "won", lost: "lost", push: "push", void: "void", pending: "pending" };
const signed = (n: number | null) => (n == null ? null : n > 0 ? `+${n}` : `${n}`.replace("-", "−"));
const yearOf = (d: string) => d.slice(0, 4);

/**
 * WHY A RISK TIER HAS NO CARD TODAY (sprint 2026-10-23, Workstream E). The tier tiles above carry the ladder's own
 * one-line reason. This adds the two things a reader needs to act on an empty day, both read from their owners and
 * computed nowhere here:
 *   - which sports could contribute a leg on the evaluated day, with each sport's own reason (the same eligible-
 *     universe panel /bank-builder and /moonshot show; products/availability is the owner);
 *   - the last PUBLISHED card in each empty tier, with its date and settled result, linked to that day's Results page
 *     (results/v2/suggested-history lastCardPerTier over the frozen ladders and the lab's settled receipts).
 * Nothing is generated: no fallback card, no fixture, no price.
 */
export default function EmptyTierContext({ emptyTiers, lastCards, availability }: { emptyTiers: string[]; lastCards: TierLast[]; availability: ProductAvailability | null }) {
  if (!emptyTiers.length) return null;
  const rows = lastCards.filter((t) => emptyTiers.includes(t.tier));
  const all = emptyTiers.length === lastCards.length;
  return (
    <section aria-labelledby="empty-tier-context-heading" className="flex flex-col gap-3 rounded-[10px] px-4 py-3" style={{ border: "1px solid var(--vault-border)" }}>
      <h2 id="empty-tier-context-heading" className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 14 }}>
        {all ? "No risk tier has a card today" : `${emptyTiers.length} of ${lastCards.length} risk tiers have no card today`}
      </h2>
      <EligibleUniverse availability={availability} compact />
      {rows.length ? (
        <div>
          <p className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>The last published card in each of these tiers:</p>
          <ul className="mt-1 grid gap-1" role="list">
            {rows.map((t) => {
              const href = t.last ? surfaceHref("results", { date: t.last.date }) : null;
              return (
                <li key={t.tier} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px]">
                  <span className="font-semibold" style={{ color: "var(--vault-text)" }}>{t.tierLabel}</span>
                  {t.last && href ? (
                    <Link href={href} style={{ color: "var(--vault-gold-bright)" }}>
                      {etDayLabel(t.last.date) ?? t.last.date}, {yearOf(t.last.date)} · {t.last.legs} legs{signed(t.last.combinedAmerican) ? ` · ${signed(t.last.combinedAmerican)}` : ""} · {RESULT_WORD[t.last.result] ?? t.last.result}
                    </Link>
                  ) : (
                    <span style={{ color: "var(--vault-text-mute)" }}>No card published in this tier yet</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <p className="text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
        An empty tier is a decision, not a missing update: no card is published rather than forcing one.{" "}
        <Link href="/results/parlay-lab" style={{ color: "var(--vault-text-mute)" }}>Every settled card (Historical Results) →</Link>
      </p>
    </section>
  );
}

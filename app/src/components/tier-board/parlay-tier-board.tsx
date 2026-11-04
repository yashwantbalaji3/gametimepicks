import type { ReactNode } from "react";
import Link from "next/link";
import StateBadge from "@/components/tier-board/state-badge";
import FeaturedParlay, { type CardView } from "@/components/tier-board/featured-parlay";
import BoardNotes from "@/components/tier-board/board-notes";
import { tierState } from "@/lib/products/tier-board/view.mjs";

/* THE PARLAY LAB · FOUR RISK TIERS (founder, 2026-11-04: one premium UI for Bank Builder, Moonshot and the Parlay Lab).
   Same tokens, badges, leg detail and notes as the two product pages; each tier wears its band colour. A tier with no
   card says which state it is in (insufficient eligible legs, or blocked) and the source's own reasons, per scope. */
export type ParlayTiersView = {
  productDay: string | null;
  origin: string;
  tiers: Array<{
    tier: string; label: string; range: string; state: string; card: CardView | null;
    reasons: Array<{ scope: string; label: string; text: string }>;
  }>;
  legKinds?: string[];
  pending?: Array<{ key: string; state: string; text: string }>;
};

export default function ParlayTierBoard({ board, checks }: { board: ParlayTiersView | null; checks?: ReactNode }) {
  if (!board) return null;
  const withCard = board.tiers.filter((t) => t.card).length;
  /* ONE disclosure and ONE set of reasons: a card's model disclosure prints once under the board, not once per tier, and
     when every tier is empty for the same reasons those reasons print once, not four times. */
  const disclosures = [...new Set(board.tiers.map((t) => t.card?.disclosure).filter((d): d is string => Boolean(d)))];
  const rk = (x: { scope: string; text: string }) => `${x.scope}\u0000${x.text}`;
  const sharedReasons = withCard === 0 && board.tiers.length > 1
    ? board.tiers[0].reasons.filter((x) => board.tiers.every((t) => t.reasons.some((y) => rk(y) === rk(x))))
    : [];
  const shared = new Set(sharedReasons.map(rk));
  const sharedState = withCard === 0 && board.tiers.length ? (board.tiers.every((t) => t.state === "blocked") ? "blocked" : "insufficient") : null;
  return (
    <section id="parlay-tiers" className="tb-section scroll-mt-24" aria-labelledby="parlay-tiers-h" data-parlay-tiers={board.origin}>
      <header className="tb-hero tb-hero--lab" style={{ marginBottom: 0 }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="tb-eyebrow">Parlay Center · four risk tiers</span>
          <StateBadge state={withCard ? "model-only" : board.tiers.some((t) => t.state === "blocked") ? "blocked" : "insufficient"} />
        </div>
        <h2 id="parlay-tiers-h" className="tb-hero-title" style={{ fontSize: "clamp(28px, 5vw, 44px)" }}>
          Model tiers{board.productDay ? <span className="tb-section-date"> · {board.productDay}</span> : null}
        </h2>
        <p className="tb-hero-promise">
          The model&rsquo;s best combination in each risk band, from steady to swing-for-the-fences. {withCard} of 4 tiers have a card today.
        </p>
        <ul className="tb-band-row" aria-label="Risk bands">
          {board.tiers.map((t) => (
            <li key={t.tier} className={`tb-band tb-band--${t.tier}`}>
              <span className="tb-band-name">{t.label}</span>
              <span className="tb-band-range">model chance {t.range}</span>
            </li>
          ))}
        </ul>
        <p className="tb-hero-risk">
          <span aria-hidden>◔</span> Every leg must win. The lower the band, the more often the model expects the card to lose, and
          even a Low Risk card is never a certainty.
        </p>
        <nav className="tb-hero-links" aria-label="Parlay Center shortcuts">
          <Link className="tb-btn" href="/bank-builder/">Bank Builder</Link>
          <Link className="tb-btn" href="/moonshot/">Moonshot</Link>
        </nav>
      </header>

      {sharedState ? (
        <div className="tb-empty" data-tier-empty={sharedState} data-parlay-tiers-shared-reasons="">
          <p className="tb-empty-title"><span aria-hidden>{tierState(sharedState).glyph}</span> {sharedState === "blocked" ? "Every tier is blocked today" : "Insufficient eligible legs for every tier today"}</p>
          <p className="tb-empty-text">{tierState(sharedState).text}</p>
          {sharedReasons.length ? (
            <ul className="tb-bullets">{sharedReasons.map((r) => <li key={`${r.scope}:${r.text}`}><strong>{r.label}:</strong> {r.text}.</li>)}</ul>
          ) : null}
        </div>
      ) : null}
      <div className="tb-tier-grid">
        {board.tiers.map((t) => (
          <div key={t.tier} id={`tier-${t.tier}`} className={`tb-tier tb-band--${t.tier} scroll-mt-24`} data-parlay-tier={t.tier} data-parlay-tier-state={t.state}>
            <div className="tb-tier-head">
              <h3 className="tb-tier-name">{t.label}</h3>
              <span className="tb-tier-range">model chance {t.range}</span>
              {t.card ? null : <StateBadge state={t.state} size="sm" />}
            </div>
            {t.card ? (
              <FeaturedParlay card={t.card} product="tier" title={`${t.label} · ${t.card.legs.length} legs`} headingId={`tier-${t.tier}-card`} hideDisclosure />
            ) : sharedState ? (
              t.reasons.filter((x) => !shared.has(rk(x))).length ? (
                <ul className="tb-bullets">{t.reasons.filter((x) => !shared.has(rk(x))).map((x) => <li key={rk(x)}><strong>{x.label}:</strong> {x.text}.</li>)}</ul>
              ) : null
            ) : (
              <div className="tb-empty" data-tier-empty={t.state}>
                <p className="tb-empty-title"><span aria-hidden>{tierState(t.state).glyph}</span> {t.state === "blocked" ? "Blocked today" : "Insufficient eligible legs"}</p>
                <p className="tb-empty-text">{tierState(t.state).text}</p>
                {t.reasons.length ? (
                  <ul className="tb-bullets">
                    {t.reasons.map((r) => <li key={`${r.scope}:${r.text}`}><strong>{r.label}:</strong> {r.text}.</li>)}
                  </ul>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>

      {disclosures.map((d) => <p key={d} className="tb-pricing" data-card-disclosure="">{d}</p>)}
      <BoardNotes board={board} noun="tiers" />
      {checks ? (
        <details className="tb-checks">
          <summary className="tb-checks-summary">Why, check by check <span className="tb-checks-sub">every model suggestion today, tier by tier</span></summary>
          <div className="tb-checks-body">{checks}</div>
        </details>
      ) : null}
    </section>
  );
}

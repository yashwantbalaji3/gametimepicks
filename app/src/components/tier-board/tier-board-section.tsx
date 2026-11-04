import type { ReactNode } from "react";
import Link from "next/link";
import StateBadge from "@/components/tier-board/state-badge";
import FeaturedParlay, { type CardView } from "@/components/tier-board/featured-parlay";
import BoardNotes from "@/components/tier-board/board-notes";
import { tierState } from "@/lib/products/tier-board/view.mjs";

/* TODAY'S CARD (Founder Priority 4). The featured parlay when there is one; otherwise ONE explicit state panel
   (insufficient legs or blocked) with the source's own reasons. The day's detailed checks (eligible universe, priced
   candidate checks, every model suggestion) are passed in as `checks` and fold under one "Why, check by check". */
export type TierBoardView = {
  product: "bank-builder" | "moonshot";
  productDay: string | null;
  origin: string;
  state: string;
  featured: CardView | null;
  reasons: Array<{ scope: string; text: string }>;
  legKinds?: string[];
  pending?: Array<{ key: string; state: string; text: string }>;
};

const SCOPE: Record<string, string> = { cross: "Mixed-sport card", nba: "NBA game winners card" };

export default function TierBoardSection({ board, checks, productName }: { board: TierBoardView | null; checks?: ReactNode; productName: string }) {
  const product = board?.product ?? "bank-builder";
  const state = board?.featured ? board.featured.state : board?.state ?? "insufficient";
  return (
    <section id="todays-card" className="tb-section scroll-mt-24" aria-labelledby="tb-today-h" data-tier-board={product} data-tier-board-state={state}>
      <div className="tb-section-head">
        <h2 id="tb-today-h" className="tb-section-title">Today&rsquo;s card{board?.productDay ? <span className="tb-section-date"> · {board.productDay}</span> : null}</h2>
        {board?.featured ? null : <StateBadge state={state} />}
      </div>
      {board?.featured ? (
        <FeaturedParlay card={board.featured} product={product} />
      ) : (
        <div className="tb-empty" data-tier-empty={state}>
          <p className="tb-empty-title"><span aria-hidden>{tierState(state).glyph}</span> No {productName} card today</p>
          <p className="tb-empty-text">{tierState(state).text}</p>
          {board?.reasons.length ? (
            <ul className="tb-bullets">
              {board.reasons.map((r) => <li key={`${r.scope}:${r.text}`}><strong>{SCOPE[r.scope] ?? r.scope}:</strong> {r.text}.</li>)}
            </ul>
          ) : null}
          <p className="tb-empty-text">
            <Link className="tb-link" href="/build/#parlay-tiers">Explore every tier in the Parlay Center →</Link>
          </p>
        </div>
      )}
      <BoardNotes board={board} />
      {checks ? (
        <details className="tb-checks">
          <summary className="tb-checks-summary">Why, check by check <span className="tb-checks-sub">eligible sports, candidate checks and every model suggestion today</span></summary>
          <div className="tb-checks-body">{checks}</div>
        </details>
      ) : null}
    </section>
  );
}

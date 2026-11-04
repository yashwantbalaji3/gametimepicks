import Link from "next/link";

/* THE ONE DISCLOSURE (Founder Priority 4). Replaces the repeated per-section disclaimers on /bank-builder and /moonshot:
   said once, at the foot of the page, in plain words. */
export default function ProductDisclosure({ productName }: { productName: string }) {
  return (
    <aside className="tb-disclosure" aria-label={`About ${productName}`} data-product-disclosure="">
      <p className="m-0">
        <strong>{productName} is paper-only and educational.</strong> Cards are built from the official forecast&rsquo;s MODEL
        PROJECTIONS, frozen before each game, and graded against official results. We take no bets and no money. A model
        suggestion is not a sportsbook offer: no odds or payout are shown unless a permitted price is attached, and past
        results do not predict future ones.{" "}
        <Link href="/methodology" className="tb-link">How cards are chosen</Link> ·{" "}
        <Link href="/responsible-use" className="tb-link">Responsible use</Link>
      </p>
    </aside>
  );
}

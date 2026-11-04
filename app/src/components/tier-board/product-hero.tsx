import Link from "next/link";
import StateBadge from "@/components/tier-board/state-badge";
import { PRODUCT_IDENTITY, bandRangeText } from "@/lib/products/tier-board/view.mjs";
import { PUBLIC_RISK_LABELS } from "@/lib/parlays/risk-odds-bands.mjs";

/* The product's front door (Founder Priority 4). Bank Builder: calm, premium, gold hairline on a still panel.
   Moonshot: violet night sky, high energy, the risk printed as large as the promise. Same structure, same tokens —
   one design system, two identities. The status line is the page's own derived state, passed in verbatim. */
export default function ProductHero({ product, state, statusLabel, statusNote }: {
  product: "bank-builder" | "moonshot";
  state: string;
  statusLabel: string;
  statusNote?: string | null;
}) {
  const id = PRODUCT_IDENTITY[product];
  const moon = product === "moonshot";
  return (
    <header className={`tb-hero ${moon ? "tb-hero--moonshot" : "tb-hero--bank"}`} data-product-hero={product}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tb-eyebrow">{id.eyebrow}</span>
        <StateBadge state={state} />
      </div>
      <h1 className="tb-hero-title">{id.name}</h1>
      <p className="tb-hero-promise">{id.promise}</p>
      <ul className="tb-band-row" aria-label={`${id.name} risk bands`}>
        {id.bands.map((b: string) => (
          <li key={b} className={`tb-band tb-band--${b}`}>
            <span className="tb-band-name">{PUBLIC_RISK_LABELS[b as keyof typeof PUBLIC_RISK_LABELS]}</span>
            <span className="tb-band-range">model chance {bandRangeText(b)}</span>
          </li>
        ))}
      </ul>
      <p className="tb-hero-risk" data-product-risk="">
        <span aria-hidden>{moon ? "⚠" : "◔"}</span> {id.risk}
      </p>
      <p className="tb-hero-status" aria-live="polite">
        <strong>{statusLabel}</strong>{statusNote ? ` · ${statusNote}` : ""}
      </p>
      <nav className="tb-hero-links" aria-label={`${id.name} shortcuts`}>
        <a className="tb-btn tb-btn--primary" href="#todays-card">Today&rsquo;s card</a>
        <Link className="tb-btn" href="/build/#parlay-tiers">Parlay Lab</Link>
        <a className="tb-btn" href="#track-record">Track record</a>
      </nav>
    </header>
  );
}

import Link from "next/link";
import { SIGNATURE_PRODUCTS } from "@/lib/products/signature-products";

/**
 * The one flagship read per sport, side by side, with the unbuilt ones shown as unbuilt.
 *
 * Two of five are "coming soon" and say exactly what is missing rather than promising a date. A
 * tile that reads "coming soon" and nothing else is a promise; one that reads "no odds feed is
 * ingested and no scorer model has been fitted" is a status.
 */

const GLYPH: Record<string, string> = { mlb: "💣", nfl: "🏈", ufc: "🥊", soccer: "⚽", nba: "🏀" };

export default function SignatureProductsBand() {
  return (
    <section aria-labelledby="signature-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 9.5 }}>
          Signature products
        </span>
        <h2 id="signature-heading" className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800 }}>
          One flagship read per sport
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
        {SIGNATURE_PRODUCTS.map((p) => {
          const live = p.state === "live";
          const body = (
            <>
              <div className="flex items-center gap-2">
                <span aria-hidden style={{ fontSize: 18 }}>{GLYPH[p.sport] ?? "◆"}</span>
                <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
                  {p.sportLabel}
                </span>
                {!live && (
                  <span className="ml-auto font-mono uppercase tracking-[0.1em] rounded-[5px] px-1.5 py-0.5"
                    style={{ color: "var(--vault-warn)", border: "1px solid var(--vault-warn)", fontSize: 8.5 }}>
                    Coming soon
                  </span>
                )}
              </div>
              <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 800 }}>
                {p.name}
              </span>
              <span style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.5 }}>{p.question}</span>
              <span style={{ color: "var(--vault-text-faint)", fontSize: 11, lineHeight: 1.55 }}>{p.basis}</span>
              {live && (
                <span className="font-mono uppercase tracking-[0.12em] mt-0.5" style={{ color: "var(--gtp-bank-heat)", fontSize: 9 }}>
                  Open →
                </span>
              )}
            </>
          );
          const style = {
            background: live ? "rgba(11,18,14,0.5)" : "rgba(255,255,255,0.015)",
            border: live ? "1px solid var(--vault-border)" : "1px dashed var(--vault-rule)",
          } as const;
          return live && p.href ? (
            <Link key={p.sport} href={p.href} data-sport={p.sport}
              className="gtp-sim-cta flex flex-col gap-1.5 rounded-[14px] p-3.5 no-underline" style={style}>
              {body}
            </Link>
          ) : (
            <div key={p.sport} data-sport={p.sport} className="flex flex-col gap-1.5 rounded-[14px] p-3.5" style={style}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}

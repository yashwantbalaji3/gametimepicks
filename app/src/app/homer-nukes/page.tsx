/**
 * /homer-nukes — RETIRED (2026-06-30). Homer Nukes never settled a profitable card (no graded history,
 * MLB home-run props were data-gated), so it was retired from the product suite. The route is kept as a
 * stable "retired" landing so old links don't 404; the product id is retained in the registry and its
 * historical artifacts are preserved. No money, no active product surface.
 */
import Link from "next/link";
import StatusBadge from "@/components/ui/status-badge";

export const metadata = {
  title: "Homer Nukes (retired) · GameTime Picks",
  description: "Homer Nukes has been retired from the product suite.",
  robots: { index: false, follow: false },
};

export default function HomerNukesRetiredPage() {
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-16 flex items-center justify-center">
      <div className="max-w-md rounded-2xl px-6 py-8 text-center" style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)" }}>
        <StatusBadge status="retired" label="Retired product" />
        <h1 className="mt-3 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 22, fontWeight: 800 }}>Homer Nukes has been retired</h1>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          The daily MLB home-run parlay never settled a profitable card and its props were data-gated, so we
          retired it from the active product suite. Its history is preserved for the record.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link href="/world-cup-specials" className="vault-press rounded-full px-4 py-2 font-mono text-[12px] font-bold" style={{ color: "var(--vault-gold-bright)", border: "1px solid var(--vault-gold-bright)", textDecoration: "none" }}>World Cup Specials →</Link>
          <Link href="/bank-builder" className="vault-press rounded-full px-4 py-2 font-mono text-[12px]" style={{ color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)", textDecoration: "none" }}>Bank Builder →</Link>
          <Link href="/mlb" className="vault-press rounded-full px-4 py-2 font-mono text-[12px]" style={{ color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)", textDecoration: "none" }}>MLB hub →</Link>
        </div>
      </div>
    </div>
  );
}

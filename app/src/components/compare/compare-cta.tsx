/**
 * One contextual Compare / Matchup link (v1.4 · §127–§129). Server-renderable. Rendered ONLY when its destination
 * exists in this deploy (the caller decides from the compare projection) — never a dead CTA.
 */
import Link from "next/link";

export default function CompareCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} data-compare-cta style={{ display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 14px", borderRadius: 999, fontSize: 13, color: "var(--vault-text)", border: "1px solid var(--vault-border)", textDecoration: "none", whiteSpace: "nowrap" }}>
      {children}
    </Link>
  );
}

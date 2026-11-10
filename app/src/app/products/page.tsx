/**
 * /products — the Products primary (2026-11-09 five-slot nav: Today · Sports · Products · Results · Ask).
 *
 * One card per paper product, read from the canonical destination list (lib/navigation.ts, group "products"), so a
 * product can never be on this page and missing from the footer sitemap, or the reverse. Static: names, one-line
 * descriptions and links only — each product page owns its own state, record and cards.
 */
import Link from "next/link";
import PageHero from "@/components/page-hero";
import { NAV_DESTINATIONS } from "@/lib/navigation";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/products/", {
  title: "Products · GameTime Picks",
  description: "Parlay Lab, Bank Builder, Moonshot and every other GameTimePicks paper product, in one place. Paper-only and educational.",
});

const PRODUCT_CARDS = NAV_DESTINATIONS.filter((d) => d.group === "products");

export default function ProductsPage() {
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <PageHero eyebrow="Products" title="Products" sub="Every GameTimePicks paper product. Paper-only and educational: no stake is ever placed." />
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3" data-products-list="">
        {PRODUCT_CARDS.map((d) => (
          <li key={d.href}>
            <Link
              href={d.href}
              className="vault-press flex h-full min-h-[64px] flex-col gap-1 rounded-[12px] px-4 py-3"
              style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-border)", color: "var(--vault-text)", textDecoration: "none" }}
              data-product-card={d.href}
            >
              <span className="font-display text-[16px] font-semibold">
                {d.glyph ? <span aria-hidden="true">{d.glyph} </span> : null}{d.label}
              </span>
              {d.desc || d.note ? (
                <span className="text-[13px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{[d.desc, d.note].filter(Boolean).join(" · ")}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

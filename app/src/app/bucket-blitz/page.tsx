/**
 * /bucket-blitz — the NBA signature product, named and not yet built.
 *
 * Everything on the page is derived: the gate stages from the committed assessment, the schedule
 * counts from the captured artifact. See components/products/product-in-development for why this
 * route exists at all rather than the name simply linking nowhere.
 */
import path from "node:path";
import { notFound } from "next/navigation";
import ProductInDevelopment from "@/components/products/product-in-development";
import { productReadiness } from "@/lib/products/product-readiness";
import { gateKeyFor, signatureFor } from "@/lib/products/signature-products";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/bucket-blitz/", {
  /* W9 (audit row 27): an in-development placeholder with no pick is not a search result. noindex, links followed; the
     route inventory marks it indexable: false, and it was never in the sitemap (classification "product"). */
  robots: { index: false, follow: true },
  title: "Bucket Blitz · GameTime Picks",
  description:
    "The NBA signature product, in development. What is captured today, and every stage still standing between that and a published read. No picks — no NBA player model is validated yet. The NBA Official Forecasts, schedule and official finals are on the NBA hub.",
});

export default function BucketBlitzPage() {
  const product = signatureFor("nba");
  if (!product) notFound();
  const readiness = productReadiness(gateKeyFor(product), path.join(process.cwd(), "public", "data"));

  return (
    <ProductInDevelopment
      product={product}
      readiness={readiness}
      scheduleHref="/nba/"  /* P0 10-28: /nba publishes the NBA Official Forecasts (with schedule and finals); the label says so */
      scheduleLabel="See the NBA Official Forecasts, schedule and finals"
    />
  );
}

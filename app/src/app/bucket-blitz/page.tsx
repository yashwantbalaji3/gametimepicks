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

export const metadata = {
  title: "Bucket Blitz · GameTime Picks",
  description:
    "The NBA signature product, in development. What is captured today, and every stage still standing between that and a published read. No picks — the league is out of season and no player model is validated.",
};

export default function BucketBlitzPage() {
  const product = signatureFor("nba");
  if (!product) notFound();
  const readiness = productReadiness(gateKeyFor(product), path.join(process.cwd(), "public", "data"));

  return (
    <ProductInDevelopment
      product={product}
      readiness={readiness}
      scheduleHref="/results/nba/"  /* final destination — /nba is a retired redirect */
      scheduleLabel="See the captured NBA schedule"
    />
  );
}

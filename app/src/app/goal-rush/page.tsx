/**
 * /goal-rush — the Premier League signature product, named and not yet built.
 *
 * Everything on the page is derived: the gate stages from the committed assessment, the fixture
 * counts from the captured artifact. See components/products/product-in-development for why this
 * route exists at all rather than the name simply linking nowhere.
 */
import path from "node:path";
import { notFound } from "next/navigation";
import ProductInDevelopment from "@/components/products/product-in-development";
import { productReadiness } from "@/lib/products/product-readiness";
import { gateKeyFor, signatureFor } from "@/lib/products/signature-products";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/goal-rush/", {
  title: "Goal Rush · GameTime Picks",
  description:
    "The Premier League signature product, in development. Its inputs exist — authorized matchweek odds and a validated anytime-goalscorer model on /epl — but the product assembled from them does not, so no picks publish here yet.",
});

export default function GoalRushPage() {
  const product = signatureFor("soccer");
  if (!product) notFound();
  const readiness = productReadiness(gateKeyFor(product), path.join(process.cwd(), "public", "data"));

  return (
    <ProductInDevelopment
      product={product}
      readiness={readiness}
      scheduleHref="/epl"
      scheduleLabel="See the captured Premier League fixtures"
    />
  );
}

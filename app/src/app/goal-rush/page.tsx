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

export const metadata = {
  title: "Goal Rush · GameTime Picks",
  description:
    "The Premier League signature product, in development. What is captured today, and every stage still standing between that and a published read. No picks — there is no validated scorer model yet.",
};

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

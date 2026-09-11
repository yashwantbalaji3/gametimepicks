import type { Metadata } from "next";
import LegalDocument from "@/components/legal/legal-document";
import { guardLegalRoute } from "@/lib/legal/guard";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata: Metadata = withRouteMetadata("/terms/", {
  title: "Terms of Use — GameTimePicks",
  description: "The terms that govern use of GameTimePicks, a paper-only, educational sports-analytics site.",
});

export default function Page() {
  const { publishable, reasons } = guardLegalRoute("terms");
  return <LegalDocument id="terms" publishable={publishable} reasons={reasons} />;
}

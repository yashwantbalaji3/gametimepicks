import type { Metadata } from "next";
import LegalDocument from "@/components/legal/legal-document";
import { guardLegalRoute } from "@/lib/legal/guard";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata: Metadata = withRouteMetadata("/privacy/", {
  title: "Privacy Notice — GameTimePicks",
  description: "What GameTimePicks collects (nothing personal today), what stays on your device, and which services your browser contacts.",
});

export default function Page() {
  const { publishable, reasons } = guardLegalRoute("privacy");
  return <LegalDocument id="privacy" publishable={publishable} reasons={reasons} />;
}

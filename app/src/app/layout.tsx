import type { Metadata } from "next";
import type { ReactNode } from "react";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import DisclaimerBanner from "@/components/disclaimer-banner";

import "./globals.css";

export const metadata: Metadata = {
  title: "GametimePicks — Sports Prop Analytics Lab",
  description:
    "An educational sports analytics project comparing model projections against market lines for NBA player props. Real player data, transparent methodology, tracked results.",
  metadataBase: new URL("https://gametimepicks.yashwantbalaji.com"),
  openGraph: {
    title: "GametimePicks",
    description:
      "Educational sports prop analytics lab — transparent model leans on NBA player props.",
    url: "https://gametimepicks.yashwantbalaji.com",
    siteName: "GametimePicks",
    locale: "en_US",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="vault-shell">
        <span aria-hidden className="gtp-floor-lights" />
        <DisclaimerBanner />
        <Nav />
        <main className="relative z-10">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

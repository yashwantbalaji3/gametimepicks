import type { Metadata } from "next";
import type { ReactNode } from "react";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import DisclaimerBanner from "@/components/disclaimer-banner";
import MobileBottomNav from "@/components/mobile-bottom-nav";
// PR `feature/results-ux-restructure` (2026-05-29) — removed the
// `DesktopSportsRail` import. The rail duplicated the top nav
// (Home / Parlay Lab / Results) for desktop users and surfaced
// sport filter pills (All / NBA / MLB / Mixed / Custom) that
// only matter inside Parlay Lab's own filter toolbar. Removing
// it claws back the lg:pl-[76px] offset and gives /results,
// /parlay-lab, and /projections a wider, less cluttered shell.

import "./globals.css";
// DESIGN PREVIEW ONLY (Concept B — Card Break social). Theme-override layer
// imported after globals.css; remaps design tokens + chrome only. Do not merge.
import "./concept-b.css";

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
        {/* PR `feature/results-ux-restructure` (2026-05-29) — dropped
            the lg:pl-[76px] offset along with the desktop sports rail.
            Content now uses the full viewport width on desktop, and
            the existing `pb-[88px] md:pb-0` clears the mobile bottom
            nav unchanged. */}
        <main className="relative z-10 pb-[88px] md:pb-0">
          {children}
        </main>
        <Footer />
        {/* Mobile bottom nav — fixed bottom, hidden at md+. */}
        <MobileBottomNav />
      </body>
    </html>
  );
}

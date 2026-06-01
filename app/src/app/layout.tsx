import type { Metadata } from "next";
import type { ReactNode } from "react";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import DisclaimerBanner from "@/components/disclaimer-banner";
import MobileBottomNav from "@/components/mobile-bottom-nav";
// CONCEPT A (Command Center) PREVIEW ONLY — left rail + status bar shell.
import CommandRail from "@/components/concept-a/command-rail";
import StatusBar from "@/components/concept-a/status-bar";
// PR `feature/results-ux-restructure` (2026-05-29) — removed the
// `DesktopSportsRail` import. The rail duplicated the top nav
// (Home / Parlay Lab / Results) for desktop users and surfaced
// sport filter pills (All / NBA / MLB / Mixed / Custom) that
// only matter inside Parlay Lab's own filter toolbar. Removing
// it claws back the lg:pl-[76px] offset and gives /results,
// /parlay-lab, and /projections a wider, less cluttered shell.

import "./globals.css";
import "./concept-a-theme.css";

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
        {/* CONCEPT A (Command Center) PREVIEW ONLY — persistent left rail
            on desktop; the production top Nav is kept for mobile only.
            Everything except the rail lives in an offset content column. */}
        <CommandRail />
        <div className="lg:pl-[232px]">
          <DisclaimerBanner />
          <div className="lg:hidden">
            <Nav />
          </div>
          <main className="relative z-10 pb-[88px] md:pb-0">
            <StatusBar />
            {children}
          </main>
          <Footer />
        </div>
        {/* Mobile bottom nav — fixed bottom, hidden at md+. */}
        <MobileBottomNav />
      </body>
    </html>
  );
}

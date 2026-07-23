import type { Metadata } from "next";
import type { ReactNode } from "react";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import DisclaimerBanner from "@/components/disclaimer-banner";
import MobileBottomNav from "@/components/mobile-bottom-nav";
import CommandRail from "@/components/command-rail";
import SlateStatusBar from "@/components/slate-status-bar";
// PR `feature/results-ux-restructure` (2026-05-29) — removed the
// `DesktopSportsRail` import. The rail duplicated the top nav
// (Home / Parlay Lab / Results) for desktop users and surfaced
// sport filter pills (All / NBA / MLB / Mixed / Custom) that
// only matter inside Parlay Lab's own filter toolbar. Removing
// it claws back the lg:pl-[76px] offset and gives /results,
// /parlay-lab, and /projections a wider, less cluttered shell.

import "./globals.css";

export const metadata: Metadata = {
  title: "GameTimePicks — Simulation-Powered Sports Analytics (Public Beta)",
  description:
    "Explore probabilities, 10,000-run game simulations, and market comparisons. A simulation-powered sports analytics platform — paper-only, educational, and research-backed. Public beta.",
  metadataBase: new URL("https://gametimepicks.yashwantbalaji.com"),
  openGraph: {
    title: "GameTimePicks — Simulation-Powered Sports Analytics",
    description:
      "10,000-run game simulations and market comparisons. Explore probabilities — paper-only, educational, public beta.",
    url: "https://gametimepicks.yashwantbalaji.com",
    siteName: "GameTimePicks",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/brand/gametime-picks-logo.png",
        width: 1672,
        height: 941,
        alt: "GameTimePicks — simulation-powered sports analytics (public beta)",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GameTimePicks — Simulation-Powered Sports Analytics",
    description:
      "10,000-run game simulations and market comparisons. Explore probabilities — paper-only, educational, public beta.",
    images: ["/brand/gametime-picks-logo.png"],
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
        {/* Command Center shell: a persistent left rail on desktop (lg+);
            the horizontal top Nav is kept for mobile only. Everything
            except the rail lives in a column offset past it on desktop so
            the disclaimer, status bar, content, and footer all clear the
            rail. */}
        <CommandRail />
        <div className="lg:pl-[232px]">
          <DisclaimerBanner />
          <div className="lg:hidden">
            <Nav />
          </div>
          <main className="relative z-10 pb-[88px] md:pb-0">
            <SlateStatusBar />
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

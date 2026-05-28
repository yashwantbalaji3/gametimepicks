import type { Metadata } from "next";
import type { ReactNode } from "react";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import DisclaimerBanner from "@/components/disclaimer-banner";
import MobileBottomNav from "@/components/mobile-bottom-nav";
import DesktopSportsRail from "@/components/desktop-sports-rail";

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
        {/* Desktop-only fixed left sports rail. Hidden at < lg.
            Mounted siblings to <main> so it overlays from the left. */}
        <DesktopSportsRail />
        {/* `lg:pl-[64px]` offsets content to the right of the rail
            on desktop. `pb-[88px]` clears the mobile bottom nav so
            content isn't hidden under it on small viewports.
            md:pb-0 removes that padding once the bottom nav is hidden. */}
        <main className="relative z-10 lg:pl-[64px] pb-[88px] md:pb-0">
          {children}
        </main>
        <Footer />
        {/* Mobile bottom nav — fixed bottom, hidden at md+. */}
        <MobileBottomNav />
      </body>
    </html>
  );
}

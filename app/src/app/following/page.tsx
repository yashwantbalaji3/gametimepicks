/**
 * /following — manage what this device follows (v1.1.2). PUBLIC, account-free.
 *
 * Statically exported like every route: the initial HTML is identical for every reader and says
 * nothing about what anyone follows. The list is read from this browser after load.
 */
import Link from "next/link";
import FollowingManager from "@/components/follow/following-manager";
import { legacyNameMap, teamLabelMap } from "@/lib/follow/entity-registry";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { compactFollowResearchMap } from "@/lib/research-pages/follow-links.mjs";
import { researchIndex } from "@/lib/research-pages/projection-store";

export const metadata = withRouteMetadata("/following/", {
  title: "Following · GameTime Picks",
  description: "The teams and players you follow on this device. Saved in this browser only — no account.",
  alternates: { canonical: "/following" },
  /* v1.1.3 fix: a crawler follows nothing, so every indexed copy of this page is the same empty shell.
     Matches /saved. (v1.1.2 shipped this route with no robots directive.) */
  robots: { index: false, follow: false },
});

export default function FollowingPage() {
  return (
    <main className="mx-auto px-4 py-8 sm:py-10" style={{ maxWidth: 820 }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(26px,5vw,34px)", color: "var(--vault-text)", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
        Following
      </h1>
      <p style={{ fontSize: 13.5, color: "var(--vault-text-mute)", lineHeight: 1.6, maxWidth: 620, margin: "0 0 22px" }}>
        Following is saved on this device. There is no account, and it does not sync to other devices.
        It changes what GameTimePicks shows you first — never a forecast, a score, or a result.
      </p>
      <FollowingManager legacyMap={legacyNameMap()} teamLabels={teamLabelMap()} researchMap={compactFollowResearchMap(researchIndex())} />
      <p style={{ fontSize: 12.5, color: "var(--vault-text-faint)", marginTop: 24 }}>
        See what these teams and players are doing now on <Link href="/my/" style={{ color: "var(--vault-gold-bright)" }}>My GameTime</Link>.
      </p>
    </main>
  );
}

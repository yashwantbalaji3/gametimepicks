/**
 * /my — My GameTime (v1.1.3). PUBLIC route, personalized in the browser.
 *
 * Statically exported like every route: the HTML is identical for every reader and carries only public
 * product data (the build-time read model). What makes it "mine" is read from THIS browser after load —
 * the Follow and Saved stores — and nothing about a reader's follows is sent anywhere.
 *
 * NOINDEX, matching /saved: a crawler has no follows, so every indexed copy would be the same empty
 * shell. The route is reachable and linkable; it is simply not a search result.
 */
import MyGameTime from "@/components/my/my-gametime";
import { buildMyReadModel } from "@/lib/my/read-model";
import { buildAsOfIso } from "@/lib/build-asof";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/my/", {
  title: "My GameTime · GameTime Picks",
  description: "Live games, upcoming matchups, saved forecasts, and results for what you follow — saved on this device.",
  alternates: { canonical: "/my" },
  robots: { index: false, follow: false },
});

export default function MyGameTimePage() {
  // ONE build instant (Phase 6): the read model is resolved at the build's stamped asOf, not a fresh clock.
  const model = buildMyReadModel({ nowIso: buildAsOfIso() });
  return (
    <main className="mx-auto px-4 py-8 sm:py-10" style={{ maxWidth: 1040 }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(26px,5vw,34px)", color: "var(--vault-text)", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
        My GameTime
      </h1>
      <p style={{ fontSize: 13.5, color: "var(--vault-text-mute)", lineHeight: 1.6, maxWidth: 640, margin: "0 0 22px" }}>
        Live games, upcoming matchups, saved forecasts, and results for what you follow. Based only on what
        you follow and save on this device.
      </p>
      <MyGameTime model={model} />
    </main>
  );
}

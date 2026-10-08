/**
 * /nfl/world-model → /nfl/#nfl-boards (founder directive 2026-10-08: one NFL forecast experience). The World Model V2
 * Top boards launched in #1024 are now the hub's Weekly leaders, ranked from the same player rows as every game page.
 * Client redirect: under `output: "export"` a server redirect emits an error shell (same stub as the other aliases).
 */
import ClientRedirect from "@/components/client-redirect";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/nfl/world-model/", {
  title: "NFL weekly leaders · GameTime Picks",
  robots: { index: false, follow: true },
});

export default function WorldModelBoardsRedirect() {
  return <ClientRedirect to="/nfl/#nfl-boards" label="NFL weekly leaders" />;
}

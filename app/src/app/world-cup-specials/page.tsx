/**
 * /world-cup-specials → /results. World Cup Specials is RETIRED in the product registry: it was a
 * World-Cup-only longshot lane, and the competition it depended on is complete. Its settled history
 * stays in the published record; the standalone tracker is no longer a destination of its own.
 *
 * Client-redirect stub (static-export-safe; server redirect() emits an error shell under
 * output:export), kept noindex so it stays out of search discovery.
 */
import ClientRedirect from "@/components/client-redirect";

export const metadata = {
  title: "World Cup Specials (retired) · GameTime Picks",
  robots: { index: false, follow: false },
};

export default function WorldCupSpecialsRetiredRedirect() {
  return <ClientRedirect to="/results/" label="Results" />;
}

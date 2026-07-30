/**
 * /trends → /mlb/board. Player Trends read from a stale demo snapshot that daily automation never
 * refreshed; it was retired to a "moved" notice and is now a plain alias. Last-10 form still lives on
 * every player card on the model board. Client-redirect stub (static-export-safe; server redirect()
 * emits an error shell under output:export), kept noindex so it stays out of search discovery.
 */
import ClientRedirect from "@/components/client-redirect";

export const metadata = {
  title: "Player trends (retired) · GameTime Picks",
  robots: { index: false, follow: false },
};

export default function TrendsRetiredRedirect() {
  return <ClientRedirect to="/mlb/board/" label="the MLB model board" />;
}

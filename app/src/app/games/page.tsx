/**
 * /games — permanent alias of /simulate (the two rendered the identical SimulateLobby). Collapsed to a
 * single canonical URL: /games now client-redirects to /simulate (static-export-safe; server redirect()
 * does not work under output:export). Deep links /games/[sport]/[gameId] are unaffected.
 */
import ClientRedirect from "@/components/client-redirect";

export const metadata = {
  title: "Simulate Games · GameTime Picks",
  description: "Simulate Games — moved to /simulate.",
  robots: { index: false, follow: false },
};

export default function GamesPage() {
  return <ClientRedirect to="/simulate/" label="Simulate" />;
}

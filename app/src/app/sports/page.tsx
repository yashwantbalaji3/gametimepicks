/**
 * /sports → /mlb. The sport directory listed MLB alongside NBA and UFC with per-sport counters. Only
 * MLB is FULL_MODEL in the capability registry; NBA is HISTORICAL_ONLY and UFC is SCAFFOLD_ONLY, so a
 * directory presenting three equal tiles overstated coverage no matter how carefully each tile was
 * date-gated. One live sport does not need a directory. Client-redirect stub (static-export-safe;
 * server redirect() emits an error shell under output:export).
 *
 * The NBA settled archive stays published at /results/nba.
 */
import ClientRedirect from "@/components/client-redirect";

export const metadata = {
  title: "Sports · GameTime Picks",
  robots: { index: false, follow: false },
};

export default function SportsDirectoryRedirect() {
  return <ClientRedirect to="/mlb/" label="MLB" />;
}

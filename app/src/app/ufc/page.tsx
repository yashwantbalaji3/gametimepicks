/**
 * /ufc → /today. UFC is SCAFFOLD_ONLY in the capability registry, and that state says exactly what
 * this route may publish: nothing predictive. The hub said otherwise — Projections and Suggested
 * Cards tabs, a fight-card simulator entry point — for a sport whose moneyline is a de-vigged market
 * price with a capped nudge (no independent signal), and whose bouts are not backtestable at all
 * because no point-in-time pregame odds are captured. Fail-closed gates kept the numbers honest; the
 * SHAPE of the page still read as coverage.
 *
 * Retired to a redirect for the same reason NHL and IPL were: a destination is a claim. The UFC work
 * continues internally and returns when there is a signal to stand behind. Client-redirect stub
 * (static-export-safe; server redirect() emits an error shell under output:export).
 */
import ClientRedirect from "@/components/client-redirect";

export const metadata = {
  title: "UFC · GameTime Picks",
  robots: { index: false, follow: false },
};

export default function UfcRetiredRedirect() {
  return <ClientRedirect to="/today/" label="Today" />;
}

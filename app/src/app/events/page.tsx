/**
 * /events → /today. The schedule hub listed WNBA, UFC and the (now complete) World Cup — three
 * SCAFFOLD_ONLY leagues whose snapshots have no refresh job, so the page aged into a stale calendar.
 * Today's slate is the honest daily destination. Client-redirect stub (static-export-safe; server
 * redirect() emits an error shell under output:export).
 */
import ClientRedirect from "@/components/client-redirect";

export const metadata = {
  title: "Events · GameTime Picks",
  robots: { index: false, follow: false },
};

export default function EventsRedirect() {
  return <ClientRedirect to="/today/" label="Today" />;
}

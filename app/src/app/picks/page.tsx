/**
 * /picks → /build#suggested-cards (Program 142, Train 1 · Deployment B).
 *
 * Picks Lab is retired. It owned two things and both now live where they belong, in production and
 * verified BEFORE this redirect went in — that ordering is the whole merge gate:
 *
 *   the full model-ranked list  → Market Center  (shipped 62bdd241)
 *   prebuilt cards + stake input → Build          (shipped e9175e8a)
 *
 * Client redirect, not `redirect()`: under `output: "export"` a server redirect emits an error
 * shell. This is the same ClientRedirect stub the other retired aliases use.
 *
 * The legacy aliases (/parlays, /parlay-lab, /mlb/parlays, /nba/parlays) were repointed at the SAME
 * final target in this change rather than being left to hop through here — a redirect chain is a
 * second thing to break.
 */
import ClientRedirect from "@/components/client-redirect";

export const metadata = {
  title: "Picks · GameTime Picks",
  robots: { index: false, follow: false },
};

export default function PicksRedirect() {
  return <ClientRedirect to="/build#suggested-cards" label="Suggested cards" />;
}

/**
 * /board → /mlb/board. The legacy unnamespaced "Model Board" rendered the NBA board, whose source has
 * been failing since 2026-06-13. Rather than keep a stale board at a generic URL, this alias points at
 * the board of the one sport with a live model. Client-redirect stub (static-export-safe; server
 * redirect() emits an error shell under output:export).
 *
 * The measured Category A/B/C settle rates that used to live in this page's tooltip are unchanged and
 * still published on /about, which remains the guarded surface for those claims.
 */
import ClientRedirect from "@/components/client-redirect";

export const metadata = {
  title: "Model Board · GameTime Picks",
  robots: { index: false, follow: false },
};

export default function BoardRedirect() {
  return <ClientRedirect to="/mlb/board/" label="the MLB model board" />;
}

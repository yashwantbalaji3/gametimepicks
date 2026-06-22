/**
 * /parlays → /picks. Consolidation: there is ONE canonical suggested-parlay surface — the Parlay Lab
 * at /picks. This legacy route used to render a parallel "Parlays" page (same engine, slightly
 * different chrome), which left users unsure which was the real parlay page. It now redirects to the
 * canonical Parlay Lab so old links never break and there is a single source of truth.
 */
import { redirect } from "next/navigation";

export default function ParlaysRedirect() {
  redirect("/picks");
}

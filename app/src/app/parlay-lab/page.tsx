/**
 * /parlay-lab → /picks. The suggested-card lobby is now /picks and the custom builder is
 * /build; this legacy route redirects to the card lobby so old links never break. (Build-
 * intent users land on Picks, which links prominently to /build.)
 */
import { redirect } from "next/navigation";

export default function ParlayLabRedirect() {
  redirect("/picks");
}

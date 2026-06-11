/**
 * Root route → the Today daily board. /today is the single primary landing experience
 * (the old multi-concept homepage was confusing); the brand mark + this redirect both
 * lead users straight to what's live today. Old "/" links keep working via the redirect.
 */
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/today");
}

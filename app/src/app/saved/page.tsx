/**
 * SAVED FORECASTS (P310) — the forecasts a reader kept, and what happened to them.
 *
 * Browser-local (localStorage), never an account, never a wager: a saved forecast is an analytics item — an immutable
 * snapshot of what the card said when it was saved, with the graded result joined from the canonical ledgers once it
 * exists. Personal, so not indexed.
 */
import type { Metadata } from "next";
import Link from "next/link";
import SavedList from "@/components/saved/saved-list";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata: Metadata = {
  ...withRouteMetadata("/saved/", {
    title: "Saved Forecasts — GameTime Picks",
    description: "The forecasts you saved in this browser, with the graded result once each game is settled. An analytics shortlist, not a bet slip.",
  }),
  robots: { index: false, follow: false },
};

export default function SavedForecastsPage() {
  return (
    <div className="vault-page-shell flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold)", fontSize: 10.5 }}>Saved forecasts</span>
        <h1 className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: "clamp(24px,5vw,34px)", fontWeight: 800, lineHeight: 1.05 }}>What you saved, and what happened</h1>
        <p className="m-0 max-w-2xl text-[13.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          Each saved forecast is the card exactly as it read when you saved it — the number, the model&rsquo;s status and the time its numbers were produced. It never changes afterwards; the result is added beside it from the official grading. Saved in this browser only, nothing is sent anywhere, and this is not a bet slip: no stake, no odds, no return. Model status words are explained in the <Link href="/models/" style={{ color: "var(--vault-gold-bright)" }}>Model Lab</Link>.
        </p>
        {/* v1.1.2: the other thing this device remembers. Saving keeps ONE forecast; following a team or
            player is a separate, general preference — they share a page link, never a store. */}
        <p className="m-0 text-[12.5px]" style={{ color: "var(--vault-text-faint)" }}>
          Teams and players you follow are separate from saved forecasts — <Link href="/following/" style={{ color: "var(--vault-gold-bright)" }}>manage following</Link>, or see both together on <Link href="/my/" style={{ color: "var(--vault-gold-bright)" }}>My GameTime</Link>.
        </p>
      </header>
      <SavedList />
    </div>
  );
}

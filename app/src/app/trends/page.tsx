import Link from "next/link";

/**
 * /trends — Phase 13.
 *
 * The original Player Trends page read from `trends.json`, a stale
 * single-player demo snapshot that was never refreshed by the daily
 * automation. Phase 12 removed the nav link; Phase 13 retires the page
 * itself.
 *
 * Why a soft retirement instead of a hard 404:
 *   - Static export (`output: "export"`) cannot use Next.js redirects
 *     (those require a server).
 *   - Hard-deleting the route would 404 any external link to /trends.
 *   - This page renders an honest "moved" notice and points users to
 *     the live model board, where every player's last-10 trends are
 *     already accessible via the "Show last 10 trends" toggle on each
 *     player card.
 *
 * If you'd rather hard-delete this route, just remove this file. Vercel
 * will return its default 404 page.
 */
export const metadata = {
  title: "Player trends (retired) · GameTime Picks",
  // Retired soft-redirect landing — keep it out of search discovery (still reachable by direct URL).
  robots: { index: false, follow: false },
};

export default function TrendsRetiredPage() {
  return (
    <div className="mx-auto max-w-[760px] px-6 py-20 text-center">
      <div
        className="font-mono text-[10px] uppercase tracking-[0.18em] mb-4"
        style={{ color: "var(--vault-gold)" }}
      >
        page retired
      </div>

      <h1 className="font-display text-[32px] md:text-[44px] tracking-tightest font-semibold leading-[1.05] mb-5">
        Player trends are now on the model board.
      </h1>

      <p
        className="text-[14px] md:text-[15px] leading-relaxed mb-8 max-w-md mx-auto"
        style={{ color: "var(--vault-text-mute)" }}
      >
        We retired the standalone trends page. Real last-10 trend graphs
        for every player are now embedded directly inside each player card
        on the model board — open a card and tap{" "}
        <span style={{ color: "var(--vault-gold-bright)" }}>
          show last 10 trends
        </span>
        .
      </p>

      <div className="flex flex-wrap gap-3 justify-center">
        <Link
          href="/board"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-[3px] font-medium text-[14px] tracking-tight transition-colors"
          style={{
            background: "var(--vault-gold)",
            color: "#0A0705",
          }}
        >
          Go to Model Board
          <span aria-hidden>→</span>
        </Link>
        <Link
          href="/picks"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-[3px] font-medium text-[14px] tracking-tight transition-colors"
          style={{
            background: "var(--vault-panel)",
            color: "var(--vault-text)",
            border: "1px solid var(--vault-border)",
          }}
        >
          Try the Parlay Lab
        </Link>
      </div>
    </div>
  );
}

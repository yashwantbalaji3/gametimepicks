/**
 * /homer-nukes — the product's own page.
 *
 * This route was a redirect stub to /results: Homer Nukes was retired on 2026-06-30 because the
 * anytime-home-run provider feed it read no longer existed, and a product with no inputs is not a
 * product. It now has inputs it owns — a home-run probability computed from free StatsAPI data
 * rather than read from a feed — so it gets a destination back.
 *
 * The page is a LIST, deliberately. The retired version was a five-leg parlay that paid only if
 * every leg landed; five independent probabilities is the stronger claim, because each one settles
 * on its own and a 30% pick missing is the model working as described rather than a ticket hiding
 * which leg was wrong.
 *
 * Server component. Reads the committed board and the settled receipts; computes nothing here.
 */
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

import { currentEtDate } from "@/lib/freshness";
import { activeMlbDate } from "@/lib/data-mlb";
import { loadHomerNukesBoard } from "@/lib/mlb/homer-nukes-board";
import HomerNukesBoardSection from "@/components/mlb/homer-nukes-board";
import SlateLivenessBanner from "@/components/slate-liveness-banner";

export const metadata = {
  title: "Homer Nukes · GameTime Picks",
  description:
    "The model's five most likely home runs today, each with its own probability and the numbers behind it. Paper-only, educational.",
};

/** Every graded day on disk, newest first. Absent until a slate settles. */
function settledDays(dir: string): { date: string; hits: number; picks: number }[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /^settled-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .reverse()
      .map((f) => {
        const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        const picks = r.picks ?? [];
        return {
          date: r.date,
          hits: picks.filter((p: { homered?: boolean }) => p.homered).length,
          picks: picks.length,
        };
      });
  } catch {
    return [];
  }
}

export default function HomerNukesPage() {
  const dataRoot = path.join(process.cwd(), "public", "data");
  const date = activeMlbDate() ?? currentEtDate();
  const board = loadHomerNukesBoard(dataRoot, date);
  const settled = settledDays(path.join(dataRoot, "mlb", "homer-nukes"));
  const gradedPicks = settled.reduce((n, d) => n + d.picks, 0);
  const gradedHits = settled.reduce((n, d) => n + d.hits, 0);

  return (
    <div data-sport="mlb" className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="font-mono uppercase tracking-[0.18em] flex items-center gap-2" style={{ color: "var(--sport-theme-ink)", fontSize: 10 }}>
          <span aria-hidden>💣</span> Homer Nukes · MLB
        </span>
        <h1 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>
          The five most likely home runs today
        </h1>
        <p className="m-0 max-w-[68ch]" style={{ color: "var(--vault-text-mute)", fontSize: 14, lineHeight: 1.6 }}>
          Each pick carries its own probability and settles on its own — this is a list, not a parlay.
          A 30% pick that does not land is the model behaving as described.
        </p>
      </header>

      <SlateLivenessBanner
        buildTimeToday={date}
        latestSlate={date}
        latestSlateHasGames={(board?.slate.games ?? 0) > 0}
        archiveHref="/results"
        archiveLabel="See results & receipts"
        includeMlbNote
        includeWcFocus={false}
      />

      {board ? (
        <HomerNukesBoardSection board={board} />
      ) : (
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 14 }}>
          Today&rsquo;s home-run board has not been published yet. It is built each morning from the
          day&rsquo;s confirmed starters.
        </p>
      )}

      <section className="flex flex-col gap-2.5 rounded-[14px] p-4"
        style={{ background: "rgba(11,18,14,0.5)", border: "1px solid var(--vault-border)" }}>
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>
          How the number is built
        </h2>
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.65 }}>
          A batter&rsquo;s home runs per plate appearance, regressed toward the league rate, multiplied
          by how many home runs the opposing starter allows per batter faced, also regressed. That
          per-trip rate is compounded over the plate appearances a hitter in his lineup slot is
          expected to get.
        </p>
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.65 }}>
          The regression is the load-bearing part. Three home runs in forty trips is 7.5% and almost
          entirely noise; without a prior pulling it back toward the league rate, a hot fortnight
          would win a board whose only job is ranking.
        </p>
        <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 12, lineHeight: 1.6 }}>
          Source: MLB Stats API season totals and confirmed probable starters. No sportsbook
          home-run price is used, so these are not compared to a market number and no edge is claimed.
        </p>
      </section>

      <section className="flex flex-col gap-2.5 rounded-[14px] p-4"
        style={{ background: "rgba(11,18,14,0.5)", border: "1px solid var(--vault-border)" }}>
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>
          Track record
        </h2>
        {settled.length === 0 ? (
          <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.6 }}>
            No slate has been graded yet. Every published board is settled from the official box score
            the following morning, and the record appears here — including the days it misses.
          </p>
        ) : (
          <>
            <p className="m-0" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}>
              {gradedHits} of {gradedPicks} picks homered across {settled.length}{" "}
              {settled.length === 1 ? "slate" : "slates"}
            </p>
            <ul className="m-0 flex flex-col gap-1 p-0" style={{ listStyle: "none" }}>
              {settled.slice(0, 14).map((d) => (
                <li key={d.date} className="flex items-center justify-between font-mono"
                  style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
                  <span>{d.date}</span>
                  <span style={{ color: d.hits > 0 ? "var(--vault-success)" : "var(--vault-text-faint)" }}>
                    {d.hits}/{d.picks} homered
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <Link href="/results/" className="font-mono uppercase tracking-[0.14em] no-underline"
          style={{ color: "var(--sport-theme-ink)", fontSize: 10 }}>
          Full settled record →
        </Link>
      </section>
    </div>
  );
}

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
import { publicationDeadlineUtc } from "@/lib/ops/read-publication-slo";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { homerNukesRecord } from "@/lib/results/homer-nukes-record";
import { loadMlbSeasonComplete, mlbSeasonCompleteCopyFor } from "@/lib/mlb/season-complete-data";
import MlbSeasonCompletePanel from "@/components/mlb/mlb-season-complete-panel";

export const metadata = withRouteMetadata("/homer-nukes/", {
  title: "Homer Nukes · GameTime Picks",
  description:
    "The model's five most likely home runs today, each with its own probability and the numbers behind it. Paper-only, educational.",
});

export default function HomerNukesPage() {
  const dataRoot = path.join(process.cwd(), "public", "data");
  const date = activeMlbDate() ?? currentEtDate();
  const board = loadHomerNukesBoard(dataRoot, date);
  /* THE PUBLIC RECORD (2026-10-23, provenance audit): the settled picks split by publication status — a pick whose
     probability no record shows was published before first pitch is graded but counted in no public figure here, the
     track record or the board's honest-limits line (lib/results/homer-nukes-publication.mjs). P224's rules hold: the
     owner's hit / miss is the grade, and an ungraded pick is in no denominator. */
  const split = homerNukesRecord(dataRoot);
  const settled = split.public.days;
  const legacy = split.unknown;
  /* TRUTH-001: the producer writes NO file on a day with no games (mlb-daily-production prints NO_SLATE by
     design), so "no board" must not read as "not published yet" when the day's own MLB board says 0 games. */
  const mlbSlateGames = (() => {
    try { const b = JSON.parse(fs.readFileSync(path.join(dataRoot, "mlb", "boards", `${date}.json`), "utf8")); return Array.isArray(b?.games) ? b.games.length : null; } catch { return null; }
  })();
  /* OFF-SEASON (2026-10-29): no board and the committed season-state says no MLB game is left — there is no "next game
     day" to promise a board for (lib/mlb/season-complete.mjs). A published board always wins. */
  const seasonComplete = loadMlbSeasonComplete(dataRoot);
  const seasonCopy = mlbSeasonCompleteCopyFor(dataRoot);
  const offSeason = !board && !!seasonComplete && !!seasonCopy
    && (seasonComplete.finalDate ? date > seasonComplete.finalDate : date >= seasonComplete.asOf);
  const gradedPicks = split.public.gradedPicks;
  const gradedHits = split.public.actual;

  return (
    <div data-sport="mlb" className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="font-mono uppercase tracking-[0.18em] flex items-center gap-2" style={{ color: "var(--sport-theme-ink)", fontSize: 10 }}>
          <span aria-hidden>💣</span> Homer Nukes · MLB
        </span>
        <h1 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>
          {offSeason ? "The five most likely home runs, every game day" : "The five most likely home runs today"}
        </h1>
        <p className="m-0 max-w-[68ch]" style={{ color: "var(--vault-text-mute)", fontSize: 14, lineHeight: 1.6 }}>
          Each pick carries its own probability and settles on its own — this is a list, not a parlay.
          A 30% pick that does not land is the model behaving as described.
        </p>
      </header>

      {offSeason && seasonCopy ? <MlbSeasonCompletePanel copy={seasonCopy} /> : <SlateLivenessBanner
        publishDeadlineUtc={publicationDeadlineUtc()}
        buildTimeToday={date}
        latestSlate={date}
        latestSlateHasGames={(board?.slate.games ?? 0) > 0}
        scope="MLB"
        archiveHref="/results"
        archiveLabel="See results & receipts"
        includeMlbNote
        includeWcFocus={false}
      />}

      {board ? (
        <HomerNukesBoardSection board={board} record={split.public} />
      ) : offSeason && seasonCopy ? (
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 14 }}>
          There is no home-run board in the off-season. {seasonCopy.returnsLabel} The track record of the{" "}
          {seasonComplete?.season} boards is below.
        </p>
      ) : mlbSlateGames === 0 ? (
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 14 }}>
          No MLB games are scheduled today, so there is no home-run board. The next one is built the
          morning of the next game day.
        </p>
      ) : (
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 14 }}>
          Today&rsquo;s home-run board has not been published yet. It is built each morning from the
          day&rsquo;s confirmed starters.
        </p>
      )}

      <section className="flex flex-col gap-2.5 rounded-[14px] p-4"
        style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 50%, transparent)", border: "1px solid var(--vault-border)" }}>
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
        style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 50%, transparent)", border: "1px solid var(--vault-border)" }}>
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
                    {d.hits}/{d.graded} homered{d.unknownGraded ? ` · +${d.unknownGraded} status unknown` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {legacy.gradedPicks ? (
              <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6 }} data-publication-unknown>
                Publication status unknown (legacy): {legacy.gradedPicks} more graded {legacy.gradedPicks === 1 ? "pick" : "picks"} ({legacy.actual} homered) {legacy.gradedPicks === 1 ? "is" : "are"} not
                counted above. No record shows {legacy.gradedPicks === 1 ? "its" : "their"} probability was published before first pitch, so{" "}
                {legacy.gradedPicks === 1 ? "it stays" : "they stay"} graded on the record but never in a public figure.
              </p>
            ) : null}
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

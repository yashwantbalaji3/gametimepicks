/**
 * Model-ranked picks — the full ranked list, inside Market Center (Program 142, Train 1 step 3B).
 *
 * WHY THIS EXISTS. `/picks` is being merged away, and the full ranked board is one of the two
 * capabilities that only exists there. Program 141 removed that board from `/picks` believing it was
 * duplicated on `/` and `/today`; it was not — `/` uses only a count and `/today` renders a top-SIX
 * slice — so capability was deleted and the change was reverted before shipping. This component is
 * the destination that has to exist BEFORE `/picks` can be retired, not after.
 *
 * It is deliberately a collapsed secondary section. Market Center's beginner default is a
 * market-comparison view with a reading key; the founder's complaint about that page was that it was
 * "a wall of raw percentages". Putting a second wall above the key would undo the fix. Readers who
 * want the ranked list open it; everyone else is unaffected.
 *
 * Terminology is the Program 141 contract: the difference is in **pp** (percentage points), never
 * "pts", which on this site means scoring points. Definitions are NOT repeated here — they live in
 * `HowToReadMarkets` on the same page, so there is exactly one glossary.
 */
import Link from "next/link";
import type { Top10Board, Top10Pick } from "@/lib/top10/top10-picks";

const pct = (p: number | null | undefined) =>
  typeof p === "number" && Number.isFinite(p) ? `${(p * 100).toFixed(1)}%` : "—";

const americanOdds = (o: number | null | undefined) =>
  typeof o === "number" && Number.isFinite(o) && o !== 0 ? (o > 0 ? `+${o}` : `${o}`) : "—";

/**
 * Signed model-minus-market difference in percentage points. Same convention and same unit as
 * Market Center's own Gap, so a reader moving between the two sections is never comparing two
 * different quantities that look alike.
 */
function ppDifference(pick: Top10Pick): number | null {
  if (typeof pick.modelProbability !== "number" || typeof pick.marketProbability !== "number") return null;
  return (pick.modelProbability - pick.marketProbability) * 100;
}

function Difference({ pick }: { pick: Top10Pick }) {
  const diff = ppDifference(pick);
  if (diff == null) {
    // Withheld rather than guessed — a missing model or market probability is a real state.
    return (
      <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11.5 }} title="One of the two probabilities is unavailable, so no difference is computed">
        — <span style={{ fontSize: 10 }}>no comparison</span>
      </span>
    );
  }
  const magnitude = Math.abs(diff);
  return (
    <span
      className="font-mono"
      style={{ color: magnitude < 1 ? "var(--vault-text-mute)" : "var(--vault-text)", fontSize: 12 }}
      title={`${diff > 0 ? "+" : ""}${diff.toFixed(1)} percentage points — the model estimate minus the market's implied probability`}
    >
      {diff > 0 ? "+" : ""}
      {diff.toFixed(1)} pp
    </span>
  );
}

function Row({ pick, rank }: { pick: Top10Pick; rank: number }) {
  return (
    <li
      className="flex flex-col gap-2 px-3 py-3 sm:px-4"
      style={{ borderTop: "1px solid var(--vault-border)" }}
    >
      <div className="flex items-start gap-3">
        <span
          className="w-5 shrink-0 pt-0.5 text-center font-mono"
          style={{ color: rank <= 3 ? "var(--vault-gold)" : "var(--vault-text-faint)", fontSize: 11 }}
        >
          {rank}
        </span>

        <div className="min-w-0 flex-1">
          <div className="truncate" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>
            {pick.selection}
          </div>
          <div className="mt-0.5 truncate font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
            {pick.game} · {pick.market}
            {pick.startsAt ? ` · ${new Date(pick.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET` : ""}
          </div>
        </div>

        {/* Numbers are labelled, not positional — a screen reader gets "model 58.6%", not "58.6%". */}
        <div className="hidden shrink-0 gap-4 text-right sm:flex">
          <span className="font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}>
            <span className="block" style={{ fontSize: 9.5, color: "var(--vault-text-faint)" }}>model</span>
            {pct(pick.modelProbability)}
          </span>
          <span className="font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}>
            <span className="block" style={{ fontSize: 9.5, color: "var(--vault-text-faint)" }}>market</span>
            {pct(pick.marketProbability)}
          </span>
          <span style={{ minWidth: 74 }}>
            <span className="block font-mono" style={{ fontSize: 9.5, color: "var(--vault-text-faint)" }}>difference</span>
            <Difference pick={pick} />
          </span>
          <span className="font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-mute)", minWidth: 46 }}>
            <span className="block" style={{ fontSize: 9.5, color: "var(--vault-text-faint)" }}>price</span>
            {americanOdds(pick.odds)}
          </span>
        </div>
      </div>

      {/* Mobile: the same four numbers, stacked rather than dropped. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pl-8 sm:hidden font-mono" style={{ fontSize: 11, color: "var(--vault-text-mute)" }}>
        <span>model {pct(pick.modelProbability)}</span>
        <span>market {pct(pick.marketProbability)}</span>
        <Difference pick={pick} />
        <span>{americanOdds(pick.odds)}</span>
      </div>

      <p className="pl-8" style={{ color: "var(--vault-text-mute)", fontSize: 11.5, lineHeight: 1.55, maxWidth: "72ch" }}>
        {pick.reason}
      </p>
      {pick.risk ? (
        <p className="pl-8" style={{ color: "var(--vault-text-faint)", fontSize: 11, lineHeight: 1.5, maxWidth: "72ch" }}>
          Risk: {pick.risk}
        </p>
      ) : null}

      {pick.gameSlug ? (
        <div className="pl-8">
          <Link href={`/mlb/${pick.gameSlug}`} className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10.5 }}>
            Open the full simulation →
          </Link>
        </div>
      ) : null}
    </li>
  );
}

export default function ModelRankedList({ board }: { board: Top10Board }) {
  const picks = board.overall ?? [];

  return (
    <details className="rounded-xl" style={{ border: "1px solid var(--vault-border)", background: "rgba(11, 18, 14,0.45)" }}>
      <summary
        className="cursor-pointer px-4 py-3 font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
      >
        Model-ranked picks · full list ({picks.length})
      </summary>

      <div className="pb-3">
        <p className="px-4 pb-1 pt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12, lineHeight: 1.6, maxWidth: "72ch" }}>
          Every market the model ranked for {board.date}, ordered by its own ranking score. Ranking is
          model confidence and market reliability — <strong>not</strong> a prediction of profit, and not
          ordered by the size of the difference. Terms are defined in the reading key above.
        </p>

        {picks.length === 0 ? (
          <p className="px-4 py-6" style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>
            No ranked picks for {board.date}. That is the model&rsquo;s answer for this slate, not a missing update.
          </p>
        ) : (
          <ol className="list-none p-0 m-0">
            {picks.map((p, i) => (
              <Row key={p.id} pick={p} rank={i + 1} />
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}

/**
 * PreviousHits — the settled Bank Builder ladder wins, shown as compact,
 * visually useful cards (not audit text). Each card carries the sport
 * identity orb, the real step economics ($before → $after, profit), the
 * event when present, official-result confirmation, and a market summary.
 *
 * Honesty contract:
 *   - Only entries with result === "win" render here.
 *   - Every number is the real settled value from the public ledger
 *     artifact (bankrollBefore/After, profitUnits, combinedAmerican).
 *   - We summarise legs by COUNT and MARKET only — never individual player
 *     names. That keeps the public page free of the old Plus100 builder-slip
 *     player clutter while still showing what kind of card each hit was. It
 *     is an honest omission, not fabrication.
 *   - When an entry carries no leg detail, we say "card details unavailable"
 *     rather than inventing any.
 */
import { getSportIdentity } from "@/lib/sport-identity";
import { summarizePreviousHitLegs } from "@/lib/bank-builder-previous-hits";
import type { PublicBuilderEntry } from "@/lib/data-bank-builder";

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string): string {
  try {
    return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  } catch {
    return d;
  }
}

export default function PreviousHits({ hits, recordLabel }: { hits: PublicBuilderEntry[]; recordLabel: string }) {
  if (hits.length === 0) return null;
  return (
    <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5" aria-label="Previous hits">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-zinc-300">Previous hits</h2>
        <span className="text-[12px] text-zinc-400">
          Record <strong className="text-emerald-300">{recordLabel}</strong> · settled from official results
        </span>
      </div>
      <ol className="grid gap-2.5 sm:grid-cols-2">
        {hits.map((e, i) => {
          const id = getSportIdentity(e.sport);
          const summary = summarizePreviousHitLegs(e);
          return (
            <li
              key={e.step}
              className="gtp-fade-up gtp-card-hover flex flex-col gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3.5"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="gtp-sport-orb shrink-0"
                  style={{ width: 34, height: 34, fontSize: 18, ["--orb-grad" as string]: id.gradient }}
                  role="img"
                  aria-label={`${id.label} ${id.ballLabel}`}
                >
                  {id.icon}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-semibold text-zinc-100">
                    Step {e.step} · {id.label}
                  </span>
                  <span className="font-mono text-[10.5px] text-zinc-500 truncate">
                    {fmtDate(e.date)}{e.event ? ` · ${e.event}` : ""}
                  </span>
                </div>
                <span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold tracking-[0.08em] bg-emerald-500/15 text-emerald-300">
                  WON
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-display tabular text-[15px] font-bold text-zinc-200">
                  {usd(e.bankrollBefore)} <span className="text-zinc-500">→</span> {usd(e.bankrollAfter)}
                </span>
                <span className="font-mono text-[11px] text-emerald-300/90">+{usd(e.profitUnits)}</span>
                {typeof e.combinedAmerican === "number" && (
                  <span className="font-mono text-[10.5px] text-zinc-500">
                    {e.combinedAmerican >= 0 ? "+" : ""}{e.combinedAmerican}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {summary ? (
                  <span className="rounded px-1.5 py-0.5 text-[10px] text-zinc-400" style={{ border: "1px solid var(--vault-rule)", background: "rgba(7,11,26,0.4)" }}>
                    {summary}
                  </span>
                ) : (
                  <span className="text-[10.5px] italic text-zinc-500">card details unavailable</span>
                )}
                {e.officialResultConfirmed && (
                  <span className="rounded px-1.5 py-0.5 text-[10px] text-zinc-500" style={{ border: "1px solid var(--vault-rule)", background: "rgba(7,11,26,0.4)" }}>
                    official result confirmed
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

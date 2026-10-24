/**
 * RESULTS · MODEL SUGGESTIONS RECORD (Level A, unpriced). Server component — every number comes from
 * lib/results/level-a-record.mjs over the Level A writers' append-only files; nothing is graded here.
 *
 * Its own section, never pooled with the priced products or sportsbook settlement. Pending and void are never
 * losses. Counts, not rates, below the stated minimum. Each suggestion shows its legs, its joint probability as the
 * Level A pages printed it (jointShownFor), its publication evidence, each leg's official final and its grade.
 */
import { jointShownFor } from "@/lib/products/level-a/suggestions.mjs";
import type { levelARecord } from "@/lib/results/level-a-record.mjs";
import { etDayLabel } from "@/lib/et-stamp.mjs";

type View = ReturnType<typeof levelARecord>;
type Entry = View["entries"][number];

/** The newest product days listed suggestion by suggestion; every older one is still in the counts above. */
const DAYS_LISTED = 7;

const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const etTime = (iso: string | null) => { const t = Date.parse(String(iso ?? "")); return Number.isFinite(t) ? `${ET_TIME.format(new Date(t))} ET` : null; };

const STATUS_WORD: Record<string, string> = { WON: "Won", LOST: "Lost", VOID: "Void — not a loss", PENDING: "Pending — not a loss" };

function Status({ s }: { s: string }) {
  const color = s === "WON" ? "var(--vault-success)" : s === "LOST" ? "var(--vault-text)" : "var(--vault-text-mute)";
  return <span className="font-mono text-[11.5px] uppercase tracking-[0.08em]" style={{ color }} data-status={s}>{STATUS_WORD[s] ?? s}</span>;
}

function joint(e: Entry) {
  if (e.jointProbability == null || e.tier === "untiered") return null;
  return jointShownFor(e.jointProbability, e.tier);
}

function Evidence({ e }: { e: Entry }) {
  const shown = etTime(e.shownAt);
  const served = etTime(e.servedFrom);
  if (served || shown) {
    return <>Shown {shown ?? "—"}{served ? ` · live from ${served}` : ""}{e.source ? ` · ${e.source}` : ""}</>;
  }
  return <>Recorded {etTime(e.recordedAt) ?? "—"} · no deployment stamp on this entry</>;
}

function EntryCard({ e }: { e: Entry }) {
  const j = joint(e);
  return (
    <li className="rounded-lg p-3 flex flex-col gap-2" style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-border)" }} data-entry={e.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[13.5px] font-semibold" style={{ color: "var(--vault-text)" }}>
          {e.label}{e.tier !== "untiered" ? ` · ${e.tierLabel}` : ""}{j ? <span className="font-normal" style={{ color: "var(--vault-text-mute)" }}> · joint {j}</span> : null}
        </span>
        <Status s={e.status} />
      </div>
      <ul className="m-0 p-0 list-none flex flex-col gap-1">
        {e.legs.map((l: Entry["legs"][number]) => (
          <li key={`${l.sport}-${l.eventId}`} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
            <span><span style={{ color: "var(--vault-text)" }}>{l.selection ?? "—"}</span> · {l.eventLabel ?? l.eventId}{l.probability != null ? ` · ${(l.probability * 100).toFixed(1)}%` : ""}</span>
            <span>{l.final ? `${l.final} · ` : l.result === "PENDING" ? "No official final yet · " : ""}<Status s={l.result} /></span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>
        <Evidence e={e} />{e.firstStartUtc ? ` · first game ${etTime(e.firstStartUtc)}` : ""}
      </p>
    </li>
  );
}

export default function ModelSuggestionsRecord({ view }: { view: View }) {
  const days = [...new Set(view.entries.map((e) => e.productDay))].sort().reverse();
  const listed = days.slice(0, DAYS_LISTED);
  const th = "text-right font-medium py-1.5 px-1.5";
  return (
    <section id="model-suggestions" aria-labelledby="model-suggestions-h" className="mb-8 rounded-xl p-4 flex flex-col gap-3" style={{ border: "1px solid var(--vault-border-strong)", scrollMarginTop: 80 }}>
      <div className="flex flex-col gap-1">
        <h2 id="model-suggestions-h" className="m-0 font-display text-[20px]" style={{ color: "var(--vault-text)" }}>Model suggestions record</h2>
        <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)", maxWidth: 720 }}>
          Paper suggestions, no price, accuracy not yet established at this sample size. Every card and pick the site
          suggested is recorded as it was shown and graded against the official final, in its own record — never mixed
          with the priced products or sportsbook settlement. Pending and void are never losses.
        </p>
      </div>
      {view.totals.recorded === 0 ? (
        <p className="m-0 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No suggestion has been recorded yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 520 }}>
              <caption className="sr-only">Model suggestions by policy and tier</caption>
              <thead>
                <tr style={{ color: "var(--vault-text-mute)" }}>
                  <th scope="col" className="text-left font-medium py-1.5 pr-2">Suggestion</th>
                  <th scope="col" className={th}>Recorded</th><th scope="col" className={th}>Graded</th>
                  <th scope="col" className={th}>Won</th><th scope="col" className={th}>Lost</th>
                  <th scope="col" className={th}>Void</th><th scope="col" className={th}>Pending</th>
                </tr>
              </thead>
              <tbody>
                {view.byGroup.map((g) => (
                  <tr key={`${g.policy}-${g.tier}`} style={{ borderTop: "1px solid var(--vault-border)", color: "var(--vault-text)" }} data-group={`${g.policy}|${g.tier}`}>
                    <th scope="row" className="text-left font-normal py-1.5 pr-2">{g.label}{g.tier !== "untiered" ? ` · ${g.tierLabel}` : ""}{g.rateShown ? <span style={{ color: "var(--vault-text-mute)" }}> · {Math.round((g.won / g.decided) * 1000) / 10}% of {g.decided} decided</span> : null}</th>
                    <td className="text-right py-1.5 px-1.5">{g.recorded}</td><td className="text-right py-1.5 px-1.5">{g.graded}</td>
                    <td className="text-right py-1.5 px-1.5">{g.won}</td><td className="text-right py-1.5 px-1.5">{g.lost}</td>
                    <td className="text-right py-1.5 px-1.5">{g.void}</td><td className="text-right py-1.5 px-1.5">{g.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }} data-as-of>
            As of this page&apos;s last update: newest suggestion {etTime(view.asOf.recordedAt) ?? "—"}; newest grade {view.asOf.gradedAt ? etTime(view.asOf.gradedAt) : "none yet — the first grades land with the nightly settle"}.
          </p>
          <p className="m-0 text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
            Counts only: no hit rate is shown for a suggestion type until it has {view.minDecidedForRate} decided (won or lost) suggestions.
            {view.byGroup.some((g) => g.rateShown) ? "" : " None has reached that yet."}
          </p>
          <div className="flex flex-col gap-2">
            {listed.map((d, i) => {
              const es = view.entries.filter((e) => e.productDay === d);
              return (
                <details key={d} open={i === 0} className="rounded-lg" style={{ border: "1px solid var(--vault-border)" }} data-suggestion-day={d}>
                  <summary className="cursor-pointer px-3 py-2.5 text-[13px] font-medium" style={{ color: "var(--vault-text)", minHeight: 44, display: "flex", alignItems: "center" }}>
                    <span aria-hidden>▸&nbsp;</span>{etDayLabel(d)} · {es.length} {es.length === 1 ? "suggestion" : "suggestions"}
                  </summary>
                  <ul className="m-0 p-3 pt-0 list-none grid grid-cols-1 lg:grid-cols-2 gap-2">
                    {es.map((e) => <EntryCard key={e.id} e={e} />)}
                  </ul>
                </details>
              );
            })}
            {days.length > listed.length ? (
              <p className="m-0 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
                The newest {listed.length} of {days.length} days are listed here; every day is in the counts above.
              </p>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * BankBuilderResults — the Bank Builder settled-step block on the Results page. Shows each lane step
 * that officially settled (won / lost / void), leg by leg, with the official source. Transparency
 * surface: losses are shown here even though the public Bank Builder page hides stopped lanes.
 */
import Link from "next/link";
import type { BankBuilderResultStep } from "@/lib/bank-builder-results";
import MoneyPath from "@/components/ui/money-path";

const RESULT_COLOR: Record<string, string> = {
  won: "var(--vault-success)", win: "var(--vault-success)",
  lost: "var(--gtp-bank-heat)", loss: "var(--gtp-bank-heat)",
  void: "var(--vault-text-faint)", pending: "var(--vault-text-faint)",
};
const american = (s: string) => s;
const outcomeNote = (o: string) =>
  o === "advanced" ? "Lane advanced — riding toward the next rung."
    : o === "stopped" ? "Lane stopped — a fresh $100 path starts on the next qualified card."
    : "Lane active.";

export default function BankBuilderResults({ steps }: { steps: BankBuilderResultStep[] }) {
  if (!steps.length) return null;
  return (
    <section id="bank-builder-results" className="mt-8" style={{ scrollMarginTop: 80 }}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>Bank Builder — settled steps</h2>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)" }}>official settlement · paper-only</span>
      </div>
      <p className="mb-2 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
        Each lane step graded from the official box score / 90-minute regulation result. Every step here moves Mr. Dub&rsquo;s paper bankroll and daily P/L.
      </p>
      <Link href="/mr-dub" className="mb-3 inline-flex font-mono uppercase tracking-[0.1em] text-[10.5px]" style={{ color: "var(--vault-gold-bright)" }}>
        View in Mr. Dub ledger — bankroll, daily P/L &amp; exposure impact →
      </Link>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {steps.map((s) => {
          const color = RESULT_COLOR[s.result] ?? "var(--vault-text-faint)";
          return (
            <div key={`${s.laneId}-${s.step}`} className="rounded-[12px] px-4 py-3.5" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{s.laneLabel} · Step {s.step}</span>
                <span className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.1em]" style={{ background: "var(--vault-wash)", color, fontSize: 10, fontWeight: 700 }}>{s.result}</span>
              </div>
              {s.stake != null && (
                <div className="mt-2"><MoneyPath stake={s.stake} ret={s.payout} kind={s.result === "won" ? "settled" : "lost"} step={s.step} /></div>
              )}
              <div className="mt-2 flex flex-col gap-1.5">
                {s.legs.map((l, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 border-t pt-1.5" style={{ borderColor: "var(--vault-rule)" }}>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}>{l.label}</span>
                      {l.official ? <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{l.official}</span> : null}
                    </div>
                    <span className="shrink-0 font-mono uppercase" style={{ color: RESULT_COLOR[l.result] ?? "var(--vault-text-faint)", fontSize: 10, fontWeight: 700 }}>{american(l.result)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{outcomeNote(s.laneOutcome)} · source: {[...new Set(s.legs.map((l) => l.source).filter(Boolean))].join(" · ") || "official"}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * BankBuilderSkippedCard — the PREMIUM "model skipped" state for Bank Builder: a deliberate product
 * decision, not an error. Explains WHY there's no lane today (the dual ladder is between runs / no safe
 * two-leg card cleared the rung target), shows the model's strongest single-leg alternatives on the slate,
 * the next refresh, and a CTA to the knockout board. Pure presentation — real board picks only.
 */
import Link from "next/link";
import FlagBadge from "@/components/flag-badge";
import type { StrongestPick } from "@/lib/world-cup/structured-moonshot";

const odds = (o: number) => (o > 0 ? `+${o}` : `${o}`);

export default function BankBuilderSkippedCard({
  alternatives = [],
  variant = "full",
}: {
  alternatives?: StrongestPick[];
  variant?: "full" | "compact";
}) {
  return (
    <div
      className="rounded-[14px] px-5 py-4 flex flex-col gap-3"
      style={{ background: "rgba(26,16,11,0.5)", border: "1px solid var(--vault-gold)", borderLeft: "3px solid var(--vault-gold-bright)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: variant === "full" ? 18 : 15, fontWeight: 800 }}>
          No qualified Bank Builder today
        </span>
        <span className="rounded-full px-2.5 py-0.5 font-mono uppercase tracking-[0.12em]" style={{ fontSize: 8.5, color: "var(--vault-gold-bright)", background: "rgba(217,164,65,0.12)", border: "1px solid color-mix(in srgb, var(--vault-gold-bright) 40%, transparent)" }}>
          model discipline
        </span>
      </div>

      <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
        The dual ladder is <span style={{ color: "var(--vault-text)" }}>between runs</span>: both lanes reached a terminal state after their last settled results, and a fresh ladder starts on operator approval — the model never auto-restarts a ladder into a thin slate. Today&rsquo;s knockout card also offered no safe two-leg team-market combo that reached a rung target, and low-value player-prop cards were rejected on purpose. <span style={{ color: "var(--vault-text)" }}>Skipping is the pick.</span> The completed $100→$10K proof ladder is unchanged.
      </p>

      {alternatives.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>Meanwhile — the model&rsquo;s strongest single legs today</span>
          <div className="flex flex-col gap-1">
            {alternatives.map((a) => (
              <div key={a.gameSlug + a.selection} className="flex items-center justify-between gap-2 rounded-[7px] px-2.5 py-1.5" style={{ background: "rgba(12,8,6,0.45)", border: "1px solid var(--vault-rule)" }}>
                <span className="flex items-center gap-1.5 min-w-0">
                  {a.homeCode ? <FlagBadge code={a.homeCode} size="sm" /> : null}
                  <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 11.5, fontWeight: 600 }}>{a.selection}</span>
                  <span className="truncate font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{a.matchup}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0 font-mono" style={{ fontSize: 10.5 }}>
                  <span style={{ color: "var(--vault-text-mute)" }}>model {Math.round((a.modelProbability ?? 0) * 100)}%</span>
                  <span className="tabular" style={{ color: "var(--vault-text)" }}>{odds(a.americanOdds)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>Next refresh · next slate&rsquo;s odds</span>
        <span className="flex items-center gap-3">
          <Link href="/world-cup/round-of-32" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10.5 }}>Knockout board →</Link>
          <Link href="/bank-builder" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10.5 }}>Track record →</Link>
        </span>
      </div>
    </div>
  );
}

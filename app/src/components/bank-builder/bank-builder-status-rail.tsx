/**
 * BankBuilderStatusRail — the COMPACT Bank Builder module for Today/Home. Replaces the tall
 * settled-run card: one scannable row showing the run timeline (Run #1 completed · Run #2 closed ·
 * Run #3 evaluating-or-active) plus the V2 survival-gate status. Full detail lives on /bank-builder.
 * Public artifacts only.
 */
import Link from "next/link";
import type { DualBankBuilder } from "@/lib/data-dual-bank-builder";
import type { V2Evaluation } from "@/lib/data-bank-builder-v2";

function RunChip({
  tag, title, sub, tone,
}: { tag: string; title: string; sub: string; tone: "gold" | "closed" | "heat" | "live" }) {
  const accent =
    tone === "gold" ? "var(--vault-gold-bright)"
    : tone === "live" ? "var(--vault-success)"
    : tone === "heat" ? "var(--gtp-bank-heat)"
    : "var(--vault-text-faint)";
  const bg =
    tone === "gold" ? "color-mix(in srgb, var(--vault-gold) 8%, transparent)"
    : tone === "live" ? "color-mix(in srgb, var(--gtp-success-on-dark) 10%, transparent)"
    : tone === "heat" ? "var(--gtp-bank-heat-dim)"
    : "color-mix(in srgb, var(--vault-wash-base) 3%, transparent)";
  return (
    <div className="relative flex-1 min-w-[150px] rounded-[10px] px-3.5 py-3" style={{ background: bg, border: "1px solid var(--vault-rule)" }}>
      <span className="font-mono uppercase tracking-[0.12em]" style={{ color: accent, fontSize: 9 }}>{tag}</span>
      <div className="mt-1 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
      <div className="mt-0.5 font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>{sub}</div>
    </div>
  );
}

export default function BankBuilderStatusRail({
  run1Bankroll, run1Record, dual, v2, activeLaunched, activeSettled, activeLadderStep, lanesWon, lanesTotal,
}: {
  run1Bankroll?: string;
  run1Record?: string;
  dual?: DualBankBuilder | null;
  v2?: V2Evaluation | null;
  activeLaunched?: boolean;
  activeSettled?: boolean;
  activeLadderStep?: number;
  lanesWon?: number;
  lanesTotal?: number;
}) {
  const run2Closed = !!dual && (dual.status === "settled" || dual.status === "closed");
  const run3Active = !!dual && dual.status === "pending" && (dual as { runNumber?: number }).runNumber === 3;
  const launched = activeLaunched || v2?.decision === "launch" || run3Active;
  const isLadder = (activeLadderStep ?? 0) >= 2;
  const topCand = v2?.strongestCandidates?.[0];
  const wonN = lanesWon ?? 0;
  const totalN = lanesTotal ?? 2;

  return (
    <section
      className="gtp-fade-up relative overflow-hidden rounded-2xl px-5 py-5 sm:px-6"
      aria-label="Bank Builder status"
      style={{
        border: "1px solid var(--lava-border-strong)",
        background: "radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--vault-lava-red) 10%, transparent) 0%, transparent 55%)," +
          "linear-gradient(135deg, color-mix(in srgb, var(--vault-scrim-pine) 95%, transparent) 0%, var(--vault-bg) 72%)",
      }}
    >
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 10 }}>
          Bank Builder · paper ladder
        </span>
        <span className="flex items-center gap-1.5">
          <Link href="/moonshot" className="vault-press rounded-full px-3 py-1 font-mono uppercase tracking-[0.12em]" style={{ border: "1px solid color-mix(in srgb, var(--vault-moonshot) 45%, transparent)", color: "var(--vault-moonshot-bright)", fontSize: 10, fontWeight: 700, textDecoration: "none" }}>
            🌙 Moonshot →
          </Link>
          <Link href="/bank-builder" className="vault-press rounded-full px-3 py-1 font-mono uppercase tracking-[0.12em]" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)", fontSize: 10, fontWeight: 700, textDecoration: "none" }}>
            Open Bank Builder →
          </Link>
        </span>
      </div>

      <div className="relative mt-3 flex flex-col sm:flex-row gap-2.5">
        <RunChip tag="Completed ladder" title={run1Bankroll ? `$100 → ${run1Bankroll}` : "Completed $100 → $10K"} sub={`${run1Record ?? "crown reached"}`} tone="gold" />
        <RunChip tag="Closed test ladder" title={run2Closed ? `${dual?.lanesSurvived ?? 0}/${dual?.lanes?.length ?? 2} advanced` : "closed"} sub="Step 1 · both lanes lost" tone="closed" />
        <RunChip
          tag={isLadder ? `Active dual ladder · Step ${activeLadderStep}` : activeSettled ? "Active dual ladder · settled" : launched ? "Active dual ladder" : "Dual ladder · evaluating"}
          title={isLadder ? `Step ${activeLadderStep} live` : activeSettled ? `${wonN}/${totalN} lanes won` : launched ? "Two lanes live" : "Evaluating"}
          sub={isLadder ? `${wonN} of ${totalN} lanes advanced` : activeSettled ? "official sources · advanced" : launched ? "two paper lanes active" : "no qualifying launch yet"}
          tone={isLadder ? "live" : activeSettled ? "live" : launched ? "live" : "heat"}
        />
      </div>

      {!launched && v2 ? (
        <p className="relative mt-3 text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)", maxWidth: 720 }}>
          <span style={{ color: "var(--gtp-bank-heat)" }}>Bank Builder V2</span> is screening today&apos;s legs against a strict survival gate.
          {" "}{v2.counts.eligible} cleared the bar
          {topCand ? <> — strongest is <span style={{ color: "var(--vault-text)" }}>{topCand.pick}</span></> : null}, but
          {" "}{v2.blockers[0] ?? "the slate can't form two independent lanes"} — so no new run launches. The closed test ladder's misses are why the bar is this strict.
        </p>
      ) : null}
    </section>
  );
}

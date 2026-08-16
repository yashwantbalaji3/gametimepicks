/**
 * NextLadderPreview — the intended NEXT Bank Builder methodology (the 7-step lower-risk, profit-locking
 * ladder) shown as a PROMINENT but unmistakably-NOT-LIVE preview: a full vertical 7-step ladder in
 * dashed/muted styling with "Preview · not live" + "Settlement engine not yet activated" banners. Every
 * figure is read from the pure `bankBuilderV2StepPolicy` spec (no fabrication); this section places no
 * card, moves no money, settles nothing. Going live is gated by Plan 0007 (settlement + accounting +
 * generation + shadow-ledger + owner-approved flip via BANK_BUILDER_LADDER_VERSION). Pure/presentational.
 */
import Link from "next/link";
import { bankBuilderV2StepPolicy } from "@/lib/methodology/ladder-policy";
import { isSevenStepLive } from "@/lib/bank-builder/ladder-version";

const STEPS = [1, 2, 3, 4, 5, 6, 7] as const;
const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function PreviewChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em]"
      style={{ color: "var(--vault-text-faint)", background: "rgba(255,255,255,0.04)", border: "1px dashed var(--vault-border)" }}>{label}</span>
  );
}

export default function NextLadderPreview() {
  const live = isSevenStepLive(); // false at v1 — this section is ALWAYS a preview until the flip
  const steps = STEPS.map((s) => bankBuilderV2StepPolicy(s));
  const finalTarget = steps[steps.length - 1]?.target ?? 0;
  const totalLocked = steps[steps.length - 1]?.cumulativeLocked ?? 0;
  const topDown = [...steps].sort((a, b) => b.step - a.step); // crown at top, base at bottom

  return (
    <section
      className="mt-5 overflow-hidden rounded-2xl px-5 py-5"
      style={{ border: "1px dashed var(--vault-border)", background: "linear-gradient(135deg, rgba(217,164,65,0.05), rgba(11, 18, 14,0.20))" }}
      aria-label="Next Ladder System — the 7-step lower-risk ladder (preview, not live)"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)" }}>Next Ladder System</span>
        <PreviewChip label={live ? "Live" : "Preview · not live"} />
      </div>
      <h3 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(17px, 3.6vw, 22px)", fontWeight: 800 }}>
        The 7-step lower-risk ladder
      </h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)", maxWidth: 640 }}>
        Same $100 → $10K climb, but it <span style={{ color: "var(--vault-text)" }}>banks a share of every win from Step&nbsp;3 on</span>
        {" "}and takes safer, shorter cards up the ladder — so a late loss no longer surrenders the whole climb.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <PreviewChip label="Settlement engine not yet activated" />
        <PreviewChip label="Pending Plan 0007 reconciliation" />
      </div>

      {/* Full vertical 7-step preview — dashed/muted so it can never read as the live ladder. */}
      <div className="relative mt-4" style={{ opacity: 0.9 }}>
        <span className="absolute" style={{ left: 15, top: 10, bottom: 10, width: 2, borderRadius: 2, background: "repeating-linear-gradient(180deg, var(--vault-border) 0 4px, transparent 4px 9px)" }} aria-hidden />
        {/* crown */}
        <div className="relative flex items-center gap-3 pb-3">
          <span className="relative z-[1] flex shrink-0 items-center justify-center rounded-full" style={{ width: 30, height: 30, background: "rgba(217,164,65,0.10)", border: "1px dashed var(--vault-gold-bright)" }} aria-hidden>🏆</span>
          <span className="font-display tabular font-bold" style={{ color: "var(--vault-text-mute)", fontSize: 14 }}>
            {money0(finalTarget)} <span className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)" }}>target · {money0(totalLocked)} banked along the way</span>
          </span>
        </div>
        {topDown.map((p) => {
          const locks = p.lock > 0;
          return (
            <div key={p.step} className="relative flex gap-3 pb-2.5 last:pb-0">
              <span className="relative z-[1] mt-0.5 flex shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold" style={{ width: 26, height: 26, color: "var(--vault-text-faint)", background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)" }} aria-hidden>{p.step}</span>
              <div className="min-w-0 flex-1 rounded-[10px] px-3 py-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display tabular font-bold leading-none" style={{ color: "var(--vault-text-mute)", fontSize: 13.5 }}>{money0(p.target)}</span>
                  <span className="font-mono text-[9px]" style={{ color: locks ? "var(--vault-success)" : "var(--vault-text-faint)" }}>{locks ? `🔒 bank ${money0(p.lock)}` : "full roll"}</span>
                </div>
                <span className="mt-0.5 block font-mono text-[8.5px]" style={{ color: "var(--vault-text-faint)" }}>
                  Step {p.step} · from {money0(p.roll)} · {p.maxLegs} legs max
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 font-mono text-[10.5px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
        Not settlement-implemented and not on the live product. <span style={{ color: "var(--vault-text-mute)" }}>Live product remains 5-step</span>
        {" "}until settlement, accounting, and generation are migrated, a shadow-ledger reconciles to the penny, and the owner approves the flip.
      </p>
      <Link href="/methodology" className="mt-2 inline-flex font-mono text-[10.5px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold-bright)" }}>
        See the full 7-step methodology →
      </Link>
    </section>
  );
}

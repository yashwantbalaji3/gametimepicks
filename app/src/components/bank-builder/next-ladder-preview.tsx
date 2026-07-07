/**
 * NextLadderPreview — a clearly-labelled PREVIEW of the intended next Bank Builder methodology: the 7-step
 * lower-risk, profit-locking ladder. It is deliberately styled as a FUTURE artifact (dashed border, muted
 * palette, a "PREVIEW · NOT LIVE" badge) so it can NEVER be confused with the live 5-step climb rendered
 * above it. Every figure is read from the pure `bankBuilderV2StepPolicy` spec (no fabrication); this strip
 * places no card, moves no money, and does not settle. The migration to live is gated by Plan 0007
 * (settlement + accounting + shadow-ledger + tests + an owner-approved flip) — until then this stays a
 * preview only. Pure/presentational server component.
 */
import Link from "next/link";
import { bankBuilderV2StepPolicy } from "@/lib/methodology/ladder-policy";

const STEPS = [1, 2, 3, 4, 5, 6, 7] as const;
const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export default function NextLadderPreview() {
  const steps = STEPS.map((s) => bankBuilderV2StepPolicy(s));
  const finalTarget = steps[steps.length - 1]?.target ?? 0;
  const totalLocked = steps[steps.length - 1]?.cumulativeLocked ?? 0;

  return (
    <section
      className="mt-5 overflow-hidden rounded-2xl px-5 py-5"
      style={{
        border: "1px dashed var(--vault-border)",
        background: "linear-gradient(135deg, rgba(217,164,65,0.05), rgba(26,16,11,0.20))",
      }}
      aria-label="Coming next: the 7-step lower-risk ladder (preview, not live)"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em]"
          style={{ color: "var(--vault-text-faint)", background: "rgba(255,255,255,0.04)", border: "1px dashed var(--vault-border)" }}
        >
          Preview · not live
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)" }}>
          Being built safely · Plan 0007
        </span>
      </div>

      <h3 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(16px, 3.4vw, 20px)", fontWeight: 800 }}>
        Coming next — the 7-step lower-risk ladder
      </h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)", maxWidth: 620 }}>
        The intended next methodology keeps the $100 → $10K climb but <span style={{ color: "var(--vault-text)" }}>banks a share
        of every win from Step&nbsp;3 on</span> and takes safer, shorter cards up the ladder — so a late loss no longer
        surrenders the whole climb. It is a <span style={{ color: "var(--vault-text)" }}>preview only</span>: the live ladder
        today is the 5-step climb above.
      </p>

      {/* Muted, non-interactive 7-node preview rail — visually a blueprint, not a live ladder. */}
      <div className="mt-3 -mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex items-stretch gap-1.5" role="img" aria-label={`7-step preview: climbs to ${money0(finalTarget)} while banking ${money0(totalLocked)} along the way`}>
          {steps.map((p, i) => {
            const locks = p.lock > 0;
            return (
              <div key={p.step} className="flex items-center gap-1.5">
                <div
                  className="flex shrink-0 flex-col items-center gap-0.5 rounded-[10px] px-2 py-2"
                  style={{ minWidth: 62, minHeight: 60, background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)" }}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-bold" style={{ color: "var(--vault-text-faint)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-rule)" }} aria-hidden>{p.step}</span>
                  <span className="font-display tabular font-bold leading-none" style={{ color: "var(--vault-text-mute)", fontSize: 11.5 }}>{money0(p.target)}</span>
                  <span className="font-mono leading-none" style={{ color: locks ? "var(--vault-success)" : "var(--vault-text-faint)", fontSize: 8 }}>
                    {locks ? `🔒 ${money0(p.lock)}` : "roll"}
                  </span>
                </div>
                {i < steps.length - 1 ? <span aria-hidden className="h-px w-2 shrink-0" style={{ background: "var(--vault-rule)" }} /> : null}
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 font-mono text-[10.5px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
        Not settlement-implemented and not on the live product. It goes live only after the settlement engine,
        accounting, and a shadow-ledger reconcile to the penny and the owner approves the flip (Plan 0007).
      </p>
      <Link href="/methodology" className="mt-2 inline-flex font-mono text-[10.5px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold-bright)" }}>
        See the full 7-step preview on Methodology →
      </Link>
    </section>
  );
}

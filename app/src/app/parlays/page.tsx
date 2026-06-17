/**
 * /parlays — the methodology engine made visible. Suggested parlays by sport + risk, game-specific
 * parlays, the eligible-leg marketplace, honest no-qualified states, and the operator-gated dual
 * Bank Builder preview. Server component: reads committed board data at build time via the engine
 * loader. Nothing here publishes a slate or launches Bank Builder.
 */
import Link from "next/link";
import { loadTodaySlate } from "@/lib/parlays/ui-loader";
import ParlaysExplorer from "@/components/parlays/parlays-explorer";
import BankBuilderPreviewPanel from "@/components/parlays/bank-builder-preview-panel";

export const metadata = {
  title: "Parlays · GameTime Picks",
  description: "Methodology-built suggested parlays by sport and risk level, game-specific parlays, and the eligible-leg marketplace. Educational — not betting advice.",
};

export default function ParlaysPage() {
  const slate = loadTodaySlate();
  const totalSuggested = slate.allSuggested.length;
  const sportsWithLegs = slate.sports.filter((s) => s.eligibleCount > 0).length;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 sm:pt-8">
      <header className="mb-5">
        <h1 className="text-[22px] font-semibold sm:text-[26px]" style={{ color: "var(--vault-text)" }}>Parlays</h1>
        <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          Built by the methodology engine for{" "}
          <span style={{ color: "var(--vault-text)" }}>{slate.available ? slate.date : "—"}</span>. Each leg passed
          leakage validation, confidence + risk scoring, and eligibility gates. Educational — not betting advice.{" "}
          <Link href="/methodology" className="underline" style={{ color: "var(--vault-text)" }}>How it works</Link>.
        </p>
      </header>

      {!slate.available ? (
        <div className="rounded-xl p-5 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)" }}>
          <div className="text-[14px] font-medium" style={{ color: "var(--vault-text)" }}>No Qualified Slate</div>
          <div className="mt-1 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No board is available to project right now. Check back when today&apos;s slate is generated.</div>
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-3 gap-2">
            {[
              ["Sports live", String(sportsWithLegs)],
              ["Suggested", String(totalSuggested)],
              ["Same-game", String(slate.gameSpecific.length)],
            ].map(([label, val]) => (
              <div key={label} className="rounded-xl px-3 py-2.5 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
                <div className="text-[19px] font-semibold" style={{ color: "var(--vault-text)" }}>{val}</div>
                <div className="text-[11px]" style={{ color: "var(--vault-text-faint)" }}>{label}</div>
              </div>
            ))}
          </div>

          <ParlaysExplorer slate={slate} />

          <div className="mt-6">
            <BankBuilderPreviewPanel preview={slate.bankBuilderPreview} />
          </div>
        </>
      )}
    </main>
  );
}

/**
 * BankBuilderMeter — the futuristic $100 → $10K progress meter. A glowing stepped circuit of the
 * five ladder rungs, the three-run timeline (Run #1 crown · Run #2 closed · Run #3 evaluating/
 * active), and dual-lane progress when a run is live. Lava/casino aesthetic; the glow animation is
 * reduced-motion aware (gtp-heat-pulse is globally gated). Public data only.
 */
import type { DualBankBuilder } from "@/lib/data-dual-bank-builder";
import type { V2Evaluation } from "@/lib/data-bank-builder-v2";

const RUNGS = [
  { label: "$100", value: 100 },
  { label: "$200", value: 200 },
  { label: "$500", value: 500 },
  { label: "$1.4K", value: 1400 },
  { label: "$3.5K", value: 3500 },
  { label: "$10K", value: 10000 },
];

function Node({ label, reached, crown }: { label: string; reached: boolean; crown?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <span
        className={reached ? "gtp-heat-pulse" : ""}
        style={{
          width: crown ? 18 : 13, height: crown ? 18 : 13, borderRadius: "50%",
          background: reached ? (crown ? "var(--vault-gold-bright)" : "var(--gtp-bank-heat)") : "rgba(255,255,255,0.10)",
          boxShadow: reached ? `0 0 10px ${crown ? "rgba(240,199,94,0.6)" : "rgba(242,54,69,0.55)"}` : "none",
          border: `1px solid ${reached ? "transparent" : "var(--vault-rule)"}`,
        }}
        aria-hidden
      />
      <span className="font-mono tabular" style={{ color: reached ? "var(--vault-text)" : "var(--vault-text-faint)", fontSize: 9.5 }}>{label}</span>
    </div>
  );
}

function RunChip({ tag, title, tone }: { tag: string; title: string; tone: "gold" | "closed" | "heat" | "live" }) {
  const accent = tone === "gold" ? "var(--vault-gold-bright)" : tone === "live" ? "var(--vault-success)" : tone === "heat" ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)";
  const bg = tone === "gold" ? "rgba(212,175,55,0.08)" : tone === "live" ? "rgba(110,231,168,0.10)" : tone === "heat" ? "var(--gtp-bank-heat-dim)" : "rgba(255,255,255,0.03)";
  return (
    <div className="flex-1 min-w-[140px] rounded-[9px] px-3 py-2" style={{ background: bg, border: "1px solid var(--vault-rule)" }}>
      <div className="font-mono uppercase tracking-[0.1em]" style={{ color: accent, fontSize: 8.5 }}>{tag}</div>
      <div className="mt-0.5 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 700 }}>{title}</div>
    </div>
  );
}

export default function BankBuilderMeter({
  run1Bankroll, dual, v2,
}: { run1Bankroll?: number; dual?: DualBankBuilder | null; v2?: V2Evaluation | null }) {
  const run3Active = !!dual && dual.status === "pending" && (dual as { runNumber?: number }).runNumber === 3;
  const launched = v2?.decision === "launch" || run3Active;
  // Run #1 reached the crown, so every rung is lit (its historical path to $10K).
  const reachedValue = run1Bankroll ?? 10376.17;

  return (
    <section
      className="gtp-fade-up relative overflow-hidden rounded-2xl px-5 py-5 sm:px-6"
      aria-label="Bank Builder progress meter"
      style={{
        border: "1px solid var(--lava-border-strong)",
        background: "radial-gradient(120% 150% at 0% 0%, rgba(225,29,42,0.12) 0%, transparent 55%)," +
          "radial-gradient(120% 150% at 100% 0%, rgba(212,175,55,0.10) 0%, transparent 55%)," +
          "linear-gradient(135deg, rgba(26,20,14,0.96) 0%, var(--vault-bg) 72%)",
      }}
    >
      <div aria-hidden className="gtp-heat-pulse absolute -left-8 bottom-0 h-36 w-36 rounded-full" style={{ background: "var(--gtp-bank-lava)", filter: "blur(16px)", opacity: 0.35 }} />

      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 10 }}>Bank Builder · road to $10K</span>
        <span className="rounded-full px-2.5 py-1 font-mono text-[9.5px] font-bold uppercase tracking-[0.1em]"
          style={{ color: launched ? "var(--vault-success)" : "var(--gtp-bank-heat)", background: launched ? "rgba(110,231,168,0.14)" : "var(--gtp-bank-heat-dim)", border: "1px solid var(--vault-rule)" }}>
          {launched ? "Run #3 · active" : "Run #3 · V2 evaluating"}
        </span>
      </div>

      {/* Stepped circuit — the $100 → $10K path */}
      <div className="relative mt-4">
        <div className="absolute left-0 right-0 top-[6px] h-[3px] rounded-full" style={{ background: "linear-gradient(90deg, var(--gtp-bank-heat) 0%, var(--vault-gold-bright) 100%)", opacity: 0.5 }} aria-hidden />
        <div className="relative flex items-start justify-between">
          {RUNGS.map((r, i) => (
            <Node key={r.label} label={r.label} reached={reachedValue >= r.value} crown={i === RUNGS.length - 1} />
          ))}
        </div>
      </div>

      {/* Three-run timeline */}
      <div className="relative mt-4 flex flex-col sm:flex-row gap-2">
        <RunChip tag="Run #1 · completed" title="$100 → $10,376.17 · 5–0" tone="gold" />
        <RunChip tag="Run #2 · closed" title={`${dual?.lanesSurvived ?? 0}/${dual?.lanes?.length ?? 2} advanced · Step 1`} tone="closed" />
        <RunChip tag={launched ? "Run #3 · active" : "Run #3 · V2 gate"} title={launched ? "Two lanes live" : "Evaluating — no qualifying launch yet"} tone={launched ? "live" : "heat"} />
      </div>

      {/* Lane status when a run is live */}
      {launched && dual?.lanes?.length ? (
        <div className="relative mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {dual.lanes.map((lane) => (
            <div key={lane.lane} className="rounded-[9px] px-3 py-2" style={{ background: "rgba(12,8,6,0.5)", border: "1px solid var(--vault-rule)" }}>
              <div className="flex items-center justify-between">
                <span className="font-display font-bold" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{lane.name}</span>
                <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>${lane.stake} → ${Math.round(lane.projectedReturn)}</span>
              </div>
              <div className="mt-1 gtp-meter-track h-1.5">
                <div className="gtp-meter-fill gtp-meter-fill--lava" style={{ width: "20%" }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!launched && v2 ? (
        <p className="relative mt-3 text-[11.5px] leading-snug" style={{ color: "var(--vault-text-mute)", maxWidth: 720 }}>
          {v2.counts.eligible} legs cleared the V2 survival bar, but {v2.blockers[0] ?? "the slate can't form two independent lanes"}. No new run launches until the gate genuinely supports two strong lanes with a World Cup leg in each.
        </p>
      ) : null}
    </section>
  );
}

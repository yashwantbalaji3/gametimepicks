/**
 * UfcPredictionsV2 — the clean, user-friendly UFC prediction board driven by the Prediction Engine V1
 * (lib/ufc/ufc-prediction-engine). One card per fight: the GameTime Read up top, then Moneyline / Fight
 * type / Distance / Method reads with confidence + data-coverage, and a plain "Why". A collapsible
 * methodology panel explains the formulas. Server-renderable (no hooks). Original UI, no external images.
 *
 * Honest: moneyline is market-implied; fight-type/distance/method are GameTime V1 EXPERIMENTAL model reads
 * (validation in progress) — never framed as verified edges or recommended plays.
 */
import type { UfcPredictionRowV1, Confidence } from "@/lib/ufc/ufc-prediction-engine";

const mute = "var(--vault-text-mute)";
const faint = "var(--vault-text-faint)";
const gold = "var(--vault-gold-bright)";

const CONF: Record<Confidence, { c: string; label: string }> = {
  high: { c: "var(--gtp-success-on-dark,#7ee2a8)", label: "High" },
  medium: { c: gold, label: "Medium" },
  low: { c: "var(--vault-text-mute)", label: "Low" },
  no_read: { c: faint, label: "No read" },
};

function ConfDot({ c }: { c: Confidence }) {
  return <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: CONF[c].c, display: "inline-block" }} />;
}

function ReadCell({ label, value, conf, sub }: { label: string; value: string; conf?: Confidence; sub?: string }) {
  return (
    <div className="rounded-[8px] px-2.5 py-2" style={{ background: "rgba(0,0,0,0.18)" }}>
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: faint, fontSize: 8 }}>{label}</span>
        {conf ? <span className="inline-flex items-center gap-1" style={{ fontSize: 8, color: faint }}><ConfDot c={conf} />{CONF[conf].label}</span> : null}
      </div>
      <div style={{ color: "var(--vault-text)", fontSize: 12, fontWeight: 600, lineHeight: 1.2, marginTop: 2 }}>{value}</div>
      {sub ? <div className="font-mono" style={{ color: faint, fontSize: 9, marginTop: 1 }}>{sub}</div> : null}
    </div>
  );
}

function coverageChip(label: string) {
  const live = label === "Full data";
  return (
    <span className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em]" style={{ fontSize: 8, color: live ? "var(--gtp-success-on-dark,#7ee2a8)" : mute, background: live ? "rgba(46,160,102,0.14)" : "rgba(26,16,11,0.6)", border: `1px solid ${live ? "rgba(46,160,102,0.35)" : "var(--vault-rule)"}` }}>{label}</span>
  );
}

function pct(v: number | null): string {
  return typeof v === "number" ? `${Math.round(v * 100)}%` : "—";
}

function FightCard({ r }: { r: UfcPredictionRowV1 }) {
  return (
    <article className="rounded-[10px] px-3.5 py-3 flex flex-col gap-2" style={{ background: "rgba(26, 16, 11,0.5)", border: "1px solid var(--vault-border)" }}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 700 }}>{r.fighterA} <span style={{ color: faint, fontWeight: 400 }}>vs</span> {r.fighterB}</span>
        {coverageChip(r.dataCoverage.label)}
      </div>
      <div className="rounded-[8px] px-2.5 py-2" style={{ background: "rgba(242,54,69,0.08)", border: `1px solid var(--vault-rule)` }}>
        <span className="font-mono uppercase tracking-[0.12em]" style={{ color: gold, fontSize: 8 }}>GameTime read · {r.display.confidence} confidence</span>
        <div style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{r.display.gameTimeRead}</div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <ReadCell label="Moneyline" value={r.display.moneyline} conf={r.moneyline.confidence} sub={r.display.winProbability !== "—" ? r.display.winProbability : undefined} />
        <ReadCell label="Fight type" value={r.display.fightType} conf={r.fightType.confidence} />
        <ReadCell label="Distance" value={r.display.distance} conf={r.goesDistance.confidence} sub={r.goesDistance.probability != null ? `${pct(r.goesDistance.probability)} to decision` : undefined} />
        <ReadCell label="Method" value={r.display.method} conf={r.method.confidence} sub={r.method.probabilities ? `KO ${pct(r.method.probabilities.koTko)} · sub ${pct(r.method.probabilities.submission)} · dec ${pct(r.method.probabilities.decision)}` : undefined} />
        <ReadCell label="Round range" value={r.display.roundRange} conf={r.roundRange.confidence} />
        <ReadCell label="Coverage" value={r.display.coverage} />
      </div>
      <p style={{ color: mute, fontSize: 11, lineHeight: 1.4 }}>{r.display.why}</p>
    </article>
  );
}

function MethodologyPanel() {
  return (
    <details className="rounded-[10px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.5)", border: "1px solid var(--vault-border)" }}>
      <summary className="cursor-pointer list-none font-mono uppercase tracking-[0.12em]" style={{ color: gold, fontSize: 10 }}>How UFC predictions are calculated</summary>
      <div className="mt-2 flex flex-col gap-1.5" style={{ color: mute, fontSize: 11.5, lineHeight: 1.5 }}>
        <p><strong style={{ color: "var(--vault-text)" }}>Moneyline (market-implied).</strong> Real American odds → implied probability → de-vigged. <span className="font-mono" style={{ color: faint }}>no-vig = impliedA / (impliedA + impliedB)</span>. A ≥58% no-vig favorite is a market lean.</p>
        <p><strong style={{ color: "var(--vault-text)" }}>Fight type / distance / method (GameTime V1 model).</strong> When both fighters are in the stats DB, we build style scores — finish threat, striking, grappling, decision tendency — from real finish/record/rate history, then combine them into a distance probability and a normalized method mix.</p>
        <p><strong style={{ color: "var(--vault-text)" }}>Validation.</strong> The UFC model is still being graded (0 / 150 clean fights). Model-derived reads are <em>experimental</em> and paper-only — not a verified edge.</p>
      </div>
    </details>
  );
}

export default function UfcPredictionsV2({ rows, title, subtitle }: { rows: UfcPredictionRowV1[]; title?: string; subtitle?: string }) {
  const marketBacked = rows.filter((r) => r.moneyline.source === "market_implied").length;
  const modelReads = rows.filter((r) => r.fightType.source === "model_derived").length;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        {title ? <h3 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700 }}>{title}</h3> : null}
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.1em]" style={{ fontSize: 8.5, color: gold, background: "rgba(217,164,65,0.12)", border: "1px solid rgba(217,164,65,0.4)" }}>Experimental model reads · validation in progress</span>
          <span className="font-mono" style={{ color: faint, fontSize: 9.5 }}>{marketBacked} market moneylines · {modelReads} model reads</span>
        </div>
        {subtitle ? <p style={{ color: mute, fontSize: 12.5, lineHeight: 1.4, maxWidth: 640 }}>{subtitle}</p> : null}
      </div>
      <MethodologyPanel />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {rows.map((r) => <FightCard key={r.fightId} r={r} />)}
      </div>
    </section>
  );
}

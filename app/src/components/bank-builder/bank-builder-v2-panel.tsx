/**
 * BankBuilderV2Panel — the Bank Builder V2 survival-gate panel for /bank-builder. Explains why a
 * new run did or did not launch, and shows each candidate's survival score, tier, odds, hit rate,
 * and (when rejected) the reason. Reads the public V2 evaluation artifact only.
 */
import type { V2Evaluation, V2Leg } from "@/lib/data-bank-builder-v2";

function fmtOdds(o: number): string {
  return o > 0 ? `+${o}` : `${o}`;
}

function ScoreBar({ score, threshold }: { score: number; threshold: number }) {
  const pct = Math.max(2, Math.min(100, score));
  const color = score >= threshold ? "var(--vault-success)" : score >= threshold - 10 ? "var(--vault-gold-bright)" : "var(--vault-text-faint)";
  return (
    <div className="gtp-meter-track h-2 w-full" role="img" aria-label={`survival score ${Math.round(score)} of 100`}>
      <div className="gtp-meter-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function LegRow({ leg, threshold }: { leg: V2Leg; threshold: number }) {
  const eligible = leg.eligible;
  return (
    <div className="rounded-[10px] px-3 py-2.5" style={{ background: "rgba(12,8,6,0.5)", border: "1px solid var(--vault-rule)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 13.5, fontWeight: 700 }}>{leg.pick}</span>
        <span className="font-mono tabular shrink-0" style={{ color: eligible ? "var(--vault-success)" : "var(--vault-text-faint)", fontSize: 12, fontWeight: 700 }}>
          {Math.round(leg.survivalScore)}<span style={{ opacity: 0.6 }}>/100</span>
        </span>
      </div>
      <div className="mt-1.5"><ScoreBar score={leg.survivalScore} threshold={threshold} /></div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
        <span style={{ color: eligible ? "var(--vault-success)" : "var(--gtp-bank-heat)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{leg.tier.replace("_", " ")}</span>
        <span>{leg.marketLabel}</span>
        <span>{fmtOdds(leg.americanOdds)}</span>
        {leg.hitRate?.available ? <span>recent {leg.hitRate.hits}/{leg.hitRate.of}</span> : null}
        {typeof leg.modelProbability === "number" ? <span>model {Math.round(leg.modelProbability * 100)}%</span> : null}
      </div>
      {leg.rejectionReasons.length > 0 ? (
        <div className="mt-1 font-mono" style={{ color: "var(--gtp-bank-heat)", fontSize: 9.5 }}>
          ✗ {leg.rejectionReasons.join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

export default function BankBuilderV2Panel({ v2 }: { v2: V2Evaluation }) {
  const launched = v2.decision === "launch";
  const top = (v2.eligibleLegs.length ? v2.eligibleLegs : v2.strongestCandidates).slice(0, 6);
  return (
    <section
      className="gtp-fade-up relative overflow-hidden rounded-2xl px-5 py-5 sm:px-6"
      aria-label="Bank Builder V2 eligibility"
      style={{
        border: "1px solid var(--lava-border-strong)",
        background: "radial-gradient(120% 140% at 100% 0%, rgba(212,175,55,0.08) 0%, transparent 55%)," +
          "linear-gradient(135deg, rgba(26,20,14,0.95) 0%, var(--vault-bg) 72%)",
      }}
    >
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 10 }}>
          Bank Builder V2 · survival gate
        </span>
        <span className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{ color: launched ? "var(--vault-success)" : "var(--gtp-bank-heat)", background: launched ? "rgba(110,231,168,0.14)" : "var(--gtp-bank-heat-dim)", border: "1px solid var(--vault-rule)" }}>
          {launched ? "Run #3 · launched" : "Run #3 · evaluating"}
        </span>
      </div>

      <h2 className="relative mt-2 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(20px,4vw,28px)", fontWeight: 800, lineHeight: 1.05 }}>
        {launched ? "Two survival-gated lanes are live" : "No qualifying launch yet"}
      </h2>
      <p className="relative mt-1.5 text-[12.5px] leading-snug" style={{ color: "var(--vault-text-mute)", maxWidth: 720 }}>
        V2 scores every candidate on a <strong style={{ color: "var(--vault-text)" }}>survival score</strong> (0–100) — stricter than Parlay Lab.
        It rewards low-variance team markets and penalizes single-player variance, unconfirmed-lineup (DNP) risk, and longshots.
        A leg is Bank&nbsp;Builder eligible at <strong style={{ color: "var(--vault-text)" }}>{v2.eligibleThreshold}+</strong>. Today: {v2.counts.eligible} of {v2.counts.scored} legs eligible across {v2.counts.distinctEligibleGames} games.
      </p>

      {!launched && v2.blockers.length ? (
        <div className="relative mt-3 rounded-[8px] px-3.5 py-2.5" style={{ background: "rgba(225,29,42,0.06)", border: "1px solid var(--vault-rule)" }}>
          <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 9.5 }}>Why no launch</span>
          <ul className="mt-1 space-y-0.5 text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
            {v2.blockers.map((b, i) => <li key={i}>• {b}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="relative mt-3.5">
        <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          {v2.eligibleLegs.length ? "Eligible legs" : "Strongest candidates"} · survival score
        </span>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {top.map((leg, i) => <LegRow key={i} leg={leg} threshold={v2.eligibleThreshold} />)}
        </div>
      </div>
      <p className="relative mt-3 font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>
        Paper-only, educational. Survival score is an eligibility gate, not a promise. No fabrication — odds + official stats only.
      </p>
    </section>
  );
}

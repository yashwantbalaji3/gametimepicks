/**
 * UfcSimulationAnimation — a FreeSim-style octagon visualization for one odds-backed fight. Original CSS/SVG
 * only (no images, no logos): an octagon with a scan sweep, two fighter-initial corners, and probability
 * bars that animate from 50/50 to the DE-VIGGED market-implied split, then a locked prop row.
 *
 * Honest: this VISUALIZES a market-implied read (real moneyline → no-vig probabilities). It is NOT an
 * independent 10,000-run UFC model and never shows a "winner". CSS animation runs on mount; reduced-motion
 * rests to the final state. Server-renderable (no hooks).
 */
function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "—";
}
function american(v?: number | null): string {
  return typeof v === "number" && Number.isFinite(v) ? (v > 0 ? `+${v}` : `${v}`) : "";
}
const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function UfcSimulationAnimation({ fighterA, fighterB, probA, probB, oddsA, oddsB, fightType, distanceLean, methodLean, roundRange }: {
  fighterA: string; fighterB: string; probA: number; probB: number; oddsA?: number | null; oddsB?: number | null;
  fightType?: string; distanceLean?: string; methodLean?: string; roundRange?: string;
}) {
  const pa = Math.max(0, Math.min(1, probA));
  const pb = Math.max(0, Math.min(1, probB));
  return (
    <div className="relative overflow-hidden rounded-[12px] px-4 py-4" style={{ border: "1px solid var(--vault-border-strong)", background: "radial-gradient(120% 140% at 50% 0%, rgba(242,54,69,0.14) 0%, transparent 60%), rgba(18,12,10,0.96)" }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>Market-implied simulation</span>
        <span className="ufc-sim-pulse inline-flex items-center gap-1 font-mono uppercase tracking-[0.1em]" style={{ color: "var(--gtp-success-on-dark,#7ee2a8)", fontSize: 8.5 }}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: "var(--gtp-success-on-dark,#7ee2a8)", display: "inline-block" }} /> market pulse
        </span>
      </div>

      {/* Octagon scan */}
      <div className="relative mx-auto" style={{ maxWidth: 320 }}>
        <svg viewBox="0 0 300 130" role="img" aria-label={`${fighterA} vs ${fighterB} — market-implied read`} style={{ width: "100%", height: "auto" }}>
          <polygon points="86,10 214,10 274,65 214,120 86,120 26,65" fill="none" stroke="var(--vault-gold-bright)" strokeWidth="1.3" opacity="0.55" />
          <polygon points="104,30 196,30 236,65 196,100 104,100 64,65" fill="none" stroke="var(--vault-gold-bright)" strokeWidth="0.7" opacity="0.32" />
          <line className="ufc-sim-scan" x1="26" y1="65" x2="274" y2="65" stroke="var(--gtp-bank-heat,#f23645)" strokeWidth="1.4" opacity="0.7" />
          <text x="150" y="70" textAnchor="middle" className="font-display" style={{ fill: "var(--vault-text-faint)", fontSize: 10, letterSpacing: 2 }}>VS</text>
        </svg>
        <span className="absolute left-1 top-1 inline-flex items-center justify-center rounded-full" style={{ width: 30, height: 30, background: "rgba(242,54,69,0.18)", border: "1px solid var(--vault-rule)", color: "var(--gtp-bank-heat,#f23645)", fontSize: 11, fontWeight: 800 }} aria-hidden>{initials(fighterA)}</span>
        <span className="absolute right-1 top-1 inline-flex items-center justify-center rounded-full" style={{ width: 30, height: 30, background: "rgba(46,160,102,0.16)", border: "1px solid var(--vault-rule)", color: "var(--gtp-success-on-dark,#7ee2a8)", fontSize: 11, fontWeight: 800 }} aria-hidden>{initials(fighterB)}</span>
      </div>

      {/* Probability bars animate 50/50 → de-vigged */}
      <div className="mt-3 flex flex-col gap-2">
        {[{ n: fighterA, p: pa, o: oddsA, c: "var(--gtp-bank-heat,#f23645)" }, { n: fighterB, p: pb, o: oddsB, c: "var(--gtp-success-on-dark,#7ee2a8)" }].map((s, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between font-mono" style={{ fontSize: 10.5 }}>
              <span className="truncate" style={{ color: "var(--vault-text)" }}>{s.n} {american(s.o)}</span>
              <span style={{ color: "var(--vault-text-mute)" }}>{pct(s.p)}</span>
            </div>
            <div className="w-full overflow-hidden rounded-full" style={{ height: 9, background: "rgba(0,0,0,0.3)", border: "1px solid var(--vault-rule)" }}>
              <div className="ufc-sim-fill h-full" style={{ ["--target" as string]: pct(s.p), background: s.c }} />
            </div>
          </div>
        ))}
      </div>

      {/* Model reads — GameTime V1 (experimental) when fighter data allows; otherwise provider-needed. */}
      {fightType || distanceLean || methodLean || roundRange ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold-bright)", fontSize: 8.5 }}>V1 model read · experimental</span>
          {[fightType, distanceLean, methodLean, roundRange].filter(Boolean).map((m, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-mute)", background: "rgba(217,164,65,0.1)", border: "1px solid rgba(217,164,65,0.35)", fontSize: 8.5 }}>{m}</span>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Provider-needed</span>
          {["Method", "Round", "Distance"].map((m) => (
            <span key={m} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", background: "rgba(26,16,11,0.6)", border: "1px dashed var(--vault-rule)", fontSize: 8.5 }}>
              <span aria-hidden>🔒</span> {m}
            </span>
          ))}
        </div>
      )}

      <p className="mt-2 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9, lineHeight: 1.5 }}>
        Market + fighter-data simulation. Moneyline: market-implied. Distance / method: V1 model-derived when data allows. Not an independent 10,000-run UFC model. Validation in progress. Paper-only.
      </p>

      <style>{`
        .ufc-sim-fill { width: 50%; animation: ufcSimFill 1.5s cubic-bezier(.2,.7,.2,1) forwards; }
        @keyframes ufcSimFill { from { width: 50%; } to { width: var(--target); } }
        .ufc-sim-scan { animation: ufcSimScan 2.4s ease-in-out infinite; transform-origin: center; }
        @keyframes ufcSimScan { 0%,100% { transform: translateY(-42px); opacity: .25; } 50% { transform: translateY(42px); opacity: .8; } }
        .ufc-sim-pulse { animation: ufcSimPulse 1.8s ease-in-out infinite; }
        @keyframes ufcSimPulse { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .ufc-sim-fill { animation: none; width: var(--target); }
          .ufc-sim-scan, .ufc-sim-pulse { animation: none; }
        }
      `}</style>
    </div>
  );
}

/**
 * MoonshotLadderV2 — the PROMINENT 3-step Moonshot trajectory ladder for /moonshot (and a compact preview
 * for Home / Today). Renders straight from the pure `moonshotV2LadderPolicy` spec ($25 → $100 → $375 →
 * $1,500 with profit-locking), so it can never drift. Every figure (roll → target, lock, roll-forward,
 * cumulative locked, legs) is spec-derived — nothing fabricated, no money computed here.
 *
 * High-variance by design; a losing day costs only what was still rolling. `currentDay` marks the live
 * rung. CSS-only, reduced-motion-safe. Settles from official results only.
 */
import { moonshotV2LadderPolicy } from "@/lib/methodology/ladder-policy";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const DAYS = [1, 2, 3] as const;

export default function MoonshotLadderV2({ currentDay = 1, live = false, compact = false, className = "" }: { currentDay?: 1 | 2 | 3; live?: boolean; compact?: boolean; className?: string }) {
  const days = DAYS.map((d) => moonshotV2LadderPolicy(d));

  // Compact preview (Home / Today) — a slim always-visible 3-day strip.
  if (compact) {
    return (
      <div className={`moon-ladder-v2-compact rounded-xl px-3.5 py-3 ${className}`} style={{ border: "1px solid #6d5fd0", background: "rgba(139,123,240,0.06)" }} aria-label="Moonshot 3-step ladder preview">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <span className="font-mono uppercase tracking-[0.1em] text-[9.5px]" style={{ color: "#b9a8ff" }}>🚀 3-step ladder · $25 → $1,500</span>
          <span className="font-mono text-[8.5px] uppercase" style={{ color: "var(--gtp-bank-heat)" }}>⚠ high variance</span>
        </div>
        <div className="mt-2 flex items-center gap-1">
          {days.map((p, i) => (
            <div key={p.day} className="flex items-center gap-1 shrink-0">
              <span className="rounded px-1.5 py-1 font-mono text-[9px] tabular" style={{ border: `1px solid ${live && p.day === currentDay ? "#8b7bf0" : "var(--vault-rule)"}`, color: p.lock > 0 ? "var(--vault-success)" : "var(--vault-text-mute)", background: live && p.day === currentDay ? "rgba(139,123,240,0.12)" : "transparent" }}>
                D{p.day} ${p.target.toLocaleString("en-US")}{p.lock > 0 ? ` ·bank $${p.lock}` : ""}
              </span>
              {i < days.length - 1 ? <span aria-hidden style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>→</span> : null}
            </div>
          ))}
        </div>
        <p className="mt-1.5 font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>Win Day&nbsp;1 → the $25 seed banks back; Days 2-3 ride house money. No forced cards.</p>
      </div>
    );
  }

  return (
    <section
      className={`moon-ladder-v2 gtp-fade-up overflow-hidden rounded-2xl ${className}`}
      style={{ border: "1px solid #6d5fd0", background: "linear-gradient(160deg, rgba(139,123,240,0.10), rgba(11, 18, 14,0.35))" }}
      aria-label="Moonshot 3-step ladder"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <div>
          <div className="font-mono uppercase tracking-[0.14em] text-[10px]" style={{ color: "#b9a8ff" }}>🚀 The 3-step ladder</div>
          <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(19px, 3.2vw, 26px)", fontWeight: 700 }}>$25 → $1,500 in 3 days</h2>
        </div>
        <span className="rounded-full px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.08em]" style={{ border: "1px solid rgba(52, 211, 153, 0.45)", color: "var(--gtp-bank-heat)", background: "rgba(52, 211, 153, 0.08)" }}>
          ⚠ high variance
        </span>
      </div>

      {/* Ascending trajectory — each day sits higher than the last */}
      <div className="mt-3.5 grid grid-cols-1 gap-2 px-3 pb-1 sm:grid-cols-3 sm:px-4">
        {days.map((p, i) => {
          const isLive = live && p.day === currentDay;
          return (
            <div
              key={p.day}
              className="gtp-fade-up relative rounded-xl px-3.5 py-3"
              style={{
                animationDelay: `${i * 70}ms`,
                marginTop: `${(2 - i) * 6}px`, // day 1 lowest, day 3 highest — a climb
                border: isLive ? "1px solid #8b7bf0" : "1px solid var(--vault-rule)",
                background: isLive ? "rgba(139,123,240,0.14)" : "rgba(255,255,255,0.02)",
                boxShadow: isLive ? "0 0 16px rgba(139,123,240,0.35)" : "none",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono uppercase tracking-[0.08em] text-[9px]" style={{ color: isLive ? "#b9a8ff" : "var(--vault-text-faint)" }}>
                  Day {p.day}{isLive ? " · LIVE" : p.day === 1 ? "" : " · unlocks on a win"}
                </span>
                <span className="font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>{p.targetMultiple}×</span>
              </div>
              <div className="mt-1 font-display tabular font-bold" style={{ color: "var(--vault-text)", fontSize: "clamp(16px,3vw,20px)" }}>
                {usd(p.roll)} <span style={{ color: "var(--vault-text-faint)" }}>→</span> {usd(p.target)}
              </div>
              <div className="mt-1 font-mono text-[9.5px]" style={{ color: p.lock > 0 ? "var(--vault-success)" : "var(--vault-text-faint)" }}>
                {p.lock > 0 ? `bank ${usd(p.lock)} · roll ${usd(p.rollForward)}` : "completes — all realizes"}
              </div>
              <div className="mt-0.5 font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>{p.legRange[0]}–{p.legRange[1]} legs · team markets · no props</div>
            </div>
          );
        })}
      </div>

      <p className="mt-2.5 px-4 pb-4 text-[10.5px] leading-relaxed sm:px-5" style={{ color: "var(--vault-text-faint)" }}>
        <strong style={{ color: "var(--vault-text-mute)" }}>Why it can hit:</strong> structured team/game legs grouped by game, aligned with each game&rsquo;s score lean — win Day&nbsp;1 and the $25 seed is banked back immediately, so Days&nbsp;2–3 ride house money ($100 locked before the $1,500 swing).
        &nbsp;<strong style={{ color: "var(--vault-text-mute)" }}>Why it can fail:</strong> it&rsquo;s a longshot — one wrong leg ends the day. A losing day costs only what was still rolling; locked profit stays banked, and a day with no qualified card is a NO-PLAY, never forced. Settles from official results only.
      </p>
    </section>
  );
}

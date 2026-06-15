/**
 * DualBankBuilderTeaser — the "coming next" hype panel for the next Bank Builder
 * experience: TWO paper ladders running in parallel with completely different
 * legs each day. Pure presentation, server-renderable. NOT a live run — every
 * lane is in a clear "not started yet" state until the owner kicks it off.
 *
 * Visuals reuse the existing V1 lava system (gtp-heat-pulse glow, lava-gradient
 * meter, gtp-fade-up) so motion is already covered by the global
 * prefers-reduced-motion guard. No real-money copy; no fabricated progress.
 */

const GOAL = 10000;
const BASE = 100;

type Lane = {
  key: string;
  name: string;
  profile: string;
  accent: string;
  glow: string;
};

const LANES: Lane[] = [
  { key: "A", name: "Lane A", profile: "Lower-variance lane", accent: "var(--gtp-bank-heat)", glow: "rgba(242, 54, 69, 0.25)" },
  { key: "B", name: "Lane B", profile: "Higher-variance lane", accent: "var(--vault-gold)", glow: "rgba(212, 175, 55, 0.22)" },
];

function usd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

export default function DualBankBuilderTeaser() {
  return (
    <section
      className="gtp-fade-up relative mt-6 overflow-hidden rounded-2xl px-5 py-6 sm:px-7"
      aria-label="Coming next — Dual Bank Builder"
      style={{
        border: "1px solid var(--lava-border-strong)",
        background:
          "radial-gradient(130% 160% at 0% 100%, rgba(225, 29, 42,0.16) 0%, transparent 55%)," +
          "radial-gradient(130% 160% at 100% 0%, rgba(212, 175, 55,0.10) 0%, transparent 55%)," +
          "linear-gradient(135deg, rgba(26,20,14,0.96) 0%, var(--vault-bg) 72%)",
      }}
    >
      {/* twin lava orbs — exploding-container hint */}
      <div aria-hidden className="gtp-heat-pulse absolute -left-8 bottom-0 h-40 w-40 rounded-full" style={{ background: "var(--gtp-bank-lava)", filter: "blur(14px)", opacity: 0.4 }} />
      <div aria-hidden className="gtp-heat-pulse absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-10 rounded-full" style={{ background: "radial-gradient(circle, rgba(212,175,55,0.5), transparent 70%)", filter: "blur(10px)", opacity: 0.5 }} />

      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 10 }}>
          Coming next
        </span>
        <span className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-rule)" }}>
          Not started yet
        </span>
      </div>

      <h2 className="relative mt-2 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(24px,5vw,38px)", fontWeight: 800, lineHeight: 1.02 }}>
        Dual Bank Builder
      </h2>
      <p className="relative mt-1.5 text-[13.5px]" style={{ color: "var(--vault-text-mute)", maxWidth: 660 }}>
        Two paper ladders climbing the {usd(GOAL)} crown <span style={{ color: "var(--vault-text)" }}>at the same time</span> — completely different legs each day, separate risk profiles, separate records. Twice the climb, fully transparent. Paper-only, educational; the lanes stay idle until the next run is officially started.
      </p>

      <div className="relative mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {LANES.map((lane) => (
          <div
            key={lane.key}
            className="relative overflow-hidden rounded-[12px] px-4 py-4"
            style={{ border: `1px solid ${lane.glow}`, background: "rgba(12,8,6,0.55)" }}
          >
            <div aria-hidden className="gtp-heat-pulse absolute right-0 top-0 h-20 w-20 translate-x-6 -translate-y-6 rounded-full" style={{ background: `radial-gradient(circle, ${lane.glow}, transparent 70%)`, filter: "blur(8px)" }} />
            <div className="relative flex items-center justify-between gap-2">
              <span className="font-display font-bold tracking-tight" style={{ color: lane.accent, fontSize: 16 }}>{lane.name}</span>
              <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>Step 0 · idle</span>
            </div>
            <div className="relative mt-1 font-display tabular" style={{ color: "var(--vault-text)", fontSize: 22, fontWeight: 700 }}>
              {usd(BASE)} <span style={{ color: "var(--vault-text-faint)", fontWeight: 400 }}>→</span> {usd(GOAL)}
            </div>
            <div className="relative mt-0.5 font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
              {lane.profile}
            </div>
            {/* idle lava meter — 2% sliver, no fabricated progress */}
            <div className="relative mt-3 flex items-center gap-2">
              <span className="font-mono shrink-0 text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>{usd(BASE)}</span>
              <div className="gtp-meter-track h-2 flex-1" role="img" aria-label={`${lane.name} not started — ${usd(BASE)} of the ${usd(GOAL)} crown`}>
                <div className="gtp-meter-fill gtp-meter-fill--lava" style={{ width: "2%" }} />
                <div aria-hidden className="gtp-meter-shimmer" />
              </div>
              <span className="font-mono shrink-0 text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>{usd(GOAL)}</span>
            </div>
            <div className="relative mt-2.5 font-mono uppercase tracking-[0.1em]" style={{ color: lane.accent, fontSize: 9.5 }}>
              Awaiting kickoff
            </div>
          </div>
        ))}
      </div>

      <p className="relative mt-4 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>
        Each lane settles independently on official results — separate legs, separate timeline, separate crown run. No lane shares a card with the other on the same day.
      </p>
    </section>
  );
}

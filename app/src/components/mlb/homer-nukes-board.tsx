/**
 * HomerNukesBoard — the daily Homer Nukes 5-leg home-run PARLAY (one $20 paper bet, not five), or an
 * honest data-gated empty state. Hero (stake · combined odds · projected return · win probability ·
 * source) + the 5 legs + a confidence meter + a historical-performance slot. Server component; pure
 * presentational. Player portraits degrade to initials; nothing is fabricated.
 */
import Link from "next/link";
import PlayerAvatar from "@/components/ui/player-avatar";
import type { HomerNukesResult } from "@/lib/mlb/homer-nukes";

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const american = (a: number) => `${a > 0 ? "+" : ""}${a}`;
const pct1 = (p: number) => `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;

const CONF_COLOR = { low: "var(--vault-text-faint)", medium: "#e7b15a", high: "var(--vault-success)" } as const;

function HeroStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="min-w-0">
      <div className="font-display tabular truncate" style={{ color: accent ?? "var(--vault-text)", fontSize: 17, fontWeight: 800 }}>{value}</div>
      <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{label}</div>
    </div>
  );
}

function ConfidenceMeter({ level }: { level: "low" | "medium" | "high" }) {
  const idx = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className="rounded-full" style={{ width: 16, height: 5, background: n <= idx ? CONF_COLOR[level] : "rgba(255,255,255,0.08)" }} />
        ))}
      </span>
      <span className="font-mono uppercase tracking-[0.08em]" style={{ color: CONF_COLOR[level], fontSize: 9 }}>{level} confidence</span>
    </span>
  );
}

export default function HomerNukesBoard({ board }: { board: HomerNukesResult }) {
  if (!board.available || !board.parlay) {
    return (
      <div className="rounded-2xl px-5 py-10 text-center" style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)" }}>
        <div aria-hidden style={{ fontSize: 34 }}>💣⚾</div>
        <p className="mt-2 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700 }}>Today&rsquo;s Homer Nukes parlay isn&rsquo;t posted yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{board.note}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link href="/mlb" className="vault-press inline-flex rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>MLB board</Link>
          <Link href="/mr-dub" className="vault-press inline-flex rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ background: "var(--gtp-bank-lava)", color: "#1A0E06", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>Mr. Dub portfolio →</Link>
        </div>
      </div>
    );
  }

  const p = board.parlay;
  return (
    <div className="rounded-[14px] overflow-hidden flex flex-col" style={{ background: "rgba(12,8,6,0.5)", border: "1px solid var(--lava-border-strong)", borderLeft: "3px solid var(--gtp-bank-heat)" }}>
      {/* Hero strip */}
      <div className="px-4 py-3.5 flex flex-col gap-3" style={{ borderBottom: "1px solid var(--vault-rule)", background: "radial-gradient(120% 140% at 100% 0%, rgba(225,29,42,0.12) 0%, transparent 55%)" }}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-mono uppercase tracking-[0.18em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 9.5 }}>Daily 5-leg home-run parlay</span>
          <ConfidenceMeter level={board.confidence} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <HeroStat label="Stake" value={money(p.stake)} accent="var(--vault-gold-bright)" />
          <HeroStat label="Combined odds" value={american(p.combinedOdds)} accent="var(--gtp-bank-heat)" />
          <HeroStat label="Potential return" value={money(p.projectedReturn)} accent="var(--vault-success)" />
          <HeroStat label="Win probability" value={pct1(p.impliedProbability)} />
        </div>
        {p.providers.length ? (
          <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Source: {p.providers.join(" · ")}</span>
        ) : null}
      </div>

      {/* The 5 legs */}
      <ol className="flex flex-col list-none">
        {p.legs.map((l, i) => (
          <li key={l.id} className="px-4 py-2.5 flex items-center gap-3 min-w-0" style={{ borderTop: i ? "1px solid var(--vault-rule)" : "none" }}>
            <span className="font-display tabular shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 12, fontWeight: 800, width: 14 }}>{i + 1}</span>
            <PlayerAvatar name={l.player} photo={l.photoUrl} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block break-words font-display tracking-tight leading-tight" style={{ color: "var(--vault-text)", fontSize: 13.5, fontWeight: 700 }}>{l.player}</span>
              <span className="block font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>To hit a HR · {l.matchup}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-mono tabular" style={{ color: "var(--vault-text)", fontSize: 13 }}>{american(l.odds)}</span>
              <span className="block font-mono" style={{ color: "var(--gtp-bank-heat)", fontSize: 9 }}>{Math.round(l.modelProbability * 100)}% mkt</span>
            </span>
          </li>
        ))}
      </ol>

      {/* Combined footer */}
      <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap" style={{ borderTop: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.02)" }}>
        <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
          {money(p.stake)} <span style={{ color: "var(--vault-text-faint)" }}>→</span> <span style={{ color: "var(--vault-success)" }}>{money(p.projectedReturn)}</span> · {american(p.combinedOdds)}
        </span>
        <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>all 5 must homer · paper-only</span>
      </div>

      {/* Historical performance — only when real settled data exists, else honest awaiting state. */}
      <div className="px-4 py-2.5" style={{ borderTop: "1px solid var(--vault-rule)" }}>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Last 7 days · record · ROI · P/L · hit rate</span>
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--vault-text-faint)" }}>Awaiting settled history — fills in after the first parlay settles from official box scores.</p>
      </div>
    </div>
  );
}
